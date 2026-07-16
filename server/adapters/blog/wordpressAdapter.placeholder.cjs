const { BlogPublishAdapter } = require("./BlogPublishAdapter.cjs");
const { CONNECTION_STATUS } = require("../../engine/status.cjs");

// WordPress blog adapter — the most likely first real blog publisher.
// Env placeholders (real values in .env.local, ignored):
//   WORDPRESS_BASE_URL       e.g. https://myblog.com
//   WORDPRESS_USERNAME
//   WORDPRESS_APP_PASSWORD   (Application Password, not the login password)
class WordpressAdapterPlaceholder extends BlogPublishAdapter {
  constructor(options = {}) {
    super("wordpress");
    this.baseUrl = options.baseUrl || "";
    this.username = options.username || "";
    this.appPassword = options.appPassword || "";
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.username && this.appPassword);
  }

  configState() {
    const missing = [
      !this.baseUrl && "WORDPRESS_BASE_URL",
      !this.username && "WORDPRESS_USERNAME",
      !this.appPassword && "WORDPRESS_APP_PASSWORD",
    ].filter(Boolean);
    let status = CONNECTION_STATUS.NEEDS_AUTH;
    if (missing.length === 3) status = CONNECTION_STATUS.NOT_CONFIGURED;
    else if (missing.length) status = CONNECTION_STATUS.MISSING_CREDENTIALS;
    return {
      status,
      missing,
      message: missing.length
        ? `Add ${missing.join(", ")} to .env.local to configure WordPress publishing.`
        : "WordPress credentials found. Live publishing is not implemented yet — no fake posts are created.",
    };
  }

  async validateConnection() {
    const state = this.configState();
    return { ok: false, target: this.target, status: state.status, missing: state.missing, message: state.message };
  }

  async publishPost(post) {
    const state = this.configState();
    return {
      ok: false,
      target: this.target,
      status: state.status,
      message: state.message,
      plannedSteps: [
        { step: "create_post", method: "POST", path: "/wp-json/wp/v2/posts", slug: post?.slug || "<slug>" },
      ],
    };
  }
}

module.exports = { WordpressAdapterPlaceholder };
