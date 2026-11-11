// Mirror close-up (Sample_Dressing): the room camera zooms into the mirror exactly as in
// Dressing.psd, then the clothes panel pops up. Accessories can be dragged on the pet; AI
// outfits are requested by talking to the pet.
import { DRESSING as L, DRESS_CAMERA, PETS, PET_FRAME, CLOTHES, CLOTH_ORDER } from "../layout.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Scope } from "../core/input.js";
import { Button } from "../ui/button.js";
import { spring, set, impulse, P } from "../core/spring.js";
import { tween, ease } from "../core/tween.js";
import { size } from "../core/assets.js";
import { sfx } from "../audio.js";
import { t } from "../i18n.js";
import { accPositions, outfitFor } from "../pet/wardrobe.js";
import { generateOutfit } from "../pet/outfitGen.js";

function rowY(r) { return r < L.slotRows.length ? L.slotRows[r] : L.slotRows[L.slotRows.length - 1] + (r - L.slotRows.length + 1) * L.rowPitch; }

export class Dressing {
  constructor(room) {
    this.room = room;
    this.game = room.game;
    this.scope = new Scope("dressing", {
      onKey: (e) => {
        if (e.key === "Escape") { if (this.room.chat.isOpen) this.room.closeChat(); else this.exit(); return true; }
        return false;
      },
      onBackgroundClick: () => { if (this.room.chat.isOpen) this.room.closeChat(); },
      onWheel: (dy) => this.wheel(dy),
    });
    this.active = false;
    this.generating = false;
  }

  get s() { return this.game.s; }

  async enter() {
    const room = this.room, g = this.game;
    if (this.active || room.busy || room.petOut) { if (room.petOut) impulse(room.sprites.mirror, "r", 30, P.wobble, 0); return; }
    this.active = true;
    room.busy = true;
    room.chase = false;
    room.onTable = false;
    room.closeChat(true);
    room.motor.stop();
    g.input.lock(true);
    const pet = this.s.pet;
    const D = PETS[pet].dressing;
    // the pet trots to its spot beside the mirror while the camera moves in
    const x0 = room.pet.x, y0 = room.pet.y;
    room.pet.setFacing(1);
    room.pet.show("Walking_2");
    sfx("whoosh");
    const C = DRESS_CAMERA;
    await new Promise((res) => tween({ dur: 1.15, ease: ease.inOutCubic, onUpdate: (e) => {
      const s = 1 + (C.s - 1) * e;
      room.setCamera([s, 0, 0, s, C.tx * e, C.ty * e]);
      room.hudL.style.opacity = String(Math.max(0, 1 - e * 2.5));   // Sample_Dressing: no HUD in the close-up
      room.pet.setPos(x0 + (D.x - x0) * e, y0 + (D.y - y0) * e - Math.sin(e * Math.PI) * 30);
      if (e > 0.5) room.pet.show(Math.floor(e * 12) % 2 ? "Walking_4" : "Walking_2");
    }, onDone: res }));
    room.pet.setPos(D.x, D.y);
    room.pet.show("Default");
    room.hudL.style.display = "none";
    room.mode = "dressing";
    this.buildUI();
    g.input.push(this.scope);
    g.input.lock(false);
    sfx("open");
  }

  buildUI() {
    const room = this.room, sc = this.scope;
    sc.clear();
    sc.add({ z: -1e6, hit: () => true });
    room.dressL.textContent = "";
    this.panel = new Group(room.dressL, { w: 1920, h: 1080, pivot: [1457, 560] });
    const p = this.panel.el;
    new Sprite(L.modal.src, L.modal.x, L.modal.y, { parent: p, hit: false });
    const clip = el("div", "grp", p);
    Object.assign(clip.style, { width: "1920px", height: "1080px", clipPath: `inset(${L.viewport.top}px 0 ${1080 - L.viewport.bottom}px 0)` });
    this.content = new Group(clip, { w: 1920, h: 1080 });
    new Sprite(L.cover.src, L.cover.x, L.cover.y, { parent: p, hit: false });
    new Sprite(L.track.src, L.track.x, L.track.y, { parent: p, hit: false });
    this.handle = new Button({ parent: p, scope: sc, src: L.handle.src, x: L.handle.x, y: L.handle.y, sound: null, hoverScale: 1.1, pressScale: 1 });
    let y0 = 0;
    this.handle.node.drag = {
      start: () => { this.handle.state("Active"); y0 = this.handle.sprite.y; },
      move: (_pt, _dx, dy) => { const [h0, h1] = L.handle.range; const hy = Math.max(h0, Math.min(h1, y0 + dy)); this.scroll = this.maxScroll ? ((hy - h0) / (h1 - h0)) * this.maxScroll : 0; this.applyScroll(true); },
      end: () => { this.handle.reset(); sfx("click"); },
    };
    this.ok = new Button({ parent: p, scope: sc, ...L.ok, onClick: () => this.exit() });
    this.scroll = 0;
    this.focusIdx = 0;
    this.buildSlots();
    sc.add({ z: 5, cursor: "pointer", hit: (pt) => this.panel.visible && pt.y >= L.viewport.top && pt.y <= 905 && this.cellAt(pt) >= 0, click: (pt) => this.onSlot(this.cellAt(pt)) });
    // pet + accessories (in camera space)
    sc.add({ z: 20, cursor: "grab", hit: (pt) => { const q = room.toRoom(pt); return !!room.pet.accAt(q.x, q.y) || room.pet.outfitAt(q.x, q.y); },
      drag: this.dragClothes(), click: (pt) => {
        const q = room.toRoom(pt), id = room.pet.accAt(q.x, q.y);
        if (!id) return room.onPetClick();
        impulse(room.pet.acc[id], "r", 120, P.wobble, 0);
        sfx("pat");
      } });
    sc.add({ z: 10, cursor: "pointer", hit: (pt) => { const q = room.toRoom(pt); return room.pet.hitTest(q.x, q.y); }, click: () => room.onPetClick() });
    room.chat.detach();
    room.chat.attach(sc);
    set(this.panel, { x: 380, o: 0 }); spring(this.panel, { x: 0, o: 1 }, P.pop);
  }

  items() {
    const s = this.s, pet = s.pet;
    const list = CLOTH_ORDER.filter((c) => s.owned.clothes.includes(c)).map((c) => ({ kind: "acc", id: c, src: CLOTHES[c].src }));
    for (const o of s.outfits.filter((o) => o.pet === pet).slice().reverse()) list.push({ kind: "outfit", id: o.id, src: o.frames.Default, outfit: o });
    return list;
  }

  isOn(it) {
    const w = this.s.wardrobe[this.s.pet];
    return it.kind === "acc" ? !!(w.acc[it.id] && w.acc[it.id].on) : w.outfit === it.id;
  }

  buildSlots() {
    const c = this.content;
    c.el.textContent = "";
    this.cells = [];
    const items = this.items();
    const rows = Math.max(L.slotRows.length, Math.ceil(items.length / 3));
    for (let r = 0; r < rows; r++) for (let k = 0; k < 3; k++) {
      const i = r * 3 + k, x = L.slotCols[k], y = rowY(r);
      const it = items[i];
      const on = it && this.isOn(it);
      const slot = new Sprite(on ? L.slotSel : L.slot, x, y, { parent: c.el, hit: "box", pivot: "center" });
      let icon = null;
      if (it) {
        if (it.kind === "acc") {
          const [ox, oy] = L.itemOffsets[it.id];
          icon = new Sprite(it.src, x + ox, y + oy, { parent: c.el, hit: false, pivot: "center" });
        } else {
          const [w, h] = size(it.src);
          const s = Math.min(150 / w, 132 / h);
          icon = new Sprite(it.src, x + (L.slotW - w * s) / 2, y + (L.slotH - h * s) / 2 + 2, { parent: c.el, w: w * s, h: h * s, hit: false, pivot: "center" });
        }
      }
      this.cells.push({ i, x, y, slot, icon, item: it });
    }
    this.focus = new Sprite(L.focus.src, 0, 0, { parent: c.el, hit: false, pivot: "center" });
    this.placeFocus(false);
    this.maxScroll = Math.max(0, rowY(rows - 1) + L.slotH + 20 - 860);
    this.applyScroll(true);
  }

  placeFocus(animate = true) {
    const cell = this.cells[this.focusIdx] || this.cells[0];
    if (!cell || !cell.item) { this.focus.hide(); return; }
    this.focus.show();
    this.focus.setPos(cell.x + L.focus.dx, cell.y + L.focus.dy);
    if (animate) { set(this.focus, { sx: 1.16, sy: 1.16, o: 0.4 }); spring(this.focus, { sx: 1, sy: 1, o: 1 }, P.release); }
  }

  cellAt(pt) {
    const y = pt.y + this.scroll;
    for (const c of this.cells) if (pt.x >= c.x && pt.x < c.x + L.slotW && y >= c.y && y < c.y + L.slotH) return c.i;
    return -1;
  }

  applyScroll(instant) {
    if (instant) set(this.content, { y: -this.scroll }); else spring(this.content, { y: -this.scroll }, P.stiff);
    const [h0, h1] = L.handle.range;
    this.handle.setPos(L.handle.x, this.maxScroll ? h0 + (h1 - h0) * (this.scroll / this.maxScroll) : h0);
  }

  wheel(dy) { if (!this.maxScroll) return; this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + dy * 0.6)); this.applyScroll(false); }

  onSlot(i) {
    const cell = this.cells[i];
    if (!cell) return;
    if (!cell.item) { impulse(cell.slot, "sy", -1.4, P.wobble, 1); sfx("hover"); return; }
    this.focusIdx = i;
    const it = cell.item, pet = this.s.pet, room = this.room;
    const on = this.isOn(it);
    this.game.store.change((d) => {
      const w = d.wardrobe[pet];
      if (it.kind === "acc") {
        const prev = w.acc[it.id];
        const [dx, dy] = CLOTHES[it.id].pos[pet];
        w.acc[it.id] = { x: prev ? prev.x : dx, y: prev ? prev.y : dy, on: !on };
      } else {
        w.outfit = on ? null : it.id;
      }
    });
    const w = this.s.wardrobe[pet];
    room.pet.setAccessories(accPositions(w.acc));
    room.pet.setOutfit(outfitFor(this.s, w.outfit));
    sfx(on ? "drop" : "sparkle", { vol: on ? 1 : 0.7 });
    if (!on) {
      if (it.kind === "acc") { const a = room.pet.acc[it.id]; if (a) { set(a, { sx: 0.2, sy: 0.2, o: 0 }); spring(a, { sx: 1, sy: 1, o: 1 }, P.pop); } }
      else { set(room.pet.root, { sx: 0.9, sy: 1.12 }); spring(room.pet.root, { sx: 1, sy: 1 }, P.release); }
      room.motor.act(1);
    }
    cell.slot.setSrc(on ? L.slot : L.slotSel);
    set(cell.slot, { sx: 0.9, sy: 0.9 }); spring(cell.slot, { sx: 1, sy: 1 }, P.release);
    if (cell.icon) { set(cell.icon, { sx: 1.2, sy: 1.2 }); spring(cell.icon, { sx: 1, sy: 1 }, P.release); }
    this.placeFocus();
  }

  dragClothes() {
    let id = null, start = null, garment = null;
    const room = this.room;
    return {
      start: (pt0) => {
        const q = room.toRoom(pt0);
        id = room.pet.accAt(q.x, q.y);
        const wardrobe = this.s.wardrobe[this.s.pet];
        if (!id) {
          garment = room.pet.outfitAt(q.x, q.y) && this.s.outfits.find((o) => o.id === wardrobe.outfit);
          if (garment) {
            start = { x: garment.x || 0, y: garment.y || 0 };
            sfx("pickup");
          }
          return;
        }
        start = { ...wardrobe.acc[id] };
        const a = room.pet.acc[id];
        spring(a, { sx: 1.08, sy: 1.08 }, P.hover);
        sfx("pickup");
      },
      move: (_pt, dx, dy) => {
        if (!id && !garment) return;
        const k = room.camM[0];
        const x = start.x + (dx / k) * room.pet.facing;
        const y = start.y + dy / k;
        if (garment) {
          garment.x = Math.round(Math.max(-64, Math.min(64, x)));
          garment.y = Math.round(Math.max(-64, Math.min(64, y)));
          room.pet.setOutfit(outfitFor(this.s, garment.id));
          return;
        }
        const w = CLOTHES[id].w, h = CLOTHES[id].h;
        const nx = Math.max(-w / 2, Math.min(PET_FRAME.w - w / 2, x));
        const ny = Math.max(-h / 2, Math.min(PET_FRAME.h - h / 2, y));
        this.s.wardrobe[this.s.pet].acc[id] = { ...start, x: Math.round(nx), y: Math.round(ny) };
        room.pet.setAccessories(accPositions(this.s.wardrobe[this.s.pet].acc));
      },
      end: () => {
        if (garment) {
          set(room.pet.garment, { sy: 0.94 });
          spring(room.pet.garment, { sy: 1 }, P.release);
          sfx("drop");
          this.game.store.save();
          garment = null;
          return;
        }
        if (!id) return;
        const a = room.pet.acc[id];
        if (a) { set(a, { sx: 1.12, sy: 0.9 }); spring(a, { sx: 1, sy: 1 }, P.release); }
        sfx("drop");
        this.game.store.save();
        id = null;
      },
    };
  }

  // ---------------------------------------------------------------- chat / AI outfits
  onPetClick() {
    const room = this.room;
    if (room.chat.isOpen) { room.closeChat(); return; }
    room.petVoice();
    set(room.pet.root, { sy: 0.9, sx: 1.05 }); spring(room.pet.root, { sx: 1, sy: 1 }, P.release);
    spring(this.panel, { x: 420, o: 0 }, P.out);
    this.panel.hiddenForChat = true;
    room.openChat({ mode: "dressing", greeting: this.generating ? t("thinking", this.s.lang) : t("dressHello", this.s.lang, this.s.pet) });
  }

  onChatClosed() {
    if (this.panel && this.panel.hiddenForChat && this.active) { this.panel.hiddenForChat = false; spring(this.panel, { x: 0, o: 1 }, P.pop); }
  }

  async onChatSend(text) {
    const room = this.room, s = this.s, pet = s.pet, lang = s.lang;
    if (this.generating) { room.chat.say(t("thinking", lang)); return; }
    const r = await room.ask(text);
    const outfit = r && r.ok && r.data && typeof r.data.outfit === "string" && r.data.outfit.trim();
    if (!outfit) return;
    this.generating = true;
    room.motor.act(30);
    const done = (r.data.done && String(r.data.done)) || t("outfitDone", lang, pet);
    setTimeout(() => { if (room.chat.isOpen && this.generating) room.chat.thinking(); }, 2600);
    try {
      const o = await generateOutfit(this.game, pet, outfit.slice(0, 160), text);
      this.game.store.change((d) => { d.outfits.push(o); d.wardrobe[pet].outfit = o.id; }, { now: true });
      if (this.s.pet !== pet || room.petOut || this.game.sceneName !== "room") return;
      room.pet.setOutfit(outfitFor(this.s, o.id));
      room.motor.act(1.6);
      set(room.pet.root, { sx: 0.7, sy: 1.25 }); spring(room.pet.root, { sx: 1, sy: 1 }, P.release);
      sfx("sparkle");
      if (this.active && !this.leaving) {
        if (room.chat.isOpen) room.chat.say(done.replace(/[*_#`]/g, ""));
        this.focusIdx = this.items().findIndex((it) => it.id === o.id);
        this.buildSlots();
      }
      window.hlo.event("outfit_worn", { pet });
    } catch (e) {
      console.warn("outfit failed", e);
      room.motor.idle();
      if (room.chat.isOpen) room.chat.say(t("outfitFail", lang, pet));
      window.hlo.reportError({ message: "outfit generation failed: " + (e && e.message), stack: e && e.stack, scene: "dressing" });
    } finally {
      this.generating = false;
    }
  }

  update() { /* the motor is updated by the room */ }

  async exit() {
    if (!this.active || this.leaving) return this.leaving;
    let done;
    this.leaving = new Promise((r) => { done = r; });
    const room = this.room, g = this.game;
    room.closeChat(true);
    g.input.pop(this.scope);
    room.chat.detach();
    room.chat.attach(room.scope);
    g.input.lock(true);
    g.store.save(true);
    sfx("close");
    spring(this.panel, { x: 380, o: 0 }, P.out);
    const C = DRESS_CAMERA;
    room.hudL.style.display = "";
    await new Promise((res) => tween({ dur: 1.0, ease: ease.inOutCubic, delay: 0.15, onUpdate: (e) => {
      const k = 1 - e, s = 1 + (C.s - 1) * k;
      room.setCamera([s, 0, 0, s, C.tx * k, C.ty * k]);
      room.hudL.style.opacity = String(Math.min(1, Math.max(0, (e - 0.55) / 0.45)));
    }, onDone: res }));
    room.setCamera([1, 0, 0, 1, 0, 0]);
    room.hudL.style.opacity = "";
    room.dressL.textContent = "";
    room.mode = "room";
    room.busy = false;
    room.idleT = 1.2;
    this.active = false;
    g.input.lock(false);
    this.leaving = null;
    done();
  }
}
