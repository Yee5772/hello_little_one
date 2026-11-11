// Desktop pet: lives in a transparent click-through overlay. It falls with gravity, lands on the
// taskbar line or on the visible top edge of real windows (File Explorer…), rides along when a
// window moves, can be picked up and thrown, and goes home when dropped onto the game window.
import * as assets from "../renderer/js/core/assets.js";
import { Input, Scope } from "../renderer/js/core/input.js";
import * as springs from "../renderer/js/core/spring.js";
import * as tweens from "../renderer/js/core/tween.js";
import { spring, set, P } from "../renderer/js/core/spring.js";
import { PetView } from "../renderer/js/pet/pet.js";
import { ChatUI, askPet } from "../renderer/js/ui/chat.js";
import { t } from "../renderer/js/i18n.js";
import { initAudio, setLevels, sfx } from "../renderer/js/audio.js";
import { PETS, PET_FRAME, CHAT } from "../renderer/js/layout.js";

const W = PET_FRAME.w, H = PET_FRAME.h;
const GRAV = 3400, WALK_SPEED = 115;
let S = 0.6;                       // world units = DIP / S
let cfg, view, world, input, scope, chat;
let plats = [], ground = 1000, areaW = 1920;
let cursor = null;                 // macOS: the pointer position as seen by the main process (overlay DIP)
const st = { x: 0, y: 0, vx: 0, vy: 0, mode: "fall", plat: null, relX: 0, t: 0, fi: 0, idleT: 1.5, walkTo: null, drag: null, cap: false, history: [], newMsgs: [] };
const rnd = (a, b) => a + Math.random() * (b - a);

window.pet.onInit(async (p) => {
  cfg = p;
  S = p.scale || 0.6;
  await assets.loadManifest();
  for (const k of Object.values(p.outfit?.frames || {})) assets.register(k, W, H);
  await Promise.all([...["Default", "Walking_1", "Walking_2", "Walking_3", "Walking_4", "Action_1", "Action_2"].map((f) => assets.load(`anim/${p.pet}_${f}.png`)),
    ...Object.values(p.outfit?.frames || {}).map((k) => assets.load(k)), ...["sunglasses", "bow"].map((c) => assets.load(`shop_dressing/Cloth_${c === "bow" ? "Bow" : "SunGlasses"}.png`)),
    ...["UI_Dialog", "UI_Dialog_Tail", "UI_Type_Bar", "UI_Type_Send_Default", "UI_Type_Send_Hover", "UI_Type_Send_Active"].map((n) => assets.load(`${PETS[p.pet].folder}/${n}.png`))]);
  await document.fonts.load('34px "ChenYuluoyan"', "汪喵Hello").catch(() => {});
  await initAudio();
  setLevels(p.levels || {});
  areaW = p.area.width / S;
  ground = p.ground / S;
  world = document.getElementById("world");
  world.style.zoom = String(S);
  Object.assign(world.style, { width: areaW + "px", height: p.area.height / S + "px" });
  view = new PetView(world, { pet: p.pet, x: 0, y: 0 });
  view.setAccessories(p.acc || {});
  view.setOutfit(p.outfit || null);
  st.history = p.history || [];
  // start at the game's door, flying out of the window
  st.x = p.start.x / S - W / 2;
  st.y = p.start.y / S - H * 0.62;
  st.vx = p.start.vx || 380; st.vy = p.start.vy || -700;
  st.mode = "fall";
  view.setFacing(-1, false);
  view.show("Walking_2");
  view.setPos(st.x, st.y);
  set(view.root, { sx: 0.7, sy: 0.7 }); spring(view.root, { sx: 1, sy: 1 }, P.pop);
  // input (stage coordinates = world units)
  const vp = document.getElementById("viewport");
  input = new Input(vp, { toStage: (cx, cy) => ({ x: cx / S, y: cy / S }) });
  scope = new Scope("desktop", { onBackgroundClick: () => { if (chat.isOpen) chat.close(); } });
  input.push(scope);
  chat = new ChatUI({ parent: world, scope, folder: PETS[p.pet].folder, onSend: (txt) => talk(txt), onClose: () => { window.pet.setFocusable(false); st.idleT = 1.2; } });
  chat.attach(scope);
  scope.add({ z: 100, cursor: "grab", hit: (pt) => view.hitTest(pt.x, pt.y), drag: dragHandlers(), click: () => onPetClick() });
  vp.addEventListener("pointermove", (e) => updateCapture(e.clientX, e.clientY));
  if (p.automation) {
    window.__petTestExplorer = () => {
      const perch = plats.find((platform) => platform.explorer);
      if (!perch) return false;
      const feetOffset = feetX() - st.x;
      st.x = (perch.x1 + perch.x2) / 2 - feetOffset;
      st.y = perch.y - H - 25;
      st.vx = st.vy = 0;
      st.mode = "fall";
      st.plat = null;
      return true;
    };
    window.__petTestDrag = (x, y) => {
      const start = { x: st.x + W / 2, y: st.y + H * 0.56 };
      if (!view.hitTest(start.x, start.y)) return false;
      const pointer = (type, clientX, clientY) => vp.dispatchEvent(new PointerEvent(type, {
        clientX, clientY, button: 0, buttons: 1, pointerId: 1, bubbles: true, cancelable: true,
      }));
      pointer("pointerdown", start.x * S, start.y * S);
      pointer("pointermove", x, y);
      pointer("pointerup", x, y);
      return true;
    };
  }
  requestAnimationFrame(frame);
});

// read-only snapshot for the verification tools
window.__petDebug = () => ({ mode: st.mode, x: st.x, y: st.y, feet: [feetX(), feetY()], plat: st.plat, scale: S, ground, cap: st.cap, platforms: plats.length, explorerPlatforms: plats.filter((q) => q.explorer).length });

window.pet.onPlatforms((list) => {
  plats = list.map((q) => ({ id: q.id, x1: q.x1 / S, x2: q.x2 / S, y: q.y / S, wx: (q.wx ?? q.x1) / S, explorer: q.explorer, game: q.game }));
});
window.pet.onCursor((p) => { cursor = p; });

// click-through everywhere except on the pet and its chat UI
function updateCapture(cx, cy) {
  const pt = { x: cx / S, y: cy / S };
  const over = view.hitTest(pt.x, pt.y) || (chat && chat.isOpen && chat.nodes.some((n) => n.hit(pt)));
  const want = over || !!st.drag;
  if (want !== st.cap) { st.cap = want; window.pet.setIgnore(!want); }
}

function feetX() { return st.x + (PETS[cfg.pet].alpha.x0 + PETS[cfg.pet].alpha.x1) / 2; }
function feetY() { return st.y + H; }

function support(fx, fy, prevFy) {
  // the highest surface crossed while moving down this frame
  let best = null;
  for (const q of plats) if (fx >= q.x1 && fx <= q.x2 && q.y >= prevFy - 1 && q.y <= fy + 1) if (!best || q.y < best.y) best = q;
  if (!best && prevFy <= ground + 1 && fy >= ground - 1) best = { id: "ground", x1: 0, x2: areaW, y: ground, wx: 0 };
  return best;
}

function land(q) {
  st.plat = q; st.relX = feetX() - q.wx;
  st.y = q.y - H; st.vy = 0; st.vx = 0;
  st.mode = "idle"; st.idleT = 0.8 + Math.random() * 2;
  view.show("Default");
  set(view.root, { sy: 0.78, sx: 1.14 }); spring(view.root, { sx: 1, sy: 1 }, P.release);
  sfx("land");
}

function currentPlat() {
  if (!st.plat) return null;
  if (st.plat.id === "ground") return { ...st.plat, y: ground, x2: areaW };
  // same window, still visible under the pet's feet?
  const cand = plats.filter((q) => q.id === st.plat.id);
  if (!cand.length) return null;
  const wx = cand[0].wx;
  const x = wx + st.relX;
  return cand.find((q) => x >= q.x1 - 2 && x <= q.x2 + 2) || null;
}

function frame(now) {
  const dt = Math.min(0.04, (now - (frame.last || now)) / 1000);
  frame.last = now;
  springs.step(dt); tweens.step(dt);
  step(dt);
  if (cursor) updateCapture(cursor.x, cursor.y);   // every frame: the pet may also walk under a resting pointer
  requestAnimationFrame(frame);
}

function step(dt) {
  st.t += dt;
  if (st.drag) { view.setPos(st.x, st.y); return; }
  if (st.mode === "fall") {
    const prevFy = feetY();
    st.vy += GRAV * dt;
    st.x += st.vx * dt; st.y += st.vy * dt;
    st.vx *= 1 - 0.6 * dt;
    if (st.x < -W * 0.3) { st.x = -W * 0.3; st.vx = Math.abs(st.vx) * 0.5; }
    if (st.x > areaW - W * 0.7) { st.x = areaW - W * 0.7; st.vx = -Math.abs(st.vx) * 0.5; }
    if (st.vy > 0) { const q = support(feetX(), feetY(), prevFy); if (q) land(q); }
    if (st.t > 0.12) { st.t = 0; view.show(st.vy < 0 ? "Walking_2" : "Action_1"); }
    view.setPos(st.x, st.y);
    return;
  }
  // standing on something
  const q = currentPlat();
  if (!q) { st.mode = "fall"; st.plat = null; st.vy = 0; return; }
  st.plat = q;
  st.y = q.y - H;
  const fx = q.wx + st.relX;
  st.x = fx - (PETS[cfg.pet].alpha.x0 + PETS[cfg.pet].alpha.x1) / 2;
  if (chat && chat.isOpen) { view.setPos(st.x, st.y); chat.move(anchors()); return; }
  if (st.mode === "walk") {
    const dir = Math.sign(st.walkTo - fx);
    const nx = fx + dir * WALK_SPEED * dt;
    const edge = nx < q.x1 + 6 || nx > q.x2 - 6;
    if (edge && !st.jumpOff) { st.mode = "idle"; st.idleT = 1 + Math.random() * 2; view.show("Default"); }
    else if (edge && st.jumpOff) { st.mode = "fall"; st.plat = null; st.vx = dir * 160; st.vy = -380; st.jumpOff = false; sfx("jump", { vol: 0.7 }); }
    else if (Math.abs(st.walkTo - fx) < 3) { st.mode = "idle"; st.idleT = 1.5 + Math.random() * 3; view.show("Default"); }
    else { st.relX += dir * WALK_SPEED * dt; if (st.t > 0.11) { st.t = 0; st.fi = (st.fi + 1) % 4; view.show(["Walking_1", "Walking_2", "Walking_3", "Walking_4"][st.fi]); } }
  } else if (st.mode === "act") {
    st.actT -= dt;
    if (st.t > 0.24) { st.t = 0; st.fi = (st.fi + 1) % 2; view.show(st.fi ? "Action_2" : "Action_1"); }
    if (st.actT <= 0) { st.mode = "idle"; st.idleT = 1 + Math.random() * 2; view.show("Default"); }
  } else {
    st.idleT -= dt;
    if (st.idleT <= 0) decide(q, fx);
  }
  view.setPos(st.x, st.y);
}

function decide(q, fx) {
  const r = Math.random();
  if (r < 0.2) { st.mode = "act"; st.actT = 1 + Math.random(); st.t = 0; st.fi = 0; view.show("Action_1"); return; }
  const span = q.x2 - q.x1;
  let target;
  st.jumpOff = q.id !== "ground" && r > 0.82;
  if (st.jumpOff) target = Math.random() < 0.5 ? q.x1 - 20 : q.x2 + 20;
  else target = Math.max(q.x1 + 30, Math.min(q.x2 - 30, fx + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * Math.min(420, span * 0.6))));
  st.walkTo = target;
  st.mode = "walk";
  view.setFacing(target > fx ? -1 : 1);
}

// ---------------------------------------------------------------- pick up / throw / go home
function dragHandlers() {
  let last = null, vel = { x: 0, y: 0 }, off = { x: 0, y: 0 };
  return {
    start: (pt0) => {
      if (chat.isOpen) chat.close(true);
      st.drag = true; st.mode = "fall"; st.plat = null;
      off = { x: pt0.x - st.x, y: pt0.y - st.y };
      last = { ...pt0, t: performance.now() };
      view.show("Action_1");
      spring(view.root, { sx: 1.06, sy: 1.06 }, P.hover);
      sfx("pickup");
    },
    move: (pt) => {
      const t = performance.now(), d = Math.max(1, t - last.t) / 1000;
      vel = { x: vel.x * 0.6 + ((pt.x - last.x) / d) * 0.4, y: vel.y * 0.6 + ((pt.y - last.y) / d) * 0.4 };
      last = { ...pt, t };
      st.x = pt.x - off.x; st.y = pt.y - off.y;
      spring(view.root, { r: Math.max(-28, Math.min(28, vel.x * 0.018)) }, P.soft);
    },
    end: async (pt) => {
      spring(view.root, { r: 0, sx: 1, sy: 1 }, P.release);
      const home = await window.pet.drop({ x: pt.x * S, y: pt.y * S, facing: view.facing, chat: st.newMsgs });
      if (home) return;
      st.drag = null;
      st.vx = Math.max(-1800, Math.min(1800, vel.x)); st.vy = Math.max(-1800, Math.min(1400, vel.y));
      st.mode = "fall";
      sfx("drop");
    },
  };
}

// ---------------------------------------------------------------- chat
function anchors() {
  const D = PETS[cfg.pet];
  const tail = { x: st.x + D.tail.dx, y: st.y + D.tail.dy };
  const dialog = { x: Math.max(8, Math.min(areaW - CHAT.dialog.w - 8, tail.x + D.dialog.dx - D.tail.dx)), y: Math.max(8, tail.y + D.dialog.dy - D.tail.dy) };
  let bar = { x: feetX() - CHAT.bar.w / 2, y: feetY() + 14 };
  if (bar.y + CHAT.bar.h > ground + 60) bar.y = dialog.y - CHAT.bar.h - 14;
  bar.x = Math.max(8, Math.min(areaW - CHAT.bar.w - 8, bar.x));
  bar.y = Math.max(8, bar.y);
  return { dialog, tail, bar };
}

function onPetClick() {
  if (chat.isOpen) { chat.close(); return; }
  if (st.mode === "fall") return;
  st.mode = "idle"; st.idleT = 999;
  view.show("Default");
  view.setFacing(1);
  sfx(cfg.pet === "C4" ? "woof" : "meow");
  set(view.root, { sy: 0.88, sx: 1.06 }); spring(view.root, { sx: 1, sy: 1 }, P.release);
  window.pet.setFocusable(true);
  chat.open(anchors());
  chat.say(t("petHello", cfg.lang, cfg.pet));
}

async function talk(text) {
  if (!cfg.aiEnabled) { chat.say(t("offline", cfg.lang, cfg.pet)); return; }
  chat.thinking();
  chat.busy = true;
  const r = await askPet({ chatFn: window.pet.chat, pet: cfg.pet, lang: cfg.lang, mode: "desktop", ctx: { hearts: cfg.hearts }, history: st.history, userText: text });
  chat.busy = false;
  if (!chat.isOpen) return;
  chat.say(r.text);
  if (r.ok) {
    const add = [...(text ? [{ role: "user", content: text }] : []), { role: "assistant", content: r.text }];
    st.history.push(...add); st.newMsgs.push(...add);
  }
}
