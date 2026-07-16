// Auto Farmland — channel / land registry.
//
// A LAND (channel) is where output grows, gets discovered, and earns.
// A CROP is a repeatable output type that grows in one or more lands.
// An ADAPTER is how Auto Farmland publishes/tracks a land (may be manual).
//
// Blocked or waiting lands are MODELLED, never deleted — the app should be
// able to explain why work is starting in Blog Land instead of eBay.

const CHANNEL_STATUS = {
  READY_TO_START: "ready_to_start",
  ACTIVE: "active",
  SETUP_NEEDED: "setup_needed",
  APPROVAL_PENDING: "approval_pending",
  DEVELOPER_ACCOUNT_BLOCKED: "developer_account_blocked",
  NOT_STARTED: "not_started",
  PLANNED: "planned",
  PAUSED: "paused",
  // Etsy Personal Access ladder (the app was granted Personal Access — we can
  // test against our own shop, draft-only, no public multi-seller flow):
  PERSONAL_ACCESS_READY_FOR_OAUTH: "personal_access_ready_for_oauth",
  ETSY_CREDENTIALS_PRESENT: "etsy_credentials_present",
  ETSY_CONNECTED: "etsy_connected",
  ETSY_READY_FOR_DRAFT_TEST: "etsy_ready_for_draft_test",
};

const CHANNEL_STATUSES = Object.values(CHANNEL_STATUS);

// Seed registry. Stored into data.channels on first migration; user edits are
// preserved afterwards (new registry entries are unioned in by key).
const CHANNEL_REGISTRY = [
  {
    key: "blog",
    name: "Blog Land",
    kind: "content",
    priority: 1,
    status: CHANNEL_STATUS.READY_TO_START,
    reason: "No API approval needed. Local draft pipeline + markdown export work today.",
    crops: ["blog_post", "seo_guide", "how_to", "comparison", "resource_page", "product_landing_page"],
  },
  {
    key: "printful_pod",
    name: "Printful → eBay Land",
    kind: "physical_product",
    priority: 2,
    status: CHANNEL_STATUS.SETUP_NEEDED,
    reason: "Printful's official eBay integration carries POD products to eBay without our own eBay developer account. Needs a Printful account + eBay store connection.",
    crops: ["sticker", "pod_merch"],
  },
  {
    key: "ebay_direct",
    name: "eBay (direct API)",
    kind: "marketplace",
    priority: 8,
    status: CHANNEL_STATUS.DEVELOPER_ACCOUNT_BLOCKED,
    reason: "eBay Developer Program registration was rejected. Adapter is retained for later; use the Printful-mediated lane meanwhile.",
    crops: ["sticker", "pod_merch"],
  },
  {
    key: "etsy",
    name: "Etsy Land",
    kind: "marketplace",
    priority: 5,
    status: CHANNEL_STATUS.APPROVAL_PENDING,
    reason: "Etsy app approval is pending. Legacy Etsy studio still prepares local packages.",
    crops: ["digital_download", "printable", "sticker"],
  },
  {
    key: "gumroad",
    name: "Gumroad Land",
    kind: "digital_product",
    priority: 3,
    status: CHANNEL_STATUS.NOT_STARTED,
    reason: "Planned for digital goods (sticker packs, printables, templates, asset packs). Not the first channel.",
    crops: ["digital_sticker_pack", "printable_pdf", "notion_template", "asset_pack"],
  },
  {
    key: "pinterest",
    name: "Pinterest Land",
    kind: "discovery",
    priority: 4,
    status: CHANNEL_STATUS.PLANNED,
    reason: "Repurposing target for blog posts and product images (pins).",
    crops: ["pin"],
  },
  {
    key: "tiktok",
    name: "TikTok Land",
    kind: "video",
    priority: 9,
    status: CHANNEL_STATUS.PLANNED,
    reason: "Later — depends on content/discovery investment.",
    crops: ["short_video"],
  },
  {
    key: "youtube_shorts",
    name: "YouTube Shorts Land",
    kind: "video",
    priority: 9,
    status: CHANNEL_STATUS.PLANNED,
    reason: "Later — repurposing target for guides.",
    crops: ["short_video"],
  },
  {
    key: "newsletter",
    name: "Newsletter Land",
    kind: "content",
    priority: 6,
    status: CHANNEL_STATUS.PLANNED,
    reason: "Later — compounding channel fed by blog content.",
    crops: ["newsletter_issue"],
  },
  {
    key: "affiliate",
    name: "Affiliate Land",
    kind: "monetization",
    priority: 6,
    status: CHANNEL_STATUS.PLANNED,
    reason: "Later — affiliate/resource pages layered onto Blog Land.",
    crops: ["affiliate_page", "resource_page"],
  },
  {
    key: "micro_tools",
    name: "Micro-tools Land",
    kind: "tool",
    priority: 7,
    status: CHANNEL_STATUS.PLANNED,
    reason: "Later — calculators and tiny utility pages.",
    crops: ["calculator", "micro_app"],
  },
  {
    key: "amazon_seller",
    name: "Amazon Seller Central",
    kind: "marketplace",
    priority: 10,
    status: CHANNEL_STATUS.PLANNED,
    reason: "Possible advanced adapter much later.",
    crops: ["pod_merch"],
  },
];

module.exports = { CHANNEL_STATUS, CHANNEL_STATUSES, CHANNEL_REGISTRY };
