// AI credentials are read from the local project .env or player config.
"use strict";
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  akarion: {
    baseUrl: "https://akarion.dev",
    projectId: "",
    apiKey: "",
    keyMode: "player", // "development" lets players draw from the developer balance (dev testing only)
  },
  ai: {
    chatModel: "anthropic/claude-haiku-5.5",
    outfitModel: "openai/gpt-image-2.5/sunburst/edit",
    outfitFallbackModel: "google/gemini-3-pro-image",
    postcardModel: "openai/gpt-image-2.5/sunburst/edit",
    postcardFallbackModel: "google/gemini-3-pro-image",
  },
};

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    console.warn("[config] could not parse", file, e.message);
    return null;
  }
}

function merge(base, extra) {
  if (!extra) return base;
  const out = { ...base };
  for (const k of Object.keys(extra)) {
    out[k] = extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k]) ? merge(base[k] || {}, extra[k]) : extra[k];
  }
  return out;
}

function loadConfig(userDataDir) {
  let cfg = merge(DEFAULTS, readJson(path.join(userDataDir, "config.json")));
  const env = process.env;
  if (env.AKARION_API_KEY) cfg.akarion.apiKey = env.AKARION_API_KEY;
  if (env.AKARION_PROJECT_ID) cfg.akarion.projectId = env.AKARION_PROJECT_ID;
  if (env.AKARION_BASE_URL) cfg.akarion.baseUrl = env.AKARION_BASE_URL;
  if (env.AKARION_KEY_MODE) cfg.akarion.keyMode = env.AKARION_KEY_MODE;
  if (env.HLO_CHAT_MODEL) cfg.ai.chatModel = env.HLO_CHAT_MODEL;
  if (env.HLO_OUTFIT_MODEL) cfg.ai.outfitModel = env.HLO_OUTFIT_MODEL;
  cfg.akarion.baseUrl = String(cfg.akarion.baseUrl || DEFAULTS.akarion.baseUrl).replace(/\/+$/, "");
  if (!cfg.akarion.projectId) cfg.akarion.apiKey = "";
  return cfg;
}

module.exports = { loadConfig };
