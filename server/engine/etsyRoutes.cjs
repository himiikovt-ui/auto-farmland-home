const fs = require("fs");
const { isDesignApproved } = require("./status.cjs");
const { renderTemplate } = require("../services/listingCompiler.cjs");

// Etsy Personal Access connection and diagnostics for the app owner's OWN
// production shop. Digital listing creation lives in the crop pipeline.
// Hard rules for this whole module:
//   * never fake success (Etsy response bodies are passed through on error)
//   * never create an ACTIVE listing from connection/setup routes
//   * tokens live in server/secrets/, never in data.json, never in responses

const ETSY_READINESS = {
  NOT_CONFIGURED: "not_configured",
  MISSING_CREDENTIALS: "missing_credentials",
  OAUTH_REQUIRED: "oauth_required",
  AUTH_FAILED: "auth_failed",
  MISSING_SCOPES: "missing_scopes",
  MISSING_SHOP_ID: "missing_shop_id",
  MISSING_SHIPPING_PROFILE: "missing_shipping_profile",
  MISSING_READINESS_PROFILE: "missing_readiness_profile",
  MISSING_TAXONOMY_ID: "missing_taxonomy_id",
  READY: "ready_for_draft_test",
};

const REQUIRED_SCOPES = ["shops_r", "listings_r", "listings_w"];

// Etsy responses come in three shapes depending on the endpoint:
// {results:[...]} envelopes, bare arrays, and SINGLE objects (notably
// getShopByOwnerUserId returns one Shop object). Normalize all of them —
// treating a single-object response as "no shops" was exactly the bug behind
// a false "missing shop id" after a successful OAuth.
function asShopArray(response) {
  if (!response) return [];
  if (Array.isArray(response.results)) return response.results;
  if (Array.isArray(response)) return response;
  if (response.shop_id != null) return [response];
  return [];
}

// Parse "ShopName" out of a public URL like https://www.etsy.com/shop/ShopName
// (any locale prefix, query strings, trailing slashes). Returns "" when the
// input is not an etsy.com shop URL — a URL is NEVER treated as a numeric id.
function parseShopNameFromUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/(^|\.)etsy\.com$/i.test(url.hostname)) return "";
    const match = url.pathname.match(/\/shop\/([A-Za-z0-9]+)/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

// Map the fine-grained readiness state onto the Etsy channel ladder shown on
// the Channels board.
function channelStatusFor(readinessStatus) {
  switch (readinessStatus) {
    case ETSY_READINESS.NOT_CONFIGURED:
    case ETSY_READINESS.MISSING_CREDENTIALS:
      return "personal_access_ready_for_oauth";
    case ETSY_READINESS.OAUTH_REQUIRED:
    case ETSY_READINESS.AUTH_FAILED:
      return "etsy_credentials_present";
    case ETSY_READINESS.READY:
      return "etsy_ready_for_draft_test";
    default:
      return "etsy_connected";
  }
}

function etsyErrorPayload(error) {
  return {
    message: error.message || "Etsy request failed.",
    httpStatus: error.status || null,
    body: error.payload || null,
  };
}

function registerEtsyRoutes(app, deps) {
  const {
    readData,
    writeData,
    makeId,
    nowIso,
    env,
    etsyClient,
    readEtsyAuth,
    saveEtsyAuth,
    clearEtsyAuth,
    getValidEtsyAuth,
    createPkceRequest,
    savePkce,
    readPkce,
    clearPkce,
  } = deps;

  const appOrigin = () => String(env.APP_ORIGIN || "http://localhost:5173").replace(/"/g, "");
  const isTestMode = () => String(env.ETSY_DEFAULT_TEST_MODE ?? "true").toLowerCase() !== "false";

  function etsySettings(data) {
    return (data.integrations && data.integrations.etsy) || {};
  }

  function credentialsMissing() {
    return [
      !env.ETSY_KEYSTRING && "ETSY_KEYSTRING",
      !env.ETSY_SHARED_SECRET && "ETSY_SHARED_SECRET",
      !env.ETSY_REDIRECT_URI && "ETSY_REDIRECT_URI",
    ].filter(Boolean);
  }

  // OAuth user id: prefer the value stored at token save, fall back to
  // parsing the access-token prefix (Etsy tokens are "{user_id}.{secret}").
  function oauthUserId(auth) {
    if (!auth) return "";
    return auth.userId || String(auth.accessToken || "").split(".")[0] || "";
  }

  // Scopes the stored token was requested with. Etsy's token response does
  // not echo scopes back, so this is the requested set recorded at save time
  // (older token files fall back to the configured scopes).
  function effectiveScopes(auth) {
    return String((auth && auth.scopes) || env.ETSY_SCOPES || etsyClient.scopes || "")
      .split(/\s+/)
      .filter(Boolean);
  }

  function missingScopes(auth) {
    const granted = effectiveScopes(auth);
    return REQUIRED_SCOPES.filter((scope) => !granted.includes(scope));
  }

  // Safe debug trail for shop resolution — endpoint, HTTP status, and a
  // truncated Etsy body. Never tokens.
  function setResolverDebug(data, entry) {
    data.integrations.etsy.resolverDebug = {
      at: nowIso(),
      endpoint: entry.endpoint || "",
      httpStatus: entry.httpStatus ?? null,
      note: entry.note || "",
      body: String(entry.body != null ? (typeof entry.body === "string" ? entry.body : JSON.stringify(entry.body)) : "").slice(0, 600),
    };
  }

  // The single source of truth for "how ready is Etsy": each gate in order,
  // with the first failing gate deciding the status.
  function computeReadiness(data) {
    const auth = readEtsyAuth();
    const etsy = etsySettings(data);
    const missing = credentialsMissing();
    const scopesMissing = auth && auth.refreshToken ? missingScopes(auth) : REQUIRED_SCOPES;
    const presetTaxonomies = (data.productPresets || []).filter(
      (preset) => preset.platform === "etsy" && preset.listingType === "download" && preset.taxonomyId
    );
    const hasTaxonomy = Boolean(etsy.taxonomyId) || presetTaxonomies.length > 0;

    const gates = [
      { key: "credentials", ok: missing.length === 0, detail: missing.length ? `Missing ${missing.join(", ")}` : "Keystring, shared secret, and redirect URI present" },
      { key: "oauth", ok: Boolean(auth && auth.refreshToken), detail: auth && auth.refreshToken ? `Token stored (expires ${auth.expiresAt})` : "Connect Etsy to authorize your own shop" },
      { key: "scopes", ok: Boolean(auth && auth.refreshToken) && scopesMissing.length === 0, detail: scopesMissing.length ? `Missing scope(s): ${scopesMissing.join(", ")} — reconnect Etsy` : `Granted: ${effectiveScopes(auth).join(" ")}` },
      { key: "auth_health", ok: !etsy.lastAuthError, detail: etsy.lastAuthError || "No recorded auth failures" },
      { key: "shop", ok: Boolean(etsy.shopId), detail: etsy.shopId ? `Shop #${etsy.shopId} (${etsy.shopName || "unnamed"})` : "Resolve automatically or use the manual shop resolver" },
      { key: "taxonomy", ok: hasTaxonomy, detail: etsy.taxonomyId ? `Shop default taxonomy ${etsy.taxonomyId}` : presetTaxonomies.length ? `${presetTaxonomies.length} digital preset taxonomy ids ready` : "Choose a taxonomy or use a digital listing preset" },
    ];

    let status = ETSY_READINESS.READY;
    if (missing.length === 3) status = ETSY_READINESS.NOT_CONFIGURED;
    else if (missing.length) status = ETSY_READINESS.MISSING_CREDENTIALS;
    else if (!auth || !auth.refreshToken) status = ETSY_READINESS.OAUTH_REQUIRED;
    else if (scopesMissing.length) status = ETSY_READINESS.MISSING_SCOPES;
    else if (etsy.lastAuthError) status = ETSY_READINESS.AUTH_FAILED;
    else if (!etsy.shopId) status = ETSY_READINESS.MISSING_SHOP_ID;
    else if (!hasTaxonomy) status = ETSY_READINESS.MISSING_TAXONOMY_ID;

    return { status, gates };
  }

  // Keep the channel board in step with reality. Returns true when changed.
  function syncEtsyChannel(data, readiness) {
    const channel = (data.channels || []).find((entry) => entry.key === "etsy");
    if (!channel) return false;
    const next = channelStatusFor(readiness.status);
    if (channel.status !== next) {
      channel.status = next;
      channel.updatedAt = nowIso();
      return true;
    }
    return false;
  }

  function recordAuthFailure(data, error) {
    data.integrations.etsy.lastAuthError = `${nowIso()} — ${error.message || "auth failed"}`;
  }

  // Only genuine auth problems (401/403, or a token refresh throw that has
  // no HTTP status) may poison auth health — a 404 for a wrong shop id must
  // not flip readiness to auth_failed.
  function maybeRecordAuthFailure(data, error) {
    if (error.status === 401 || error.status === 403 || error.status == null) {
      recordAuthFailure(data, error);
    }
  }

  function clearAuthFailure(data) {
    if (data.integrations?.etsy?.lastAuthError) data.integrations.etsy.lastAuthError = "";
  }

  // ============================ OAuth routes =================================
  // PKCE (S256) + one-time CSRF state, stored server-side with a 10-minute
  // expiry. The redirect URI must EXACTLY match the one registered on the
  // Etsy app. Old /api/integrations/etsy/oauth/* routes remain mounted for
  // back-compat; these are the canonical paths.

  function startOauth(request, response) {
    try {
      const missing = credentialsMissing();
      if (missing.length) {
        response
          .status(400)
          .send(`Etsy is not configured. Add ${missing.join(", ")} to .env.local and restart the backend.`);
        return;
      }
      const pkce = createPkceRequest();
      savePkce(pkce);
      response.redirect(
        etsyClient.buildAuthorizeUrl({ state: pkce.state, codeChallenge: pkce.codeChallenge })
      );
    } catch (error) {
      response.status(400).send(error.message || "Could not begin Etsy authorization.");
    }
  }

  async function oauthCallback(request, response) {
    const page = (title, body) =>
      `<!doctype html><html><body style="font-family:system-ui;padding:40px;max-width:640px"><h1>${title}</h1>${body}<p><a href="${appOrigin()}">Return to Auto Farmland</a> and open Channels &amp; Lands.</p></body></html>`;
    try {
      if (request.query.error) {
        throw new Error(String(request.query.error_description || request.query.error));
      }
      const pkce = readPkce();
      if (!pkce || !request.query.code || request.query.state !== pkce.state) {
        throw new Error("The Etsy OAuth state did not match. Start the connection again.");
      }
      if (Date.now() - new Date(pkce.createdAt).getTime() > 10 * 60 * 1000) {
        throw new Error("The Etsy authorization request expired. Start the connection again.");
      }
      const tokenResponse = await etsyClient.exchangeAuthorizationCode({
        code: request.query.code,
        codeVerifier: pkce.codeVerifier,
      });
      saveEtsyAuth(tokenResponse);
      clearPkce();

      const data = readData();
      clearAuthFailure(data);
      data.integrations.etsy.connectedAt = nowIso();

      // Resolve the shop right away when possible. OAuth user id !== shop id;
      // the shop comes from /users/{user_id}/shops (or a validated default).
      let shopNote = "";
      try {
        const shop = await resolveShopInternal(data);
        shopNote = `<p>Resolved shop: <strong>${shop.shopName || shop.shopId}</strong> (#${shop.shopId}).</p>`;
      } catch (shopError) {
        shopNote = `<p style="color:#a05a6b">Shop not resolved yet: ${String(shopError.message).replace(/[<>]/g, "")}. Use “Resolve shop” in the app.</p>`;
      }

      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.send(
        page(
          "Etsy connected",
          `<p>Personal Access OAuth completed. Tokens are stored locally on this machine and never shown in the UI.</p>${shopNote}<p><strong>Draft-only mode:</strong> Auto Farmland will not publish live listings.</p>`
        )
      );
    } catch (error) {
      response
        .status(400)
        .send(page("Etsy connection failed", `<p>${String(error.message || error).replace(/[<>]/g, "")}</p>`));
    }
  }

  app.get("/api/auth/etsy/start", startOauth);
  app.get("/api/auth/etsy/callback", oauthCallback);

  app.post("/api/auth/etsy/disconnect", (request, response) => {
    clearEtsyAuth();
    const data = readData();
    data.integrations.etsy.connectedAt = "";
    clearAuthFailure(data);
    // Saved shop/profile selections are kept — reconnecting reuses them.
    syncEtsyChannel(data, computeReadiness(data));
    writeData(data);
    response.json({ ok: true, message: "Etsy tokens deleted. Saved shop/profile selections were kept." });
  });

  // ============================ Status =======================================
  // Local-only computation (no Etsy API call) so it is safe to poll. Live
  // verification is the explicit Test Connection action.
  app.get("/api/etsy/status", (request, response) => {
    const data = readData();
    const auth = readEtsyAuth();
    const etsy = etsySettings(data);
    const readiness = computeReadiness(data);
    if (syncEtsyChannel(data, readiness)) writeData(data);

    const setup = etsy.setup || null;
    response.json({
      accessLevel: env.ETSY_ACCESS_LEVEL || "personal",
      credentialsPresent: credentialsMissing().length === 0,
      credentialsMissing: credentialsMissing(),
      redirectUri: env.ETSY_REDIRECT_URI || "",
      scopes: env.ETSY_SCOPES || etsyClient.scopes,
      oauth: {
        connected: Boolean(auth && auth.refreshToken),
        expiresAt: auth?.expiresAt || "",
        expired: auth ? new Date(auth.expiresAt || 0).getTime() < Date.now() : false,
        userId: oauthUserId(auth),
        grantedScopes: auth && auth.refreshToken ? effectiveScopes(auth) : [],
        missingScopes: auth && auth.refreshToken ? missingScopes(auth) : REQUIRED_SCOPES,
        hasShopsRead: auth && auth.refreshToken ? !missingScopes(auth).includes("shops_r") : false,
        connectedAt: etsy.connectedAt || "",
        lastAuthError: etsy.lastAuthError || "",
      },
      shop: { id: etsy.shopId || "", name: etsy.shopName || "", url: etsy.shopUrl || "" },
      resolverDebug: etsy.resolverDebug || null,
      settings: {
        shippingProfileId: etsy.shippingProfileId || "",
        readinessStateId: etsy.readinessStateId || "",
        taxonomyId: etsy.taxonomyId || "",
        returnPolicyId: etsy.returnPolicyId || "",
      },
      setup: setup
        ? {
            syncedAt: setup.syncedAt || "",
            shippingProfiles: setup.shippingProfiles || [],
            readinessStates: setup.readinessStates || [],
            returnPolicies: setup.returnPolicies || [],
            sections: setup.sections || [],
            errors: setup.errors || {},
          }
        : null,
      testMode: isTestMode(),
      createState: "draft", // the only state this pass will ever create
      readiness,
    });
  });

  // ============================ Live checks ==================================
  app.post("/api/etsy/test-connection", async (request, response) => {
    const data = readData();
    try {
      const auth = await getValidEtsyAuth();
      const shopsResponse = await etsyClient.getMyShops(auth.accessToken);
      const shops = asShopArray(shopsResponse);
      clearAuthFailure(data);
      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.json({
        ok: true,
        message: `Etsy connection verified. ${shops.length} shop(s) visible to this token.`,
        shops: shops.map((shop) => ({ shopId: String(shop.shop_id || ""), shopName: shop.shop_name || shop.title || "" })),
      });
    } catch (error) {
      recordAuthFailure(data, error);
      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.status(400).json({ ok: false, error: error.message || "Etsy connection test failed.", etsy: etsyErrorPayload(error) });
    }
  });

  // Shared shop resolution via the OAuth owner. Never assumes user id ==
  // shop id: it parses the numeric user id prefix from the token, calls the
  // shop-by-owner endpoint, and — when ETSY_DEFAULT_SHOP_ID is set —
  // validates that this token actually owns that shop. Every attempt leaves
  // a safe debug trail (endpoint + status + truncated body, never tokens).
  async function resolveShopInternal(data) {
    const auth = await getValidEtsyAuth();
    const userId = oauthUserId(auth);
    const endpoint = `GET /v3/application/users/${userId}/shops (getShopByOwnerUserId)`;
    let shopsResponse;
    try {
      shopsResponse = await etsyClient.getMyShops(auth.accessToken);
    } catch (error) {
      setResolverDebug(data, { endpoint, httpStatus: error.status, body: error.payload, note: error.message });
      throw error;
    }
    // getShopByOwnerUserId returns a SINGLE Shop object; other endpoints use
    // {results:[...]} — normalize both.
    const shops = asShopArray(shopsResponse);
    setResolverDebug(data, {
      endpoint,
      httpStatus: 200,
      body: shopsResponse,
      note: `${shops.length} shop(s) parsed for user ${userId}`,
    });
    if (!shops.length) {
      throw new Error(
        `Etsy returned no parseable shop for user ${userId}. See the resolver debug info, or use the manual shop resolver below.`
      );
    }
    const defaultShopId = String(env.ETSY_DEFAULT_SHOP_ID || "").trim();
    let shop;
    if (defaultShopId) {
      shop = shops.find((entry) => String(entry.shop_id) === defaultShopId);
      if (!shop) {
        throw new Error(
          `ETSY_DEFAULT_SHOP_ID=${defaultShopId} is not owned by the authenticated user (owned: ${shops.map((s) => s.shop_id).join(", ")}).`
        );
      }
    } else {
      shop = shops[0];
    }
    data.integrations.etsy.shopId = String(shop.shop_id || "");
    data.integrations.etsy.shopName = shop.shop_name || shop.title || "";
    data.integrations.etsy.shopUrl = shop.url || "";
    clearAuthFailure(data);
    return { shopId: data.integrations.etsy.shopId, shopName: data.integrations.etsy.shopName };
  }

  app.post("/api/etsy/resolve-shop", async (request, response) => {
    const data = readData();
    try {
      const shop = await resolveShopInternal(data);
      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.json({ ok: true, message: `Resolved shop #${shop.shopId} (${shop.shopName}).`, shop });
    } catch (error) {
      maybeRecordAuthFailure(data, error);
      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.status(400).json({ ok: false, error: error.message, etsy: etsyErrorPayload(error) });
    }
  });

  // Manual resolver step 1: shop URL or shop NAME -> numeric candidates via
  // the public findShops search. A URL is parsed to its shop name first —
  // it is never treated as a numeric id.
  app.post("/api/etsy/find-shop", async (request, response) => {
    const data = readData();
    const fromUrl = parseShopNameFromUrl(request.body.shopUrl);
    if (request.body.shopUrl && !fromUrl) {
      response.status(400).json({
        ok: false,
        error: "That does not look like an etsy.com/shop/... URL. Paste the public shop URL or just the shop name.",
      });
      return;
    }
    const shopName = String(request.body.shopName || "").trim() || fromUrl;
    if (!shopName) {
      response.status(400).json({ ok: false, error: "Provide a public Etsy shop URL or a shop name." });
      return;
    }
    const auth = readEtsyAuth();
    const endpoint = `GET /v3/application/shops?shop_name=${shopName} (findShops)`;
    try {
      const result = await etsyClient.findShopsByName(shopName, auth?.accessToken);
      const shops = asShopArray(result);
      const myUserId = oauthUserId(auth);
      const candidates = shops.slice(0, 10).map((shop) => ({
        shopId: String(shop.shop_id || ""),
        shopName: shop.shop_name || shop.title || "",
        url: shop.url || "",
        ownerUserId: String(shop.user_id || ""),
        owned: Boolean(myUserId) && String(shop.user_id || "") === myUserId,
      }));
      setResolverDebug(data, { endpoint, httpStatus: 200, body: result, note: `${candidates.length} candidate(s) for "${shopName}"` });
      writeData(data);
      response.json({
        ok: true,
        message: candidates.length
          ? `Found ${candidates.length} candidate(s) for "${shopName}". Pick yours, then validate & save.`
          : `Etsy's search returned no shops named "${shopName}". Check the exact spelling, or paste the numeric shop id directly.`,
        shopName,
        candidates,
      });
    } catch (error) {
      setResolverDebug(data, { endpoint, httpStatus: error.status, body: error.payload, note: error.message });
      writeData(data);
      response.status(400).json({ ok: false, error: error.message, etsy: etsyErrorPayload(error) });
    }
  });

  // Manual resolver step 2: validate a NUMERIC shop id against the API and,
  // when this token's user actually owns it, save it as the connected shop.
  app.post("/api/etsy/validate-shop", async (request, response) => {
    const data = readData();
    const shopId = String(request.body.shopId || "").trim();
    if (!/^\d+$/.test(shopId)) {
      response.status(400).json({
        ok: false,
        error: "Shop ID must be numeric. A shop URL is not a shop id — use “Find by URL / name” to look up the number.",
      });
      return;
    }
    const endpoint = `GET /v3/application/shops/${shopId} (getShop)`;
    try {
      const auth = await getValidEtsyAuth();
      const shopResponse = await etsyClient.getShop(shopId, auth.accessToken);
      const shop = asShopArray(shopResponse)[0] || shopResponse;
      setResolverDebug(data, { endpoint, httpStatus: 200, body: shopResponse, note: `Validated shop #${shopId}` });
      const myUserId = oauthUserId(auth);
      const ownerUserId = String(shop.user_id || "");
      if (ownerUserId && myUserId && ownerUserId !== myUserId) {
        writeData(data);
        response.status(400).json({
          ok: false,
          error: `Shop #${shopId} (“${shop.shop_name || "?"}”) is owned by Etsy user ${ownerUserId}, but this token is user ${myUserId}. With Personal Access you can only draft into your own shop.`,
        });
        return;
      }
      data.integrations.etsy.shopId = String(shop.shop_id || shopId);
      data.integrations.etsy.shopName = shop.shop_name || shop.title || "";
      data.integrations.etsy.shopUrl = shop.url || "";
      clearAuthFailure(data);
      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.json({
        ok: true,
        message: `Shop #${data.integrations.etsy.shopId} (${data.integrations.etsy.shopName || "unnamed"}) validated and saved as the connected shop.`,
        shop: { shopId: data.integrations.etsy.shopId, shopName: data.integrations.etsy.shopName, url: data.integrations.etsy.shopUrl },
      });
    } catch (error) {
      setResolverDebug(data, { endpoint, httpStatus: error.status, body: error.payload, note: error.message });
      maybeRecordAuthFailure(data, error);
      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.status(400).json({ ok: false, error: `Shop validation failed: ${error.message}`, etsy: etsyErrorPayload(error) });
    }
  });

  // Fetch shop setup data: details, shipping profiles, readiness/processing
  // profiles, return policies, sections. Each section fails independently and
  // honestly — one 404 must not hide the rest.
  app.post("/api/etsy/sync-setup", async (request, response) => {
    const data = readData();
    const etsy = etsySettings(data);
    if (!etsy.shopId) {
      response.status(400).json({ ok: false, error: "Resolve the shop before syncing setup data.", status: ETSY_READINESS.MISSING_SHOP_ID });
      return;
    }
    let auth;
    try {
      auth = await getValidEtsyAuth();
    } catch (error) {
      recordAuthFailure(data, error);
      writeData(data);
      response.status(400).json({ ok: false, error: error.message, etsy: etsyErrorPayload(error) });
      return;
    }

    const setup = { syncedAt: nowIso(), shop: null, shippingProfiles: [], readinessStates: [], returnPolicies: [], sections: [], errors: {} };
    const attempt = async (key, run, map) => {
      try {
        const result = await run();
        const rows = result.results || (Array.isArray(result) ? result : [result]);
        setup[key] = map ? rows.map(map).filter(Boolean) : rows;
      } catch (error) {
        setup.errors[key] = etsyErrorPayload(error);
      }
    };

    await attempt("shop", () => etsyClient.getShop(etsy.shopId, auth.accessToken));
    if (Array.isArray(setup.shop)) setup.shop = setup.shop[0] ? { shopId: String(setup.shop[0].shop_id || ""), shopName: setup.shop[0].shop_name || "", url: setup.shop[0].url || "" } : null;
    await attempt("shippingProfiles", () => etsyClient.getShippingProfiles(etsy.shopId, auth.accessToken), (row) => ({
      id: String(row.shipping_profile_id ?? row.id ?? ""),
      title: row.title || "Untitled profile",
      origin: row.origin_country_iso || "",
    }));
    await attempt("readinessStates", () => etsyClient.getReadinessStateDefinitions(etsy.shopId, auth.accessToken), (row) => ({
      id: String(row.readiness_state_definition_id ?? row.readiness_state_id ?? row.id ?? ""),
      label: row.readiness_state || row.label || row.title || JSON.stringify(row).slice(0, 60),
    }));
    await attempt("returnPolicies", () => etsyClient.getReturnPolicies(etsy.shopId, auth.accessToken), (row) => ({
      id: String(row.return_policy_id ?? row.id ?? ""),
      label: row.accepts_returns != null ? `Returns ${row.accepts_returns ? "accepted" : "not accepted"} · ${row.return_deadline || ""} days` : "Return policy",
    }));
    await attempt("sections", () => etsyClient.getShopSections(etsy.shopId, auth.accessToken), (row) => ({
      id: String(row.shop_section_id ?? row.id ?? ""),
      title: row.title || "Section",
    }));

    data.integrations.etsy.setup = setup;
    clearAuthFailure(data);
    syncEtsyChannel(data, computeReadiness(data));
    writeData(data);
    const failed = Object.keys(setup.errors);
    const hints = [];
    if (!failed.includes("shippingProfiles") && !setup.shippingProfiles.length) {
      hints.push("This shop has NO shipping profiles — create one in Etsy (Shop Manager → Settings → Delivery/Shipping settings), then sync again. Physical drafts need one.");
    }
    if (!failed.includes("readinessStates") && !setup.readinessStates.length) {
      hints.push("No readiness/processing profiles found — create a processing time profile in Etsy, then sync again (or paste its id manually).");
    }
    response.json({
      ok: failed.length === 0,
      message: [
        failed.length
          ? `Setup synced with ${failed.length} section(s) failing: ${failed.join(", ")}. Their Etsy errors are included.`
          : `Setup synced: ${setup.shippingProfiles.length} shipping profile(s), ${setup.readinessStates.length} readiness state(s), ${setup.returnPolicies.length} return policy(ies).`,
        ...hints,
      ].join(" "),
      setup,
    });
  });

  // Save the selected profile/taxonomy ids (non-secret settings).
  app.post("/api/etsy/settings", (request, response) => {
    const data = readData();
    const etsy = data.integrations.etsy;
    ["shippingProfileId", "readinessStateId", "taxonomyId", "returnPolicyId"].forEach((field) => {
      if (request.body[field] != null) etsy[field] = String(request.body[field]).trim();
    });
    const readiness = computeReadiness(data);
    syncEtsyChannel(data, readiness);
    writeData(data);
    response.json({ ok: true, message: "Etsy settings saved.", settings: {
      shippingProfileId: etsy.shippingProfileId, readinessStateId: etsy.readinessStateId,
      taxonomyId: etsy.taxonomyId, returnPolicyId: etsy.returnPolicyId,
    }, readiness });
  });

  // Retained only so older local data/code can be diagnosed. It is disabled by
  // default; the supported product path is Crop -> Etsy Pipeline (digital).
  app.post("/api/etsy/listings/create-physical-draft-legacy", async (request, response) => {
    if (String(env.ENABLE_LEGACY_PHYSICAL_ETSY_DRAFTS || "").toLowerCase() !== "true") {
      response.status(410).json({
        ok: false,
        error: "The legacy physical Etsy draft route is disabled. Use a crop's digital Etsy Pipeline.",
      });
      return;
    }
    const data = readData();
    const etsy = etsySettings(data);
    const readiness = computeReadiness(data);

    // Gate hard before touching the production API.
    if (readiness.status !== ETSY_READINESS.READY) {
      response.status(400).json({
        ok: false,
        error: `Etsy is not ready for a draft test (${readiness.status}). Fix the failing gate first.`,
        readiness,
      });
      return;
    }

    const design = (data.assets || []).find((asset) => asset.id === request.body.designId);
    if (!design) {
      response.status(404).json({ ok: false, error: "Design not found." });
      return;
    }
    if (!isDesignApproved(design)) {
      response.status(400).json({ ok: false, error: "Only approved designs can be pushed as Etsy draft tests." });
      return;
    }
    if (!design.filePath || !fs.existsSync(design.filePath)) {
      response.status(400).json({ ok: false, error: "The design's source file is missing from local storage." });
      return;
    }
    // Etsy listing images accept JPG, PNG, and GIF only (no WebP, no SVG).
    if (![".png", ".jpg", ".jpeg", ".gif"].includes(require("path").extname(design.filePath).toLowerCase())) {
      response.status(400).json({ ok: false, error: "Etsy image upload needs a real PNG, JPEG, or GIF file — WebP and mock SVG designs cannot be uploaded to Etsy." });
      return;
    }

    const preset = (data.productPresets || []).find((entry) => entry.id === (request.body.presetId || "preset-etsy-pod-sticker-draft"));
    if (!preset || preset.platform !== "etsy") {
      response.status(404).json({ ok: false, error: "Etsy preset not found." });
      return;
    }

    // Duplicate guard: one remote draft per design unless explicitly confirmed.
    const existing = (data.listings || []).find(
      (listing) => listing.platform === "etsy" && listing.designId === design.id && listing.remoteListingId
    );
    if (existing && !request.body.confirmDuplicate) {
      response.status(409).json({
        ok: false,
        error: `This design already has Etsy draft #${existing.remoteListingId}. Duplicate creation is blocked (re-send with confirmDuplicate to force). Updating the existing remote draft is a later milestone.`,
        existingListingId: existing.id,
        remoteListingId: existing.remoteListingId,
      });
      return;
    }

    // Build the draft payload. Preset values, integration settings as
    // fallback, request overrides on top — then test-mode safeguards LAST so
    // they cannot be overridden.
    const crop = (data.crops || []).find((entry) => entry.id === design.cropId);
    const designName = (crop && crop.name) || String(design.fileName || "Design").replace(/\.[a-z]+$/i, "");
    const context = { design_name: designName, niche: (crop && crop.niche) || "" };

    let title = request.body.title || renderTemplate(preset.defaultTitleTemplate || "{design_name} Sticker", context);
    let description = request.body.description || renderTemplate(preset.descriptionTemplate || "{design_name} sticker.", context);
    const price = Number(request.body.price ?? preset.price ?? 2.5);
    if (!(price > 0)) {
      response.status(400).json({ ok: false, error: "Price must be greater than 0." });
      return;
    }

    const testMode = isTestMode();
    if (testMode) {
      if (!/^TEST\b/i.test(title)) title = `TEST - ${title}`;
      if (!description.includes("TEST DRAFT - DO NOT PURCHASE")) {
        description = `TEST DRAFT - DO NOT PURCHASE\n\n${description}`;
      }
    }
    title = title.slice(0, 140);

    const rawTags = [...(preset.tags || []), context.niche, preset.productType, "test"]
      .map((tag) => String(tag || "").trim().slice(0, 20))
      .filter(Boolean);
    const tags = [...new Set(rawTags)].slice(0, 13);

    const draftPayload = {
      quantity: Number(preset.quantity || 1),
      title,
      description,
      price,
      whoMade: request.body.whoMade || preset.whoMade || "i_did",
      whenMade: request.body.whenMade || preset.whenMade || "made_to_order",
      taxonomyId: preset.taxonomyId || etsy.taxonomyId,
      shippingProfileId: preset.shippingProfileId || etsy.shippingProfileId,
      readinessStateId: preset.readinessStateId || etsy.readinessStateId,
      returnPolicyId: preset.returnPolicyId || etsy.returnPolicyId || "",
      // Physical dims — needed when the shop's shipping profile is calculated
      // (carrier-rated). Preset overrides; conservative sticker defaults so an
      // older preset without these fields still produces a valid listing.
      itemWeight: preset.itemWeight ?? 2,
      itemWeightUnit: preset.itemWeightUnit || "oz",
      itemLength: preset.itemLength ?? 6,
      itemWidth: preset.itemWidth ?? 4,
      itemHeight: preset.itemHeight ?? 1,
      itemDimensionsUnit: preset.itemDimensionsUnit || "in",
      tags,
    };

    console.log(
      `[etsy] PRODUCTION draft test: creating DRAFT listing on shop #${etsy.shopId} (test mode ${testMode ? "ON" : "OFF"}). No activation will occur.`
    );

    let auth;
    try {
      auth = await getValidEtsyAuth();
    } catch (error) {
      recordAuthFailure(data, error);
      syncEtsyChannel(data, computeReadiness(data));
      writeData(data);
      response.status(400).json({ ok: false, error: error.message, etsy: etsyErrorPayload(error) });
      return;
    }

    // 1) Create the draft listing.
    let remote;
    try {
      remote = await etsyClient.createPhysicalDraftListing(etsy.shopId, draftPayload, auth.accessToken);
    } catch (error) {
      response.status(400).json({
        ok: false,
        error: `Etsy draft creation failed: ${error.message}`,
        status: "draft_creation_failed",
        etsy: etsyErrorPayload(error),
      });
      return;
    }

    const remoteListing = remote.listing || remote.results?.[0] || remote;
    const remoteListingId = String(remoteListing.listing_id || "");
    const record = {
      id: makeId("listing"),
      designId: design.id,
      presetId: preset.id,
      platform: "etsy",
      marketplaceAccountId: "",
      sku: "",
      title,
      description,
      tagsOrKeywords: tags,
      price,
      quantity: draftPayload.quantity,
      mockupImages: design.publicUrl ? [design.publicUrl] : [],
      status: "draft", // local status; remote is a draft too — nothing is live
      remoteProvider: "etsy",
      remoteListingId,
      remoteStatus: remoteListing.state || "draft",
      remoteUrl: remoteListing.url || "",
      remoteEditUrl: remoteListingId ? `https://www.etsy.com/your/shops/me/listing-editor/edit/${remoteListingId}` : "",
      remoteErrors: [],
      lastPushedAt: nowIso(),
      etsyShopId: etsy.shopId,
      etsyShippingProfileId: String(draftPayload.shippingProfileId),
      etsyReadinessStateId: String(draftPayload.readinessStateId),
      etsyTaxonomyId: String(draftPayload.taxonomyId),
      etsyImageUploadStatus: "pending",
      testMode,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    // 2) Upload the design image to the new draft.
    let imageUpload = { ok: false, status: "image_upload_failed", error: null };
    try {
      const imageResponse = await etsyClient.uploadListingImage(etsy.shopId, remoteListingId, design.filePath, auth.accessToken);
      imageUpload = {
        ok: true,
        status: "uploaded",
        imageId: String(imageResponse.listing_image_id || imageResponse.results?.[0]?.listing_image_id || ""),
      };
      record.etsyImageUploadStatus = "uploaded";
    } catch (error) {
      imageUpload = { ok: false, status: "image_upload_failed", error: etsyErrorPayload(error) };
      record.etsyImageUploadStatus = "image_upload_failed";
      record.remoteErrors.push({ at: nowIso(), action: "upload_image", ...etsyErrorPayload(error) });
    }

    data.listings.unshift(record);
    clearAuthFailure(data);
    syncEtsyChannel(data, computeReadiness(data));
    writeData(data);

    response.json({
      ok: true,
      message: imageUpload.ok
        ? `Etsy DRAFT #${remoteListingId} created with image. It stays a draft — check your Etsy seller dashboard.`
        : `Etsy DRAFT #${remoteListingId} created, but the image upload failed (details included). The draft stays image-less until retried.`,
      listing: record,
      etsy: {
        listingId: remoteListingId,
        state: record.remoteStatus,
        url: record.remoteUrl,
        editUrl: record.remoteEditUrl,
      },
      imageUpload,
      testMode,
    });
  });
}

module.exports = { registerEtsyRoutes, ETSY_READINESS };
