// The 1920x1080 stage, uniformly scaled to fit the window.
// Scaling uses CSS `zoom` (not a transform): Chromium then rasterises the artwork directly at
// the final resolution, so at 1920x1080 every artwork pixel lands on exactly one screen pixel
// (a scale transform would be resampled by the compositor and soften every edge).
import { STAGE } from "../layout.js";

export class Stage {
  constructor(viewport, el) {
    this.vp = viewport;
    this.el = el;
    this.frame = document.createElement("div");
    this.frame.id = "frame";
    viewport.insertBefore(this.frame, el);
    this.frame.appendChild(el);
    this.scale = 1; this.ox = 0; this.oy = 0;
    this.listeners = [];
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const s = Math.min(W / STAGE.w, H / STAGE.h);
    const dpr = window.devicePixelRatio || 1;
    this.scale = s;
    this.ox = Math.round(((W - STAGE.w * s) / 2) * dpr) / dpr;
    this.oy = Math.round(((H - STAGE.h * s) / 2) * dpr) / dpr;
    Object.assign(this.frame.style, { left: this.ox + "px", top: this.oy + "px", width: STAGE.w * s + "px", height: STAGE.h * s + "px" });
    this.el.style.zoom = String(s);
    for (const f of this.listeners) f();
  }

  onResize(f) { this.listeners.push(f); }
  toStage(cx, cy) { return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale }; }
  toClient(x, y) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }

  layer(name) {
    const d = document.createElement("div");
    d.className = "layer layer-" + name;
    this.el.appendChild(d);
    return d;
  }
}
