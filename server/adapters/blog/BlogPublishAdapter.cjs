const { CONNECTION_STATUS } = require("../../engine/status.cjs");

// Blog Land publish boundary. Blog Land works TODAY without any of these —
// the local pipeline (draft → review → approve → markdown/HTML export) is the
// v1 path. These adapters are the seam where real publishing lands later:
//
//   wordpress   REST API (application password)
//   ghost       Admin API
//   webflow     CMS API (future)
//   static_site export handled locally (markdown files already work)
//
// Contract (honest results, never fake success):
//   validateConnection()      -> ConnectionStatus
//   publishPost(post, ctx)    -> PublishResult
class BlogPublishAdapter {
  constructor(target) {
    this.target = target;
  }

  isConfigured() {
    return false;
  }

  notConfigured(action, detail) {
    return {
      ok: false,
      target: this.target,
      action,
      status: CONNECTION_STATUS.NOT_CONFIGURED,
      message:
        detail ||
        `${this.target} blog adapter is not configured. Blog Land still works locally — use markdown export.`,
    };
  }

  async validateConnection() {
    return {
      ok: false,
      target: this.target,
      status: CONNECTION_STATUS.NOT_CONFIGURED,
      message: `${this.target} blog adapter is not configured yet.`,
    };
  }

  async publishPost() {
    return this.notConfigured("publishPost");
  }
}

module.exports = { BlogPublishAdapter };
