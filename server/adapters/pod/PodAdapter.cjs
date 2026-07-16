const { CONNECTION_STATUS } = require("../../engine/status.cjs");

// Auto Farmland owns the marketplace listing. A POD provider only fulfills
// AFTER a real order happens. A PodAdapter is the boundary to one print-on-
// demand provider (Printful, Printify, Gelato, ...).
//
// Contract (all async, honest result objects, never fake success):
//   validateConnection(account)                 -> ConnectionStatus
//   validateArtwork(design, preset)             -> ValidationResult
//   createFulfillmentOrder(order, ctx)          -> PodOrderResult
//   getFulfillmentStatus(podOrderId, ctx)       -> PodStatusResult
//   handleWebhook(payload)                      -> WebhookResult
class PodAdapter {
  constructor(provider) {
    this.provider = provider;
  }

  isConfigured() {
    return false;
  }

  notConfigured(action, detail) {
    return {
      ok: false,
      provider: this.provider,
      action,
      status: CONNECTION_STATUS.NOT_CONFIGURED,
      message:
        detail ||
        `${this.provider} POD adapter is not configured. Add its credentials to .env.local.`,
    };
  }

  async validateConnection() {
    return {
      ok: false,
      provider: this.provider,
      status: CONNECTION_STATUS.NOT_CONFIGURED,
      message: `${this.provider} POD adapter has no connection check yet.`,
    };
  }

  async validateArtwork() {
    return this.notConfigured("validateArtwork");
  }

  async createFulfillmentOrder() {
    return this.notConfigured("createFulfillmentOrder");
  }

  async getFulfillmentStatus() {
    return this.notConfigured("getFulfillmentStatus");
  }

  async handleWebhook() {
    return this.notConfigured("handleWebhook");
  }
}

module.exports = { PodAdapter };
