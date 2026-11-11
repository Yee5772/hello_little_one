// AI outfit pipeline:
//  1. lay the pet's animation frames out on one sprite sheet (so the model dresses every pose consistently)
//  2. AkarionHub image edit (GPT Image 2.5, transparent background; Nano Banana Pro fallback)
//  3. per frame: align the result to the original, keep ONLY the pixels that became clothing,
//     and save the clothing as a separate transparent layer for each pose.
import { PET_FRAME } from "../layout.js";
import * as assets from "../core/assets.js";

const CELLS = ["Default", "Walking_1", "Walking_2", "Walking_4", "Action_1", "Action_2"];
const SHEET = { w: 1792, h: 1024, cw: 582, ch: 504, ox: 23, oy: 8 };
const PET_DESC = {
  C4: "puppy (white fur, light-brown floppy ears, thick dark-brown outline)",
  C3: "kitten (orange-and-white fur, thick dark-brown outline)",
};

export function outfitPrompt(pet, outfit, whiteBg = false) {
  const bg = whiteBg ? "a plain pure white background" : "a fully transparent background";
  return `This image is a sprite sheet with 6 animation frames of the same cute hand-drawn cartoon ${PET_DESC[pet]}, on ${bg}. ` +
    `Dress the pet in EVERY frame with: ${outfit}. The clothing must look identical in all 6 frames and follow each pose naturally. ` +
    "Draw the clothing in exactly the same hand-drawn style as the pet: thick dark-brown outline, soft colored-pencil texture, soft flat colors. " +
    "Do NOT change, move, resize or redraw anything else: keep every pet's pose, position, size, outline, face and colors exactly the same, " +
    `and keep ${whiteBg ? "the background plain pure white" : "the background fully transparent"}. No text, no shadows, no extra objects.`;
}

export async function generateOutfit(game, pet, outfit, playerText) {
  // 1. sprite sheet
  const sheet = new OffscreenCanvas(SHEET.w, SHEET.h);
  const sg = sheet.getContext("2d");
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = "high";
  const originals = {};
  for (let i = 0; i < CELLS.length; i++) {
    const img = await assets.load(`anim/${pet}_${CELLS[i]}.png`);
    originals[CELLS[i]] = img;
    sg.drawImage(img, SHEET.ox + (i % 3) * SHEET.cw, SHEET.oy + Math.floor(i / 3) * SHEET.ch, SHEET.cw, SHEET.ch);
  }
  const png = await (await sheet.convertToBlob({ type: "image/png" })).arrayBuffer();
  // 2. AI edit through the main process (keeps the API key out of the page)
  const res = await window.hlo.outfit({ pet, sheet: png, width: SHEET.w, height: SHEET.h,
    prompt: outfitPrompt(pet, outfit, false), promptWhiteBg: outfitPrompt(pet, outfit, true) });
  if (!res || !res.ok) throw new Error((res && res.error) || "outfit request failed");
  const bmp = await createImageBitmap(new Blob([res.buffer], { type: "image/png" }));
  const gen = new OffscreenCanvas(SHEET.w, SHEET.h);
  const gg = gen.getContext("2d", { willReadFrequently: true });
  gg.imageSmoothingQuality = "high";
  gg.drawImage(bmp, 0, 0, SHEET.w, SHEET.h);
  // 3. per frame extraction
  const W = PET_FRAME.w, H = PET_FRAME.h;
  const frames = {};
  let coverage = 0;
  for (let i = 0; i < CELLS.length; i++) {
    const cell = new OffscreenCanvas(W, H);
    const cg = cell.getContext("2d", { willReadFrequently: true });
    cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = "high";
    cg.drawImage(gen, SHEET.ox + (i % 3) * SHEET.cw, SHEET.oy + Math.floor(i / 3) * SHEET.ch, SHEET.cw, SHEET.ch, 0, 0, W, H);
    const g = cg.getImageData(0, 0, W, H);
    const oc = new OffscreenCanvas(W, H);
    const og = oc.getContext("2d", { willReadFrequently: true });
    og.drawImage(originals[CELLS[i]], 0, 0);
    const o = og.getImageData(0, 0, W, H);
    const { layer, maskFrac } = extractClothing(o, g, res.transparent);
    coverage += maskFrac;
    og.putImageData(layer, 0, 0);
    frames[CELLS[i]] = await (await oc.convertToBlob({ type: "image/png" })).arrayBuffer();
  }
  if (coverage / CELLS.length < 0.004) throw new Error("no clothing detected in the AI result");
  frames.Walking_3 = frames.Walking_1;   // identical poses in the artwork
  const id = "outfit_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const stored = await window.hlo.storeOutfit({ id, pet, prompt: outfit, model: res.model, frames });
  if (!stored?.ok) throw new Error(stored?.error || "Could not save outfit frames");
  for (const k of Object.values(stored.frames)) { assets.register(k, W, H); await assets.load(k); }
  return { id, pet, prompt: outfit, said: playerText || "", model: res.model, created: new Date().toISOString(), frames: stored.frames, isLayer: true, x: 0, y: 0 };
}

// ------------------------------------------------------------------ image maths
export function extractClothing(o, g, transparentBg) {
  const W = o.width, H = o.height, N = W * H;
  const od = o.data, gd = g.data;
  // white-background fallback: drop near-white pixels that are outside the original silhouette
  if (!transparentBg) {
    for (let p = 0, q = 0; p < N; p++, q += 4) {
      if (od[q + 3] < 80 && gd[q] > 232 && gd[q + 1] > 232 && gd[q + 2] > 232) gd[q + 3] = 0;
    }
  }
  // align: outline pixels of the original vs the generated frame (translation only)
  const Fo = [], Fg = new Uint8Array(N);
  for (let p = 0, q = 0; p < N; p++, q += 4) {
    const lo = (od[q] + od[q + 1] + od[q + 2]) / 3, lg = (gd[q] + gd[q + 1] + gd[q + 2]) / 3;
    if (lo < 110 && od[q + 3] > 128) Fo.push(p);
    if (lg < 110 && gd[q + 3] > 128) Fg[p] = 1;
  }
  let best = -1, bdx = 0, bdy = 0;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    let sc = 0;
    for (const p of Fo) {
      const x = (p % W) - dx, y = ((p / W) | 0) - dy;
      if (x >= 0 && y >= 0 && x < W && y < H) sc += Fg[y * W + x];
    }
    if (sc > best) { best = sc; bdx = dx; bdy = dy; }
  }
  const sh = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x - bdx, sy = y - bdy;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const a = (y * W + x) * 4, b = (sy * W + sx) * 4;
    sh[a] = gd[b]; sh[a + 1] = gd[b + 1]; sh[a + 2] = gd[b + 2]; sh[a + 3] = gd[b + 3];
  }
  // difference mask: recoloured pixels inside the pet + new pixels outside its silhouette
  let m = new Uint8Array(N);
  for (let p = 0, q = 0; p < N; p++, q += 4) {
    const ao = od[q + 3] / 255, ag = sh[q + 3] / 255;
    const dr = od[q] - sh[q], dg = od[q + 1] - sh[q + 1], db = od[q + 2] - sh[q + 2];
    const col = Math.sqrt(dr * dr + dg * dg + db * db) / 441;
    if ((ao > 0.5 && ag > 0.5 && col > 0.22) || (ao < 0.3 && ag > 0.6)) m[p] = 1;
  }
  m = dilate(erode(m, W, H, 1), W, H, 1);                 // opening: drop thin redraw noise
  m = dropSmall(m, W, H, 60);
  m = erode(dilate(m, W, H, 4), W, H, 4);                 // closing: solid garment shapes
  m = fillHoles(m, W, H);
  m = dilate(m, W, H, 1);
  const soft = blur(m, W, H);
  const layer = new ImageData(W, H);
  const r = layer.data;
  let cnt = 0;
  for (let p = 0, q = 0; p < N; p++, q += 4) {
    const at = Math.min(1, soft[p] * 1.3) * (sh[q + 3] / 255);
    if (m[p]) cnt++;
    if (at <= 0) continue;
    r[q] = sh[q];
    r[q + 1] = sh[q + 1];
    r[q + 2] = sh[q + 2];
    r[q + 3] = at * 255;
  }
  return { layer, maskFrac: cnt / N, align: [bdx, bdy] };
}

function dilate(m, W, H, rad) { return morph(m, W, H, rad, 1); }
function erode(m, W, H, rad) { return morph(m, W, H, rad, 0); }
function morph(m, W, H, rad, isMax) {
  const t = new Uint8Array(m.length), o = new Uint8Array(m.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = isMax ? 0 : 1;
    for (let k = -rad; k <= rad; k++) {
      const xx = x + k;
      const s = xx < 0 || xx >= W ? (isMax ? 0 : 0) : m[y * W + xx];
      if (isMax ? s : !s) { v = isMax ? 1 : 0; break; }
    }
    t[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = isMax ? 0 : 1;
    for (let k = -rad; k <= rad; k++) {
      const yy = y + k;
      const s = yy < 0 || yy >= H ? 0 : t[yy * W + x];
      if (isMax ? s : !s) { v = isMax ? 1 : 0; break; }
    }
    o[y * W + x] = v;
  }
  return o;
}

function dropSmall(m, W, H, minSize) {
  const lab = new Int32Array(m.length);
  const out = new Uint8Array(m.length);
  let id = 0;
  const stack = [];
  for (let p = 0; p < m.length; p++) {
    if (!m[p] || lab[p]) continue;
    id++;
    const comp = [];
    stack.push(p); lab[p] = id;
    while (stack.length) {
      const c = stack.pop(); comp.push(c);
      const x = c % W, y = (c / W) | 0;
      for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) {
        if (n >= 0 && m[n] && !lab[n]) { lab[n] = id; stack.push(n); }
      }
    }
    if (comp.length >= minSize) for (const c of comp) out[c] = 1;
  }
  return out;
}

function fillHoles(m, W, H) {
  const seen = new Uint8Array(m.length);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const c = stack.pop();
    if (c < 0 || c >= m.length || seen[c] || m[c]) continue;
    seen[c] = 1;
    const x = c % W;
    if (x > 0) stack.push(c - 1);
    if (x < W - 1) stack.push(c + 1);
    stack.push(c - W, c + W);
  }
  const out = new Uint8Array(m.length);
  for (let p = 0; p < m.length; p++) out[p] = m[p] || !seen[p] ? 1 : 0;
  return out;
}

function blur(m, W, H) {
  const k = [0.022, 0.229, 0.498, 0.229, 0.022];
  const t = new Float32Array(m.length), o = new Float32Array(m.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let i = -2; i <= 2; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); s += m[y * W + xx] * k[i + 2]; }
    t[y * W + x] = s;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let i = -2; i <= 2; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); s += t[yy * W + x] * k[i + 2]; }
    o[y * W + x] = s;
  }
  return o;
}
