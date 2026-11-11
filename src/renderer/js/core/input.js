// Pointer & keyboard routing with pixel-accurate hit testing. Input is delivered only to the
// top-most scope (a modal blocks the room underneath), to the top-most node under the pointer.
export class Scope {
  constructor(name, o = {}) {
    this.name = name;
    this.nodes = [];
    this.onBackgroundClick = o.onBackgroundClick || null;
    this.onWheel = o.onWheel || null;
    this.onKey = o.onKey || null;
    this.seq = 0;
  }
  add(node) { node._seq = this.seq++; if (node.z === undefined) node.z = node._seq; this.nodes.push(node); return node; }
  remove(node) { const i = this.nodes.indexOf(node); if (i >= 0) this.nodes.splice(i, 1); }
  clear() { this.nodes.length = 0; }
}

export class Input {
  constructor(viewport, stage) {
    this.vp = viewport;
    this.stage = stage;
    this.scopes = [];
    this.hover = null;
    this.press = null;
    this.last = { x: -1, y: -1 };
    this.locked = 0;          // >0 while a scripted transition runs (ignore the player)
    const opt = { passive: false };
    viewport.addEventListener("pointerdown", (e) => this.onDown(e), opt);
    viewport.addEventListener("pointermove", (e) => this.onMove(e), opt);
    viewport.addEventListener("pointerup", (e) => this.onUp(e), opt);
    viewport.addEventListener("pointercancel", (e) => this.onUp(e, true), opt);
    viewport.addEventListener("lostpointercapture", () => { if (this.press) this.onUp(null, true); });
    viewport.addEventListener("wheel", (e) => this.onWheelEv(e), opt);
    // the pointer left the window while over a button: nothing may stay lit up
    viewport.addEventListener("pointerleave", () => { if (!this.press) { this.last = { x: -1, y: -1 }; this.setHover(null); } });
    viewport.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.onKeyEv(e));
    window.addEventListener("blur", () => { if (this.press) this.onUp(null, true); this.setHover(null); });
  }

  get top() { return this.scopes[this.scopes.length - 1] || null; }
  push(scope) { this.scopes.push(scope); this.refresh(); return scope; }
  pop(scope) {
    const i = this.scopes.lastIndexOf(scope);
    if (i >= 0) this.scopes.splice(i, 1);
    if (this.press && this.press.scope === scope) {
      // a drag cut short by its scope going away still gets its end (so nothing stays "held")
      const p = this.press;
      this.press = null;
      if (p.dragging && p.node && p.node.drag && p.node.drag.end) p.node.drag.end(this.last, true);
    }
    this.refresh();
  }
  lock(on) { this.locked = Math.max(0, this.locked + (on ? 1 : -1)); if (on) this.setHover(null); else this.refresh(); }

  pick(pt) {
    const s = this.top;
    if (!s || this.locked) return null;
    let best = null;
    for (const n of s.nodes) {
      if (n.enabled && !n.enabled()) continue;
      if (best && (n.z < best.z || (n.z === best.z && n._seq < best._seq))) continue;
      if (n.hit(pt)) best = n;
    }
    return best;
  }

  setHover(n) {
    if (n === this.hover) return;
    const prev = this.hover;
    this.hover = n;
    if (prev && prev.leave) prev.leave();
    if (n && n.enter) n.enter();
    this.vp.style.cursor = (n && n.cursor) || "";
  }

  refresh() { if (this.last.x >= 0 && !this.press) this.setHover(this.pick(this.last)); }

  isTextTarget(e) { return e && e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"); }

  onDown(e) {
    if (e.button !== 0) return;
    const pt = this.stage.toStage(e.clientX, e.clientY);
    this.last = pt;
    if (this.isTextTarget(e)) return;
    e.preventDefault();
    if (this.locked) return;
    const node = this.pick(pt);
    try { this.vp.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.press = { node, pt0: pt, dragging: false, scope: this.top, id: e.pointerId };
    if (node) {
      this.setHover(node);
      if (node.down) node.down(pt, e);
    }
  }

  onMove(e) {
    const pt = this.stage.toStage(e.clientX, e.clientY);
    this.last = pt;
    const p = this.press;
    if (p && p.node) {
      if (p.node.drag) {
        if (!p.dragging && Math.hypot(pt.x - p.pt0.x, pt.y - p.pt0.y) > 5) {
          p.dragging = true;
          if (p.node.drag.start) p.node.drag.start(p.pt0, pt);
          this.vp.style.cursor = p.node.dragCursor || "grabbing";
        }
        if (p.dragging) { p.node.drag.move(pt, pt.x - p.pt0.x, pt.y - p.pt0.y); return; }
      }
      // pressed button: show pressed only while the pointer stays on it
      const over = p.node.hit(pt);
      if (over !== p.over) { p.over = over; if (p.node.pressOver) p.node.pressOver(over); }
      return;
    }
    if (!p) this.setHover(this.pick(pt));
  }

  onUp(e, cancel = false) {
    const p = this.press;
    this.press = null;
    if (!p) return;
    const pt = e ? this.stage.toStage(e.clientX, e.clientY) : this.last;
    try { if (e) this.vp.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (p.node) {
      if (p.dragging) { if (p.node.drag.end) p.node.drag.end(pt, cancel); }
      else {
        const inside = !cancel && p.node.hit(pt) && !this.locked && p.scope === this.top;
        if (p.node.up) p.node.up(pt, inside);
        if (inside && p.node.click) p.node.click(pt, e);
      }
    } else if (!cancel && !this.locked && p.scope === this.top && Math.hypot(pt.x - p.pt0.x, pt.y - p.pt0.y) < 8) {
      if (p.scope && p.scope.onBackgroundClick) p.scope.onBackgroundClick(pt);
    }
    // re-evaluate what is under the pointer; the node left behind gets its leave() (a button that was
    // disabled by its own click, e.g. a sold price tag, must not stay lit up)
    this.setHover(this.pick(pt));
  }

  onWheelEv(e) {
    const s = this.top;
    if (s && s.onWheel && !this.locked) { e.preventDefault(); s.onWheel(e.deltaY, this.stage.toStage(e.clientX, e.clientY)); }
  }

  onKeyEv(e) {
    if (this.locked) return;
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i];
      if (s.onKey && s.onKey(e)) { e.preventDefault(); return; }
      if (i === this.scopes.length - 1) break; // only the top scope handles keys
    }
  }
}

export const hitSprite = (sprite) => (pt) => sprite.hitTest(pt.x, pt.y);
