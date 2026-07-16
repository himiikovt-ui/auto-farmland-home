const { MarketplaceAdapter } = require("./MarketplaceAdapter.cjs");
const { CONNECTION_STATUS } = require("../../engine/status.cjs");

// Etsy marketplace adapter — Personal Access edition.
//
// The Etsy app was granted PERSONAL ACCESS: it may act only on the app
// owner's own shop. This adapter never builds a public multi-seller flow.
// Draft-only in this pass: creating an ACTIVE listing is deliberately not
// implemented anywhere.
//
// All Etsy v3 calls live in server/etsyClient.cjs; the draft-test routes live
// in server/engine/etsyRoutes.cjs. This adapter reports honest connection
// state to the Channels board — it never claims "connected" without a real
// token, and a stored token is reported as exactly that (a live check is a
// separate, explicit action).
class EtsyAdapter extends MarketplaceAdapter {
  constructor(options = {}) {
    super("etsy");
    this.keystring = options.keystring || "";
    this.sharedSecret = options.sharedSecret || "";
    this.redirectUri = options.redirectUri || "";
    this.accessLevel = options.accessLevel || "personal";
    // Injected so the adapter can see whether OAuth tokens exist without
    // owning secret storage (index.cjs owns the secrets folder).
    this.getAuth = options.getAuth || (() => null);
  }

  hasCredentials() {
    return Boolean(this.keystring && this.sharedSecret && this.redirectUri);
  }

  isConfigured() {
    const auth = this.getAuth();
    return this.hasCredentials() && Boolean(auth && auth.refreshToken);
  }

  configState() {
    const missing = [
      !this.keystring && "ETSY_KEYSTRING",
      !this.sharedSecret && "ETSY_SHARED_SECRET",
      !this.redirectUri && "ETSY_REDIRECT_URI",
    ].filter(Boolean);
    if (missing.length === 3) {
      return {
        status: CONNECTION_STATUS.NOT_CONFIGURED,
        missing,
        message: "Add the Etsy Personal Access credentials to .env.local.",
      };
    }
    if (missing.length) {
      return {
        status: CONNECTION_STATUS.MISSING_CREDENTIALS,
        missing,
        message: `Add ${missing.join(", ")} to .env.local.`,
      };
    }
    const auth = this.getAuth();
    if (!auth || !auth.refreshToken) {
      return {
        status: "oauth_required",
        missing: [],
        message:
          "Personal Access credentials present. Connect Etsy (OAuth + PKCE) to authorize your own shop.",
      };
    }
    const expired = new Date(auth.expiresAt || 0).getTime() < Date.now();
    return {
      status: "token_stored",
      missing: [],
      message: `OAuth tokens stored (access token ${expired ? "expired — will refresh on next call" : `valid until ${auth.expiresAt}`}). Run Test Connection for a live check. Draft-only mode.`,
    };
  }

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

  async validateConnection() {
    const state = this.configState();
    return {
      ok: false, // never claim a live connection without a live check
      platform: this.platform,
      status: state.status,
      accessLevel: this.accessLevel,
      missing: state.missing,
      message: state.message,
    };
  }
}

module.exports = { EtsyAdapter };
