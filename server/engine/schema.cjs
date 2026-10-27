const { CONNECTION_STATUS } = require("./status.cjs");
const { CHANNEL_REGISTRY } = require("./channels.cjs");
const { ensureAutomationData } = require("../automation/policy.cjs");
const { normalizeCreativeStrategy } = require("../automation/creativeStrategy.cjs");
const { ensureProjects } = require("./projects.cjs");

// Auto Farmland engine schema — additive, non-destructive migration.
//
// Storage is injected by the server (SQLite in production/local use). This
// module adds the engine's collections WITHOUT touching existing data:
//
//   productPresets       reusable listing templates (v1: eBay POD Sticker)
//   marketplaceAccounts  one row per selling land connection (v1: eBay)
//   podAccounts          one row per POD provider connection
//   listings             engine listings (distinct from legacy listingDrafts)
//   orders               marketplace orders routed to POD fulfillment
//   listingMetricsDaily  daily performance rows per listing
//   decisions            60-day keep/kill/remix decision log
//
// Existing `assets` are the engine's design assets and `batches` are design
// batches — we only ensure the new engine fields exist on them, never rewrite
// their status.

function nowIso() {
  return new Date().toISOString();
}

// Seeding writes many records in one tick, so ids get a counter instead of
// relying on Date.now() + random to stay unique.
let seedSequence = 0;
function makeSeedId(prefix) {
  seedSequence += 1;
  return `${prefix}-${Date.now()}-${seedSequence}`;
}

// The first product preset: eBay POD Sticker. Values that would come from a
// real eBay account (policies, location, category) are intentionally blank so
// nothing pretends to be configured.
function seedEbayStickerPreset() {
  return {
    id: "preset-ebay-pod-sticker",
    name: "eBay POD Sticker",
    platform: "ebay",
    productType: "sticker",
    categoryId: "", // e.g. eBay "Decals & Stickers" leaf category id
    condition: "NEW",
    defaultTitleTemplate: "{design_name} Sticker | Waterproof Vinyl Decal | {niche}",
    descriptionTemplate:
      "High-quality waterproof vinyl {design_name} sticker.\n\n• Durable, weatherproof, and fade-resistant\n• Great for laptops, water bottles, journals, and more\n• Printed on demand just for your order\n\nDesigned in-house. Ships from our print partner.",
    itemSpecificsTemplate: {
      Brand: "Unbranded",
      Type: "Sticker/Decal",
      Material: "Vinyl",
      Theme: "{niche}",
      Finish: "Matte",
    },
    price: 4.99,
    quantity: 25,
    sizeVariations: ["3in", "4in", "5.5in"],
    shippingPolicyId: "",
    paymentPolicyId: "",
    returnPolicyId: "",
    inventoryLocationKey: "",
    podProvider: "printify",
    podVariantIds: [], // map size variations -> POD provider variant ids
    productionCost: 1.6,
    shippingCostEstimate: 0.85,
    marginRules: { minMarginPct: 45, roundEndings: 0.99 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

// Current Etsy seller-taxonomy leaf ids verified through the configured Etsy
// API. Keeping the human-readable path beside the id makes later taxonomy
// audits possible without guessing what a number meant.
const ETSY_DIGITAL_PRESETS = [
  {
    id: "preset-etsy-journal-template",
    name: "Etsy Printable Journal Page",
    platform: "etsy",
    productType: "printable",
    supportedProductTypes: ["printable", "journal_page"],
    listingType: "download",
    taxonomyId: "12475",
    taxonomyPath: "Paper & Party Supplies > Paper > Stationery > Design & Templates > Templates > Journal Templates",
    defaultTitleTemplate: "{design_name} | Printable Journal Page | Instant Download",
    descriptionTemplate: "An original printable journal page prepared as a high-resolution digital download. No physical item is shipped.",
    price: 2,
    quantity: 1,
    whoMade: "i_did",
    whenMade: "2020_2026",
    tags: [
      "journaling pages", "printable journal", "journal printable", "writing paper",
      "pastoral journal", "digital download", "instant download", "journal page",
      "letter size", "nature journal", "scrapbook paper", "planner insert", "journal template",
    ],
  },
  {
    id: "preset-etsy-digital-wall-art",
    name: "Etsy Digital Wall Art",
    platform: "etsy",
    productType: "digital_download",
    supportedProductTypes: ["digital_download", "wall_art"],
    listingType: "download",
    taxonomyId: "2078",
    taxonomyPath: "Art & Collectibles > Prints > Digital Prints",
    defaultTitleTemplate: "{design_name} | Printable Wall Art | Digital Download",
    descriptionTemplate: "Original printable wall art supplied as a high-resolution digital download. No physical item is shipped.",
    price: 7.5,
    quantity: 1,
    whoMade: "i_did",
    whenMade: "2020_2026",
    tags: [
      "printable wall art", "digital print", "instant download", "printable art",
      "cozy home decor", "gallery wall art", "digital wall art", "art print",
      "home decor print", "wall decor", "downloadable art", "print at home", "gift for home",
    ],
  },
  {
    id: "preset-etsy-digital-stickers",
    name: "Etsy Digital Sticker Sheet",
    platform: "etsy",
    productType: "sticker_sheet",
    supportedProductTypes: ["sticker_sheet", "sticker"],
    listingType: "download",
    taxonomyId: "1326",
    taxonomyPath: "Paper & Party Supplies > Paper > Stickers, Labels & Tags > Stickers",
    defaultTitleTemplate: "{design_name} | Printable Sticker Sheet | Digital Download",
    descriptionTemplate: "An original printable sticker sheet supplied as a digital download. No physical item is shipped.",
    price: 2.5,
    quantity: 1,
    whoMade: "i_did",
    whenMade: "2020_2026",
    tags: [
      "printable stickers", "digital stickers", "sticker sheet", "journal stickers",
      "planner stickers", "instant download", "sticker printable", "digital download",
      "scrapbook stickers", "cute stickers", "print at home", "planner supplies", "journal supplies",
    ],
  },
];

function mergeTags(...tagLists) {
  const seen = new Set();
  return tagLists
    .flat()
    .map((tag) => String(tag || "").trim().slice(0, 20))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 13);
}

function presetForCrop(data, crop) {
  const requestedId = crop?.etsyPresetId;
  const etsyPresets = (data.productPresets || []).filter((preset) => preset.platform === "etsy" && preset.listingType === "download");
  return etsyPresets.find((preset) => preset.id === requestedId)
    || etsyPresets.find((preset) => (preset.supportedProductTypes || [preset.productType]).includes(crop?.productType))
    || null;
}

function seedEbayAccount() {
  return {
    id: "mkt-ebay-main",
    platform: "ebay",
    name: "eBay Store (primary)",
    // Honest: nothing is connected until credentials + OAuth are present.
    status: CONNECTION_STATUS.NOT_CONFIGURED,
    env: process.env.EBAY_ENV || "sandbox",
    marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
    defaultPolicies: {
      shippingPolicyId: "",
      paymentPolicyId: "",
      returnPolicyId: "",
      inventoryLocationKey: "",
    },
    lastCheckedAt: "",
    notes: "Configure EBAY_* env vars, then run the connection check.",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function seedPrintifyAccount() {
  return {
    id: "pod-printify-main",
    provider: "printify",
    name: "Printify (primary POD)",
    status: CONNECTION_STATUS.NOT_CONFIGURED,
    notes: "Configure PRINTIFY_API_TOKEN and PRINTIFY_SHOP_ID, then check the connection.",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

// Starter seeds — ideas only, not final posts. Seeded once (when the seeds
// collection does not exist yet); user deletions are respected afterwards.
const STARTER_SEEDS = [
  ["seed-betta-tank-checklist", "Beginner Betta Tank Checklist", "aquarium care", ["blog_post", "printable_pdf"]],
  ["seed-water-change-routine", "Aquarium Water Change Routine", "aquarium care", ["blog_post"]],
  ["seed-pea-puffer-feeding", "Pea Puffer Feeding Guide", "fishkeeping", ["blog_post"]],
  ["seed-cat-allergy-laundry", "Cat Allergy Laundry Routine", "cat care / cat allergy life", ["blog_post"]],
  ["seed-cat-peeing-bed", "How to Stop a Cat Peeing on the Bed", "cat care", ["blog_post"]],
  ["seed-cozy-solo-gamedev", "Cozy Solo Game Dev Workflow", "solo game dev", ["blog_post", "newsletter_issue"]],
  ["seed-godot-project-tracker", "Beginner Godot Project Tracker", "solo game dev", ["blog_post", "digital_product"]],
  ["seed-pod-sticker-log", "POD Sticker Experiment Log", "POD / product experiments", ["blog_post", "pod_product"]],
];

function seedStarterSeeds() {
  return STARTER_SEEDS.map(([id, title, niche, targetCrops]) => ({
    id,
    title,
    niche,
    targetCrops,
    status: "idea", // idea | active | retired
    notes: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));
}

// Ensure every design asset carries the engine's lineage / risk fields without
// disturbing its existing status or Etsy links.
function ensureDesignAssetFields(asset) {
  return {
    source: asset.provider || asset.source || "unknown",
    sourceModel: asset.model || asset.sourceModel || "",
    thumbnailPath: asset.thumbnailPath || "",
    ipRiskStatus: asset.ipRiskStatus || "unreviewed", // unreviewed | cleared | flagged
    qualityStatus: asset.qualityStatus || "unreviewed", // unreviewed | pass | fail
    parentDesignId: asset.parentDesignId || "",
    remixReason: asset.remixReason || "",
    remixPrompt: asset.remixPrompt || "",
    remixBatchId: asset.remixBatchId || "",
    notes: asset.notes || "",
    ...asset,
  };
}

function ensureEngineData(data) {
  data.productPresets = data.productPresets || [];
  if (!data.productPresets.some((preset) => preset.id === "preset-ebay-pod-sticker")) {
    data.productPresets.unshift(seedEbayStickerPreset());
  }

  data.marketplaceAccounts = data.marketplaceAccounts || [];
  if (!data.marketplaceAccounts.some((account) => account.id === "mkt-ebay-main")) {
    data.marketplaceAccounts.unshift(seedEbayAccount());
  }

  data.podAccounts = data.podAccounts || [];
  if (!data.podAccounts.some((account) => account.id === "pod-printify-main")) {
    data.podAccounts.unshift(seedPrintifyAccount());
  }

  data.listings = data.listings || [];
  data.orders = data.orders || [];
  data.listingMetricsDaily = data.listingMetricsDaily || [];
  data.decisions = data.decisions || [];
  // Log of vision-critique runs (critique rejects → improve loop). Durable
  // per-crop learnings live on each crop as `styleLearnings`.
  data.critiques = data.critiques || [];

  data.assets = (data.assets || []).map(ensureDesignAssetFields);

  // --- v2: multi-land engine (Seed → Batch → Asset → Output → Channel) -----
  // Existing collections already cover Batch (`batches`) and Asset (`assets`).
  // Outputs are the union of blogPosts + listings + podProductPlans (+ legacy
  // Etsy listingDrafts) — no duplicate "outputs" table.

  if (!data.seeds) {
    data.seeds = seedStarterSeeds();
  }

  data.blogPosts = data.blogPosts || [];

  // Printful-mediated eBay lane: plans are prepared here, carried to eBay by
  // Printful's own integration, and tracked back manually/semi-automatically.
  data.podProductPlans = data.podProductPlans || [];

  // Gumroad Land placeholder — lower priority, structure only.
  // Fields when used: digitalProductType, files, coverImage, title,
  // description, price, publishedUrl, status (idea | bundle_planned |
  // files_ready | copy_ready | published | needs_update | archived).
  data.gumroadProducts = data.gumroadProducts || [];

  // Channel/land board. Seed from the registry once, then preserve user
  // edits; new registry entries are unioned in by key.
  if (!data.channels) {
    data.channels = CHANNEL_REGISTRY.map((channel) => ({
      ...channel,
      notes: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
  } else {
    const existingKeys = new Set(data.channels.map((channel) => channel.key));
    CHANNEL_REGISTRY.forEach((channel) => {
      if (!existingKeys.has(channel.key)) {
        data.channels.push({ ...channel, notes: "", createdAt: nowIso(), updatedAt: nowIso() });
      }
    });
  }

  // --- v3: Etsy Personal Access draft-test lane -----------------------------
  // The Etsy app status moved from approval_pending to Personal Access: we
  // may test against the owner's own shop (draft-only, never a public
  // multi-seller flow). Only auto-advance the channel out of the old
  // approval_pending state — later ladder states are managed by the Etsy
  // readiness sync and by the user.
  const etsyChannel = data.channels.find((channel) => channel.key === "etsy");
  if (etsyChannel && etsyChannel.status === "approval_pending") {
    etsyChannel.status = "personal_access_ready_for_oauth";
    etsyChannel.reason =
      "Etsy app granted Personal Access — connect OAuth against your own shop. Draft-only testing; no live publishing.";
    etsyChannel.updatedAt = nowIso();
  }

  if (!data.productPresets.some((preset) => preset.id === "preset-etsy-pod-sticker-draft")) {
    data.productPresets.unshift({
      id: "preset-etsy-pod-sticker-draft",
      name: "Etsy POD Sticker Draft",
      platform: "etsy",
      productType: "sticker",
      outputType: "listing",
      listingType: "physical",
      createState: "draft", // this preset never creates active listings
      defaultTitleTemplate: "TEST - {design_name} Sticker",
      descriptionTemplate:
        "TEST DRAFT - DO NOT PURCHASE\n\nA {design_name} vinyl sticker. This is a draft-mode listing created by Auto Farmland for integration testing.",
      price: 2.5, // conservative test price; the listing stays a draft
      quantity: 1,
      whoMade: "i_did",
      whenMade: "made_to_order",
      // Physical item weight + dimensions. Required when the shop's shipping
      // profile is CALCULATED (carrier-rated). Conservative sticker defaults.
      itemWeight: 2,
      itemWeightUnit: "oz",
      itemLength: 6,
      itemWidth: 4,
      itemHeight: 1,
      itemDimensionsUnit: "in",
      // Filled from the Etsy connection settings when blank:
      taxonomyId: "",
      shippingProfileId: "",
      readinessStateId: "",
      returnPolicyId: "",
      tags: ["sticker", "test"],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  // Backfill item weight/dimensions onto an existing Etsy sticker preset that
  // predates these fields, so a calculated shipping profile validates.
  const etsyStickerPreset = data.productPresets.find((p) => p.id === "preset-etsy-pod-sticker-draft");
  if (etsyStickerPreset && etsyStickerPreset.itemWeight == null) {
    Object.assign(etsyStickerPreset, {
      itemWeight: 2,
      itemWeightUnit: "oz",
      itemLength: 6,
      itemWidth: 4,
      itemHeight: 1,
      itemDimensionsUnit: "in",
    });
  }

  // --- v4: Etsy digital listing presets ------------------------------------
  // Seed current taxonomy ids + reusable tags, then backfill existing crop
  // listings only where the operator has not already chosen a category.
  ETSY_DIGITAL_PRESETS.forEach((seed) => {
    const existing = data.productPresets.find((preset) => preset.id === seed.id);
    if (!existing) {
      data.productPresets.unshift({ ...seed, createdAt: nowIso(), updatedAt: nowIso() });
      return;
    }
    if (!existing.taxonomyId) existing.taxonomyId = seed.taxonomyId;
    if (!existing.taxonomyPath) existing.taxonomyPath = seed.taxonomyPath;
    if (!existing.listingType) existing.listingType = "download";
    existing.supportedProductTypes = existing.supportedProductTypes?.length
      ? existing.supportedProductTypes
      : seed.supportedProductTypes;
    existing.tags = mergeTags(existing.tags || [], seed.tags);
  });

  data.productPresets.forEach((preset) => {
    preset.creativeStrategy = normalizeCreativeStrategy(preset.creativeStrategy);
    preset.referenceRoles = preset.referenceRoles && typeof preset.referenceRoles === "object"
      ? preset.referenceRoles
      : {};
    preset.sourceMode = ["import", "api"].includes(preset.sourceMode) ? preset.sourceMode : "import";
    preset.galleryTemplate = Array.isArray(preset.galleryTemplate) && preset.galleryTemplate.length
      ? preset.galleryTemplate
      : ["hero", "included", "details", "formats", "usage", "license"];
    preset.packageRules = {
      requiredAssetCount: 1,
      formats: ["PNG", "JPG"],
      fileNamePattern: "artwork-{index}",
      outputDimensions: "source",
      folderStructure: "artwork + license",
      ...(preset.packageRules || {}),
    };
    preset.production = { assetIds: [], ...(preset.production || {}) };
  });
  data.presetRuns ||= [];

  (data.crops || []).forEach((crop) => {
    const preset = presetForCrop(data, crop);
    if (preset && !crop.etsyPresetId) crop.etsyPresetId = preset.id;
  });
  (data.listingDrafts || []).forEach((listing) => {
    const crop = (data.crops || []).find((entry) => entry.id === listing.cropId);
    const preset = data.productPresets.find((entry) => entry.id === listing.presetId)
      || presetForCrop(data, crop);
    if (!preset) return;
    if (!listing.presetId) listing.presetId = preset.id;
    if (!listing.taxonomyId) listing.taxonomyId = preset.taxonomyId;
    listing.taxonomyPath = listing.taxonomyPath || preset.taxonomyPath;
    if (!Array.isArray(listing.presetTagsApplied)) {
      listing.tags = mergeTags(listing.tags || [], preset.tags || []);
      listing.presetTagsApplied = [...(preset.tags || [])];
    }
  });

  // Etsy connection settings (non-secret). Tokens stay in server/secrets/.
  data.integrations = data.integrations || {};
  data.integrations.etsy = {
    shopId: "",
    shopName: "",
    shopUrl: "",
    connectedAt: "",
    accessLevel: "personal",
    shippingProfileId: "",
    readinessStateId: "",
    taxonomyId: "",
    returnPolicyId: "",
    lastAuthError: "",
    setup: null, // synced shop setup lists (profiles, sections, policies)
    ...(data.integrations.etsy || {}),
  };

  // --- v5: safe daily automation foundation -------------------------------
  // Defaults are inert: global off, scheduler off, shadow-only, presets
  // experimental. External publishing and automatic deactivation stay locked.
  ensureAutomationData(data, nowIso);

  // --- v6: project board (every shop, channel, app, and game) --------------
  ensureProjects(data, makeSeedId, nowIso);

  data.engineSchemaVersion = 6;
  return data;
}

module.exports = {
  ensureEngineData,
  seedEbayStickerPreset,
  seedEbayAccount,
  seedPrintifyAccount,
  ETSY_DIGITAL_PRESETS,
};
