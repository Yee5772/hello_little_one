"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  onInit: (cb) => ipcRenderer.on("pet:init", (_e, p) => cb(p)),
  onPlatforms: (cb) => ipcRenderer.on("pet:platforms", (_e, p) => cb(p)),
  onCursor: (cb) => ipcRenderer.on("pet:cursor", (_e, p) => cb(p)),
  setIgnore: (v) => ipcRenderer.invoke("pet:ignore", v),
  setFocusable: (v) => ipcRenderer.invoke("pet:focusable", v),
  drop: (pt) => ipcRenderer.invoke("pet:drop", pt),
  chat: (req) => ipcRenderer.invoke("ai:chat", req),
  reportError: (e) => ipcRenderer.invoke("telemetry:error", e),
});
