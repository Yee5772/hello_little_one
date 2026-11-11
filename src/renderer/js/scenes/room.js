// The pet's room (Sample_Room_C3 / Sample_Room_C4 and _2). Every prop reacts when clicked.
// The pet, the ball, the food on the table and the soap / comb can also be picked up: drop food,
// soap or the comb on the pet to feed / bathe / brush it, throw the ball and the pet runs after it.
// Click the floor and the pet walks there (around the table, also behind it); put it on the table.
import { ROOM_LAYERS, ROOM_PROPS, PROP_ORDER, FLOOR_PROPS, PETS, PET_FRAME, HUD, CHAT, FOODS, DESKTOP_SCALE, BALL_FLOOR, NAV, TABLE, CHAIR_KEY, FLOOR_MARK } from "../layout.js";
import { nearestWalkable, findPath, randomSpot, overEllipse } from "../pet/nav.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Scope } from "../core/input.js";
import { Button } from "../ui/button.js";
import { Digits } from "../ui/digits.js";
import { ChatUI, askPet } from "../ui/chat.js";
import { openBag } from "../ui/bag.js";
import { openMailbox, unreadCount } from "../ui/mailbox.js";
import { PetView, PetMotor } from "../pet/pet.js";
import { Dressing } from "./dressing.js";
import { accPositions, outfitFor } from "../pet/wardrobe.js";
import { spring, set, impulse, P } from "../core/spring.js";
import { tween, ease } from "../core/tween.js";
import { music, sfx } from "../audio.js";
import { RULES, rand } from "../state.js";
import { t } from "../i18n.js";
import { bubbles } from "../fx/bubbles.js";

const FOOD_HEARTS = { fish: 15, burger: 15, donut: 15, shrimp: 15, juice: 10 };
const PIVOT = { squash: "bottom", hop: "bottom", sway: "bottom", swing: "top", window: "top", flat: "center", toy: "bottom", ball: [72, 69],
  door: "left", mirror: "bottom", mailbox: "bottom", lamp: "bottom", laptop: "bottom", food: "bottom", coin: "center", poop: "bottom", comb: "center", soap: "center" };
const CARRY_KINDS = new Set(["food", "soap", "comb"]);
const DEPTH_LAYERS = new Set(["ball", "table", "chair"]);   // furniture the pet can be in front of or behind
const BALL_G = 2600;

export function bump(sprite, kind) {
  switch (kind) {
    case "hop": case "ball": set(sprite, { y: 0 }); impulse(sprite, "y", -560, P.release, 0); impulse(sprite, "r", (Math.random() < 0.5 ? -1 : 1) * 150, P.wobble, 0); break;
    case "sway": impulse(sprite, "r", 70, P.sway, 0); break;
    case "swing": case "window": impulse(sprite, "r", 45, P.sway, 0); break;
    case "flat": set(sprite, { sx: 1.025, sy: 0.93 }); spring(sprite, { sx: 1, sy: 1 }, P.release); break;
    case "door": set(sprite, { sx: 0.9 }); spring(sprite, { sx: 1 }, P.release); break;
    case "lamp": impulse(sprite, "r", 55, P.sway, 0); break;
    default: set(sprite, { sx: 1.05, sy: 0.92 }); spring(sprite, { sx: 1, sy: 1 }, P.release);
  }
}
const KIND_SFX = { squash: "creak", hop: "pat", sway: "rustle", swing: "creak", window: "curtain", flat: "pat", toy: "squeak", ball: "ball",
  door: "door", mirror: "whoosh", mailbox: "paper", lamp: "lamp", laptop: "keys", bell: "bell" };

export class RoomScene {
  constructor(game) {
    this.game = game;
    this.root = el("div", "scene scene-room");
    this.cam = new Group(this.root, { w: 1920, h: 1080 });
    this.camM = [1, 0, 0, 1, 0, 0];
    this.furnL = el("div", "grp", this.cam.el);      // ROOM_LAYERS, PSD stacking
    this.depthL = el("div", "grp", this.cam.el);     // the pet, table, pouf, ball, food and floor items, sorted by depth
    this.carryL = el("div", "grp", this.cam.el);     // whatever the player is holding
    this.fxL = el("div", "grp", this.cam.el);        // bath bubbles
    this.ui = new Group(this.root, { w: 1920, h: 1080 });
    this.chatL = el("div", "grp", this.ui.el);
    this.hudL = el("div", "grp", this.ui.el);
    this.dressL = el("div", "grp", this.ui.el);
    this.scope = new Scope("room", {
      onBackgroundClick: () => { if (this.chat.isOpen) this.closeChat(); },
      onKey: (e) => { if (e.key === "Escape" && this.chat.isOpen) { this.closeChat(); return true; } return false; },
    });
    this.sprites = {};
    this.props = {};
    this.busy = false;         // the pet is doing something (walking to food, eating, playing…)
    this.scripted = false;     // …that can't be interrupted by grabbing it (food flying, scrubbing, jumps)
    this.locks = new Set();    // sprites a scripted animation currently owns
    this.carry = null;         // { kind: "pet" | "ball" | "item" | "none" } while the player drags
    this.ballPhys = null;      // the ball while it rolls / bounces
    this.chase = false;        // the pet runs after the ball
    this.chaseT = 0;
    this.onTable = false;      // the player put the pet on the table
    this.tableT = 0;
    this.markT = 0; this.markTok = 0; this.markFeet = { x: 0, y: 0 };
    this.spriteOf = new Map(); // element -> sprite, for things that can be carried
    this.notes = [];           // what happened lately (for the AI postcards)
    this.postT = 5;
    this.petOut = false;
    this.mode = "room";
    this.idleT = 2;
    this.spawnT = 0;
    this.build();
    this.dressing = new Dressing(this);
    game.store.on(() => this.refreshHud());
    game.onDesktopReturn = (pt) => this.petReturned(pt);
    game.onPostcard = () => this.onPostcard();
    game.recentActivity = () => this.notes.join("; ");
  }

  note(what) { this.notes.push(what); if (this.notes.length > 5) this.notes.shift(); }

  // a new postcard arrived: the mailbox wiggles and its badge counts it
  onPostcard() {
    this.refreshHud();
    if (this.game.sceneName !== "room" || this.mode !== "room") return;
    impulse(this.sprites.mailbox, "r", 60, P.wobble, 0);
    set(this.hud.badge, { sx: 1.5, sy: 1.5 }); spring(this.hud.badge, { sx: 1, sy: 1 }, P.release);
    sfx("paper");
  }

  get s() { return this.game.s; }
  get folder() { return PETS[this.s.pet].folder; }

  // ------------------------------------------------------------------ build
  build() {
    const sc = this.scope;
    const room = this;
    ROOM_LAYERS.forEach((L, i) => {
      // the ball, the table and the pouf stand on the open floor, so they live with the pet in the
      // depth-sorted layer (nothing stacked above them in the PSD overlaps them: same render)
      const parent = DEPTH_LAYERS.has(L.id) ? this.depthL : this.furnL;
      const sp = new Sprite(L.src[this.s.theme], L.x, L.y, { parent, pivot: PIVOT[L.kind] || "bottom", hit: !L.kind ? false : L.kind === "floor" ? "box" : "alpha" });
      this.sprites[L.id] = sp;
      if (!L.kind) return;                                     // edge decoration: not interactive
      if (L.kind === "floor") {
        sc.add({ z: i, cursor: "pointer", hit: () => true, click: (pt) => this.onFloor(this.toRoom(pt)) });
        return;
      }
      const node = { z: i, cursor: "pointer", hit: (pt) => { const p = this.toRoom(pt); return sp.hitTest(p.x, p.y); },
        enter: () => this.hoverLift(sp, true), leave: () => this.hoverLift(sp, false),
        click: (pt) => this.onObject(L, sp, this.toRoom(pt)) };
      if (DEPTH_LAYERS.has(L.id)) Object.defineProperty(node, "z", { get: () => room.depthZ(room.layerKey(L.id)), enumerable: true });
      if (L.id === "ball") { node.cursor = "grab"; node.drag = this.ballDrag(sp); this.spriteOf.set(sp.el, sp); }
      sc.add(node);
    });
    PROP_ORDER.forEach((id) => {
      const D = ROOM_PROPS[id];
      const sp = new Sprite(D.src, D.x, D.y, { parent: this.depthL, pivot: PIVOT[D.kind] || "bottom", visible: false });
      this.props[id] = sp;
      this.spriteOf.set(sp.el, sp);
      const node = { cursor: CARRY_KINDS.has(D.kind) ? "grab" : "pointer", hit: (pt) => { const p = this.toRoom(pt); return sp.hitTest(p.x, p.y); },
        enter: () => this.hoverLift(sp, true), leave: () => this.hoverLift(sp, false),
        click: () => this.onProp(id, sp) };
      Object.defineProperty(node, "z", { get: () => room.depthZ(room.propKey(id, sp)), enumerable: true });
      if (CARRY_KINDS.has(D.kind)) node.drag = this.itemDrag(id, sp);
      sc.add(node);
    });
    this.marker = new Sprite(FLOOR_MARK.src, 0, 0, { parent: this.depthL, hit: false, pivot: "center", visible: false });
    // pet
    const pet = this.s.pet;
    this.pet = new PetView(this.depthL, { pet, x: PETS[pet].home.x, y: PETS[pet].home.y });
    this.motor = new PetMotor(this.pet);
    sc.add({ get z() { return room.depthZ(room.petKey()); }, cursor: "grab",
      hit: (pt) => { const p = this.toRoom(pt); return !this.petOut && this.pet.hitTest(p.x, p.y); },
      enter: () => { if (!this.busy) spring(this.pet.root, { sy: 1.03, sx: 0.985 }, P.hover); },
      leave: () => { if (!this.carry) spring(this.pet.root, { sy: 1, sx: 1 }, P.hover); },
      click: () => this.onPetClick(),
      drag: this.petDrag() });
    // chat
    this.chat = new ChatUI({ parent: this.chatL, scope: sc, folder: this.folder, onSend: (txt) => this.onChatSend(txt), onClose: () => this.onChatClosed() });
    this.chat.attach(sc);
    this.buildHud();
  }

  buildHud() {
    const p = this.hudL, sc = this.scope, f = (s) => s.replace("{f}", this.folder);
    this.hudL.textContent = "";
    this.hud = {};
    this.hud.track = new Sprite(f(HUD.track.src), HUD.track.x, HUD.track.y, { parent: p, hit: false });
    this.hud.fill = new Sprite(PETS[this.s.pet].heartFill, HUD.fill.x, HUD.fill.y, { parent: p, hit: false });
    this.hud.coin = new Sprite(f(HUD.coinIcon.src), HUD.coinIcon.x, HUD.coinIcon.y, { parent: p, pivot: "center" });
    this.hud.digits = new Digits({ parent: p, x: HUD.coinDigits.x, y: HUD.coinDigits.y, src: `${this.folder}/Coin_{d}.png`, advance: HUD.coinDigits.advance });
    const hi = PETS[this.s.pet].heartIcon;
    this.hud.heart = new Sprite(hi.src, hi.x, hi.y, { parent: p, pivot: "center" });
    this.hud.badge = new Sprite(f(HUD.badge.src), HUD.badge.x, HUD.badge.y, { parent: p, pivot: "center", hit: false });
    this.hud.badgeDigit = new Sprite(`${this.folder}/Mailbox_1.png`, HUD.badgeDigit.x, HUD.badgeDigit.y, { parent: p, hit: false });
    if (this.hudNodes) for (const n of this.hudNodes) sc.remove(n);
    this.hudNodes = [];
    const add = (n) => { sc.add(n); this.hudNodes.push(n); };
    add({ z: 950, cursor: "pointer", hit: (pt) => this.hud.heart.hitTest(pt.x, pt.y), enter: () => spring(this.hud.heart, { sx: 1.08, sy: 1.08 }, P.hover),
      leave: () => spring(this.hud.heart, { sx: 1, sy: 1 }, P.hover), click: () => { impulse(this.hud.heart, "r", 160, P.wobble, 0); this.petVoice(); if (!this.busy && !this.petOut) this.motor.act(1.2); } });
    add({ z: 950, cursor: "pointer", hit: (pt) => this.hud.coin.hitTest(pt.x, pt.y), enter: () => spring(this.hud.coin, { sx: 1.08, sy: 1.08 }, P.hover),
      leave: () => spring(this.hud.coin, { sx: 1, sy: 1 }, P.hover), click: () => { impulse(this.hud.coin, "r", 200, P.wobble, 0); sfx("coin", { vol: 0.6 }); } });
    this.btn = {
      setting: new Button({ parent: p, scope: null, src: f(HUD.setting.src), x: HUD.setting.x, y: HUD.setting.y, onClick: () => this.game.openSettings() }),
      bag: new Button({ parent: p, scope: null, src: f(HUD.bag.src), x: HUD.bag.x, y: HUD.bag.y, onClick: () => this.openBag() }),
      shop: new Button({ parent: p, scope: null, src: f(HUD.shop.src), x: HUD.shop.x, y: HUD.shop.y, onClick: () => this.goShop() }),
    };
    for (const b of Object.values(this.btn)) add({ ...b.node, z: 960 });
    this.hudNodes.forEach((n) => { const en = n.enabled; n.enabled = () => this.mode === "room" && (!en || en()); });
    this.refreshHud(true);
  }

  refreshHud(instant = false) {
    if (!this.hud) return;
    const s = this.s;
    const h = Math.max(0, Math.min(100, s.hearts[s.pet]));
    this.hud.fill.el.style.clipPath = `inset(0 ${HUD.fill.w * (1 - h / 100)}px 0 0)`;
    const prev = this.hud.digits.value;
    this.hud.digits.set(s.coins, !instant && prev !== null && prev !== String(s.coins));
    const n = unreadCount(s);
    this.hud.badge.setVisible(n > 0);
    this.hud.badgeDigit.setVisible(n > 0);
    if (n > 0) this.hud.badgeDigit.setSrc(`${this.folder}/Mailbox_${Math.min(9, n)}.png`);
  }

  // ------------------------------------------------------------------ state <-> view
  applyTheme() {
    for (const L of ROOM_LAYERS) this.sprites[L.id].setSrc(L.src[this.s.theme]);
    this.applyVisibility();
  }

  hasFurniture(id) { const s = this.s; return s.owned.furniture.includes(id) && !s.stored.includes(id); }

  applyVisibility() {
    const s = this.s;
    const night = s.curtain ? s.curtain === "night" : this.isNight();
    // Sample_Room: by day only the day window is drawn (no night layer underneath)
    this.sprites.curtainDay.setVisible(!night);
    this.sprites.curtainNight.setVisible(night);
    for (const L of ROOM_LAYERS) if (L.furniture) this.sprites[L.id].setVisible(this.hasFurniture(L.id));
    this.sprites.lamp.setVisible(this.hasFurniture("cabinet"));       // the lamp stands on the cabinet
    for (const f of FOODS) if (!this.locks.has(this.props[f])) this.props[f].setVisible(s.table.includes(f));
    for (const k of FLOOR_PROPS) if (!this.locks.has(this.props[k])) this.props[k].setVisible(!!s.floor[k]);
  }

  // the ball stays where it was left
  placeBall() {
    const sp = this.sprites.ball, L = ROOM_LAYERS.find((l) => l.id === "ball"), b = this.s.ball;
    this.ballPhys = null;
    sp.setPos(b ? b.x : L.x, b ? b.y : L.y);
    set(sp, { r: 0 });
  }

  isNight() { const h = new Date().getHours(); return h < 6 || h >= 18; }

  applyPet(animate = false) {
    const s = this.s, pet = s.pet;
    this.pet.setPet(pet);
    const w = s.wardrobe[pet];
    this.pet.setAccessories(accPositions(w.acc));
    this.pet.setOutfit(outfitFor(s, w.outfit));
    if (this.chat.folder !== this.folder) { this.chat.root.remove(); this.chat.detach(); this.chat = new ChatUI({ parent: this.chatL, scope: this.scope, folder: this.folder, onSend: (t2) => this.onChatSend(t2), onClose: () => this.onChatClosed() }); this.chat.attach(this.scope); }
    this.buildHud();
    if (animate) { set(this.pet.root, { sx: 0.2, sy: 0.2 }); spring(this.pet.root, { sx: 1, sy: 1 }, P.pop); this.petVoice(); }
  }

  reset() {
    this.petOut = false; this.busy = false; this.scripted = false; this.chase = false; this.carry = null; this.onTable = false;
    const pet = this.s.pet;
    this.pet.showView();
    this.pet.setPos(PETS[pet].home.x, PETS[pet].home.y);
    this.pet.setFacing(1, false);
    this.motor.idle();
    this.placeBall();
  }

  enter(params = {}) {
    const g = this.game;
    g.input.push(this.scope);
    music("room");
    this.applyTheme();
    this.applyPet();
    this.placeBall();
    if (this.petOut) this.pet.hide(); else this.pet.showView();
    this.refreshHud(true);
    if (!this.s.started) g.store.change((d) => { d.started = true; });
    if (params.fromShop) { set(this.cam, { sx: 1.03, sy: 1.03 }); spring(this.cam, { sx: 1, sy: 1 }, P.soft); }
  }

  exit() {
    this.closeChat(true);
    if (this.ballPhys) this.restBall();
    this.chase = false;
    this.game.input.pop(this.scope);
  }

  applyLang() { /* the room has no language-specific art */ }

  // ------------------------------------------------------------------ camera
  setCamera(m) { this.camM = m; this.cam.base = m; this.cam.apply(); }
  toRoom(pt) {
    const [a, , , d, e, f] = this.camM;
    return { x: (pt.x - e) / a, y: (pt.y - f) / d };
  }
  toStage(p) { const [a, , , d, e, f] = this.camM; return { x: p.x * a + e, y: p.y * d + f }; }

  hoverLift(sp, on) {
    if (this.locks.has(sp) || (this.carry && this.carry.sp === sp)) return;
    const area = sp.w * sp.h;
    const k = on ? 1 + Math.max(0.008, Math.min(0.045, 2600 / area)) : 1;
    spring(sp, { sx: k, sy: k }, P.hover);
  }

  // ------------------------------------------------------------------ depth (lower on screen = in front)
  // on the table the pet sorts among the food by where its feet are on the table top
  petKey() { const fy = this.pet.y + PET_FRAME.h; return this.onTable ? TABLE.key + fy / 1e5 + 1e-7 : fy - 6; }
  ballKey() { const sp = this.sprites.ball; return this.ballPhys ? this.ballPhys.ground : sp.y + sp.h; }
  layerKey(id) { return id === "ball" ? this.ballKey() : id === "table" ? TABLE.key : CHAIR_KEY; }
  propKey(id, sp) { return FLOOR_PROPS.includes(id) ? sp.y + sp.h : TABLE.key + (sp.y + sp.h) / 1e5; }
  depthZ(key) { return 150 + key / 10000; }

  sortDepth() {
    const items = [[this.petKey(), this.pet.root.el], [TABLE.key, this.sprites.table.el], [CHAIR_KEY, this.sprites.chair.el]];
    const ball = this.sprites.ball;
    if (ball.el.parentNode === this.depthL) items.push([this.ballKey(), ball.el]);
    for (const k of PROP_ORDER) { const sp = this.props[k]; if (sp.el.parentNode === this.depthL) items.push([this.propKey(k, sp), sp.el]); }
    if (this.marker.visible) items.push([this.markFeet.y - 3, this.marker.el]);
    items.sort((a, b) => a[0] - b[0]);
    const kids = this.depthL.children;
    let same = kids.length === items.length;
    if (same) for (let i = 0; i < items.length; i++) if (kids[i] !== items[i][1]) { same = false; break; }
    if (!same) for (const [, e] of items) this.depthL.appendChild(e);
  }

  // back to its own layer after being carried (the depth sort puts it in its place next frame)
  restoreLayer(sp) { this.depthL.appendChild(sp.el); }

  // ------------------------------------------------------------------ walking
  toCanvas(f) { const a = PETS[this.s.pet].alpha; return { x: f.x - (a.x0 + a.x1) / 2, y: f.y - PET_FRAME.h }; }

  /** walk the pet's feet to a floor point, around the table and the pouf */
  goToFeet(goal, cb) {
    if (this.onTable) { this.jumpDown(() => this.goToFeet(goal, cb)); return; }
    this.motor.walkPath(findPath(this.pet.feet(), goal).map((f) => this.toCanvas(f)), cb);
  }

  // paw print on the floor where the pet is heading
  showMark(f) {
    const m = this.marker, tok = ++this.markTok;
    this.markFeet = f;
    m.setPos(f.x - FLOOR_MARK.w / 2, f.y - FLOOR_MARK.h / 2);
    m.show();
    set(m, { sx: FLOOR_MARK.sx * 0.3, sy: FLOOR_MARK.sy * 0.3, o: 0 });
    spring(m, { sx: FLOOR_MARK.sx, sy: FLOOR_MARK.sy, o: 0.95 }, P.pop);
    this.markT = 4;
    return tok;
  }
  hideMark(tok) {
    if (tok !== undefined && tok !== this.markTok) return;   // a newer click owns the marker
    if (!this.marker.visible) return;
    const t0 = this.markTok;
    this.markT = 0;
    spring(this.marker, { o: 0, sx: FLOOR_MARK.sx * 1.3, sy: FLOOR_MARK.sy * 1.3 }, P.out);
    tween({ dur: 0.32, onDone: () => { if (this.markTok === t0) this.marker.hide(); } });
  }

  // the pet hops down from the table to the floor in front of it
  jumpDown(cb) {
    if (!this.onTable) { if (cb) cb(); return; }
    const f0 = this.pet.feet(), o = NAV.obstacles[0];
    const goal = nearestWalkable({ x: f0.x, y: o.cy + o.ry + 34 });
    const c0 = { x: this.pet.x, y: this.pet.y }, c1 = this.toCanvas(goal);
    this.scripted = true;
    this.motor.stop();
    this.pet.show("Walking_2");
    sfx("jump", { vol: 0.7 });
    tween({ dur: 0.5, ease: ease.linear, onUpdate: (e) => this.pet.setPos(c0.x + (c1.x - c0.x) * e, c0.y + (c1.y - c0.y) * e - Math.sin(e * Math.PI) * 90), onDone: () => {
      this.onTable = false;
      this.scripted = false;
      sfx("land", { vol: 0.8 });
      set(this.pet.root, { sy: 0.84, sx: 1.1 }); spring(this.pet.root, { sx: 1, sy: 1 }, P.release);
      this.pet.show("Default");
      if (cb) cb();
    } });
  }

  // ------------------------------------------------------------------ interactions
  onObject(L, sp, p) {
    if (this.chat.isOpen) { this.closeChat(); return; }
    bump(sp, L.kind);
    if (KIND_SFX[L.kind]) sfx(KIND_SFX[L.kind]);
    switch (L.kind) {
      case "door": return this.goDesktop();
      case "mirror": return this.dressing.enter();
      case "mailbox": return openMailbox(this.game, { onClose: () => this.refreshHud() });
      case "window":
        this.game.store.change((d) => { const night = d.curtain ? d.curtain === "night" : this.isNight(); d.curtain = night ? "day" : "night"; });
        this.applyVisibility();
        set(this.sprites.curtainNight, { sy: 0.96 }); spring(this.sprites.curtainNight, { sy: 1 }, P.release);
        return;
      case "ball": return this.callToBall();
      case "toy": return this.play(L.id, sp);
      case "flat": return this.onFloor(p, { closeChat: false });   // rugs are floor too: walk there
      default:
        // the table and the pouf: the pet goes next to them, behind if the far side was clicked
        if (L.id === "table" || L.id === "chair") {
          const o = NAV.obstacles.find((q) => q.id === L.id), far = p.y < (L.id === "table" ? TABLE.top.cy : o.cy - 40);
          this.onFloor({ x: p.x, y: far ? o.cy - o.ry - 40 : o.cy + o.ry + 30 }, { closeChat: false });
        }
        return;
    }
  }

  onProp(id, sp) {
    if (this.chat.isOpen) { this.closeChat(); return; }
    if (this.locks.has(sp)) return;
    const kind = ROOM_PROPS[id].kind;
    if (kind === "food") return this.feed(id, sp);
    if (kind === "coin") return this.collectCoin(sp);
    if (kind === "poop") return this.cleanPoop(sp);
    if (kind === "comb" || kind === "soap") return this.groom(id, sp);
  }

  // click anywhere on the room: the pet walks there (as close as the open floor allows)
  onFloor(p, { closeChat = true } = {}) {
    if (closeChat && this.chat.isOpen) { this.closeChat(); return; }
    if (this.busy || this.scripted || this.petOut || this.mode !== "room" || this.carry) return;
    const goal = nearestWalkable(p);
    const tok = this.showMark(goal);
    this.chase = false;
    this.goToFeet(goal, () => { this.hideMark(tok); if (Math.random() < 0.35) this.motor.act(1); });
    this.idleT = rand(4, 7);
  }

  petVoice() { sfx(this.s.pet === "C4" ? "woof" : "meow", { rate: 0.95 + Math.random() * 0.1 }); }

  addHearts(n) {
    this.game.store.change((d) => { d.hearts[d.pet] = Math.min(100, d.hearts[d.pet] + n); });
    if (this.hud && this.mode === "room") { set(this.hud.heart, { sx: 1.25, sy: 1.25 }); spring(this.hud.heart, { sx: 1, sy: 1 }, P.release); }
  }

  cool(key, sec) {
    const now = Date.now(), c = this.s.cooldowns;
    if (c[key] && now < c[key]) return false;
    this.game.store.change((d) => { d.cooldowns[key] = now + sec * 1000; }, { save: false });
    return true;
  }

  /** walk the pet's feet next to a room point (on its current row, or up to the table), then run cb */
  approach(px, cb, { atTable = false } = {}) {
    const f = this.pet.feet(), o = NAV.obstacles[0];
    let y = f.y;
    if (atTable) y = f.y < TABLE.key && !this.onTable ? o.cy - o.ry - 30 : o.cy + o.ry + 34;   // the side it is on
    this.goToFeet(nearestWalkable({ x: px, y }), cb);
  }

  petFree() { return this.mode === "room" && !this.petOut && !this.busy && !this.scripted && !(this.carry && this.carry.kind === "pet"); }

  // the player grabbed the pet / handed it something: forget what it was walking to
  cancelTask() {
    this.motor.stop();
    this.chase = false;
    this.busy = false;
  }

  play(id, sp) {
    if (this.busy || this.scripted || this.petOut) return;
    this.busy = true;
    this.chase = false;
    const c = sp.x + sp.w / 2;
    this.approach(c, () => {
      this.pet.setFacing(c > this.pet.feet().x ? -1 : 1);
      this.petVoice();
      this.motor.act(1.3, () => { this.busy = false; this.idleT = rand(2, 4); });
      if (this.cool("play_" + id, 25)) this.addHearts(RULES.hearts.play);
    });
  }

  // ---------------------------------------------------------------- food
  feed(id, sp) {
    if (this.busy || this.scripted || this.petOut) { bump(sp, "squash"); return; }
    this.busy = true;
    this.chase = false;
    if (this.onTable) { this.eat(id, sp); return; }          // it is right there
    const fx = sp.x + sp.w / 2;
    this.approach(fx, () => this.eat(id, sp), { atTable: true });
  }

  headPoint() {
    const a = PETS[this.s.pet].alpha;
    const f = this.pet.facing;
    const hx = f === 1 ? a.x0 + 95 : PET_FRAME.w - (a.x0 + 95);
    return { x: this.pet.x + hx, y: this.pet.y + 135 };
  }

  // the food (on the table or in the player's hand) flies into the pet's mouth
  eat(id, sp) {
    this.busy = true; this.scripted = true;
    this.motor.stop();
    this.pet.setFacing(sp.x + sp.w / 2 > this.pet.feet().x ? -1 : 1);
    this.pet.show("Action_1");
    const head = this.headPoint();
    const x0 = sp.x, y0 = sp.y, s0 = sp.m.sx;
    this.locks.add(sp);
    if (sp.el.parentNode !== this.carryL) this.carryL.appendChild(sp.el);
    tween({ dur: 0.5, ease: ease.inOutSine, onUpdate: (e) => {
      sp.setPos(x0 + (head.x - sp.w / 2 - x0) * e, y0 + (head.y - sp.h / 2 - y0) * e - Math.sin(e * Math.PI) * 90);
      set(sp, { sx: s0 + (0.25 - s0) * e, sy: s0 + (0.25 - s0) * e, r: 0 });
    }, onDone: () => {
      const home = ROOM_PROPS[id];
      sp.hide(); sp.setPos(home.x, home.y); set(sp, { sx: 1, sy: 1, r: 0, o: 1 });
      this.restoreLayer(sp); this.locks.delete(sp);
      this.game.store.change((d) => {
        d.table = d.table.filter((f) => f !== id);
        if (!d.floor.poop && !d.timers.poop) d.timers.poop = Date.now() + rand(...RULES.poopAfterMeal) * 1000;
      });
      this.addHearts(FOOD_HEARTS[id] || 10);
      this.note(`ate ${id === "juice" ? "some orange juice" : "a " + id}`);
      sfx("eat");
      this.scripted = false;
      set(this.pet.root, { sy: 0.9, sx: 1.06 }); spring(this.pet.root, { sx: 1, sy: 1 }, P.release);
      this.motor.act(1.5, () => { this.busy = false; this.petVoice(); this.idleT = rand(3, 5); });
    } });
  }

  // ---------------------------------------------------------------- coin / poop / soap / comb
  collectCoin(sp) {
    if (this.locks.has(sp)) return;
    sfx("coin");
    const start = { x: sp.x, y: sp.y };
    const tgtRoom = this.toRoom({ x: HUD.coinIcon.x, y: HUD.coinIcon.y });   // HUD is outside the camera
    this.locks.add(sp);
    this.carryL.appendChild(sp.el);
    tween({ dur: 0.7, ease: ease.inCubic, onUpdate: (e) => {
      sp.setPos(start.x + (tgtRoom.x - start.x) * e, start.y + (tgtRoom.y - start.y) * e - Math.sin(e * Math.PI) * 160);
      set(sp, { sx: 1 - 0.3 * e, sy: 1 - 0.3 * e, r: e * 360 });
    }, onDone: () => {
      sp.hide(); sp.setPos(ROOM_PROPS.coin.x, ROOM_PROPS.coin.y); set(sp, { sx: 1, sy: 1, r: 0 });
      this.restoreLayer(sp); this.locks.delete(sp);
      this.game.store.change((d) => { d.coins += RULES.coinValue; d.floor.coin = false; d.timers.coin = Date.now() + rand(...RULES.coinEvery) * 1000; });
      impulse(this.hud.coin, "sy", -3, P.wobble, 1); impulse(this.hud.coin, "r", 120, P.wobble, 0);
    } });
  }

  cleanPoop(sp) {
    if (this.locks.has(sp)) return;
    sfx("clean");
    this.locks.add(sp);
    spring(sp, { sx: 0, sy: 0, r: 200, o: 0 }, P.out, () => {
      sp.hide(); set(sp, { sx: 1, sy: 1, r: 0, o: 1 }); this.locks.delete(sp);
      this.game.store.change((d) => { d.floor.poop = false; d.timers.poop = 0; });
      this.addHearts(RULES.hearts.clean);
    });
    if (this.petFree()) { this.petVoice(); this.motor.act(0.8); }
  }

  groom(id, sp) {
    if (this.busy || this.scripted || this.petOut) { bump(sp, "hop"); return; }
    this.busy = true;
    this.chase = false;
    const c = sp.x + sp.w / 2;
    this.approach(c, () => this.scrub(id, sp));
  }

  // bath (soap) / brushing (comb): the tool rubs over the pet's body, then it is used up
  scrub(id, sp) {
    this.busy = true; this.scripted = true;
    this.motor.stop();
    this.pet.setFacing(1);
    sfx(id === "comb" ? "brush" : "bubbles");
    const x0 = sp.x, y0 = sp.y, s0 = sp.m.sx;
    const body = { x: this.pet.x + PET_FRAME.w / 2 - sp.w / 2, y: this.pet.y + 120 - sp.h / 2 };
    this.locks.add(sp);
    if (sp.el.parentNode !== this.carryL) this.carryL.appendChild(sp.el);   // over the pet while scrubbing
    this.motor.act(1.9);
    const soap = id === "soap";
    let foam = 0;
    tween({ dur: 1.8, ease: ease.linear, onUpdate: (e, p) => {
      const k = Math.min(1, p * 5);
      sp.setPos(x0 + (body.x - x0) * k + Math.sin(p * Math.PI * 6) * 45 * k, y0 + (body.y - y0) * k + Math.cos(p * Math.PI * 6) * 8 * k);
      set(sp, { r: Math.sin(p * Math.PI * 6) * 14, sx: s0 + (1 - s0) * k, sy: s0 + (1 - s0) * k });
      // lather: bubbles come off the soap while it rubs over the pet
      if (soap && k >= 1 && p * 1.8 >= foam) { foam += 0.07; bubbles(this.fxL, sp.x + sp.w / 2, sp.y + sp.h * 0.3, { n: 1, spread: 34 }); }
    }, onDone: () => {
      if (soap) {
        const c = { x: this.pet.x + PET_FRAME.w / 2, y: this.pet.y + 130 };
        bubbles(this.fxL, c.x, c.y, { n: 14, spread: 110, rise: [90, 220], life: [1.1, 2.0], size: [22, 54] });
        sfx("bubbles", { vol: 0.6 });
      }
      spring(sp, { sx: 0, sy: 0, o: 0 }, P.out, () => {
        const home = ROOM_PROPS[id];
        sp.hide(); sp.setPos(home.x, home.y); set(sp, { sx: 1, sy: 1, o: 1, r: 0 });
        this.restoreLayer(sp); this.locks.delete(sp);
        const every = id === "comb" ? RULES.combEvery : RULES.soapEvery;
        this.game.store.change((d) => { d.floor[id] = false; d.timers[id] = Date.now() + rand(...every) * 1000; });
        this.addHearts(RULES.hearts[id]);
        this.note(id === "comb" ? "got brushed" : "had a bubbly bath");
        this.petVoice(); this.busy = false; this.scripted = false; this.idleT = rand(3, 5);
      });
    } });
  }

  spawnTick() {
    const s = this.s, now = Date.now();
    const spawn = (k) => {
      this.game.store.change((d) => { d.floor[k] = true; });
      const sp = this.props[k]; sp.show();
      set(sp, { sx: 0.2, sy: 0.2, o: 0 }); spring(sp, { sx: 1, sy: 1, o: 1 }, P.pop);
      sfx(k === "coin" ? "sparkle" : "pickup", { vol: 0.6 });
    };
    if (!s.floor.coin && now > s.timers.coin) spawn("coin");
    if (!s.floor.comb && now > s.timers.comb) spawn("comb");
    if (!s.floor.soap && now > s.timers.soap) spawn("soap");
    if (!s.floor.poop && s.timers.poop && now > s.timers.poop) { this.game.store.change((d) => { d.timers.poop = 0; }); spawn("poop"); }
  }

  // ---------------------------------------------------------------- picking things up
  canGrab() { if (this.carry) this.recoverCarry(); return this.mode === "room" && !this.game.input.locked; }

  // a new press while something still counts as held (its release got lost): let go of it first
  recoverCarry() {
    const c = this.carry;
    this.carry = null;
    if (!c) return;
    if (c.kind === "item") this.putBack(c);
    else if (c.kind === "ball") { this.depthL.appendChild(c.sp.el); spring(c.sp, { sx: 1, sy: 1 }, P.release); this.throwBall({ x: 0, y: 0 }); }
    else if (c.kind === "pet") { spring(this.pet.root, { r: 0, sx: 1, sy: 1 }, P.release); this.dropPet(); }
  }

  petDrag() {
    let off = null, last = null, vel = { x: 0, y: 0 };
    return {
      start: (pt0) => {
        if (!this.canGrab() || this.petOut || this.scripted) {
          this.carry = { kind: "none" };
          set(this.pet.root, { sy: 0.92 }); spring(this.pet.root, { sy: 1 }, P.release);
          return;
        }
        this.closeChat();
        this.cancelTask();
        this.onTable = false;
        const p = this.toRoom(pt0);
        off = { x: p.x - this.pet.x, y: p.y - this.pet.y };
        last = { ...p, t: performance.now() }; vel = { x: 0, y: 0 };
        this.carry = { kind: "pet" };
        this.busy = true;
        this.pet.show("Action_1");
        spring(this.pet.root, { sx: 1.06, sy: 1.06 }, P.hover);
        sfx("pickup");
      },
      move: (pt) => {
        if (!this.carry || this.carry.kind !== "pet") return;
        const p = this.toRoom(pt), now = performance.now(), dt = Math.max(1, now - last.t) / 1000;
        vel = { x: vel.x * 0.6 + ((p.x - last.x) / dt) * 0.4, y: vel.y * 0.6 + ((p.y - last.y) / dt) * 0.4 };
        last = { ...p, t: now };
        this.pet.setPos(clamp(p.x - off.x, -PET_FRAME.w * 0.3, 1920 - PET_FRAME.w * 0.7), clamp(p.y - off.y, -PET_FRAME.h * 0.3, 1080 - PET_FRAME.h));
        spring(this.pet.root, { r: clamp(vel.x * 0.012, -16, 16) }, P.soft);
      },
      end: () => {
        const c = this.carry;
        this.carry = null;
        if (!c || c.kind !== "pet") return;
        spring(this.pet.root, { r: 0, sx: 1, sy: 1 }, P.release);
        this.dropPet();
      },
    };
  }

  // let go of the pet: over the table it lands on the table top, anywhere else it falls onto the
  // floor below (or the nearest open spot) and lands with a squash
  dropPet() {
    const f = this.pet.feet(), T = TABLE;
    let goal;
    if (f.y > 150 && Math.abs(f.x - T.top.cx) <= T.top.rx * 0.86 && (overEllipse(T.top, f.x, f.y) || f.y < T.top.cy)) {
      const x = clamp(f.x, T.stand.cx - T.stand.rx * 0.95, T.stand.cx + T.stand.rx * 0.95);
      const h = T.stand.ry * Math.sqrt(Math.max(0, 1 - ((x - T.stand.cx) / T.stand.rx) ** 2));
      goal = { x, y: clamp(f.y, T.stand.cy - h, T.stand.cy + h) };
      this.onTable = true;
      this.tableT = rand(14, 24);
    } else {
      this.onTable = false;
      goal = nearestWalkable({ x: f.x, y: Math.max(f.y, NAV.yBack) });
    }
    const c1 = this.toCanvas(goal);
    const x0 = this.pet.x, y0 = this.pet.y, x1 = c1.x, y1 = c1.y;
    const fall = y1 - y0;
    this.scripted = true;
    const land = () => {
      this.scripted = false;
      sfx("land");
      set(this.pet.root, { sy: 0.8, sx: 1.12 }); spring(this.pet.root, { sx: 1, sy: 1 }, P.release);
      this.pet.show("Default");
      this.busy = false; this.idleT = rand(1.5, 3);
      if (fall > 120) { this.petVoice(); this.motor.act(0.9); }
    };
    if (Math.abs(fall) < 4 && Math.abs(x1 - x0) < 4) { this.pet.setPos(x1, y1); land(); return; }
    const dur = fall > 0 ? Math.min(0.7, Math.sqrt((2 * fall) / 3000)) + 0.06 : 0.26;
    tween({ dur, ease: fall > 0 ? ease.inQuad : ease.outQuad, onUpdate: (e) => this.pet.setPos(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e), onDone: land });
  }

  // food on the table, the soap and the comb: drop it on the pet to use it, anywhere else it goes back
  itemDrag(id, sp) {
    return {
      start: (pt0) => {
        if (!this.canGrab() || this.locks.has(sp) || !sp.visible) { this.carry = { kind: "none" }; bump(sp, "squash"); return; }
        this.closeChat();
        const p = this.toRoom(pt0);
        this.carry = { kind: "item", id, sp, home: { x: sp.x, y: sp.y }, off: { x: p.x - sp.x, y: p.y - sp.y }, over: false };
        this.locks.add(sp);
        this.carryL.appendChild(sp.el);
        spring(sp, { sx: 1.15, sy: 1.15, r: -8 }, P.hover);
        sfx("pickup", { vol: 0.7 });
      },
      move: (pt) => {
        const c = this.carry;
        if (!c || c.kind !== "item") return;
        const p = this.toRoom(pt);
        sp.setPos(clamp(p.x - c.off.x, -sp.w / 2, 1920 - sp.w / 2), clamp(p.y - c.off.y, -sp.h / 2, 1080 - sp.h / 2));
        this.noticeHeld(c);
      },
      end: () => {
        const c = this.carry;
        this.carry = null;
        if (!c || c.kind !== "item") return;
        if (this.overPet(sp) && this.mode === "room" && !this.petOut && !this.scripted) {
          this.cancelTask();
          if (ROOM_PROPS[id].kind === "food") this.eat(id, sp); else this.scrub(id, sp);
        } else this.putBack(c);
      },
    };
  }

  overPet(sp) {
    if (this.petOut || !this.pet.root.visible) return false;
    const a = PETS[this.s.pet].alpha, W = PET_FRAME.w;
    const cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2;
    const x0 = Math.min(a.x0, W - a.x1), x1 = Math.max(a.x1, W - a.x0);
    return cx >= this.pet.x + x0 - 30 && cx <= this.pet.x + x1 + 30 && cy >= this.pet.y + a.y0 - 60 && cy <= this.pet.y + a.y1 + 20;
  }

  // the pet looks at what the player is holding and perks up when it is right above it
  noticeHeld(c) {
    if (this.busy || this.scripted || this.petOut || this.mode !== "room" || this.motor.mode !== "idle") return;
    const fx = this.pet.feet().x, cx = c.sp.x + c.sp.w / 2;
    if (Math.abs(cx - fx) > 40) this.pet.setFacing(cx > fx ? -1 : 1);
    const over = this.overPet(c.sp);
    if (over === c.over) return;
    c.over = over;
    this.pet.show(over ? "Action_1" : "Default");
    if (over) { set(this.pet.root, { sy: 0.92, sx: 1.04 }); spring(this.pet.root, { sx: 1, sy: 1 }, P.release); }
  }

  putBack(c) {
    const { sp, home } = c;
    const x0 = sp.x, y0 = sp.y;
    spring(sp, { sx: 1, sy: 1, r: 0 }, P.release);
    if (!this.busy && !this.scripted && this.motor.mode === "idle") this.pet.show("Default");
    tween({ dur: 0.34, ease: ease.outCubic, onUpdate: (e) => sp.setPos(x0 + (home.x - x0) * e, y0 + (home.y - y0) * e - Math.sin(e * Math.PI) * 40), onDone: () => {
      this.restoreLayer(sp); this.locks.delete(sp);
      bump(sp, "squash"); sfx("drop", { vol: 0.5 });
    } });
  }

  // ---------------------------------------------------------------- the ball
  ballDrag(sp) {
    let off = null, last = null, vel = { x: 0, y: 0 };
    return {
      start: (pt0) => {
        if (!this.canGrab() || this.locks.has(sp)) { this.carry = { kind: "none" }; return; }
        this.closeChat();
        this.ballPhys = null;
        const p = this.toRoom(pt0);
        off = { x: p.x - sp.x, y: p.y - sp.y }; last = { ...p, t: performance.now() }; vel = { x: 0, y: 0 };
        this.carry = { kind: "ball", sp };
        this.carryL.appendChild(sp.el);
        spring(sp, { sx: 1.1, sy: 1.1 }, P.hover);
        sfx("pickup", { vol: 0.7 });
        if (this.petFree() && this.motor.mode === "idle") { this.pet.setFacing(sp.x + sp.w / 2 > this.pet.feet().x ? -1 : 1); this.pet.show("Action_1"); }
      },
      move: (pt) => {
        if (!this.carry || this.carry.kind !== "ball") return;
        const p = this.toRoom(pt), now = performance.now(), dt = Math.max(1, now - last.t) / 1000;
        vel = { x: vel.x * 0.5 + ((p.x - last.x) / dt) * 0.5, y: vel.y * 0.5 + ((p.y - last.y) / dt) * 0.5 };
        last = { ...p, t: now };
        sp.setPos(clamp(p.x - off.x, 0, 1920 - sp.w), clamp(p.y - off.y, 0, 1080 - sp.h));
      },
      end: () => {
        const c = this.carry;
        this.carry = null;
        if (!c || c.kind !== "ball") return;
        this.depthL.appendChild(sp.el);
        spring(sp, { sx: 1, sy: 1 }, P.release);
        if (performance.now() - last.t > 90) vel = { x: 0, y: 0 };    // the pointer had stopped: just let go
        this.throwBall(vel);
        if (this.petFree()) { this.pet.show("Default"); this.chase = true; this.chaseT = 0; }
      },
    };
  }

  throwBall(vel) {
    const sp = this.sprites.ball, F = BALL_FLOOR;
    const bottom = sp.y + sp.h;
    const ground = clamp(bottom, F.bottomMin, F.bottomMax);
    this.ballPhys = {
      x: clamp(sp.x, F.xMin, F.xMax - sp.w), ground, h: Math.max(0, ground - bottom),
      vx: clamp(vel.x, -2200, 2200), vg: clamp(vel.y * 0.3, -500, 500), vh: vel.y < 0 ? Math.min(900, -vel.y * 0.4) : 0,
    };
  }

  // the pet nudges the ball with its nose
  kickBall(dir) {
    const sp = this.sprites.ball, F = BALL_FLOOR;
    this.ballPhys = { x: sp.x, ground: clamp(sp.y + sp.h, F.bottomMin, F.bottomMax), h: 0, vx: dir * rand(260, 420), vg: rand(-60, 60), vh: rand(180, 300) };
    sfx("ball", { vol: 0.8 });
  }

  restBall() {
    const b = this.ballPhys, sp = this.sprites.ball;
    this.ballPhys = null;
    if (!b) return;
    sp.setPos(b.x, b.ground - sp.h);
    this.game.store.change((d) => { d.ball = { x: Math.round(b.x), y: Math.round(b.ground - sp.h) }; });
  }

  stepBall(dt) {
    const b = this.ballPhys;
    if (!b) return;
    const sp = this.sprites.ball, F = BALL_FLOOR;
    if (b.h > 0 || b.vh > 0) {
      b.vh -= BALL_G * dt; b.h += b.vh * dt;
      if (b.h <= 0) {
        b.h = 0;
        if (b.vh < -170) { sfx("ball", { vol: Math.min(1, -b.vh / 900) }); b.vh = -b.vh * 0.42; set(sp, { sy: 0.86, sx: 1.08 }); spring(sp, { sx: 1, sy: 1 }, P.release); }
        else b.vh = 0;
      }
    }
    const air = b.h > 0;
    b.vx *= Math.exp(-(air ? 0.3 : 1.7) * dt);
    b.vg *= Math.exp(-(air ? 0.5 : 2.4) * dt);
    b.x += b.vx * dt; b.ground += b.vg * dt;
    if (b.x < F.xMin) { b.x = F.xMin; if (b.vx < -200) sfx("ball", { vol: 0.4 }); b.vx = Math.abs(b.vx) * 0.55; }
    if (b.x > F.xMax - sp.w) { b.x = F.xMax - sp.w; if (b.vx > 200) sfx("ball", { vol: 0.4 }); b.vx = -Math.abs(b.vx) * 0.55; }
    if (b.ground < F.bottomMin) { b.ground = F.bottomMin; b.vg = Math.abs(b.vg) * 0.5; }
    if (b.ground > F.bottomMax) { b.ground = F.bottomMax; b.vg = -Math.abs(b.vg) * 0.5; }
    set(sp, { r: (sp.m.r + (b.vx * dt) / (sp.w / 2) * 57.2958) % 360 });
    sp.setPos(b.x, b.ground - b.h - sp.h);
    if (!air && b.vh === 0 && Math.abs(b.vx) < 8 && Math.abs(b.vg) < 8) this.restBall();
  }

  callToBall() {
    if (!this.petFree()) return;
    this.chase = true; this.chaseT = 0;
  }

  // run to the ball's side; once it has stopped, play with it and give it a nudge
  stepChase(dt) {
    if (!this.chase) return;
    if (this.petOut || this.mode !== "room" || (this.carry && this.carry.kind === "pet") || this.chat.isOpen || !this.sprites.ball.visible) { this.chase = false; return; }
    if (this.busy || this.scripted) return;                   // e.g. still hopping off the table
    this.chaseT -= dt;
    const sp = this.sprites.ball;
    const bx = sp.x + sp.w / 2, bottom = this.ballKey();
    const fx = this.pet.feet().x;
    const side = fx < bx ? -1 : 1;
    const goal = nearestWalkable({ x: bx + side * (sp.w / 2 + 55), y: bottom + 4 });
    const f = this.pet.feet();
    const near = Math.hypot(goal.x - f.x, goal.y - f.y) < 6;
    if (!near) {
      if (this.chaseT <= 0 || this.motor.mode !== "walk") { this.chaseT = 0.25; this.goToFeet(goal); }
      return;
    }
    if (this.ballPhys) return;                    // wait beside it until it stops rolling
    this.chase = false;
    this.motor.stop();
    this.pet.setFacing(bx > this.pet.feet().x ? -1 : 1);
    this.petVoice();
    this.busy = true;
    const reach = Math.abs(bx - this.pet.feet().x) < sp.w / 2 + 150;
    if (reach) setTimeout(() => { if (!this.carry && this.sprites.ball.visible) this.kickBall(this.pet.facing === 1 ? -1 : 1); }, 380);
    this.motor.act(1.3, () => { this.busy = false; this.idleT = rand(2, 4); });
    if (this.cool("play_ball", 25)) this.addHearts(RULES.hearts.play);
    this.note("chased and played with the ball");
  }

  // ------------------------------------------------------------------ chat
  onPetClick() {
    if (this.mode === "dressing") return this.dressing.onPetClick();
    if (this.busy || this.scripted || this.petOut) { set(this.pet.root, { sy: 0.9 }); spring(this.pet.root, { sy: 1 }, P.release); return; }
    if (this.chat.isOpen) { this.closeChat(); return; }
    this.chase = false;
    this.motor.stop();
    this.pet.setFacing(1);
    this.petVoice();
    set(this.pet.root, { sy: 0.88, sx: 1.06 }); spring(this.pet.root, { sx: 1, sy: 1 }, P.release);
    this.openChat();
  }

  chatAnchors() {
    const D = PETS[this.s.pet];
    const tail = this.toStage({ x: this.pet.x + D.tail.dx, y: this.pet.y + D.tail.dy });
    const dialog = {
      x: clamp(tail.x + (D.dialog.dx - D.tail.dx), 8, 1920 - CHAT.dialog.w - 8),
      y: Math.max(8, tail.y + (D.dialog.dy - D.tail.dy)),
    };
    return { dialog, tail };
  }

  openChat({ mode = "room", greeting = null } = {}) {
    this.chatMode = mode;
    this.chat.open(this.chatAnchors());
    if (greeting) { this.chat.say(greeting); return; }
    this.chat.say(t("petHello", this.s.lang, this.s.pet));
  }

  closeChat(silent) { if (this.chat.isOpen) this.chat.close(silent); }
  onChatClosed() { this.idleT = rand(2, 4); if (this.mode === "dressing") this.dressing.onChatClosed(); }

  context(mode) {
    const s = this.s, w = s.wardrobe[s.pet];
    const wearing = [w.acc.sunglasses && "sunglasses", w.acc.bow && "a bow", w.outfit && (s.outfits.find((o) => o.id === w.outfit) || {}).prompt].filter(Boolean).join(", ");
    return { hearts: s.hearts[s.pet], wearing, recent: this.recent || "" , mode };
  }

  async ask(userText) {
    const s = this.s, pet = s.pet, mode = this.chatMode || "room";
    if (!this.game.info.aiEnabled) { this.chat.say(t("offline", s.lang, pet)); return { ok: false }; }
    this.chat.thinking();
    this.chat.busy = true;
    const history = s.chat[pet];
    const r = await askPet({ chatFn: window.hlo.chat, pet, lang: s.lang, mode, ctx: this.context(mode), history, userText });
    this.chat.busy = false;
    if (!this.chat.isOpen) return r;
    this.chat.say(r.text || t("offline", s.lang, pet));
    if (r.ok) {
      this.game.store.change((d) => {
        if (userText) d.chat[pet].push({ role: "user", content: userText });
        d.chat[pet].push({ role: "assistant", content: mode === "dressing" ? JSON.stringify(r.data) : r.text });
      });
      if (userText && this.cool("chat", 60)) this.addHearts(RULES.hearts.chat);
    }
    return r;
  }

  async onChatSend(text) {
    if (this.chatMode === "dressing") return this.dressing.onChatSend(text);
    impulse(this.pet.root, "sy", -1.2, P.wobble, 1);
    await this.ask(text);
  }


  // ------------------------------------------------------------------ desktop pet
  async goDesktop() {
    if (this.petOut) return;
    if (this.busy || this.scripted) { set(this.pet.root, { sx: 0.9 }); spring(this.pet.root, { sx: 1 }, P.release); return; }
    this.busy = true; this.scripted = true; this.chase = false; this.onTable = false;
    this.closeChat(true);
    this.motor.stop();
    const door = this.sprites.door;
    const target = { x: door.x + door.w * 0.55, y: door.y + door.h * 0.62 };
    const f0 = this.pet.feet();
    const x0 = this.pet.x, y0 = this.pet.y;
    this.pet.setFacing(1);
    this.pet.show("Walking_2");
    sfx("jump");
    await new Promise((res) => tween({ dur: 0.75, ease: ease.inOutSine, onUpdate: (e) => {
      const fx = f0.x + (target.x - f0.x) * e, fy = f0.y + (target.y - f0.y) * e - Math.sin(e * Math.PI) * 260;
      const sc = 1 - 0.45 * e;
      this.pet.setPos(x0 + (fx - f0.x), y0 + (fy - f0.y));
      this.pet.root.m.sx = this.pet.root.m.sy = sc; this.pet.root.m.o = 1 - Math.max(0, (e - 0.82) / 0.18); this.pet.root.apply();
    }, onDone: res }));
    bump(door, "door");
    sfx("door");
    this.pet.hide();
    set(this.pet.root, { sx: 1, sy: 1, o: 1 });
    this.petOut = true;
    this.busy = false; this.scripted = false;
    const s = this.s, w = s.wardrobe[s.pet];
    const client = this.game.stage.toClient(target.x, target.y);
    await window.hlo.launchDesktop({
      pet: s.pet, lang: s.lang, hearts: s.hearts[s.pet], scale: DESKTOP_SCALE, levels: { ...s.settings },
      outfit: outfitFor(s, w.outfit), acc: accPositions(w.acc), history: s.chat[s.pet].slice(-10),
      start: { clientX: client.x, clientY: client.y, vx: 420, vy: -760 },
    });
    window.hlo.event("desktop_pet", { pet: s.pet });
    this.note("went out to play on the player's computer desktop");
  }

  petReturned(pt) {
    this.petOut = false;
    this.onTable = false;
    if (pt.chat && pt.chat.length) this.game.store.change((d) => { d.chat[d.pet].push(...pt.chat); });
    sfx("door");
    if (this.game.sceneName !== "room" || this.mode !== "room") return;
    const p = this.toRoom(this.game.stage.toStage(pt.clientX, pt.clientY));
    const land = this.toCanvas(nearestWalkable({ x: p.x, y: p.y + 40 }));
    const x = land.x, yEnd = land.y;
    const yStart = Math.min(yEnd - 160, p.y - PET_FRAME.h);
    this.pet.showView();
    this.pet.setFacing(1, false);
    this.pet.show("Action_1");
    this.pet.setPos(x, yStart);
    this.busy = true; this.scripted = true;
    sfx("pickup");
    tween({ dur: 0.45, ease: ease.inCubic, onUpdate: (e) => this.pet.setPos(x, yStart + (yEnd - yStart) * e), onDone: () => {
      sfx("land");
      this.scripted = false;
      set(this.pet.root, { sy: 0.8, sx: 1.12 }); spring(this.pet.root, { sx: 1, sy: 1 }, P.release);
      this.petVoice();
      this.motor.act(1.2, () => { this.busy = false; this.idleT = rand(2, 4); });
    } });
  }

  // ------------------------------------------------------------------ bag / shop
  openBag() {
    openBag(this.game, { onUse: (tab, item) => this.useItem(tab, item) });
  }

  useItem(tab, item) {
    const g = this.game, s = this.s;
    if (tab === "pet") {
      if (item.key === s.pet) return true;
      g.store.change((d) => { d.pet = item.key; });
      const home = PETS[item.key].home;
      if (!this.petOut) { this.cancelTask(); this.onTable = false; this.pet.setPos(home.x, home.y); }
      this.applyPet(true);
      return true;
    }
    if (tab === "theme") {
      if (item.key === s.theme) return true;
      g.store.change((d) => { d.theme = item.key; });
      this.applyTheme();
      set(this.cam, { o: 0.4 }); spring(this.cam, { o: 1 }, P.soft);
      sfx("sparkle");
      return true;
    }
    if (tab === "food") {
      if (item.key === "soap") {
        if (s.floor.soap) return false;                       // one bar of soap on the floor at a time
        g.store.change((d) => { d.bagFood.splice(item.idx, 1); d.floor.soap = true; });
        const sp = this.props.soap;
        sp.setPos(ROOM_PROPS.soap.x, ROOM_PROPS.soap.y);
        sp.show(); set(sp, { y: -80, sx: 0.4, sy: 0.4, o: 0 }); spring(sp, { y: 0, sx: 1, sy: 1, o: 1 }, P.pop);
        sfx("drop");
        return true;
      }
      if (s.table.includes(item.key)) return false;
      g.store.change((d) => { d.bagFood.splice(item.idx, 1); d.table.push(item.key); });
      const sp = this.props[item.key];
      sp.show(); set(sp, { y: -80, sx: 0.4, sy: 0.4, o: 0 }); spring(sp, { y: 0, sx: 1, sy: 1, o: 1 }, P.pop);
      sfx("drop");
      return true;
    }
    if (tab === "furniture") {
      const stored = s.stored.includes(item.key);
      g.store.change((d) => { d.stored = stored ? d.stored.filter((x) => x !== item.key) : [...d.stored, item.key]; });
      if (item.key === "ball") { if (this.ballPhys) this.restBall(); this.chase = false; }
      const sp = this.sprites[item.key];
      const extra = item.key === "cabinet" ? [this.sprites.lamp] : [];
      for (const x of [sp, ...extra]) {
        if (stored) { x.show(); set(x, { sx: 0.3, sy: 0.3, o: 0 }); spring(x, { sx: 1, sy: 1, o: 1 }, P.pop); continue; }
        this.locks.add(x);                       // no hover spring may cancel the exit callback
        spring(x, { sx: 0.3, sy: 0.3, o: 0 }, P.out, () => { this.locks.delete(x); this.applyVisibility(); set(x, { sx: 1, sy: 1, o: 1 }); });
      }
      sfx(stored ? "drop" : "pickup");
      return true;
    }
    return true;
  }

  goShop() { this.game.goto("shop"); }

  // ------------------------------------------------------------------ frame update
  update(dt) {
    this.motor.update(dt);
    this.stepBall(dt);
    this.sortDepth();
    if (this.markT > 0 && (this.markT -= dt) <= 0) this.hideMark();
    // safety net: nothing may stay in the "held" layer once it is no longer held or animated
    if (this.carryL.children.length) for (const e of [...this.carryL.children]) {
      const sp = this.spriteOf.get(e);
      if (sp && !this.locks.has(sp) && !(this.carry && this.carry.sp === sp)) this.restoreLayer(sp);
    }
    if (this.chat.isOpen && this.mode === "room") this.chat.move(this.chatAnchors());
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1; if (this.mode === "room") this.spawnTick(); }
    if (this.mode === "dressing") { this.dressing.update(dt); return; }
    this.stepChase(dt);
    if (this.busy || this.scripted || this.petOut || this.chase || this.carry || this.chat.isOpen || this.motor.mode !== "idle") return;
    if (this.onTable && (this.tableT -= dt) <= 0) { this.jumpDown(); return; }   // after a while it hops down
    this.idleT -= dt;
    if (this.idleT > 0) return;
    this.idleT = rand(2.5, 6);
    const s = this.s;
    if (this.onTable || Math.random() < (s.hearts[s.pet] >= 70 ? 0.22 : 0.08)) { this.motor.act(rand(1, 1.8)); return; }
    this.goToFeet(randomSpot());
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
