// Desktop-pet overlay: a transparent, click-through, always-on-top window covering one display.
// The pet walks on the taskbar line and on the visible top edges of real windows (File Explorer etc.).
"use strict";
const { BrowserWindow, screen } = require("electron");
const IS_MAC = process.platform === "darwin";
const { listWindows } = IS_MAC ? require("./macwin") : require("./winapi");

class DesktopPet {
  constructor({ pageUrl, preload, getGameWindow, onReturn, log }) {
    this.pageUrl = pageUrl;
    this.preload = preload;
    this.getGameWindow = getGameWindow;
    this.onReturn = onReturn;
    this.log = log || console;
    this.win = null;
    this.display = null;
    this.timer = null;
    this.lastSig = "";
    this.payload = null;
  }

  get active() { return !!(this.win && !this.win.isDestroyed()); }

  launch(payload) {
    this.close();
    const game = this.getGameWindow();
    const cb = game && !game.isDestroyed() ? game.getContentBounds() : { x: 0, y: 0 };
    const start = { x: cb.x + payload.start.clientX, y: cb.y + payload.start.clientY };
    this.display = screen.getDisplayNearestPoint({ x: Math.round(start.x), y: Math.round(start.y) });
    const b = this.display.bounds;
    this.win = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
      backgroundColor: "#00000000", title: "Hello Little One — desktop pet",
      // macOS: a non-activating panel stays on every Space and over full-screen apps, and picking up the pet
      // neither needs a first click to wake the window nor drags the game window to the front.
      // enableLargerThanScreen: AppKit would otherwise push the overlay down below the menu bar, off by that much
      ...(IS_MAC ? { type: "panel", acceptFirstMouse: true, enableLargerThanScreen: true } : {}),
      webPreferences: { preload: this.preload, contextIsolation: true, sandbox: true, backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required" },
    });
    this.win.setAlwaysOnTop(true, "screen-saver");
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.setBounds(b); // exact DIP bounds of the display (incl. taskbar)
    this.payload = {
      ...payload,
      start: { ...payload.start, x: start.x - b.x, y: start.y - b.y },
      area: { width: b.width, height: b.height },
      ground: this.display.workArea.y + this.display.workArea.height - b.y,
    };
    this.win.webContents.once("did-finish-load", () => {
      if (!this.active) return;
      this.win.webContents.send("pet:init", this.payload);
      this.win.showInactive();
      this.lastSig = "";
      this.poll();
      this.timer = setInterval(() => this.poll(), 100);
      // macOS: forwarded mouse moves can't be relied on for a panel whose app stays in the background,
      // so the overlay is told where the pointer is and can still become grabbable while another app is in use
      if (IS_MAC) { this.lastCursor = null; this.cursorTimer = setInterval(() => this.pollCursor(), 33); }
    });
    this.win.on("closed", () => { clearInterval(this.timer); clearInterval(this.cursorTimer); this.win = null; });
    this.win.loadURL(this.pageUrl);
  }

  // Visible top edges, in overlay-local DIP coordinates.
  poll() {
    if (!this.active) return;
    let wins = [];
    try { wins = listWindows(); } catch (e) { this.log.warn("[desktop] listWindows failed:", e.message); }
    // our own game window is a perch too, at its real z-order; the overlay itself is skipped
    const game = this.getGameWindow();
    const gameHwnd = game && !game.isDestroyed() ? hwndOf(game) : 0;
    const b = this.display.bounds;
    const rects = [];
    for (const w of wins) {
      if (w.pid === process.pid && w.hwnd !== gameHwnd) continue;
      let r;
      try { r = dipRect(w); }
      catch { r = { x: w.x, y: w.y, width: w.w, height: w.h }; }
      const isGame = w.hwnd === gameHwnd;
      rects.push({ id: isGame ? "game" : w.hwnd, x: r.x - b.x, y: r.y - b.y, w: r.width, h: r.height, explorer: w.explorer, game: isGame });
    }
    const W = b.width;
    const platforms = [];
    rects.forEach((r, i) => {
      if (r.y < 40 || r.y > this.payload.ground - 20) return;        // no room above it / below the taskbar line
      if (r.x + r.w < 0 || r.x > W) return;
      let segs = [[Math.max(0, r.x), Math.min(W, r.x + r.w)]];
      for (let j = 0; j < i && segs.length; j++) {                   // windows above it hide parts of the edge
        const o = rects[j];
        if (o.y <= r.y + 2 && o.y + o.h >= r.y - 10) segs = subtract(segs, o.x, o.x + o.w);
      }
      for (const [x1, x2] of segs) if (x2 - x1 >= 60) platforms.push({ id: r.id, x1, x2, y: r.y, wx: r.x, explorer: !!r.explorer, game: !!r.game });
    });
    const sig = JSON.stringify(platforms);
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.win.webContents.send("pet:platforms", platforms);
    }
  }

  pollCursor() {
    if (!this.active) return;
    const p = this.cursorOverride || screen.getCursorScreenPoint();
    if (this.lastCursor && p.x === this.lastCursor.x && p.y === this.lastCursor.y) return;
    this.lastCursor = p;
    const b = this.display.bounds;
    this.win.webContents.send("pet:cursor", { x: p.x - b.x, y: p.y - b.y });
  }

  setIgnore(ignore) { if (this.active) this.win.setIgnoreMouseEvents(!!ignore, { forward: true }); }

  setFocusable(f) {
    if (!this.active) return;
    this.win.setFocusable(!!f);
    if (f) this.win.focus();
  }

  // Overlay-local point -> did the player drop the pet onto the game window?
  drop(pt) {
    if (!this.active) return false;
    const game = this.getGameWindow();
    if (!game || game.isDestroyed() || !game.isVisible() || game.isMinimized()) return false;
    const b = this.display.bounds;
    const sx = pt.x + b.x, sy = pt.y + b.y;
    const cb = game.getContentBounds();
    if (sx < cb.x || sy < cb.y || sx > cb.x + cb.width || sy > cb.y + cb.height) return false;
    if (this.coveredAt(sx, sy, game)) return false;  // that part of the game is hidden behind another window
    this.close();
    this.onReturn({ clientX: sx - cb.x, clientY: sy - cb.y, facing: pt.facing, chat: Array.isArray(pt.chat) ? pt.chat.slice(-20) : [] });
    game.focus();
    return true;
  }

  // Is a window above the game window (z-order) covering this screen DIP point?
  coveredAt(sx, sy, game) {
    const gameHwnd = hwndOf(game);
    if (!gameHwnd) return false;
    let wins = [];
    try { wins = listWindows(); } catch { return false; }
    const gameIndex = wins.findIndex((w) => w.hwnd === gameHwnd);
    if (gameIndex < 0) return false;
    for (const w of wins.slice(0, gameIndex)) {
      if (w.pid === process.pid) continue;
      let r;
      try { r = dipRect(w); } catch { continue; }
      if (sx >= r.x && sx <= r.x + r.width && sy >= r.y && sy <= r.y + r.height) return true;
    }
    return false;
  }

  send(channel, data) { if (this.active) this.win.webContents.send(channel, data); }

  close() {
    clearInterval(this.timer);
    clearInterval(this.cursorTimer);
    if (this.active) this.win.destroy();
    this.win = null;
  }
}

// listWindows() rect -> DIP (screenToDipRect only exists on Windows; macOS already reports DIP)
function dipRect(w) {
  const r = { x: w.x, y: w.y, width: w.w, height: w.h };
  return IS_MAC ? r : screen.screenToDipRect(null, r);
}

// BrowserWindow.getNativeWindowHandle() is a Buffer holding the HWND; on macOS it is an NSView*, so the id
// that matches listWindows() (the CGWindowID) comes from the media source id, "window:<id>:<other>"
function hwndOf(win) {
  try {
    if (IS_MAC) return Number(win.getMediaSourceId().split(":")[1]);
    const buf = win.getNativeWindowHandle();
    return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
  } catch { return 0; }
}

function subtract(segs, a, b) {
  const out = [];
  for (const [x1, x2] of segs) {
    if (b <= x1 || a >= x2) { out.push([x1, x2]); continue; }
    if (a > x1) out.push([x1, a]);
    if (b < x2) out.push([b, x2]);
  }
  return out;
}

module.exports = { DesktopPet, hwndOf };
