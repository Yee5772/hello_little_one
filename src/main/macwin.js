// macOS top-level window enumeration (z-order, bounds) via CoreGraphics + koffi: the counterpart of winapi.js.
// Used by the desktop pet so it can stand on the top edges of real application windows (Finder and any
// other normal window), respecting which windows cover which. Bounds and owner need no permission: only
// the window title is behind Screen Recording, and it isn't read here.
"use strict";

let api = null;
function load() {
  if (api) return api;
  const koffi = require("koffi");
  const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
  const cg = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
  koffi.struct("HLO_CGRECT", { x: "double", y: "double", w: "double", h: "double" });
  const key = (name) => koffi.decode(cg.symbol(name), "void *");
  const CFStringCreateWithCString = cf.func("void *CFStringCreateWithCString(void *alloc, const char *cStr, uint32_t encoding)");
  api = {
    CGWindowListCopyWindowInfo: cg.func("void *CGWindowListCopyWindowInfo(uint32_t option, uint32_t relativeToWindow)"),
    CGRectMakeWithDictionaryRepresentation: cg.func("bool CGRectMakeWithDictionaryRepresentation(void *dict, _Out_ HLO_CGRECT *rect)"),
    CFArrayGetCount: cf.func("long CFArrayGetCount(void *array)"),
    CFArrayGetValueAtIndex: cf.func("void *CFArrayGetValueAtIndex(void *array, long idx)"),
    CFDictionaryGetValue: cf.func("void *CFDictionaryGetValue(void *dict, void *key)"),
    CFNumberGetValue: cf.func("bool CFNumberGetValue(void *number, long type, _Out_ double *value)"),
    CFEqual: cf.func("bool CFEqual(void *a, void *b)"),
    CFRelease: cf.func("void CFRelease(void *cf)"),
    kNumber: key("kCGWindowNumber"), kLayer: key("kCGWindowLayer"), kBounds: key("kCGWindowBounds"),
    kAlpha: key("kCGWindowAlpha"), kPid: key("kCGWindowOwnerPID"), kOwner: key("kCGWindowOwnerName"),
    FINDER: CFStringCreateWithCString(null, "Finder", kCFStringEncodingUTF8),
  };
  return api;
}

const kCFStringEncodingUTF8 = 0x08000100;
const kCFNumberDoubleType = 13;
const kCGWindowListOptionOnScreenOnly = 1 << 0, kCGWindowListExcludeDesktopElements = 1 << 4;
const NORMAL_LAYER = 0;   // the Dock, the menu bar and always-on-top windows all sit on higher layers

function number(a, dict, key) {
  const out = [0];
  const v = a.CFDictionaryGetValue(dict, key);
  if (v) a.CFNumberGetValue(v, kCFNumberDoubleType, out);
  return out[0];
}

/**
 * Returns visible top-level windows from TOP to BOTTOM of the z-order.
 * Rects are global points with a top-left origin: the same units as Electron's DIP coordinates here.
 */
function listWindows(excludePids = []) {
  const a = load();
  const out = [];
  const exclude = new Set(excludePids.map(Number));
  const list = a.CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0);
  if (!list) return out;
  try {
    const n = a.CFArrayGetCount(list);
    for (let i = 0; i < n; i++) {
      const d = a.CFArrayGetValueAtIndex(list, i);
      if (number(a, d, a.kLayer) !== NORMAL_LAYER || number(a, d, a.kAlpha) <= 0) continue;
      const pid = number(a, d, a.kPid);
      if (exclude.has(pid)) continue;
      const r = {};
      const bounds = a.CFDictionaryGetValue(d, a.kBounds);
      if (!bounds || !a.CGRectMakeWithDictionaryRepresentation(bounds, r) || r.w < 120 || r.h < 60) continue;
      const owner = a.CFDictionaryGetValue(d, a.kOwner);
      out.push({ hwnd: number(a, d, a.kNumber), pid, x: r.x, y: r.y, w: r.w, h: r.h, explorer: !!owner && a.CFEqual(owner, a.FINDER) });
    }
  } finally {
    a.CFRelease(list);
  }
  return out;
}

module.exports = { listWindows };

if (require.main === module) {
  const t0 = process.hrtime.bigint();
  const ws = listWindows([process.pid]);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${ws.length} windows in ${ms.toFixed(1)} ms`);
  for (const w of ws.slice(0, 25)) console.log(JSON.stringify(w));
}
