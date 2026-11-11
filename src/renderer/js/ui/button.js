// Image button using the artist's three states (Default / Hover / Active) plus spring feedback.
import { Sprite } from "../core/sprite.js";
import { spring, P, impulse } from "../core/spring.js";
import { sfx } from "../audio.js";

export class Button {
  constructor({ parent, scope, src, x, y, states, onClick, sound = "click", z, pivot, matrix, hoverScale = 1.045, pressScale = 0.95, enabled, hit }) {
    this.tpl = src;
    this.states = states || null;
    this.onClick = onClick;
    this.sound = sound;
    this.hoverScale = hoverScale;
    this.pressScale = pressScale;
    this.pressed = false;
    this.hovered = false;
    this.disabled = false;
    // "solid": the whole inside of the button's outline is clickable (some art is drawn hollow)
    this.sprite = new Sprite(this.srcFor("Default"), x, y, { parent, pivot: pivot || "center", matrix, hit: hit === undefined ? "solid" : hit });
    this.node = {
      z, cursor: "pointer",
      hit: (pt) => this.sprite.hitTest(pt.x, pt.y),
      enabled: () => !this.disabled && this.sprite.visible && (!enabled || enabled()),
      enter: () => { this.hovered = true; if (!this.pressed) { this.state("Hover"); spring(this.sprite, { sx: hoverScale, sy: hoverScale }, P.hover); sfx("hover"); } },
      leave: () => { this.hovered = false; if (!this.pressed) { this.state("Default"); spring(this.sprite, { sx: 1, sy: 1 }, P.hover); } },
      down: () => { this.pressed = true; this.state("Active"); spring(this.sprite, { sx: pressScale, sy: pressScale }, P.press); },
      pressOver: (over) => { this.state(over ? "Active" : "Default"); spring(this.sprite, { sx: over ? pressScale : 1, sy: over ? pressScale : 1 }, P.press); },
      up: (_pt, inside) => {
        this.pressed = false;
        this.state(inside ? "Hover" : "Default");
        spring(this.sprite, { sx: inside ? hoverScale : 1, sy: inside ? hoverScale : 1 }, P.release);
      },
      click: (pt, e) => { if (this.sound) sfx(this.sound); if (this.onClick) this.onClick(pt, e); },
    };
    if (scope) scope.add(this.node);
  }

  srcFor(s) { return (this.states && this.states[s]) || this.tpl.replace("{s}", s); }
  state(s) { this.cur = s; this.sprite.setSrc(this.srcFor(s)); }
  setTemplate(tpl, states) { this.tpl = tpl; this.states = states || null; this.state(this.cur || "Default"); }
  setPos(x, y) { this.sprite.setPos(x, y); }
  reset() { this.pressed = false; this.hovered = false; this.state("Default"); spring(this.sprite, { sx: 1, sy: 1 }, P.hover); }
  /** small "no" shake for unavailable actions */
  deny() { impulse(this.sprite, "x", 900, P.wobble, 0); sfx("deny"); }
  show() { this.sprite.show(); return this; }
  hide() { this.sprite.hide(); return this; }
}
