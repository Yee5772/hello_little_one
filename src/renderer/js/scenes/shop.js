// Shop (Sample_Shop). Cards sell Food / Pets / Themes (left signs pick the category, the green
// sign refreshes the food on display); the bench sells furniture (a bought piece leaves the bench);
// the wardrobe opens the clothes shop.
import { SHOP as L, ROOM_PROPS, SHOP_GOODS, PETS } from "../layout.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Scope } from "../core/input.js";
import { Button } from "../ui/button.js";
import { Digits } from "../ui/digits.js";
import { openBag } from "../ui/bag.js";
import { bump } from "./room.js";
import { ShopDressing } from "./shopDressing.js";
import { spring, set, impulse, P } from "../core/spring.js";
import { tween, ease } from "../core/tween.js";
import { size } from "../core/assets.js";
import { music, sfx } from "../audio.js";

const DECOR_SFX = { swing: "creak", sway: "rustle", flat: "pat", squash: "creak", hop: "pat", bell: "bell" };
const CAT_IDS = new Set(["catSit", "catBox", "owner"]);

export class ShopScene {
  constructor(game) {
    this.game = game;
    this.root = el("div", "scene scene-shop");
    this.scope = new Scope("shop");
    this.cat = "food";
    this.layers = {};
    this.build();
    this.dressing = new ShopDressing(this);
    game.store.on(() => this.refreshCoins());
  }
  get s() { return this.game.s; }

  build() {
    const p = this.root, sc = this.scope;
    const btn = {};
    L.layers.forEach((d, i) => {
      if (d.ui) {
        const b = new Button({ parent: p, scope: sc, src: d.src, states: d.states, x: d.x, y: d.y, z: i, hoverScale: d.id === "cloth" ? 1.02 : 1.05,
          onClick: () => this.onUi(d.id, b) });
        btn[d.id] = b;
        this.layers[d.id] = b.sprite;
        return;
      }
      const sp = new Sprite(d.src, d.x, d.y, { parent: p, pivot: d.kind === "swing" ? "top" : d.kind === "flat" ? "center" : "bottom", hit: d.kind ? "alpha" : false });
      this.layers[d.id] = sp;
      if (d.kind) sc.add({ z: i, cursor: "pointer", hit: (pt) => sp.hitTest(pt.x, pt.y),
        enter: () => spring(sp, { sx: 1.012, sy: 1.012 }, P.hover), leave: () => spring(sp, { sx: 1, sy: 1 }, P.hover),
        click: () => { bump(sp, d.kind === "bell" ? "swing" : d.kind); sfx(CAT_IDS.has(d.id) ? "meow" : (DECOR_SFX[d.kind] || "pat"), CAT_IDS.has(d.id) ? { rate: d.id === "owner" ? 0.85 : 1.1 } : {}); } });
    });
    this.btn = btn;
    // bench furniture + tags (bench items under the tags, PSD order)
    const z0 = 100;
    this.benchItems = L.bench.map((b, i) => {
      const sp = new Sprite(b.src, b.x, b.y, { parent: p, pivot: "bottom" });
      sc.add({ z: z0 + i, cursor: "pointer", hit: (pt) => sp.hitTest(pt.x, pt.y), enter: () => spring(sp, { sx: 1.03, sy: 1.03 }, P.hover),
        leave: () => spring(sp, { sx: 1, sy: 1 }, P.hover), click: () => { bump(sp, "squash"); sfx(b.item === "cabinet" ? "creak" : "squeak"); } });
      return sp;
    });
    this.benchTags = L.bench.map((b, i) => this.makeTag(L.tag2, b.tag.x, b.tag.y, z0 + 10 + i, () => this.buy("furniture", b.item, this.benchItems[i], this.benchTags[i])));
    this.refreshBench();
    // cards: tags then items on top (PSD order)
    this.cardTags = L.cards.map((c, i) => this.makeTag(L.tag1, c.tag.x, c.tag.y, z0 + 20 + i, () => this.buyCard(i)));
    this.cardItems = L.cards.map((c, i) => {
      const sp = new Sprite(ROOM_PROPS.fish.src, 0, 0, { parent: p, pivot: "center" });
      sc.add({ z: z0 + 30 + i, cursor: "pointer", hit: (pt) => sp.visible && sp.hitTest(pt.x, pt.y),
        enter: () => spring(sp, { sx: 1.06, sy: 1.06 }, P.hover), leave: () => spring(sp, { sx: 1, sy: 1 }, P.hover),
        click: () => { impulse(sp, "r", 120, P.wobble, 0); sfx("pat"); } });
      return sp;
    });
    new Sprite(L.mask.src, L.mask.x, L.mask.y, { parent: p, hit: false });
    // HUD
    new Sprite(L.coinIcon.src, L.coinIcon.x, L.coinIcon.y, { parent: p, hit: false });
    this.digits = new Digits({ parent: p, x: L.coinDigits.x, y: L.coinDigits.y, src: "shop/Coin_{d}.png", advance: L.coinDigits.advance });
    this.back = new Button({ parent: p, scope: sc, ...L.back, z: 500, onClick: () => this.game.goto("room", { fromShop: true }) });
    this.bagBtn = new Button({ parent: p, scope: sc, ...L.bag, z: 500, onClick: () => this.openBag() });
    new Button({ parent: p, scope: sc, ...L.setting, z: 500, onClick: () => this.game.openSettings() });
    this.showCards(false);
    this.refreshCoins(true);
  }

  makeTag(def, x, y, z, onClick) {
    const b = new Button({ parent: this.root, scope: this.scope, src: def.src, x, y, z, sound: null, hoverScale: 1.06, onClick });
    const num = new Sprite(L.priceNum.Default, x + def.num.dx, y + def.num.dy, { parent: this.root, hit: false });
    const origState = b.state.bind(b);
    b.state = (st) => { origState(st); num.setSrc(L.priceNum[st] || L.priceNum.Default); };
    b.num = num;
    // the number rides on the tag's spring
    const apply = b.sprite.apply.bind(b.sprite);
    b.sprite.apply = () => { apply(); const m = b.sprite.m; num.m.x = m.x; num.m.sx = m.sx; num.m.sy = m.sy; num.m.r = m.r; num.m.o = m.o; num.pivot = [b.sprite.w / 2 - def.num.dx, b.sprite.h / 2 - def.num.dy]; num.apply(); };
    b.setVisible = (v) => { b.sprite.setVisible(v); num.setVisible(v); };
    return b;
  }

  // ---------------------------------------------------------------- cards
  // pets and themes you already own are not on sale any more (food can always be bought again)
  catalog() {
    if (this.cat === "pet") return ["C4", "C3"].filter((k) => !this.owned("pet", k)).map((k) => ({ type: "pet", key: k, src: `anim/${k}_Default.png` }));
    if (this.cat === "theme") return [{ type: "theme", key: "T1", src: "room/c4/Theme_1.png" }, { type: "theme", key: "T2", src: "room/c3/Theme_2.png" }].filter((x) => !this.owned("theme", x.key));
    const page = (this.s.shop.foodPage || 0) % this.foodPages();
    return SHOP_GOODS.slice(page * 3, page * 3 + 3).map((k) => ({ type: "food", key: k, src: ROOM_PROPS[k].src }));
  }

  foodPages() { return Math.ceil(SHOP_GOODS.length / 3); }

  showCards(animate = true) {
    const items = this.catalog();
    this.cardItems.forEach((sp, i) => {
      const it = items[i];
      const tag = this.cardTags[i];
      if (!it) { sp.hide(); tag.setVisible(false); return; }
      sp.show(); tag.setVisible(true);
      sp.item = it;
      const [cx, cy] = L.cards[i].center;
      const [w, h] = size(it.src);
      if (it.type === "food" && it.key === "fish") {
        const [a, b, c, d] = L.fishLinear;
        sp.setSrc(it.src); sp.setSize(w, h);
        sp.setMatrix([a, b, c, d, cx - (a * w / 2 + c * h / 2), cy - (b * w / 2 + d * h / 2)]);
      } else if (it.type === "food") {
        sp.setMatrix(null);
        sp.setSrc(it.src); sp.setSize(w, h);
        sp.setPos(Math.round(cx - w / 2), Math.round(cy - h / 2));
      } else {
        // pet / theme picture: its visible part fitted inside the card's printed frame, centred on it
        const F = L.frame, [fx, fy] = F.centers[i];
        const box = it.type === "pet" ? PETS[it.key].alpha : { x0: 0, y0: 0, x1: w, y1: h };
        const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
        const s = Math.min(F.fit.w / bw, F.fit.h / bh);
        sp.setMatrix(null);
        sp.setSrc(it.src); sp.setSize(w * s, h * s);
        sp.setPos(Math.round(fx - (box.x0 + bw / 2) * s), Math.round(fy - (box.y0 + bh / 2) * s));
      }
      if (animate) { set(sp, { sx: 0.3, sy: 0.3, o: 0 }); setTimeout(() => spring(sp, { sx: 1, sy: 1, o: 1 }, P.pop), i * 70); }
    });
  }

  onUi(id, b) {
    if (id === "cloth") return this.dressing.open();
    if (id === "refresh") {
      if (this.cat !== "food") { b.deny(); return; }
      this.game.store.change((d) => { d.shop.foodPage = (((d.shop.foodPage || 0) % this.foodPages()) + 1) % this.foodPages(); });
      impulse(b.sprite, "r", 300, P.wobble, 0);
      sfx("whoosh", { vol: 0.6 });
      return this.showCards(true);
    }
    const cat = { catPet: "pet", catTheme: "theme", catFood: "food" }[id];
    if (cat) {
      impulse(b.sprite, "r", 90, P.sway, 0);
      if (cat === this.cat) return;
      this.cat = cat;
      this.showCards(true);
    }
  }

  owned(type, key) {
    const s = this.s;
    if (type === "pet") return s.owned.pets.includes(key);
    if (type === "theme") return s.owned.themes.includes(key);
    if (type === "furniture") return s.owned.furniture.includes(key);
    return false;
  }

  // a bought bench piece is gone from the bench
  refreshBench() {
    L.bench.forEach((b, i) => {
      const sold = this.owned("furniture", b.item);
      this.benchItems[i].setVisible(!sold);
      this.benchTags[i].setVisible(!sold);
    });
  }

  buyCard(i) { const it = this.cardItems[i].item; if (it) this.buy(it.type, it.key, this.cardItems[i], this.cardTags[i]); }

  buy(type, key, itemSprite, tag) {
    const s = this.s;
    if (this.owned(type, key) || s.coins < L.price) { tag.deny(); if (itemSprite) impulse(itemSprite, "x", 500, P.wobble, 0); return; }
    this.game.store.change((d) => {
      d.coins -= L.price;
      if (type === "food") d.bagFood.push(key);
      if (type === "pet" && !d.owned.pets.includes(key)) d.owned.pets.push(key);
      if (type === "theme" && !d.owned.themes.includes(key)) d.owned.themes.push(key);
      if (type === "furniture" && !d.owned.furniture.includes(key)) { d.owned.furniture.push(key); d.stored = d.stored.filter((x) => x !== key); }
    }, { now: true });
    window.hlo.event("purchase", { type, key, price: L.price });
    sfx("buy");
    this.flyToBag(itemSprite);
    if (type === "food") { set(tag.sprite, { sy: 0.8, sx: 1.1 }); spring(tag.sprite, { sx: 1, sy: 1 }, P.release); return; }
    // one of a kind: the piece leaves the shelf / card together with its price tag
    // (the tag is disabled first so a hover spring can't cut its exit short)
    itemSprite.hide();
    tag.disabled = true;
    spring(tag.sprite, { sx: 0.2, sy: 0.2, o: 0 }, P.out);
    tween({ dur: 0.3, onDone: () => {
      tag.disabled = false;
      set(tag.sprite, { sx: 1, sy: 1, o: 1 });
      if (type === "furniture") this.refreshBench(); else this.showCards(true);
    } });
  }

  flyToBag(sp) {
    if (!sp) return;
    const ghost = new Sprite(sp.src, 0, 0, { parent: this.root, hit: false, w: sp.w, h: sp.h, pivot: "center" });
    const from = sp.base ? { x: sp.base[4] + sp.base[0] * sp.w / 2 + sp.base[2] * sp.h / 2, y: sp.base[5] + sp.base[1] * sp.w / 2 + sp.base[3] * sp.h / 2 } : { x: sp.x + sp.w / 2, y: sp.y + sp.h / 2 };
    const bag = this.bagBtn.sprite;
    const to = { x: bag.x + bag.w / 2, y: bag.y + bag.h / 2 };
    tween({ dur: 0.75, ease: ease.inOutSine, onUpdate: (e) => {
      ghost.setPos(from.x + (to.x - from.x) * e - sp.w / 2, from.y + (to.y - from.y) * e - Math.sin(e * Math.PI) * 220 - sp.h / 2);
      ghost.m.sx = ghost.m.sy = 1 - 0.75 * e; ghost.m.r = e * 200; ghost.m.o = e > 0.85 ? (1 - e) / 0.15 : 1; ghost.apply();
    }, onDone: () => {
      ghost.remove();
      set(bag, { sx: 1.25, sy: 0.85 }); spring(bag, { sx: 1, sy: 1 }, P.release);
      sfx("drop", { vol: 0.7 });
    } });
  }

  refreshCoins(instant = false) {
    const prev = this.digits.value;
    this.digits.set(this.s.coins, !instant && prev !== null && prev !== String(this.s.coins));
    if (this.dressing) this.dressing.refreshCoins(instant);
  }

  openBag() {
    openBag(this.game, { onUse: (tab, item) => this.game.scenes.room.useItem(tab, item) });
  }

  enter() {
    this.game.input.push(this.scope);
    music("shop");
    this.showCards(false);
    this.refreshBench();
    this.refreshCoins(true);
    // a gentle welcome: the hanging signs and the bell swing
    for (const id of ["catPet", "catTheme", "catFood", "signboard"]) impulse(this.layers[id], "r", 25, P.sway, 0);
    sfx("bell", { vol: 0.5 });
  }

  exit() { if (this.dressing.isOpen) this.dressing.close(true); this.game.input.pop(this.scope); }
}
