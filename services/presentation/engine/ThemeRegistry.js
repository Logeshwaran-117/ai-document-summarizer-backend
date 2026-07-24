/**
 * ThemeRegistry.js
 * Master palette definitions supporting all UI Wizard theme options (Light, Dark, Corporate, Glassmorphism, etc.).
 * Exports palettes for both PPTX native (hex without #) and SVG/CSS (hex with #).
 */

const THEME_PALETTES = {
  Professional: {
    name: "Professional", label: "Executive (McKinsey)",
    background: "#FAFBFF", bgDark: "#0F1B38", bgLight: "#FAFBFF", bgMid: "#EEF4FF",
    primary: "#0F1B38", secondary: "#008080", accent: "#F5A623", teal: "#008080",
    text: "#0F1B38", textLight: "#FFFFFF", textDark: "#0F1B38", textMuted: "#4A5A7A",
    cardBg: "#FFFFFF", cardAlt: "#F0F4FA", cardBorder: "#DDE4F5", border: "#DDE4F5",
    highlightBg: "#EBF3FF", highlightBorder: "#0F1B38",
    chartColors: ["#0F1B38", "#F5A623", "#008080", "#E74C3C", "#8E44AD", "#2ECC71"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  "Navy Gold": {
    name: "Navy Gold", label: "Navy & Gold",
    background: "#F7F9FC", bgDark: "#1E2761", bgLight: "#F7F9FC", bgMid: "#EEF4FF",
    primary: "#1E2761", secondary: "#2FA4A0", accent: "#C9A84C", teal: "#2FA4A0",
    text: "#1A1A2E", textLight: "#FFFFFF", textDark: "#1A1A2E", textMuted: "#5A6A8A",
    cardBg: "#FFFFFF", cardAlt: "#EEF4FF", cardBorder: "#E0E8F0", border: "#E0E8F0",
    highlightBg: "#FFF9E6", highlightBorder: "#C9A84C",
    chartColors: ["#1E2761", "#C9A84C", "#2FA4A0", "#E74C3C", "#8E44AD", "#2ECC71"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  Modern: {
    name: "Modern", label: "Midnight Blue",
    background: "#F0F6FF", bgDark: "#0D1B2A", bgLight: "#F0F6FF", bgMid: "#E0EEFF",
    primary: "#0D1B2A", secondary: "#0077B6", accent: "#00B4D8", teal: "#0077B6",
    text: "#0D1B2A", textLight: "#FFFFFF", textDark: "#0D1B2A", textMuted: "#4A6080",
    cardBg: "#FFFFFF", cardAlt: "#E0EEFF", cardBorder: "#C8DCFF", border: "#C8DCFF",
    highlightBg: "#E0F7FF", highlightBorder: "#00B4D8",
    chartColors: ["#0D1B2A", "#00B4D8", "#0077B6", "#E63946", "#2A9D8F", "#E9C46A"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  Minimal: {
    name: "Minimal", label: "Teal & Slate",
    background: "#F5FAFA", bgDark: "#0F3D3E", bgLight: "#F5FAFA", bgMid: "#E6F5F3",
    primary: "#0F3D3E", secondary: "#1F7A72", accent: "#3FBFAE", teal: "#1F7A72",
    text: "#17302F", textLight: "#FFFFFF", textDark: "#17302F", textMuted: "#4E6E6C",
    cardBg: "#FFFFFF", cardAlt: "#E6F5F3", cardBorder: "#D6EAE8", border: "#D6EAE8",
    highlightBg: "#E6F9F6", highlightBorder: "#3FBFAE",
    chartColors: ["#0F3D3E", "#3FBFAE", "#F39C12", "#E74C3C", "#8E44AD", "#2ECC71"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  Corporate: {
    name: "Corporate", label: "Corporate Purple",
    background: "#F8F7FF", bgDark: "#1A1A2E", bgLight: "#F8F7FF", bgMid: "#EEE8FF",
    primary: "#1A1A2E", secondary: "#6D28D9", accent: "#7C3AED", teal: "#06B6D4",
    text: "#1A1A2E", textLight: "#FFFFFF", textDark: "#1A1A2E", textMuted: "#5A5080",
    cardBg: "#FFFFFF", cardAlt: "#EEE8FF", cardBorder: "#DDD0FF", border: "#DDD0FF",
    highlightBg: "#F3E8FF", highlightBorder: "#7C3AED",
    chartColors: ["#1A1A2E", "#7C3AED", "#06B6D4", "#EF4444", "#10B981", "#F59E0B"],
    fonts: { title: "Consolas", body: "Calibri" }, isLight: true,
  },
  Creative: {
    name: "Creative", label: "Forest & Amber",
    background: "#F6FDF9", bgDark: "#1B4332", bgLight: "#F6FDF9", bgMid: "#E8F5EE",
    primary: "#1B4332", secondary: "#40916C", accent: "#F4A261", teal: "#40916C",
    text: "#1B4332", textLight: "#FFFFFF", textDark: "#1B4332", textMuted: "#4A7C59",
    cardBg: "#FFFFFF", cardAlt: "#E8F5EE", cardBorder: "#C8E6D4", border: "#C8E6D4",
    highlightBg: "#FFF4E6", highlightBorder: "#F4A261",
    chartColors: ["#1B4332", "#F4A261", "#40916C", "#E63946", "#457B9D", "#E9C46A"],
    fonts: { title: "Georgia", body: "Calibri" }, isLight: true,
  },
  Finance: {
    name: "Finance", label: "Financial & Banking",
    background: "#F8F6EE", bgDark: "#0A2342", bgLight: "#F8F6EE", bgMid: "#EEE8D4",
    primary: "#0A2342", secondary: "#B8960C", accent: "#D4AF37", teal: "#10B981",
    text: "#0A2342", textLight: "#FFFFFF", textDark: "#0A2342", textMuted: "#4A5068",
    cardBg: "#FFFFFF", cardAlt: "#EEE8D4", cardBorder: "#DDD0A0", border: "#DDD0A0",
    highlightBg: "#FFFDF0", highlightBorder: "#D4AF37",
    chartColors: ["#0A2342", "#D4AF37", "#10B981", "#FFC014", "#F43F5E"],
    fonts: { title: "Georgia", body: "Calibri" }, isLight: true,
  },
  Healthcare: {
    name: "Healthcare", label: "Healthcare & Life Sciences",
    background: "#F4FBF8", bgDark: "#1B3A4B", bgLight: "#F4FBF8", bgMid: "#E0F2EC",
    primary: "#1B3A4B", secondary: "#40916C", accent: "#52B788", teal: "#1F7A72",
    text: "#1B3A4B", textLight: "#FFFFFF", textDark: "#1B3A4B", textMuted: "#456070",
    cardBg: "#FFFFFF", cardAlt: "#E0F2EC", cardBorder: "#C0E0D4", border: "#C0E0D4",
    highlightBg: "#E8FAF4", highlightBorder: "#52B788",
    chartColors: ["#1B3A4B", "#52B788", "#40916C", "#E76F51", "#457B9D"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  Dark: {
    name: "Dark", label: "Charcoal & Ruby",
    background: "#0F0F0F", bgDark: "#0F0F0F", bgLight: "#1F1F1F", bgMid: "#2D2D2D",
    primary: "#F5A623", secondary: "#E67E22", accent: "#C0392B", teal: "#008080",
    text: "#FFFFFF", textLight: "#FFFFFF", textDark: "#0F0F0F", textMuted: "#9E9E9E",
    cardBg: "#1F1F1F", cardAlt: "#2D2D2D", cardBorder: "#3D3D3D", border: "#3D3D3D",
    highlightBg: "#3A1F1F", highlightBorder: "#C0392B",
    chartColors: ["#C0392B", "#F5A623", "#E67E22", "#27AE60", "#2980B9"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: false,
  },
  "Dark Mode": {
    name: "Dark Mode", label: "Dark Executive",
    background: "#090F1E", bgDark: "#090F1E", bgLight: "#0F1B38", bgMid: "#162544",
    primary: "#F5A623", secondary: "#00B4D8", accent: "#F5A623", teal: "#00B4D8",
    text: "#FFFFFF", textLight: "#FFFFFF", textDark: "#090F1E", textMuted: "#94A3B8",
    cardBg: "#142448", cardAlt: "#182A50", cardBorder: "#2A3B60", border: "#2A3B60",
    highlightBg: "#1B3260", highlightBorder: "#F5A623",
    chartColors: ["#F5A623", "#00B4D8", "#2ECC71", "#E74C3C", "#9B59B6"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: false,
  },
  "Light Mode": {
    name: "Light Mode", label: "Clean Light",
    background: "#F8FAFC", bgDark: "#0F1B38", bgLight: "#F8FAFC", bgMid: "#EEF2F6",
    primary: "#0F1B38", secondary: "#0D9488", accent: "#2563EB", teal: "#0D9488",
    text: "#0F172A", textLight: "#FFFFFF", textDark: "#0F172A", textMuted: "#64748B",
    cardBg: "#FFFFFF", cardAlt: "#F1F5F9", cardBorder: "#E2E8F0", border: "#E2E8F0",
    highlightBg: "#EFF6FF", highlightBorder: "#2563EB",
    chartColors: ["#0F1B38", "#2563EB", "#0D9488", "#F59E0B", "#EF4444"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  Glassmorphism: {
    name: "Glassmorphism", label: "Glassmorphism",
    background: "#1E2761", bgDark: "#1E2761", bgLight: "#2A367C", bgMid: "#364596",
    primary: "#C9A84C", secondary: "#4361EE", accent: "#C9A84C", teal: "#4361EE",
    text: "#FFFFFF", textLight: "#FFFFFF", textDark: "#1E2761", textMuted: "#9AA5D1",
    cardBg: "#2A367C", cardAlt: "#364596", cardBorder: "#FFFFFF33", border: "#FFFFFF33",
    highlightBg: "#3A4B9C", highlightBorder: "#C9A84C",
    chartColors: ["#C9A84C", "#4361EE", "#7209B7", "#4CC9F0", "#F72585"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: false,
  },
  Apple: {
    name: "Apple", label: "Apple Minimal",
    background: "#F2F2F7", bgDark: "#1C1C1E", bgLight: "#F2F2F7", bgMid: "#E5E5EA",
    primary: "#1C1C1E", secondary: "#5856D6", accent: "#007AFF", teal: "#5856D6",
    text: "#1C1C1E", textLight: "#FFFFFF", textDark: "#1C1C1E", textMuted: "#8E8E93",
    cardBg: "#FFFFFF", cardAlt: "#E5E5EA", cardBorder: "#D1D1D6", border: "#D1D1D6",
    highlightBg: "#E5F1FF", highlightBorder: "#007AFF",
    chartColors: ["#007AFF", "#5856D6", "#34C759", "#FF9500", "#FF2D55"],
    fonts: { title: "Calibri", body: "Calibri" }, isLight: true,
  },
  "Microsoft Fluent": {
    name: "Microsoft Fluent", label: "MS Fluent",
    background: "#F3F3F3", bgDark: "#004E8C", bgLight: "#F3F3F3", bgMid: "#EDEBE9",
    primary: "#004E8C", secondary: "#0078D4", accent: "#0078D4", teal: "#50E6FF",
    text: "#201F1E", textLight: "#FFFFFF", textDark: "#201F1E", textMuted: "#605E5C",
    cardBg: "#FFFFFF", cardAlt: "#EDEBE9", cardBorder: "#E1DFDD", border: "#E1DFDD",
    highlightBg: "#EFF6FC", highlightBorder: "#0078D4",
    chartColors: ["#0078D4", "#004E8C", "#50E6FF", "#107C41", "#D13438"],
    fonts: { title: "Calibri", body: "Calibri" }, isLight: true,
  },
  "Amber Grid": {
    name: "Amber Grid", label: "Amber Grid",
    background: "#FBF9F5", bgDark: "#1B2A52", bgLight: "#FBF9F5", bgMid: "#F3EEE3",
    primary: "#1B2A52", secondary: "#E67E22", accent: "#F5A623", teal: "#2A9D8F",
    text: "#1B2A52", textLight: "#FFFFFF", textDark: "#1B2A52", textMuted: "#6E7A96",
    cardBg: "#FFFFFF", cardAlt: "#F3EEE3", cardBorder: "#E4DCCF", border: "#E4DCCF",
    highlightBg: "#FFF6E5", highlightBorder: "#F5A623",
    chartColors: ["#1B2A52", "#F5A623", "#E67E22", "#2A9D8F", "#E74C3C"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  Government: {
    name: "Government", label: "Government / Institutional",
    background: "#FAFBFC", bgDark: "#0F1B38", bgLight: "#FAFBFC", bgMid: "#EEF3F8",
    primary: "#0F1B38", secondary: "#2A9D8F", accent: "#F5A623", teal: "#008080",
    text: "#0F1B38", textLight: "#FFFFFF", textDark: "#0F1B38", textMuted: "#4A5A7A",
    cardBg: "#FFFFFF", cardAlt: "#F0F4FA", cardBorder: "#DDE4F5", border: "#DDE4F5",
    highlightBg: "#EBF3FF", highlightBorder: "#0F1B38",
    chartColors: ["#0F1B38", "#F5A623", "#008080", "#E74C3C", "#2A9D8F"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: true,
  },
  Luxury: {
    name: "Luxury", label: "Luxury Gold",
    background: "#1A0A2E", bgDark: "#1A0A2E", bgLight: "#291543", bgMid: "#381E59",
    primary: "#C9A84C", secondary: "#E6C687", accent: "#C9A84C", teal: "#E6C687",
    text: "#FFFFFF", textLight: "#FFFFFF", textDark: "#1A0A2E", textMuted: "#9D88B3",
    cardBg: "#291543", cardAlt: "#381E59", cardBorder: "#C9A84C44", border: "#C9A84C44",
    highlightBg: "#3A1E5C", highlightBorder: "#C9A84C",
    chartColors: ["#C9A84C", "#E6C687", "#9D88B3", "#D4AF37", "#B8960C"],
    fonts: { title: "Cambria", body: "Calibri" }, isLight: false,
  },
};

// Aliases mapping user/wizard strings to canonical keys
const THEME_ALIASES = {
  navygold: "Navy Gold",
  navy: "Navy Gold",
  professional: "Professional",
  executive: "Professional",
  modern: "Modern",
  midnightblue: "Modern",
  minimal: "Minimal",
  tealslate: "Minimal",
  corporate: "Corporate",
  corporatepurple: "Corporate",
  creative: "Creative",
  forestgreen: "Creative",
  dark: "Dark",
  charcoalruby: "Dark",
  darkexecutive: "Dark Mode",
  darkmode: "Dark Mode",
  lightmode: "Light Mode",
  lightexecutive: "Light Mode",
  cleanlight: "Light Mode",
  finance: "Finance",
  financegold: "Finance",
  healthcare: "Healthcare",
  healthcaremint: "Healthcare",
  ambergrid: "Amber Grid",
  government: "Government",
  glassmorphism: "Glassmorphism",
  apple: "Apple",
  msfluent: "Microsoft Fluent",
  microsoftfluent: "Microsoft Fluent",
  luxury: "Luxury",
  aifuturistic: "Dark Mode",
};

function resolveThemePalette(themeInput) {
  if (!themeInput) return THEME_PALETTES.Professional;
  const rawKey = String(themeInput).trim();
  if (THEME_PALETTES[rawKey]) return THEME_PALETTES[rawKey];

  const clean = rawKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (THEME_ALIASES[clean] && THEME_PALETTES[THEME_ALIASES[clean]]) {
    return THEME_PALETTES[THEME_ALIASES[clean]];
  }

  for (const [name, palette] of Object.entries(THEME_PALETTES)) {
    if (name.toLowerCase() === rawKey.toLowerCase() || rawKey.toLowerCase().includes(name.toLowerCase())) {
      return palette;
    }
  }

  if (clean.includes("dark") || clean.includes("night") || clean.includes("black")) {
    return THEME_PALETTES["Dark Mode"];
  }

  return THEME_PALETTES.Professional;
}

/**
 * Returns a PPTX-compatible palette (hex strings WITHOUT leading '#')
 */
function resolvePptxTheme(themeInput) {
  const pal = resolveThemePalette(themeInput);
  const cleanHex = (h) => (h || "").replace(/^#/, "");
  return {
    label: pal.label,
    primary: cleanHex(pal.primary),
    secondary: cleanHex(pal.secondary),
    bgDark: cleanHex(pal.bgDark),
    bgLight: cleanHex(pal.bgLight),
    bgMid: cleanHex(pal.bgMid),
    accent: cleanHex(pal.accent),
    teal: cleanHex(pal.teal),
    textLight: cleanHex(pal.textLight),
    textDark: cleanHex(pal.textDark),
    textMuted: cleanHex(pal.textMuted),
    cardBg: cleanHex(pal.cardBg),
    cardAlt: cleanHex(pal.cardAlt),
    border: cleanHex(pal.cardBorder),
    highlightBg: cleanHex(pal.highlightBg),
    highlightBorder: cleanHex(pal.highlightBorder),
    chart1: cleanHex(pal.chartColors[0]),
    chart2: cleanHex(pal.chartColors[1]),
    chart3: cleanHex(pal.chartColors[2]),
    chart4: cleanHex(pal.chartColors[3]),
    chart5: cleanHex(pal.chartColors[4]),
    chart6: cleanHex(pal.chartColors[5] || pal.chartColors[0]),
    chart7: cleanHex(pal.chartColors[6] || pal.chartColors[1]),
    chart8: cleanHex(pal.chartColors[7] || pal.chartColors[2]),
    chartColors: pal.chartColors.map(cleanHex),
    fonts: pal.fonts,
    isDark: !pal.isLight,
  };
}

module.exports = {
  THEME_PALETTES,
  resolveThemePalette,
  resolvePptxTheme,
};

