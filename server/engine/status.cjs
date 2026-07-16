// Auto Farmland — engine status vocabulary.
//
// Design status and marketplace listing status are deliberately kept SEPARATE.
// A design can be approved (accepted for product/listing use) long before any
// listing is created or published. Do not collapse the two.

// --- Design asset lifecycle ------------------------------------------------
const DESIGN_STATUS = {
  GENERATED: "generated",
  REVIEW: "review",
  APPROVED: "approved",
  REJECTED: "rejected",
  NEEDS_EDIT: "needs_edit",
  REMIX_REQUESTED: "remix_requested",
  ARCHIVED: "archived",
};

const DESIGN_STATUSES = Object.values(DESIGN_STATUS);

// Legacy asset statuses that predate the engine. They are mapped, never
// destroyed, so the older Etsy flow keeps working while the engine reads a
// single clear vocabulary. "final" and "approved" are merged conceptually:
// approval means "accepted for product/listing use".
const LEGACY_DESIGN_STATUS_MAP = {
  final: DESIGN_STATUS.APPROVED,
  live: DESIGN_STATUS.APPROVED,
  generating: DESIGN_STATUS.GENERATED,
  awaiting_import: DESIGN_STATUS.GENERATED,
};

// "reference" assets are inputs for generation, not reviewable designs.
function isReferenceAsset(asset) {
  return Boolean(asset && (asset.isReference || asset.status === "reference"));
}

function normalizeDesignStatus(status) {
  if (!status) return DESIGN_STATUS.GENERATED;
  if (DESIGN_STATUSES.includes(status)) return status;
  return LEGACY_DESIGN_STATUS_MAP[status] || DESIGN_STATUS.REVIEW;
}

// A design that is accepted for listing use.
function isDesignApproved(asset) {
  return normalizeDesignStatus(asset && asset.status) === DESIGN_STATUS.APPROVED;
}

// --- Marketplace listing lifecycle -----------------------------------------
const LISTING_STATUS = {
  DRAFT: "draft",
  READY_TO_PUBLISH: "ready_to_publish",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  PUBLISH_FAILED: "publish_failed",
  ACTIVE: "active",
  NEEDS_ATTENTION: "needs_attention",
  ENDED: "ended",
  KILLED: "killed",
  ARCHIVED: "archived",
};

const LISTING_STATUSES = Object.values(LISTING_STATUS);

// Listings that are meant to be earning right now.
const LIVE_LISTING_STATUSES = [LISTING_STATUS.PUBLISHED, LISTING_STATUS.ACTIVE];

// --- Adapter / connection statuses -----------------------------------------
// Honest states only. Never report "connected" unless the adapter proved it.
const CONNECTION_STATUS = {
  NOT_CONFIGURED: "not_configured",
  MISSING_CREDENTIALS: "missing_credentials",
  NEEDS_AUTH: "needs_auth",
  CONNECTED: "connected",
  ERROR: "error",
  // The platform itself refuses us (e.g. eBay Developer Program rejection).
  // Configuration alone cannot fix this state.
  DEVELOPER_ACCOUNT_BLOCKED: "developer_account_blocked",
};

// --- Order lifecycle -------------------------------------------------------
const ORDER_STATUS = {
  NEW: "new",
  MATCHED: "matched",
  FULFILLMENT_REQUESTED: "fulfillment_requested",
  IN_PRODUCTION: "in_production",
  SHIPPED: "shipped",
  TRACKING_UPLOADED: "tracking_uploaded",
  DELIVERED: "delivered",
  NEEDS_ATTENTION: "needs_attention",
  CANCELLED: "cancelled",
};

// --- 60-day decisions ------------------------------------------------------
const DECISION = {
  KEEP: "keep",
  KILL: "kill",
  REMIX: "remix",
  BUNDLE: "bundle",
  REVISE_TITLE: "revise_title",
  REVISE_PRICE: "revise_price",
  REVISE_MOCKUP: "revise_mockup",
  ARCHIVE: "archive",
};

const DECISIONS = Object.values(DECISION);

// --- Blog post lifecycle (Blog Land — priority 1 channel) -------------------
const BLOG_STATUS = {
  IDEA: "idea",
  OUTLINE: "outline",
  DRAFT: "draft",
  NEEDS_REVIEW: "needs_review",
  APPROVED: "approved",
  READY_TO_PUBLISH: "ready_to_publish",
  PUBLISHED: "published",
  NEEDS_UPDATE: "needs_update",
  ARCHIVED: "archived",
};

const BLOG_STATUSES = Object.values(BLOG_STATUS);

// Blog decisions include repurposing paths — a post is also a seed for pins,
// printables, digital products, and product listings.
const BLOG_DECISION = {
  KEEP: "keep",
  UPDATE: "update",
  EXPAND: "expand",
  TURN_INTO_PINTEREST_PINS: "turn_into_pinterest_pins",
  TURN_INTO_GUMROAD_PRODUCT: "turn_into_gumroad_product",
  TURN_INTO_PRINTABLE: "turn_into_printable",
  TURN_INTO_VIDEO: "turn_into_video",
  TURN_INTO_PRODUCT_LISTING: "turn_into_product_listing",
  ARCHIVE: "archive",
};

const BLOG_DECISIONS = Object.values(BLOG_DECISION);

// --- POD product plan lifecycle (Printful-mediated eBay Land) ---------------
// This is a MANUAL/semi-automated lane by design: Auto Farmland prepares
// everything; Printful's own eBay integration carries the product to eBay.
// Statuses describe where the product really is — no step is auto-claimed.
const POD_PLAN_STATUS = {
  DRAFT: "draft",
  READY_FOR_PRINTFUL: "ready_for_printful",
  UPLOADED_TO_PRINTFUL: "uploaded_to_printful",
  SYNCED_TO_EBAY: "synced_to_ebay",
  ACTIVE_ON_EBAY: "active_on_ebay",
  NEEDS_ATTENTION: "needs_attention",
  ARCHIVED: "archived",
};

const POD_PLAN_STATUSES = Object.values(POD_PLAN_STATUS);

module.exports = {
  DESIGN_STATUS,
  DESIGN_STATUSES,
  LEGACY_DESIGN_STATUS_MAP,
  isReferenceAsset,
  normalizeDesignStatus,
  isDesignApproved,
  LISTING_STATUS,
  LISTING_STATUSES,
  LIVE_LISTING_STATUSES,
  CONNECTION_STATUS,
  ORDER_STATUS,
  DECISION,
  DECISIONS,
  BLOG_STATUS,
  BLOG_STATUSES,
  BLOG_DECISION,
  BLOG_DECISIONS,
  POD_PLAN_STATUS,
  POD_PLAN_STATUSES,
};
