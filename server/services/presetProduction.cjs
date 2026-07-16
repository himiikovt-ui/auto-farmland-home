const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createZip } = require("./zipArchive.cjs");

const DEFAULT_GALLERY = ["hero", "included", "details", "formats", "usage", "license"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

function safeName(value, fallback = "preset") {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || fallback;
}

function escapeXml(value) {
  return String(value || "").replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character]));
}

function textSvg(width, height, lines, options = {}) {
  const color = options.color || "#4b4238";
  const background = options.background || "#f8f1dc";
  const startY = options.startY || Math.round(height * 0.36);
  const size = options.size || 70;
  const gap = options.gap || Math.round(size * 1.35);
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${background}"/>${lines.map((line, index) => `<text x="50%" y="${startY + index * gap}" text-anchor="middle" fill="${color}" font-family="Arial, sans-serif" font-size="${index === 0 ? size : Math.round(size * 0.48)}" font-weight="${index === 0 ? 700 : 400}">${escapeXml(line)}</text>`).join("")}</svg>`);
}

async function artworkBuffer(filePath, width, height, fit = "contain", position = "centre") {
  return sharp(filePath).rotate().resize(width, height, { fit, position, background: "#fffdf7" }).flatten({ background: "#fffdf7" }).png().toBuffer();
}

function resolveListingTemplate(template, { preset, crop, assetCount }) {
  const theme = preset.production?.context || preset.creativeStrategy?.subjects?.[0] || crop?.name || preset.name || "Digital collection";
  const productType = String(preset.productType || crop?.productType || "digital product").replaceAll("_", " ");
  const formats = preset.packageRules?.formats || ["PNG", "JPG"];
  const variables = {
    theme,
    subject: theme,
    preset: preset.name || "Preset",
    product_type: productType.replace(/\b\w/g, (character) => character.toUpperCase()),
    asset_count: String(assetCount),
    file_format: formats.join(" + "),
  };
  return String(template || "{theme} | {product_type}").replace(/\{([a-z_]+)\}/gi, (match, key) => variables[key.toLowerCase()] ?? match);
}

async function buildGallery({ preset, assets, outputFolder, listingTitle = "", previewOnly = false }) {
  const template = Array.isArray(preset.galleryTemplate) && preset.galleryTemplate.length ? preset.galleryTemplate : DEFAULT_GALLERY;
  const width = 2000;
  const height = 2000;
  const title = listingTitle || preset.name || "Digital Collection";
  if (!previewOnly) fs.mkdirSync(outputFolder, { recursive: true });
  const outputs = [];
  const write = async (key, pipeline) => {
    const fileName = `${String(outputs.length + 1).padStart(2, "0")}-${key}.jpg`;
    const jpeg = pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" });
    if (previewOnly) {
      const buffer = await jpeg.toBuffer();
      outputs.push({ key, fileName, dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}` });
    } else {
      const filePath = path.join(outputFolder, fileName);
      await jpeg.toFile(filePath);
      outputs.push({ key, fileName, filePath });
    }
  };

  for (const key of template) {
    if (key === "hero") {
      const art = await artworkBuffer(assets[0].filePath, 1420, 1420);
      await write(key, sharp({ create: { width, height, channels: 3, background: "#eee7cf" } }).composite([
        { input: art, left: 290, top: 240 },
        { input: textSvg(width, 220, [title], { background: "transparent", startY: 150, size: 82 }), left: 0, top: 1720 },
      ]));
    } else if (key === "included") {
      const cells = await Promise.all(assets.slice(0, 6).map((asset) => artworkBuffer(asset.filePath, 560, 560)));
      const composites = cells.map((input, index) => ({ input, left: 170 + (index % 3) * 610, top: 350 + Math.floor(index / 3) * 650 }));
      await write(key, sharp({ create: { width, height, channels: 3, background: "#f8f1dc" } }).composite([
        { input: textSvg(width, 260, ["What’s included", `${assets.length} artwork file${assets.length === 1 ? "" : "s"}`], { background: "transparent", startY: 100, size: 78 }), left: 0, top: 50 },
        ...composites,
      ]));
    } else if (key === "details") {
      const source = assets[0].filePath;
      const details = await Promise.all(["left", "centre", "right"].map((position) => artworkBuffer(source, 560, 1320, "cover", position)));
      await write(key, sharp({ create: { width, height, channels: 3, background: "#eee7cf" } }).composite([
        { input: textSvg(width, 220, ["Artwork details"], { background: "transparent", startY: 145, size: 76 }), left: 0, top: 40 },
        ...details.map((input, index) => ({ input, left: 130 + index * 620, top: 380 })),
      ]));
    } else if (key === "formats") {
      const rules = preset.packageRules || {};
      await write(key, sharp(textSvg(width, height, ["Files & format", `${(rules.formats || ["PNG", "JPG"]).join(" + ")} files`, rules.outputDimensions || "Original dimensions", "Instant digital access"], { startY: 620, size: 92, gap: 155 })));
    } else if (key === "usage") {
      const art = await artworkBuffer(assets[0].filePath, 980, 1280);
      await write(key, sharp({ create: { width, height, channels: 3, background: "#dfe7cf" } }).composite([
        { input: art, left: 510, top: 250 },
        { input: textSvg(width, 260, ["Print, plan, and create"], { background: "transparent", startY: 160, size: 72 }), left: 0, top: 1640 },
      ]));
    } else if (key === "license") {
      const license = preset.license || "Personal use";
      await write(key, sharp(textSvg(width, height, ["License & instructions", license, "Download • unzip • enjoy", "No physical product is shipped"], { startY: 620, size: 86, gap: 160 })));
    }
  }
  return outputs;
}

function validateAssets(preset, assets) {
  const rules = preset.packageRules || {};
  const required = Math.max(1, Number(rules.requiredAssetCount || 1));
  if (assets.length < required) throw new Error(`Add ${required - assets.length} more approved artwork file${required - assets.length === 1 ? "" : "s"}.`);
  const invalid = assets.find((asset) => !IMAGE_EXTENSIONS.has(path.extname(asset.filePath || "").toLowerCase()));
  if (invalid) throw new Error("Use approved PNG or JPG artwork files only.");
  const missing = assets.find((asset) => !asset.filePath || !fs.existsSync(asset.filePath));
  if (missing) throw new Error("One approved artwork file is missing from local storage.");
}

async function buildDownloadFiles(preset, assets, folder) {
  const rules = preset.packageRules || {};
  const pattern = String(rules.fileNamePattern || "artwork-{index}");
  const dimensions = String(rules.outputDimensions || "source");
  const match = dimensions.match(/^(\d{2,5})x(\d{2,5})$/i);
  fs.mkdirSync(folder, { recursive: true });
  const files = [];
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const extension = path.extname(asset.filePath).toLowerCase() === ".jpeg" ? ".jpg" : path.extname(asset.filePath).toLowerCase();
    const base = safeName(pattern.replaceAll("{index}", String(index + 1).padStart(2, "0")).replaceAll("{preset}", preset.name || "preset"), `artwork-${index + 1}`);
    const filePath = path.join(folder, `${base}${extension}`);
    if (match) {
      await sharp(asset.filePath).rotate().resize(Number(match[1]), Number(match[2]), { fit: "contain", background: "#fffdf7" }).flatten({ background: "#fffdf7" }).toFile(filePath);
    } else fs.copyFileSync(asset.filePath, filePath);
    files.push({ filePath, fileName: path.basename(filePath) });
  }
  return files;
}

async function runPresetProduction({ data, preset, crop, assetsDir, exportsDir, makeId, nowIso }) {
  const configuredIds = preset.production?.assetIds || [];
  const eligible = (data.assets || []).filter((asset) =>
    asset.cropId === crop.id
    && !asset.isReference
    && !asset.isMockup
    && ["approved", "final"].includes(asset.status)
    && (preset.sourceMode === "api" ? asset.provider !== "manual" : asset.provider === "manual")
  );
  const byId = new Map(eligible.map((asset) => [asset.id, asset]));
  const selected = configuredIds.length ? configuredIds.map((id) => byId.get(id)).filter(Boolean) : eligible;
  validateAssets(preset, selected);

  const runId = makeId("preset-run");
  const assetFolder = path.join(assetsDir, "preset-runs", preset.id, runId);
  const galleryFolder = path.join(assetFolder, "gallery");
  const downloadFolder = path.join(exportsDir, "preset-runs", preset.id, runId, "files");
  const context = preset.production?.context || preset.creativeStrategy?.subjects?.[0] || crop.name;
  const title = resolveListingTemplate(preset.titlePattern || preset.defaultTitleTemplate || "{theme} | Digital Download", { preset, crop, assetCount: selected.length });
  const gallery = await buildGallery({ preset, assets: selected, outputFolder: galleryFolder, listingTitle: title });
  const downloadFiles = await buildDownloadFiles(preset, selected, downloadFolder);
  const galleryAssets = gallery.map((file) => ({
    id: makeId("asset"), cropId: crop.id, batchId: runId, providerRunId: "", provider: "template", model: "preset-gallery-v1",
    prompt: "", negativePrompt: "", dimensions: "2000x2000", quality: "template", seed: null, estimatedCost: 0, actualCost: 0,
    fileName: file.fileName, filePath: file.filePath, publicUrl: `/assets/preset-runs/${preset.id}/${runId}/gallery/${file.fileName}`,
    status: "approved", isMockup: true, isReference: false, galleryRole: file.key, createdAt: nowIso(), updatedAt: nowIso(),
  }));
  const packageRoot = path.dirname(downloadFolder);
  const licenseText = `${preset.license || "Personal use"}\n\n${preset.licenseInstructions || "Use the included files according to the listing terms."}\n`;
  const readmeText = `${preset.name}\n\nFiles: ${downloadFiles.length}\nFormats: ${[...new Set(downloadFiles.map((file) => path.extname(file.fileName).slice(1).toUpperCase()))].join(", ")}\n`;
  const zipPath = path.join(packageRoot, `${safeName(preset.name)}.zip`);
  createZip(zipPath, [
    ...downloadFiles.map((file) => ({ name: `artwork/${file.fileName}`, filePath: file.filePath })),
    { name: "LICENSE.txt", buffer: Buffer.from(licenseText) },
    { name: "README.txt", buffer: Buffer.from(readmeText) },
  ]);

  let listing = (data.listingDrafts || []).find((draft) => draft.cropId === crop.id);
  if (!listing) {
    listing = { id: makeId("listing"), cropId: crop.id, createdAt: nowIso(), externalListingId: "", externalState: "local" };
    data.listingDrafts.unshift(listing);
  }
  Object.assign(listing, {
    presetId: preset.id,
    title: title.slice(0, 140),
    description: preset.descriptionTemplate || listing.description || "Digital product. No physical item is shipped.",
    tags: [...new Set([...(preset.tags || []), context])].map((tag) => String(tag).slice(0, 20)).slice(0, 13),
    materials: "Digital PNG/JPG files in a ZIP package.",
    aiDisclosure: listing.aiDisclosure || "This item was created with the assistance of generative AI and was curated and finished by the seller.",
    productType: preset.productType || crop.productType,
    price: Number(preset.price || listing.price || 0),
    taxonomyId: preset.taxonomyId || listing.taxonomyId || "",
    taxonomyPath: preset.taxonomyPath || listing.taxonomyPath || "",
    quantity: Number(preset.quantity || 1),
    assetIds: selected.map((asset) => asset.id),
    mockupAssetIds: galleryAssets.map((asset) => asset.id),
    preparedProductFile: { fileName: path.basename(zipPath), filePath: zipPath, format: "zip", listingId: listing.id, assetCount: selected.length },
    externalDigitalFileId: "",
    externalGalleryImageIds: {},
    status: "draft",
    updatedAt: nowIso(),
  });
  data.assets.unshift(...galleryAssets);
  const run = { id: runId, presetId: preset.id, cropId: crop.id, sourceMode: preset.sourceMode || "import", assetIds: selected.map((asset) => asset.id), galleryAssetIds: galleryAssets.map((asset) => asset.id), zipPath, status: "ready_for_review", createdAt: nowIso() };
  data.presetRuns ||= [];
  data.presetRuns.unshift(run);
  preset.production = { ...(preset.production || {}), assetIds: selected.map((asset) => asset.id), lastRunId: runId, lastRunAt: nowIso() };
  preset.updatedAt = nowIso();
  return { run, listing, galleryAssets, zipPath };
}

module.exports = { DEFAULT_GALLERY, validateAssets, buildGallery, resolveListingTemplate, runPresetProduction };
