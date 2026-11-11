// Local save with a backup of the previous revision.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class SaveStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, "save.json");
    this.bak = path.join(dir, "save.bak.json");
    this.playerFile = path.join(dir, "player.json");
    fs.mkdirSync(dir, { recursive: true });
  }

  // Stable per-install identity (survives "New Game").
  player() {
    try {
      const p = JSON.parse(fs.readFileSync(this.playerFile, "utf8"));
      if (p && p.id) return p;
    } catch { /* first run */ }
    const p = { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    fs.writeFileSync(this.playerFile, JSON.stringify(p, null, 1));
    return p;
  }

  readLocal() {
    for (const f of [this.file, this.bak]) {
      try {
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        if (j && typeof j === "object") return j;
      } catch { /* missing or corrupt: try the backup */ }
    }
    return null;
  }

  writeLocal(obj) {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj));
    if (fs.existsSync(this.file)) { try { fs.copyFileSync(this.file, this.bak); } catch { /* ignore */ } }
    fs.renameSync(tmp, this.file);
  }

  load() { return this.readLocal(); }

  save(obj) { this.writeLocal(obj); }

  outfitDir(id) { const d = path.join(this.dir, "outfits", id.replace(/[^a-zA-Z0-9_-]/g, "")); fs.mkdirSync(d, { recursive: true }); return d; }
}

module.exports = { SaveStore };
