"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hlo", {
  info: () => ipcRenderer.invoke("app:info"),
  loadSave: () => ipcRenderer.invoke("save:load"),
  writeSave: (obj) => ipcRenderer.invoke("save:write", obj),
  chat: (req) => ipcRenderer.invoke("ai:chat", req),
  outfit: (req) => ipcRenderer.invoke("ai:outfit", req),
  storeOutfit: (rec) => ipcRenderer.invoke("outfit:store", rec),
  postcard: (req) => ipcRenderer.invoke("ai:postcard", req),
  ensurePostcard: (c) => ipcRenderer.invoke("postcard:ensure", c),
  setResolution: (r) => ipcRenderer.invoke("win:resolution", r),
  quit: () => ipcRenderer.invoke("win:quit"),
  reportError: (e) => ipcRenderer.invoke("telemetry:error", e),
  event: (type, data) => ipcRenderer.invoke("telemetry:event", type, data),
  launchDesktop: (payload) => ipcRenderer.invoke("desktop:launch", payload),
  desktopActive: () => ipcRenderer.invoke("desktop:active"),
  onDesktopReturn: (cb) => ipcRenderer.on("desktop:returned", (_e, pt) => cb(pt)),
});
