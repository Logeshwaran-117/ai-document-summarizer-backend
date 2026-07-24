/**
 * ThemeRegistry.js
 * Comprehensive palette definitions supporting all UI Wizard theme options (Light, Dark, Corporate, Glassmorphism, etc.).
 */

const THEME_PALETTES = {
  // Dark Themes
  Professional:     { background: "#0F1B38", primary: "#F5A623", secondary: "#008080", text: "#FFFFFF", textDark: "#0F1B38", cardBg: "#1A2B50", cardBorder: "#2A3B60", muted: "#8099C0", isLight: false },
  "Navy Gold":       { background: "#0F1B38", primary: "#F5A623", secondary: "#008080", text: "#FFFFFF", textDark: "#0F1B38", cardBg: "#1A2B50", cardBorder: "#2A3B60", muted: "#8099C0", isLight: false },
  "Amber Grid":      { background: "#1B2A52", primary: "#F5A623", secondary: "#E67E22", text: "#FFFFFF", textDark: "#1B2A52", cardBg: "#243763", cardBorder: "#344B83", muted: "#8FA5D4", isLight: false },
  Government:        { background: "#1B2A52", primary: "#F5A623", secondary: "#2A9D8F", text: "#FFFFFF", textDark: "#1B2A52", cardBg: "#243763", cardBorder: "#344B83", muted: "#8FA5D4", isLight: false },
  
  Modern:            { background: "#0D1B2A", primary: "#00B4D8", secondary: "#0077B6", text: "#FFFFFF", textDark: "#0D1B2A", cardBg: "#1B2A4A", cardBorder: "#2B3A5A", muted: "#8099C0", isLight: false },
  "AI Futuristic":   { background: "#0D1B2A", primary: "#00FFF5", secondary: "#7B2CBF", text: "#FFFFFF", textDark: "#0D1B2A", cardBg: "#18283B", cardBorder: "#00FFF555", muted: "#7090B0", isLight: false },
  
  Minimal:           { background: "#0F3D3E", primary: "#3FBFAE", secondary: "#1F7A72", text: "#FFFFFF", textDark: "#17302F", cardBg: "#1A4D4E", cardBorder: "#2A5D5E", muted: "#6E8E8C", isLight: false },
  Healthcare:        { background: "#0F3D3E", primary: "#3FBFAE", secondary: "#2A9D8F", text: "#FFFFFF", textDark: "#17302F", cardBg: "#1A4D4E", cardBorder: "#2A5D5E", muted: "#6E8E8C", isLight: false },
  
  Dark:              { background: "#0F0F0F", primary: "#C0392B", secondary: "#E67E22", text: "#FFFFFF", textDark: "#0F0F0F", cardBg: "#1F1F1F", cardBorder: "#2F2F2F", muted: "#808080", isLight: false },
  "Dark Mode":       { background: "#0F0F0F", primary: "#C0392B", secondary: "#E67E22", text: "#FFFFFF", textDark: "#0F0F0F", cardBg: "#1F1F1F", cardBorder: "#2F2F2F", muted: "#808080", isLight: false },
  Luxury:            { background: "#1A0A2E", primary: "#C9A84C", secondary: "#E6C687", text: "#FFFFFF", textDark: "#1A0A2E", cardBg: "#291543", cardBorder: "#C9A84C44", muted: "#9D88B3", isLight: false },
  
  Corporate:         { background: "#1A1A2E", primary: "#7C3AED", secondary: "#06B6D4", text: "#FFFFFF", textDark: "#1A1A2E", cardBg: "#2A2A4E", cardBorder: "#3A3A5E", muted: "#8A80B0", isLight: false },
  "MS Fluent":       { background: "#004E8C", primary: "#0078D4", secondary: "#50E6FF", text: "#FFFFFF", textDark: "#004E8C", cardBg: "#005DA6", cardBorder: "#0078D488", muted: "#99CCFF", isLight: false },
  "Microsoft Fluent": { background: "#004E8C", primary: "#0078D4", secondary: "#50E6FF", text: "#FFFFFF", textDark: "#004E8C", cardBg: "#005DA6", cardBorder: "#0078D488", muted: "#99CCFF", isLight: false },
  Glassmorphism:     { background: "#1E2761", primary: "#C9A84C", secondary: "#4361EE", text: "#FFFFFF", textDark: "#1E2761", cardBg: "#2A367C", cardBorder: "#FFFFFF33", muted: "#9AA5D1", isLight: false },
  Finance:           { background: "#0A192F", primary: "#D4AF37", secondary: "#10B981", text: "#FFFFFF", textDark: "#0A192F", cardBg: "#112240", cardBorder: "#233554", muted: "#8892B0", isLight: false },
  Creative:          { background: "#1B4332", primary: "#F4A261", secondary: "#2A9D8F", text: "#FFFFFF", textDark: "#1B4332", cardBg: "#2D6A4F", cardBorder: "#40916C", muted: "#74C69D", isLight: false },
  Education:         { background: "#1B4332", primary: "#F4A261", secondary: "#E9C46A", text: "#FFFFFF", textDark: "#1B4332", cardBg: "#2D6A4F", cardBorder: "#40916C", muted: "#74C69D", isLight: false },

  // Light Themes
  "Light Mode":      { background: "#F8FAFC", primary: "#2563EB", secondary: "#0D9488", text: "#0F172A", textDark: "#FFFFFF", cardBg: "#FFFFFF", cardBorder: "#E2E8F0", muted: "#64748B", isLight: true },
  "Clean Light":     { background: "#F8FAFC", primary: "#2563EB", secondary: "#0D9488", text: "#0F172A", textDark: "#FFFFFF", cardBg: "#FFFFFF", cardBorder: "#E2E8F0", muted: "#64748B", isLight: true },
  Apple:             { background: "#F2F2F7", primary: "#007AFF", secondary: "#5856D6", text: "#1C1C1E", textDark: "#FFFFFF", cardBg: "#FFFFFF", cardBorder: "#E5E5EA", muted: "#8E8E93", isLight: true },
};

function resolveThemePalette(themeInput) {
  if (!themeInput) return THEME_PALETTES.Professional;
  const key = String(themeInput).trim();
  
  if (THEME_PALETTES[key]) return THEME_PALETTES[key];
  
  const lowerKey = key.toLowerCase();
  for (const [name, palette] of Object.entries(THEME_PALETTES)) {
    if (name.toLowerCase() === lowerKey || lowerKey.includes(name.toLowerCase()) || name.toLowerCase().includes(lowerKey)) {
      return palette;
    }
  }

  if (lowerKey.includes("light") || lowerKey.includes("white") || lowerKey.includes("clean") || lowerKey.includes("apple")) {
    return THEME_PALETTES["Light Mode"];
  }

  return THEME_PALETTES.Professional;
}

module.exports = {
  THEME_PALETTES,
  resolveThemePalette,
};
