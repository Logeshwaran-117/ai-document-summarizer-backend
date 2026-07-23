/**
 * themes/index.js — Theme Engine Resolver
 */

const executive = require("./executive");

const THEMES = {
  executive,
  navyGold: executive,
  minimal: { ...executive, name: "minimal", bgDark: "0F3D3E", accent: "3FBFAE" },
  corporate: { ...executive, name: "corporate", bgDark: "1A1A2E", accent: "7C3AED" },
  banking: { ...executive, name: "banking", bgDark: "0A2540", accent: "00D4B2" },
  dark: { ...executive, name: "dark", bgDark: "0F1B38", accent: "F5A623" },
  light: executive,
};

function resolveTheme(key) {
  return THEMES[key] || THEMES.executive;
}

module.exports = { resolveTheme, THEMES };
