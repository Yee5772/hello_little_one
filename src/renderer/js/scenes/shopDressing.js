// Clothes shop (Sample_Shop_Dressing), opened from the wardrobe in the shop.
// Tap a piece on a hanger -> the pet in the spotlight tries it on; Buy -> it goes to your mirror.
import { SHOP_DRESSING as L, CLOTHES } from "../layout.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Scope } from "../core/input.js";
import { Button } from "../ui/button.js";
import { Digits } from "../ui/digits.js";
import { PetView } from "../pet/pet.js";
import { accPositions, outfitFor } from "../pet/wardrobe.js";
import { spring, set, impulse, P } from "../core/spring.js";
import { sfx } from "../audio.js";

export class ShopDressing {
  constructor(shop) {
    this.shop = shop;
    this.game = shop.game;
    this.isOpen = false;
    this.scope = new Scope("shopDressing", {
      onKey: (e) => { if (e.key === "Escape") { this.close(); return true; } return false; },
    });
    this.root = new Group(shop.root, { w: 1920, h: 1080 });
    this.root.hide();
    this.build();
  }
  get s() { return this.game.s; }

  build() {
    const p = this.root.el, sc = this.scope;
    sc.add({ z: -1e6, hit: () => true });
    this.mask = new Sprite(L.mask.src, 0, 0, { parent: p, hit: false });
    this.rack = new Group(p, { w: 1920, h: 1080 });
    new Sprite(L.stick.src, L.stick.x, L.stick.y, { parent: this.rack.el, hit: false });
    this.hangers = L.hangers.map((h, i) => {
      const g = new Group(this.rack.el, { w: 1920, h: 1080, pivot: [h.x + 74, h.y + 10] });
      const hanger = new Sprite(L.hanger, h.x, h.y, { parent: g.el });
      const c = CLOTHES[h.item];
      const cloth = new Sprite(c.src, c.hanger.x, c.hanger.y, { parent: g.el, pivot: "top" });
      sc.add({ z: 10 + i, cursor: "pointer", hit: (pt) => cloth.hitTest(pt.x, pt.y) || hanger.hitTest(pt.x, pt.y),
        enter: () => { impulse(g, "r", 18, P.sway, 0); spring(cloth, { sx: 1.05, sy: 1.05 }, P.hover); },
        leave: () => spring(cloth, { sx: 1, sy: 1 }, P.hover),
        click: () => this.pick(h.item, g) });
      return { g, cloth, item: h.item };
    });
    this.priceDigits = new Digits({ parent: p, x: L.priceDigits.x, y: L.priceDigits.y, src: "shop_dressing/Coin_{d}.png", advance: L.priceDigits.advance, scale: L.priceDigits.scale });
    this.priceDigits.set(CLOTHES.sunglasses.price);
    new Sprite(L.priceCoin.src, L.priceCoin.x, L.priceCoin.y, { parent: p, hit: false });
    this.coinDigits = new Digits({ parent: p, x: L.coinDigits.x, y: L.coinDigits.y, src: "shop_dressing/Coin_{d}.png", advance: L.coinDigits.advance, scale: L.coinDigits.scale });
    this.light = new Sprite(L.light.src, L.light.x, L.light.y, { parent: p, hit: false });
    this.buyBtn = new Button({ parent: p, scope: sc, src: this.buySrc(), x: L.buy.x, y: L.buy.y, z: 30, sound: null, onClick: () => this.buy() });
    this.pet = new PetView(p, { pet: this.s.pet, matrix: L.petMatrix });
    sc.add({ z: 20, cursor: "pointer", hit: (pt) => this.pet.hitTest(pt.x, pt.y),
      click: () => { this.pet.show(Math.random() < 0.5 ? "Action_1" : "Action_2"); sfx(this.s.pet === "C4" ? "woof" : "meow"); setTimeout(() => this.pet.show("Default"), 700); set(this.pet.root, { sy: 0.9 }); spring(this.pet.root, { sy: 1 }, P.release); } });
    new Button({ parent: p, scope: sc, ...L.back, z: 40, onClick: () => this.close() });
    this.coinIcon = new Sprite(L.coinIcon.src, L.coinIcon.x, L.coinIcon.y, { parent: p, hit: false });
    new Button({ parent: p, scope: sc, ...L.setting, z: 40, onClick: () => this.game.openSettings() });
    this.bagBtn = new Button({ parent: p, scope: sc, ...L.bag, z: 40, onClick: () => this.shop.openBag() });
    new Button({ parent: p, scope: sc, ...L.shop, z: 40, onClick: () => this.close() });
  }

  buySrc() { return L.buy.src.replace("{L}", this.s.lang === "en" ? "EN" : "CH"); }

  refreshCoins(instant = false) {
    const prev = this.coinDigits.value;
    this.coinDigits.set(this.s.coins, !instant && prev !== null && prev !== String(this.s.coins));
  }

  dressPet() {
    const w = this.s.wardrobe[this.s.pet];
    const acc = accPositions(w.acc);
    if (this.trying) { const [x, y] = (w.acc[this.trying] && [w.acc[this.trying].x, w.acc[this.trying].y]) || CLOTHES[this.trying].pos[this.s.pet]; acc[this.trying] = { x, y }; }
    this.pet.setPet(this.s.pet);
    this.pet.setAccessories(acc);
    this.pet.setOutfit(outfitFor(this.s, w.outfit));
  }

  pick(item, g) {
    impulse(g, "r", 60, P.sway, 0);
    this.trying = this.trying === item ? null : item;
    this.dressPet();
    sfx(this.trying ? "sparkle" : "drop", { vol: 0.7 });
    if (this.trying) {
      const a = this.pet.acc[item];
      if (a) { set(a, { sx: 0.2, sy: 0.2, o: 0 }); spring(a, { sx: 1, sy: 1, o: 1 }, P.pop); }
      this.pet.show("Action_2"); setTimeout(() => this.pet.show("Default"), 650);
    }
    this.priceDigits.set(CLOTHES[item].price, true);
  }

  buy() {
    const s = this.s, item = this.trying;
    const price = item ? CLOTHES[item].price : 0;
    if (!item || s.owned.clothes.includes(item) || s.coins < price) { this.buyBtn.deny(); if (!item) for (const h of this.hangers) impulse(h.g, "r", 40, P.sway, 0); return; }
    this.game.store.change((d) => {
      d.coins -= price;
      d.owned.clothes.push(item);
      // bought clothes are worn right away, at the spot they were tried on
      for (const pet of ["C4", "C3"]) {
        const w = d.wardrobe[pet];
        const [x, y] = CLOTHES[item].pos[pet];
        if (!w.acc[item]) w.acc[item] = { x, y, on: pet === d.pet };
        else if (pet === d.pet) w.acc[item].on = true;
      }
    }, { now: true });
    window.hlo.event("purchase", { type: "clothes", key: item, price });
    sfx("buy");
    this.trying = null;
    this.dressPet();
    this.pet.show("Action_1"); setTimeout(() => this.pet.show("Action_2"), 240); setTimeout(() => this.pet.show("Default"), 900);
    set(this.buyBtn.sprite, { sy: 0.8, sx: 1.1 }); spring(this.buyBtn.sprite, { sx: 1, sy: 1 }, P.release);
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.trying = null;
    this.buyBtn.setTemplate(this.buySrc());
    this.buyBtn.reset();
    this.dressPet();
    this.priceDigits.set(CLOTHES.sunglasses.price);
    this.refreshCoins(true);
    this.root.show();
    this.game.input.push(this.scope);
    set(this.mask, { o: 0 }); spring(this.mask, { o: 1 }, P.soft);
    set(this.rack, { y: -320 }); spring(this.rack, { y: 0 }, P.pop);
    this.hangers.forEach((h, i) => impulse(h.g, "r", 40 + i * 25, P.sway, 0));
    set(this.light, { o: 0, sy: 0.6 }); this.light.pivot = "top"; spring(this.light, { o: 1, sy: 1 }, P.soft);
    set(this.pet.root, { sx: 0.3, sy: 0.3, o: 0 }); spring(this.pet.root, { sx: 1, sy: 1, o: 1 }, P.pop);
    sfx("open");
  }

  close(silent = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.game.input.pop(this.scope);
    if (!silent) sfx("close");
    spring(this.rack, { y: -320 }, P.out);
    spring(this.pet.root, { sx: 0.3, sy: 0.3, o: 0 }, P.out);
    spring(this.light, { o: 0 }, P.out);
    spring(this.mask, { o: 0 }, P.out, () => { if (!this.isOpen) this.root.hide(); });
  }
}
