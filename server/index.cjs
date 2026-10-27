const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
const { createImageProviderRegistry } = require("./imageProviders.cjs");
const { createImageCritic } = require("./services/imageCritique.cjs");
const { EtsyClient } = require("./etsyClient.cjs");
const { ensureEngineData } = require("./engine/schema.cjs");
const { registerEngineRoutes } = require("./engine/routes.cjs");
const { registerLandRoutes } = require("./engine/landRoutes.cjs");
const { registerProjectRoutes } = require("./engine/projectRoutes.cjs");
const { registerEtsyRoutes } = require("./engine/etsyRoutes.cjs");
const { createAdapterRegistry } = require("./adapters/index.cjs");
const { createRuntimePaths, ensureRuntimeFolders } = require("./config/runtime.cjs");
const { JsonSecretStore } = require("./security/jsonSecretStore.cjs");
const { SqliteStore } = require("./storage/sqliteStore.cjs");
const { registerAutomationRoutes } = require("./automation/routes.cjs");
const { startAutomationScheduler } = require("./automation/scheduler.cjs");
const { buildGallery, resolveListingTemplate, runPresetProduction, validateAssets } = require("./services/presetProduction.cjs");

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Marketplace + POD + blog adapter registry, built from env placeholders.
// The Etsy hook lets the adapter report token presence without owning the
// secrets folder (the closure resolves lazily at call time).
const adapters = createAdapterRegistry(process.env, {
  getEtsyAuth: () => readSecretJson(ETSY_AUTH_FILE),
});

const runtimePaths = createRuntimePaths(process.env, __dirname);
const {
  exportsDir: EXPORTS_DIR,
  assetsDir: ASSETS_DIR,
  secretsDir: SECRETS_DIR,
  legacyDataFile: DATA_FILE,
  databaseFile: DATABASE_FILE,
} = runtimePaths;
const ETSY_AUTH_FILE = path.join(SECRETS_DIR, "etsy-oauth.json");
const ETSY_PKCE_FILE = path.join(SECRETS_DIR, "etsy-pkce.json");
const secretStore = new JsonSecretStore(SECRETS_DIR);
const dataStore = new SqliteStore({
  databaseFile: DATABASE_FILE,
  legacyDataFile: DATA_FILE,
  createInitialData: createStarterData,
  migrateData,
  nowIso,
});
const imageProviders = createImageProviderRegistry(ASSETS_DIR, {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  },
});
// Vision critic for the "critique rejects → improve" loop. Uses a chat/vision
// model (configurable), separate from the image-generation model.
const imageCritic = createImageCritic({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_CRITIQUE_MODEL || "gpt-4.1-mini",
});
const etsyClient = new EtsyClient({
  keystring: process.env.ETSY_KEYSTRING,
  sharedSecret: process.env.ETSY_SHARED_SECRET,
  redirectUri: process.env.ETSY_REDIRECT_URI,
  scopes: process.env.ETSY_SCOPES || "shops_r listings_r listings_w",
});

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use("/assets", express.static(ASSETS_DIR));

function ensureFolders() {
  ensureRuntimeFolders(runtimePaths);
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createStarterData() {
  const data = {
    incomeStreams: [
      {
        id: "stream-shortform",
        name: "Short-Form Creature Content",
        streamType: "short_video_account",
        platform: "TikTok / Reels / Shorts",
        status: "active",
        goal: "Grow cozy fact accounts into monetized short-form channels.",
        notes: "The original crop. All current plots live here.",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "stream-etsy",
        name: "Etsy Sticker Garden",
        streamType: "etsy_shop",
        platform: "Etsy",
        status: "testing",
        goal: "Test cozy creature sticker concepts as a second crop.",
        notes: "Manual tracking only for now. No integrations yet.",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],

    accounts: [
      {
        id: "acct-brainrot",
        incomeStreamId: "stream-shortform",
        name: "Weird Brainrot Lab",
        platform: "TikTok",
        category: "Brainrot humor",
        automationMode: "assisted",
        targetPostsPerWeek: 21,
        status: "active",
        revenue: 0,
        notes: "High-volume weird humor testing lane.",
      },
      {
        id: "acct-history",
        incomeStreamId: "stream-shortform",
        name: "Tiny History Explains",
        platform: "YouTube Shorts",
        category: "Simple history explained",
        automationMode: "manual",
        targetPostsPerWeek: 7,
        status: "active",
        revenue: 0,
        notes: "Needs fact-check before publishing.",
      },
      {
        id: "acct-fish",
        incomeStreamId: "stream-shortform",
        name: "Fish Fact Pond",
        platform: "Instagram Reels",
        category: "Fish facts",
        automationMode: "assisted",
        targetPostsPerWeek: 7,
        status: "active",
        revenue: 0,
        notes: "Creature facts, aquarium-friendly content, cozy tone.",
      },
    ],

    formats: [
      {
        id: "fmt-absurd-pov",
        name: "Absurd POV",
        defaultTargetLengthSeconds: 12,
        qualityStatus: "testing",
        automationMode: "assisted",
        notes: "Fast weird humor format.",
      },
      {
        id: "fmt-simple-explainer",
        name: "Simple Explainer",
        defaultTargetLengthSeconds: 45,
        qualityStatus: "testing",
        automationMode: "manual",
        notes: "Needs more factual review.",
      },
      {
        id: "fmt-creature-fact",
        name: "Creature Fact",
        defaultTargetLengthSeconds: 25,
        qualityStatus: "promising",
        automationMode: "assisted",
        notes: "Good fit for fish/animal accounts.",
      },
    ],

    batches: [
      {
        id: "batch-fish-001",
        incomeStreamId: "stream-shortform",
        accountId: "acct-fish",
        formatId: "fmt-creature-fact",
        goal: "Generate cozy fish fact shorts for the week.",
        quantity: 3,
        targetLengthSeconds: 25,
        automationMode: "assisted",
        status: "generated",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],

    contentItems: [
      {
        id: "item-fish-001",
        batchId: "batch-fish-001",
        accountId: "acct-fish",
        formatId: "fmt-creature-fact",
        topic: "Arowanas are tiny dragons",
        hook: "This fish looks like a dragon and jumps like a missile.",
        script:
          "Silver arowanas are surface hunters. In the wild, they can leap out of the water to catch prey.",
        caption: "Tiny dragon behavior.",
        targetLengthSeconds: 25,
        finalFilePath: "demo/fish/arowana-final.mp4",
        status: "approved",
        riskFlags: [],
        qualityScore: 88,
        approvalRequired: false,
        scheduledAt: "",
        publishedAt: "",
        decision: "",
        metrics: {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          followsGained: 0,
          revenue: 0,
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "item-fish-002",
        batchId: "batch-fish-001",
        accountId: "acct-fish",
        formatId: "fmt-creature-fact",
        topic: "Pufferfish are tiny criminals",
        hook: "This fish looks cute, but it is built like a tiny menace.",
        script:
          "Pufferfish have beak-like teeth and bold personalities. In aquariums, they often need special care and enrichment.",
        caption: "Cute does not mean innocent.",
        targetLengthSeconds: 25,
        finalFilePath: "",
        status: "approved",
        riskFlags: ["missing_final_file"],
        qualityScore: 82,
        approvalRequired: false,
        scheduledAt: "",
        publishedAt: "",
        decision: "",
        metrics: {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          followsGained: 0,
          revenue: 0,
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "item-history-001",
        batchId: "",
        accountId: "acct-history",
        formatId: "fmt-simple-explainer",
        topic: "Castle spiral stairs",
        hook: "Castle stairs were not just stairs. They were defensive design.",
        script:
          "Many castle staircases were built to favor defenders. The design could make it harder for attackers to fight while climbing.",
        caption: "Tiny design choice, huge survival difference.",
        targetLengthSeconds: 45,
        finalFilePath: "demo/history/castle-stairs-final.mp4",
        status: "review",
        riskFlags: ["needs_fact_check"],
        qualityScore: 78,
        approvalRequired: true,
        scheduledAt: "",
        publishedAt: "",
        decision: "",
        metrics: {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          followsGained: 0,
          revenue: 0,
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],

    automationLog: [],
  };

  return ensureEtsyData(data);
}

function ensureDemoAsset(relativePath, label, background, accent) {
  const targetPath = path.join(ASSETS_DIR, relativePath);
  if (fs.existsSync(targetPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const safeLabel = String(label).replace(/[&<>]/g, "");
  fs.writeFileSync(
    targetPath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" rx="42" fill="${background}"/><circle cx="600" cy="500" r="300" fill="${accent}" opacity=".16"/><path d="M600 700V340M600 500c-95-130-225-135-290-125 22 150 120 230 290 205M600 455c85-115 205-130 280-115-30 140-125 205-280 185" fill="none" stroke="${accent}" stroke-width="40" stroke-linecap="round"/><text x="600" y="870" text-anchor="middle" font-family="Georgia,serif" font-size="48" fill="#34402c">${safeLabel}</text></svg>`
  );
}

function ensureEtsyData(data) {
  ensureFolders();

  data.farms = data.farms || [
    {
      id: "farm-main",
      name: "Home Farm",
      description: "A local-first portfolio of small income experiments.",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];

  data.incomeStreams = data.incomeStreams || [];
  if (!data.incomeStreams.some((stream) => stream.id === "stream-etsy")) {
    data.incomeStreams.push({
      id: "stream-etsy",
      farmId: "farm-main",
      name: "Etsy Image Garden",
      streamType: "etsy_shop",
      platform: "Etsy",
      status: "active",
      goal: "Turn strong visual niches into polished digital-download listings.",
      notes: "Digital downloads first; POD is a later expansion flag.",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  data.accounts = data.accounts || [];
  if (!data.accounts.some((account) => account.id === "shop-etsy-main")) {
    data.accounts.push({
      id: "shop-etsy-main",
      incomeStreamId: "stream-etsy",
      name: "Moss & Marigold Print Shop",
      platform: "Etsy",
      category: "Digital art and printables",
      accountType: "shop",
      automationMode: "manual",
      status: "active",
      notes: "Demo shop for the Etsy v1 workflow.",
    });
  }

  if (!data.crops) {
    data.crops = [
      {
        id: "crop-cottage-cats",
        incomeStreamId: "stream-etsy",
        shopId: "shop-etsy-main",
        name: "Cottagecore Cat Wall Art",
        niche: "cozy cats",
        targetCustomer: "Cat lovers decorating reading nooks and cozy apartments",
        productType: "digital_download",
        status: "review",
        aestheticNotes: "Vintage gouache, warm linen, quiet garden details",
        promptTemplate: "A storybook cat tending a tiny cottage garden, vintage gouache, warm muted palette, printable wall art, no text",
        podCandidate: true,
        decision: "",
        performanceNotes: "Test the strongest three colorways as a printable set.",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "crop-aquarium-goblins",
        incomeStreamId: "stream-etsy",
        shopId: "shop-etsy-main",
        name: "Aquarium Goblin Sticker Pack",
        niche: "aquarium humor",
        targetCustomer: "Aquarium keepers who like odd, playful creature art",
        productType: "sticker_sheet",
        status: "idea",
        aestheticNotes: "Chunky ink lines, pond greens, mischievous expressions",
        promptTemplate: "A mischievous aquarium goblin creature, bold sticker outline, transparent background, playful collectible character",
        podCandidate: true,
        decision: "",
        performanceNotes: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ];
  }

  data.batches = data.batches || [];
  if (!data.batches.some((batch) => batch.id === "batch-etsy-cats-001")) {
    data.batches.push({
      id: "batch-etsy-cats-001",
      cropId: "crop-cottage-cats",
      incomeStreamId: "stream-etsy",
      provider: "openai",
      model: "mock-image-v1",
      prompt: data.crops[0].promptTemplate,
      negativePrompt: "text, watermark, photo realism",
      dimensions: "3000x3000",
      quality: "standard",
      quantity: 3,
      estimatedCost: 0.12,
      actualCost: null,
      status: "review",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  ensureDemoAsset("crop-cottage-cats/batch-etsy-cats-001/cat-sage.svg", "Garden Cat · Sage", "#e4ead7", "#66804d");
  ensureDemoAsset("crop-cottage-cats/batch-etsy-cats-001/cat-gold.svg", "Garden Cat · Gold", "#f2e5c9", "#b87b43");
  ensureDemoAsset("crop-cottage-cats/batch-etsy-cats-001/cat-rose.svg", "Garden Cat · Rose", "#eddfe1", "#9d6673");

  data.assets = data.assets || [
    ["asset-cat-sage", "cat-sage.svg", "approved"],
    ["asset-cat-gold", "cat-gold.svg", "final"],
    ["asset-cat-rose", "cat-rose.svg", "rejected"],
  ].map(([id, fileName, status], index) => ({
    id,
    cropId: "crop-cottage-cats",
    batchId: "batch-etsy-cats-001",
    providerRunId: "run-etsy-cats-001",
    provider: "openai",
    model: "mock-image-v1",
    prompt: data.crops[0].promptTemplate,
    negativePrompt: "text, watermark, photo realism",
    dimensions: "3000x3000",
    quality: "standard",
    seed: index + 41,
    estimatedCost: 0.04,
    actualCost: null,
    fileName,
    filePath: path.join(ASSETS_DIR, "crop-cottage-cats", "batch-etsy-cats-001", fileName),
    publicUrl: `/assets/crop-cottage-cats/batch-etsy-cats-001/${fileName}`,
    status,
    isMockup: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));

  data.listingDrafts = data.listingDrafts || [
    {
      id: "listing-cottage-cats",
      cropId: "crop-cottage-cats",
      title: "Cottagecore Cat Garden Printable Wall Art Set",
      description: "A cozy printable art set featuring a storybook garden cat. Download, print, and add a little quiet magic to your reading nook.",
      tags: ["cottagecore cat", "printable wall art", "cat lover gift", "cozy decor", "digital download"],
      materials: "Digital JPG/PNG files; no physical item is shipped.",
      aiDisclosure: "This artwork was created with the assistance of generative AI and was curated and finished by the seller.",
      productType: "digital_download",
      price: 7.5,
      assetIds: ["asset-cat-sage", "asset-cat-gold"],
      mockupAssetIds: [],
      status: "draft",
      exportedAt: "",
      exportPath: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];

  data.performanceSnapshots = data.performanceSnapshots || [
    {
      id: "performance-cottage-cats-001",
      cropId: "crop-cottage-cats",
      views: 240,
      favorites: 18,
      clicks: 42,
      orders: 3,
      revenue: 22.5,
      spend: 3.2,
      notes: "Early demo numbers for recommendation testing.",
      createdAt: nowIso(),
    },
  ];

  data.providerRuns = data.providerRuns || [
    {
      id: "run-etsy-cats-001",
      cropId: "crop-cottage-cats",
      batchId: "batch-etsy-cats-001",
      provider: "openai",
      model: "mock-image-v1",
      prompt: data.crops[0].promptTemplate,
      negativePrompt: "text, watermark, photo realism",
      dimensions: "3000x3000",
      quality: "standard",
      estimatedCost: 0.12,
      actualCost: null,
      status: "mocked",
      createdAt: nowIso(),
    },
  ];

  data.pipelineRuns = data.pipelineRuns || [];
  data.integrations = data.integrations || {};
  data.integrations.etsy = {
    shopId: "",
    shopName: "",
    shopUrl: "",
    connectedAt: "",
    ...(data.integrations.etsy || {}),
  };
  data.assets = data.assets.map((asset) => ({
    isReference: false,
    isMockup: false,
    ...asset,
  }));
  data.listingDrafts = data.listingDrafts.map((draft) => ({
    taxonomyId: "",
    quantity: 1,
    whoMade: "i_did",
    whenMade: "2020_2026",
    externalListingId: "",
    externalListingUrl: "",
    externalState: "",
    ...draft,
  }));

  if (!data.crops.some((crop) => crop.id === "crop-journaling-pages")) {
    data.crops.unshift({
      id: "crop-journaling-pages",
      incomeStreamId: "stream-etsy",
      shopId: "shop-etsy-main",
      name: "Pastoral Journaling Pages",
      niche: "printable journaling pages",
      targetCustomer: "Journalers who enjoy quiet pastoral stationery and gentle nature palettes",
      productType: "printable",
      status: "idea",
      aestheticNotes: "Original paper-cut pastoral mood, muted sage and ochre, generous writing space",
      promptTemplate: "Create an original US Letter portrait printable journaling page with a quiet pastoral mood, layered paper-cut texture, muted sage and ochre palette, subtle sheep and meadow motifs around the border, and a large clean writing area. Use the reference only for broad mood and palette. Do not copy its composition, calendar, house, sheep placement, wording, signature, or identifiable design elements. No dates, no logos, no watermark, no legible text.",
      podCandidate: false,
      decision: "",
      performanceNotes: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  if (!data.listingDrafts.some((draft) => draft.id === "listing-journaling-pages")) {
    data.listingDrafts.unshift({
      id: "listing-journaling-pages",
      cropId: "crop-journaling-pages",
      title: "Pastoral Journaling Page Printable | Instant Digital Download",
      description: "An original printable journaling page with a calm pastoral palette and generous writing space. You will receive a high-resolution US Letter JPG digital file. No physical item is shipped.",
      tags: ["journaling pages", "printable journal", "pastoral stationery", "digital paper", "instant download"],
      materials: "One high-resolution US Letter JPG digital file; no physical item is shipped.",
      aiDisclosure: "This original design was created with the assistance of generative AI, then selected, arranged, and prepared for print by the seller.",
      productType: "printable",
      price: 2,
      taxonomyId: "",
      quantity: 1,
      whoMade: "i_did",
      whenMade: "2020_2026",
      assetIds: [],
      mockupAssetIds: [],
      status: "draft",
      exportedAt: "",
      exportPath: "",
      externalListingId: "",
      externalListingUrl: "",
      externalState: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  data.schemaVersion = 5;

  // Engine foundation (presets, listings, marketplace/POD accounts, orders,
  // metrics, decisions). Additive and non-destructive.
  ensureEngineData(data);
  return data;
}

function migrateData(data) {
  if (!data.incomeStreams) {
    data.incomeStreams = [
      {
        id: "stream-shortform",
        name: "Short-Form Content Farm",
        type: "shortform_content",
        status: "active",
        automationMode: "assisted",
        goal: "Grow multiple short-form accounts across platforms.",
        revenue: 0,
        notes: "Primary working crop: TikTok, Reels, Shorts, and other video platforms.",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "stream-merch",
        name: "Merch & Product Garden",
        type: "merch",
        status: "planned",
        automationMode: "manual",
        goal: "Future merch, POD, Etsy, and product experiments.",
        revenue: 0,
        notes: "Later expansion. Do not build this yet.",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "stream-digital-products",
        name: "Digital Product Orchard",
        type: "digital_products",
        status: "planned",
        automationMode: "manual",
        goal: "Future templates, downloads, guides, and digital goods.",
        revenue: 0,
        notes: "Later expansion after content engine works.",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ];
  }
  if (!data.contentItems && data.experiments) {
    data.contentItems = data.experiments.map((experiment) => {
      return {
        ...experiment,
        id: experiment.id.replace("exp-", "item-"),
      };
    });

    delete data.experiments;
  }

  if (!data.contentItems) {
    data.contentItems = [];
  }

  if (!data.batches) {
    data.batches = [];
  }

  if (!data.automationLog) {
    data.automationLog = [];
  }

  // Auto Farmland migration: introduce income streams ("crops") without
  // touching any existing accounts, batches, or content items.
  if (!data.incomeStreams) {
    data.incomeStreams = [
      {
        id: "stream-shortform",
        name: "Short-Form Creature Content",
        streamType: "short_video_account",
        platform: "TikTok / Reels / Shorts",
        status: "active",
        goal: "Grow cozy fact accounts into monetized short-form channels.",
        notes: "Default stream created during Auto Farmland migration.",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ];
  }

  const defaultStreamId = data.incomeStreams[0] ? data.incomeStreams[0].id : "";

  data.accounts = (data.accounts || []).map((account) => {
    if (account.incomeStreamId) {
      return account;
    }

    return { ...account, incomeStreamId: defaultStreamId };
  });

  data.batches = data.batches.map((batch) => {
    if (batch.incomeStreamId) {
      return batch;
    }

    return { ...batch, incomeStreamId: defaultStreamId };
  });

  return ensureEtsyData(data);
}

function readData() {
  return dataStore.read();
}

function writeData(data) {
  dataStore.write(data);
}

function readSecretJson(filePath) {
  return secretStore.read(path.basename(filePath));
}

function writeSecretJson(filePath, value) {
  secretStore.write(path.basename(filePath), value);
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkceRequest() {
  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  return {
    state: base64Url(crypto.randomBytes(32)),
    codeVerifier,
    codeChallenge,
    createdAt: nowIso(),
  };
}

function saveEtsyAuth(tokenResponse) {
  const expiresIn = Number(tokenResponse.expires_in || 3600);
  const auth = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    tokenType: tokenResponse.token_type || "Bearer",
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    // Etsy access tokens are "{user_id}.{secret}" — keep the prefix only.
    userId: String(tokenResponse.access_token || "").split(".")[0] || "",
    scopes: process.env.ETSY_SCOPES || "shops_r listings_r listings_w",
    updatedAt: nowIso(),
  };
  writeSecretJson(ETSY_AUTH_FILE, auth);
  return auth;
}

async function getValidEtsyAuth() {
  let auth = readSecretJson(ETSY_AUTH_FILE);
  if (!auth?.accessToken || !auth?.refreshToken) {
    throw new Error("Etsy has not been authorized yet. Use Connect Etsy first.");
  }
  const expiresSoon = new Date(auth.expiresAt || 0).getTime() < Date.now() + 60_000;
  if (expiresSoon) {
    const refreshed = await etsyClient.refreshAccessToken(auth.refreshToken);
    auth = saveEtsyAuth(refreshed);
  }
  return auth;
}

function getAccount(data, accountId) {
  return data.accounts.find((account) => account.id === accountId);
}

function getFormat(data, formatId) {
  return data.formats.find((format) => format.id === formatId);
}

function getNextScheduleTime(index) {
  const date = new Date();
  date.setDate(date.getDate() + index + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function getTopicPool(accountId, formatId) {
  if (accountId === "acct-fish") {
    return [
      "Why arowanas jump",
      "Why pufferfish have beak teeth",
      "Why bettas flare",
      "Why gar look prehistoric",
      "Why corydoras blink",
      "Why goldfish are smarter than people think",
      "Why catfish have whiskers",
      "Why koi feel magical",
    ];
  }

  if (accountId === "acct-history") {
    return [
      "Why castle stairs were defensive",
      "Why old maps had sea monsters",
      "Why purple dye was expensive",
      "Why medieval streets were chaotic",
      "Why ancient cities had walls",
      "Why knights needed squires",
      "Why spices changed trade routes",
      "Why old armor looks so dramatic",
    ];
  }

  if (accountId === "acct-brainrot") {
    return [
      "POV your goldfish starts a podcast",
      "POV a raccoon becomes your financial advisor",
      "POV your fridge is hiding secrets",
      "POV the mall fountain grants terrible wishes",
      "POV your Roomba joins a gang",
      "POV your houseplant is judging you",
      "POV a pigeon runs city hall",
      "POV your microwave becomes self-aware",
    ];
  }

  return [
    "Generated content idea 1",
    "Generated content idea 2",
    "Generated content idea 3",
  ];
}

function createFakeContentItem({ batch, account, format, topic, index }) {
  const targetLengthSeconds =
    Number(batch.targetLengthSeconds) ||
    Number(format.defaultTargetLengthSeconds) ||
    20;

  const isManual = batch.automationMode === "manual";
  const isHistory = account.category.toLowerCase().includes("history");

  return {
    id: makeId("item"),
    batchId: batch.id,
    accountId: account.id,
    formatId: format.id,
    topic,
    hook: `Quick hook for: ${topic}`,
    script: `Draft script for "${topic}". This is placeholder generated content for backend testing.`,
    caption: `Caption draft for ${topic}.`,
    targetLengthSeconds,
    finalFilePath: index === 0 ? `demo/generated/${batch.id}-${index}.mp4` : "",
    status: isManual || isHistory ? "review" : "draft",
    riskFlags: isHistory ? ["needs_fact_check"] : [],
    qualityScore: 75 + index * 4,
    approvalRequired: isManual || isHistory,
    scheduledAt: "",
    publishedAt: "",
    decision: "",
    metrics: {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      followsGained: 0,
      revenue: 0,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function getNeedsYouItems(data) {
  return data.contentItems
    .map((item) => {
      const account = getAccount(data, item.accountId);
      const format = getFormat(data, item.formatId);

      if (item.status === "review" || item.approvalRequired) {
        return {
          contentItemId: item.id,
          topic: item.topic,
          account: account ? account.name : "Unknown account",
          format: format ? format.name : "Unknown format",
          reason: "Needs human approval or review.",
        };
      }

      if (item.riskFlags && item.riskFlags.length > 0) {
        return {
          contentItemId: item.id,
          topic: item.topic,
          account: account ? account.name : "Unknown account",
          format: format ? format.name : "Unknown format",
          reason: `Risk flags: ${item.riskFlags.join(", ")}`,
        };
      }

      if (["approved", "scheduled"].includes(item.status) && !item.finalFilePath) {
        return {
          contentItemId: item.id,
          topic: item.topic,
          account: account ? account.name : "Unknown account",
          format: format ? format.name : "Unknown format",
          reason: "Missing final video file.",
        };
      }

      if (["published", "analyzed"].includes(item.status) && !item.decision) {
        return {
          contentItemId: item.id,
          topic: item.topic,
          account: account ? account.name : "Unknown account",
          format: format ? format.name : "Unknown format",
          reason: "Needs Repeat / Remix / Kill decision.",
        };
      }

      return null;
    })
    .filter(Boolean);
}

function runAutomationCheck(data) {
  const actions = [];
  let scheduleIndex = 0;

  data.contentItems = data.contentItems.map((item) => {
    const account = getAccount(data, item.accountId);
    const format = getFormat(data, item.formatId);

    const accountMode = account ? account.automationMode : "manual";
    const formatMode = format ? format.automationMode : "manual";
    const isManual = accountMode === "manual" || formatMode === "manual";
    const hasRisk = item.riskFlags && item.riskFlags.length > 0;
    const hasFile = Boolean(item.finalFilePath);
    const scoreGoodEnough = Number(item.qualityScore || 0) >= 80;

    if (item.status === "review" || item.approvalRequired) {
      actions.push({
        contentItemId: item.id,
        action: "sent_to_needs_you",
        reason: "Human approval required.",
      });

      return item;
    }

    if (isManual) {
      actions.push({
        contentItemId: item.id,
        action: "kept_manual",
        reason: "Account or format is manual mode.",
      });

      return item;
    }

    if (hasRisk) {
      actions.push({
        contentItemId: item.id,
        action: "sent_to_needs_you",
        reason: `Risk flags: ${item.riskFlags.join(", ")}`,
      });

      return item;
    }

    if (!hasFile) {
      actions.push({
        contentItemId: item.id,
        action: "sent_to_needs_you",
        reason: "Missing final video file.",
      });

      return item;
    }

    if (!scoreGoodEnough) {
      actions.push({
        contentItemId: item.id,
        action: "sent_to_needs_you",
        reason: "Quality score below automation threshold.",
      });

      return item;
    }

    if (item.status === "approved") {
      const scheduledAt = getNextScheduleTime(scheduleIndex);
      scheduleIndex += 1;

      actions.push({
        contentItemId: item.id,
        action: "auto_scheduled",
        reason: "Trusted enough for assisted automation.",
        scheduledAt,
      });

      return {
        ...item,
        status: "scheduled",
        scheduledAt,
        updatedAt: nowIso(),
      };
    }

    actions.push({
      contentItemId: item.id,
      action: "no_change",
      reason: `No automation rule matched for status: ${item.status}`,
    });

    return item;
  });

  data.automationLog.unshift({
    id: makeId("log"),
    ranAt: nowIso(),
    actions,
  });

  return {
    data,
    actions,
  };
}

function exportContentItem(item, data) {
  const account = getAccount(data, item.accountId);
  const format = getFormat(data, item.formatId);

  const safeFolderName = `${item.id}-${item.topic}`
    .replace(/[^a-z0-9-_]+/gi, "-")
    .toLowerCase();

  const exportFolder = path.join(EXPORTS_DIR, safeFolderName);

  if (!fs.existsSync(exportFolder)) {
    fs.mkdirSync(exportFolder, { recursive: true });
  }

  const metadata = {
    contentItemId: item.id,
    batchId: item.batchId,
    topic: item.topic,
    hook: item.hook,
    account: account ? account.name : "Unknown account",
    platform: account ? account.platform : "Unknown platform",
    format: format ? format.name : "Unknown format",
    targetLengthSeconds: item.targetLengthSeconds,
    finalFilePath: item.finalFilePath,
    scheduledAt: item.scheduledAt,
    exportedAt: nowIso(),
  };

  fs.writeFileSync(path.join(exportFolder, "caption.txt"), item.caption || "");
  fs.writeFileSync(path.join(exportFolder, "script.txt"), item.script || "");
  fs.writeFileSync(
    path.join(exportFolder, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  return exportFolder;
}

function getLatestPerformance(data, cropId) {
  return data.performanceSnapshots
    .filter((snapshot) => snapshot.cropId === cropId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

function getCropRecommendation(crop, performance) {
  if (!performance) {
    return {
      decision: "Remix",
      reason: "No live performance yet. Refine the strongest sprout before spending more.",
    };
  }

  const views = Number(performance.views || 0);
  const favorites = Number(performance.favorites || 0);
  const clicks = Number(performance.clicks || 0);
  const orders = Number(performance.orders || 0);
  const revenue = Number(performance.revenue || 0);
  const spend = Number(performance.spend || 0);

  if (orders >= 5 && revenue > spend && crop.podCandidate) {
    return {
      decision: "Expand to POD",
      reason: "Proven orders and positive profit make this a sensible POD candidate.",
    };
  }

  if (orders >= 2 && revenue > spend) {
    return {
      decision: "Repeat",
      reason: "The crop has multiple orders and a positive profit estimate.",
    };
  }

  if (views >= 150 && clicks < 5 && orders === 0) {
    return {
      decision: "Kill",
      reason: "Enough traffic has arrived without meaningful buying interest.",
    };
  }

  if (favorites > 0 || clicks > 0 || orders > 0) {
    return {
      decision: "Remix",
      reason: "There is interest, but the offer or presentation needs another variation.",
    };
  }

  return {
    decision: "Remix",
    reason: "Gather more signal with one focused variation before scaling or composting.",
  };
}

function getEtsySummary(data) {
  const crops = data.crops.filter((crop) => crop.incomeStreamId === "stream-etsy");
  const snapshots = crops.map((crop) => getLatestPerformance(data, crop.id)).filter(Boolean);
  const estimatedSpend = data.providerRuns.reduce(
    (sum, run) => sum + Number(run.actualCost ?? run.estimatedCost ?? 0),
    0
  );
  const estimatedRevenue = snapshots.reduce(
    (sum, snapshot) => sum + Number(snapshot.revenue || 0),
    0
  );
  const cropScores = crops.map((crop) => {
    const performance = getLatestPerformance(data, crop.id);
    const profit = performance
      ? Number(performance.revenue || 0) - Number(performance.spend || 0)
      : 0;
    return { crop, profit };
  });
  const topCrop = cropScores.sort((a, b) => b.profit - a.profit)[0]?.crop || null;
  const needsYou = [];

  crops.forEach((crop) => {
    const cropAssets = data.assets.filter((asset) => asset.cropId === crop.id);
    const listing = data.listingDrafts.find((draft) => draft.cropId === crop.id);
    if (crop.status === "idea") {
      needsYou.push({ cropId: crop.id, cropName: crop.name, reason: "Plant the first Seed Batch." });
    } else if (cropAssets.some((asset) => asset.status === "review")) {
      needsYou.push({ cropId: crop.id, cropName: crop.name, reason: "Review generated sprouts." });
    } else if (!listing) {
      needsYou.push({ cropId: crop.id, cropName: crop.name, reason: "Create an Etsy listing draft." });
    } else if (!listing.exportedAt) {
      needsYou.push({ cropId: crop.id, cropName: crop.name, reason: "Finish and export the harvest package." });
    } else if (!getLatestPerformance(data, crop.id)) {
      needsYou.push({ cropId: crop.id, cropName: crop.name, reason: "Enter the first performance snapshot." });
    }
  });

  return {
    activeCrops: crops.filter((crop) => !["archived"].includes(crop.status)).length,
    recentHarvests: data.listingDrafts.filter((draft) => draft.exportedAt).slice(0, 4),
    topCrop,
    estimatedSpend: Number(estimatedSpend.toFixed(2)),
    estimatedRevenue: Number(estimatedRevenue.toFixed(2)),
    needsYou,
  };
}

function safePackageName(value) {
  return String(value || "etsy-harvest")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "etsy-harvest";
}

function exportListingPackage(listing, data) {
  const crop = data.crops.find((item) => item.id === listing.cropId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const exportFolder = path.join(
    EXPORTS_DIR,
    "etsy",
    `${safePackageName(crop?.name)}-${stamp}`
  );
  const finalFolder = path.join(exportFolder, "final-images");
  const mockupFolder = path.join(exportFolder, "mockup-images");
  fs.mkdirSync(finalFolder, { recursive: true });
  fs.mkdirSync(mockupFolder, { recursive: true });

  const selectedIds = new Set([...(listing.assetIds || []), ...(listing.mockupAssetIds || [])]);
  const selectedAssets = data.assets.filter((asset) => selectedIds.has(asset.id));
  selectedAssets.forEach((asset) => {
    if (!asset.filePath || !fs.existsSync(asset.filePath)) {
      return;
    }
    const target = (listing.mockupAssetIds || []).includes(asset.id) ? mockupFolder : finalFolder;
    fs.copyFileSync(asset.filePath, path.join(target, asset.fileName || path.basename(asset.filePath)));
  });

  const costSummary = {
    currency: "USD",
    estimatedGenerationCost: data.providerRuns
      .filter((run) => run.cropId === listing.cropId)
      .reduce((sum, run) => sum + Number(run.estimatedCost || 0), 0),
    actualGenerationCost: data.providerRuns
      .filter((run) => run.cropId === listing.cropId && run.actualCost != null)
      .reduce((sum, run) => sum + Number(run.actualCost || 0), 0),
    assetCount: selectedAssets.length,
  };
  const exportData = {
    ...listing,
    crop,
    exportedAt: nowIso(),
    assets: selectedAssets.map(({ id, fileName, status, provider, model }) => ({
      id,
      fileName,
      status,
      provider,
      model,
    })),
  };
  const listingMarkdown = `# ${listing.title}\n\n${listing.description}\n\n## Product details\n\n- Product type: ${listing.productType}\n- Price: $${Number(listing.price || 0).toFixed(2)}\n- Materials / format: ${listing.materials}\n\n## AI disclosure\n\n${listing.aiDisclosure}\n`;

  fs.writeFileSync(path.join(exportFolder, "listing.json"), JSON.stringify(exportData, null, 2));
  fs.writeFileSync(path.join(exportFolder, "listing.md"), listingMarkdown);
  fs.writeFileSync(path.join(exportFolder, "tags.txt"), (listing.tags || []).join("\n"));
  fs.writeFileSync(path.join(exportFolder, "ai_disclosure.txt"), listing.aiDisclosure || "");
  fs.writeFileSync(path.join(exportFolder, "cost_summary.json"), JSON.stringify(costSummary, null, 2));

  return exportFolder;
}

async function prepareDigitalProductFile(crop, listing, asset) {
  const extension = path.extname(asset.filePath || "").toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error("The Etsy pipeline requires a real PNG, JPEG, or WebP final asset; mock SVGs cannot be published.");
  }
  if (!asset.filePath || !fs.existsSync(asset.filePath)) {
    throw new Error("The selected final asset file is missing from local storage.");
  }

  const productFolder = path.join(EXPORTS_DIR, "etsy-products", crop.id);
  fs.mkdirSync(productFolder, { recursive: true });
  const fileName = `${safePackageName(crop.name)}-us-letter.jpg`;
  const filePath = path.join(productFolder, fileName);
  await sharp(asset.filePath)
    .rotate()
    .resize(2550, 3300, {
      fit: "contain",
      background: { r: 255, g: 253, b: 247 },
      withoutEnlargement: false,
    })
    .flatten({ background: "#fffdf7" })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .withMetadata({ density: 300 })
    .toFile(filePath);

  return {
    fileName,
    filePath,
    dimensions: "2550x3300",
    dpi: 300,
    format: "jpg",
    listingId: listing.id,
  };
}

function mergeEtsyTags(...tagLists) {
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

function findEtsyPreset(data, crop, listing = {}, requestedPresetId = "") {
  const etsyPresets = (data.productPresets || []).filter(
    (preset) => preset.platform === "etsy" && preset.listingType === "download"
  );
  const presetId = requestedPresetId || listing.presetId || crop?.etsyPresetId || "";
  return etsyPresets.find((preset) => preset.id === presetId)
    || etsyPresets.find((preset) =>
      (preset.supportedProductTypes || [preset.productType]).includes(crop?.productType)
    )
    || null;
}

function applyEtsyPreset(data, crop, listing, requestedPresetId = "", overwriteCategory = false) {
  const preset = findEtsyPreset(data, crop, listing, requestedPresetId);
  if (!preset) return null;
  const previousPresetTags = new Set(
    (listing.presetTagsApplied || []).map((tag) => String(tag).trim().toLowerCase())
  );
  const customTags = (listing.tags || []).filter(
    (tag) => !previousPresetTags.has(String(tag).trim().toLowerCase())
  );
  listing.presetId = preset.id;
  if (overwriteCategory || !listing.taxonomyId) listing.taxonomyId = preset.taxonomyId || listing.taxonomyId || "";
  listing.taxonomyPath = preset.taxonomyPath || listing.taxonomyPath || "";
  listing.tags = mergeEtsyTags(customTags, preset.tags || []);
  listing.presetTagsApplied = [...(preset.tags || [])];
  listing.updatedAt = nowIso();
  return preset;
}

async function runEtsyListingPipeline(data, crop, listing) {
  const run = {
    id: makeId("pipeline"),
    cropId: crop.id,
    listingDraftId: listing.id,
    mode: "draft_first",
    status: "running",
    steps: [],
    startedAt: nowIso(),
    completedAt: "",
    error: "",
  };
  data.pipelineRuns.unshift(run);
  writeData(data);

  const step = (name, status, detail = {}) => {
    const existing = run.steps.find((item) => item.name === name);
    const value = { name, status, at: nowIso(), ...detail };
    if (existing) Object.assign(existing, value);
    else run.steps.push(value);
    writeData(data);
  };

  try {
    step("validate", "running");
    const appliedPreset = applyEtsyPreset(data, crop, listing);
    if (appliedPreset) {
      step("apply_preset", "completed", {
        presetId: appliedPreset.id,
        taxonomyId: listing.taxonomyId,
        tagCount: listing.tags.length,
      });
    }
    if (!etsyClient.isConfigured()) {
      throw new Error("Etsy credentials or ETSY_REDIRECT_URI are not configured.");
    }
    if (!listing.aiDisclosure?.trim()) {
      throw new Error("The listing needs an AI disclosure before Etsy sync.");
    }
    if (!Number(listing.taxonomyId)) {
      throw new Error("Choose an Etsy taxonomy/category ID before creating the remote draft.");
    }
    if (!listing.title?.trim() || !listing.description?.trim()) {
      throw new Error("The Etsy draft needs both a title and description.");
    }
    if (!(Number(listing.price) > 0)) {
      throw new Error("The Etsy draft price must be greater than zero.");
    }
    const shopId = data.integrations?.etsy?.shopId;
    if (!shopId) {
      throw new Error("Connect Etsy and verify the destination shop before running the pipeline.");
    }
    const selectedIds = new Set(listing.assetIds || []);
    const finalAsset = data.assets.find(
      (asset) =>
        asset.cropId === crop.id &&
        !asset.isReference &&
        !asset.isMockup &&
        ["approved", "final"].includes(asset.status) &&
        (selectedIds.size === 0 || selectedIds.has(asset.id))
    );
    if (!finalAsset) {
      throw new Error("Approve or mark a real generated asset as final and attach it to the listing.");
    }
    if (!finalAsset.filePath || !fs.existsSync(finalAsset.filePath)) {
      throw new Error("The selected final asset is missing from local storage.");
    }
    step("validate", "completed", { assetId: finalAsset.id, shopId: String(shopId) });

    const auth = await getValidEtsyAuth();
    step("authorize", "completed", { tokenRefreshedAt: auth.updatedAt });

    let productFile = listing.preparedProductFile;
    if (!productFile?.filePath || !fs.existsSync(productFile.filePath)) {
      step("prepare_product", "running");
      productFile = await prepareDigitalProductFile(crop, listing, finalAsset);
      listing.preparedProductFile = productFile;
      listing.updatedAt = nowIso();
      step("prepare_product", "completed", {
        fileName: productFile.fileName,
        dimensions: productFile.dimensions,
        dpi: productFile.dpi,
      });
    } else {
      step("prepare_product", "completed", { reused: true, fileName: productFile.fileName });
    }

    let externalListingId = listing.externalListingId;
    if (!externalListingId) {
      step("create_draft", "running");
      const remoteDraft = await etsyClient.createDraftListing(
        shopId,
        { ...listing, type: "download" },
        auth.accessToken
      );
      externalListingId = String(remoteDraft.listing_id || remoteDraft.results?.[0]?.listing_id || "");
      if (!externalListingId) {
        throw new Error("Etsy created a draft but did not return a listing ID.");
      }
      listing.externalListingId = externalListingId;
      listing.externalState = "draft";
      listing.externalType = "download";
      listing.externalEditUrl = `https://www.etsy.com/your/shops/me/listing-editor/edit/${externalListingId}`;
      listing.updatedAt = nowIso();
      step("create_draft", "completed", { externalListingId });
    } else {
      step("create_draft", "completed", { reused: true, externalListingId });
    }

    const galleryAssets = (listing.mockupAssetIds || [])
      .map((id) => data.assets.find((asset) => asset.id === id))
      .filter((asset) => asset?.filePath && fs.existsSync(asset.filePath))
      .slice(0, 10);
    if (galleryAssets.length) {
      step("upload_preview", "running");
      listing.externalGalleryImageIds ||= {};
      for (let index = 0; index < galleryAssets.length; index += 1) {
        const asset = galleryAssets[index];
        if (listing.externalGalleryImageIds[asset.id]) continue;
        const imageResponse = await etsyClient.uploadListingImage(shopId, externalListingId, asset.filePath, auth.accessToken, index + 1);
        listing.externalGalleryImageIds[asset.id] = String(
          imageResponse.listing_image_id || imageResponse.results?.[0]?.listing_image_id || "uploaded"
        );
      }
      listing.externalPreviewImageId = listing.externalGalleryImageIds[galleryAssets[0].id] || listing.externalPreviewImageId;
      listing.updatedAt = nowIso();
      step("upload_preview", "completed", { imageId: listing.externalPreviewImageId, galleryCount: galleryAssets.length });
    } else if (!listing.externalPreviewImageId) {
      step("upload_preview", "running");
      const imageResponse = await etsyClient.uploadListingImage(shopId, externalListingId, productFile.filePath, auth.accessToken);
      listing.externalPreviewImageId = String(imageResponse.listing_image_id || imageResponse.results?.[0]?.listing_image_id || "uploaded");
      listing.updatedAt = nowIso();
      step("upload_preview", "completed", { imageId: listing.externalPreviewImageId });
    } else step("upload_preview", "completed", { reused: true, imageId: listing.externalPreviewImageId });

    if (!listing.externalDigitalFileId) {
      step("upload_customer_file", "running");
      try {
        const fileResponse = await etsyClient.uploadListingFile(
          shopId,
          externalListingId,
          productFile.filePath,
          auth.accessToken
        );
        listing.externalDigitalFileId = String(
          fileResponse.listing_file_id || fileResponse.results?.[0]?.listing_file_id || "uploaded"
        );
      } catch (error) {
        if (!/already attached to this listing/i.test(String(error?.message || ""))) throw error;
        // Etsy confirms the intended file is already present. Treat that as an
        // idempotent success so retries can continue instead of getting stuck.
        listing.externalDigitalFileId = "already-attached";
      }
      listing.updatedAt = nowIso();
      step("upload_customer_file", "completed", {
        fileId: listing.externalDigitalFileId,
        recovered: listing.externalDigitalFileId === "already-attached",
      });
    } else {
      step("upload_customer_file", "completed", { reused: true, fileId: listing.externalDigitalFileId });
    }

    if (listing.externalType !== "download") {
      step("set_digital_type", "running");
      await etsyClient.updateListing(shopId, externalListingId, { type: "download" }, auth.accessToken);
      listing.externalType = "download";
      listing.updatedAt = nowIso();
      step("set_digital_type", "completed");
    } else {
      step("set_digital_type", "completed", { reused: true });
    }

    step("activate", "skipped", { reason: "Activation requires the separate reviewed-draft confirmation." });

    step("verify", "running");
    const remoteListing = await etsyClient.getListing(externalListingId, auth.accessToken);
    listing.externalListingUrl = remoteListing.url || listing.externalListingUrl || "";
    listing.externalState = remoteListing.state || listing.externalState;
    listing.updatedAt = nowIso();
    run.status = listing.externalState === "active" ? "published" : "draft_ready";
    run.completedAt = nowIso();
    step("verify", "completed", {
      state: listing.externalState,
      url: listing.externalListingUrl,
    });
    writeData(data);
    return { run, listing, remoteListing };
  } catch (error) {
    run.status = "failed";
    run.error = error.message || "Pipeline failed.";
    run.completedAt = nowIso();
    const runningStep = run.steps.find((item) => item.status === "running");
    if (runningStep) {
      runningStep.status = "failed";
      runningStep.error = run.error;
      runningStep.at = nowIso();
    }
    writeData(data);
    throw error;
  }
}

app.get("/api/health", (request, response) => {
  response.json({
    ok: true,
    message: "Auto Farmland backend connected.",
    time: nowIso(),
    storage: "sqlite",
  });
});

app.get("/api/storage/status", (request, response) => {
  response.json(dataStore.status());
});

app.get("/api/data", (request, response) => {
  const data = readData();
  response.json(data);
});

app.get("/api/accounts", (request, response) => {
  const data = readData();
  response.json(data.accounts);
});

app.get("/api/formats", (request, response) => {
  const data = readData();
  response.json(data.formats);
});

app.get("/api/income-streams", (request, response) => {
  const data = readData();
  response.json(data.incomeStreams);
});

app.post("/api/income-streams", (request, response) => {
  const data = readData();

  const { name, streamType, platform, status, goal, notes } = request.body;

  if (!name || !streamType) {
    response.status(400).json({
      ok: false,
      error: "Income stream needs at least a name and a streamType.",
    });
    return;
  }

  const stream = {
    id: makeId("stream"),
    name,
    streamType,
    platform: platform || "",
    status: status || "testing",
    goal: goal || "",
    notes: notes || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  data.incomeStreams.unshift(stream);
  writeData(data);

  response.json({
    ok: true,
    message: "Income stream planted.",
    incomeStream: stream,
  });
});

app.patch("/api/income-streams/:id", (request, response) => {
  const data = readData();
  const streamId = request.params.id;

  let updatedStream = null;

  data.incomeStreams = data.incomeStreams.map((stream) => {
    if (stream.id !== streamId) {
      return stream;
    }

    updatedStream = {
      ...stream,
      ...request.body,
      id: stream.id,
      updatedAt: nowIso(),
    };

    return updatedStream;
  });

  if (!updatedStream) {
    response.status(404).json({
      ok: false,
      error: "Income stream not found.",
    });
    return;
  }

  writeData(data);

  response.json({
    ok: true,
    message: "Income stream updated.",
    incomeStream: updatedStream,
  });
});

app.get("/api/batches", (request, response) => {
  const data = readData();
  response.json(data.batches);
});

app.get("/api/content-items", (request, response) => {
  const data = readData();
  response.json(data.contentItems);
});

app.get("/api/summary", (request, response) => {
  const data = readData();

  const totalRevenue = data.contentItems.reduce((sum, item) => {
    return sum + Number(item.metrics.revenue || 0);
  }, 0);

  response.json({
    streamCount: data.incomeStreams.length,
    activeStreamCount: data.incomeStreams.filter(
      (stream) => stream.status === "active"
    ).length,
    accountCount: data.accounts.length,
    formatCount: data.formats.length,
    batchCount: data.batches.length,
    contentItemCount: data.contentItems.length,
    scheduledCount: data.contentItems.filter((item) => item.status === "scheduled")
      .length,
    publishedCount: data.contentItems.filter((item) => item.status === "published")
      .length,
    needsYou: getNeedsYouItems(data),
    totalRevenue,
    latestAutomationRun: data.automationLog[0] || null,
  });
});

app.post("/api/batches", (request, response) => {
  const data = readData();

  const {
    accountId,
    formatId,
    goal,
    quantity,
    targetLengthSeconds,
    automationMode,
  } = request.body;

  const account = getAccount(data, accountId);
  const format = getFormat(data, formatId);

  if (!account || !format) {
    response.status(400).json({
      ok: false,
      error: "Invalid accountId or formatId.",
    });
    return;
  }

  const safeQuantity = Math.max(1, Math.min(Number(quantity || 3), 50));

  const batch = {
    id: makeId("batch"),
    incomeStreamId:
      request.body.incomeStreamId || account.incomeStreamId || "",
    accountId,
    formatId,
    goal: goal || "Generate content batch.",
    quantity: safeQuantity,
    targetLengthSeconds:
      Number(targetLengthSeconds) || Number(format.defaultTargetLengthSeconds) || 20,
    automationMode: automationMode || account.automationMode || "manual",
    status: "generated",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const topicPool = getTopicPool(accountId, formatId);

  const newItems = Array.from({ length: safeQuantity }).map((_, index) => {
    const topic = topicPool[index % topicPool.length];

    return createFakeContentItem({
      batch,
      account,
      format,
      topic,
      index,
    });
  });

  data.batches.unshift(batch);
  data.contentItems.unshift(...newItems);

  writeData(data);

  response.json({
    ok: true,
    message: "Batch created and placeholder content items generated.",
    batch,
    contentItems: newItems,
  });
});

app.patch("/api/content-items/:id", (request, response) => {
  const data = readData();
  const contentItemId = request.params.id;

  let updatedItem = null;

  data.contentItems = data.contentItems.map((item) => {
    if (item.id !== contentItemId) {
      return item;
    }

    updatedItem = {
      ...item,
      ...request.body,
      updatedAt: nowIso(),
    };

    return updatedItem;
  });

  if (!updatedItem) {
    response.status(404).json({
      ok: false,
      error: "Content item not found.",
    });
    return;
  }

  writeData(data);

  response.json({
    ok: true,
    message: "Content item updated.",
    contentItem: updatedItem,
  });
});

app.post("/api/automation/run", (request, response) => {
  const data = readData();
  const result = runAutomationCheck(data);

  writeData(result.data);

  response.json({
    ok: true,
    message: "Automation check completed.",
    actions: result.actions,
    needsYou: getNeedsYouItems(result.data),
  });
});

app.post("/api/exports/ready", (request, response) => {
  const data = readData();

  const readyItems = data.contentItems.filter((item) => {
    return item.status === "scheduled" && item.finalFilePath;
  });

  const exported = readyItems.map((item) => {
    const folder = exportContentItem(item, data);

    return {
      contentItemId: item.id,
      topic: item.topic,
      folder,
    };
  });

  response.json({
    ok: true,
    message: "Export packages created.",
    exported,
  });
});

app.get("/api/integrations/status", (request, response) => {
  const data = readData();
  const etsyAuth = readSecretJson(ETSY_AUTH_FILE);
  response.json({
    openai: {
      configured: imageProviders.openai.isConfigured(),
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    },
    etsy: {
      configured: etsyClient.isConfigured(),
      authorized: Boolean(etsyAuth?.refreshToken),
      tokenExpiresAt: etsyAuth?.expiresAt || "",
      redirectUri: process.env.ETSY_REDIRECT_URI || "",
      shopId: data.integrations?.etsy?.shopId || "",
      shopName: data.integrations?.etsy?.shopName || "",
      shopUrl: data.integrations?.etsy?.shopUrl || "",
      connectedAt: data.integrations?.etsy?.connectedAt || "",
    },
  });
});

app.post("/api/integrations/openai/verify", async (request, response) => {
  try {
    const result = await imageProviders.openai.checkConnection();
    response.json({ ok: true, message: "OpenAI image access verified.", ...result });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message || "OpenAI verification failed." });
  }
});

app.get("/api/integrations/etsy/oauth/start", (request, response) => {
  try {
    const pkce = createPkceRequest();
    writeSecretJson(ETSY_PKCE_FILE, pkce);
    response.redirect(
      etsyClient.buildAuthorizeUrl({
        state: pkce.state,
        codeChallenge: pkce.codeChallenge,
      })
    );
  } catch (error) {
    response.status(400).send(error.message || "Could not begin Etsy authorization.");
  }
});

app.get("/api/integrations/etsy/oauth/callback", async (request, response) => {
  const appOrigin = String(process.env.APP_ORIGIN || "http://localhost:5173").replace(/"/g, "");
  try {
    if (request.query.error) {
      throw new Error(request.query.error_description || request.query.error);
    }
    const pkce = readSecretJson(ETSY_PKCE_FILE);
    if (!pkce || !request.query.code || request.query.state !== pkce.state) {
      throw new Error("The Etsy OAuth state did not match. Start the connection again.");
    }
    if (Date.now() - new Date(pkce.createdAt).getTime() > 10 * 60 * 1000) {
      throw new Error("The Etsy authorization request expired. Start the connection again.");
    }
    const tokenResponse = await etsyClient.exchangeAuthorizationCode({
      code: request.query.code,
      codeVerifier: pkce.codeVerifier,
    });
    const auth = saveEtsyAuth(tokenResponse);
    const shopsResponse = await etsyClient.getMyShops(auth.accessToken);
    const shops = shopsResponse.results || shopsResponse;
    const shop = Array.isArray(shops) ? shops[0] : null;
    const data = readData();
    if (shop) {
      data.integrations.etsy = {
        shopId: String(shop.shop_id || ""),
        shopName: shop.shop_name || shop.title || "",
        shopUrl: shop.url || "",
        connectedAt: nowIso(),
      };
      writeData(data);
    }
    secretStore.remove(path.basename(ETSY_PKCE_FILE));
    response.send(`<!doctype html><html><body style="font-family:system-ui;padding:40px"><h1>Etsy connected</h1><p>Auto Farmland can now create drafts for ${shop?.shop_name || "your shop"}.</p><p><a href="${appOrigin}">Return to Auto Farmland</a></p></body></html>`);
  } catch (error) {
    response.status(400).send(`<!doctype html><html><body style="font-family:system-ui;padding:40px"><h1>Etsy connection failed</h1><p>${String(error.message || error).replace(/[<>]/g, "")}</p><p><a href="${appOrigin}">Return to Auto Farmland</a></p></body></html>`);
  }
});

app.post("/api/integrations/etsy/verify", async (request, response) => {
  try {
    const auth = await getValidEtsyAuth();
    const shopsResponse = await etsyClient.getMyShops(auth.accessToken);
    const shops = shopsResponse.results || shopsResponse;
    const shop = Array.isArray(shops) ? shops[0] : null;
    const data = readData();
    if (shop) {
      data.integrations.etsy = {
        shopId: String(shop.shop_id || ""),
        shopName: shop.shop_name || shop.title || "",
        shopUrl: shop.url || "",
        connectedAt: data.integrations.etsy.connectedAt || nowIso(),
      };
      writeData(data);
    }
    response.json({ ok: true, message: "Etsy connection verified.", shop: data.integrations.etsy });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message || "Etsy verification failed." });
  }
});

app.get("/api/integrations/etsy/taxonomy", async (request, response) => {
  try {
    response.json(await etsyClient.getSellerTaxonomy());
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message || "Could not load Etsy taxonomy." });
  }
});

app.post("/api/crops/:id/etsy-pipeline", async (request, response) => {
  const data = readData();
  const crop = data.crops.find((item) => item.id === request.params.id);
  const listing = data.listingDrafts.find(
    (draft) => draft.id === request.body.listingDraftId && draft.cropId === request.params.id
  );
  if (!crop || !listing) {
    response.status(404).json({ ok: false, error: "Crop or listing draft not found." });
    return;
  }
  if (request.body.autoPublish) {
    response.status(400).json({
      ok: false,
      error: "Auto-publish was removed from the draft pipeline. Create and inspect the Etsy draft first, then use the separate activation confirmation.",
    });
    return;
  }
  try {
    const result = await runEtsyListingPipeline(data, crop, listing);
    response.json({ ok: true, message: "Etsy digital draft created and verified. Review it in Etsy before activation.", ...result });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message || "Etsy pipeline failed." });
  }
});

app.post("/api/listing-drafts/:id/activate", async (request, response) => {
  const data = readData();
  const listing = data.listingDrafts.find((draft) => draft.id === request.params.id);
  const crop = listing ? data.crops.find((item) => item.id === listing.cropId) : null;
  if (!listing || !crop) {
    response.status(404).json({ ok: false, error: "Listing draft or crop not found." });
    return;
  }
  if (!listing.externalListingId) {
    response.status(400).json({ ok: false, error: "Create the remote Etsy draft before activating it." });
    return;
  }
  const expected = `PUBLISH ${listing.externalListingId}`;
  if (request.body.reviewed !== true || request.body.confirmation !== expected) {
    response.status(400).json({
      ok: false,
      error: `Review the draft in Etsy, check the confirmation box, and type exactly: ${expected}`,
    });
    return;
  }
  if (!listing.externalPreviewImageId || !listing.externalDigitalFileId || listing.externalType !== "download") {
    response.status(400).json({
      ok: false,
      error: "The digital draft is incomplete. Re-run Create/Verify Digital Draft before activation.",
    });
    return;
  }

  const run = {
    id: makeId("pipeline"), cropId: crop.id, listingDraftId: listing.id,
    mode: "reviewed_activation", status: "running", steps: [], startedAt: nowIso(), completedAt: "", error: "",
  };
  data.pipelineRuns.unshift(run);
  const addStep = (name, status, detail = {}) => {
    run.steps.push({ name, status, at: nowIso(), ...detail });
    writeData(data);
  };

  try {
    addStep("confirm_review", "completed", { externalListingId: listing.externalListingId });
    const auth = await getValidEtsyAuth();
    const shopId = data.integrations?.etsy?.shopId;
    if (!shopId) throw new Error("The connected Etsy shop is missing. Resolve the shop again.");
    const before = await etsyClient.getListing(listing.externalListingId, auth.accessToken);
    if (before.state === "active") {
      listing.externalState = "active";
      listing.status = "live";
      crop.status = "live";
      run.status = "published";
      run.completedAt = nowIso();
      addStep("activate", "completed", { reused: true, state: "active" });
      response.json({ ok: true, message: "The Etsy listing was already active and is verified.", listing, run });
      return;
    }
    addStep("activate", "running", { previousState: before.state || "unknown" });
    await etsyClient.updateListing(shopId, listing.externalListingId, { state: "active" }, auth.accessToken);
    const remote = await etsyClient.getListing(listing.externalListingId, auth.accessToken);
    if (remote.state !== "active") throw new Error(`Etsy returned state "${remote.state || "unknown"}" after activation.`);
    listing.externalState = "active";
    listing.externalListingUrl = remote.url || listing.externalListingUrl || "";
    listing.status = "live";
    listing.activatedAt = nowIso();
    listing.updatedAt = nowIso();
    crop.status = "live";
    run.status = "published";
    run.completedAt = nowIso();
    const running = run.steps.find((step) => step.name === "activate" && step.status === "running");
    if (running) Object.assign(running, { status: "completed", at: nowIso(), state: remote.state, url: remote.url || "" });
    writeData(data);
    response.json({ ok: true, message: "Etsy listing activated and verified live.", listing, run, remoteListing: remote });
  } catch (error) {
    run.status = "failed";
    run.error = error.message || "Etsy activation failed.";
    run.completedAt = nowIso();
    const running = run.steps.find((step) => step.status === "running");
    if (running) Object.assign(running, { status: "failed", error: run.error, at: nowIso() });
    writeData(data);
    response.status(400).json({ ok: false, error: run.error });
  }
});

// Etsy image-commerce v1. These routes intentionally sit beside the preserved
// short-form routes so the app can migrate one useful workflow at a time.
app.get("/api/etsy/summary", (request, response) => {
  response.json(getEtsySummary(readData()));
});

app.post("/api/crops", (request, response) => {
  const data = readData();
  const { name, niche, targetCustomer, productType, aestheticNotes, promptTemplate } = request.body;
  if (!name || !productType) {
    response.status(400).json({ ok: false, error: "A crop needs a name and product type." });
    return;
  }

  const crop = {
    id: makeId("crop"),
    incomeStreamId: request.body.incomeStreamId || "stream-etsy",
    shopId: request.body.shopId || "shop-etsy-main",
    name,
    niche: niche || "",
    targetCustomer: targetCustomer || "",
    productType,
    status: "idea",
    aestheticNotes: aestheticNotes || "",
    promptTemplate: promptTemplate || "",
    podCandidate: Boolean(request.body.podCandidate),
    decision: "",
    performanceNotes: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.crops.unshift(crop);
  writeData(data);
  response.json({ ok: true, message: "Crop planted.", crop });
});

app.patch("/api/crops/:id", (request, response) => {
  const data = readData();
  const index = data.crops.findIndex((crop) => crop.id === request.params.id);
  if (index < 0) {
    response.status(404).json({ ok: false, error: "Crop not found." });
    return;
  }
  data.crops[index] = {
    ...data.crops[index],
    ...request.body,
    id: data.crops[index].id,
    updatedAt: nowIso(),
  };
  writeData(data);
  response.json({ ok: true, message: "Crop updated.", crop: data.crops[index] });
});

app.post("/api/crops/:id/batches", async (request, response) => {
  try {
    const data = readData();
    const crop = data.crops.find((item) => item.id === request.params.id);
    if (!crop) {
      response.status(404).json({ ok: false, error: "Crop not found." });
      return;
    }

    const providerName = request.body.provider || "openai";
    const provider = imageProviders[providerName];
    if (!provider) {
      response.status(400).json({ ok: false, error: "Provider must be openai, mock, gemini, or manual." });
      return;
    }

    const quantity = Math.max(1, Math.min(Number(request.body.batchSize || 4), 10));
    const referenceAssetIds = Array.isArray(request.body.referenceAssetIds)
      ? request.body.referenceAssetIds
      : [];
    const referenceAssets = data.assets.filter(
      (asset) =>
        asset.cropId === crop.id &&
        asset.isReference &&
        referenceAssetIds.includes(asset.id)
    );
    const defaultModel = providerName === "openai"
      ? process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"
      : providerName === "mock"
        ? "local-mock-v1"
        : providerName === "manual"
          ? "manual-import"
          : "mock-gemini-v1";
    // Compounding loop: fold the crop's active style learnings into the prompt
    // so each round benefits from prior critiques. Visible (stored on the batch
    // prompt), and opt-out via applyLearnings:false.
    const basePrompt = request.body.prompt || crop.promptTemplate;
    const activeLearnings = (crop.styleLearnings || [])
      .filter((learning) => learning && learning.active !== false)
      .map((learning) => (typeof learning === "string" ? learning : learning.text))
      .filter(Boolean);
    const applyLearnings = request.body.applyLearnings !== false && activeLearnings.length > 0;
    const effectivePrompt = applyLearnings
      ? `${basePrompt}\n\nStyle guidance learned from prior rounds (follow these):\n- ${activeLearnings.join("\n- ")}`
      : basePrompt;

    const batch = {
      id: makeId("batch"),
      cropId: crop.id,
      incomeStreamId: crop.incomeStreamId,
      provider: providerName,
      model: request.body.model || defaultModel,
      prompt: effectivePrompt,
      learningsApplied: applyLearnings ? activeLearnings.length : 0,
      negativePrompt: request.body.negativePrompt || "",
      dimensions: request.body.dimensions || "1024x1536",
      quality: request.body.quality || "medium",
      referenceAssetIds: referenceAssets.map((asset) => asset.id),
      quantity,
      estimatedCost: provider.estimateCost({ batchSize: quantity, ...request.body }),
      actualCost: null,
      status: providerName === "manual" ? "awaiting_import" : "generating",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.batches.unshift(batch);

    const run = provider.saveProviderRun({
      id: makeId("run"),
      cropId: crop.id,
      batchId: batch.id,
      provider: providerName,
      model: batch.model,
      prompt: batch.prompt,
      negativePrompt: batch.negativePrompt,
      dimensions: batch.dimensions,
      quality: batch.quality,
      estimatedCost: batch.estimatedCost,
      actualCost: null,
      referenceAssetIds: batch.referenceAssetIds,
      status: providerName === "manual" ? "awaiting_import" : "running",
      createdAt: nowIso(),
    });
    data.providerRuns.unshift(run);

    const results = await provider.generateImageBatch({
      cropId: crop.id,
      batchId: batch.id,
      batchSize: quantity,
      model: batch.model,
      prompt: batch.prompt,
      negativePrompt: batch.negativePrompt,
      dimensions: batch.dimensions,
      quality: batch.quality,
      referenceFilePaths: referenceAssets.map((asset) => asset.filePath),
    });
    const unitCost = quantity ? Number(batch.estimatedCost || 0) / quantity : 0;
    const assets = provider.normalizeResult(results).map((result) => ({
      id: makeId("asset"),
      cropId: crop.id,
      batchId: batch.id,
      providerRunId: run.id,
      provider: providerName,
      model: batch.model,
      prompt: batch.prompt,
      negativePrompt: batch.negativePrompt,
      dimensions: batch.dimensions,
      quality: batch.quality,
      seed: result.seed ?? null,
      estimatedCost: Number(unitCost.toFixed(4)),
      actualCost: null,
      fileName: result.fileName,
      filePath: result.filePath,
      publicUrl: result.publicUrl,
      status: result.status || "review",
      isMockup: false,
      isReference: false,
      providerRequestId: result.providerRequestId || "",
      revisedPrompt: result.revisedPrompt || "",
      referenceCount: result.referenceCount || 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
    run.status = providerName === "openai" ? "completed" : providerName === "manual" ? "awaiting_import" : "mocked";
    run.providerRequestId = results[0]?.providerRequestId || "";
    run.usage = results[0]?.usage || null;
    run.updatedAt = nowIso();
    data.assets.unshift(...assets);
    batch.status = assets.length ? "review" : "awaiting_import";
    batch.updatedAt = nowIso();
    crop.status = assets.length ? "review" : "generating";
    crop.updatedAt = nowIso();
    writeData(data);
    const message = providerName === "openai"
      ? "Real OpenAI Seed Batch generated."
      : assets.length
        ? "Local mock Seed Batch generated."
        : "Manual Seed Batch ready for imports.";
    response.json({ ok: true, message, batch, assets, providerRun: run });
  } catch (error) {
    const status = error.status === 429 ? 429 : 500;
    response.status(status).json({
      ok: false,
      error: error.message || "Could not create Seed Batch.",
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
});

// Critique rejected images and improve the prompt (compounding loop). Looks at
// rejected raster images + the prompt + your reason via a vision model, then
// returns an improved prompt / negative additions and appends durable style
// learnings to the crop. Never auto-generates — the operator applies the
// improved prompt and generates when ready.
app.post("/api/crops/:id/critique", async (request, response) => {
  try {
    const data = readData();
    const crop = data.crops.find((item) => item.id === request.params.id);
    if (!crop) {
      response.status(404).json({ ok: false, error: "Crop not found." });
      return;
    }
    if (!imageCritic.isConfigured()) {
      response.status(400).json({ ok: false, error: "OpenAI is not configured. Add OPENAI_API_KEY to .env.local to enable critique." });
      return;
    }

    const requestedIds = Array.isArray(request.body.rejectedAssetIds) ? request.body.rejectedAssetIds : null;
    const rejectedAssets = data.assets.filter(
      (asset) =>
        asset.cropId === crop.id &&
        !asset.isReference &&
        (requestedIds ? requestedIds.includes(asset.id) : asset.status === "rejected")
    );
    if (!rejectedAssets.length) {
      response.status(400).json({ ok: false, error: "No rejected designs to critique. Reject at least one first (a short reason helps)." });
      return;
    }

    // Only raster images can be sent to the vision model (mock SVGs cannot).
    const images = rejectedAssets
      .filter((asset) => asset.filePath && fs.existsSync(asset.filePath) && /\.(png|jpe?g|gif|webp)$/i.test(asset.fileName || ""))
      .slice(0, 4)
      .map((asset) => {
        const ext = path.extname(asset.filePath).toLowerCase().replace(".", "");
        const mime = ext === "jpg" ? "jpeg" : ext;
        const base64 = fs.readFileSync(asset.filePath).toString("base64");
        return { fileName: asset.fileName, dataUrl: `data:image/${mime};base64,${base64}` };
      });

    const originalPrompt = request.body.prompt || rejectedAssets[0].prompt || crop.promptTemplate || "";
    const negativePrompt = request.body.negativePrompt || rejectedAssets[0].negativePrompt || "";
    const reason = request.body.reason || "";
    const existingLearnings = (crop.styleLearnings || [])
      .filter((learning) => learning && learning.active !== false)
      .map((learning) => (typeof learning === "string" ? learning : learning.text))
      .filter(Boolean);

    let result;
    try {
      result = await imageCritic.critique({ rejected: images, prompt: originalPrompt, negativePrompt, reason, existingLearnings });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
      return;
    }

    // Persist new learnings on the crop (dedupe by lowercased text).
    crop.styleLearnings = crop.styleLearnings || [];
    const seen = new Set(crop.styleLearnings.map((learning) => String(learning.text || learning).trim().toLowerCase()));
    const newLearnings = [];
    result.styleLearnings.forEach((text) => {
      const key = text.trim().toLowerCase();
      if (key && !seen.has(key)) {
        const learning = { id: makeId("learn"), text, active: true, source: "critique", createdAt: nowIso() };
        crop.styleLearnings.push(learning);
        seen.add(key);
        newLearnings.push(learning);
      }
    });
    crop.updatedAt = nowIso();

    const record = {
      id: makeId("critique"),
      cropId: crop.id,
      rejectedAssetIds: rejectedAssets.map((asset) => asset.id),
      imagesUsed: images.length,
      reason,
      originalPrompt,
      model: result.model,
      critique: result.critique,
      improvedPrompt: result.improvedPrompt,
      negativePromptAdditions: result.negativePromptAdditions,
      styleLearnings: result.styleLearnings,
      createdAt: nowIso(),
    };
    data.critiques.unshift(record);
    writeData(data);

    response.json({
      ok: true,
      message: `Critique complete${images.length ? ` (${images.length} image(s) analyzed)` : " — text-only, no raster rejects were available"}. ${newLearnings.length} new style learning(s) saved.`,
      critique: record,
      newLearnings,
      styleLearnings: crop.styleLearnings,
    });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message || "Critique failed." });
  }
});

app.post("/api/assets/import", (request, response) => {
  const data = readData();
  const crop = data.crops.find((item) => item.id === request.body.cropId);
  if (!crop) {
    response.status(404).json({ ok: false, error: "Crop not found." });
    return;
  }

  const match = String(request.body.dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    response.status(400).json({ ok: false, error: "Import a PNG, JPEG, or WebP image." });
    return;
  }

  let batch = data.batches.find((item) => item.id === request.body.batchId && item.cropId === crop.id);
  if (!batch) {
    batch = {
      id: makeId("batch"), cropId: crop.id, incomeStreamId: crop.incomeStreamId,
      provider: "manual", model: "manual-import", prompt: crop.promptTemplate,
      negativePrompt: "", dimensions: "source", quality: "source", quantity: 1,
      estimatedCost: 0, actualCost: 0, status: "review", createdAt: nowIso(), updatedAt: nowIso(),
    };
    data.batches.unshift(batch);
  }

  const extension = match[1] === "image/jpeg" ? ".jpg" : `.${match[1].split("/")[1]}`;
  const baseName = safePackageName(path.parse(request.body.fileName || "imported-image").name);
  const fileName = `${Date.now()}-${baseName}${extension}`;
  const folder = path.join(ASSETS_DIR, crop.id, batch.id);
  fs.mkdirSync(folder, { recursive: true });
  const filePath = path.join(folder, fileName);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));

  const run = {
    id: makeId("run"), cropId: crop.id, batchId: batch.id, provider: "manual",
    model: "manual-import", prompt: crop.promptTemplate, negativePrompt: "",
    dimensions: "source", quality: "source", estimatedCost: 0, actualCost: 0,
    status: "imported", createdAt: nowIso(),
  };
  const asset = {
    id: makeId("asset"), cropId: crop.id, batchId: batch.id, providerRunId: run.id,
    provider: "manual", model: "manual-import", prompt: crop.promptTemplate,
    negativePrompt: "", dimensions: "source", quality: "source", seed: null,
    estimatedCost: 0, actualCost: 0, fileName, filePath,
    publicUrl: `/assets/${crop.id}/${batch.id}/${fileName}`,
    status: request.body.isReference ? "reference" : request.body.status === "approved" ? "approved" : "review",
    isMockup: Boolean(request.body.isMockup),
    isReference: Boolean(request.body.isReference),
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  data.providerRuns.unshift(run);
  data.assets.unshift(asset);
  crop.status = "review";
  crop.updatedAt = nowIso();
  writeData(data);
  response.json({ ok: true, message: "Image imported into the Seed Batch.", asset, batch });
});

app.patch("/api/assets/:id", (request, response) => {
  const data = readData();
  const index = data.assets.findIndex((asset) => asset.id === request.params.id);
  if (index < 0) {
    response.status(404).json({ ok: false, error: "Asset not found." });
    return;
  }
  data.assets[index] = { ...data.assets[index], ...request.body, id: data.assets[index].id, updatedAt: nowIso() };
  writeData(data);
  response.json({ ok: true, message: "Sprout updated.", asset: data.assets[index] });
});

app.post("/api/presets/:id/preview", async (request, response) => {
  try {
    const data = readData();
    const storedPreset = (data.productPresets || []).find((item) => item.id === request.params.id);
    if (!storedPreset) {
      response.status(404).json({ ok: false, error: "Preset not found." });
      return;
    }
    const crop = (data.crops || []).find((item) => item.etsyPresetId === storedPreset.id || item.productPresetId === storedPreset.id)
      || (data.crops || []).find((item) => (storedPreset.supportedProductTypes || []).includes(item.productType));
    if (!crop) {
      response.status(409).json({ ok: false, error: "Assign this preset to a product before previewing it." });
      return;
    }
    const input = request.body || {};
    const preset = {
      ...storedPreset,
      name: input.name ?? storedPreset.name,
      productType: input.productType ?? storedPreset.productType,
      sourceMode: input.sourceMode ?? storedPreset.sourceMode ?? "import",
      galleryTemplate: input.galleryTemplate ?? storedPreset.galleryTemplate,
      titlePattern: input.titlePattern ?? storedPreset.titlePattern,
      price: input.price ?? storedPreset.price,
      license: input.license ?? storedPreset.license,
      licenseInstructions: input.licenseInstructions ?? storedPreset.licenseInstructions,
      packageRules: { ...(storedPreset.packageRules || {}), ...(input.packageRules || {}) },
      creativeStrategy: { ...(storedPreset.creativeStrategy || {}), ...(input.creativeStrategy || {}) },
      production: { ...(storedPreset.production || {}), ...(input.production || {}) },
    };
    const requestedIds = Array.isArray(input.productionAssetIds) ? input.productionAssetIds : (preset.production?.assetIds || []);
    const eligible = (data.assets || []).filter((asset) =>
      asset.cropId === crop.id
      && !asset.isReference
      && !asset.isMockup
      && ["approved", "final"].includes(asset.status)
      && (preset.sourceMode === "api" ? asset.provider !== "manual" : asset.provider === "manual")
    );
    const byId = new Map(eligible.map((asset) => [asset.id, asset]));
    const selected = requestedIds.length ? requestedIds.map((id) => byId.get(id)).filter(Boolean) : eligible;
    validateAssets(preset, selected);
    const title = resolveListingTemplate(preset.titlePattern || preset.defaultTitleTemplate || "{theme} | {product_type}", { preset, crop, assetCount: selected.length });
    const previewPreset = { ...preset, galleryTemplate: ["hero", ...(preset.galleryTemplate || []).filter((key) => key !== "hero")] };
    const gallery = await buildGallery({ preset: previewPreset, assets: selected, listingTitle: title, previewOnly: true });
    response.json({
      ok: true,
      preview: {
        title: title.slice(0, 140),
        price: Number(preset.price || 0),
        gallery,
        package: {
          assetCount: selected.length,
          formats: preset.packageRules?.formats || ["PNG", "JPG"],
          outputDimensions: preset.packageRules?.outputDimensions || "source",
          folderStructure: preset.packageRules?.folderStructure || "artwork + license",
          fileName: `${String(preset.name || "preset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "preset"}.zip`,
        },
      },
    });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message || "Preview could not be built." });
  }
});

app.post("/api/presets/:id/run", async (request, response) => {
  try {
    const data = readData();
    const preset = (data.productPresets || []).find((item) => item.id === request.params.id);
    if (!preset) {
      response.status(404).json({ ok: false, error: "Preset not found." });
      return;
    }
    const crop = (data.crops || []).find((item) => item.etsyPresetId === preset.id || item.productPresetId === preset.id)
      || (data.crops || []).find((item) => (preset.supportedProductTypes || []).includes(item.productType));
    if (!crop) {
      response.status(409).json({ ok: false, error: "Assign this preset to a product before running it." });
      return;
    }
    const result = await runPresetProduction({ data, preset, crop, assetsDir: ASSETS_DIR, exportsDir: EXPORTS_DIR, makeId, nowIso });
    writeData(data);
    response.json({ ok: true, message: "Preset package is ready for review.", ...result });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message || "Preset could not run." });
  }
});

app.post("/api/crops/:id/listing-draft", (request, response) => {
  const data = readData();
  const crop = data.crops.find((item) => item.id === request.params.id);
  if (!crop) {
    response.status(404).json({ ok: false, error: "Crop not found." });
    return;
  }
  const existing = data.listingDrafts.find((draft) => draft.cropId === crop.id);
  if (existing) {
    response.json({ ok: true, message: "Listing draft already exists.", listingDraft: existing });
    return;
  }
  const selectedAssets = data.assets.filter((asset) => asset.cropId === crop.id && ["approved", "final"].includes(asset.status));
  const listingDraft = {
    id: makeId("listing"), cropId: crop.id, title: `${crop.name} | Digital Download`,
    description: `A carefully curated ${crop.name.toLowerCase()} design for ${crop.targetCustomer || "a cozy space"}. This is a digital item; no physical product is shipped.`,
    tags: [crop.niche, crop.productType.replaceAll("_", " "), "digital download"].filter(Boolean),
    materials: "Digital image files; no physical item is shipped.",
    aiDisclosure: "This item was created with the assistance of generative AI and was curated and finished by the seller.",
    productType: crop.productType, price: 6.5, assetIds: selectedAssets.map((asset) => asset.id),
    mockupAssetIds: [], status: "draft", exportedAt: "", exportPath: "",
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  applyEtsyPreset(data, crop, listingDraft);
  data.listingDrafts.unshift(listingDraft);
  crop.status = "listing_draft";
  crop.updatedAt = nowIso();
  writeData(data);
  response.json({ ok: true, message: "Etsy listing draft created.", listingDraft });
});

app.patch("/api/listing-drafts/:id", (request, response) => {
  const data = readData();
  const index = data.listingDrafts.findIndex((draft) => draft.id === request.params.id);
  if (index < 0) {
    response.status(404).json({ ok: false, error: "Listing draft not found." });
    return;
  }
  // Only operator-editable listing content may come from the browser. Remote
  // Etsy ids, upload checkpoints, prepared files, and activation state are
  // server-owned; accepting a stale form copy of them can erase a checkpoint
  // and create a duplicate remote draft on retry.
  const editableFields = [
    "title", "description", "tags", "materials", "aiDisclosure", "productType",
    "price", "assetIds", "mockupAssetIds", "taxonomyId", "quantity", "whoMade", "whenMade", "presetId",
  ];
  const updates = Object.fromEntries(
    editableFields
      .filter((field) => Object.prototype.hasOwnProperty.call(request.body, field))
      .map((field) => [field, request.body[field]])
  );
  if (typeof updates.tags === "string") {
    updates.tags = updates.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
  if (updates.assetIds && !Array.isArray(updates.assetIds)) delete updates.assetIds;
  if (updates.mockupAssetIds && !Array.isArray(updates.mockupAssetIds)) delete updates.mockupAssetIds;
  data.listingDrafts[index] = { ...data.listingDrafts[index], ...updates, id: data.listingDrafts[index].id, updatedAt: nowIso() };
  if (updates.presetId) {
    const crop = data.crops.find((entry) => entry.id === data.listingDrafts[index].cropId);
    applyEtsyPreset(data, crop, data.listingDrafts[index], updates.presetId, true);
  }
  writeData(data);
  response.json({ ok: true, message: "Listing draft saved.", listingDraft: data.listingDrafts[index] });
});

app.post("/api/listing-drafts/:id/export", (request, response) => {
  const data = readData();
  const listing = data.listingDrafts.find((draft) => draft.id === request.params.id);
  if (!listing) {
    response.status(404).json({ ok: false, error: "Listing draft not found." });
    return;
  }
  const exportPath = exportListingPackage(listing, data);
  listing.exportedAt = nowIso();
  listing.exportPath = exportPath;
  listing.status = "exported";
  listing.updatedAt = nowIso();
  const crop = data.crops.find((item) => item.id === listing.cropId);
  if (crop) {
    crop.status = "exported";
    crop.updatedAt = nowIso();
  }
  writeData(data);
  response.json({ ok: true, message: "Local Etsy harvest package exported.", exportPath });
});

app.post("/api/crops/:id/performance", (request, response) => {
  const data = readData();
  const crop = data.crops.find((item) => item.id === request.params.id);
  if (!crop) {
    response.status(404).json({ ok: false, error: "Crop not found." });
    return;
  }
  const number = (value) => Math.max(0, Number(value || 0));
  const snapshot = {
    id: makeId("performance"), cropId: crop.id,
    views: number(request.body.views), favorites: number(request.body.favorites),
    clicks: number(request.body.clicks), orders: number(request.body.orders),
    revenue: number(request.body.revenue), spend: number(request.body.spend),
    notes: request.body.notes || "", createdAt: nowIso(),
  };
  data.performanceSnapshots.unshift(snapshot);
  crop.status = "tracking";
  crop.performanceNotes = snapshot.notes;
  const recommendation = getCropRecommendation(crop, snapshot);
  crop.recommendation = recommendation.decision;
  crop.updatedAt = nowIso();
  writeData(data);
  response.json({
    ok: true, message: "Performance snapshot saved.", snapshot, recommendation,
    conversionRate: snapshot.clicks ? Number(((snapshot.orders / snapshot.clicks) * 100).toFixed(2)) : 0,
    profitEstimate: Number((snapshot.revenue - snapshot.spend).toFixed(2)),
  });
});

app.post("/api/reset", (request, response) => {
  const starterData = createStarterData();
  writeData(starterData);

  response.json({
    ok: true,
    message: "Demo backend data reset.",
    data: starterData,
  });
});

// Engine routes: presets, listings, marketplace/POD accounts, design review,
// orders, metrics, and the 60-day decision engine. index.cjs stays the single
// owner of readData/writeData and the adapter registry.
registerEngineRoutes(app, { readData, writeData, makeId, nowIso, adapters });

// Land routes: Seeds, Blog Land (priority 1), POD Land (Printful-mediated
// eBay), the channel board, and the unified outputs view.
registerLandRoutes(app, {
  readData,
  writeData,
  makeId,
  nowIso,
  adapters,
  exportsDir: EXPORTS_DIR,
});

// Project board: every shop, channel, app, and game on the farm, with its
// status and next steps.
registerProjectRoutes(app, { readData, writeData, makeId, nowIso });

// Etsy Personal Access test lane: OAuth (PKCE), readiness ladder, shop/setup
// resolution, and the guarded draft-only listing test. Secrets stay under
// server/secrets/ via the injected accessors.
registerEtsyRoutes(app, {
  readData,
  writeData,
  makeId,
  nowIso,
  env: process.env,
  etsyClient,
  readEtsyAuth: () => readSecretJson(ETSY_AUTH_FILE),
  saveEtsyAuth,
  clearEtsyAuth: () => secretStore.remove(path.basename(ETSY_AUTH_FILE)),
  getValidEtsyAuth,
  createPkceRequest,
  savePkce: (pkce) => writeSecretJson(ETSY_PKCE_FILE, pkce),
  readPkce: () => readSecretJson(ETSY_PKCE_FILE),
  clearPkce: () => secretStore.remove(path.basename(ETSY_PKCE_FILE)),
});

registerAutomationRoutes(app, { readData, writeData, makeId, nowIso });

ensureFolders();

const automationScheduler = startAutomationScheduler({ readData, writeData, makeId, nowIso });

const server = app.listen(PORT, () => {
  console.log(`Auto Farmland backend running at http://localhost:${PORT}`);
});

function shutdown() {
  automationScheduler.stop();
  server.close(() => {
    dataStore.close();
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
