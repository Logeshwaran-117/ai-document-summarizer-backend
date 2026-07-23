/**
 * assetPacks.js
 * Domain-specific theme asset packs exposing SVG icon sets, accent graphics,
 * decorative shapes, and domain color palettes.
 */

const assetPacks = {
  executive: {
    id: "executive",
    name: "Executive Leadership",
    colors: {
      bgDark: "0F1B38",
      bgLight: "FAFBFF",
      bgMid: "EEF4FF",
      accent: "F5A623",
      teal: "008080",
      textLight: "FFFFFF",
      textDark: "0F1B38",
      textMuted: "4A5A7A",
      cardBg: "FFFFFF",
      cardAlt: "F0F4FA",
      border: "DDE4F5",
      chartColors: ["0F1B38", "F5A623", "008080", "E74C3C", "8E44AD"],
    },
    fonts: {
      title: "Cambria",
      body: "Calibri",
    },
    icons: {
      kpi: "📊",
      chart: "📈",
      summary: "💡",
      recommendation: "🎯",
      process: "⚙️",
      timeline: "📅",
      comparison: "⚖️",
    },
    decorations: {
      headerStrip: true,
      cornerOval: true,
      watermarkLetter: "E",
    },
  },

  banking: {
    id: "banking",
    name: "Financial & Banking",
    colors: {
      bgDark: "0A2540",
      bgLight: "F8FAFC",
      bgMid: "E2E8F0",
      accent: "00D4B2",
      teal: "635BFF",
      textLight: "FFFFFF",
      textDark: "0A2540",
      textMuted: "425466",
      cardBg: "FFFFFF",
      cardAlt: "F1F5F9",
      border: "E2E8F0",
      chartColors: ["0A2540", "00D4B2", "635BFF", "FFC014", "F43F5E"],
    },
    fonts: {
      title: "Georgia",
      body: "Calibri",
    },
    icons: {
      kpi: "💳",
      chart: "📉",
      summary: "💰",
      recommendation: "🔍",
      process: "🔄",
      timeline: "📆",
      comparison: "📊",
    },
    decorations: {
      headerStrip: true,
      cornerOval: false,
      watermarkLetter: "$",
    },
  },

  healthcare: {
    id: "healthcare",
    name: "Healthcare & Life Sciences",
    colors: {
      bgDark: "0F3D3E",
      bgLight: "F6FDF9",
      bgMid: "E8F5EE",
      accent: "3FBFAE",
      teal: "1F7A72",
      textLight: "FFFFFF",
      textDark: "17302F",
      textMuted: "4E6E6C",
      cardBg: "FFFFFF",
      cardAlt: "E8F5EE",
      border: "C8E6D4",
      chartColors: ["0F3D3E", "3FBFAE", "1F7A72", "F39C12", "E74C3C"],
    },
    fonts: {
      title: "Cambria",
      body: "Calibri",
    },
    icons: {
      kpi: "🏥",
      chart: "🩺",
      summary: "📋",
      recommendation: "💊",
      process: "🧬",
      timeline: "🗓️",
      comparison: "🔬",
    },
    decorations: {
      headerStrip: true,
      cornerOval: true,
      watermarkLetter: "+",
    },
  },

  education: {
    id: "education",
    name: "Education & Academic",
    colors: {
      bgDark: "2C3E50",
      bgLight: "F9FBFC",
      bgMid: "EBF2F7",
      accent: "E67E22",
      teal: "2980B9",
      textLight: "FFFFFF",
      textDark: "2C3E50",
      textMuted: "7F8C8D",
      cardBg: "FFFFFF",
      cardAlt: "EBF2F7",
      border: "BDC3C7",
      chartColors: ["2980B9", "E67E22", "27AE60", "8E44AD", "F39C12"],
    },
    fonts: {
      title: "Georgia",
      body: "Calibri",
    },
    icons: {
      kpi: "🎓",
      chart: "📖",
      summary: "📝",
      recommendation: "💡",
      process: "🧠",
      timeline: "⏳",
      comparison: "📚",
    },
    decorations: {
      headerStrip: true,
      cornerOval: false,
      watermarkLetter: "A",
    },
  },

  technology: {
    id: "technology",
    name: "Technology & Software",
    colors: {
      bgDark: "1A1A2E",
      bgLight: "F8F7FF",
      bgMid: "EEE8FF",
      accent: "7C3AED",
      teal: "06B6D4",
      textLight: "FFFFFF",
      textDark: "1A1A2E",
      textMuted: "5A5080",
      cardBg: "FFFFFF",
      cardAlt: "EEE8FF",
      border: "DDD0FF",
      chartColors: ["7C3AED", "06B6D4", "10B981", "EF4444", "F59E0B"],
    },
    fonts: {
      title: "Consolas",
      body: "Calibri",
    },
    icons: {
      kpi: "⚡",
      chart: "💻",
      summary: "🚀",
      recommendation: "🛠️",
      process: "🔄",
      timeline: "🕒",
      comparison: "⚡",
    },
    decorations: {
      headerStrip: true,
      cornerOval: true,
      watermarkLetter: "T",
    },
  },
};

function getAssetPack(packId = "executive") {
  const key = String(packId).toLowerCase();
  return assetPacks[key] || assetPacks.executive;
}

module.exports = {
  assetPacks,
  getAssetPack,
};
