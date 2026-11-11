// AI postcards for the mailbox: the pets write a short diary note (chat model, JSON) and a new
// picture is drawn with the delivered postcard photo (Photo_Pic_2) as the style reference. They
// arrive by themselves every few hours of play, or right away with the "/明信片" chat command.
import * as assets from "../core/assets.js";
import { RULES } from "../state.js";
import { postcardMessages, postcardImagePrompt, parseJsonReply, cleanReply } from "../i18n.js";

export const POSTCARD_SIZE = [557, 514];     // shown exactly where Photo_Pic_2 sits (Mailbox.psd)

export function registerPostcards(state) {
  for (const c of (state.mail && state.mail.cards) || []) if (c.img) assets.register(c.img, ...POSTCARD_SIZE);
}

export async function makePostcard(game, { theme = "", auto = false } = {}) {
  if (game.postcardBusy) return { ok: false, busy: true };
  if (!game.info.aiEnabled) return { ok: false, offline: true };
  game.postcardBusy = true;
  try {
    const s = game.s;
    const previous = s.mail.cards.slice(-6).map((c) => c.scene);
    const recent = game.recentActivity ? game.recentActivity() : "";
    const res = await window.hlo.chat({ messages: postcardMessages({ lang: s.lang, theme, recent, previous }), maxTokens: 1200, temperature: 1 });
    if (!res || !res.ok) throw new Error((res && res.error) || "postcard text failed");
    const j = parseJsonReply(res.text);
    const scene = String(j.scene || "").replace(/\s+/g, " ").trim();
    const ch = cleanReply(j.ch || ""), en = cleanReply(j.en || "");
    if (!scene || !ch || !en) throw new Error("postcard text incomplete");
    const id = "pc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const pic = await window.hlo.postcard({ id, prompt: postcardImagePrompt(scene) });
    if (!pic || !pic.ok) throw new Error((pic && pic.error) || "postcard picture failed");
    assets.register(pic.img, ...POSTCARD_SIZE);
    const card = { id, at: new Date().toISOString(), scene: scene.slice(0, 300), ch: Array.from(ch).slice(0, 25).join(""), en: en.slice(0, 120), img: pic.img, url: pic.url || null, theme: theme || null, auto };
    game.store.change((d) => {
      d.mail.cards.push(card);
      if (d.mail.cards.length > 30) d.mail.cards.splice(0, d.mail.cards.length - 30);
    }, { now: true });
    window.hlo.event("postcard", { auto, themed: !!theme });
    if (game.onPostcard) game.onPostcard(card);
    return { ok: true, card };
  } catch (e) {
    console.warn("[postcard]", e.message);
    return { ok: false, error: e.message };
  } finally {
    game.postcardBusy = false;
  }
}

/** called now and then while the room is shown: a postcard arrives when its time has come */
export function postcardTick(game) {
  const s = game.s;
  if (!s.started || game.postcardBusy || !game.info.aiEnabled || game.sceneName !== "room") return;
  if (Date.now() < (s.mail.nextAuto || 0)) return;
  const [a, b] = RULES.postcardEvery;
  game.store.change((d) => { d.mail.nextAuto = Date.now() + (a + Math.random() * (b - a)) * 1000; });
  makePostcard(game, { auto: true }).then((r) => {
    if (!r.ok && !r.busy) game.store.change((d) => { d.mail.nextAuto = Date.now() + 30 * 60 * 1000; });   // try again later
  });
}
