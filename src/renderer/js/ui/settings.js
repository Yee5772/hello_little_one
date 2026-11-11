// Settings panel (Sample_Setting / Sample_Setting_2).
import { SETTINGS as L, RESOLUTIONS } from "../layout.js";
import { Sprite, Group, el } from "../core/sprite.js";
import { Button } from "./button.js";
import { Modal } from "./modal.js";
import { spring, set, impulse, P } from "../core/spring.js";
import { sfx, setLevels } from "../audio.js";

export function openSettings(game, { fromMenu = false } = {}) {
  const s = game.s.settings;
  const m = new Modal(game, { name: "settings", mask: L.mask.src, pivot: [972, 472], onKey: (e) => { if (e.key === "Escape" && listOpen) { toggleList(false); return true; } return false; } });
  const root = m.el;
  new Sprite(L.modal.src, L.modal.x, L.modal.y, { parent: root, hit: false });

  // ---- sliders (PSD order: fill under the track frame, then handle)
  const sliders = {};
  function slider(key, def, levelKey, onKey) {
    const fill = new Sprite(def.fill.src, def.fill.x, def.fill.y, { parent: root, hit: false });
    new Sprite(def.track.src, def.track.x, def.track.y, { parent: root, hit: false });
    const handle = new Button({ parent: root, scope: m.scope, src: def.handle.src, x: def.handle.x, y: def.handle.y, sound: null, hoverScale: 1.12, pressScale: 1.0 });
    const icon = new Sprite(s[onKey] ? def.icon.on : def.icon.off, def.icon.x, def.icon.y, { parent: root, pivot: "center" });
    const sl = { fill, handle, icon, value: s[levelKey] };
    const x0 = def.fill.x, w = def.fill.w;
    sl.set = (v, commit) => {
      v = Math.max(0, Math.min(1, v));
      sl.value = v;
      handle.setPos(x0 + v * w - def.handle.w / 2, def.handle.y);
      fill.el.style.clipPath = `inset(0 ${(1 - v) * w}px 0 0)`;
      game.store.change((d) => { d.settings[levelKey] = v; }, { save: !!commit });
      setLevels({ [levelKey]: v });
    };
    const fromPt = (pt) => (pt.x - x0) / w;
    let lastTick = 0;
    handle.node.drag = {
      start: () => { handle.state("Active"); spring(handle.sprite, { sx: 1.12, sy: 1.12 }, P.press); },
      move: (pt) => {
        sl.set(fromPt(pt), false);
        const now = performance.now();
        if (key === "sfx" && now - lastTick > 90) { lastTick = now; sfx("hover", { vol: 2.4 }); }
      },
      end: () => { sl.set(sl.value, true); handle.reset(); spring(handle.sprite, { sx: 1, sy: 1 }, P.release); if (key === "sfx") sfx("click"); },
    };
    handle.node.dragCursor = "grabbing";
    // clicking the bar jumps the handle there
    m.scope.add({ z: -10, cursor: "pointer", hit: (pt) => pt.x >= def.track.x - 6 && pt.x <= def.track.x + 336 && pt.y >= def.handle.y + 10 && pt.y <= def.handle.y + 76,
      click: (pt) => { sl.set(fromPt(pt), true); set(handle.sprite, { sy: 1.2, sx: 0.9 }); spring(handle.sprite, { sx: 1, sy: 1 }, P.release); sfx("click"); } });
    // the speaker / note icon toggles mute (whole icon area: the note is drawn with an empty middle)
    m.scope.add({ hit: (pt) => pt.x >= icon.x && pt.x <= icon.x + icon.w && pt.y >= icon.y && pt.y <= icon.y + icon.h, cursor: "pointer",
      enter: () => spring(icon, { sx: 1.08, sy: 1.08 }, P.hover), leave: () => spring(icon, { sx: 1, sy: 1 }, P.hover),
      click: () => {
        game.store.change((d) => { d.settings[onKey] = !d.settings[onKey]; });
        const on = game.s.settings[onKey];
        icon.setSrc(on ? def.icon.on : def.icon.off);
        setLevels({ [onKey]: on });
        set(icon, { sx: 0.75, sy: 0.75 }); spring(icon, { sx: 1.08, sy: 1.08 }, P.release);
        sfx("click");
      } });
    sl.set(sl.value, false);
    sliders[key] = sl;
  }
  slider("sfx", L.sfx, "sfx", "sfxOn");
  slider("music", L.music, "music", "musicOn");

  // ---- MENU button
  const menuBtn = new Button({ parent: root, scope: m.scope, ...L.menuBtn, onClick: () => m.close(() => { if (!fromMenu) game.backToMenu(); }) });
  menuBtn.node.enabled = () => !listOpen;

  // ---- resolution dropdown (PSD order: icon, list, selected bar, frame, field, arrow, text)
  const R = L.res;
  new Sprite(R.icon.src, R.icon.x, R.icon.y, { parent: root, hit: false });
  const listG = new Group(root, { w: 1920, h: 1080, pivot: [1325, 465] });
  new Sprite(R.list.src, R.list.x, R.list.y, { parent: listG.el, hit: false });
  const bar = new Sprite(R.selected.src, R.selected.x, 0, { parent: listG.el, hit: false });
  new Sprite(R.frame.src, R.frame.x, R.frame.y, { parent: listG.el, hit: false });
  const items = RESOLUTIONS.map((r, i) => {
    const t = el("div", "res-text", listG.el);
    Object.assign(t.style, { left: R.fieldText.x + "px", top: R.itemTextY[i] + "px", width: R.fieldText.w + "px", height: R.fieldText.h + "px" });
    t.textContent = r;
    return t;
  });
  const field = new Sprite(R.field.src, R.field.x, R.field.y, { parent: root, pivot: "center" });
  const arrow = new Sprite(R.arrow.src, R.arrow.x, R.arrow.y, { parent: root, pivot: "center" });
  const fieldText = el("div", "res-text", root);
  Object.assign(fieldText.style, { left: R.fieldText.x + "px", top: R.fieldText.y + "px", width: R.fieldText.w + "px", height: R.fieldText.h + "px" });
  const current = () => s.resolution || game.currentResolution();
  fieldText.textContent = current();
  let listOpen = false;
  let hoverIdx = -1;
  const placeBar = () => {
    const i = hoverIdx >= 0 ? hoverIdx : Math.max(0, RESOLUTIONS.indexOf(current()));
    bar.setPos(R.selected.x, R.itemTextY[i] + R.selected.dy);
  };
  function toggleList(open) {
    listOpen = open;
    hoverIdx = -1;
    placeBar();
    if (open) { listG.show(); set(listG, { sy: 0.3, o: 0 }); spring(listG, { sy: 1, o: 1 }, P.pop); set(arrow, { sy: 0.55 }); spring(arrow, { sy: 1 }, P.release); sfx("open"); }
    else { spring(listG, { sy: 0.4, o: 0 }, P.out, () => { if (!listOpen) listG.hide(); }); set(arrow, { sy: 0.55 }); spring(arrow, { sy: 1 }, P.release); }
  }
  listG.hide();
  m.scope.add({ hit: (pt) => field.hitTest(pt.x, pt.y), cursor: "pointer", z: 50,
    enter: () => spring(field, { sx: 1.02, sy: 1.04 }, P.hover), leave: () => spring(field, { sx: 1, sy: 1 }, P.hover),
    click: () => { toggleList(!listOpen); if (!listOpen) sfx("close"); } });
  const rowAt = (pt) => {
    if (pt.x < R.list.x || pt.x > R.list.x + 278 || pt.y < R.list.y || pt.y > R.list.y + 273) return -1;
    const mids = [547.5, 612, 678.5];
    return pt.y < mids[0] ? 0 : pt.y < mids[1] ? 1 : pt.y < mids[2] ? 2 : 3;
  };
  m.scope.add({ z: 60, cursor: "pointer", enabled: () => listOpen, hit: (pt) => rowAt(pt) >= 0,
    enter: () => {}, leave: () => { hoverIdx = -1; placeBar(); },
    click: (pt) => {
      const i = rowAt(pt);
      if (i < 0) return;
      const r = RESOLUTIONS[i];
      game.store.change((d) => { d.settings.resolution = r; }, { now: true });
      fieldText.textContent = r;
      game.setResolution(r);
      sfx("click");
      toggleList(false);
    } });
  // hover tracking for the highlight bar
  const onMove = () => {
    if (!listOpen) return;
    const i = rowAt(game.input.last);
    if (i !== hoverIdx) { hoverIdx = i; placeBar(); if (i >= 0) { set(bar, { sx: 0.96 }); spring(bar, { sx: 1 }, P.release); sfx("hover"); } }
  };
  game.stage.vp.addEventListener("pointermove", onMove);
  // clicking anywhere else closes the list
  m.scope.add({ z: 40, enabled: () => listOpen, hit: (pt) => rowAt(pt) < 0 && !field.hitTest(pt.x, pt.y), click: () => { toggleList(false); sfx("close"); } });

  // ---- close
  new Button({ parent: root, scope: m.scope, ...L.close, z: 70, onClick: () => m.close() });
  const origClose = m.close.bind(m);
  m.close = (cb, o) => { game.stage.vp.removeEventListener("pointermove", onMove); game.store.save(true); origClose(cb, o); };
  m.open();
  return m;
}
