// Damped-spring motion for sprites. Every UI interaction in the game (hover, press, pop-in,
// wobble) is a physical spring on one of a sprite's motion channels: x, y, sx, sy, r, o.
export const P = {
  hover: { k: 540, c: 24 },     // quick lift with a small overshoot
  press: { k: 1100, c: 46 },    // firm squash while held
  release: { k: 460, c: 13 },   // bouncy rebound
  pop: { k: 330, c: 15 },       // modal / bubble open
  out: { k: 520, c: 34 },       // closing (little or no overshoot)
  soft: { k: 170, c: 21 },
  wobble: { k: 230, c: 6 },     // props wiggle
  sway: { k: 70, c: 3.2 },      // plants / hanging things swinging
  stiff: { k: 900, c: 60 },
};

class Spring {
  constructor(v) { this.v = v; this.t = v; this.vel = 0; this.k = 300; this.c = 20; }
  step(dt) {
    const f = -this.k * (this.v - this.t) - this.c * this.vel;
    this.vel += f * dt;
    this.v += this.vel * dt;
  }
  get settled() { return Math.abs(this.v - this.t) < 1e-3 && Math.abs(this.vel) < 1e-2; }
}

const active = new Set();

function chan(sprite, k) {
  if (!sprite._sp) sprite._sp = {};
  return sprite._sp[k] || (sprite._sp[k] = new Spring(sprite.m[k]));
}

/** Animate sprite motion channels toward targets with a spring preset. */
export function spring(sprite, targets, preset = P.pop, onDone) {
  for (const k of Object.keys(targets)) {
    const s = chan(sprite, k);
    s.t = targets[k];
    s.k = preset.k; s.c = preset.c;
  }
  sprite._spDone = onDone || null;
  active.add(sprite);
}

/** Add velocity to a channel (a "kick"), optionally around a rest value. */
export function impulse(sprite, k, velocity, preset = P.wobble, rest) {
  const s = chan(sprite, k);
  s.vel += velocity;
  s.k = preset.k; s.c = preset.c;
  if (rest !== undefined) s.t = rest;
  active.add(sprite);
}

/** Jump instantly (no animation). */
export function set(sprite, values) {
  for (const k of Object.keys(values)) {
    sprite.m[k] = values[k];
    if (sprite._sp && sprite._sp[k]) { const s = sprite._sp[k]; s.v = s.t = values[k]; s.vel = 0; }
  }
  sprite.apply();
}

export function isAnimating(sprite) { return active.has(sprite); }

export function step(dt) {
  if (!active.size) return;
  const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / sub;
  for (const sp of active) {
    let settled = true;
    for (const k in sp._sp) {
      const s = sp._sp[k];
      if (s.settled) { s.v = s.t; s.vel = 0; sp.m[k] = s.v; continue; }
      for (let i = 0; i < sub; i++) s.step(h);
      sp.m[k] = s.v;
      settled = false;
    }
    sp.apply();
    if (settled) {
      active.delete(sp);
      const cb = sp._spDone; sp._spDone = null;
      if (cb) cb();
    }
  }
}
