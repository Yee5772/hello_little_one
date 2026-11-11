// Asset registry: sizes come from assets/manifest.json (generated at build time), images are
// pre-decoded, and alpha masks are computed lazily for pixel-accurate hit testing.
// Same-origin URLs (the game window and the desktop-pet window use different app:// hosts),
// so canvas reads of the artwork are never tainted.
const BASE = location.origin + "/assets/";
let manifest = { images: {}, sfx: [] };
const images = new Map();   // key -> HTMLImageElement (decoded)
const masks = new Map();    // key -> { w, h, a: Uint8Array }
const extra = new Map();    // external images (AI outfit frames): key -> [w, h]

export function url(key) {
  if (/^(app|blob|data):/.test(key)) return key;
  if (key.startsWith("outfits/") || key.startsWith("postcards/")) return location.origin + "/" + key;
  return BASE + key;
}

export async function loadManifest() {
  const res = await fetch(BASE + "manifest.json");
  manifest = await res.json();
  return manifest;
}

export function sfxList() { return manifest.sfx; }
export function has(key) { return !!manifest.images[key] || extra.has(key); }
export function size(key) {
  const s = manifest.images[key] || extra.get(key);
  if (!s) throw new Error(`unknown asset: ${key}`);
  return s;
}
export function register(key, w, h) { extra.set(key, [w, h]); }

export function load(key) {
  if (images.has(key)) return Promise.resolve(images.get(key));
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    // decode() never settles while Windows reports the window as covered: don't let that stall loading
    const decoded = () => (img.decode ? Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve());
    img.onload = () => { decoded().then(() => { images.set(key, img); resolve(img); }); };
    img.onerror = () => { console.warn("asset failed:", key); resolve(null); };
    img.src = url(key);
  });
}

export async function preloadAll(filter, onProgress) {
  const keys = Object.keys(manifest.images).filter(filter || (() => true));
  let done = 0;
  const N = 12; // limited parallelism keeps the first paint smooth
  let i = 0;
  async function worker() {
    while (i < keys.length) {
      const k = keys[i++];
      await load(k);
      done++;
      if (onProgress) onProgress(done / keys.length);
    }
  }
  await Promise.all(Array.from({ length: N }, worker));
}

export function image(key) { return images.get(key) || null; }

export function mask(key) {
  if (masks.has(key)) return masks.get(key);
  const img = images.get(key);
  if (!img) return null;
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let data;
  try { data = g.getImageData(0, 0, w, h).data; } catch { return null; }
  const a = new Uint8Array(w * h);
  for (let p = 0, q = 3; p < a.length; p++, q += 4) a[p] = data[q];
  const m = { w, h, a };
  masks.set(key, m);
  return m;
}

// alpha (0..255) at natural-pixel coordinates; -1 when the mask is unavailable
export function alphaAt(key, x, y) {
  const m = mask(key);
  if (!m) return -1;
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= m.w || iy >= m.h) return 0;
  return m.a[iy * m.w + ix];
}

// Same as alphaAt, but holes enclosed by the artwork count as solid: an outlined button (e.g. the
// card price tag, whose inside is see-through) is clickable everywhere inside its outline.
const solids = new Map();
export function solidAt(key, x, y) {
  let s = solids.get(key);
  if (!s) {
    const m = mask(key);
    if (!m) return -1;
    const { w, h, a } = m;
    s = { w, h, a: new Uint8Array(w * h).fill(1) };     // 1 = solid until reached from outside
    const q = new Int32Array(w * h);
    let head = 0, tail = 0;
    const push = (p) => { if (s.a[p] && a[p] <= 24) { s.a[p] = 0; q[tail++] = p; } };
    for (let x2 = 0; x2 < w; x2++) { push(x2); push((h - 1) * w + x2); }
    for (let y2 = 0; y2 < h; y2++) { push(y2 * w); push(y2 * w + w - 1); }
    while (head < tail) {
      const p = q[head++], px = p % w;
      if (px > 0) push(p - 1);
      if (px < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < w * (h - 1)) push(p + w);
    }
    solids.set(key, s);
  }
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= s.w || iy >= s.h) return 0;
  return s.a[iy * s.w + ix] ? 255 : 0;
}

export function forget(key) { images.delete(key); masks.delete(key); solids.delete(key); extra.delete(key); }
