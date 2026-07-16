const { compileListing } = require("../services/listingCompiler.cjs");
const {
  getNeedsYou,
  getEngineSections,
  listingsDueForReview,
  evaluateListing,
} = require("../services/decisionEngine.cjs");
const {
  DESIGN_STATUS,
  DESIGN_STATUSES,
  LISTING_STATUS,
  DECISIONS,
  normalizeDesignStatus,
} = require("./status.cjs");

// Registers all engine routes on the Express app. Kept as a function so
// index.cjs stays the single source of truth for readData/writeData and the
// adapter registry — this module never opens the store itself.
function registerEngineRoutes(app, deps) {
  const { readData, writeData, makeId, nowIso, adapters } = deps;

  const send404 = (response, what) =>
    response.status(404).json({ ok: false, error: `${what} not found.` });

  // --- Engine dashboard: actionable work across all lands -------------------
  // sections = Needs Review / Ready to Publish / Needs Attention / Growth.
  // needsYou is kept for backwards compatibility with the older shape.
  app.get("/api/engine/dashboard", (request, response) => {
    const data = readData();
    const { sections, attentionTotal } = getEngineSections(data);
    response.json({
      sections,
      attentionTotal,
      needsYou: getNeedsYou(data, adapters),
      dueForReview: listingsDueForReview(data),
      counts: {
        seeds: (data.seeds || []).length,
        designs: (data.assets || []).filter((a) => !a.isReference).length,
        blogPosts: (data.blogPosts || []).length,
        podPlans: (data.podProductPlans || []).length,
        presets: (data.productPresets || []).length,
        listings: (data.listings || []).length,
        orders: (data.orders || []).length,
        channels: (data.channels || []).length,
      },
    });
  });

  // Honest adapter connection statuses (no fake success).
  app.get("/api/engine/adapters/status", async (request, response) => {
    const marketplaces = {};
    for (const [platform, adapter] of Object.entries(adapters.marketplaces)) {
      marketplaces[platform] = await adapter.validateConnection();
    }
    const pod = {};
    for (const [provider, adapter] of Object.entries(adapters.pod)) {
      pod[provider] = await adapter.validateConnection();
    }
    const blog = {};
    for (const [target, adapter] of Object.entries(adapters.blog || {})) {
      blog[target] = await adapter.validateConnection();
    }
    response.json({ marketplaces, pod, blog });
  });

  // --- Product presets ------------------------------------------------------
  app.get("/api/presets", (request, response) => {
    response.json(readData().productPresets || []);
  });

  app.post("/api/presets", (request, response) => {
    const data = readData();
    const { name, platform, productType } = request.body;
    if (!name || !platform || !productType) {
      response.status(400).json({ ok: false, error: "Preset needs name, platform, and productType." });
      return;
    }
    const preset = {
      id: makeId("preset"),
      name,
      platform,
      productType,
      categoryId: "",
      condition: "NEW",
      defaultTitleTemplate: "",
      descriptionTemplate: "",
      itemSpecificsTemplate: {},
      price: 0,
      quantity: 1,
      sizeVariations: [],
      shippingPolicyId: "",
      paymentPolicyId: "",
      returnPolicyId: "",
      inventoryLocationKey: "",
      podProvider: "",
      podVariantIds: [],
      productionCost: 0,
      shippingCostEstimate: 0,
      marginRules: {},
      ...request.body,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.productPresets.unshift(preset);
    writeData(data);
    response.json({ ok: true, message: "Preset created.", preset });
  });

  app.patch("/api/presets/:id", (request, response) => {
    const data = readData();
    const index = (data.productPresets || []).findIndex((p) => p.id === request.params.id);
    if (index < 0) return send404(response, "Preset");
    const { automationPolicy: ignoredAutomationPolicy, ...safeUpdates } = request.body;
    void ignoredAutomationPolicy;
    data.productPresets[index] = {
      ...data.productPresets[index],
      ...safeUpdates,
      id: data.productPresets[index].id,
      automationPolicy: data.productPresets[index].automationPolicy,
      updatedAt: nowIso(),
    };
    writeData(data);
    response.json({ ok: true, message: "Preset saved.", preset: data.productPresets[index] });
  });

  // --- Marketplace accounts -------------------------------------------------
  app.get("/api/marketplace-accounts", (request, response) => {
    response.json(readData().marketplaceAccounts || []);
  });

  app.patch("/api/marketplace-accounts/:id", (request, response) => {
    const data = readData();
    const index = (data.marketplaceAccounts || []).findIndex((a) => a.id === request.params.id);
    if (index < 0) return send404(response, "Marketplace account");
    data.marketplaceAccounts[index] = {
      ...data.marketplaceAccounts[index],
      ...request.body,
      id: data.marketplaceAccounts[index].id,
      updatedAt: nowIso(),
    };
    writeData(data);
    response.json({ ok: true, message: "Account saved.", account: data.marketplaceAccounts[index] });
  });

  // Run the adapter's honest connection check and persist the real status.
  app.post("/api/marketplace-accounts/:id/check", async (request, response) => {
    const data = readData();
    const account = (data.marketplaceAccounts || []).find((a) => a.id === request.params.id);
    if (!account) return send404(response, "Marketplace account");
    const adapter = adapters.getMarketplace(account.platform);
    if (!adapter) {
      response.status(400).json({ ok: false, error: `No adapter for platform ${account.platform}.` });
      return;
    }
    const result = await adapter.validateConnection();
    account.status = result.status; // honest: never forced to "connected"
    account.lastCheckedAt = nowIso();
    account.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: result.ok, result, account });
  });

  // --- POD accounts ---------------------------------------------------------
  app.get("/api/pod-accounts", (request, response) => {
    response.json(readData().podAccounts || []);
  });

  app.post("/api/pod-accounts/:id/check", async (request, response) => {
    const data = readData();
    const account = (data.podAccounts || []).find((a) => a.id === request.params.id);
    if (!account) return send404(response, "POD account");
    const adapter = adapters.getPod(account.provider);
    if (!adapter) {
      response.status(400).json({ ok: false, error: `No adapter for provider ${account.provider}.` });
      return;
    }
    const result = await adapter.validateConnection();
    account.status = result.status;
    account.lastCheckedAt = nowIso();
    account.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: result.ok, result, account });
  });

  // --- Design review (acts on existing assets) ------------------------------
  // Merged approve concept: "approved" means accepted for listing use. There
  // is no separate "final" step in the engine.
  app.post("/api/designs/:id/review", (request, response) => {
    const data = readData();
    const asset = (data.assets || []).find((a) => a.id === request.params.id);
    if (!asset) return send404(response, "Design");
    const nextStatus = request.body.status;
    if (nextStatus && !DESIGN_STATUSES.includes(nextStatus)) {
      response.status(400).json({ ok: false, error: `Invalid design status: ${nextStatus}` });
      return;
    }
    if (nextStatus) asset.status = nextStatus;
    if (request.body.ipRiskStatus) asset.ipRiskStatus = request.body.ipRiskStatus;
    if (request.body.qualityStatus) asset.qualityStatus = request.body.qualityStatus;
    if (request.body.notes != null) asset.notes = request.body.notes;
    asset.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: true, message: "Design reviewed.", design: asset });
  });

  // Remix REQUEST — marks intent only. Does NOT trigger generation or spend
  // any credits. Records lineage so a later generation can create the child.
  app.post("/api/designs/:id/remix-request", (request, response) => {
    const data = readData();
    const asset = (data.assets || []).find((a) => a.id === request.params.id);
    if (!asset) return send404(response, "Design");
    asset.status = DESIGN_STATUS.REMIX_REQUESTED;
    asset.remixReason = request.body.remixReason || asset.remixReason || "";
    asset.remixPrompt = request.body.remixPrompt || asset.prompt || "";
    asset.updatedAt = nowIso();
    writeData(data);
    response.json({
      ok: true,
      triggeredGeneration: false,
      message:
        "Marked for remix. No generation was triggered and no credits were spent. Generate the child batch when ready.",
      design: asset,
    });
  });

  // --- Listings -------------------------------------------------------------
  app.get("/api/listings", (request, response) => {
    response.json(readData().listings || []);
  });

  // Compile an approved design + preset into a DRAFT listing. Never publishes.
  app.post("/api/listings/compile", (request, response) => {
    const data = readData();
    const design = (data.assets || []).find((a) => a.id === request.body.designId);
    const preset = (data.productPresets || []).find((p) => p.id === request.body.presetId);
    const account = (data.marketplaceAccounts || []).find(
      (a) => a.id === request.body.marketplaceAccountId
    );
    const crop = (data.crops || []).find((c) => c.id === (design && design.cropId));
    if (!design) return send404(response, "Design");
    if (!preset) return send404(response, "Preset");
    try {
      const listing = compileListing({ design, preset, account, crop });
      data.listings.unshift(listing);
      writeData(data);
      response.json({ ok: true, message: "Draft listing compiled.", listing });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.patch("/api/listings/:id", (request, response) => {
    const data = readData();
    const index = (data.listings || []).findIndex((l) => l.id === request.params.id);
    if (index < 0) return send404(response, "Listing");
    data.listings[index] = {
      ...data.listings[index],
      ...request.body,
      id: data.listings[index].id,
      updatedAt: nowIso(),
    };
    writeData(data);
    response.json({ ok: true, message: "Listing saved.", listing: data.listings[index] });
  });

  // Local, honest pre-publish validation via the marketplace adapter.
  app.post("/api/listings/:id/validate", async (request, response) => {
    const data = readData();
    const listing = (data.listings || []).find((l) => l.id === request.params.id);
    if (!listing) return send404(response, "Listing");
    const adapter = adapters.getMarketplace(listing.platform);
    if (!adapter) {
      response.status(400).json({ ok: false, error: `No adapter for platform ${listing.platform}.` });
      return;
    }
    const preset = (data.productPresets || []).find((p) => p.id === listing.presetId);
    const result = await adapter.validateListingDraft(listing, { preset });
    if (result.ok && listing.status === LISTING_STATUS.DRAFT) {
      listing.status = LISTING_STATUS.READY_TO_PUBLISH;
      listing.updatedAt = nowIso();
      writeData(data);
    }
    response.json({ ok: result.ok, result, listing });
  });

  // Publish through the adapter. The adapter is honest: with no credentials it
  // returns not_configured / missing_credentials and we set publish_failed —
  // never a fake "published".
  app.post("/api/listings/:id/publish", async (request, response) => {
    const data = readData();
    const listing = (data.listings || []).find((l) => l.id === request.params.id);
    if (!listing) return send404(response, "Listing");
    const adapter = adapters.getMarketplace(listing.platform);
    if (!adapter) {
      response.status(400).json({ ok: false, error: `No adapter for platform ${listing.platform}.` });
      return;
    }
    const preset = (data.productPresets || []).find((p) => p.id === listing.presetId);
    const account = (data.marketplaceAccounts || []).find((a) => a.id === listing.marketplaceAccountId);
    listing.status = LISTING_STATUS.PUBLISHING;
    listing.updatedAt = nowIso();
    writeData(data);

    const result = await adapter.publishListing(listing, { preset, account });
    if (result.ok) {
      listing.status = LISTING_STATUS.PUBLISHED;
      listing.platformListingId = result.platformListingId || listing.platformListingId;
      listing.platformOfferId = result.platformOfferId || listing.platformOfferId;
      listing.publishedUrl = result.publishedUrl || "";
      listing.publishedAt = nowIso();
    } else {
      listing.status = LISTING_STATUS.PUBLISH_FAILED;
    }
    listing.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: result.ok, result, listing });
  });

  // --- Orders ---------------------------------------------------------------
  app.get("/api/orders", (request, response) => {
    response.json(readData().orders || []);
  });

  // --- Metrics --------------------------------------------------------------
  app.get("/api/metrics", (request, response) => {
    response.json(readData().listingMetricsDaily || []);
  });

  app.post("/api/metrics", (request, response) => {
    const data = readData();
    if (!request.body.listingId) {
      response.status(400).json({ ok: false, error: "A metric row needs a listingId." });
      return;
    }
    const number = (value) => Math.max(0, Number(value || 0));
    const orders = number(request.body.orders);
    const views = number(request.body.views);
    const clicks = number(request.body.clicks);
    const row = {
      id: makeId("metric"),
      listingId: request.body.listingId,
      date: request.body.date || nowIso().slice(0, 10),
      impressions: number(request.body.impressions),
      views,
      clicks,
      favoritesOrWatchers: number(request.body.favoritesOrWatchers),
      orders,
      grossRevenue: number(request.body.grossRevenue),
      platformFees: number(request.body.platformFees),
      podCost: number(request.body.podCost),
      shippingCost: number(request.body.shippingCost),
      netProfit:
        number(request.body.grossRevenue) -
        number(request.body.platformFees) -
        number(request.body.podCost) -
        number(request.body.shippingCost),
      conversionRate: clicks ? Number(((orders / clicks) * 100).toFixed(2)) : 0,
      createdAt: nowIso(),
    };
    data.listingMetricsDaily.unshift(row);
    writeData(data);
    response.json({ ok: true, message: "Metric row saved.", metric: row });
  });

  // --- Decisions (60-day) ---------------------------------------------------
  app.get("/api/decisions/queue", (request, response) => {
    response.json(listingsDueForReview(readData()));
  });

  app.post("/api/decisions", (request, response) => {
    const data = readData();
    const listing = (data.listings || []).find((l) => l.id === request.body.listingId);
    if (!listing) return send404(response, "Listing");
    if (!DECISIONS.includes(request.body.decision)) {
      response.status(400).json({ ok: false, error: `Invalid decision: ${request.body.decision}` });
      return;
    }
    const evaluation = evaluateListing(listing, data.listingMetricsDaily);
    const decision = {
      id: makeId("decision"),
      listingId: listing.id,
      decision: request.body.decision,
      reason: request.body.reason || "",
      recommendationAtTime: evaluation.recommendation,
      totalsAtTime: evaluation.totals,
      createdAt: nowIso(),
    };
    data.decisions.unshift(decision);
    // Reflect the decision on the listing without deleting anything.
    listing.lastDecision = decision.decision;
    listing.decisionReason = decision.reason;
    listing.decisionAt = decision.createdAt;
    if (decision.decision === "kill") listing.status = LISTING_STATUS.KILLED;
    if (decision.decision === "archive") listing.status = LISTING_STATUS.ARCHIVED;
    // Reset the 60-day clock for keep/revise decisions.
    if (["keep", "revise_title", "revise_price", "revise_mockup"].includes(decision.decision)) {
      const next = new Date();
      next.setDate(next.getDate() + 60);
      listing.killReviewDate = next.toISOString();
    }
    listing.updatedAt = nowIso();
    writeData(data);
    response.json({ ok: true, message: `Decision logged: ${decision.decision}.`, decision, listing });
  });
}

module.exports = { registerEngineRoutes };
