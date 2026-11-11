// Numbers composed from the artist's digit images (Coin_0..9 / Mailbox_0..9).
// Digits live in their own container created up-front, so adding digits later (99 -> 100)
// never changes the stacking order relative to the layers drawn after it.
import { Sprite, el } from "../core/sprite.js";
import { spring, P, set } from "../core/spring.js";

export class Digits {
  constructor({ parent, x, y, src, advance = 60, scale = 1, w = 83, h = 93 }) {
    this.box = el("div", "grp", parent);
    this.x = x; this.y = y;
    this.src = src; this.advance = advance; this.scale = scale;
    this.dw = w * scale; this.dh = h * scale;
    this.sprites = [];
    this.value = null;
  }

  set(n, bump = false) {
    const s = String(Math.max(0, Math.floor(n)));
    if (s === this.value) return;
    this.value = s;
    while (this.sprites.length < s.length) {
      this.sprites.push(new Sprite(this.src.replace("{d}", "0"), 0, 0, { parent: this.box, w: this.dw, h: this.dh, pivot: "bottom", hit: false }));
    }
    this.sprites.forEach((sp, i) => {
      if (i >= s.length) { sp.hide(); return; }
      sp.show();
      sp.setSrc(this.src.replace("{d}", s[i]));
      sp.setPos(this.x + i * this.advance, this.y);
      if (bump) { set(sp, { sy: 1.25, sx: 0.85 }); spring(sp, { sx: 1, sy: 1 }, P.release); }
    });
  }

  setVisible(v) { this.box.style.display = v ? "" : "none"; }
}
