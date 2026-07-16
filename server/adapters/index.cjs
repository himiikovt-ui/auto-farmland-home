const { EbayAdapter } = require("./marketplaces/ebayAdapter.cjs");
const { EtsyAdapter } = require("./marketplaces/etsyAdapter.cjs");
const { GumroadAdapterPlaceholder } = require("./marketplaces/gumroadAdapter.placeholder.cjs");
const { PrintifyAdapterPlaceholder } = require("./pod/printifyAdapter.placeholder.cjs");
const { PrintfulAdapterPlaceholder } = require("./pod/printfulAdapter.placeholder.cjs");
const { GelatoAdapterPlaceholder } = require("./pod/gelatoAdapter.placeholder.cjs");
const { WordpressAdapterPlaceholder } = require("./blog/wordpressAdapter.placeholder.cjs");
const { GhostAdapterPlaceholder } = require("./blog/ghostAdapter.placeholder.cjs");

// Build the marketplace + POD + blog adapter registries from environment
// placeholders. Credentials never live in code — only process.env, sourced
// from .env.local. `hooks` lets index.cjs inject secret-store readers (e.g.
// whether an Etsy OAuth token exists) without adapters owning secret files.
function createAdapterRegistry(env = process.env, hooks = {}) {
  const marketplaces = {
    ebay: new EbayAdapter({
      env: env.EBAY_ENV || "sandbox",
      clientId: env.EBAY_CLIENT_ID,
      clientSecret: env.EBAY_CLIENT_SECRET,
      redirectUri: env.EBAY_REDIRECT_URI,
      refreshToken: env.EBAY_REFRESH_TOKEN,
      marketplaceId: env.EBAY_MARKETPLACE_ID || "EBAY_US",
      // The eBay Developer Program registration was rejected. Until that
      // changes (set EBAY_DEVELOPER_ACCESS=granted), the adapter reports
      // developer_account_blocked and the Printful-mediated lane is the
      // practical eBay path.
      developerAccess: env.EBAY_DEVELOPER_ACCESS || "blocked",
    }),
    etsy: new EtsyAdapter({
      keystring: env.ETSY_KEYSTRING,
      sharedSecret: env.ETSY_SHARED_SECRET,
      redirectUri: env.ETSY_REDIRECT_URI,
      accessLevel: env.ETSY_ACCESS_LEVEL || "personal",
      getAuth: hooks.getEtsyAuth,
    }),
    gumroad: new GumroadAdapterPlaceholder(),
  };

  const pod = {
    printful: new PrintfulAdapterPlaceholder({ apiToken: env.PRINTFUL_API_TOKEN }),
    printify: new PrintifyAdapterPlaceholder({
      apiToken: env.PRINTIFY_API_TOKEN,
      shopId: env.PRINTIFY_SHOP_ID,
    }),
    gelato: new GelatoAdapterPlaceholder({ apiKey: env.GELATO_API_KEY }),
  };

  const blog = {
    wordpress: new WordpressAdapterPlaceholder({
      baseUrl: env.WORDPRESS_BASE_URL,
      username: env.WORDPRESS_USERNAME,
      appPassword: env.WORDPRESS_APP_PASSWORD,
    }),
    ghost: new GhostAdapterPlaceholder({
      apiUrl: env.GHOST_ADMIN_API_URL,
      apiKey: env.GHOST_ADMIN_API_KEY,
    }),
  };

  return {
    marketplaces,
    pod,
    blog,
    getMarketplace(platform) {
      return marketplaces[platform] || null;
    },
    getPod(provider) {
      return pod[provider] || null;
    },
    getBlogPublisher(target) {
      return blog[target] || null;
    },
  };
}

module.exports = { createAdapterRegistry };
