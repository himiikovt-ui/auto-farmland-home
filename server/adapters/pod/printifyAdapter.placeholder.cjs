const { PodAdapter } = require("./PodAdapter.cjs");
const { CONNECTION_STATUS } = require("../../engine/status.cjs");

// Printify POD provider — a leading candidate for eBay sticker fulfillment.
// Placeholder: real structure + honest config state, no faked orders.
//
// Env placeholders (real values in .env.local, ignored):
//   PRINTIFY_API_TOKEN
//   PRINTIFY_SHOP_ID
class PrintifyAdapterPlaceholder extends PodAdapter {
  constructor(options = {}) {
    super("printify");
    this.apiToken = options.apiToken || "";
    this.shopId = options.shopId || "";
    this.baseUrl = "https://api.printify.com/v1";
  }

  isConfigured() {
    return Boolean(this.apiToken && this.shopId);
  }

  configState() {
    const missing = [
      !this.apiToken && "PRINTIFY_API_TOKEN",
      !this.shopId && "PRINTIFY_SHOP_ID",
    ].filter(Boolean);
    // Nothing set = not_configured; some but not all = missing_credentials.
    let status = CONNECTION_STATUS.NEEDS_AUTH;
    if (missing.length === 2) status = CONNECTION_STATUS.NOT_CONFIGURED;
    else if (missing.length === 1) status = CONNECTION_STATUS.MISSING_CREDENTIALS;
    return {
      status,
      missing,
      message: missing.length
        ? `Add ${missing.join(", ")} to .env.local to configure Printify.`
        : "Printify credentials found. A live connection check has not run yet.",
    };
  }

  async validateConnection() {
    const state = this.configState();
    return { ok: false, provider: this.provider, status: state.status, missing: state.missing, message: state.message };
  }

  async validateArtwork(design, preset = {}) {
    // Offline artwork checks a configured adapter will enforce before an order.
    const problems = [];
    if (!design || !design.filePath) problems.push("Design has no source file.");
    if (!(preset.podVariantIds && preset.podVariantIds.length))
      problems.push("Preset has no podVariantIds mapped to Printify variants.");
    return {
      ok: problems.length === 0,
      provider: this.provider,
      status: problems.length === 0 ? "valid" : "invalid",
      problems,
    };
  }

  async createFulfillmentOrder(order) {
    if (!this.isConfigured()) return this.notConfigured("createFulfillmentOrder");
    return {
      ok: false,
      provider: this.provider,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      message: "Printify order submission is not implemented yet. No fake POD order was created.",
      plannedSteps: [
        { step: "create_order", method: "POST", path: `/shops/${this.shopId}/orders.json`, sourceOrderId: order.platformOrderId },
      ],
    };
  }

  async getFulfillmentStatus(podOrderId) {
    if (!this.isConfigured()) return this.notConfigured("getFulfillmentStatus");
    return {
      ok: false,
      provider: this.provider,
      status: CONNECTION_STATUS.NEEDS_AUTH,
      message: "Printify status polling is not implemented yet.",
      plannedSteps: [{ step: "get_order", method: "GET", path: `/shops/${this.shopId}/orders/${podOrderId}.json` }],
    };
  }
}

module.exports = { PrintifyAdapterPlaceholder };
