"use strict";
const { app, BrowserWindow, ipcMain, protocol, net, screen, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { pathToFileURL } = require("url");
const { loadConfig } = require("./config");
const { Akarion } = require("./akarion");
const { SaveStore } = require("./save");
const { DesktopPet, hwndOf } = require("./desktop");
const { windowRect, moveWindow, listWindows } = require("./winapi");

const ROOT = path.join(__dirname, "..", "..");
const VERSION = require(path.join(ROOT, "package.json")).version;
// verification mode (local automation server). A packaged build only allows it when the
// environment explicitly opts in, so nothing else on the PC can drive a player's game.
const TEST_TOKEN = process.env.HLO_TEST_TOKEN;
const AUTOMATION = !app.isPackaged && !!TEST_TOKEN && process.argv.includes("--hlo-automation");
const IS_MAC = process.platform === "darwin";
// verification runs keep rendering while other windows cover the game (Windows occlusion tracking
// would otherwise stop requestAnimationFrame, so scripted transitions would never finish)
if (AUTOMATION) {
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}
app.setName("Hello Little One Desktop");
// verification runs use their own data folder so they never touch real save games
const dataDir = path.join(ROOT, ".local", AUTOMATION ? "test" : "player");
fs.mkdirSync(dataDir, { recursive: true });
app.setPath("userData", dataDir);
app.setAppUserModelId("local.hellolittleone.desktop");

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (!AUTOMATION && !app.requestSingleInstanceLock()) { app.quit(); }

const log = {
  info: (...a) => console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

let cfg, ak, store, desktop, gameWin = null, quitting = false;
const OUTFIT_FRAMES = ["Default", "Walking_1", "Walking_2", "Walking_3", "Walking_4", "Action_1", "Action_2"];
const RESOLUTIONS = ["1920x1080", "1600x900", "1280x720", "960x540"];

// ---------- app:// file mapping (only these roots are reachable) ----------
function resolveAppPath(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const roots = [
    ["src/renderer/", path.join(ROOT, "src", "renderer")],
    ["src/desktop/", path.join(ROOT, "src", "desktop")],
    ["src/shared/", path.join(ROOT, "src", "shared")],
    ["assets/", path.join(ROOT, "assets")],
    ["outfits/", path.join(app.getPath("userData"), "outfits")],
    ["postcards/", path.join(app.getPath("userData"), "postcards")],
  ];
  for (const [prefix, dir] of roots) {
    if (rel.startsWith(prefix)) {
      const p = path.normalize(path.join(dir, rel.slice(prefix.length)));
      if (p.startsWith(dir + path.sep)) return p;
    }
  }
  return null;
}

// Settings → Resolution uses the unit the OS's own display settings show: physical pixels on Windows,
// points on macOS ("looks like 1470 × 956"), where a Retina panel would otherwise make 960x540 a thumbnail
const resolutionScale = (disp) => (IS_MAC ? 1 : disp.scaleFactor || 1);

function pickResolution(saved) {
  const disp = gameWin ? screen.getDisplayMatching(gameWin.getBounds()) : screen.getPrimaryDisplay();
  const sf = resolutionScale(disp);
  const wa = disp.workArea;
  const fits = (r) => { const [w, h] = r.split("x").map(Number); return w / sf <= wa.width && h / sf + 40 <= wa.height; };
  if (saved && RESOLUTIONS.includes(saved)) return saved;
  return RESOLUTIONS.find(fits) || RESOLUTIONS[RESOLUTIONS.length - 1];
}

async function leaveFullScreen() {
  if (!gameWin.isFullScreen()) return;
  await new Promise((r) => { gameWin.once("leave-full-screen", r); gameWin.setFullScreen(false); setTimeout(r, 1500); });
}

async function applyResolution(res) {
  if (!gameWin || gameWin.isDestroyed()) return;
  const disp = screen.getDisplayMatching(gameWin.getBounds());
  const sf = resolutionScale(disp);
  const [w, h] = res.split("x").map(Number);
  const dw = Math.round(w / sf), dh = Math.round(h / sf);
  const wa = disp.workArea;
  if (dw > wa.width || dh + 40 > wa.height) {
    if (!gameWin.isFullScreen()) gameWin.setFullScreen(true);   // the monitor's own size: borderless full screen
  } else {
    await leaveFullScreen();
    gameWin.setContentSize(dw, dh);
    centerWindow(gameWin, disp);
  }
}

// centre in the work area, moving in physical pixels so the exact client size is kept
function centerWindow(win, disp) {
  if (IS_MAC) {                                                         // points are already the native unit: nothing to drift
    const wa = disp.workArea, b = win.getBounds();
    win.setPosition(Math.round(wa.x + (wa.width - b.width) / 2), Math.round(wa.y + (wa.height - b.height) / 2));
    return;
  }
  const hwnd = hwndOf(win), r = hwnd && windowRect(hwnd);
  const wa = screen.dipToScreenRect(null, disp.workArea);
  if (r) moveWindow(hwnd, wa.x + (wa.width - r.w) / 2, wa.y + (wa.height - r.h) / 2);
}

// Dragging the window border keeps the game area at exactly 16:9. (setAspectRatio on Windows
// locks the outer frame instead — its extraSize is macOS-only — which leaves thin black bars.)
function lockAspect(win) {
  if (IS_MAC) {
    // AppKit holds the content area (title bar excluded) at the ratio while dragging; it only rounds to whole
    // points, so settle on an exact 16:9 size when the drag ends or a hairline of black could stay
    win.setAspectRatio(16 / 9);
    const [, oh] = win.getSize(), [, ch] = win.getContentSize();
    win.setMinimumSize(512, 288 + oh - ch);
    win.on("resized", () => {
      if (win.isFullScreen()) return;
      const [cw] = win.getContentSize(), w = Math.round(cw / 16) * 16;
      win.setContentSize(w, (w * 9) / 16);
    });
    return;
  }
  win.on("will-resize", (e, nb, details) => {
    if (win.isFullScreen()) return;
    e.preventDefault();
    const ob = win.getBounds(), cb = win.getContentBounds();
    const fw = ob.width - cb.width, fh = ob.height - cb.height;
    const edge = (details && details.edge) || "bottom-right";
    let cw = nb.width - fw;
    const ch = nb.height - fh;
    if (edge === "top" || edge === "bottom") cw = (ch * 16) / 9;
    else if (edge !== "left" && edge !== "right" && Math.abs(ch - cb.height) * 16 > Math.abs(cw - cb.width) * 9) cw = (ch * 16) / 9;
    // steps of 64 DIP: width and height stay whole pixels at 100/125/150/175/200 % scaling, and every
    // preset resolution (1920/1600/1280/960 px wide) is one of the steps
    const wa = screen.getDisplayMatching(ob).workArea;
    const maxW = Math.floor(Math.min(wa.width - fw, ((wa.height - fh) * 16) / 9) / 64) * 64;
    cw = Math.min(maxW, Math.max(512, Math.round(cw / 64) * 64));
    const left = edge.includes("left"), top = edge.includes("top");
    const hwnd = (left || top) && hwndOf(win), r0 = hwnd && windowRect(hwnd);
    win.setContentSize(cw, (cw * 9) / 16);                              // exact client area (setBounds rounds the frame)
    if (r0) {                                                           // dragging the left / top edge: keep the opposite edge put
      const r1 = windowRect(hwnd);
      moveWindow(hwnd, left ? r0.x + r0.w - r1.w : r0.x, top ? r0.y + r0.h - r1.h : r0.y);
    }
  });
}

function createGameWindow(initialRes) {
  const disp = screen.getPrimaryDisplay();
  // verification captures must stay 1:1 with the samples, whatever the OS calls a pixel
  const sf = AUTOMATION ? disp.scaleFactor || 1 : resolutionScale(disp);
  const [w, h] = initialRes.split("x").map(Number);
  gameWin = new BrowserWindow({
    // size from Settings → Resolution; dragging the border is aspect-locked (lockAspect), no maximise
    // (macOS: the green button only turns full screen on when the window is maximizable)
    useContentSize: true, width: Math.round(w / sf), height: Math.round(h / sf), maximizable: IS_MAC,
    show: false, backgroundColor: "#000000", title: "跟屁寵 Hello Little One Desktop", autoHideMenuBar: true,
    icon: path.join(ROOT, "assets", "extracted", "app_icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true,
      autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false, spellcheck: false },
  });
  // the constructor's content size can come out a pixel off at fractional DPI scales: set it exactly
  gameWin.setContentSize(Math.round(w / sf), Math.round(h / sf));
  lockAspect(gameWin);
  gameWin.once("ready-to-show", () => { gameWin.show(); if (!AUTOMATION) applyResolution(initialRes); });
  gameWin.on("close", async (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    try { await Promise.race([gameWin.webContents.executeJavaScript("window.__hloBeforeQuit && window.__hloBeforeQuit()", true), sleep(2500)]); } catch { /* ignore */ }
    desktop.close();
    gameWin.destroy();
    app.quit();
  });
  gameWin.webContents.on("render-process-gone", (_e, d) => log.error(`renderer gone: ${d.reason}`));
  gameWin.webContents.on("console-message", (_e, level, message, line, src) => {
    if (AUTOMATION || process.env.HLO_DEBUG) log.info(`[renderer:${level}] ${message} (${String(src).split("/").pop()}:${line})`);
  });
  gameWin.loadURL("app://game/src/renderer/index.html");
}

// ---------- IPC ----------
function prepareAi() {
  if (!ak.enabled || ak.playerId) return ak.playerReady;
  const player = store.player();
  return ak.setPlayer(player.id, `Player-${player.id.slice(0, 6)}`);
}

function setupIpc() {
  ipcMain.handle("app:info", () => ({
    version: VERSION, automation: AUTOMATION, aiEnabled: ak.enabled, keyMode: ak.cfg.keyMode,
    playerId: store.player().id, locale: app.getLocale(), resolutions: RESOLUTIONS, platform: process.platform,
  }));
  ipcMain.handle("save:load", () => store.load());
  ipcMain.handle("save:write", (_e, obj) => { store.save(obj); return true; });
  ipcMain.handle("ai:chat", async (_e, req) => {
    if (!ak.enabled) return { ok: false, status: 0 };
    try {
      await prepareAi();
      const text = await ak.chat(req);
      return { ok: true, text };
    } catch (e) {
      log.warn("[ai:chat]", e.status, e.message);
      return { ok: false, status: e.status || 0, error: e.message };
    }
  });
  ipcMain.handle("ai:outfit", async (_e, req) => {
    try {
      await prepareAi();
      const r = await ak.outfitEdit({ sheet: Buffer.from(req.sheet), width: req.width, height: req.height, prompt: req.prompt, promptWhiteBg: req.promptWhiteBg });
      return { ok: true, buffer: r.buffer, transparent: r.transparent, model: r.model, url: r.url };
    } catch (e) {
      log.warn("[ai:outfit]", e.status, e.message);
      return { ok: false, status: e.status || 0, error: e.message };
    }
  });
  ipcMain.handle("outfit:store", (_e, rec) => {
    if (!/^outfit_[a-z0-9]+$/.test(rec?.id || "")) return { ok: false, error: "Invalid outfit ID" };
    const frames = OUTFIT_FRAMES.map((name) => {
      const data = rec.frames?.[name];
      return data instanceof ArrayBuffer ? Buffer.from(data) : null;
    });
    if (frames.some((frame) => !frame?.length)) return { ok: false, error: "Missing outfit frame" };
    const dir = store.outfitDir(rec.id);
    const local = {};
    OUTFIT_FRAMES.forEach((name, index) => {
      const file = `${name}.png`;
      fs.writeFileSync(path.join(dir, file), frames[index]);
      local[name] = `outfits/${rec.id}/${file}`;
    });
    return { ok: true, frames: local };
  });
  ipcMain.handle("win:resolution", (_e, res) => { if (RESOLUTIONS.includes(res)) applyResolution(res); return true; });
  ipcMain.handle("win:quit", () => { if (gameWin) gameWin.close(); return true; });
  ipcMain.handle("telemetry:error", (_e, err) => { log.warn("[renderer]", err); return true; });
  ipcMain.handle("telemetry:event", () => true);

  ipcMain.handle("desktop:launch", (_e, payload) => {
    desktop.launch({ ...payload, aiEnabled: ak.enabled, automation: AUTOMATION });
    return true;
  });
  ipcMain.handle("ai:postcard", () => ({ ok: false }));
  ipcMain.handle("postcard:ensure", (_e, c) => {
    const id = String(c?.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    return !!id && fs.existsSync(path.join(app.getPath("userData"), "postcards", `${id}.png`));
  });
  ipcMain.handle("desktop:active", () => desktop.active);
  ipcMain.handle("pet:ignore", (_e, v) => { desktop.setIgnore(v); return true; });
  ipcMain.handle("pet:focusable", (_e, v) => { desktop.setFocusable(v); return true; });
  ipcMain.handle("pet:drop", (_e, pt) => desktop.drop(pt));
}

// ---------- automation (verification only; enabled with --hlo-automation) ----------
function startAutomation() {
  const port = Number(process.env.HLO_AUTOMATION_PORT || 47821);
  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type }); res.end(body); };
    try {
      if (req.headers.authorization !== `Bearer ${TEST_TOKEN}`) return send(403, "{}");
      const u = new URL(req.url, "http://127.0.0.1");
      let body = "";
      for await (const chunk of req) body += chunk;
      const target = u.pathname.endsWith("-desktop") ? (desktop.active ? desktop.win : null) : gameWin;
      if (!target) return send(404, JSON.stringify({ error: "window not available" }));
      if (u.pathname.startsWith("/eval")) {
        // the desktop overlay closes itself when the pet is dropped home: answer instead of hanging
        const contents = target.webContents;
        let onDestroyed;
        const gone = new Promise((resolve) => {
          onDestroyed = () => resolve({ closed: true });
          contents.once("destroyed", onDestroyed);
        });
        try {
          const r = await Promise.race([contents.executeJavaScript(body, true), gone]);
          return send(200, JSON.stringify({ result: r ?? null }));
        } finally {
          contents.removeListener("destroyed", onDestroyed);
        }
      }
      if (u.pathname.startsWith("/capture")) {
        const img = await target.webContents.capturePage();
        return send(200, img.toPNG(), "image/png");
      }
      if (u.pathname === "/size") {
        const [w, h] = (u.searchParams.get("r") || "1920x1080").split("x").map(Number);
        await leaveFullScreen();
        // captures are compared 1:1 with the samples: use the primary display (where the window fits)
        const prim = screen.getPrimaryDisplay();
        if (screen.getDisplayMatching(gameWin.getBounds()).id !== prim.id) {
          gameWin.setPosition(prim.workArea.x + 40, prim.workArea.y + 40);
          await sleep(300);
        }
        const sf = screen.getDisplayMatching(gameWin.getBounds()).scaleFactor || 1;
        gameWin.setContentSize(Math.round(w / sf), Math.round(h / sf));
        await sleep(400);
        return send(200, JSON.stringify({ content: gameWin.getContentBounds(), sf }));
      }
      if (u.pathname === "/fullscreen") {
        if (u.searchParams.get("on") === "1") gameWin.setFullScreen(true); else await leaveFullScreen();
        await sleep(700);
        const d = screen.getDisplayMatching(gameWin.getBounds());
        return send(200, JSON.stringify({ fullscreen: gameWin.isFullScreen(), content: gameWin.getContentBounds(), display: d.bounds }));
      }
      if (u.pathname === "/will-resize") {
        // feeds the aspect lock a manual-resize request (as Windows sends it while a border is dragged)
        const ob = gameWin.getBounds(), edge = u.searchParams.get("edge") || "right";
        const dw = Number(u.searchParams.get("dw") || 0), dh = Number(u.searchParams.get("dh") || 0);
        const nb = { x: edge.includes("left") ? ob.x - dw : ob.x, y: edge.includes("top") ? ob.y - dh : ob.y, width: ob.width + dw, height: ob.height + dh };
        let prevented = false;
        gameWin.emit("will-resize", { preventDefault: () => { prevented = true; } }, nb, { edge });
        await sleep(250);
        return send(200, JSON.stringify({ prevented, before: ob, content: gameWin.getContentBounds(), outer: gameWin.getBounds() }));
      }
      if (u.pathname === "/focus") {
        if (gameWin.isMinimized()) gameWin.restore();
        gameWin.setAlwaysOnTop(false);
        gameWin.setAlwaysOnTop(true, "screen-saver");
        gameWin.show();
        gameWin.moveTop();
        gameWin.focus();
        return send(200, "{}");
      }
      if (u.pathname === "/drop-point") {
        const cb = gameWin.getContentBounds();
        for (const v of [0.5, 0.25, 0.75, 0.12, 0.88]) for (const u of [0.5, 0.25, 0.75, 0.12, 0.88]) {
          const x = cb.x + cb.width * u, y = cb.y + cb.height * v;
          if (!desktop.coveredAt(x, y, gameWin)) {
            const { bounds } = desktop.display;
            return send(200, JSON.stringify({ x: x - bounds.x, y: y - bounds.y }));
          }
        }
        return send(409, JSON.stringify({ error: "Game is covered" }));
      }
      if (u.pathname === "/info") {
        const gameHwnd = hwndOf(gameWin);
        const windows = IS_MAC ? [] : listWindows();
        log.info("[qa] native windows", { count: windows.length, explorer: windows.filter(w => w.explorer).length, game: windows.some(w => w.hwnd === gameHwnd), gameRect: IS_MAC ? null : windowRect(gameHwnd) });
        return send(200, JSON.stringify({ displays: screen.getAllDisplays().map((d) => ({ bounds: d.bounds, workArea: d.workArea, sf: d.scaleFactor })), game: gameWin.getContentBounds(), desktop: desktop.active, overlay: desktop.active ? desktop.win.getBounds() : null, visible: gameWin.isVisible(), minimized: gameWin.isMinimized(), audible: gameWin.webContents.isCurrentlyAudible() }));
      }
      if (u.pathname === "/cursor") {
        // stands in for the real pointer on macOS, so checks neither depend on nor touch the player's mouse
        desktop.cursorOverride = u.searchParams.has("x") ? { x: Number(u.searchParams.get("x")), y: Number(u.searchParams.get("y")) } : null;
        return send(200, "{}");
      }
      if (u.pathname === "/reload") { await target.webContents.session.clearCache(); target.webContents.reloadIgnoringCache(); return send(200, "{}"); }
      if (u.pathname === "/quit") { send(200, "{}"); gameWin.close(); return; }
      send(404, "{}");
    } catch (e) { send(500, JSON.stringify({ error: String(e && e.stack || e) })); }
  });
  server.listen(port, "127.0.0.1", () => log.info(`[automation] listening on 127.0.0.1:${port}`));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

app.on("second-instance", () => { if (gameWin) { if (gameWin.isMinimized()) gameWin.restore(); gameWin.focus(); } });
// macOS: clicking the Dock icon brings a minimised game window back
app.on("activate", () => { if (gameWin && !gameWin.isDestroyed() && gameWin.isMinimized()) gameWin.restore(); });

app.whenReady().then(async () => {
  protocol.handle("app", async (req) => {
    const p = resolveAppPath(new URL(req.url).pathname);
    if (!p || !fs.existsSync(p)) return new Response("not found", { status: 404 });
    const r = await net.fetch(pathToFileURL(p).toString());
    const headers = new Headers(r.headers);
    headers.set("Cache-Control", "no-store");   // local files: never serve a stale module after an update
    return new Response(r.body, { status: r.status, headers });
  });
  // macOS routes Cmd+Q and Cmd+C/V/X through the menu bar, so it keeps the standard menus (no reload / dev tools)
  Menu.setApplicationMenu(IS_MAC ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null);
  if (IS_MAC && !app.isPackaged) app.dock.setIcon(path.join(ROOT, "assets", "extracted", "app_icon.png"));
  // source runs only; verification mode skips it so test runs never spend credits or send anything out
  if (!app.isPackaged && !AUTOMATION) { try { process.loadEnvFile(path.join(ROOT, ".env")); } catch { /* no .env: plays offline */ } }
  cfg = loadConfig(dataDir);
  if (AUTOMATION) cfg.akarion.apiKey = "";
  ak = new Akarion(cfg, log);
  store = new SaveStore(dataDir);
  desktop = new DesktopPet({
    pageUrl: "app://pet/src/desktop/desktop.html",
    preload: path.join(__dirname, "preload-desktop.js"),
    getGameWindow: () => gameWin,
    onReturn: (pt) => { if (gameWin && !gameWin.isDestroyed()) gameWin.webContents.send("desktop:returned", pt); },
    log,
  });
  setupIpc();
  const saved = store.readLocal();
  createGameWindow(AUTOMATION ? "1920x1080" : pickResolution(saved && saved.settings && saved.settings.resolution));
  if (AUTOMATION) startAutomation();
  process.on("uncaughtException", (e) => log.error(e));
});

app.on("window-all-closed", () => app.quit());
