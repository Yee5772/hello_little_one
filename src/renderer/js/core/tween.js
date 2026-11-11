// Time-based tweens driven by the same frame loop as the springs (camera moves, fades, timers).
export const ease = {
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inQuad: (t) => t * t,           // free fall
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
};

const list = new Set();

export function tween({ dur, ease: e = ease.inOutCubic, onUpdate, onDone, delay = 0 }) {
  const tw = { t: -delay, dur: Math.max(1e-6, dur), e, onUpdate, onDone, dead: false, cancel() { this.dead = true; list.delete(this); } };
  list.add(tw);
  return tw;
}

export function wait(sec) { return new Promise((r) => tween({ dur: sec, onDone: r })); }

export function step(dt) {
  for (const tw of list) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const p = Math.min(1, tw.t / tw.dur);
    if (tw.onUpdate) tw.onUpdate(tw.e(p), p);
    if (p >= 1) { list.delete(tw); if (!tw.dead && tw.onDone) tw.onDone(); }
  }
}
