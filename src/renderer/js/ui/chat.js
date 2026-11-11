// Chat UI built only from the artist's pieces: UI_Dialog + UI_Dialog_Tail (speech bubble over
// the pet), UI_Type_Bar + UI_Type_Send (input line). Text uses the PSD's typeface.
import { CHAT } from "../layout.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Button } from "./button.js";
import { spring, set, P } from "../core/spring.js";
import { sfx } from "../audio.js";
import { systemPrompt, greetingRequest, cleanReply, parseJsonReply, t } from "../i18n.js";

export class ChatUI {
  constructor({ parent, scope, folder, onSend, onClose, placeholder = "" }) {
    this.folder = folder;
    this.onSend = onSend;
    this.onClose = onClose;
    this.scope = scope;
    this.root = new Group(parent, { w: 1920, h: 1080 });
    this.root.hide();
    const f = (s) => s.replace("{f}", folder);
    // bubble
    this.bubble = new Group(this.root.el, { w: CHAT.dialog.w, h: CHAT.dialog.h });
    this.dialog = new Sprite(f(CHAT.dialog.src), 0, 0, { parent: this.bubble.el, hit: "alpha" });
    const T = CHAT.dialog.text;
    this.text = el("div", "hand bubble-text", this.bubble.el);
    Object.assign(this.text.style, { left: T.l + "px", top: T.t + "px", width: CHAT.dialog.w - T.l - T.r + "px", height: CHAT.dialog.h - T.t - T.b + "px", overflow: "hidden" });
    this.tail = new Sprite(f(CHAT.tail.src), 0, 0, { parent: this.root.el, hit: "alpha", pivot: "top" });
    // input bar
    this.barG = new Group(this.root.el, { w: CHAT.bar.w, h: CHAT.bar.h, x: CHAT.bar.x, y: CHAT.bar.y, pivot: [CHAT.bar.w / 2, CHAT.bar.h] });
    this.bar = new Sprite(f(CHAT.bar.src), 0, 0, { parent: this.barG.el, hit: "alpha" });
    const I = CHAT.bar.input;
    this.input = el("input", "type-input", this.barG.el);
    this.input.type = "text"; this.input.maxLength = 120; this.input.placeholder = placeholder; this.input.spellcheck = false;
    Object.assign(this.input.style, { left: I.l + "px", top: I.t + "px", width: CHAT.bar.w - I.l - I.r + "px", height: CHAT.bar.h - I.t - I.b + "px" });
    this.send = new Button({ parent: this.barG.el, scope: null, src: f(CHAT.send.src), x: CHAT.send.x - CHAT.bar.x, y: CHAT.send.y - CHAT.bar.y, sound: "click", onClick: () => this.submit() });
    // input nodes (coordinates are stage coordinates)
    this.nodes = [
      { z: 900, hit: (pt) => this.isOpen && this.dialog.hitTest(pt.x - this.bubble.x, pt.y - this.bubble.y) },
      { z: 900, hit: (pt) => this.isOpen && this.tail.hitTest(pt.x, pt.y) },
      { z: 900, hit: (pt) => this.isOpen && this.barG.visible && this.bar.hitTest(pt.x - this.barG.x, pt.y - this.barG.y), click: () => this.focus() },
      { ...this.send.node, z: 901, hit: (pt) => this.isOpen && this.barG.visible && this.send.sprite.hitTest(pt.x - this.barG.x, pt.y - this.barG.y) },
    ];
    this.composing = false;
    this.input.addEventListener("compositionstart", () => { this.composing = true; });
    this.input.addEventListener("compositionend", () => { this.composing = false; });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && !this.composing) { e.preventDefault(); this.submit(); }
      else if (e.key === "Escape") { e.preventDefault(); this.close(); }
      e.stopPropagation();
    });
    this.isOpen = false;
    this.typing = null;
  }

  attach(scope) { this.scope = scope; for (const n of this.nodes) scope.add(n); }
  detach() { if (this.scope) for (const n of this.nodes) this.scope.remove(n); }

  /** dialog / tail positions in stage pixels; `bar` optionally moves the input line */
  open({ dialog, tail, bar, showBar = true }) {
    this.isOpen = true;
    this.root.show();
    this.barG.setPos(bar ? bar.x : CHAT.bar.x, bar ? bar.y : CHAT.bar.y);
    this.bubble.setPos(dialog.x, dialog.y);
    this.bubble.pivot = [Math.min(CHAT.dialog.w - 20, Math.max(20, tail.x - dialog.x + CHAT.tail.w / 2)), CHAT.dialog.h];
    this.tail.setPos(tail.x, tail.y);
    set(this.bubble, { sx: 0.2, sy: 0.2, o: 0 }); spring(this.bubble, { sx: 1, sy: 1, o: 1 }, P.pop);
    set(this.tail, { sy: 0, o: 0 }); spring(this.tail, { sy: 1, o: 1 }, P.pop);
    if (showBar) {
      this.barG.show();
      set(this.barG, { y: 140, o: 0 }); spring(this.barG, { y: 0, o: 1 }, P.pop);
      setTimeout(() => this.focus(), 60);
    } else this.barG.hide();
    sfx("open", { vol: 0.8 });
  }

  move({ dialog, tail }) { this.bubble.setPos(dialog.x, dialog.y); this.tail.setPos(tail.x, tail.y); }

  focus() { if (this.isOpen && this.barG.visible) this.input.focus({ preventScroll: true }); }

  close(silent = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    clearInterval(this.typing);
    this.input.blur();
    spring(this.bubble, { sx: 0.3, sy: 0.3, o: 0 }, P.out);
    spring(this.tail, { sy: 0, o: 0 }, P.out);
    spring(this.barG, { y: 120, o: 0 }, P.out, () => { if (!this.isOpen) this.root.hide(); });
    if (!silent) sfx("close", { vol: 0.8 });
    if (this.onClose) this.onClose();
  }

  thinking() {
    clearInterval(this.typing);
    this.text.innerHTML = '<span class="dots"><span>・</span><span>・</span><span>・</span></span>';
    this.fit(34);
  }

  say(str, { typewriter = true } = {}) {
    clearInterval(this.typing);
    const full = String(str || "");
    this.fit(34, full);
    if (!typewriter) { this.text.textContent = full; return; }
    let i = 0;
    this.text.textContent = "";
    const chars = Array.from(full);
    sfx("reply");
    set(this.bubble, { sx: 1.06, sy: 0.94 }); spring(this.bubble, { sx: 1, sy: 1 }, P.release);
    this.typing = setInterval(() => {
      i += 1;
      this.text.textContent = chars.slice(0, i).join("");
      if (i >= chars.length) clearInterval(this.typing);
    }, 38);
  }

  // shrink the font until the text fits the bubble
  fit(start, probe) {
    const box = this.text;
    let size = start;
    box.style.fontSize = size + "px";
    if (probe === undefined) return;
    const prev = box.textContent;
    box.textContent = probe;
    while (size > 22 && (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1)) {
      size -= 2;
      box.style.fontSize = size + "px";
    }
    box.style.overflowY = box.scrollHeight > box.clientHeight + 1 ? "auto" : "hidden";
    box.textContent = prev;
  }

  submit() {
    const v = this.input.value.trim();
    if (!v || this.busy) { if (!v) set(this.barG, { x: 8 }), spring(this.barG, { x: 0 }, P.wobble); return; }
    this.input.value = "";
    set(this.send.sprite, { sx: 0.8, sy: 0.8 }); spring(this.send.sprite, { sx: 1, sy: 1 }, P.release);
    if (this.onSend) this.onSend(v);
  }
}

/** Ask the pet's AI persona something. Returns { text, data } (data = parsed JSON in dressing mode). */
export async function askPet({ chatFn, pet, lang, mode, ctx, history, userText }) {
  const messages = [{ role: "system", content: systemPrompt({ pet, lang, mode, ctx }) }];
  for (const m of (history || []).slice(-12)) messages.push({ role: m.role, content: m.content });
  messages.push({ role: "user", content: userText || greetingRequest(lang, mode) });
  // generous token budget: when the model thinks first, a tight max_tokens ends with an empty reply
  // (finish_reason "length"); the prompt itself keeps the answer to one short line
  const res = await chatFn({ messages, maxTokens: mode === "dressing" ? 1400 : 1000, temperature: 0.9 });
  if (!res || !res.ok) return { ok: false, text: t("offline", lang, pet), error: res && res.error };
  if (mode === "dressing") {
    const data = parseJsonReply(res.text);
    return { ok: true, text: cleanReply(data.say || ""), data };
  }
  return { ok: true, text: cleanReply(res.text) };
}
