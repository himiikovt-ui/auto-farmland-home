const { BlogPublishAdapter } = require("./BlogPublishAdapter.cjs");

// Ghost blog adapter — placeholder seam.
// Env placeholders: GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY.
class GhostAdapterPlaceholder extends BlogPublishAdapter {
  constructor(options = {}) {
    super("ghost");
    this.apiUrl = options.apiUrl || "";
    this.apiKey = options.apiKey || "";
  }

  isConfigured() {
    return Boolean(this.apiUrl && this.apiKey);
  }

  async validateConnection() {
    return {
      ok: false,
      target: this.target,
      status: this.isConfigured() ? "needs_auth" : "not_configured",
      message: this.isConfigured()
        ? "Ghost credentials found. Live publishing is not implemented yet."
        : "Add GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY to .env.local to configure Ghost.",
    };
  }
}

module.exports = { GhostAdapterPlaceholder };
