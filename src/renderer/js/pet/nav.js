// Walking in the room: which floor points the pet's feet may stand on (NAV in layout.js) and a
// small shortest-path search around the table and the pouf, so the pet can walk behind the table
// without ever walking through it.
import { NAV } from "../layout.js";

const STEP = 8;              // px between samples when checking a straight walk

export function walkable(x, y) {
  if (y < NAV.yBack || y > NAV.yFront || x < NAV.xMin) return false;
  if (x > (y < NAV.notchY ? NAV.xMaxBack : NAV.xMaxFront)) return false;
  for (const o of NAV.obstacles) {
    const dx = (x - o.cx) / o.rx, dy = (y - o.cy) / o.ry;
    if (dx * dx + dy * dy < 1) return false;
  }
  return true;
}

function clear(a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!walkable(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/** The closest point the feet may stand on (out of an obstacle, onto the floor). */
export function nearestWalkable(p) {
  let x = Math.max(NAV.xMin, Math.min(NAV.xMaxBack, p.x));
  let y = Math.max(NAV.yBack, Math.min(NAV.yFront, p.y));
  if (x > NAV.xMaxFront && y >= NAV.notchY) {          // the front-right corner is not floor
    if (x - NAV.xMaxFront < y - NAV.notchY + 1) x = NAV.xMaxFront; else y = NAV.notchY - 1;
  }
  if (walkable(x, y)) return { x, y };
  for (const o of NAV.obstacles) {
    const dx = (x - o.cx) / o.rx, dy = (y - o.cy) / o.ry;
    if (dx * dx + dy * dy >= 1) continue;
    // push straight out of the ellipse (along the ray from its centre), just past the edge
    const a = Math.atan2(dy || 1e-6, dx || 1e-6);
    const c = { x: o.cx + Math.cos(a) * (o.rx + 4), y: o.cy + Math.sin(a) * (o.ry + 4) };
    if (walkable(c.x, c.y)) return c;
  }
  // last resort: search a small spiral
  for (let r = 10; r < 400; r += 10) for (let k = 0; k < 16; k++) {
    const q = { x: x + Math.cos((k / 16) * Math.PI * 2) * r, y: y + Math.sin((k / 16) * Math.PI * 2) * r * 0.5 };
    if (walkable(q.x, q.y)) return q;
  }
  return { x: 600, y: 950 };
}

function waypoints() {
  const pts = [];
  for (const o of NAV.obstacles) for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const p = { x: o.cx + Math.cos(a) * (o.rx + 26), y: o.cy + Math.sin(a) * (o.ry + 18) };
    if (walkable(p.x, p.y)) pts.push(p);
  }
  const corner = { x: NAV.xMaxFront - 6, y: NAV.notchY - 8 };
  if (walkable(corner.x, corner.y)) pts.push(corner);
  return pts;
}

/**
 * Feet path from `from` to `to` (both stage px): a list of points to walk through, ending at the
 * walkable point closest to `to`. The first point brings the pet back onto the floor if needed.
 */
export function findPath(from, to) {
  const goal = nearestWalkable(to);
  const lead = [];
  let start = from;
  if (!walkable(from.x, from.y)) { start = nearestWalkable(from); lead.push(start); }
  if (clear(start, goal)) return [...lead, goal];
  const nodes = [start, goal, ...waypoints()];
  const n = nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y);
      if (d < dist[v] && clear(nodes[u], nodes[v])) { dist[v] = d; prev[v] = u; }
    }
  }
  if (prev[1] < 0) return [...lead, goal];          // no way around (should not happen): go straight
  const path = [];
  for (let v = 1; v > 0; v = prev[v]) path.unshift(nodes[v]);
  return [...lead, ...path];
}

/** A random spot on the open floor (for wandering). */
export function randomSpot() {
  for (let i = 0; i < 60; i++) {
    const p = { x: NAV.xMin + Math.random() * (NAV.xMaxBack - NAV.xMin), y: NAV.yBack + Math.random() * (NAV.yFront - NAV.yBack) };
    if (walkable(p.x, p.y)) return p;
  }
  return { x: 700, y: 950 };
}

/** Is a feet point over the table top (where a dropped pet would land on it)? */
export function overEllipse(e, x, y, grow = 0) {
  const dx = (x - e.cx) / (e.rx + grow), dy = (y - e.cy) / (e.ry + grow);
  return dx * dx + dy * dy <= 1;
}
