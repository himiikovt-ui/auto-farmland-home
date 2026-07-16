const { CONNECTION_STATUS } = require("../../engine/status.cjs");

// Auto Farmland owns the listing. A MarketplaceAdapter is the boundary between
// the engine and one selling platform (eBay, Etsy, Gumroad, ...). The engine
// never talks to a platform directly — it goes through this interface so the
// architecture stays platform-agnostic.
//
// Contract (all async, all return honest, serialisable result objects — never
// throw for an expected "not configured" state, never fake success):
//
//   validateConnection(account)              -> ConnectionStatus
//   validateListingDraft(listing, ctx)       -> ValidationResult
//   publishListing(listing, ctx)             -> PublishResult
//   reviseListing(listing, ctx)              -> ReviseResult
//   endListing(listing, ctx)                 -> EndResult
//   syncOrders(account, ctx)                 -> OrderSyncResult
//   uploadTracking(order, ctx)               -> TrackingResult
//   syncMetrics(account, dateRange, ctx)     -> MetricsSyncResult
//
// `ctx` carries resolved records the adapter may need (design, preset, etc.)
// so adapters never reach into the data store themselves.
class MarketplaceAdapter {
  constructor(platform) {
    this.platform = platform;
  }

  // Subclasses override. Base is honest: nothing is configured.
  isConfigured() {
    return false;
  }

  // A shared, honest "we can't do this yet" result. status is one of
  // CONNECTION_STATUS. Never claim success.
  notConfigured(action, detail) {
    return {
      ok: false,
      platform: this.platform,
      action,
      status: this.isConfigured()
        ? CONNECTION_STATUS.NEEDS_AUTH
        : CONNECTION_STATUS.NOT_CONFIGURED,
      message:
        detail ||
        `${this.platform} adapter is not configured. Add its credentials to .env.local.`,
    };
  }

  async validateConnection() {
    return {
      ok: false,
      platform: this.platform,
      status: CONNECTION_STATUS.NOT_CONFIGURED,
      message: `${this.platform} adapter has no connection check yet.`,
    };
  }

  async validateListingDraft() {
    return this.notConfigured("validateListingDraft");
  }

  async publishListing() {
    return this.notConfigured("publishListing");
  }

  async reviseListing() {
    return this.notConfigured("reviseListing");
  }

  async endListing() {
    return this.notConfigured("endListing");
  }

  async syncOrders() {
    return this.notConfigured("syncOrders");
  }

  async uploadTracking() {
    return this.notConfigured("uploadTracking");
  }

  async syncMetrics() {
    return this.notConfigured("syncMetrics");
  }
}

module.exports = { MarketplaceAdapter };
