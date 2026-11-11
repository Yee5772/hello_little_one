// Game state and persistence through the local main process.
import { START_FURNITURE } from "./layout.js";

const MIN = 60 * 1000;

export const RULES = {
  startCoins: 99,                  // Sample_Room shows 99
  heartDecayPerMin: 1 / 3,         // -1 every 3 minutes (also while the game is closed)
  heartFloor: 10,
  offlineDecayCap: 40,
  coinValue: 10,
  coinEvery: [45, 90],             // seconds between floor coins
  combEvery: [90, 180], soapEvery: [100, 200], poopAfterMeal: [15, 30],
  postcardFirst: 15 * 60,          // the first AI postcard arrives after 15 minutes of a new game
  postcardEvery: [3 * 3600, 8 * 3600],   // then one every 3-8 hours (real time, checked while playing)
  hearts: { feed: 15, juice: 10, play: 5, comb: 10, soap: 10, clean: 3, chat: 2 },
};

export function defaultState(info) {
  const now = Date.now();
  return {
    version: 1,
    playerId: info.playerId,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    started: false,
    lang: /^zh/i.test(info.locale || "") ? "ch" : "en",
    settings: { music: 0.634375, sfx: 0.634375, musicOn: true, sfxOn: true, resolution: null },
    ...newProgress(now),
  };
}

export function newProgress(now = Date.now()) {
  return {
    coins: RULES.startCoins,
    pet: "C4",
    theme: "T1",
    hearts: { C4: 100, C3: 100 },
    owned: { pets: ["C4"], themes: ["T1"], clothes: [], furniture: [...START_FURNITURE] },
    bagFood: [],
    table: [],
    stored: [],
    ball: null,                     // where the ball was left ({ x, y } top-left) — null = its PSD spot
    floor: { coin: false, poop: false, comb: false, soap: false },
    timers: { coin: now + 30 * 1000, comb: now + 40 * 1000, soap: now + 60 * 1000, poop: 0 },
    curtain: null,
    wardrobe: { C4: { acc: {}, outfit: null }, C3: { acc: {}, outfit: null } },
    outfits: [],
    mail: { read: [], cards: [], nextAuto: now + RULES.postcardFirst * 1000 },
    chat: { C4: [], C3: [] },
    shop: { foodPage: 0 },
    cooldowns: {},
    lastTick: now,
  };
}

export class Store {
  constructor(data) {
    this.d = data;
    this.timer = null;
    this.listeners = new Set();
  }
  get s() { return this.d; }

  // merge in fields added by newer versions so old saves keep working
  static upgrade(d, info) {
    const base = defaultState(info);
    const out = { ...base, ...d };
    out.settings = { ...base.settings, ...(d.settings || {}) };
    for (const k of ["hearts", "owned", "floor", "timers", "wardrobe", "mail", "chat", "shop", "cooldowns"]) out[k] = { ...base[k], ...(d[k] || {}) };
    out.wardrobe.C4 = { acc: {}, outfit: null, ...(out.wardrobe.C4 || {}) };
    out.wardrobe.C3 = { acc: {}, outfit: null, ...(out.wardrobe.C3 || {}) };
    for (const k of ["bagFood", "table", "stored", "outfits"]) if (!Array.isArray(out[k])) out[k] = [];
    if (!Array.isArray(out.owned.furniture)) out.owned.furniture = [...START_FURNITURE];
    if (!Array.isArray(out.mail.cards)) out.mail.cards = [];
    out.playerId = info.playerId;
    return out;
  }

  /** Apply real time that passed (heart decay, pending floor timers). */
  catchUp(now = Date.now()) {
    const d = this.d;
    const mins = Math.max(0, (now - (d.lastTick || now)) / MIN);
    if (mins > 0) {
      const loss = Math.min(RULES.offlineDecayCap, mins * RULES.heartDecayPerMin);
      for (const p of Object.keys(d.hearts)) d.hearts[p] = Math.max(Math.min(d.hearts[p], RULES.heartFloor), d.hearts[p] - loss);
    }
    d.lastTick = now;
  }

  tick(dtSec) {
    const d = this.d;
    const p = d.pet;
    d.hearts[p] = Math.max(RULES.heartFloor, d.hearts[p] - (dtSec / 60) * RULES.heartDecayPerMin);
    d.lastTick = Date.now();
  }

  change(fn, { save = true, now = false } = {}) {
    fn(this.d);
    for (const l of this.listeners) l(this.d);
    if (save) this.save(now);
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  save(now = false) {
    clearTimeout(this.timer);
    const write = () => {
      this.d.updatedAt = new Date().toISOString();
      // Keep only recent messages in the local save.
      for (const k of Object.keys(this.d.chat)) if (this.d.chat[k].length > 20) this.d.chat[k] = this.d.chat[k].slice(-20);
      return window.hlo.writeSave(this.d);
    };
    if (now) return write();
    this.timer = setTimeout(write, 1200);
    return Promise.resolve();
  }
}

export function rand(a, b) { return a + Math.random() * (b - a); }
