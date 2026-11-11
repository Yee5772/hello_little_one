// Soap bubbles for the bath. The art has no bubble picture, so they are drawn once at start-up in
// the artwork's own manner: the same warm-brown outline every object has (sampled from O_Soap /
// the pets: rgb(126,86,40)), a slightly wobbly hand-drawn ring, a pale see-through fill and a
// white shine.
import * as assets from "../core/assets.js";
import { Sprite } from "../core/sprite.js";
import { set } from "../core/spring.js";
import { tween, ease } from "../core/tween.js";

const OUTLINE = "rgb(126, 86, 40)";
const ART = 96;                       // drawn large, shown at 20-48 px
let keys = null;

function drawBubble(seed) {
  const c = document.createElement("canvas");
  c.width = c.height = ART;
  const g = c.getContext("2d");
  const cx = ART / 2, cy = ART / 2, r = ART / 2 - 7;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // wobbly ring, like the hand-drawn outlines in the art
  const pts = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, rr = r * (1 + (rnd() - 0.5) * 0.05);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const p = pts[i % N], q = pts[(i + 1) % N];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
  }
  g.closePath();
  const fill = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  fill.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  fill.addColorStop(0.55, "rgba(226, 242, 250, 0.55)");
  fill.addColorStop(1, "rgba(206, 228, 246, 0.62)");
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 6.5;
  g.lineJoin = g.lineCap = "round";
  g.strokeStyle = OUTLINE;
  g.stroke();
  // shine: a curved stroke and a dot at the top left
  g.strokeStyle = "rgba(255, 255, 255, 0.95)";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(cx, cy, r * 0.62, Math.PI * 1.08, Math.PI * 1.42);
  g.stroke();
  g.fillStyle = "rgba(255, 255, 255, 0.95)";
  g.beginPath();
  g.arc(cx - r * 0.12, cy - r * 0.62, 3.6, 0, Math.PI * 2);
  g.fill();
  return c.toDataURL("image/png");
}

/** the bubble pictures (data URLs registered as assets) */
export function bubbleKeys() {
  if (keys) return keys;
  keys = [11, 4021, 977].map((seed) => {
    const k = drawBubble(seed);
    assets.register(k, ART, ART);
    return k;
  });
  return keys;
}

/**
 * Let bubbles go at (x, y) in the parent's coordinates: they swell up, drift upwards wobbling,
 * then pop. `spread` scatters the start points.
 */
export function bubbles(parent, x, y, { n = 1, spread = 30, rise = [70, 170], life = [0.9, 1.7], size = [20, 48] } = {}) {
  const ks = bubbleKeys();
  for (let i = 0; i < n; i++) {
    const s = size[0] + Math.random() * (size[1] - size[0]);
    const sp = new Sprite(ks[(Math.random() * ks.length) | 0], 0, 0, { parent, hit: false, pivot: "center", w: s, h: s });
    const x0 = x + (Math.random() * 2 - 1) * spread, y0 = y + (Math.random() * 2 - 1) * spread * 0.6;
    const dx = (Math.random() * 2 - 1) * 45, up = rise[0] + Math.random() * (rise[1] - rise[0]);
    const dur = life[0] + Math.random() * (life[1] - life[0]), ph = Math.random() * 6.28, swing = 5 + Math.random() * 7;
    set(sp, { sx: 0.1, sy: 0.1, o: 0 });
    tween({ dur, ease: ease.linear, onUpdate: (_e, p) => {
      sp.setPos(x0 - s / 2 + dx * p + Math.sin(ph + p * 7) * swing, y0 - s / 2 - up * ease.outQuad(p));
      let k, o;
      if (p < 0.16) { k = ease.outBack(p / 0.16); o = Math.min(1, p / 0.08); }          // swell up
      else if (p < 0.86) { k = 1 + Math.sin(ph + p * 11) * 0.04; o = 1; }              // wobble
      else { const q = (p - 0.86) / 0.14; k = 1 + q * 0.45; o = 1 - q; }                // pop
      set(sp, { sx: k * (1 + Math.sin(ph + p * 9) * 0.03), sy: k * (1 - Math.sin(ph + p * 9) * 0.03), o });
    }, onDone: () => sp.remove() });
  }
}
