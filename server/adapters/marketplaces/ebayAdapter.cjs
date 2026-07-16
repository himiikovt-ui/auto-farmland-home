const { MarketplaceAdapter } = require("./MarketplaceAdapter.cjs");
const { CONNECTION_STATUS, LISTING_STATUS } = require("../../engine/status.cjs");

// eBay marketplace adapter — Auto Farmland's v1 selling land.
//
// V1 intent: publish directly to eBay using the Sell Inventory API. The flow
// is deliberately modelled as:
//
//   create inventory item (SKU)  ->  create offer  ->  publish offer
//   -> store listingId / offerId / SKU on the listing record
//
// NOTHING here fakes a live API call. Real HTTP requests are only shaped and
// documented; until credentials + an OAuth user token are present, every
// method returns an explicit not_configured / missing_credentials status so
// the UI can be honest with the operator.
//
// Required env (placeholders only — real values live in .env.local, ignored):
//   EBAY_ENV=sandbox|production
//   EBAY_CLIENT_ID
//   EBAY_CLIENT_SECRET
//   EBAY_REDIRECT_URI            (RuName / redirect for the OAuth user consent)
//   EBAY_REFRESH_TOKEN           (user token; obtained via the OAuth grant)
//   EBAY_MARKETPLACE_ID=EBAY_US
class EbayAdapter extends MarketplaceAdapter {
  constructor(options = {}) {
    super("ebay");
    this.env = options.env || "sandbox";
    this.clientId = options.clientId || "";
    this.clientSecret = options.clientSecret || "";
    this.redirectUri = options.redirectUri || "";
    this.refreshToken = options.refreshToken || "";
    this.marketplaceId = options.marketplaceId || "EBAY_US";
    // "blocked" until the eBay Developer Program grants access. While blocked,
    // every method reports developer_account_blocked — the physical-product
    // lane runs through the Printful-mediated eBay Land instead.
    this.developerAccess = options.developerAccess || "blocked";
    this.baseUrl =
      this.env === "production"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";
  }

  isDeveloperBlocked() {
    return this.developerAccess !== "granted";
  }

  // App-level credentials present (enough to begin the OAuth handshake).
  hasAppCredentials() {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  // A user token is present AND developer access exists, so we could actually
  // call the Sell APIs.
  isConfigured() {
    return (
      !this.isDeveloperBlocked() &&
      this.hasAppCredentials() &&
      Boolean(this.refreshToken)
    );
  }

  // All stub methods route through here — report the real blocker.
  notConfigured(action, detail) {
    const state = this.configState();
    return {
      ok: false,
      platform: this.platform,
      action,
      status: state.status,
      message: detail || state.message,
    };
  }

  // Describe exactly what is missing, honestly.
  configState() {
    if (this.isDeveloperBlocked()) {
      return {
        status: CONNECTION_STATUS.DEVELOPER_ACCOUNT_BLOCKED,
        missing: [],
        message:
          "eBay Developer Program registration was rejected — direct API access is blocked. " +
          "Use the Printful-mediated eBay lane (POD Land) meanwhile. " +
          "Set EBAY_DEVELOPER_ACCESS=granted in .env.local if access opens later.",
      };
    }
    if (!this.hasAppCredentials()) {
      const missing = [
        !this.clientId && "EBAY_CLIENT_ID",
        !this.clientSecret && "EBAY_CLIENT_SECRET",
        !this.redirectUri && "EBAY_REDIRECT_URI",
      ].filter(Boolean);
      return {
        status: CONNECTION_STATUS.NOT_CONFIGURED,
        missing,
        message: `Add ${missing.join(", ")} to .env.local to configure eBay.`,
      };
    }
    if (!this.refreshToken) {
      return {
        status: CONNECTION_STATUS.MISSING_CREDENTIALS,
        missing: ["EBAY_REFRESH_TOKEN"],
        message:
          "eBay app credentials found. Complete the eBay OAuth user consent to obtain EBAY_REFRESH_TOKEN.",
      };
    }
    return {
      status: CONNECTION_STATUS.NEEDS_AUTH,
      missing: [],
      message: "eBay is configured. A live connection check has not run yet.",
    };
  }

  async validateConnection() {
    const state = this.configState();
    // We never claim "connected" without a real token exchange, which we do
    // not perform here to avoid faking success. Report the honest config state.
    return {
      ok: false,
      platform: this.platform,
      status: state.status,
      env: this.env,
      marketplaceId: this.marketplaceId,
      missing: state.missing,
      message: state.message,
    };
  }

  // Deterministic, offline checks on a compiled listing draft. This does NOT
  // call eBay — it validates that the record has everything the Inventory API
  // will require, so the operator gets fast, honest feedback.
  async validateListingDraft(listing, ctx = {}) {
    const preset = ctx.preset || {};
    const problems = [];
    if (!listing) {
      return { ok: false, platform: this.platform, status: "error", problems: ["Listing not found."] };
    }
    if (!listing.sku) problems.push("Missing SKU.");
    if (!listing.title || listing.title.length > 80)
      problems.push("Title is required and must be 80 characters or fewer.");
    if (!listing.description) problems.push("Missing description.");
    if (!(Number(listing.price) > 0)) problems.push("Price must be greater than 0.");
    if (!(Number(listing.quantity) > 0)) problems.push("Quantity must be greater than 0.");
    if (!(listing.categoryId || preset.categoryId)) problems.push("Missing eBay categoryId.");
    if (!(listing.mockupImages && listing.mockupImages.length))
      problems.push("At least one listing image is required.");
    // Business policies + inventory location come from the preset/account.
    if (!(preset.shippingPolicyId)) problems.push("Preset is missing shippingPolicyId (fulfillment policy).");
    if (!(preset.paymentPolicyId)) problems.push("Preset is missing paymentPolicyId.");
    if (!(preset.returnPolicyId)) problems.push("Preset is missing returnPolicyId.");
    if (!(preset.inventoryLocationKey)) problems.push("Preset is missing inventoryLocationKey (merchant location).");

    return {
      ok: problems.length === 0,
      platform: this.platform,
      status: problems.length === 0 ? "valid" : "invalid",
      problems,
      message:
        problems.length === 0
          ? "Draft passes local eBay validation. Live publish still requires a configured connection."
          : `Draft has ${problems.length} issue(s) to resolve before publishing.`,
    };
  }

  // The real publish is a 3-step Inventory API sequence. We shape the plan but
  // refuse to pretend it happened without credentials.
  async publishListing(listing, ctx = {}) {
    if (!this.isConfigured()) {
      const state = this.configState();
      return {
        ok: false,
        platform: this.platform,
        status: state.status, // not_configured | missing_credentials
        listingStatus: LISTING_STATUS.READY_TO_PUBLISH,
        message: state.message,
        // The exact call sequence a configured adapter will run:
        plannedSteps: [
          { step: "create_inventory_item", method: "PUT", path: `/sell/inventory/v1/inventory_item/${listing.sku || "<sku>"}` },
          { step: "create_offer", method: "POST", path: "/sell/inventory/v1/offer" },
          { step: "publish_offer", method: "POST", path: "/sell/inventory/v1/offer/<offerId>/publish" },
        ],
      };
    }

    // Guard: even when configured, run local validation first and never
    // publish an invalid draft.
    const validation = await this.validateListingDraft(listing, ctx);
    if (!validation.ok) {
      return {
        ok: false,
        platform: this.platform,
        status: "invalid",
        listingStatus: LISTING_STATUS.PUBLISH_FAILED,
        problems: validation.problems,
        message: "Draft failed validation; not sent to eBay.",
      };
    }

    // A configured live implementation would perform the token exchange and
    // the three Inventory API calls here. That real HTTP work is intentionally
    // left unimplemented rather than stubbed with a fake success.
    return {
      ok: false,
      platform: this.platform,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      listingStatus: LISTING_STATUS.READY_TO_PUBLISH,
      message:
        "eBay is configured but live publishing is not implemented yet. No fake listing was created.",
    };
  }

  async reviseListing(listing) {
    if (!this.isConfigured()) return this.notConfigured("reviseListing");
    return {
      ok: false,
      platform: this.platform,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      message: "reviseListing is not implemented yet.",
      plannedSteps: [
        { step: "update_offer", method: "PUT", path: `/sell/inventory/v1/offer/${listing.platformOfferId || "<offerId>"}` },
      ],
    };
  }

  async endListing(listing) {
    if (!this.isConfigured()) return this.notConfigured("endListing");
    return {
      ok: false,
      platform: this.platform,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      message: "endListing is not implemented yet.",
      plannedSteps: [
        { step: "withdraw_offer", method: "POST", path: `/sell/inventory/v1/offer/${listing.platformOfferId || "<offerId>"}/withdraw` },
      ],
    };
  }

  async syncOrders() {
    if (!this.isConfigured()) return this.notConfigured("syncOrders");
    return {
      ok: false,
      platform: this.platform,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      orders: [],
      message: "syncOrders is not implemented yet.",
      plannedSteps: [{ step: "get_orders", method: "GET", path: "/sell/fulfillment/v1/order" }],
    };
  }

  async uploadTracking(order) {
    if (!this.isConfigured()) return this.notConfigured("uploadTracking");
    return {
      ok: false,
      platform: this.platform,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      message: "uploadTracking is not implemented yet.",
      plannedSteps: [
        {
          step: "create_shipping_fulfillment",
          method: "POST",
          path: `/sell/fulfillment/v1/order/${order.platformOrderId || "<orderId>"}/shipping_fulfillment`,
        },
      ],
    };
  }

  async syncMetrics() {
    if (!this.isConfigured()) return this.notConfigured("syncMetrics");
    return {
      ok: false,
      platform: this.platform,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      metrics: [],
      message: "syncMetrics is not implemented yet.",
      plannedSteps: [{ step: "get_traffic_report", method: "GET", path: "/sell/analytics/v1/traffic_report" }],
    };
  }
}

module.exports = { EbayAdapter };
