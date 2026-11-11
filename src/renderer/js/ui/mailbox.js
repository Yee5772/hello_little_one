// Mailbox (Sample_Mailbox): the delivered steak letter followed by the AI postcards the pets send
// (Sample_Mailbox shows "3/6": several pages, flipped with the prev / next buttons).
import { MAILBOX as L } from "../layout.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Button } from "./button.js";
import { Modal } from "./modal.js";
import { spring, set, impulse, P } from "../core/spring.js";
import * as assets from "../core/assets.js";
import { sfx } from "../audio.js";
import { STR } from "../i18n.js";

const LETTER = { id: "letter_steak", photo: L.photo.src, textCH: L.text.src, en: STR.letter.en };

export function letters(state) {
  const cards = (state.mail && state.mail.cards) || [];
  return [LETTER, ...cards.map((c) => ({ id: c.id, photo: c.img, ch: c.ch, en: c.en, url: c.url, ai: true }))];
}

export function unreadCount(state) { return letters(state).filter((l) => !state.mail.read.includes(l.id)).length; }

export function openMailbox(game, { onClose } = {}) {
  const m = new Modal(game, { name: "mailbox", mask: L.mask.src, pivot: [979, 480], onClose,
    onKey: (e) => { if (e.key === "ArrowLeft") { flip(-1); return true; } if (e.key === "ArrowRight") { flip(1); return true; } return false; } });
  const root = m.el;
  const list = letters(game.s);
  // open on the first unread page, otherwise on the newest one
  let idx = list.findIndex((l) => !game.s.mail.read.includes(l.id));
  if (idx < 0) idx = list.length - 1;
  // PSD order: page number, modal, prev, next, photo backing, photo, frame, text, close
  const page = el("div", "page-text", root);
  Object.assign(page.style, { left: L.page.x + "px", top: L.page.y + "px", width: L.page.w + "px", height: L.page.h + "px" });
  new Sprite(L.modal.src, L.modal.x, L.modal.y, { parent: root, hit: false });
  const prev = new Button({ parent: root, scope: m.scope, ...L.prev, sound: "page", onClick: () => flip(-1) });
  const next = new Button({ parent: root, scope: m.scope, ...L.next, sound: "page", onClick: () => flip(1) });
  const letter = new Group(root, { w: 1920, h: 1080, pivot: [979, 480] });
  new Sprite(L.photoBg.src, L.photoBg.x, L.photoBg.y, { parent: letter.el, hit: false });
  const photo = new Sprite(LETTER.photo, L.photo.x, L.photo.y, { parent: letter.el, pivot: "center" });
  const frame = new Sprite(L.frame.src, L.frame.x, L.frame.y, { parent: letter.el, hit: false, pivot: "center" });
  const textImg = new Sprite(LETTER.textCH, L.text.x, L.text.y, { parent: letter.el, hit: false });
  const textBox = el("div", "letter-text", letter.el);
  Object.assign(textBox.style, { left: L.text.box.x + "px", top: L.text.box.y - 16 + "px", width: L.text.box.w + 20 + "px" });
  new Button({ parent: root, scope: m.scope, ...L.close, onClick: () => m.close() });
  // the photo is fun to poke
  m.scope.add({ hit: (pt) => photo.hitTest(pt.x, pt.y), cursor: "pointer",
    enter: () => { spring(photo, { sx: 1.015, sy: 1.015 }, P.hover); spring(frame, { sx: 1.015, sy: 1.015 }, P.hover); },
    leave: () => { spring(photo, { sx: 1, sy: 1 }, P.hover); spring(frame, { sx: 1, sy: 1 }, P.hover); },
    click: () => { impulse(photo, "r", 40, P.wobble, 0); impulse(frame, "r", 40, P.wobble, 0); sfx("paper"); } });

  // AI pictures are plain rectangles: cut them to the delivered photo's rounded shape
  const maskUrl = `url("${assets.url(L.photo.src)}")`;
  function shape(ai) {
    const st = photo.el.style;
    st.maskImage = st.webkitMaskImage = ai ? maskUrl : "";
    st.maskSize = st.webkitMaskSize = ai ? "100% 100%" : "";
    st.maskRepeat = st.webkitMaskRepeat = ai ? "no-repeat" : "";
  }

  // never write past the fifth ruled line: shrink long notes
  function fitText() {
    textBox.style.fontSize = "";
    const maxH = 5 * 67 + 24;
    let size = parseFloat(getComputedStyle(textBox).fontSize);
    while (textBox.scrollHeight > maxH && size > 24) { size -= 2; textBox.style.fontSize = size + "px"; }
  }

  let token = 0;
  async function render() {
    const l = list[idx], my = ++token;
    const en = game.s.lang === "en";
    page.textContent = `${idx + 1}/${list.length}`;
    if (l.ai) {
      textImg.setVisible(false);
      textBox.style.display = "";
      textBox.classList.toggle("ch", !en);
      textBox.textContent = en ? l.en : l.ch;
      fitText();
      photo.hide();
      // the picture lives in the save folder; a save restored on another PC fetches it again
      const ok = await window.hlo.ensurePostcard({ id: l.id, url: l.url });
      if (my !== token) return;
      if (ok) { await assets.load(l.photo); if (my !== token) return; shape(true); photo.setSrc(l.photo); photo.show(); }
    } else {
      shape(false);
      photo.setSrc(l.photo); photo.show();
      textImg.setVisible(!en);
      textBox.classList.remove("ch");
      textBox.style.display = en ? "" : "none";
      textBox.textContent = l.en;
      fitText();
    }
    game.store.change((d) => { if (!d.mail.read.includes(l.id)) d.mail.read.push(l.id); });
  }
  function flip(dir) {
    const n = idx + dir;
    if (n < 0 || n >= list.length) { (dir < 0 ? prev : next).deny(); return; }
    idx = n;
    set(letter, { x: dir * 60, o: 0 }); spring(letter, { x: 0, o: 1 }, P.pop);
    render();
  }
  render();
  m.open({ sound: "paper" });
  return m;
}
