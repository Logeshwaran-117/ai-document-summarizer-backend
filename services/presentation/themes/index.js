/**
 * themes/index.js
 * Theme registry and asset pack resolver.
 */

const { assetPacks, getAssetPack } = require("./assetPacks");
const executiveTheme = require("./executive");

const themeRegistry = {
  executive: executiveTheme,
  ...assetPacks,
};

function resolveTheme(themeName = "executive") {
  const key = String(themeName).toLowerCase();
  if (themeRegistry[key]) return themeRegistry[key].colors ? themeRegistry[key] : getAssetPack(key);
  return getAssetPack("executive");
}

module.exports = {
  resolveTheme,
  getAssetPack,
  themeRegistry,
};
