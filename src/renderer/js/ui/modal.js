// Modal window: the artist's mask fades in, the panel pops in on a spring, Esc closes it,
// and nothing underneath can be clicked while it is open.
import { Group, Sprite } from "../core/sprite.js";
import { Scope } from "../core/input.js";
import { spring, set, P } from "../core/spring.js";
import { sfx } from "../audio.js";

export class Modal {
  constructor(game, { name, mask, pivot = [960, 540], onClose, onKey }) {
    this.game = game;
    this.root = new Group(game.layers.modal, { w: 1920, h: 1080 });
    this.mask = mask ? new Sprite(mask, 0, 0, { parent: this.root.el, hit: "box" }) : null;
    this.body = new Group(this.root.el, { w: 1920, h: 1080, pivot });
    this.onClose = onClose;
    this.isOpen = false;
    this.scope = new Scope(name, {
      onKey: (e) => {
        if (onKey && onKey(e)) return true;
        if (e.key === "Escape") { this.close(); return true; }
        return false;
      },
    });
    this.scope.add({ z: -1e6, hit: () => true }); // swallow clicks on the mask
  }

  get el() { return this.body.el; }

  open({ sound = "open" } = {}) {
    this.isOpen = true;
    (this.game.modals || (this.game.modals = new Set())).add(this);
    this.game.input.push(this.scope);
    if (this.mask) { set(this.mask, { o: 0 }); spring(this.mask, { o: 1 }, P.soft); }
    set(this.body, { sx: 0.8, sy: 0.8, o: 0 });
    spring(this.body, { sx: 1, sy: 1, o: 1 }, P.pop);
    if (sound) sfx(sound);
    return this;
  }

  close(cb, { sound = "close" } = {}) {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.game.modals) this.game.modals.delete(this);
    this.game.input.pop(this.scope);
    if (sound) sfx(sound);
    if (this.mask) spring(this.mask, { o: 0 }, P.out);
    spring(this.body, { sx: 0.88, sy: 0.88, o: 0 }, P.out, () => {
      this.root.remove();
      if (cb) cb();
      if (this.onClose) this.onClose();
    });
  }
}
