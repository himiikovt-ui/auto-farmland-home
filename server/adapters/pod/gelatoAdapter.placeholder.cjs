const { PodAdapter } = require("./PodAdapter.cjs");

// Gelato POD provider — placeholder seam. Env placeholder: GELATO_API_KEY.
class GelatoAdapterPlaceholder extends PodAdapter {
  constructor(options = {}) {
    super("gelato");
    this.apiKey = options.apiKey || "";
    this.baseUrl = "https://order.gelatoapis.com";
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async validateConnection() {
    return {
      ok: false,
      provider: this.provider,
      status: this.apiKey ? "needs_auth" : "not_configured",
      message: this.apiKey
        ? "Gelato key found. A live connection check has not run yet."
        : "Add GELATO_API_KEY to .env.local to configure Gelato.",
    };
  }
}

module.exports = { GelatoAdapterPlaceholder };
