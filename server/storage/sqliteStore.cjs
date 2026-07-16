const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const STORAGE_SCHEMA_VERSION = 1;

class SqliteStore {
  constructor(options) {
    this.databaseFile = options.databaseFile;
    this.legacyDataFile = options.legacyDataFile;
    this.createInitialData = options.createInitialData;
    this.migrateData = options.migrateData;
    this.nowIso = options.nowIso || (() => new Date().toISOString());
    this.db = null;
    this.importedLegacyJson = false;
  }

  initialize() {
    if (this.db) return;

    fs.mkdirSync(path.dirname(this.databaseFile), { recursive: true });
    this.db = new DatabaseSync(this.databaseFile);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storage_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS root_values (
        key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS collection_records (
        collection_name TEXT NOT NULL,
        position INTEGER NOT NULL,
        entity_key TEXT,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (collection_name, position)
      );
      CREATE INDEX IF NOT EXISTS idx_collection_records_entity
        ON collection_records(collection_name, entity_key);
    `);

    const initialized = this.db
      .prepare("SELECT value FROM storage_meta WHERE key = ?")
      .get("initialized_at");

    if (!initialized) {
      const initialData = this.readLegacyJson() || this.createInitialData();
      const migrated = this.migrateData(initialData);
      this.writeSnapshot(migrated, { initialize: true });
    }
  }

  readLegacyJson() {
    if (!this.legacyDataFile || !fs.existsSync(this.legacyDataFile)) return null;

    const raw = fs.readFileSync(this.legacyDataFile, "utf8");
    const parsed = JSON.parse(raw);
    const backupPath = `${this.legacyDataFile}.pre-sqlite-backup`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(this.legacyDataFile, backupPath);
    }
    this.importedLegacyJson = true;
    return parsed;
  }

  read() {
    this.initialize();
    const data = {};

    for (const row of this.db.prepare("SELECT key, payload_json FROM root_values ORDER BY key").all()) {
      data[row.key] = JSON.parse(row.payload_json);
    }

    for (const row of this.db
      .prepare(
        "SELECT collection_name, payload_json FROM collection_records ORDER BY collection_name, position"
      )
      .all()) {
      data[row.collection_name] ||= [];
      data[row.collection_name].push(JSON.parse(row.payload_json));
    }

    const beforeMigration = JSON.stringify(data);
    const migrated = this.migrateData(data);
    if (JSON.stringify(migrated) !== beforeMigration) {
      this.writeSnapshot(migrated);
    }
    return migrated;
  }

  write(data) {
    this.initialize();
    this.writeSnapshot(data);
  }

  writeSnapshot(data, options = {}) {
    const insertRoot = this.db.prepare(
      "INSERT INTO root_values (key, payload_json) VALUES (?, ?)"
    );
    const insertRecord = this.db.prepare(
      "INSERT INTO collection_records (collection_name, position, entity_key, payload_json) VALUES (?, ?, ?, ?)"
    );
    const setMeta = this.db.prepare(
      "INSERT INTO storage_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("DELETE FROM root_values; DELETE FROM collection_records;");
      for (const [key, value] of Object.entries(data || {})) {
        if (Array.isArray(value)) {
          value.forEach((entry, position) => {
            const entityKey = entry && typeof entry === "object" && entry.id != null
              ? String(entry.id)
              : null;
            insertRecord.run(key, position, entityKey, JSON.stringify(entry));
          });
        } else {
          insertRoot.run(key, JSON.stringify(value));
        }
      }

      const writtenAt = this.nowIso();
      setMeta.run("storage_schema_version", String(STORAGE_SCHEMA_VERSION));
      setMeta.run("last_written_at", writtenAt);
      if (options.initialize) {
        setMeta.run("initialized_at", writtenAt);
        setMeta.run("legacy_json_imported", this.importedLegacyJson ? "true" : "false");
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  status() {
    this.initialize();
    const meta = Object.fromEntries(
      this.db.prepare("SELECT key, value FROM storage_meta ORDER BY key").all().map((row) => [row.key, row.value])
    );
    const collectionCounts = Object.fromEntries(
      this.db
        .prepare(
          "SELECT collection_name, COUNT(*) AS count FROM collection_records GROUP BY collection_name ORDER BY collection_name"
        )
        .all()
        .map((row) => [row.collection_name, Number(row.count)])
    );
    return {
      engine: "sqlite",
      databaseFile: this.databaseFile,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      ...meta,
      collectionCounts,
    };
  }

  close() {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }
}

module.exports = { SqliteStore, STORAGE_SCHEMA_VERSION };
