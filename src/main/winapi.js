// Win32 top-level window enumeration (z-order, visible frame bounds) via koffi.
// Used by the desktop pet so it can stand on the top edges of real application windows
// (File Explorer and any other normal window), respecting which windows cover which.
"use strict";

let api = null;
function load() {
  if (api) return api;
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const dwmapi = koffi.load("dwmapi.dll");
  const RECT = koffi.struct("HLO_RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
  api = {
    koffi,
    GetTopWindow: user32.func("intptr_t __stdcall GetTopWindow(intptr_t hWnd)"),
    GetWindow: user32.func("intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t uCmd)"),
    IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(intptr_t hWnd)"),
    IsIconic: user32.func("bool __stdcall IsIconic(intptr_t hWnd)"),
    GetWindowLongPtrW: user32.func("intptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int nIndex)"),
    GetClassNameW: user32.func("int __stdcall GetClassNameW(intptr_t hWnd, _Out_ char16_t *lpClassName, int nMaxCount)"),
    GetWindowTextLengthW: user32.func("int __stdcall GetWindowTextLengthW(intptr_t hWnd)"),
    GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32_t *lpdwProcessId)"),
    GetWindowRect: user32.func("bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ HLO_RECT *lpRect)"),
    SetWindowPos: user32.func("bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)"),
    DwmGetWindowAttributeRect: dwmapi.func("int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t dwAttribute, _Out_ HLO_RECT *pvAttribute, uint32_t cbAttribute)"),
    DwmGetWindowAttributeInt: dwmapi.func("int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t dwAttribute, _Out_ int32_t *pvAttribute, uint32_t cbAttribute)"),
    RECT_SIZE: koffi.sizeof(RECT),
  };
  return api;
}

const GW_HWNDNEXT = 2;
const GWL_STYLE = -16, GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80, WS_EX_TRANSPARENT = 0x20, WS_EX_NOACTIVATE = 0x08000000;
const WS_CHILD = 0x40000000;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
const IGNORE_CLASSES = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow",
  "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow", "TopLevelWindowForOverflowXamlIsland", "ForegroundStaging",
  "MultitaskingViewFrame", "TaskListThumbnailWnd", "tooltips_class32", "#32768", "SysShadow", "IME", "MSCTFIME UI"]);

function className(a, hwnd) {
  const buf = Buffer.alloc(512);
  const n = a.GetClassNameW(hwnd, buf, 256);
  return n > 0 ? buf.toString("utf16le", 0, n * 2) : "";
}

/**
 * Returns visible top-level windows from TOP to BOTTOM of the z-order.
 * Rects are physical screen pixels (visible frame, without the invisible resize border).
 */
function listWindows(excludePids = []) {
  const a = load();
  const out = [];
  const exclude = new Set(excludePids.map(Number));
  let hwnd = a.GetTopWindow(0);
  let guard = 0;
  while (hwnd && guard++ < 4096) {
    const h = Number(hwnd);
    try {
      if (a.IsWindowVisible(h) && !a.IsIconic(h)) {
        const style = Number(a.GetWindowLongPtrW(h, GWL_STYLE));
        const ex = Number(a.GetWindowLongPtrW(h, GWL_EXSTYLE));
        if (!(style & WS_CHILD) && !(ex & WS_EX_TRANSPARENT)) {
          const cloaked = [0];
          a.DwmGetWindowAttributeInt(h, DWMWA_CLOAKED, cloaked, 4);
          if (!cloaked[0]) {
            const pid = [0];
            a.GetWindowThreadProcessId(h, pid);
            const cls = className(a, h);
            if (!exclude.has(pid[0]) && !IGNORE_CLASSES.has(cls)) {
              const r = {};
              let ok = a.DwmGetWindowAttributeRect(h, DWMWA_EXTENDED_FRAME_BOUNDS, r, a.RECT_SIZE) === 0;
              if (!ok) ok = a.GetWindowRect(h, r);
              const w = r.right - r.left, hh = r.bottom - r.top;
              const titled = a.GetWindowTextLengthW(h) > 0;
              const tool = (ex & WS_EX_TOOLWINDOW) !== 0;
              if (ok && w >= 120 && hh >= 60 && (titled || !tool)) {
                out.push({ hwnd: h, pid: pid[0], cls, tool, x: r.left, y: r.top, w, h: hh,
                  explorer: cls === "CabinetWClass" || cls === "ExploreWClass" });
              }
            }
          }
        }
      }
    } catch (e) { /* a window can vanish mid-query; skip it */ }
    hwnd = a.GetWindow(h, GW_HWNDNEXT);
  }
  return out;
}

// Window rectangle in physical pixels (incl. the invisible resize border) and a pure move that keeps
// the size untouched: Electron's setPosition re-applies the size rounded to DIP, which drifts by a
// pixel or two at fractional scale factors.
const SWP_NOSIZE = 0x1, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
function windowRect(hwnd) {
  const a = load(), r = {};
  return a.GetWindowRect(hwnd, r) ? { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top } : null;
}
function moveWindow(hwnd, x, y) {
  return load().SetWindowPos(hwnd, 0, Math.round(x), Math.round(y), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
}

module.exports = { listWindows, windowRect, moveWindow };

if (require.main === module) {
  const t0 = process.hrtime.bigint();
  const ws = listWindows([process.pid]);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${ws.length} windows in ${ms.toFixed(1)} ms`);
  for (const w of ws.slice(0, 25)) console.log(JSON.stringify(w));
}
