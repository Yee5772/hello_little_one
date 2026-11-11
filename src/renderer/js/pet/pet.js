// A pet: its 291x252 animation canvas, worn accessories that follow every animation frame
// (per-frame head offsets measured from the artwork), optional AI outfit frames, and a
// small animation/movement controller.
import { Sprite, Group, el } from "../core/sprite.js";
import { PETS, PET_FRAME, CLOTHES } from "../layout.js";
import { spring, set, P } from "../core/spring.js";

const WALK_SEQ = ["Walking_1", "Walking_2", "Walking_3", "Walking_4"];
const ACT_SEQ = ["Action_1", "Action_2"];

export class PetView {
  constructor(parent, { pet = "C4", x = 0, y = 0, matrix = null } = {}) {
    this.root = new Group(parent, { x, y, w: PET_FRAME.w, h: PET_FRAME.h, pivot: [PET_FRAME.w / 2, PET_FRAME.h], matrix });
    this.flip = new Group(this.root.el, { w: PET_FRAME.w, h: PET_FRAME.h, pivot: [PET_FRAME.w / 2, PET_FRAME.h / 2] });
    this.frame = new Sprite(`anim/${pet}_Default.png`, 0, 0, { parent: this.flip.el, hit: "alpha" });
    this.garment = new Sprite(null, 0, 0, { parent: this.flip.el, hit: "alpha", visible: false });
    this.accLayer = el("div", "grp", this.flip.el);
    this.acc = {};
    this.pet = pet;
    this.outfit = null;
    this.frameName = "Default";
    this.facing = 1;             // 1 = artwork orientation (looking left), -1 = mirrored (looking right)
    this.wearing = {};
  }

  get x() { return this.root.x; }
  get y() { return this.root.y; }
  setPos(x, y) { this.root.setPos(x, y); }

  setPet(pet) { this.pet = pet; this.show(this.frameName, true); this.layoutAcc(); }
  setOutfit(outfit) {
    this.outfit = outfit || null;
    this.show(this.frameName, true);
  }

  /** accessories: { sunglasses: {x, y}, bow: {x, y} } (positions in pet-canvas pixels, Default frame) */
  setAccessories(acc) {
    this.wearing = { ...(acc || {}) };
    for (const id of Object.keys(this.acc)) if (!this.wearing[id]) { this.acc[id].remove(); delete this.acc[id]; }
    for (const id of Object.keys(this.wearing)) {
      if (!this.acc[id]) this.acc[id] = new Sprite(CLOTHES[id].src, 0, 0, { parent: this.accLayer, hit: "alpha", pivot: "center" });
    }
    // keep a stable stacking: sunglasses under the bow
    for (const id of ["sunglasses", "bow"]) if (this.acc[id]) this.accLayer.appendChild(this.acc[id].el);
    this.layoutAcc();
  }

  layoutAcc() {
    const off = PETS[this.pet].headOffsets[this.frameName] || [0, 0];
    for (const [id, sp] of Object.entries(this.acc)) {
      const p = this.wearing[id];
      sp.setPos(p.x + off[0], p.y + off[1]);
    }
  }

  frameKey(name) {
    const legacyFrame = this.outfit && !this.outfit.isLayer && this.outfit.frames[name];
    return legacyFrame || `anim/${this.pet}_${name}.png`;
  }

  show(name, force = false) {
    if (name === this.frameName && !force) return;
    this.frameName = name;
    this.frame.setSrc(this.frameKey(name));
    const layer = this.outfit?.isLayer && this.outfit.frames[name];
    if (layer) {
      this.garment.setSrc(layer).setPos(this.outfit.x, this.outfit.y).show();
    } else {
      this.garment.hide();
    }
    this.layoutAcc();
  }

  setFacing(f, animate = true) {
    if (f === this.facing) return;
    this.facing = f;
    if (animate) { set(this.flip, { sx: -f * 0.6 }); spring(this.flip, { sx: f }, P.hover); }
    else set(this.flip, { sx: f });
  }

  // point in the parent's coordinates -> pet-canvas coordinates (undoing placement + flip)
  toCanvas(px, py) {
    let [lx, ly] = this.root.base ? Sprite.prototype.toLocal.call(this.root, px, py) : [px - this.root.x, py - this.root.y];
    if (this.flip.m.sx < 0) lx = PET_FRAME.w - lx;
    return [lx, ly];
  }

  hitTest(px, py) {
    if (!this.root.visible) return false;
    const [lx, ly] = this.toCanvas(px, py);
    if (this.frame.hitTest(lx, ly) || this.garment.hitTest(lx, ly)) return true;
    return Object.values(this.acc).some((a) => a.hitTest(lx, ly));
  }

  outfitAt(px, py) {
    const [lx, ly] = this.toCanvas(px, py);
    return this.root.visible && this.garment.hitTest(lx, ly);
  }

  accAt(px, py) {
    const [lx, ly] = this.toCanvas(px, py);
    for (const id of ["bow", "sunglasses"]) if (this.acc[id] && this.acc[id].hitTest(lx, ly)) return id;
    return null;
  }

  // feet position (bottom centre of the visible body) in parent coordinates
  feet() { const a = PETS[this.pet].alpha; return { x: this.root.x + (a.x0 + a.x1) / 2, y: this.root.y + PET_FRAME.h }; }

  hide() { this.root.hide(); }
  showView() { this.root.show(); }
}

/** Movement + animation timing for a PetView. */
export class PetMotor {
  constructor(view) {
    this.v = view;
    this.mode = "idle";
    this.t = 0;
    this.fi = 0;
    this.target = null;
    this.speed = 150;
    this.onArrive = null;
    this.actLeft = 0;
  }

  walkTo(x, y, cb) { this.walkPath([{ x, y }], cb); }

  /** walk through a list of points (pet-canvas top-left positions), then run cb */
  walkPath(points, cb) {
    this.path = points.slice(1);
    this.onArrive = cb || null;
    this.mode = "walk";
    this.head(points[0]);
  }

  head(p) {
    this.target = { x: p.x, y: p.y };
    const dx = p.x - this.v.x;
    if (Math.abs(dx) > 2) this.v.setFacing(dx > 0 ? -1 : 1);
  }

  act(sec = 1.6, cb) { this.mode = "act"; this.actLeft = sec; this.onArrive = cb || null; this.t = 0; this.fi = 0; this.v.show(ACT_SEQ[0]); }
  idle() { this.mode = "idle"; this.target = null; this.path = null; this.v.show("Default"); }
  stop() { this.idle(); this.onArrive = null; }

  update(dt) {
    this.t += dt;
    if (this.mode === "walk" && this.target) {
      const dx = this.target.x - this.v.x, dy = this.target.y - this.v.y;
      const d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d <= step) {
        this.v.setPos(this.target.x, this.target.y);
        if (this.path && this.path.length) { this.head(this.path.shift()); return; }   // next corner
        this.mode = "idle"; this.target = null; this.v.show("Default");
        const cb = this.onArrive; this.onArrive = null; if (cb) cb();
      } else {
        this.v.setPos(this.v.x + (dx / d) * step, this.v.y + (dy / d) * step);
        if (this.t > 0.11) { this.t = 0; this.fi = (this.fi + 1) % WALK_SEQ.length; this.v.show(WALK_SEQ[this.fi]); }
      }
    } else if (this.mode === "act") {
      this.actLeft -= dt;
      if (this.t > 0.24) { this.t = 0; this.fi = (this.fi + 1) % ACT_SEQ.length; this.v.show(ACT_SEQ[this.fi]); }
      if (this.actLeft <= 0) { this.mode = "idle"; this.v.show("Default"); const cb = this.onArrive; this.onArrive = null; if (cb) cb(); }
    }
  }
}
