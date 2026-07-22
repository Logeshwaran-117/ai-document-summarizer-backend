const express = require("express");
const router = express.Router();
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Presentation = require("../models/Presentation");

const { generatePresentationPlan } = require("../services/presentationAiService");
const { uploadAndExtract } = require("../controllers/pptController");
const upload = require("../middleware/upload");
const Document = require("../models/Document");

router.post("/upload-and-extract", upload.single("file"), uploadAndExtract);

// ── Theme palettes ─────────────────────────────────────────────────────────────
const AI_THEMES = {
  navyGold: {
    label: "Professional",
    bgDark: "1E2761", bgLight: "FAFBFF", bgMid: "EEF4FF",
    accent: "C9A84C", teal: "2FA4A0",
    textLight: "FFFFFF", textDark: "1A1A2E", textMuted: "5A6A8A",
    cardBg: "FFFFFF", cardAlt: "EEF4FF", border: "E0E8F0",
    chart1: "1E2761", chart2: "C9A84C", chart3: "2FA4A0",
    chart4: "E74C3C", chart5: "8E44AD", chart6: "2ECC71",
    chart7: "E67E22", chart8: "1ABC9C",
  },
  midnightBlue: {
    label: "Modern",
    bgDark: "0D1B2A", bgLight: "F0F6FF", bgMid: "E0EEFF",
    accent: "00B4D8", teal: "0077B6",
    textLight: "FFFFFF", textDark: "0D1B2A", textMuted: "4A6080",
    cardBg: "FFFFFF", cardAlt: "E0EEFF", border: "C8DCFF",
    chart1: "0D1B2A", chart2: "00B4D8", chart3: "0077B6",
    chart4: "E63946", chart5: "2A9D8F", chart6: "E9C46A",
    chart7: "F4A261", chart8: "264653",
  },
  tealSlate: {
    label: "Minimal",
    bgDark: "0F3D3E", bgLight: "F5FAFA", bgMid: "E6F5F3",
    accent: "3FBFAE", teal: "1F7A72",
    textLight: "FFFFFF", textDark: "17302F", textMuted: "4E6E6C",
    cardBg: "FFFFFF", cardAlt: "E6F5F3", border: "D6EAE8",
    chart1: "0F3D3E", chart2: "3FBFAE", chart3: "F39C12",
    chart4: "E74C3C", chart5: "8E44AD", chart6: "2ECC71",
    chart7: "E67E22", chart8: "1ABC9C",
  },
  corporatePurple: {
    label: "Corporate",
    bgDark: "1A1A2E", bgLight: "F8F7FF", bgMid: "EEE8FF",
    accent: "7C3AED", teal: "06B6D4",
    textLight: "FFFFFF", textDark: "1A1A2E", textMuted: "5A5080",
    cardBg: "FFFFFF", cardAlt: "EEE8FF", border: "DDD0FF",
    chart1: "1A1A2E", chart2: "7C3AED", chart3: "06B6D4",
    chart4: "EF4444", chart5: "10B981", chart6: "F59E0B",
    chart7: "EC4899", chart8: "14B8A6",
  },
  forestGreen: {
    label: "Creative",
    bgDark: "1B4332", bgLight: "F6FDF9", bgMid: "E8F5EE",
    accent: "F4A261", teal: "40916C",
    textLight: "FFFFFF", textDark: "1B4332", textMuted: "4A7C59",
    cardBg: "FFFFFF", cardAlt: "E8F5EE", border: "C8E6D4",
    chart1: "1B4332", chart2: "F4A261", chart3: "40916C",
    chart4: "E63946", chart5: "457B9D", chart6: "E9C46A",
    chart7: "2A9D8F", chart8: "264653",
  },
  charcoalRuby: {
    label: "Dark",
    bgDark: "0F0F0F", bgLight: "F9F7F7", bgMid: "F0E8E8",
    accent: "C0392B", teal: "8B4513",
    textLight: "FFFFFF", textDark: "0F0F0F", textMuted: "5A4A48",
    cardBg: "FFFFFF", cardAlt: "F0E8E8", border: "E0D0CE",
    chart1: "0F0F0F", chart2: "C0392B", chart3: "E67E22",
    chart4: "27AE60", chart5: "2980B9", chart6: "8E44AD",
    chart7: "F39C12", chart8: "1ABC9C",
  },
  financeGold: {
    label: "Finance",
    bgDark: "0A2342", bgLight: "F8F6EE", bgMid: "EEE8D4",
    accent: "D4AF37", teal: "B8960C",
    textLight: "FFFFFF", textDark: "0A2342", textMuted: "4A5068",
    cardBg: "FFFFFF", cardAlt: "EEE8D4", border: "DDD0A0",
    chart1: "0A2342", chart2: "D4AF37", chart3: "C0A030",
    chart4: "C0392B", chart5: "2E86AB", chart6: "27AE60",
    chart7: "E67E22", chart8: "8E44AD",
  },
  healthcareMint: {
    label: "Healthcare",
    bgDark: "1B3A4B", bgLight: "F4FBF8", bgMid: "E0F2EC",
    accent: "52B788", teal: "40916C",
    textLight: "FFFFFF", textDark: "1B3A4B", textMuted: "456070",
    cardBg: "FFFFFF", cardAlt: "E0F2EC", border: "C0E0D4",
    chart1: "1B3A4B", chart2: "52B788", chart3: "40916C",
    chart4: "E76F51", chart5: "457B9D", chart6: "E9C46A",
    chart7: "2A9D8F", chart8: "264653",
  },
  amberGrid: {
    label: "Amber Grid",
    bgDark: "1B2A52", bgLight: "FAFBFF", bgMid: "EEF2FF",
    accent: "F5A623", teal: "FAB10A",
    textLight: "FFFFFF", textDark: "0F1B38", textMuted: "4A5A7A",
    cardBg: "FFFFFF", cardAlt: "F0F4FF", border: "DDE4F5",
    chart1: "1B2A52", chart2: "F5A623", chart3: "2FA4A0",
    chart4: "E74C3C", chart5: "8E44AD", chart6: "2ECC71",
    chart7: "E67E22", chart8: "1ABC9C",
  },
};

const WIZARD_THEME_MAP = {
  "Professional":     "navyGold",
  "Modern":           "midnightBlue",
  "Minimal":          "tealSlate",
  "Glassmorphism":    "midnightBlue",
  "Apple":            "tealSlate",
  "MS Fluent":        "navyGold",
  "Corporate":        "corporatePurple",
  "Luxury":           "charcoalRuby",
  "Dark":             "charcoalRuby",
  "Creative":         "forestGreen",
  "AI Futuristic":    "midnightBlue",
  "Finance":          "financeGold",
  "Healthcare":       "healthcareMint",
  "Education":        "forestGreen",
  "Amber Grid":       "amberGrid",
  "Government":       "amberGrid",
  "Medical":          "healthcareMint",
};

const DOC_TYPE_THEME_MAP = {
  healthcare_data:   "amberGrid",
  government_report: "amberGrid",
  banking:           "financeGold",
  financial_report:  "financeGold",
  medical_report:    "healthcareMint",
  annual_report:     "navyGold",
  research_paper:    "midnightBlue",
  business_proposal: "navyGold",
};

function resolveAITheme(key, docType) {
  if (docType && DOC_TYPE_THEME_MAP[docType]) {
    return AI_THEMES[DOC_TYPE_THEME_MAP[docType]] || AI_THEMES.navyGold;
  }
  return AI_THEMES[WIZARD_THEME_MAP[key] || key] || AI_THEMES.navyGold;
}

// ── Layout constants ───────────────────────────────────────────────────────────
// Slide = 10" × 5.63". Header occupies 0–1.28". Content: 1.38–5.18". Footer: 5.28+.
const HEADER_H = 1.28;
const CONTENT_Y = 1.38;
const CONTENT_H = 3.80;   // 1.38 → 5.18
const FOOTER_Y  = 5.28;
const SLIDE_W   = 10.0;

// ── Footer ────────────────────────────────────────────────────────────────────
function addAIFooter(s, C, docTitle, idx, total) {
  s.addText(docTitle.slice(0, 55), {
    x: 0.35, y: FOOTER_Y, w: 7.8, h: 0.28,
    fontSize: 8, color: C.textMuted, fontFace: "Calibri",
  });
  s.addShape("roundRect", {
    x: 8.75, y: FOOTER_Y, w: 0.92, h: 0.28,
    fill: { color: C.bgDark }, line: { color: C.bgDark }, rectRadius: 0.14,
  });
  s.addText(`${idx} / ${total}`, {
    x: 8.75, y: FOOTER_Y, w: 0.92, h: 0.28,
    fontSize: 8.5, color: C.textLight, align: "center", valign: "middle",
    fontFace: "Calibri", bold: true,
  });
}

// ── Slide header (dark band) ──────────────────────────────────────────────────
function addAISlideHeader(s, pres, C, title, icon) {
  // Solid dark header bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: SLIDE_W, h: HEADER_H,
    fill: { color: C.bgDark }, line: { color: C.bgDark },
  });
  // Subtle accent circle (top-right, clipped to header)
  s.addShape(pres.shapes.OVAL, {
    x: 8.4, y: -0.7, w: 2.0, h: 2.0,
    fill: { color: C.accent, transparency: 90 },
    line: { color: C.accent, transparency: 90 },
  });
  // Thin accent underline
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: HEADER_H - 0.04, w: SLIDE_W, h: 0.04,
    fill: { color: C.accent }, line: { color: C.accent },
  });
  // Icon
  if (icon && icon.trim()) {
    s.addText(icon, {
      x: 0.3, y: 0.24, w: 0.7, h: 0.7,
      fontSize: 22, align: "center", valign: "middle",
    });
  }
  // Title
  s.addText(title.slice(0, 80), {
    x: 1.1, y: 0.18, w: 8.55, h: 0.92,
    fontSize: 22, color: C.textLight, bold: true,
    fontFace: "Calibri", valign: "middle", margin: 0,
  });
}

// ── Grid overlay (cover / section slides) ────────────────────────────────────
function addGridOverlay(s, pres, C) {
  for (let gx = 0; gx <= SLIDE_W; gx += 0.72) {
    s.addShape(pres.shapes.RECTANGLE, {
      x: gx, y: 0, w: 0.008, h: 5.63,
      fill: { color: C.accent, transparency: 92 },
      line: { color: C.accent, transparency: 92 },
    });
  }
  for (let gy = 0; gy <= 5.63; gy += 0.63) {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: gy, w: SLIDE_W, h: 0.008,
      fill: { color: C.accent, transparency: 92 },
      line: { color: C.accent, transparency: 92 },
    });
  }
}

// ── CARD PALETTE ─────────────────────────────────────────────────────────────
function cardPalette(C) {
  return [C.chart2, C.chart3, C.chart4, C.chart5, C.chart1, C.teal, C.chart6, C.chart7];
}

// ── Build AI deck from slides array ──────────────────────────────────────────
function buildAIDeck({ aiSlides, strategy, docTitle, heroTitle, themeKey, wizardOptions }) {
  const C = resolveAITheme(themeKey, strategy?.documentType);
  const includeNotes = wizardOptions.speakerNotes !== "No";
  const totalSlides = aiSlides.length;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const PALETTE = cardPalette(C);

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = docTitle;

  let slideCounter = 0;

  for (const slide of aiSlides) {
    const s = pres.addSlide();
    slideCounter++;

    // ── COVER ──────────────────────────────────────────────────────────────
    if (slide.slideType === "cover") {
      s.background = { color: C.bgDark };
      addGridOverlay(s, pres, C);

      // Decorative circles
      s.addShape(pres.shapes.OVAL, { x: 7.6, y: -1.1, w: 3.8, h: 3.8, fill: { color: C.accent, transparency: 80 }, line: { color: C.accent, transparency: 80 } });
      s.addShape(pres.shapes.OVAL, { x: -0.6, y: 3.9, w: 2.2, h: 2.2, fill: { color: C.teal, transparency: 82 }, line: { color: C.teal, transparency: 82 } });
      s.addShape(pres.shapes.OVAL, { x: 4.3, y: 3.4, w: 1.3, h: 1.3, fill: { color: C.chart3, transparency: 88 }, line: { color: C.chart3, transparency: 88 } });

      // Doc type badge
      const docLabel = (slide.documentTypeLabel || strategy?.documentType || "PRESENTATION")
        .replace(/_/g, " ").toUpperCase().slice(0, 40);
      s.addShape("roundRect", {
        x: 0.6, y: 1.1, w: Math.min(docLabel.length * 0.108 + 0.5, 5.0), h: 0.32,
        fill: { color: C.accent, transparency: 82 },
        line: { color: C.accent, transparency: 65 }, rectRadius: 0.04,
      });
      s.addText(docLabel, {
        x: 0.7, y: 1.1, w: 5.0, h: 0.32,
        fontSize: 9, color: C.accent, bold: true, charSpacing: 3, fontFace: "Calibri",
      });

      // Title
      s.addText(heroTitle.slice(0, 80), {
        x: 0.6, y: 1.55, w: 7.8, h: 1.4,
        fontSize: 32, color: C.textLight, bold: true, fontFace: "Calibri", lineSpacing: 40,
      });

      // Subtitle
      if (slide.subtitle) {
        s.addText(slide.subtitle.slice(0, 120), {
          x: 0.6, y: 3.08, w: 8.2, h: 0.52,
          fontSize: 13, color: "A0B0D0", fontFace: "Calibri",
        });
      }

      // Meta line
      s.addText(`${today}  •  ${wizardOptions.audience || "All Stakeholders"}  •  ${totalSlides} slides`, {
        x: 0.6, y: 4.9, w: 8.8, h: 0.35,
        fontSize: 9.5, color: "6A80A8", fontFace: "Calibri",
      });

      if (includeNotes) s.addNotes(slide.speakerNotes || `Cover: ${heroTitle}`);
      continue;
    }

    // ── SECTION DIVIDER ────────────────────────────────────────────────────
    if (slide.slideType === "section") {
      s.background = { color: C.bgDark };
      addGridOverlay(s, pres, C);

      // Large number watermark
      s.addText(String(slideCounter), {
        x: 5.8, y: -0.6, w: 4.2, h: 4.5,
        fontSize: 190, color: C.textLight, bold: true,
        fontFace: "Calibri", transparency: 90, align: "right",
      });

      s.addShape(pres.shapes.OVAL, { x: 7.4, y: -1.1, w: 4.2, h: 4.2, fill: { color: C.accent, transparency: 88 }, line: { color: C.accent, transparency: 88 } });
      s.addShape(pres.shapes.OVAL, { x: 6.4, y: 3.7, w: 2.8, h: 2.8, fill: { color: C.teal, transparency: 86 }, line: { color: C.teal, transparency: 86 } });

      s.addText("SECTION", {
        x: 0.6, y: 1.5, w: 8.5, h: 0.4,
        fontSize: 11, color: C.accent, bold: true, charSpacing: 5, fontFace: "Calibri",
      });
      s.addText((slide.title || "Section").slice(0, 60), {
        x: 0.6, y: 2.05, w: 7.8, h: 1.45,
        fontSize: 36, color: C.textLight, bold: true, fontFace: "Calibri", valign: "top",
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle.slice(0, 160), {
          x: 0.6, y: 3.62, w: 7.2, h: 0.9,
          fontSize: 13, color: "8099C0", fontFace: "Calibri", italic: true, valign: "top",
        });
      }

      addAIFooter(s, C, docTitle, slideCounter, totalSlides);
      if (includeNotes) s.addNotes(slide.speakerNotes || `Section: ${slide.title}`);
      continue;
    }

    // ── CLOSING ────────────────────────────────────────────────────────────
    if (slide.slideType === "closing") {
      s.background = { color: C.bgDark };
      s.addShape(pres.shapes.OVAL, { x: -1.0, y: 2.4, w: 4.2, h: 4.2, fill: { color: C.accent, transparency: 82 }, line: { color: C.accent, transparency: 82 } });
      s.addShape(pres.shapes.OVAL, { x: 8.4, y: -0.6, w: 2.8, h: 2.8, fill: { color: C.teal, transparency: 80 }, line: { color: C.teal, transparency: 80 } });
      s.addShape(pres.shapes.OVAL, { x: 3.8, y: 1.8, w: 1.6, h: 1.6, fill: { color: C.chart3, transparency: 88 }, line: { color: C.chart3, transparency: 88 } });

      s.addText(slide.title || "Key Takeaways", {
        x: 1, y: 1.0, w: 8, h: 1.1,
        fontSize: 42, color: C.textLight, bold: true, fontFace: "Calibri", align: "center",
      });

      const body = slide.body || strategy?.mostImportantInsight || "";
      if (body) {
        s.addText(body.slice(0, 150), {
          x: 1.5, y: 2.2, w: 7, h: 0.6,
          fontSize: 13, color: "7A90B8", align: "center", fontFace: "Calibri",
        });
      }

      const msgs = slide.keyMessages || strategy?.keyMessages?.slice(0, 3) || [];
      let msgY = 2.95;
      msgs.slice(0, 3).forEach(msg => {
        s.addShape(pres.shapes.OVAL, { x: 1.4, y: msgY + 0.05, w: 0.13, h: 0.13, fill: { color: C.accent }, line: { color: C.accent } });
        s.addText(msg.slice(0, 110), {
          x: 1.62, y: msgY, w: 7.0, h: 0.3,
          fontSize: 10, color: "8A9FC0", fontFace: "Calibri",
        });
        msgY += 0.36;
      });

      s.addText(today, {
        x: 1, y: 5.1, w: 8, h: 0.28,
        fontSize: 9, color: "5A6A8A", align: "center", fontFace: "Calibri",
      });

      if (includeNotes) s.addNotes(slide.speakerNotes || "Closing slide.");
      continue;
    }

    // ── All content slides: light background + dark header ─────────────────
    s.background = { color: C.bgLight };
    addAISlideHeader(s, pres, C, slide.title || "Slide", slide.icon || "");

    const SY = CONTENT_Y;
    const SH = CONTENT_H;

    // ── KPI SLIDE ─────────────────────────────────────────────────────────
    if (slide.slideType === "kpi" && Array.isArray(slide.metrics) && slide.metrics.length > 0) {
      // KPI slides: dark background for premium look
      s.background = { color: C.bgDark };
      // Re-draw header on dark bg
      s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: HEADER_H, fill: { color: C.bgDark }, line: { color: C.bgDark } });
      s.addShape(pres.shapes.RECTANGLE, { x: 0, y: HEADER_H - 0.04, w: SLIDE_W, h: 0.04, fill: { color: C.accent }, line: { color: C.accent } });
      s.addShape(pres.shapes.OVAL, { x: 8.4, y: -0.7, w: 2.0, h: 2.0, fill: { color: C.accent, transparency: 90 }, line: { color: C.accent, transparency: 90 } });
      if (slide.icon) s.addText(slide.icon, { x: 0.3, y: 0.24, w: 0.7, h: 0.7, fontSize: 22, align: "center", valign: "middle" });
      s.addText((slide.title || "Key Metrics").slice(0, 80), { x: 1.1, y: 0.18, w: 8.55, h: 0.92, fontSize: 22, color: C.textLight, bold: true, fontFace: "Calibri", valign: "middle", margin: 0 });

      // Decorative circles
      s.addShape(pres.shapes.OVAL, { x: 7.5, y: -0.9, w: 3.4, h: 3.4, fill: { color: C.accent, transparency: 82 }, line: { color: C.accent, transparency: 82 } });
      s.addShape(pres.shapes.OVAL, { x: -0.6, y: 4.2, w: 2.2, h: 2.2, fill: { color: C.teal, transparency: 86 }, line: { color: C.teal, transparency: 86 } });

      const items = slide.metrics.slice(0, 6);
      const cols = items.length <= 2 ? 2 : items.length <= 4 ? 2 : 3;
      const rows = Math.ceil(items.length / cols);
      const GAP = 0.18;
      const cardW = (9.3 - GAP * (cols - 1)) / cols;
      const cardH = Math.min(Math.max((SH - GAP * (rows - 1)) / rows, 1.1), 1.7);

      items.forEach((m, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = 0.35 + col * (cardW + GAP);
        const cy = SY + row * (cardH + GAP);
        const cc = PALETTE[i % PALETTE.length];

        s.addShape("roundRect", { x: cx, y: cy, w: cardW, h: cardH, fill: { color: cc, transparency: 88 }, line: { color: cc, transparency: 55 }, rectRadius: 0.12 });
        s.addShape("roundRect", { x: cx, y: cy, w: 0.055, h: cardH, fill: { color: cc }, line: { color: cc }, rectRadius: 0 });

        s.addText(String(m.label || "").toUpperCase().slice(0, 30), {
          x: cx + 0.18, y: cy + 0.1, w: cardW - 0.32, h: 0.28,
          fontSize: 8.5, color: cc, bold: true, fontFace: "Calibri", charSpacing: 0.3,
        });

        const valText = String(m.value || "—").slice(0, 32);
        const valSize = valText.length > 22 ? 12 : cardH > 1.35 ? 17 : 14;
        s.addText(valText, {
          x: cx + 0.18, y: cy + 0.42, w: cardW - 0.3, h: cardH - 0.58,
          fontSize: valSize, color: C.textLight, bold: true,
          fontFace: "Calibri", valign: "top", autoFit: true,
        });

        if (m.trend === "up" || m.trend === "down") {
          const arrow = m.trend === "up" ? "↑" : "↓";
          const arrowColor = m.trend === "up" ? "2ECC71" : "E74C3C";
          s.addText(arrow, { x: cx + cardW - 0.45, y: cy + 0.38, w: 0.34, h: 0.34, fontSize: 15, color: arrowColor, bold: true, align: "right", fontFace: "Calibri" });
        }
      });

    // ── CHART SLIDE ───────────────────────────────────────────────────────
    } else if (slide.slideType === "chart" && slide.chartData && Array.isArray(slide.chartData.labels) && slide.chartData.labels.length >= 2) {
      const cd = slide.chartData;
      const chartType = (cd.type || "bar").toLowerCase();
      const labels = cd.labels.slice(0, 10);
      const values = cd.values.slice(0, 10).map(v => (typeof v === "number" ? v : parseFloat(v) || 0)).filter(v => isFinite(v));
      const CHART_COLORS = [C.chart1, C.chart2, C.chart3, C.chart4, C.chart5, C.chart6, C.chart7, C.chart8];

      // Stat pills row
      const total = values.reduce((a, b) => a + b, 0);
      const maxV = Math.max(...values);
      const minV = Math.min(...values);
      const pills = [
        { label: "MAX", val: maxV >= 1000 ? `${(maxV / 1000).toFixed(1)}K` : String(maxV), color: C.chart2 },
        { label: "MIN", val: minV >= 1000 ? `${(minV / 1000).toFixed(1)}K` : String(minV), color: C.chart4 },
        { label: "TOTAL", val: total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : total >= 1000 ? `${(total / 1000).toFixed(1)}K` : String(total), color: C.teal },
      ];
      pills.forEach((pill, pi) => {
        const px = 0.35 + pi * 3.1;
        s.addShape("roundRect", { x: px, y: SY, w: 2.95, h: 0.35, fill: { color: pill.color, transparency: 90 }, line: { color: pill.color, transparency: 72 }, rectRadius: 0.08 });
        s.addText(`${pill.label}  ${pill.val}`, { x: px + 0.12, y: SY, w: 2.72, h: 0.35, fontSize: 9, color: pill.color, bold: true, fontFace: "Calibri", valign: "middle" });
      });

      const chartY = SY + 0.44;
      const chartH = SH - 0.44;

      try {
        if (chartType === "waterfall") {
          let running = 0;
          const bases = []; const deltas = [];
          values.forEach(v => { const s2 = running; running += v; bases.push(Math.min(s2, running)); deltas.push(Math.abs(v)); });
          s.addChart(pres.ChartType.bar, [
            { name: "base", labels, values: bases },
            { name: cd.title || slide.title, labels, values: deltas },
          ], {
            x: 0.35, y: chartY, w: 9.3, h: chartH,
            barDir: "col", barGrouping: "stacked",
            chartColors: [C.bgLight, C.chart2],
            showLegend: false, showValue: true,
            dataLabelFontSize: 8, dataLabelPosition: "ctr", dataLabelColor: C.textLight,
            catAxisLabelFontSize: 8, valAxisLabelFontSize: 8,
            catAxisLabelColor: C.textDark, valAxisLabelColor: C.textMuted,
            catGridLine: { style: "none" }, valGridLine: { style: "dash", color: C.border },
            plotAreaBorderColor: C.border, chartAreaBorderColor: C.border,
          });
        } else if (chartType === "radar") {
          const radarData = [{ name: cd.title || slide.title, labels: labels.slice(0, 8), values: values.slice(0, 8) }];
          s.addChart(pres.ChartType.radar, radarData, {
            x: 1.5, y: chartY, w: 7.0, h: chartH,
            chartColors: [C.chart2],
            showLegend: false,
            catAxisLabelFontSize: 9, catAxisLabelColor: C.textDark,
            plotAreaBorderColor: C.border, chartAreaBorderColor: C.border,
          });
        } else if (chartType === "pie" || chartType === "donut") {
          s.addChart(pres.ChartType.doughnut, [{ name: cd.title || slide.title, labels, values }], {
            x: 0.5, y: chartY, w: 5.5, h: chartH,
            chartColors: CHART_COLORS.slice(0, labels.length),
            showLegend: true, legendPos: "r", legendFontSize: 9,
            showValue: true, dataLabelFontSize: 9, dataLabelColor: C.textLight,
            holeSize: 48,
          });
        } else if (chartType === "line" || chartType === "area") {
          s.addChart(pres.ChartType.line, [{ name: cd.title || slide.title, labels, values }], {
            x: 0.35, y: chartY, w: 9.3, h: chartH,
            chartColors: [C.chart2],
            showLegend: false, showValue: false,
            lineDataSymbol: "circle", lineDataSymbolSize: 6, lineSize: 2,
            catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
            catAxisLabelColor: C.textDark, valAxisLabelColor: C.textMuted,
            catGridLine: { style: "none" }, valGridLine: { style: "dash", color: C.border },
            plotAreaBorderColor: C.border, chartAreaBorderColor: C.border,
          });
        } else {
          // Default: vertical bar chart
          s.addChart(pres.ChartType.bar, [{ name: cd.title || slide.title, labels, values }], {
            x: 0.35, y: chartY, w: 9.3, h: chartH,
            barDir: "col",
            chartColors: CHART_COLORS.slice(0, labels.length),
            showLegend: false, showValue: true,
            dataLabelFontSize: 8, dataLabelPosition: "inEnd", dataLabelColor: C.textLight,
            catAxisLabelFontSize: 8, valAxisLabelFontSize: 8,
            catAxisLabelColor: C.textDark, valAxisLabelColor: C.textMuted,
            catGridLine: { style: "none" }, valGridLine: { style: "dash", color: C.border },
            plotAreaBorderColor: C.border, chartAreaBorderColor: C.border,
          });
        }
      } catch (chartErr) {
        console.warn("Chart render error:", chartErr.message);
        const fallback = (slide.bullets || []).slice(0, 7).map((b, i) => ({
          text: b.slice(0, 130),
          options: { bullet: { code: "25AA", color: PALETTE[i % PALETTE.length] }, breakLine: i < slide.bullets.length - 1, fontSize: 12.5, color: C.textDark, paraSpaceAfter: 8 },
        }));
        if (fallback.length) s.addText(fallback, { x: 0.5, y: SY + 0.4, w: 9.0, h: SH - 0.4, fontFace: "Calibri", valign: "top" });
      }

    // ── SCORECARD SLIDE ──────────────────────────────────────────────────
    } else if (slide.slideType === "scorecard" && Array.isArray(slide.items) && slide.items.length > 0) {
      const items = slide.items.slice(0, 8);
      const useTwoCols = items.length > 4;
      const cols = useTwoCols ? 2 : 1;
      const colW = useTwoCols ? 4.58 : 9.3;
      const GAP = 0.18;
      const rows = Math.ceil(items.length / cols);
      const rowH = Math.min((SH - GAP * (rows - 1)) / rows, 0.84);
      const STATUS_COLOR = { good: "27AE60", warning: "F39C12", critical: "E74C3C" };

      items.forEach((item, i) => {
        const col = useTwoCols ? i % 2 : 0;
        const row = useTwoCols ? Math.floor(i / 2) : i;
        const cx = 0.35 + col * (colW + GAP);
        const cy = SY + row * (rowH + GAP);
        const sc = STATUS_COLOR[item.status] || STATUS_COLOR.warning;
        const pct = item.maxScore > 0 ? Math.min((item.score / item.maxScore) * 100, 100) : 0;

        s.addShape("roundRect", { x: cx, y: cy, w: colW, h: rowH, fill: { color: C.cardBg }, line: { color: C.border }, rectRadius: 0.07 });

        // Status pill
        s.addShape("roundRect", { x: cx + colW - 1.12, y: cy + rowH * 0.14, w: 0.96, h: 0.26, fill: { color: sc, transparency: 82 }, line: { color: sc, transparency: 62 }, rectRadius: 0.13 });
        s.addText((item.status || "?").toUpperCase(), { x: cx + colW - 1.12, y: cy + rowH * 0.14, w: 0.96, h: 0.26, fontSize: 7.5, color: sc, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });

        s.addText((item.category || "").slice(0, 32), { x: cx + 0.14, y: cy + 0.06, w: colW - 1.35, h: 0.28, fontSize: 10.5, color: C.textDark, bold: true, fontFace: "Calibri" });
        s.addText(`${item.score}/${item.maxScore}`, { x: cx + 0.14, y: cy + 0.34, w: 1.1, h: 0.22, fontSize: 9, color: sc, bold: true, fontFace: "Calibri" });

        // Progress bar
        const barX = cx + 1.35;
        const barW = colW - 1.62;
        s.addShape("roundRect", { x: barX, y: cy + 0.39, w: barW, h: 0.1, fill: { color: C.border }, line: { color: C.border }, rectRadius: 0.05 });
        const fillW = Math.max((pct / 100) * barW, 0.05);
        s.addShape("roundRect", { x: barX, y: cy + 0.39, w: fillW, h: 0.1, fill: { color: sc }, line: { color: sc }, rectRadius: 0.05 });

        if (item.comment && rowH > 0.62) {
          s.addText(item.comment.slice(0, 58), { x: cx + 0.14, y: cy + rowH - 0.26, w: colW - 0.3, h: 0.22, fontSize: 8, color: C.textMuted, fontFace: "Calibri" });
        }
      });

    // ── RISK CARDS SLIDE ─────────────────────────────────────────────────
    } else if (slide.slideType === "riskCards" && Array.isArray(slide.risks) && slide.risks.length > 0) {
      const items = slide.risks.slice(0, 5);
      const SEV_COLOR = { critical: "E74C3C", high: "E67E22", medium: "F39C12", low: "27AE60" };
      const GAP = 0.13;
      const rowH = Math.min((SH - GAP * (items.length - 1)) / items.length, 0.88);
      let ry = SY;

      items.forEach(risk => {
        const sc = SEV_COLOR[risk.severity] || SEV_COLOR.medium;
        s.addShape("roundRect", { x: 0.35, y: ry, w: 9.3, h: rowH, fill: { color: C.cardBg }, line: { color: sc, transparency: 58 }, rectRadius: 0.07 });
        s.addShape("roundRect", { x: 0.35, y: ry, w: 0.06, h: rowH, fill: { color: sc }, line: { color: sc }, rectRadius: 0 });
        s.addShape("roundRect", { x: 8.45, y: ry + 0.1, w: 1.0, h: 0.27, fill: { color: sc, transparency: 80 }, line: { color: sc, transparency: 58 }, rectRadius: 0.13 });
        s.addText((risk.severity || "medium").toUpperCase(), { x: 8.45, y: ry + 0.1, w: 1.0, h: 0.27, fontSize: 7.5, color: sc, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });
        s.addText((risk.title || "").slice(0, 60), { x: 0.55, y: ry + 0.08, w: 7.75, h: 0.3, fontSize: 12.5, color: C.textDark, bold: true, fontFace: "Calibri" });
        if (risk.description) {
          s.addText(risk.description.slice(0, 140), { x: 0.55, y: ry + 0.4, w: 8.85, h: rowH - 0.46, fontSize: 10, color: C.textMuted, fontFace: "Calibri", valign: "top" });
        }
        ry += rowH + GAP;
      });

    // ── RECOMMENDATIONS SLIDE ────────────────────────────────────────────
    } else if (slide.slideType === "recommendations" && Array.isArray(slide.items) && slide.items.length > 0) {
      const items = slide.items.slice(0, 6);
      const PRIO_COLOR = { immediate: "E74C3C", "short-term": "F39C12", "long-term": C.chart2 };
      const GAP = 0.12;
      const rowH = Math.min((SH - GAP * (items.length - 1)) / items.length, 0.72);
      let ry = SY;

      items.forEach((it, i) => {
        const pc = PRIO_COLOR[it.priority] || PRIO_COLOR["short-term"];
        s.addShape("roundRect", { x: 0.35, y: ry, w: 9.3, h: rowH, fill: { color: C.cardBg }, line: { color: C.border }, rectRadius: 0.07 });
        s.addShape(pres.shapes.OVAL, { x: 0.44, y: ry + rowH / 2 - 0.19, w: 0.38, h: 0.38, fill: { color: pc }, line: { color: pc } });
        s.addText(String(i + 1), { x: 0.44, y: ry + rowH / 2 - 0.19, w: 0.38, h: 0.38, fontSize: 11, color: C.textLight, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });
        s.addShape("roundRect", { x: 0.96, y: ry + 0.09, w: 1.18, h: 0.24, fill: { color: pc, transparency: 82 }, line: { color: pc, transparency: 62 }, rectRadius: 0.12 });
        s.addText((it.priority || "short-term").toUpperCase(), { x: 0.96, y: ry + 0.09, w: 1.18, h: 0.24, fontSize: 7, color: pc, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });
        s.addText((it.title || "").slice(0, 60), { x: 2.25, y: ry + 0.06, w: 7.3, h: 0.3, fontSize: 11.5, color: C.textDark, bold: true, fontFace: "Calibri" });
        if (it.description) {
          s.addText(it.description.slice(0, 115), { x: 2.25, y: ry + 0.38, w: 7.3, h: rowH - 0.42, fontSize: 9.5, color: C.textMuted, fontFace: "Calibri", valign: "top" });
        }
        ry += rowH + GAP;
      });

    // ── TWO-COLUMN SLIDE ─────────────────────────────────────────────────
    } else if (slide.slideType === "twoColumn" && slide.twoColumns) {
      const tc = slide.twoColumns;
      const GAP = 0.28;
      const colW = (9.3 - GAP) / 2;

      [
        { data: tc.left,  cx: 0.35,              borderC: C.chart2 },
        { data: tc.right, cx: 0.35 + colW + GAP, borderC: C.chart3 },
      ].forEach(col => {
        if (!col.data) return;
        s.addShape("roundRect", { x: col.cx, y: SY, w: colW, h: SH, fill: { color: C.cardBg }, line: { color: C.border }, rectRadius: 0.1 });
        // Top color accent bar
        s.addShape("roundRect", { x: col.cx, y: SY, w: colW, h: 0.04, fill: { color: col.borderC }, line: { color: col.borderC }, rectRadius: 0 });
        s.addText((col.data.title || "").slice(0, 35), { x: col.cx + 0.14, y: SY + 0.1, w: colW - 0.28, h: 0.35, fontSize: 12, color: col.borderC, bold: true, fontFace: "Calibri" });
        s.addShape(pres.shapes.RECTANGLE, { x: col.cx + 0.14, y: SY + 0.49, w: colW - 0.28, h: 0.02, fill: { color: C.border }, line: { color: C.border } });
        if (Array.isArray(col.data.bullets) && col.data.bullets.length > 0) {
          const bulletItems = col.data.bullets.slice(0, 7).map((b, i) => ({
            text: b.slice(0, 95),
            options: { bullet: { code: "25AA", color: col.borderC }, breakLine: i < col.data.bullets.length - 1, fontSize: 11.5, color: C.textDark, paraSpaceAfter: 7 },
          }));
          s.addText(bulletItems, { x: col.cx + 0.14, y: SY + 0.56, w: colW - 0.28, h: SH - 0.66, fontFace: "Calibri", valign: "top" });
        }
      });

      // Center badge
      const midX = 0.35 + colW + GAP / 2 - 0.23;
      s.addShape(pres.shapes.OVAL, { x: midX, y: SY + SH / 2 - 0.23, w: 0.46, h: 0.46, fill: { color: C.bgDark }, line: { color: C.bgDark } });
      s.addText("→", { x: midX, y: SY + SH / 2 - 0.23, w: 0.46, h: 0.46, fontSize: 14, color: C.accent, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });

    // ── SWOT SLIDE ───────────────────────────────────────────────────────
    } else if (slide.slideType === "swot" && slide.swotData) {
      const sw = slide.swotData;
      const qW = 4.6; const qH = SH / 2 - 0.09;
      const quadrants = [
        { label: "STRENGTHS",     items: sw.strengths     || [], color: "27AE60", cx: 0.35, cy: SY },
        { label: "WEAKNESSES",    items: sw.weaknesses    || [], color: "E74C3C", cx: 5.05, cy: SY },
        { label: "OPPORTUNITIES", items: sw.opportunities || [], color: C.chart2,  cx: 0.35, cy: SY + qH + 0.12 },
        { label: "THREATS",       items: sw.threats       || [], color: "E67E22", cx: 5.05, cy: SY + qH + 0.12 },
      ];
      quadrants.forEach(q => {
        s.addShape("roundRect", { x: q.cx, y: q.cy, w: qW, h: qH, fill: { color: C.cardBg }, line: { color: q.color, transparency: 42 }, rectRadius: 0.08 });
        s.addShape("roundRect", { x: q.cx, y: q.cy, w: qW, h: 0.32, fill: { color: q.color, transparency: 85 }, line: { color: q.color, transparency: 70 }, rectRadius: 0.08 });
        s.addText(q.label, { x: q.cx + 0.12, y: q.cy + 0.04, w: qW - 0.24, h: 0.24, fontSize: 8.5, color: q.color, bold: true, fontFace: "Calibri", charSpacing: 1 });
        const bItems = q.items.slice(0, 4).map((b, i) => ({
          text: b.slice(0, 70),
          options: { bullet: { code: "25AA", color: q.color }, breakLine: i < q.items.length - 1, fontSize: 10.5, color: C.textDark, paraSpaceAfter: 4 },
        }));
        if (bItems.length) s.addText(bItems, { x: q.cx + 0.14, y: q.cy + 0.36, w: qW - 0.28, h: qH - 0.46, fontFace: "Calibri", valign: "top" });
      });

    // ── AGENDA SLIDE ─────────────────────────────────────────────────────
    } else if (slide.slideType === "agenda" && Array.isArray(slide.sections) && slide.sections.length > 0) {
      const items = slide.sections.slice(0, 8);
      const GAP = 0.1;
      const rowH = Math.min((SH - GAP * (items.length - 1)) / items.length, 0.64);
      let ay = SY;
      items.forEach((sec, i) => {
        const cc = PALETTE[i % PALETTE.length];
        s.addShape("roundRect", { x: 0.35, y: ay, w: 9.3, h: rowH, fill: { color: C.cardBg }, line: { color: C.border }, rectRadius: 0.06 });
        s.addShape(pres.shapes.OVAL, { x: 0.48, y: ay + rowH / 2 - 0.19, w: 0.38, h: 0.38, fill: { color: cc, transparency: 78 }, line: { color: cc, transparency: 55 } });
        s.addText(String(i + 1).padStart(2, "0"), { x: 0.48, y: ay + rowH / 2 - 0.19, w: 0.38, h: 0.38, fontSize: 11, color: cc, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });
        s.addText((sec.icon || "") + " " + (sec.title || "").slice(0, 48), { x: 1.02, y: ay + 0.06, w: 7.1, h: rowH * 0.55, fontSize: 13, color: C.textDark, bold: true, fontFace: "Calibri", valign: "top" });
        if (sec.description) {
          s.addText(sec.description.slice(0, 95), { x: 1.02, y: ay + rowH * 0.52, w: 8.0, h: rowH * 0.44, fontSize: 9.5, color: C.textMuted, fontFace: "Calibri", valign: "top" });
        }
        ay += rowH + GAP;
      });

    // ── PROCESS / TIMELINE slides ─────────────────────────────────────────
    } else if (slide.slideType === "process" && Array.isArray(slide.steps) && slide.steps.length > 0) {
      const steps = slide.steps.slice(0, 6);
      const count = steps.length;
      const spineY = SY + SH * 0.4;
      const stepW = 9.0 / count;

      s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: spineY, w: 9.0, h: 0.04, fill: { color: C.teal, transparency: 60 }, line: { color: C.teal, transparency: 60 } });

      steps.forEach((step, i) => {
        const cx = 0.4 + i * stepW + stepW * 0.5;
        const isAbove = i % 2 === 0 || count <= 3;
        const cc = PALETTE[i % PALETTE.length];

        s.addShape(pres.shapes.OVAL, { x: cx - 0.23, y: spineY - 0.23, w: 0.46, h: 0.46, fill: { color: cc, transparency: 76 }, line: { color: cc, transparency: 55 } });
        s.addShape(pres.shapes.OVAL, { x: cx - 0.14, y: spineY - 0.14, w: 0.28, h: 0.28, fill: { color: cc }, line: { color: cc } });
        s.addText(String(step.number || i + 1), { x: cx - 0.14, y: spineY - 0.14, w: 0.28, h: 0.28, fontSize: 8, color: C.textLight, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });

        const titleY = isAbove ? spineY - 0.77 : spineY + 0.36;
        const descY  = isAbove ? spineY - 1.5  : spineY + 0.72;
        s.addText((step.title || `Step ${i + 1}`).slice(0, 32), { x: cx - stepW * 0.43, y: titleY, w: stepW * 0.86, h: 0.3, fontSize: 9.5, color: cc, bold: true, align: "center", fontFace: "Calibri" });
        if (step.description) {
          s.addText(step.description.slice(0, 85), { x: cx - stepW * 0.43, y: descY, w: stepW * 0.86, h: 0.58, fontSize: 8.5, color: C.textMuted, align: "center", fontFace: "Calibri" });
        }
      });

    } else if (slide.slideType === "timeline" && Array.isArray(slide.timeline) && slide.timeline.length > 0) {
      const events = slide.timeline.slice(0, 7);
      const count = events.length;
      const lineY = SY + SH * 0.44;
      const itemW = 9.2 / count;

      s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: lineY, w: 9.2, h: 0.04, fill: { color: C.teal }, line: { color: C.teal } });

      events.forEach((evt, i) => {
        const cx = 0.4 + i * itemW + itemW * 0.44;
        const isAbove = i % 2 === 0;
        const cc = PALETTE[i % PALETTE.length];

        s.addShape(pres.shapes.OVAL, { x: cx - 0.16, y: lineY - 0.16, w: 0.32, h: 0.32, fill: { color: cc, transparency: 72 }, line: { color: cc, transparency: 52 } });
        s.addShape(pres.shapes.OVAL, { x: cx - 0.09, y: lineY - 0.09, w: 0.18, h: 0.18, fill: { color: cc }, line: { color: cc } });

        if (isAbove) {
          s.addText(evt.date || `${i + 1}`, { x: cx - itemW * 0.44, y: lineY - 0.7, w: itemW * 0.88, h: 0.26, fontSize: 8.5, color: cc, bold: true, align: "center", fontFace: "Calibri" });
          s.addText((evt.event || "").slice(0, 42), { x: cx - itemW * 0.44, y: lineY - 0.42, w: itemW * 0.88, h: 0.34, fontSize: 9, color: C.textDark, bold: true, align: "center", fontFace: "Calibri" });
          if (evt.detail) s.addText(evt.detail.slice(0, 72), { x: cx - itemW * 0.44, y: SY, w: itemW * 0.88, h: lineY - SY - 0.5, fontSize: 8, color: C.textMuted, align: "center", fontFace: "Calibri", valign: "bottom" });
        } else {
          s.addText(evt.date || `${i + 1}`, { x: cx - itemW * 0.44, y: lineY + 0.24, w: itemW * 0.88, h: 0.26, fontSize: 8.5, color: cc, bold: true, align: "center", fontFace: "Calibri" });
          s.addText((evt.event || "").slice(0, 42), { x: cx - itemW * 0.44, y: lineY + 0.52, w: itemW * 0.88, h: 0.34, fontSize: 9, color: C.textDark, bold: true, align: "center", fontFace: "Calibri" });
          if (evt.detail) s.addText(evt.detail.slice(0, 72), { x: cx - itemW * 0.44, y: lineY + 0.88, w: itemW * 0.88, h: 0.75, fontSize: 8, color: C.textMuted, align: "center", fontFace: "Calibri" });
        }
      });

    // ── BULLETS / DEFAULT ─────────────────────────────────────────────────
    } else {
      const hasBullets = Array.isArray(slide.bullets) && slide.bullets.length > 0;
      const hasBody = slide.body && slide.body.length > 20;

      if (hasBullets && hasBody) {
        // Two-panel: bullets left, insight right
        s.addShape("roundRect", { x: 0.35, y: SY, w: 5.55, h: SH, fill: { color: C.cardBg }, line: { color: C.border }, rectRadius: 0.1 });
        const bItems = slide.bullets.slice(0, 7).map((b, i) => ({
          text: b.slice(0, 125),
          options: { bullet: { code: "25AA", color: PALETTE[i % PALETTE.length] }, breakLine: i < slide.bullets.length - 1, fontSize: 12, color: C.textDark, paraSpaceAfter: 8 },
        }));
        s.addText(bItems, { x: 0.52, y: SY + 0.15, w: 5.2, h: SH - 0.3, fontFace: "Calibri", valign: "top" });

        s.addShape("roundRect", { x: 6.12, y: SY, w: 3.58, h: SH, fill: { color: C.cardAlt }, line: { color: C.border }, rectRadius: 0.1 });
        s.addText("KEY INSIGHT", { x: 6.27, y: SY + 0.15, w: 3.3, h: 0.3, fontSize: 9, color: C.accent, bold: true, fontFace: "Calibri", charSpacing: 1 });
        s.addShape(pres.shapes.RECTANGLE, { x: 6.27, y: SY + 0.48, w: 3.3, h: 0.02, fill: { color: C.accent, transparency: 72 }, line: { color: C.accent, transparency: 72 } });
        s.addText(slide.body.slice(0, 360), { x: 6.27, y: SY + 0.56, w: 3.3, h: SH - 0.66, fontSize: 11, color: C.textDark, fontFace: "Calibri", valign: "top", lineSpacing: 18 });

      } else if (hasBullets) {
        const bullets = slide.bullets.slice(0, 8);
        s.addShape("roundRect", { x: 0.35, y: SY, w: 9.3, h: SH, fill: { color: C.cardBg }, line: { color: C.border }, rectRadius: 0.1 });
        if (bullets.length >= 5) {
          const half = Math.ceil(bullets.length / 2);
          const mkItems = (arr, offset) => arr.map((b, i) => ({
            text: b.slice(0, 115),
            options: { bullet: { code: "25AA", color: PALETTE[(offset + i) % PALETTE.length] }, breakLine: i < arr.length - 1, fontSize: 12, color: C.textDark, paraSpaceAfter: 9 },
          }));
          s.addText(mkItems(bullets.slice(0, half), 0), { x: 0.52, y: SY + 0.15, w: 4.4, h: SH - 0.3, fontFace: "Calibri", valign: "top" });
          s.addShape(pres.shapes.RECTANGLE, { x: 5.1, y: SY + 0.18, w: 0.02, h: SH - 0.38, fill: { color: C.border }, line: { color: C.border } });
          s.addText(mkItems(bullets.slice(half), half), { x: 5.22, y: SY + 0.15, w: 4.4, h: SH - 0.3, fontFace: "Calibri", valign: "top" });
        } else {
          const bItems = bullets.map((b, i) => ({
            text: b.slice(0, 155),
            options: { bullet: { code: "25AA", color: PALETTE[i % PALETTE.length] }, breakLine: i < bullets.length - 1, fontSize: 13.5, color: C.textDark, paraSpaceAfter: 11 },
          }));
          s.addText(bItems, { x: 0.52, y: SY + 0.18, w: 9.0, h: SH - 0.3, fontFace: "Calibri", valign: "top" });
        }

      } else if (hasBody) {
        s.addShape("roundRect", { x: 0.35, y: SY, w: 9.3, h: SH, fill: { color: C.cardBg }, line: { color: C.border }, rectRadius: 0.1 });
        s.addText(slide.body.slice(0, 720), { x: 0.55, y: SY + 0.18, w: 9.0, h: SH - 0.3, fontSize: 13.5, color: C.textDark, fontFace: "Calibri", valign: "top", lineSpacing: 22 });
      }
    }

    addAIFooter(s, C, docTitle, slideCounter, totalSlides);
    if (includeNotes && slide.speakerNotes) s.addNotes(slide.speakerNotes);
  }

  return { pres, slideCount: totalSlides };
}

// ── POST /generate-ppt-ai ────────────────────────────────────────────────────
router.post("/generate-ppt-ai", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const {
      documentId,
      documentText: rawDocText,
      filename = "Document",
      wizardOptions = {},
    } = req.body;

    let documentText = rawDocText || "";

    if (!documentText && documentId) {
      const doc = await Document.findOne({ _id: documentId, userId: req.user._id });
      if (doc && doc.extractedText) documentText = doc.extractedText;
    }

    if (!documentText || documentText.trim().length < 50) {
      return res.status(400).json({ message: "Document text is required." });
    }

    const docTitle  = (wizardOptions.title || filename).replace(/\.[^/.]+$/, "");
    const heroTitle = wizardOptions.title || docTitle;

    const { strategy, outline, slides } = await generatePresentationPlan(documentText, wizardOptions);

    const { pres, slideCount } = buildAIDeck({
      aiSlides: slides,
      strategy,
      docTitle,
      heroTitle,
      themeKey: wizardOptions.theme || "Professional",
      wizardOptions,
    });

    const tmpFile = path.join(os.tmpdir(), `ai-pres-${Date.now()}.pptx`);
    await pres.writeFile({ fileName: tmpFile });
    const buffer = fs.readFileSync(tmpFile);
    fs.unlink(tmpFile, () => {});

    const saved = await Presentation.create({
      userId: req.user._id,
      documentId: documentId || null,
      filename: `${docTitle}.pptx`,
      sourceFilename: filename,
      theme: wizardOptions.theme || "Professional",
      detailLevel: wizardOptions.contentDensity || "Balanced",
      chartDensity: wizardOptions.chartType || "auto",
      includeAgenda: (wizardOptions.sections || []).includes("Agenda"),
      includeNotes: wizardOptions.speakerNotes !== "No",
      slideCount,
      sizeBytes: buffer.length,
      data: buffer,
      generatedBy: "claude-ai",
      wizardOptions,
    });

    const safeFilename = docTitle.replace(/[^a-zA-Z0-9\-_. ]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.pptx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("X-Presentation-Id", saved._id.toString());
    res.setHeader("X-Slide-Count", String(slideCount));
    res.send(buffer);

  } catch (err) {
    console.error("AI PPT generation error:", err);
    res.status(500).json({ message: err.message || "Failed to generate AI presentation" });
  }
});

// ── GET /presentations ────────────────────────────────────────────────────────
const PRES_EXT_MAP = { pdf: /\.pdf$/i, docx: /\.docx$/i, txt: /\.txt$/i, xlsx: /\.(xlsx|xls|csv)$/i, jpg: /\.(jpg|jpeg)$/i, png: /\.png$/i };
const PRES_SORT_MAP = { newest: { createdAt: -1 }, oldest: { createdAt: 1 } };

router.get("/presentations", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const page     = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit    = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const search   = (req.query.search || "").trim();
    const fileType = (req.query.fileType || "all").toLowerCase();
    const dateFrom = req.query.dateFrom;
    const dateTo   = req.query.dateTo;
    const sortKey  = PRES_SORT_MAP[req.query.sort] ? req.query.sort : "newest";

    const filter = { userId: req.user._id };
    if (req.query.documentId) filter.documentId = req.query.documentId;
    if (search) filter.$or = [{ filename: { $regex: search, $options: "i" } }, { sourceFilename: { $regex: search, $options: "i" } }];
    if (fileType !== "all" && PRES_EXT_MAP[fileType]) filter.sourceFilename = { $regex: PRES_EXT_MAP[fileType] };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
    }

    const total      = await Presentation.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage   = Math.min(page, totalPages);

    const presentations = await Presentation.find(filter)
      .select("-data")
      .sort(PRES_SORT_MAP[sortKey])
      .skip((safePage - 1) * limit)
      .limit(limit);

    res.json({ presentations, total, page: safePage, totalPages, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch presentations" });
  }
});

router.get("/presentations/:id/download", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const pres = await Presentation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!pres) return res.status(404).json({ message: "Presentation not found" });
    const safeFilename = pres.filename.replace(/[^a-zA-Z0-9\-_. ]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.send(pres.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to download presentation" });
  }
});

router.get("/presentations/:id/download-pdf", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const pres = await Presentation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!pres) return res.status(404).json({ message: "Presentation not found" });
    const safeFilename = pres.filename.replace(/\.pptx$/i, ".pdf").replace(/[^a-zA-Z0-9\-_. ]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("X-Download-As-Pdf", "true");
    res.setHeader("X-Original-Filename", pres.filename);
    res.send(pres.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to prepare PDF download" });
  }
});

router.delete("/presentations/:id", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    await Presentation.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete presentation" });
  }
});

// ── Legacy /generate-ppt (summary-based) kept for backwards compat ────────────
router.post("/generate-ppt", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const { summary, filename = "Document", documentId = null, options = {} } = req.body;
    if (!summary) return res.status(400).json({ message: "Summary is required" });

    // Delegate to AI pipeline
    const docTitle = (options.title || filename).replace(/\.[^/.]+$/, "");
    const { strategy, outline, slides } = await generatePresentationPlan(summary, {
      ...options,
      title: docTitle,
      slideCount: options.slideCount || 12,
      contentDensity: options.detailLevel || "Balanced",
      speakerNotes: options.includeNotes !== false ? "Yes" : "No",
    });

    const { pres, slideCount } = buildAIDeck({
      aiSlides: slides, strategy,
      docTitle, heroTitle: docTitle,
      themeKey: options.theme || "Professional",
      wizardOptions: options,
    });

    const tmpFile = path.join(os.tmpdir(), `pres-${Date.now()}.pptx`);
    await pres.writeFile({ fileName: tmpFile });
    const buffer = fs.readFileSync(tmpFile);
    fs.unlink(tmpFile, () => {});

    const saved = await Presentation.create({
      userId: req.user._id, documentId: documentId || null,
      filename: `${docTitle}.pptx`, sourceFilename: filename,
      theme: options.theme || "Professional", detailLevel: options.detailLevel || "Balanced",
      chartDensity: "auto", includeAgenda: options.includeAgenda !== false,
      includeNotes: options.includeNotes !== false,
      slideCount, sizeBytes: buffer.length, data: buffer,
    });

    const safeFilename = docTitle.replace(/[^a-zA-Z0-9\-_. ]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.pptx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("X-Presentation-Id", saved._id.toString());
    res.send(buffer);
  } catch (err) {
    console.error("PPT generation error:", err);
    res.status(500).json({ message: err.message || "Failed to generate presentation" });
  }
});

module.exports = router;