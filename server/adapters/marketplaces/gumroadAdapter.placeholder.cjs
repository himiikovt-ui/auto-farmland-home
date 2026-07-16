const { MarketplaceAdapter } = require("./MarketplaceAdapter.cjs");

// Gumroad is the planned NEXT adapter after eBay POD stickers — for digital
// products (no POD fulfillment needed). Placeholder seam only.
class GumroadAdapterPlaceholder extends MarketplaceAdapter {
  constructor() {
    super("gumroad");
  }

  isConfigured() {
    return false;
  }

  async validateConnection() {
    return {
      ok: false,
      platform: this.platform,
      status: "not_configured",
      message:
        "Gumroad is the planned next land (digital products). Add GUMROAD_ACCESS_TOKEN to .env.local when ready.",
    };
  }
}

module.exports = { GumroadAdapterPlaceholder };
