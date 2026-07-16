const fs = require("fs");
const path = require("path");

class JsonSecretStore {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true });
  }

  filePath(name) {
    const safeName = path.basename(String(name || ""));
    if (!safeName || safeName !== name) {
      throw new Error("Secret names must be plain file names.");
    }
    return path.join(this.directory, safeName);
  }

  read(name) {
    const filePath = this.filePath(name);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  write(name, value) {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(this.filePath(name), JSON.stringify(value, null, 2));
  }

  remove(name) {
    const filePath = this.filePath(name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

module.exports = { JsonSecretStore };
