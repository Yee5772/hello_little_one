// Bag (Sample_Bag): Pet / Theme / Food / Furniture tabs, 4-column scrolling grid, OK uses the item.
import { BAG as L, ROOM_LAYERS, ROOM_PROPS, FURNITURE_ORDER } from "../layout.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Button } from "./button.js";
import { Modal } from "./modal.js";
import { spring, set, impulse, P } from "../core/spring.js";
import { size } from "../core/assets.js";
import { sfx } from "../audio.js";

const THEME_SRC = { T1: "room/c4/Theme_1.png", T2: "room/c3/Theme_2.png" };

function layerSrc(id, theme) { const l = ROOM_LAYERS.find((x) => x.id === id); return l.src[theme]; }

export function bagItems(state, tab) {
  if (tab === "pet") return state.owned.pets.map((p) => ({ key: p, src: `anim/${p}_Default.png` }));
  if (tab === "theme") return state.owned.themes.map((t) => ({ key: t, src: THEME_SRC[t] }));
  if (tab === "food") return state.bagFood.map((f, i) => ({ key: f, idx: i, src: ROOM_PROPS[f].src }));
  // owned furniture in Bag.psd order (the bench pieces bought in the shop follow); dimmed = put away
  return FURNITURE_ORDER.filter((f) => state.owned.furniture.includes(f)).map((f) => ({ key: f, src: layerSrc(f, state.theme), dim: state.stored.includes(f) }));
}

function rowY(r) { return r < L.slotRows.length ? L.slotRows[r] : L.slotRows[L.slotRows.length - 1] + (r - L.slotRows.length + 1) * L.rowPitch; }

export function openBag(game, { onUse } = {}) {
  const m = new Modal(game, { name: "bag", mask: L.mask.src, pivot: [1006, 561] });
  const root = m.el;
  let tab = game.s.bagTab || "furniture";
  let selected = -1;
  let scroll = 0, maxScroll = 0, dragY0 = 0;

  new Sprite(L.modal.src, L.modal.x, L.modal.y, { parent: root, hit: false });
  const clip = el("div", "grp", root);
  Object.assign(clip.style, { width: "1920px", height: "1080px", clipPath: `inset(${L.viewport.top}px 0 ${1080 - L.viewport.bottom}px 0)` });
  const content = new Group(clip, { w: 1920, h: 1080 });
  new Sprite(L.track.src, L.track.x, L.track.y, { parent: root, hit: false });
  const handle = new Button({ parent: root, scope: m.scope, src: L.handle.src, x: L.handle.x, y: L.handle.y, sound: null, hoverScale: 1.1, pressScale: 1.0 });
  new Sprite(L.cover.src, L.cover.x, L.cover.y, { parent: root, hit: false });
  const ok = new Button({ parent: root, scope: m.scope, ...L.ok, onClick: () => use() });
  const tabs = L.tabs.map((d) => new Button({ parent: root, scope: m.scope, src: d.src, x: d.x, y: d.y, sound: "click", hoverScale: 1.05,
    onClick: () => switchTab(d.id) }));

  let cells = [];
  function build() {
    content.el.textContent = "";
    cells = [];
    const items = bagItems(game.s, tab);
    const rows = Math.max(L.slotRows.length, Math.ceil(items.length / 4));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 4; c++) {
        const i = r * 4 + c;
        const x = L.slotCols[c], y = rowY(r);
        const slot = new Sprite(L.slot, x, y, { parent: content.el, hit: "box", pivot: "center" });
        const it = items[i];
        let icon = null;
        if (it) {
          const box = tab === "furniture" ? L.boxes[it.key] : null;
          const [w, h] = size(it.src);
          let bx, by, bw, bh;
          if (box) [bx, by, bw, bh] = box;
          else {
            const s = Math.min(0.7, 140 / w, 124 / h);
            bw = w * s; bh = h * s; bx = (L.slotW - bw) / 2; by = (L.slotH - bh) / 2 + 2;
          }
          icon = new Sprite(it.src, x + bx, y + by, { parent: content.el, w: bw, h: bh, hit: false, pivot: "center", opacity: it.dim ? 0.45 : 1 });
        }
        cells.push({ i, x, y, slot, icon, item: it });
      }
    }
    const lastBottom = rowY(rows - 1) + L.slotH + 24;
    maxScroll = Math.max(0, lastBottom - 860);
    scroll = Math.min(scroll, maxScroll);
    focus = new Sprite(L.focus.src, 0, 0, { parent: content.el, hit: false, pivot: "center" });
    selSprite = new Sprite(L.sel.replace("{c}", L.tabs.find((t) => t.id === tab).sel), 0, 0, { parent: content.el, hit: false, pivot: "center" });
    select(items.length ? 0 : -1, false);
    applyScroll(true);
  }
  let focus, selSprite;
  function select(i, animate = true) {
    selected = i;
    const c = cells[i];
    if (!c || !c.item) { focus.hide(); selSprite.hide(); selected = -1; return; }
    focus.show(); selSprite.show();
    focus.setPos(c.x + L.focus.dx, c.y + L.focus.dy);
    selSprite.setPos(c.x, c.y);
    // selected background sits right above its own slot, under the item
    c.slot.el.after(selSprite.el);
    if (animate) {
      set(focus, { sx: 1.18, sy: 1.18, o: 0.4 }); spring(focus, { sx: 1, sy: 1, o: 1 }, P.release);
      if (c.icon) { set(c.icon, { sx: 0.82, sy: 0.82 }); spring(c.icon, { sx: 1, sy: 1 }, P.release); }
    }
  }
  function applyScroll(instant) {
    const t = scroll;
    if (instant) set(content, { y: -t }); else spring(content, { y: -t }, P.stiff);
    const [h0, h1] = L.handle.range;
    const hy = maxScroll > 0 ? h0 + (h1 - h0) * (t / maxScroll) : h0;
    handle.setPos(L.handle.x, hy);
  }
  function switchTab(id) {
    if (id === tab) { const tb = tabs[L.tabs.findIndex((d) => d.id === id)]; impulse(tb.sprite, "x", 260, P.wobble, 0); return; }
    tab = id; scroll = 0;
    game.store.change((d) => { d.bagTab = id; }, { save: false });
    build();
    set(content, { x: 0, o: 0, sx: 0.96, sy: 0.96 }); spring(content, { o: 1, sx: 1, sy: 1 }, P.pop);
    content.pivot = [1022, 550];
  }
  function use() {
    const c = cells[selected];
    if (!c || !c.item) { m.close(); return; }
    const res = onUse ? onUse(tab, c.item) : true;
    if (res === false) { ok.deny(); if (c.icon) impulse(c.icon, "x", 600, P.wobble, 0); return; }
    m.close(null, { sound: null });
  }

  // grid input: click selects, double-click uses
  let lastClick = { i: -1, t: 0 };
  m.scope.add({ z: 5, cursor: "pointer", hit: (pt) => pt.y >= L.viewport.top && pt.y <= 855 && cellAt(pt) >= 0,
    enter: () => {}, click: (pt) => {
      const i = cellAt(pt);
      if (i < 0) return;
      const now = performance.now();
      if (i === selected && lastClick.i === i && now - lastClick.t < 380) { use(); return; }
      lastClick = { i, t: now };
      if (cells[i].item) { select(i); sfx("click"); }
      else { impulse(cells[i].slot, "sy", -1.4, P.wobble, 1); sfx("hover"); }
    } });
  function cellAt(pt) {
    const y = pt.y + scroll;
    for (const c of cells) if (pt.x >= c.x && pt.x < c.x + L.slotW && y >= c.y && y < c.y + L.slotH) return c.i;
    return -1;
  }
  m.scope.onWheel = (dy) => { if (!maxScroll) return; scroll = Math.max(0, Math.min(maxScroll, scroll + dy * 0.6)); applyScroll(false); };
  handle.node.drag = {
    start: () => { handle.state("Active"); dragY0 = handle.sprite.y; },
    move: (_pt, _dx, dy) => {
      const [h0, h1] = L.handle.range;
      const hy = Math.max(h0, Math.min(h1, dragY0 + dy));
      scroll = maxScroll > 0 ? ((hy - h0) / (h1 - h0)) * maxScroll : 0;
      applyScroll(true);
    },
    end: () => { handle.reset(); sfx("click"); },
  };
  m.scope.onKey = (e) => {
    if (e.key === "Escape") { m.close(); return true; }
    if (e.key === "Enter") { use(); return true; }
    return false;
  };
  build();
  m.open();
  return m;
}
