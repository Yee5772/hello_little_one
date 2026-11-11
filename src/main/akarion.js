// AkarionHub client (https://akarion.dev). Spec: ../../../akarionhub/SKILL.md
// Every call runs in the main process so the API key never reaches page scripts.
"use strict";
const os = require("os");

const SAVE_TABLE = "hlo_saves";
const OUTFIT_TABLE = "hlo_outfits";

class AkarionError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

class Akarion {
  constructor(cfg, log = console) {
    this.cfg = cfg.akarion;
    this.ai = cfg.ai;
    this.log = log;
    this.playerId = null;
    this.playerReady = Promise.resolve(false);
    this.tablesReady = null;
  }

  get enabled() { return !!this.cfg.apiKey; }
  get isDevKey() { return this.cfg.keyMode === "development"; }

  headers(extra = {}) {
    const h = { Authorization: `Bearer ${this.cfg.apiKey}`, ...extra };
    if (this.playerId) h["X-Player-Id"] = this.playerId;
    return h;
  }

  async request(method, p, { json, form, timeout = 30000, retries = 1 } = {}) {
    if (!this.enabled) throw new AkarionError("AkarionHub API key is not configured", 0);
    const url = this.cfg.baseUrl + "/api/v1" + p;
    for (let attempt = 0; ; attempt++) {
      let res, text;
      try {
        const init = { method, headers: this.headers(json ? { "Content-Type": "application/json" } : {}), signal: AbortSignal.timeout(timeout) };
        if (json !== undefined) init.body = JSON.stringify(json);
        if (form) init.body = form;
        res = await fetch(url, init);
        text = await res.text();
      } catch (e) {
        if (attempt < retries) { await sleep(1200); continue; }
        throw new AkarionError(`network: ${e.message}`, 0);
      }
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
      if (res.ok) return { status: res.status, data };
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 8) * 1000 : 1500);
        continue;
      }
      const msg = (data && data.error && (data.error.message || data.error)) || `HTTP ${res.status}`;
      throw new AkarionError(String(msg), res.status, data);
    }
  }

  // ---------- players ----------
  setPlayer(playerId, displayName) {
    this.playerId = playerId;
    if (!this.enabled) return this.playerReady = Promise.resolve(false);
    this.playerReady = this.request("POST", "/players", {
      json: {
        project_id: this.cfg.projectId, player_id: playerId, display_name: displayName,
        platform: process.platform === "darwin" ? "macos" : "windows", os: `${os.type()} ${os.release()}`,
        ...(this.isDevKey ? { unlimited_ai_credits: true } : {}),
      },
      timeout: 15000,
    }).then(() => true).catch((e) => { this.log.warn("[akarion] player register failed:", e.message); return false; });
    return this.playerReady;
  }

  // ---------- AI chat ----------
  async chat({ messages, model, maxTokens = 220, temperature = 0.9 }, attempt = 0) {
    await this.playerReady;
    const { data } = await this.request("POST", "/ai/chat", {
      json: { project_id: this.cfg.projectId, user_id: this.playerId, model: model || this.ai.chatModel,
        messages, max_tokens: maxTokens, temperature, stream: false },
      timeout: 30000,
    });
    const choice = data && data.choices && data.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (!content) {
      // an occasional empty completion from upstream: ask once more before giving up
      if (attempt < 1) return this.chat({ messages, model, maxTokens, temperature }, attempt + 1);
      throw new AkarionError(`empty chat reply (finish_reason: ${(choice && choice.finish_reason) || "none"})`, 502, data);
    }
    return String(content);
  }

  // ---------- media library ----------
  async uploadMedia(buffer, fileName, mime, folder) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), fileName);
    form.append("folder_path", folder);
    const { data } = await this.request("POST", "/media/upload", { form, timeout: 60000 });
    return { id: data.id, url: data.public_url };
  }

  async download(url, timeout = 60000) {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new AkarionError(`download HTTP ${res.status}`, res.status);
    return Buffer.from(await res.arrayBuffer());
  }

  // ---------- AI outfit (image edit of the pet's animation sprite sheet) ----------
  async outfitEdit({ sheet, width, height, prompt, promptWhiteBg }) {
    await this.playerReady;
    const src = await this.uploadMedia(sheet, `outfit_src_${Date.now()}.png`, "image/png", `hlo/outfit-src/${this.playerId}`);
    try {
      const { data } = await this.request("POST", "/media", {
        json: { project_id: this.cfg.projectId, user_id: this.playerId, model: this.ai.outfitModel,
          input: { prompt, image_urls: [src.url], image_size: { width, height }, background: "transparent", quality: "medium", output_format: "png" } },
        timeout: 180000, retries: 0,
      });
      const u = (data.image && data.image.url) || (data.images && data.images[0] && data.images[0].url);
      if (!u) throw new AkarionError("no image in response", 502, data);
      return { buffer: await this.download(u), transparent: true, model: this.ai.outfitModel, url: u };
    } catch (e) {
      this.log.warn("[akarion] primary outfit model failed, trying fallback:", e.message);
    }
    const { data } = await this.request("POST", "/ai/chat", {
      json: { project_id: this.cfg.projectId, user_id: this.playerId, model: this.ai.outfitFallbackModel, modalities: ["image", "text"],
        messages: [{ role: "user", content: [{ type: "text", text: promptWhiteBg }, { type: "image_url", image_url: { url: src.url } }] }] },
      timeout: 180000, retries: 0,
    });
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const u = (msg && msg.images && msg.images[0] && msg.images[0].image_url && msg.images[0].image_url.url) ||
      (data && data._akarion && data._akarion.image_urls && data._akarion.image_urls[0]);
    if (!u) throw new AkarionError("fallback returned no image", 502, data);
    const buffer = u.startsWith("data:") ? Buffer.from(u.split(",")[1], "base64") : await this.download(u);
    return { buffer, transparent: false, model: this.ai.outfitFallbackModel, url: u.startsWith("data:") ? null : u };
  }

  // ---------- AI postcard picture (drawn with the delivered mailbox photo as style reference) ----------
  async postcardImage({ prompt, ref, width, height }) {
    await this.playerReady;
    if (!this.postcardRef) {
      this.postcardRef = this.uploadMedia(ref, "postcard_style_ref.png", "image/png", "hlo/postcard-ref");
      this.postcardRef.catch(() => { this.postcardRef = null; });
    }
    const src = await this.postcardRef;
    try {
      const { data } = await this.request("POST", "/media", {
        json: { project_id: this.cfg.projectId, user_id: this.playerId, model: this.ai.postcardModel,
          input: { prompt, image_urls: [src.url], image_size: { width, height }, quality: "medium", output_format: "png" } },
        timeout: 180000, retries: 0,
      });
      const u = (data.image && data.image.url) || (data.images && data.images[0] && data.images[0].url);
      if (!u) throw new AkarionError("no image in response", 502, data);
      return { buffer: await this.download(u), model: this.ai.postcardModel };
    } catch (e) {
      this.log.warn("[akarion] primary postcard model failed, trying fallback:", e.message);
    }
    const { data } = await this.request("POST", "/ai/chat", {
      json: { project_id: this.cfg.projectId, user_id: this.playerId, model: this.ai.postcardFallbackModel, modalities: ["image", "text"],
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: src.url } }] }] },
      timeout: 180000, retries: 0,
    });
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const u = (msg && msg.images && msg.images[0] && msg.images[0].image_url && msg.images[0].image_url.url) ||
      (data && data._akarion && data._akarion.image_urls && data._akarion.image_urls[0]);
    if (!u) throw new AkarionError("fallback returned no image", 502, data);
    const buffer = u.startsWith("data:") ? Buffer.from(u.split(",")[1], "base64") : await this.download(u);
    return { buffer, model: this.ai.postcardFallbackModel };
  }

  // ---------- data tables (cloud save + outfit records) ----------
  async ensureTables() {
    if (this.tablesReady) return this.tablesReady;
    this.tablesReady = (async () => {
      const { data } = await this.request("GET", "/data", { timeout: 15000 });
      const have = new Set(((data && data.data) || []).map((t) => t.table_name));
      if (!this.isDevKey) return have.has(SAVE_TABLE); // player keys cannot create tables
      const defs = [
        { table_name: SAVE_TABLE, description: "Hello Little One — player save games (one row per player, id = player id)",
          schema: [{ name: "player_id", type: "text", required: true }, { name: "save", type: "json" }, { name: "version", type: "number" }, { name: "saved_at", type: "date" }] },
        { table_name: OUTFIT_TABLE, description: "Hello Little One — AI generated pet outfits (frames live in the media library)",
          schema: [{ name: "player_id", type: "text", required: true }, { name: "outfit_id", type: "text" }, { name: "pet", type: "text" },
            { name: "prompt", type: "text" }, { name: "frames", type: "json" }, { name: "model", type: "text" }, { name: "created", type: "date" }] },
      ];
      for (const d of defs) {
        if (have.has(d.table_name)) continue;
        try { await this.request("POST", "/data", { json: d, timeout: 15000 }); }
        catch (e) { if (e.status !== 409) throw e; }
      }
      return true;
    })().catch((e) => { this.log.warn("[akarion] ensureTables:", e.message); this.tablesReady = null; return false; });
    return this.tablesReady;
  }

  async loadCloudSave(playerId) {
    if (!(await this.ensureTables())) return null;
    try {
      const { data } = await this.request("GET", `/data/${SAVE_TABLE}/${encodeURIComponent(playerId)}`, { timeout: 15000 });
      return data && data.save ? data : null;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async storeCloudSave(playerId, save) {
    if (!(await this.ensureTables())) return false;
    const body = { player_id: playerId, save, version: save.version || 1, saved_at: new Date().toISOString() };
    try {
      await this.request("PATCH", `/data/${SAVE_TABLE}/${encodeURIComponent(playerId)}`, { json: body, timeout: 20000 });
    } catch (e) {
      if (e.status !== 404) throw e;
      await this.request("POST", `/data/${SAVE_TABLE}`, { json: { id: playerId, ...body }, timeout: 20000 });
    }
    return true;
  }

  async recordOutfit(rec) {
    if (!(await this.ensureTables())) return false;
    await this.request("POST", `/data/${OUTFIT_TABLE}`, { json: { player_id: this.playerId, ...rec }, timeout: 20000 });
    return true;
  }

  // ---------- telemetry (fire and forget) ----------
  reportError(err, extra = {}) {
    if (!this.enabled) return;
    this.request("POST", "/errors", {
      json: { severity: extra.severity || "error", message: String(err && err.message || err).slice(0, 500),
        stack_trace: String(err && err.stack || "").slice(0, 4000), player_id: this.playerId || undefined,
        device: { os: `${os.type()} ${os.release()}`, arch: os.arch() }, game: { version: extra.version, scene: extra.scene } },
      timeout: 10000, retries: 0,
    }).catch(() => {});
  }

  event(type, data) {
    if (!this.enabled) return;
    this.request("POST", "/events", { json: { project_id: this.cfg.projectId, player_id: this.playerId, event_type: type, event_data: data || {}, source: "HelloLittleOne" }, timeout: 10000, retries: 0 }).catch(() => {});
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { Akarion, AkarionError };
