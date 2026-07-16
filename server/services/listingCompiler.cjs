const { LISTING_STATUS, isDesignApproved } = require("../engine/status.cjs");

// Listing Compiler: (approved design + product preset) -> draft listing.
// Deterministic and editable. NEVER publishes. Produces a listing record the
// operator can review and edit before it is sent to any marketplace adapter.

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Fill {tokens} from a context map. Unknown tokens are left visible so the
// operator notices missing data instead of getting silent blanks.
function renderTemplate(template, context) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) =>
    context[key] != null && context[key] !== "" ? String(context[key]) : match
  );
}

function renderSpecifics(template, context) {
  const out = {};
  Object.entries(template || {}).forEach(([key, value]) => {
    out[key] = renderTemplate(value, context);
  });
  return out;
}

// Deterministic SKU: preset short code + design id tail. Stable per design.
function buildSku(preset, design) {
  const platform = (preset.platform || "gen").slice(0, 3).toUpperCase();
  const type = (preset.productType || "prod").slice(0, 3).toUpperCase();
  const tail = String(design.id || makeId("d")).replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase();
  return `${platform}-${type}-${tail}`;
}

function priceFromPreset(preset) {
  const base = Number(preset.price || 0);
  const rounding = preset.marginRules && preset.marginRules.roundEndings;
  if (base > 0 && rounding != null) {
    return Math.max(0, Math.floor(base) + Number(rounding));
  }
  return base;
}

// design: a design asset record. preset: a product preset. account: optional
// marketplace account (for marketplaceAccountId + default policies).
function compileListing({ design, preset, account, crop }) {
  if (!design) throw new Error("compileListing requires a design.");
  if (!preset) throw new Error("compileListing requires a product preset.");
  if (!isDesignApproved(design)) {
    throw new Error("Only approved designs can be compiled into a listing.");
  }

  const designName = (crop && crop.name) || design.fileName || "Design";
  const niche = (crop && crop.niche) || "";
  const context = { design_name: designName, niche, product_type: preset.productType };

  const sku = buildSku(preset, design);
  const kill = new Date();
  kill.setDate(kill.getDate() + 60);

  return {
    id: makeId("listing"),
    designId: design.id,
    presetId: preset.id,
    platform: preset.platform,
    marketplaceAccountId: account ? account.id : "",
    sku,
    title: renderTemplate(preset.defaultTitleTemplate, context).slice(0, 80),
    description: renderTemplate(preset.descriptionTemplate, context),
    tagsOrKeywords: [niche, preset.productType, "sticker", "decal"].filter(Boolean),
    categoryId: preset.categoryId || "",
    itemSpecifics: renderSpecifics(preset.itemSpecificsTemplate, context),
    price: priceFromPreset(preset),
    quantity: Number(preset.quantity || 1),
    mockupImages: design.publicUrl ? [design.publicUrl] : [],
    // Design status and listing status stay separate. A freshly compiled
    // listing is a DRAFT; the design remains "approved" independently.
    status: LISTING_STATUS.DRAFT,
    platformListingId: "",
    platformOfferId: "",
    publishedUrl: "",
    publishedAt: "",
    killReviewDate: kill.toISOString(),
    lastDecision: "",
    decisionReason: "",
    decisionAt: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

module.exports = { compileListing, renderTemplate, buildSku };
