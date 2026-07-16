const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SqliteStore } = require("./sqliteStore.cjs");

function createTestStore(root, initialData) {
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const legacyDataFile = path.join(dataDir, "data.json");
  if (initialData) fs.writeFileSync(legacyDataFile, JSON.stringify(initialData));

  return new SqliteStore({
    databaseFile: path.join(dataDir, "auto-farmland.sqlite"),
    legacyDataFile,
    createInitialData: () => ({ schemaVersion: 1, crops: [] }),
    migrateData: (data) => {
      data.migrated = true;
      data.crops ||= [];
      return data;
    },
    nowIso: () => "2026-07-15T00:00:00.000Z",
  });
}

test("imports legacy JSON once and retains a backup", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmland-sqlite-import-"));
  const store = createTestStore(root, {
    schemaVersion: 4,
    settings: { automationEnabled: false },
    crops: [{ id: "crop-one", name: "Journal pages" }],
  });
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const data = store.read();
  assert.equal(data.schemaVersion, 4);
  assert.equal(data.settings.automationEnabled, false);
  assert.deepEqual(data.crops, [{ id: "crop-one", name: "Journal pages" }]);
  assert.equal(data.migrated, true);
  assert.equal(fs.existsSync(path.join(root, "data", "data.json.pre-sqlite-backup")), true);
  assert.equal(store.status().legacy_json_imported, "true");
});

test("writes arrays as ordered records and root values transactionally", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmland-sqlite-write-"));
  const store = createTestStore(root);
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  store.write({
    schemaVersion: 4,
    integrations: { etsy: { shopId: "123" } },
    crops: [
      { id: "crop-a", name: "First" },
      { id: "crop-b", name: "Second" },
    ],
    listingDrafts: [{ id: "listing-a", cropId: "crop-a" }],
  });

  const data = store.read();
  assert.deepEqual(data.crops.map((crop) => crop.id), ["crop-a", "crop-b"]);
  assert.equal(data.integrations.etsy.shopId, "123");
  assert.equal(data.listingDrafts[0].cropId, "crop-a");
  assert.equal(store.status().collectionCounts.crops, 2);
});
