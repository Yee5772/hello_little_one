// Bootstrap: assets, state, audio, scenes, frame loop.
import * as assets from "./core/assets.js";
import { Stage } from "./core/stage.js";
import { Input } from "./core/input.js";
import * as springs from "./core/spring.js";
import * as tweens from "./core/tween.js";
import { initAudio, setLevels, sfx } from "./audio.js";
import { Store, defaultState, newProgress } from "./state.js";
import { STR } from "./i18n.js";
import { RESOLUTIONS } from "./layout.js";
import { MenuScene } from "./scenes/menu.js";
import { openSettings } from "./ui/settings.js";
import { registerPostcards } from "./ui/postcards.js";

const game = {
  scenes: {},
  scene: null,
  sceneName: null,
  layers: {},
  get s() { return this.store.d; },
  get lang() { return this.store.d.lang; },
};
window.game = game;

async function boot() {
  const viewport = document.getElementById("viewport");
  const stageEl = document.getElementById("stage");
  game.stage = new Stage(viewport, stageEl);
  game.input = new Input(viewport, game.stage);
  game.layers.scene = game.stage.layer("scene");
  game.layers.ui = game.stage.layer("ui");
  game.layers.modal = game.stage.layer("modal");
  game.layers.fx = game.stage.layer("fx");

  game.info = await window.hlo.info();
  const saved = await window.hlo.loadSave();
  game.store = new Store(saved ? Store.upgrade(saved, game.info) : defaultState(game.info));
  game.store.catchUp();
  document.title = STR.windowTitle[game.s.lang];

  await assets.loadManifest();
  for (const o of game.s.outfits) for (const k of Object.values(o.frames || {})) assets.register(k, 291, 252);
  registerPostcards(game.s);
  await document.fonts.load('40px "ChenYuluoyan"', "跟屁寵Hello 0123456789x").catch(() => {});
  await assets.preloadAll((k) => k.startsWith("menu/") || k.startsWith("setting/"));
  await initAudio();
  setLevels(game.s.settings);

  game.scenes.menu = new MenuScene(game);
  await game.goto("menu", {}, { instant: true });
  // everything else decodes in the background; scenes that need it await `game.ready`
  game.ready = assets.preloadAll((k) => !(k.startsWith("menu/") || k.startsWith("setting/"))).then(loadLateScenes);
  requestAnimationFrame(frame);
  window.hlo.onDesktopReturn((pt) => game.onDesktopReturn && game.onDesktopReturn(pt));
}

async function loadLateScenes() {
  const [{ RoomScene }, { ShopScene }] = await Promise.all([import("./scenes/room.js"), import("./scenes/shop.js")]);
  game.scenes.room = new RoomScene(game);
  game.scenes.shop = new ShopScene(game);
}

let last = performance.now();
let tickAcc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  springs.step(dt);
  tweens.step(dt);
  if (game.scene && game.scene.update) game.scene.update(dt);
  tickAcc += dt;
  if (tickAcc >= 1) { if (game.s.started) game.store.tick(tickAcc); tickAcc = 0; }
  requestAnimationFrame(frame);
}

// ---------- scene switching (cross-fade) ----------
game.goto = async function (name, params = {}, { instant = false } = {}) {
  if (name !== "menu" && game.ready) await game.ready;
  const next = game.scenes[name];
  if (!next || next === game.scene) { if (next && next.reenter) next.reenter(params); return; }
  const prev = game.scene;
  // a window left open over the old scene must not end up underneath the new one
  if (game.modals) for (const m of [...game.modals]) m.close(null, { sound: null });
  game.input.lock(true);
  if (prev && prev.exit) prev.exit(next);
  game.layers.scene.appendChild(next.root);
  game.scene = next; game.sceneName = name;
  next.enter(params);
  if (instant || !prev) { next.root.style.opacity = ""; game.input.lock(false); if (prev) prev.root.remove(); return; }
  next.root.style.opacity = "0";
  await new Promise((r) => tweens.tween({ dur: 0.42, ease: tweens.ease.inOutSine, onUpdate: (e) => { next.root.style.opacity = String(e); }, onDone: r }));
  next.root.style.opacity = "";
  prev.root.remove();
  game.input.lock(false);
};

game.applyLang = function () {
  document.title = STR.windowTitle[game.s.lang];
  for (const sc of Object.values(game.scenes)) if (sc.applyLang) sc.applyLang();
};

game.newGame = async function () {
  game.store.change((d) => {
    Object.assign(d, newProgress());
    d.started = true;
    d.createdAt = new Date().toISOString();
  }, { now: true });
  window.hlo.event("new_game", {});
  if (game.ready) await game.ready;
  if (game.scenes.room) game.scenes.room.reset();
  game.goto("room");
};

game.backToMenu = function () { game.store.save(true); game.goto("menu"); };
game.openSettings = function () { return openSettings(game, { fromMenu: game.sceneName === "menu" }); };
game.quit = async function () { await game.store.save(true); window.hlo.quit(); };
game.setResolution = function (r) { window.hlo.setResolution(r); };
game.currentResolution = function () {
  const w = Math.round(window.innerWidth * (game.info.platform === "darwin" ? 1 : window.devicePixelRatio || 1));   // macOS sizes are points
  let best = RESOLUTIONS[0], bd = Infinity;
  for (const r of RESOLUTIONS) { const d = Math.abs(Number(r.split("x")[0]) - w); if (d < bd) { bd = d; best = r; } }
  return best;
};
window.__hloBeforeQuit = () => game.store.save(true);

window.addEventListener("error", (e) => window.hlo.reportError({ message: e.message, stack: e.error && e.error.stack, scene: game.sceneName }));
window.addEventListener("unhandledrejection", (e) => window.hlo.reportError({ message: String(e.reason && e.reason.message || e.reason), stack: e.reason && e.reason.stack, scene: game.sceneName }));

boot().catch((e) => { console.error(e); window.hlo.reportError({ message: e.message, stack: e.stack, scene: "boot" }); });
