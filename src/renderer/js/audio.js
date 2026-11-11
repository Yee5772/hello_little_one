// Background music (3 tracks, cross-faded per scene) and sound effects with separate volumes,
// matching the two sliders / two toggle icons of the Settings panel.
import { url, sfxList } from "./core/assets.js";

const TRACKS = {
  menu: "audio/bgm/welcome_home.mp3",
  room: "audio/bgm/sunbeam_naps.mp3",
  shop: "audio/bgm/tiny_paws_treasure.mp3",
};

let ctx = null, musicBus = null, sfxBus = null;
const tracks = {};
const buffers = new Map();
let current = null;
const levels = { music: 0.634375, sfx: 0.634375, musicOn: true, sfxOn: true };
const lastPlay = new Map();

function curve(v) { return Math.pow(Math.max(0, Math.min(1, v)), 1.6); }

export async function initAudio() {
  ctx = new AudioContext({ latencyHint: "interactive" });
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(ctx.destination);
  sfxBus.connect(ctx.destination);
  for (const [k, src] of Object.entries(TRACKS)) {
    const a = new Audio(url(src));
    a.loop = true; a.preload = "auto"; a.crossOrigin = "anonymous";
    const node = ctx.createMediaElementSource(a);
    const g = ctx.createGain(); g.gain.value = 0;
    node.connect(g).connect(musicBus);
    tracks[k] = { el: a, gain: g };
  }
  applyLevels();
  await Promise.all(sfxList().map(async (name) => {
    try {
      const res = await fetch(url(`audio/sfx/${name}.mp3`));
      buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch (e) { console.warn("sfx load failed", name, e); }
  }));
  const resume = () => { if (ctx.state !== "running") ctx.resume(); };
  window.addEventListener("pointerdown", resume, true);
  window.addEventListener("keydown", resume, true);
  resume();
}

function applyLevels() {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.setTargetAtTime(levels.musicOn ? curve(levels.music) : 0, t, 0.05);
  sfxBus.gain.setTargetAtTime(levels.sfxOn ? curve(levels.sfx) : 0, t, 0.03);
}

export function setLevels(l) { Object.assign(levels, l); applyLevels(); }
export function getLevels() { return { ...levels }; }

export function music(key, fade = 1.2) {
  if (!ctx || current === key) return;
  const t = ctx.currentTime;
  const prev = current ? tracks[current] : null;
  current = key;
  if (prev) {
    prev.gain.gain.cancelScheduledValues(t);
    prev.gain.gain.setValueAtTime(prev.gain.gain.value, t);
    prev.gain.gain.linearRampToValueAtTime(0, t + fade);
    const el = prev.el;
    setTimeout(() => { if (tracks[current] && tracks[current].el !== el) el.pause(); }, fade * 1000 + 100);
  }
  const next = key ? tracks[key] : null;
  if (next) {
    if (next.el.paused) { next.el.currentTime = next.el.currentTime || 0; next.el.play().catch(() => {}); }
    next.gain.gain.cancelScheduledValues(t);
    next.gain.gain.setValueAtTime(next.gain.gain.value, t);
    next.gain.gain.linearRampToValueAtTime(1, t + fade);
  }
}

/** Play a sound effect. Unknown names are ignored (so the game never breaks on a missing file). */
export function sfx(name, { vol = 1, rate = 1, minGap = 0.045 } = {}) {
  if (!ctx || !levels.sfxOn) return;
  const buf = buffers.get(name);
  if (!buf) return;
  const now = ctx.currentTime;
  if (now - (lastPlay.get(name) || -1) < minGap) return;
  lastPlay.set(name, now);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol * (name === "hover" ? 0.4 : 1);
  src.connect(g).connect(sfxBus);
  src.start();
}

export function hasSfx(name) { return buffers.has(name); }
