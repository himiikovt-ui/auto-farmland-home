const { PodAdapter } = require("./PodAdapter.cjs");

// Printful POD provider — placeholder seam. Env placeholder: PRINTFUL_API_TOKEN.
//
// Printful is currently the PRACTICAL eBay path: its official eBay store
// integration puts POD products on eBay without our own (blocked) eBay
// developer account. The manual/semi-automated lane lives in POD Land
// (podProductPlans); this adapter becomes the automation seam later.
class PrintfulAdapterPlaceholder extends PodAdapter {
  constructor(options = {}) {
    super("printful");
    this.apiToken = options.apiToken || "";
    this.baseUrl = "https://api.printful.com";
  }

  isConfigured() {
    return Boolean(this.apiToken);
  }

  async validateConnection() {
    return {
      ok: false,
      provider: this.provider,
      status: this.apiToken ? "needs_auth" : "not_configured",
      message: this.apiToken
        ? "Printful token found. A live connection check has not run yet."
        : "Add PRINTFUL_API_TOKEN to .env.local. Until then, POD Land tracks the Printful → eBay flow as a manual checklist.",
    };
  }
}

module.exports = { PrintfulAdapterPlaceholder };
