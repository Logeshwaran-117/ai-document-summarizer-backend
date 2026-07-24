/**
 * themes/index.js
 * Theme registry and asset pack resolver.
 */

const { assetPacks, getAssetPack } = require("./assetPacks");
const { resolvePptxTheme, resolveThemePalette } = require("../engine/ThemeRegistry");

function resolveTheme(themeName = "Professional") {
  return resolvePptxTheme(themeName);
}

module.exports = {
  resolveTheme,
  resolvePptxTheme,
  resolveThemePalette,
  getAssetPack,
  assetPacks,
};

