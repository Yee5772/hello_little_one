// Main menu (Sample_Menu / _2 / _3 / _4).
import { MENU } from "../layout.js";
import { Sprite, el } from "../core/sprite.js";
import { Scope } from "../core/input.js";
import { Button } from "../ui/button.js";
import { Modal } from "../ui/modal.js";
import { spring, set, impulse, P } from "../core/spring.js";
import { music, sfx } from "../audio.js";

export class MenuScene {
  constructor(game) {
    this.game = game;
    this.root = el("div", "scene scene-menu");
    this.scope = new Scope("menu");
    this.build();
  }

  build() {
    const g = this.game, L = MENU, p = this.root, sc = this.scope;
    this.bg = new Sprite(L.bg.src, 0, 0, { parent: p, hit: false });
    const lang = g.s.lang;
    this.title = new Sprite(L.title[lang].src, L.title[lang].x, L.title[lang].y, { parent: p, pivot: "bottom" });
    sc.add({ hit: (pt) => this.title.hitTest(pt.x, pt.y), cursor: "pointer",
      click: () => { impulse(this.title, "r", 70, P.wobble, 0); impulse(this.title, "sy", -2.2, P.wobble, 1); sfx("pat"); } });
    // PSD order: icons, then Start/Continue buttons
    this.exitBtn = new Button({ parent: p, scope: sc, ...L.exit, onClick: () => g.quit() });
    this.setting = new Button({ parent: p, scope: sc, ...L.setting, onClick: () => g.openSettings() });
    this.lang = new Button({ parent: p, scope: sc, ...L.lang[lang], sound: "click", onClick: () => this.toggleLang() });
    this.start = new Button({ parent: p, scope: sc, ...L.start[lang], hoverScale: 1.06, onClick: () => this.onStart() });
    this.cont = new Button({ parent: p, scope: sc, ...L.cont[lang], hoverScale: 1.06, onClick: () => this.onContinue() });
  }

  applyLang() {
    const l = this.game.s.lang, L = MENU;
    this.title.setSrc(L.title[l].src); this.title.setPos(L.title[l].x, L.title[l].y);
    for (const [btn, def] of [[this.start, L.start[l]], [this.cont, L.cont[l]], [this.lang, L.lang[l]]]) {
      btn.setTemplate(def.src); btn.setPos(def.x, def.y);
    }
  }

  toggleLang() {
    const g = this.game;
    g.store.change((d) => { d.lang = d.lang === "ch" ? "en" : "ch"; });
    g.applyLang();
    // the swap itself gets a little spring
    for (const s of [this.title, this.start.sprite, this.cont.sprite]) { set(s, { sx: 0.86, sy: 0.86 }); spring(s, { sx: 1, sy: 1 }, P.release); }
  }

  enter() {
    const g = this.game;
    g.input.push(this.scope);
    music("menu");
    this.applyLang();
    // entrance: everything springs into its exact sample position
    set(this.title, { sy: 0.4, sx: 1.15, o: 0 }); spring(this.title, { sx: 1, sy: 1, o: 1 }, P.pop);
    [this.start, this.cont].forEach((b, i) => { set(b.sprite, { x: 120 + i * 40, o: 0 }); setTimeout(() => spring(b.sprite, { x: 0, o: 1 }, P.pop), 120 + i * 90); });
    [this.lang, this.setting, this.exitBtn].forEach((b) => { set(b.sprite, { sx: 0.5, sy: 0.5, o: 0 }); spring(b.sprite, { sx: 1, sy: 1, o: 1 }, P.pop); });
  }

  exit() { this.game.input.pop(this.scope); }

  onStart() {
    if (this.game.s.started) this.newGameDialog();
    else this.game.newGame();
  }

  onContinue() {
    if (this.game.s.started) this.game.goto("room");
    else this.game.newGame();
  }

  newGameDialog() {
    const g = this.game, N = MENU.newGame, l = g.s.lang;
    const m = new Modal(g, { name: "newgame", mask: N.mask.src, pivot: [984, 424] });
    new Sprite(N.modal[l].src, N.modal[l].x, N.modal[l].y, { parent: m.el, hit: false });
    new Button({ parent: m.el, scope: m.scope, ...N.yes[l], onClick: () => m.close(() => g.newGame(), { sound: null }) });
    new Button({ parent: m.el, scope: m.scope, ...N.no[l], onClick: () => m.close() });
    new Button({ parent: m.el, scope: m.scope, ...N.close, onClick: () => m.close() });
    m.open();
  }
}
