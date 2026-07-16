const fs = require("fs");
const path = require("path");

function createRuntimePaths(env = process.env, serverDir = path.join(__dirname, "..")) {
  const storageRoot = env.AUTO_FARMLAND_STORAGE_DIR
    ? path.resolve(env.AUTO_FARMLAND_STORAGE_DIR)
    : path.resolve(serverDir);
  const dataDir = path.join(storageRoot, "data");

  return {
    storageRoot,
    dataDir,
    exportsDir: path.join(storageRoot, "exports"),
    assetsDir: path.join(storageRoot, "assets"),
    secretsDir: path.join(storageRoot, "secrets"),
    legacyDataFile: path.join(dataDir, "data.json"),
    databaseFile: env.AUTO_FARMLAND_DB_FILE
      ? path.resolve(storageRoot, env.AUTO_FARMLAND_DB_FILE)
      : path.join(dataDir, "auto-farmland.sqlite"),
  };
}

function ensureRuntimeFolders(paths) {
  for (const folder of [paths.dataDir, paths.exportsDir, paths.assetsDir, paths.secretsDir]) {
    fs.mkdirSync(folder, { recursive: true });
  }
}

module.exports = { createRuntimePaths, ensureRuntimeFolders };
