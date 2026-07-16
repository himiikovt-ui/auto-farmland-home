const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { buildGallery, resolveListingTemplate, runPresetProduction } = require("./presetProduction.cjs");

async function fixture(sourceMode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preset-production-"));
  const assetsDir = path.join(root, "assets");
  const exportsDir = path.join(root, "exports");
  fs.mkdirSync(assetsDir, { recursive: true });
  const artworkPath = path.join(root, `${sourceMode}.png`);
  await sharp({ create: { width: 600, height: 800, channels: 3, background: sourceMode === "api" ? "#8cad77" : "#d6a667" } }).png().toFile(artworkPath);
  const preset = {
    id: `preset-${sourceMode}`,
    name: `${sourceMode} preset`,
    sourceMode,
    productType: "journal_page",
    galleryTemplate: ["hero", "included", "details", "formats", "usage", "license"],
    packageRules: { requiredAssetCount: 1, formats: ["PNG", "JPG"], fileNamePattern: "page-{index}", outputDimensions: "1200x1600" },
    production: { assetIds: [`asset-${sourceMode}`] },
    titlePattern: "{subject} Journal Page",
    descriptionTemplate: "A journal page.",
    tags: ["journal page"],
    price: 2,
    taxonomyId: "12475",
    license: "Personal use",
    creativeStrategy: { subjects: ["sheep"] },
  };
  const crop = { id: "crop-1", name: "Pastoral Journal", productType: "journal_page", etsyPresetId: preset.id };
  const data = {
    assets: [{ id: `asset-${sourceMode}`, cropId: crop.id, provider: sourceMode === "api" ? "openai" : "manual", fileName: path.basename(artworkPath), filePath: artworkPath, publicUrl: "/test.png", status: "approved", isReference: false, isMockup: false }],
    listingDrafts: [], productPresets: [preset], crops: [crop], presetRuns: [],
  };
  let counter = 0;
  const result = await runPresetProduction({ data, preset, crop, assetsDir, exportsDir, makeId: (prefix) => `${prefix}-${++counter}`, nowIso: () => "2026-07-16T00:00:00.000Z" });
  return { root, data, result };
}

for (const sourceMode of ["import", "api"]) {
  test(`runs a ${sourceMode} preset without additional generation calls`, async () => {
    const { root, data, result } = await fixture(sourceMode);
    try {
      assert.equal(result.galleryAssets.length, 6);
      assert.ok(result.galleryAssets.every((asset) => fs.existsSync(asset.filePath)));
      assert.ok(fs.existsSync(result.zipPath));
      assert.equal(fs.readFileSync(result.zipPath).subarray(0, 2).toString(), "PK");
      assert.equal(result.listing.preparedProductFile.format, "zip");
      assert.equal(result.listing.mockupAssetIds.length, 6);
      assert.equal(data.presetRuns[0].sourceMode, sourceMode);
      assert.equal(data.providerRuns, undefined);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test("returns a short validation error when approved artwork is missing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preset-validation-"));
  const preset = { id: "empty", name: "Empty", sourceMode: "import", packageRules: { requiredAssetCount: 2 }, production: { assetIds: [] } };
  const crop = { id: "crop", name: "Empty", productType: "digital_download" };
  await assert.rejects(() => runPresetProduction({ data: { assets: [], listingDrafts: [] }, preset, crop, assetsDir: path.join(root, "assets"), exportsDir: path.join(root, "exports"), makeId: (prefix) => prefix, nowIso: () => "now" }), /Add 2 more approved artwork files/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("builds an in-memory preview without changing its source artwork", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preset-preview-"));
  const artworkPath = path.join(root, "approved.png");
  await sharp({ create: { width: 500, height: 700, channels: 3, background: "#8cad77" } }).png().toFile(artworkPath);
  const before = fs.readFileSync(artworkPath);
  const preset = {
    name: "Wildflower Pages",
    productType: "journal_page",
    galleryTemplate: ["hero", "formats"],
    titlePattern: "{theme} {product_type} | {asset_count} {file_format}",
    packageRules: { formats: ["PNG", "JPG"] },
    creativeStrategy: { subjects: ["wildflowers"] },
  };
  const crop = { name: "Journal", productType: "journal_page" };
  const title = resolveListingTemplate(preset.titlePattern, { preset, crop, assetCount: 3 });
  const gallery = await buildGallery({ preset, assets: [{ filePath: artworkPath }], listingTitle: title, previewOnly: true });
  assert.equal(title, "wildflowers Journal Page | 3 PNG + JPG");
  assert.equal(gallery.length, 2);
  assert.ok(gallery.every((item) => item.dataUrl.startsWith("data:image/jpeg;base64,")));
  assert.ok(gallery.every((item) => item.filePath === undefined));
  assert.deepEqual(fs.readFileSync(artworkPath), before);
  assert.deepEqual(fs.readdirSync(root), ["approved.png"]);
  fs.rmSync(root, { recursive: true, force: true });
});
