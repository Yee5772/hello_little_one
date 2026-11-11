// A positioned bitmap. Placement (x, y or a 2D matrix from the PSD) is kept separate from
// "motion" (spring-driven offset/scale/rotation around a pivot), so animations always settle
// back to the exact pixel position measured from the artwork.
import * as assets from "./assets.js";

export function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function group(parent, cls = "") {
  const g = el("div", "grp" + (cls ? " " + cls : ""), parent);
  return g;
}

export class Sprite {
  constructor(src, x = 0, y = 0, o = {}) {
    this.el = el("div", "spr" + (o.cls ? " " + o.cls : ""));
    this.img = el("img", null, this.el);
    this.img.draggable = false;
    this.img.alt = "";
    this.x = x; this.y = y;
    this.fixedW = o.w; this.fixedH = o.h;
    this.pivot = o.pivot || "center";
    this.m = { x: 0, y: 0, sx: 1, sy: 1, r: 0, o: 1 };
    this.base = o.matrix || null;
    this.hit = o.hit === undefined ? "alpha" : o.hit;
    this.visible = true;
    this.src = null;
    if (src) this.setSrc(src);
    if (o.parent) o.parent.appendChild(this.el);
    if (o.visible === false) this.hide();
    if (o.opacity !== undefined) this.m.o = o.opacity;
    this.apply();
  }

  setSrc(src) {
    if (src === this.src) return this;
    this.src = src;
    const [nw, nh] = assets.size(src);
    this.nw = nw; this.nh = nh;
    this.w = this.fixedW || nw; this.h = this.fixedH || nh;
    this.el.style.width = this.w + "px";
    this.el.style.height = this.h + "px";
    this.img.src = assets.url(src);
    return this;
  }

  setSize(w, h) { this.fixedW = w; this.fixedH = h; this.w = w; this.h = h; this.el.style.width = w + "px"; this.el.style.height = h + "px"; this.apply(); return this; }
  setPos(x, y) { this.x = x; this.y = y; this.apply(); return this; }
  setMatrix(m) { this.base = m; this.apply(); return this; }

  pivotPx() {
    const p = this.pivot, w = this.w, h = this.h;
    if (Array.isArray(p)) return p;
    switch (p) {
      case "bottom": return [w / 2, h];
      case "top": return [w / 2, 0];
      case "left": return [0, h / 2];
      case "right": return [w, h / 2];
      case "topleft": return [0, 0];
      default: return [w / 2, h / 2];
    }
  }

  apply() {
    const m = this.m;
    let t = this.base ? `matrix(${this.base.join(",")})` : `translate(${this.x}px,${this.y}px)`;
    if (m.x || m.y || m.r || m.sx !== 1 || m.sy !== 1) {
      const [px, py] = this.pivotPx();
      t += ` translate(${px + m.x}px,${py + m.y}px) rotate(${m.r}deg) scale(${m.sx},${m.sy}) translate(${-px}px,${-py}px)`;
    }
    this.el.style.transform = t;
    this.el.style.opacity = m.o >= 0.999 ? "" : String(Math.max(0, m.o));
  }

  show() { this.visible = true; this.el.style.display = ""; return this; }
  hide() { this.visible = false; this.el.style.display = "none"; return this; }
  setVisible(v) { return v ? this.show() : this.hide(); }

  // point in the parent's coordinate space -> local (unscaled element) coordinates
  toLocal(px, py) {
    if (!this.base) return [px - this.x, py - this.y];
    const [a, b, c, d, e, f] = this.base;
    const det = a * d - b * c;
    const x = px - e, y = py - f;
    return [(d * x - c * y) / det, (-b * x + a * y) / det];
  }

  hitTest(px, py) {
    if (!this.visible || this.hit === false || this.m.o < 0.05) return false;
    const [lx, ly] = this.toLocal(px, py);
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return false;
    if (this.hit === "box") return true;
    const at = this.hit === "solid" ? assets.solidAt : assets.alphaAt;
    const a = at(this.src, (lx * this.nw) / this.w, (ly * this.nh) / this.h);
    return a < 0 ? true : a > 24;
  }

  remove() { this.el.remove(); }
}

// A container with the same spring "motion" channels as a Sprite (used for modals, bubbles…).
export class Group {
  constructor(parent, o = {}) {
    this.el = el("div", "grp" + (o.cls ? " " + o.cls : ""), parent);
    this.x = o.x || 0; this.y = o.y || 0;
    this.w = o.w || 0; this.h = o.h || 0;
    this.pivot = o.pivot || [this.w / 2, this.h / 2];
    this.m = { x: 0, y: 0, sx: 1, sy: 1, r: 0, o: 1 };
    this.base = o.matrix || null;
    this.visible = true;
    this.apply();
  }
  pivotPx() { return Array.isArray(this.pivot) ? this.pivot : [this.w / 2, this.h / 2]; }
  apply() { Sprite.prototype.apply.call(this); }
  setPos(x, y) { this.x = x; this.y = y; this.apply(); return this; }
  show() { this.visible = true; this.el.style.display = ""; return this; }
  hide() { this.visible = false; this.el.style.display = "none"; return this; }
  remove() { this.el.remove(); }
}
