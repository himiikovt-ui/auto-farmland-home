const fs = require("fs");
const path = require("path");

class EtsyClient {
  constructor(options = {}) {
    this.keystring = options.keystring || "";
    this.sharedSecret = options.sharedSecret || "";
    this.redirectUri = options.redirectUri || "";
    this.scopes = options.scopes || "shops_r listings_r listings_w";
    this.baseUrl = "https://api.etsy.com/v3";
  }

  isConfigured() {
    return Boolean(this.keystring && this.sharedSecret && this.redirectUri);
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error(
        "Etsy is not configured. Add ETSY_KEYSTRING, ETSY_SHARED_SECRET, and ETSY_REDIRECT_URI to .env.local."
      );
    }
  }

  buildAuthorizeUrl({ state, codeChallenge }) {
    this.assertConfigured();
    const query = new URLSearchParams({
      response_type: "code",
      client_id: this.keystring,
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://www.etsy.com/oauth/connect?${query.toString()}`;
  }

  async exchangeAuthorizationCode({ code, codeVerifier }) {
    this.assertConfigured();
    return this.tokenRequest({
      grant_type: "authorization_code",
      client_id: this.keystring,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: codeVerifier,
    });
  }

  async refreshAccessToken(refreshToken) {
    this.assertConfigured();
    return this.tokenRequest({
      grant_type: "refresh_token",
      client_id: this.keystring,
      refresh_token: refreshToken,
    });
  }

  async tokenRequest(fields) {
    const response = await fetch(`${this.baseUrl}/public/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    return this.parseResponse(response, "Etsy OAuth token exchange failed");
  }

  async apiRequest(resourcePath, options = {}) {
    this.assertConfigured();
    const headers = {
      "x-api-key": `${this.keystring}:${this.sharedSecret}`,
      ...(options.headers || {}),
    };
    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }
    const response = await fetch(`${this.baseUrl}/application${resourcePath}`, {
      method: options.method || "GET",
      headers,
      body: options.body,
    });
    return this.parseResponse(response, `Etsy ${options.method || "GET"} ${resourcePath} failed`);
  }

  async parseResponse(response, context) {
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }
    if (!response.ok) {
      const detail = payload?.error || payload?.message || `HTTP ${response.status}`;
      const error = new Error(`${context}: ${detail}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async getMyShops(accessToken) {
    const userId = String(accessToken || "").split(".")[0];
    if (!userId) throw new Error("The Etsy access token does not contain a user id.");
    return this.apiRequest(`/users/${userId}/shops`, { accessToken });
  }

  async getShop(shopId, accessToken) {
    return this.apiRequest(`/shops/${shopId}`, { accessToken });
  }

  // Public shop search (findShops): resolves a shop NAME to numeric shop ids.
  // Fuzzy — returns up to `limit` candidates; the caller picks/validates.
  async findShopsByName(shopName, accessToken) {
    const query = new URLSearchParams({ shop_name: String(shopName), limit: "10" });
    return this.apiRequest(`/shops?${query.toString()}`, { accessToken });
  }

  async getShopSections(shopId, accessToken) {
    return this.apiRequest(`/shops/${shopId}/sections`, { accessToken });
  }

  async getShippingProfiles(shopId, accessToken) {
    return this.apiRequest(`/shops/${shopId}/shipping-profiles`, { accessToken });
  }

  // Readiness/processing profiles (Etsy's newer made-to-order readiness
  // states). If the endpoint shape differs for this shop/API version, the
  // structured error (with Etsy's response body) surfaces in the UI and the
  // readiness_state_id can still be entered manually.
  async getReadinessStateDefinitions(shopId, accessToken) {
    return this.apiRequest(`/shops/${shopId}/readiness-state-definitions`, { accessToken });
  }

  async getReturnPolicies(shopId, accessToken) {
    return this.apiRequest(`/shops/${shopId}/policies/return`, { accessToken });
  }

  async getSellerTaxonomy() {
    return this.apiRequest("/seller-taxonomy/nodes");
  }

  // Physical draft listing for the Personal Access test lane. Etsy's
  // createDraftListing endpoint always creates a DRAFT — there is no state
  // parameter here and none is sent; activation is a separate, deliberately
  // unimplemented action.
  async createPhysicalDraftListing(shopId, listing, accessToken) {
    const body = new URLSearchParams({
      quantity: String(listing.quantity || 1),
      title: listing.title,
      description: listing.description,
      price: String(listing.price),
      who_made: listing.whoMade || "i_did",
      when_made: listing.whenMade || "made_to_order",
      taxonomy_id: String(listing.taxonomyId),
      shipping_profile_id: String(listing.shippingProfileId),
      readiness_state_id: String(listing.readinessStateId),
      type: "physical",
    });
    if (listing.returnPolicyId) body.append("return_policy_id", String(listing.returnPolicyId));
    // Physical item weight + dimensions. Required when the shipping profile is
    // a CALCULATED (carrier-rated) profile; harmless otherwise. Sent only when
    // the caller supplies them.
    if (listing.itemWeight != null && listing.itemWeight !== "") {
      body.append("item_weight", String(listing.itemWeight));
      body.append("item_weight_unit", listing.itemWeightUnit || "oz");
    }
    if (
      listing.itemLength != null && listing.itemLength !== "" &&
      listing.itemWidth != null && listing.itemWidth !== "" &&
      listing.itemHeight != null && listing.itemHeight !== ""
    ) {
      body.append("item_length", String(listing.itemLength));
      body.append("item_width", String(listing.itemWidth));
      body.append("item_height", String(listing.itemHeight));
      body.append("item_dimensions_unit", listing.itemDimensionsUnit || "in");
    }
    (listing.tags || []).slice(0, 13).forEach((tag) => body.append("tags", tag));
    return this.apiRequest(`/shops/${shopId}/listings`, {
      method: "POST",
      accessToken,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  async createDraftListing(shopId, listing, accessToken) {
    const body = new URLSearchParams({
      quantity: String(listing.quantity || 1),
      title: listing.title,
      description: `${listing.description}\n\nAI disclosure:\n${listing.aiDisclosure}`,
      price: String(listing.price),
      who_made: listing.whoMade || "i_did",
      when_made: listing.whenMade || "2020_2026",
      taxonomy_id: String(listing.taxonomyId),
    });
    if (listing.type) body.append("type", String(listing.type));
    (listing.tags || []).slice(0, 13).forEach((tag) => body.append("tags", tag));
    return this.apiRequest(`/shops/${shopId}/listings`, {
      method: "POST",
      accessToken,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  async uploadListingImage(shopId, listingId, filePath, accessToken, rank = 1) {
    const form = new FormData();
    const extension = path.extname(filePath).toLowerCase();
    // Etsy listing images accept JPG, PNG, and GIF. Send the correct MIME per
    // extension — a GIF mislabeled as image/png can be rejected.
    const type =
      extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".gif"
          ? "image/gif"
          : "image/png";
    form.append("image", new Blob([fs.readFileSync(filePath)], { type }), path.basename(filePath));
    form.append("rank", String(rank));
    return this.apiRequest(`/shops/${shopId}/listings/${listingId}/images`, {
      method: "POST",
      accessToken,
      body: form,
    });
  }

  async uploadListingFile(shopId, listingId, filePath, accessToken, rank = 1) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([fs.readFileSync(filePath)], { type: "application/octet-stream" }),
      path.basename(filePath)
    );
    form.append("name", path.basename(filePath));
    form.append("rank", String(rank));
    return this.apiRequest(`/shops/${shopId}/listings/${listingId}/files`, {
      method: "POST",
      accessToken,
      body: form,
    });
  }

  async updateListing(shopId, listingId, updates, accessToken) {
    const body = new URLSearchParams();
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && value !== null) body.append(key, String(value));
    });
    return this.apiRequest(`/shops/${shopId}/listings/${listingId}`, {
      method: "PATCH",
      accessToken,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  async getListing(listingId, accessToken) {
    return this.apiRequest(`/listings/${listingId}`, { accessToken });
  }
}

module.exports = { EtsyClient };
