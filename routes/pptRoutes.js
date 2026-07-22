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
const THEMES = {
  navyGold: {
    label: "Professional",
    bgDark: "0F1B38", bgLight: "FAFBFF", bgMid: "EEF4FF",
    accent: "F5A623", teal: "008080",
    textLight: "FFFFFF", textDark: "0F1B38", textMuted: "4A5A7A",
    cardBg: "FFFFFF", cardAlt: "F0F4FA", border: "DDE4F5",
    chart1: "0F1B38", chart2: "F5A623", chart3: "008080",
    chart4: "E74C3C", chart5: "8E44AD", chart6: "2ECC71",
    chart7: "E67E22", chart8: "1ABC9C",
  },
  midnightBlue: {
    label: "Modern",
    bgDark: "0F1B38", bgLight: "F0F6FF", bgMid: "E0EEFF",
    accent: "F5A623", teal: "0077B6",
    textLight: "FFFFFF", textDark: "0F1B38", textMuted: "4A6080",
    cardBg: "FFFFFF", cardAlt: "E0EEFF", border: "C8DCFF",
    chart1: "0F1B38", chart2: "F5A623", chart3: "0077B6",
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
  charcoalRuby: {
    label: "Dark",
    bgDark: "0F1B38", bgLight: "F9F7F7", bgMid: "F3E9E7", accent: "F5A623", teal: "8E7B57",
    textLight: "FFFFFF", textDark: "0F1B38", textMuted: "6B6260",
    cardBg: "FFFFFF", cardAlt: "F3E9E7", border: "E7DEDC",
    chart1: "0F1B38", chart2: "F5A623", chart3: "E67E22", chart4: "27AE60", chart5: "2980B9",
    chart6: "8E44AD", chart7: "F39C12", chart8: "1ABC9C",
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
    chart1: "1B4332", chart2: "F4A261", chart3: "40916C", chart4: "E63946", chart5: "457B9D",
    chart6: "E9C46A", chart7: "2A9D8F", chart8: "264653",
  },
};

const DETAIL_LEVELS = {
  concise:  { maxBullets: 4,  bodyLen: 260, label: "Concise" },
  standard: { maxBullets: 7,  bodyLen: 350, label: "Standard" },
  detailed: { maxBullets: 10, bodyLen: 600, label: "Detailed" },
};

const CHART_DENSITY = {
  minimal: { maxCharts: 2, forceCharts: false },
  auto:    { maxCharts: 4, forceCharts: false },
  rich:    { maxCharts: 99, forceCharts: true },
};

function resolveTheme(key)        { return THEMES[key]        || THEMES.navyGold; }
function resolveDetail(key)       { return DETAIL_LEVELS[key] || DETAIL_LEVELS.standard; }
function resolveChartDensity(key) { return CHART_DENSITY[key] || CHART_DENSITY.auto; }

// ── Icon helper ───────────────────────────────────────────────────────────────
function iconForTitle(title) {
  const t = title.toLowerCase();
  if (t.includes("overview"))    return "\u{1F9ED}";
  if (t.includes("metric"))      return "\u{1F4CA}";
  if (t.includes("financial"))   return "\u{1F4B0}";
  if (t.includes("transaction")) return "\u{1F4B3}";
  if (t.includes("fee") || t.includes("charge")) return "\u{1F9FE}";
  if (t.includes("date") || t.includes("deadline")) return "\u{1F4C5}";
  if (t.includes("alert") || t.includes("note") || t.includes("risk")) return "\u26A0\uFE0F";
  if (t.includes("conclusion"))  return "\u2705";
  if (t.includes("important"))   return "\u2B50";
  if (t.includes("key point"))   return "\u{1F511}";
  if (t.includes("summary"))     return "\u{1F4CC}";
  if (t.includes("account"))     return "\u{1F3E6}";
  if (t.includes("loan"))        return "\u{1F4B8}";
  if (t.includes("credit"))      return "\u{1F4B3}";
  if (t.includes("invest"))      return "\u{1F4C8}";
  if (t.includes("trend"))       return "\u{1F4C8}";
  if (t.includes("spend"))       return "\u{1F6D2}";
  if (t.includes("analysis"))    return "\u{1F50D}";
  if (t.includes("performan"))   return "\u{1F3AF}";
  if (t.includes("recomm"))      return "\u{1F4A1}";
  if (t.includes("compar"))      return "\u2696\uFE0F";
  if (t.includes("growth"))      return "\u{1F4C8}";
  if (t.includes("risk"))        return "\u26A0\uFE0F";
  if (t.includes("strateg"))     return "\u265F\uFE0F";
  return "\u{1F4C4}";
}

// ── Metric parser ─────────────────────────────────────────────────────────────
function parseMetricLine(rawLine) {
  const line = rawLine.replace(/^[-*]\s+/, "").trim();
  const m = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
  if (m) return { label: m[1].trim(), value: m[2].trim().replace(/\*\*/g, "") };
  const m2 = line.match(/^([A-Za-z][A-Za-z0-9 /&()]{1,32}):\s*(.+)$/);
  if (m2 && m2[2].length < 80) return { label: m2[1].trim(), value: m2[2].trim() };
  return null;
}

// ── Summary → slides ──────────────────────────────────────────────────────────
function parseSummaryToSlides(summaryText) {
  const lines = summaryText.split("\n").map(l => l.trim()).filter(Boolean);
  const slides = [];
  let currentSlide = null;
  const pushSlide = () => { if (currentSlide) slides.push(currentSlide); };

  for (const line of lines) {
    if (line.startsWith("# ") && !line.startsWith("## ")) continue;

    if (line.startsWith("## ")) {
      pushSlide();
      const title = line.replace(/^##\s*/, "").trim();
      currentSlide = { title, icon: iconForTitle(title), bullets: [], metrics: [], body: "" };
      continue;
    }

    if (!currentSlide) currentSlide = { title: "Overview", icon: iconForTitle("Overview"), bullets: [], metrics: [], body: "" };

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const metric = parseMetricLine(line);
      if (metric) currentSlide.metrics.push(metric);
      else currentSlide.bullets.push(line.replace(/^[-*]\s+/, "").replace(/\*\*/g, ""));
      continue;
    }
    if (/^\*\*/.test(line)) {
      const metric = parseMetricLine(line);
      if (metric) { currentSlide.metrics.push(metric); continue; }
    }
    if (line.length > 10) {
      const clean = line.replace(/\*\*/g, "");
      currentSlide.body = currentSlide.body ? `${currentSlide.body} ${clean}` : clean;
    }
  }
  pushSlide();

  if (slides.length === 0) {
    const chunks = summaryText.replace(/\*\*/g, "").split(/\n\n+/).filter(c => c.trim().length > 20);
    chunks.slice(0, 8).forEach((chunk, i) => {
      slides.push({ title: `Part ${i + 1}`, icon: "\u{1F4C4}", bullets: [], metrics: [], body: chunk.trim().slice(0, 400) });
    });
  }
  return slides;
}

function plainTextNotes(slide) {
  const parts = [slide.title];
  if (slide.body) parts.push(slide.body);
  if (slide.bullets.length) parts.push(slide.bullets.join(". "));
  if (slide.metrics.length) parts.push(slide.metrics.map(m => `${m.label}: ${m.value}`).join(". "));
  return parts.join("\n\n").slice(0, 1800);
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

function addFooter(s, COLORS, docTitle, idx, total) {
  addAIFooter(s, COLORS, docTitle, idx, total);
}

function addSlideHeader(s, pres, COLORS, title, icon) {
  // Header occupies y:0–1.3, content starts at 1.4
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 1.3,
    fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 1.3, w: 10, h: 0.04,
    fill: { color: COLORS.accent }, line: { color: COLORS.accent },
  });
  // Subtle right corner decoration — clipped to header only
  s.addShape(pres.shapes.OVAL, {
    x: 8.6, y: -0.6, w: 1.8, h: 1.8,
    fill: { color: COLORS.accent, transparency: 88 },
    line: { color: COLORS.accent, transparency: 88 },
  });
  // Icon
  s.addText(icon, {
    x: 0.35, y: 0.28, w: 0.65, h: 0.65,
    fontSize: 24, align: "center", valign: "middle",
  });
  // Title — capped width so it never overflows
  s.addText(title, {
    x: 1.08, y: 0.2, w: 8.2, h: 0.88,
    fontSize: 22, color: COLORS.textLight, bold: true,
    fontFace: "Cambria", valign: "middle", margin: 0, autoFit: false,
  });
}

// Section divider slide between major sections
function addSectionDivider(pres, COLORS, sectionTitle, sectionSubtitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgDark };

  // Background decorations only (no left bar to avoid overlap)
  s.addShape(pres.shapes.OVAL, { x: 7.5, y: -1.0, w: 4.0, h: 4.0, fill: { color: COLORS.accent, transparency: 88 }, line: { color: COLORS.accent, transparency: 88 } });
  s.addShape(pres.shapes.OVAL, { x: 6.5, y: 3.8, w: 2.5, h: 2.5, fill: { color: COLORS.teal, transparency: 85 }, line: { color: COLORS.teal, transparency: 85 } });
  s.addShape(pres.shapes.OVAL, { x: -0.8, y: 3.5, w: 2.5, h: 2.5, fill: { color: COLORS.teal, transparency: 90 }, line: { color: COLORS.teal, transparency: 90 } });

  // Section label
  s.addText("SECTION", { x: 0.6, y: 1.5, w: 8.5, h: 0.4, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 5, fontFace: "Calibri" });
  // Thin divider line (below label, above title)
  s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 1.98, w: 5.0, h: 0.03, fill: { color: COLORS.accent, transparency: 50 }, line: { color: COLORS.accent, transparency: 50 } });
  // Title — constrained to avoid decoration area
  s.addText(sectionTitle.slice(0, 60), {
    x: 0.6, y: 2.05, w: 7.8, h: 1.3,
    fontSize: 34, color: COLORS.textLight, bold: true, fontFace: "Cambria", valign: "top",
  });
  // Subtitle
  if (sectionSubtitle) {
    s.addText(sectionSubtitle.slice(0, 180), {
      x: 0.6, y: 3.5, w: 7.2, h: 0.9,
      fontSize: 13, color: "8099C0", fontFace: "Calibri", italic: true, valign: "top",
    });
  }

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Section: ${sectionTitle}`);
  return s;
}

// ── Metrics grid (shared) — fixed layout calculations ─────────────────────────
function addMetricsGrid(s, COLORS, metrics, startY, availH) {
  // Cap at 6 items max to prevent overcrowding (was 9)
  const items = metrics.slice(0, 6);
  const cols = items.length <= 2 ? 2 : items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const gap = 0.18;
  const totalW = SAFE.w;
  const cardW = (totalW - gap * (cols - 1)) / cols;
  // Minimum card height 1.1", max 1.6" — ensures values don't overflow
  const cardH = Math.min(Math.max((availH - gap * (rows - 1)) / rows, 1.1), 1.6);

  items.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = SAFE.x1 + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    s.addShape("roundRect", {
      x, y, w: cardW, h: cardH,
      fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.08,
      shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.06 },
    });
    // Left accent bar
    s.addShape("rect", { x, y, w: 0.05, h: cardH, fill: { color: COLORS.teal }, line: { color: COLORS.teal } });
    // Label — uppercase, small, muted — safely within card
    s.addText(m.label.toUpperCase().slice(0, 28), {
      x: x + 0.18, y: y + 0.1, w: cardW - 0.28, h: 0.28,
      fontSize: 8.5, color: COLORS.textMuted, bold: true, fontFace: "Calibri", charSpacing: 0.3,
    });
    // Value — larger but constrained height so it can't overflow
    const valueText = m.value.slice(0, 36);
    const valueFontSize = valueText.length > 20 ? 13 : cardH > 1.3 ? 17 : 15;
    s.addText(valueText, {
      x: x + 0.18, y: y + 0.40, w: cardW - 0.28, h: cardH - 0.52,
      fontSize: valueFontSize, color: COLORS.textDark, bold: true,
      fontFace: "Cambria", valign: "top", autoFit: true,
    });
  });
}

// ── Chart data limiter — prevents unreadable charts ───────────────────────────
// Limit chart data to a readable number of points, keeping highest values
function limitChartData(data, maxPoints = 8) {
  if (data.length <= maxPoints) return data;
  // Sort by value descending, keep top N
  const sorted = [...data].sort((a, b) => b.numericValue - a.numericValue);
  return sorted.slice(0, maxPoints);
}

// ── Bar Chart Slide — fixed outEnd → ctr for stacked, cleaned up right panel ──
function addBarChartSlide(pres, COLORS, chartDataRaw, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CA}");

  // Limit to 8 items max for readability
  const chartData = limitChartData(chartDataRaw, 8);
  const chartColors = [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart6, COLORS.chart7];

  const barData = [{
    name: slideTitle.replace(/ — Chart View$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 16)),
    values: chartData.map(d => d.numericValue),
  }];

  // Chart area — leave room for right panel, stay within safe zone
  s.addChart(pres.ChartType.bar, barData, {
    x: 0.3, y: 1.45, w: 5.9, h: 3.65,
    barDir: "col",
    chartColors: chartColors.slice(0, chartData.length),
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 8,
    dataLabelPosition: "inEnd",   // FIX: was "outEnd" which spills off-slide
    dataLabelColor: COLORS.textLight,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: COLORS.textDark,
    valAxisLabelColor: COLORS.textMuted,
    catGridLine: { style: "none" },
    valGridLine: { style: "dash", color: COLORS.border, size: 0.5 },
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
    showTitle: true,
    title: slideTitle.replace(/ — Chart View$/, '').slice(0, 50),
    titleFontSize: 10,
    titleColor: COLORS.textDark,
  });

  // Right insight panel — x:6.35, width:3.35, y:1.45–5.15
  const rightX = 6.35;
  const panelW = 3.35;
  const total = chartData.reduce((a, b) => a + b.numericValue, 0);
  const maxItem = chartData.reduce((a, b) => a.numericValue > b.numericValue ? a : b);
  const minItem = chartData.reduce((a, b) => a.numericValue < b.numericValue ? a : b);

  // Summary box
  s.addShape("roundRect", {
    x: rightX, y: 1.45, w: panelW, h: 1.55,
    fill: { color: COLORS.cardAlt }, line: { color: COLORS.border }, rectRadius: 0.1,
  });
  s.addText("INSIGHTS", {
    x: rightX + 0.15, y: 1.55, w: panelW - 0.2, h: 0.26,
    fontSize: 8, color: COLORS.accent, bold: true, charSpacing: 1, fontFace: "Calibri",
  });
  s.addText("Highest", { x: rightX + 0.15, y: 1.84, w: panelW - 0.2, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addText(maxItem.label.slice(0, 22), { x: rightX + 0.15, y: 2.04, w: panelW - 0.2, h: 0.26, fontSize: 11, color: COLORS.chart2, bold: true, fontFace: "Cambria" });
  s.addText("Lowest", { x: rightX + 0.15, y: 2.34, w: panelW - 0.2, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addText(minItem.label.slice(0, 22), { x: rightX + 0.15, y: 2.55, w: panelW - 0.2, h: 0.26, fontSize: 11, color: COLORS.chart4, bold: true, fontFace: "Cambria" });

  // Value legend cards — fixed height so they don't overflow footer
  const available = 5.12 - 3.1;  // from 3.1 to footer y
  const cardH = Math.min(available / Math.max(chartData.slice(0, 5).length, 1), 0.52);
  let rightY = 3.10;
  chartData.slice(0, 5).forEach((d, i) => {
    const pct = total > 0 ? ((d.numericValue / total) * 100).toFixed(1) : '0';
    if (rightY + cardH > 5.12) return;  // guard against overflow
    s.addShape("roundRect", {
      x: rightX, y: rightY, w: panelW, h: cardH - 0.03,
      fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.05,
    });
    s.addShape("roundRect", {
      x: rightX + 0.1, y: rightY + cardH * 0.2, w: 0.14, h: 0.14,
      fill: { color: chartColors[i % 7] }, line: { color: chartColors[i % 7] }, rectRadius: 0.03,
    });
    s.addText(d.label.slice(0, 20), {
      x: rightX + 0.32, y: rightY + 0.03, w: panelW - 0.85, h: 0.22,
      fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri", bold: true,
    });
    s.addText(d.value.slice(0, 16), {
      x: rightX + 0.32, y: rightY + 0.22, w: panelW - 0.85, h: cardH - 0.28,
      fontSize: 10, color: COLORS.textDark, fontFace: "Cambria", bold: true,
    });
    s.addText(`${pct}%`, {
      x: rightX + panelW - 0.55, y: rightY + 0.03, w: 0.5, h: cardH - 0.08,
      fontSize: 9, color: chartColors[i % 7], bold: true, align: "right", valign: "middle", fontFace: "Cambria",
    });
    rightY += cardH;
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Bar Chart: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

// Horizontal bar — full width, limit items, use inEnd label position
function addHorizontalBarChartSlide(pres, COLORS, chartDataRaw, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CA}");

  // Limit to 8 items for readability
  const chartData = limitChartData(chartDataRaw, 8);
  const chartColors = [COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart6, COLORS.chart7, COLORS.chart1];
  const barData = [{
    name: slideTitle.replace(/ — Ranking$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 22)),
    values: chartData.map(d => d.numericValue),
  }];

  s.addChart(pres.ChartType.bar, barData, {
    x: 0.3, y: 1.45, w: 9.4, h: 3.65,
    barDir: "bar",
    chartColors: chartColors.slice(0, chartData.length),
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 9,
    dataLabelPosition: "inEnd",   // FIX: inEnd is safe inside bars
    dataLabelColor: COLORS.textLight,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: COLORS.textDark,
    valAxisLabelColor: COLORS.textMuted,
    catGridLine: { style: "none" },
    valGridLine: { style: "dash", color: COLORS.border, size: 0.5 },
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
    showTitle: true,
    title: slideTitle.replace(/ — Ranking$/, '').slice(0, 50),
    titleFontSize: 10,
    titleColor: COLORS.textDark,
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Horizontal Bar / Ranking: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

// Doughnut chart — limit items, fix label position, fix legend overflow
function addPieChartSlide(pres, COLORS, chartDataRaw, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F967}");

  // Limit to 7 items for doughnut readability
  const chartData = limitChartData(chartDataRaw, 7);
  const chartColors = [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5,
    COLORS.chart6, COLORS.chart7, COLORS.chart8, "9B59B6", "E74C3C"];
  const total = chartData.reduce((a, b) => a + b.numericValue, 0);

  const pieData = [{
    name: slideTitle.replace(/ — Distribution$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 18)),
    values: chartData.map(d => d.numericValue),
  }];

  s.addChart(pres.ChartType.doughnut, pieData, {
    x: 0.3, y: 1.42, w: 4.9, h: 3.72,
    chartColors: chartColors.slice(0, chartData.length),
    showLegend: false,
    showValue: false,   // FIX: hide in-chart labels (they overlap on doughnut); use side legend instead
    holeSize: 48,
    showTitle: true,
    title: slideTitle.replace(/ — Distribution$/, '').slice(0, 46),
    titleFontSize: 10,
    titleColor: COLORS.textDark,
  });

  // Center total callout
  s.addShape("roundRect", { x: 1.7, y: 2.85, w: 1.85, h: 0.7, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.08 });
  s.addText("TOTAL", { x: 1.7, y: 2.88, w: 1.85, h: 0.24, fontSize: 7.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true, align: "center" });
  const fmtTot = total >= 1000000 ? `${(total/1000000).toFixed(2)}M` : total >= 1000 ? `${(total/1000).toFixed(1)}K` : total.toFixed(1);
  s.addText(fmtTot, { x: 1.7, y: 3.1, w: 1.85, h: 0.34, fontSize: 12, color: COLORS.textDark, fontFace: "Cambria", bold: true, align: "center" });

  // Side legend — fixed spacing so items don't overflow footer
  const legendX = 5.45;
  const legendW = 4.25;
  let legendY = 1.45;
  // Calculate card height to fit all items above footer (y:5.18)
  const availLegend = 5.18 - legendY;
  const lH = Math.min(availLegend / Math.max(chartData.length, 1), 0.68);

  chartData.forEach((d, i) => {
    const pct = total > 0 ? (d.numericValue / total) * 100 : 0;
    const cc = chartColors[i % 10];
    s.addShape("roundRect", {
      x: legendX, y: legendY, w: legendW, h: lH - 0.05,
      fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.06,
      shadow: { type: "outer", color: "000000", blur: 4, offset: 1, angle: 45, opacity: 0.05 },
    });
    s.addShape("roundRect", {
      x: legendX + 0.1, y: legendY + lH * 0.22, w: 0.18, h: 0.18,
      fill: { color: cc }, line: { color: cc }, rectRadius: 0.04,
    });
    s.addText(d.label.slice(0, 22), {
      x: legendX + 0.38, y: legendY + 0.04, w: legendW - 1.0, h: 0.24,
      fontSize: 9, color: COLORS.textMuted, fontFace: "Calibri", bold: true,
    });
    s.addText(d.value.slice(0, 18), {
      x: legendX + 0.38, y: legendY + 0.26, w: legendW - 1.0, h: lH - 0.35,
      fontSize: 10, color: COLORS.textDark, fontFace: "Cambria", bold: true,
    });
    s.addText(`${pct.toFixed(1)}%`, {
      x: legendX + legendW - 0.62, y: legendY + 0.06, w: 0.58, h: lH - 0.16,
      fontSize: 12, color: cc, fontFace: "Cambria", bold: true, align: "right", valign: "middle",
    });
    // Mini progress bar — only if enough height
    if (lH >= 0.56) {
      const barY = legendY + lH - 0.17;
      s.addShape("roundRect", { x: legendX + 0.38, y: barY, w: legendW - 1.05, h: 0.08, fill: { color: COLORS.border }, line: { color: COLORS.border }, rectRadius: 0.04 });
      const barW = Math.max((pct / 100) * (legendW - 1.05), 0.06);
      s.addShape("roundRect", { x: legendX + 0.38, y: barY, w: barW, h: 0.08, fill: { color: cc }, line: { color: cc }, rectRadius: 0.04 });
    }
    legendY += lH;
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Doughnut Chart: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value} (${Math.round((d.numericValue/total)*100)}%)`).join("\n")}`);
  return s;
}

// Line chart — limit points to prevent unreadable x-axis
function addLineChartSlide(pres, COLORS, chartDataRaw, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4C8}");

  // Limit to 10 points — evenly sampled if more
  let chartData = chartDataRaw;
  if (chartDataRaw.length > 10) {
    const step = Math.ceil(chartDataRaw.length / 10);
    chartData = chartDataRaw.filter((_, i) => i % step === 0).slice(0, 10);
  }

  const lineData = [{
    name: slideTitle.replace(/ — Trend Analysis$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 14)),
    values: chartData.map(d => d.numericValue),
  }];

  // Chart fills most of the slide, insight panel on right
  s.addChart(pres.ChartType.line, lineData, {
    x: 0.3, y: 1.42, w: 6.7, h: 3.68,
    chartColors: [COLORS.chart2],
    showLegend: false,
    showValue: chartData.length <= 7,  // only show values if few points
    dataLabelFontSize: 8,
    dataLabelColor: COLORS.textDark,
    lineDataSymbol: "circle",
    lineDataSymbolSize: 6,
    lineSize: 2,
    catAxisLabelFontSize: 8.5,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: COLORS.textDark,
    valAxisLabelColor: COLORS.textMuted,
    catGridLine: { style: "none" },
    valGridLine: { style: "dash", color: COLORS.border, size: 0.5 },
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
    showTitle: true,
    title: slideTitle.replace(/ — Trend Analysis$/, '').slice(0, 48),
    titleFontSize: 10,
    titleColor: COLORS.textDark,
  });

  // Insight panel — x:7.2 to 9.7
  const panelX = 7.25;
  const panelW = 2.45;
  const maxItem = chartData.reduce((a, b) => a.numericValue > b.numericValue ? a : b);
  const minItem = chartData.reduce((a, b) => a.numericValue < b.numericValue ? a : b);
  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const changePct = first && last && first.numericValue !== 0
    ? (((last.numericValue - first.numericValue) / first.numericValue) * 100).toFixed(1)
    : null;

  s.addShape("roundRect", {
    x: panelX, y: 1.42, w: panelW, h: 3.68,
    fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1,
    shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 },
  });
  s.addText("TREND", {
    x: panelX + 0.12, y: 1.54, w: panelW - 0.2, h: 0.26,
    fontSize: 8, color: COLORS.accent, bold: true, charSpacing: 1, fontFace: "Calibri",
  });

  const insightItems = [
    { label: "Peak", val: maxItem.value.slice(0, 14), sub: maxItem.label.slice(0, 16), color: COLORS.chart2 },
    { label: "Low",  val: minItem.value.slice(0, 14), sub: minItem.label.slice(0, 16), color: COLORS.chart4 },
  ];
  if (changePct !== null) {
    insightItems.push({
      label: "Change",
      val: `${changePct > 0 ? '+' : ''}${changePct}%`,
      sub: `${first.label.slice(0,8)} \u2192 ${last.label.slice(0,8)}`,
      color: parseFloat(changePct) >= 0 ? COLORS.chart2 : COLORS.chart4,
    });
  }

  let iy = 1.88;
  insightItems.forEach(item => {
    s.addText(item.label.toUpperCase(), { x: panelX + 0.12, y: iy, w: panelW - 0.2, h: 0.2, fontSize: 7.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(item.val, { x: panelX + 0.12, y: iy + 0.2, w: panelW - 0.2, h: 0.3, fontSize: 13, color: item.color, fontFace: "Cambria", bold: true });
    s.addText(item.sub, { x: panelX + 0.12, y: iy + 0.49, w: panelW - 0.2, h: 0.2, fontSize: 7.5, color: COLORS.textMuted, fontFace: "Calibri" });
    iy += 0.78;
  });

  // Data point list — only if space remains
  iy += 0.1;
  const dpAvail = 4.98 - iy;
  if (dpAvail > 0.4 && chartData.length <= 10) {
    s.addShape("roundRect", { x: panelX + 0.12, y: iy, w: panelW - 0.2, h: 0.02, fill: { color: COLORS.border }, line: { color: COLORS.border }, rectRadius: 0 });
    iy += 0.1;
    s.addText("DATA", { x: panelX + 0.12, y: iy, w: panelW - 0.2, h: 0.2, fontSize: 7, color: COLORS.textMuted, fontFace: "Calibri", bold: true, charSpacing: 0.3 });
    iy += 0.22;
    const dpH = Math.min(dpAvail / Math.max(chartData.length, 1), 0.28);
    chartData.forEach(d => {
      if (iy + dpH > 5.05) return;
      s.addText(d.label.slice(0, 12), { x: panelX + 0.12, y: iy, w: 1.35, h: dpH, fontSize: 7, color: COLORS.textMuted, fontFace: "Calibri", valign: "middle" });
      s.addText(d.value.slice(0, 10), { x: panelX + 1.35, y: iy, w: 1.0, h: dpH, fontSize: 7.5, color: COLORS.textDark, fontFace: "Cambria", bold: true, align: "right", valign: "middle" });
      iy += dpH;
    });
  }

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Line Trend: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

function addStackedBarChartSlide(pres, COLORS, slides, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CA}");

  // Build multi-series data from multiple slides
  const allLabels = [...new Set(slides.flatMap(sl => sl.metrics.map(m => m.label.slice(0, 16))))].slice(0, 8);
  const seriesData = slides.slice(0, 4).map(sl => ({
    name: sl.title.slice(0, 20),
    labels: allLabels,
    values: allLabels.map(label => {
      const found = sl.metrics.find(m => m.label.slice(0, 16) === label);
      if (!found) return 0;
      const n = parseFloat(found.value.replace(/[₹$€£,\s]/g, "").replace(/[^\d.\-]/g, ""));
      return isNaN(n) ? 0 : Math.abs(n);
    }),
  }));

  if (seriesData.length < 2) {
    const cd = slides[0] ? extractChartData(slides[0].metrics) : null;
    if (cd) return addBarChartSlide(pres, COLORS, cd, slideTitle, docTitle, slideCounter, totalSlides, includeNotes);
    return s;
  }

  s.addChart(pres.ChartType.bar, seriesData, {
    x: 0.3, y: 1.45, w: 9.4, h: 3.65,
    barDir: "col",
    barGrouping: "stacked",
    chartColors: [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4],
    showLegend: true,
    legendPos: "b",
    legendFontSize: 9,
    showValue: false,
    dataLabelPosition: "ctr",  // FIX: must be ctr/inEnd/inBase for stacked
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    catAxisLabelColor: COLORS.textDark,
    valAxisLabelColor: COLORS.textMuted,
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Stacked Bar: ${slideTitle}`);
  return s;
}

function addRadarChartSlide(pres, COLORS, chartDataRaw, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F578}\uFE0F");

  // Radar works best with 5-8 dimensions
  const chartData = chartDataRaw.slice(0, 8);
  const maxVal = Math.max(...chartData.map(d => d.numericValue));
  const radarData = [{
    name: "Score",
    labels: chartData.map(d => d.label.slice(0, 16)),
    values: chartData.map(d => maxVal > 0 ? Math.round((d.numericValue / maxVal) * 100) : 0),
  }];

  s.addChart(pres.ChartType.radar, radarData, {
    x: 0.3, y: 1.42, w: 5.7, h: 3.72,
    chartColors: [COLORS.chart2],
    showLegend: false,
    catAxisLabelFontSize: 9,
    catAxisLabelColor: COLORS.textDark,
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
  });

  // Right insight panel — x:6.25 to 9.7
  const rX = 6.25;
  const rW = 3.45;
  let rY = 1.45;
  const availH = 5.10 - rY;
  const rH = Math.min(availH / Math.max(chartData.length, 1), 0.56);

  chartData.forEach((d, i) => {
    if (rY + rH > 5.12) return;
    const fillPct = maxVal > 0 ? Math.min(Math.round((d.numericValue / maxVal) * 100), 100) : 0;
    s.addShape("roundRect", {
      x: rX, y: rY, w: rW, h: rH - 0.06,
      fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.06,
    });
    s.addText(d.label.slice(0, 24), {
      x: rX + 0.12, y: rY + 0.05, w: rW - 0.55, h: 0.22,
      fontSize: 8.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true,
    });
    const barBgY = rY + (rH - 0.06) - 0.19;
    s.addShape("roundRect", { x: rX + 0.12, y: barBgY, w: rW - 0.55, h: 0.14, fill: { color: COLORS.border }, line: { color: COLORS.border }, rectRadius: 0.07 });
    const barFillW = Math.max((fillPct / 100) * (rW - 0.55), 0.08);
    s.addShape("roundRect", { x: rX + 0.12, y: barBgY, w: barFillW, h: 0.14, fill: { color: COLORS.chart2 }, line: { color: COLORS.chart2 }, rectRadius: 0.07 });
    s.addText(d.value.slice(0, 12), {
      x: rX + rW - 0.5, y: rY + 0.04, w: 0.42, h: rH - 0.2,
      fontSize: 8.5, color: COLORS.chart2, fontFace: "Cambria", bold: true, align: "right", valign: "top",
    });
    rY += rH;
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Radar Analysis: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

// ── Extract numeric chart data ────────────────────────────────────────────────
function extractChartData(metrics) {
  const result = [];
  for (const m of metrics) {
    const cleaned = m.value.replace(/[₹$€£,\s]/g, "").replace(/[^\d.\-]/g, "");
    const num = parseFloat(cleaned);
    if (!isNaN(num) && isFinite(num) && num !== 0) {
      result.push({ label: m.label, value: m.value, numericValue: Math.abs(num) });
    }
  }
  return result.length >= 2 ? result : null;
}

// ── KPI Dashboard slide — fixed card sizing and text overflow ─────────────────
function addKpiSlide(pres, COLORS, metrics, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgDark };

  // Background decorations
  s.addShape(pres.shapes.OVAL, { x: 7.5, y: -0.8, w: 3.2, h: 3.2, fill: { color: COLORS.accent, transparency: 80 }, line: { color: COLORS.accent, transparency: 80 } });
  s.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.3, w: 2.0, h: 2.0, fill: { color: COLORS.teal, transparency: 85 }, line: { color: COLORS.teal, transparency: 85 } });

  // Header
  s.addText("KEY PERFORMANCE INDICATORS", { x: 0.4, y: 0.22, w: 9.2, h: 0.42, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 3, fontFace: "Calibri" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.67, w: 9.2, h: 0.03, fill: { color: COLORS.accent, transparency: 60 }, line: { color: COLORS.accent, transparency: 60 } });

  // Cap at 6 KPIs, use 2 cols if <=4, else 3 cols
  const items = metrics.slice(0, 6);
  const cols = items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const gap = 0.18;
  const cardW = (9.2 - gap * (cols - 1)) / cols;
  // Reserve footer space — cards must end above y:5.22
  const availCardH = (5.18 - 0.82 - gap * (rows - 1)) / rows;
  const cardH = Math.min(Math.max(availCardH, 1.0), 1.65);
  const CARD_COLORS = [COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart1, COLORS.teal];

  items.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.4 + col * (cardW + gap);
    const y = 0.82 + row * (cardH + gap);
    const cc = CARD_COLORS[i % CARD_COLORS.length];

    s.addShape("roundRect", {
      x, y, w: cardW, h: cardH,
      fill: { color: cc, transparency: 88 }, line: { color: cc, transparency: 50 }, rectRadius: 0.12,
    });
    s.addShape("rect", { x, y, w: 0.05, h: cardH, fill: { color: cc }, line: { color: cc } });

    // Label — uppercase, small
    s.addText(m.label.toUpperCase().slice(0, 28), {
      x: x + 0.18, y: y + 0.1, w: cardW - 0.3, h: 0.28,
      fontSize: 8.5, color: cc, bold: true, fontFace: "Calibri", charSpacing: 0.3,
    });
    // Value — font size scaled to card height and text length
    const valText = m.value.slice(0, 30);
    const valSize = valText.length > 18 ? 12 : cardH > 1.3 ? 17 : 14;
    s.addText(valText, {
      x: x + 0.18, y: y + 0.42, w: cardW - 0.28, h: cardH - 0.56,
      fontSize: valSize, color: COLORS.textLight, bold: true,
      fontFace: "Cambria", valign: "top", autoFit: true,
    });
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes("KPI Dashboard\n" + metrics.map(m => `${m.label}: ${m.value}`).join("\n"));
  return s;
}

// ── Timeline slide — fixed item spacing ───────────────────────────────────────
function addTimelineSlide(pres, COLORS, metrics, title, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, title, "\u{1F4C5}");

  // Cap at 7 items to keep spacing comfortable
  const items = metrics.slice(0, 7);
  const dotColors = [COLORS.chart2, COLORS.accent, COLORS.teal, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart6];
  const lineX = 0.85;
  const startY = 1.5;
  const endY = 5.12;
  const totalH = endY - startY;
  const itemH = totalH / Math.max(items.length, 1);

  // Vertical spine
  s.addShape(pres.shapes.RECTANGLE, { x: lineX - 0.01, y: startY, w: 0.02, h: totalH - 0.15, fill: { color: COLORS.border }, line: { color: COLORS.border } });

  items.forEach((m, i) => {
    const y = startY + i * itemH;
    const dotC = dotColors[i % dotColors.length];
    // Node circles
    s.addShape(pres.shapes.OVAL, { x: lineX - 0.14, y: y + 0.04, w: 0.28, h: 0.28, fill: { color: dotC, transparency: 70 }, line: { color: dotC, transparency: 70 } });
    s.addShape(pres.shapes.OVAL, { x: lineX - 0.08, y: y + 0.10, w: 0.16, h: 0.16, fill: { color: dotC }, line: { color: dotC } });
    // Label on left of content box
    s.addText(m.label.slice(0, 24), {
      x: 1.1, y: y + 0.02, w: 4.0, h: 0.26,
      fontSize: 9.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true,
    });
    // Value card
    const cardH = Math.max(itemH * 0.74, 0.28);
    s.addShape("roundRect", { x: 5.3, y: y, w: 4.4, h: cardH, fill: { color: COLORS.cardBg }, line: { color: dotC, transparency: 50 }, rectRadius: 0.06 });
    s.addShape("rect", { x: 5.3, y, w: 0.04, h: cardH, fill: { color: dotC }, line: { color: dotC } });
    s.addText(m.value.slice(0, 50), {
      x: 5.46, y: y + 0.03, w: 4.12, h: cardH - 0.06,
      fontSize: 11, color: COLORS.textDark, fontFace: "Cambria", bold: true, valign: "middle",
    });
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Timeline: ${title}\n` + metrics.map(m => `${m.label}: ${m.value}`).join("\n"));
  return s;
}

// ── Comparison slide — fixed column proportions ────────────────────────────────
function addComparisonSlide(pres, COLORS, slideA, slideB, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, "Comparative Analysis", "\u2696\uFE0F");

  const colW = 4.6;
  const colH = 3.75;
  const colY = 1.42;

  // Left column
  s.addShape("roundRect", { x: 0.25, y: colY, w: colW, h: colH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
  s.addShape("rect", { x: 0.25, y: colY, w: colW, h: 0.04, fill: { color: COLORS.chart2 }, line: { color: COLORS.chart2 } });
  s.addText(slideA.title.slice(0, 28), { x: 0.38, y: colY + 0.08, w: colW - 0.2, h: 0.33, fontSize: 12, color: COLORS.textDark, bold: true, fontFace: "Cambria" });

  const itemsA = slideA.metrics.slice(0, 5);
  const itemHa = (colH - 0.45) / Math.max(itemsA.length, 1);
  itemsA.forEach((m, i) => {
    const y = colY + 0.44 + i * itemHa;
    s.addText(m.label.toUpperCase().slice(0, 24), { x: 0.38, y, w: colW - 0.2, h: 0.2, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(m.value.slice(0, 24), { x: 0.38, y: y + 0.2, w: colW - 0.2, h: itemHa - 0.26, fontSize: 13, color: COLORS.chart2, fontFace: "Cambria", bold: true });
  });

  // Right column
  s.addShape("roundRect", { x: 5.15, y: colY, w: colW, h: colH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
  s.addShape("rect", { x: 5.15, y: colY, w: colW, h: 0.04, fill: { color: COLORS.chart3 }, line: { color: COLORS.chart3 } });
  s.addText(slideB.title.slice(0, 28), { x: 5.28, y: colY + 0.08, w: colW - 0.2, h: 0.33, fontSize: 12, color: COLORS.textDark, bold: true, fontFace: "Cambria" });

  const itemsB = slideB.metrics.slice(0, 5);
  const itemHb = (colH - 0.45) / Math.max(itemsB.length, 1);
  itemsB.forEach((m, i) => {
    const y = colY + 0.44 + i * itemHb;
    s.addText(m.label.toUpperCase().slice(0, 24), { x: 5.28, y, w: colW - 0.2, h: 0.2, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(m.value.slice(0, 24), { x: 5.28, y: y + 0.2, w: colW - 0.2, h: itemHb - 0.26, fontSize: 13, color: COLORS.chart3, fontFace: "Cambria", bold: true });
  });

  // VS badge in center
  s.addShape(pres.shapes.OVAL, { x: 4.63, y: 2.88, w: 0.74, h: 0.74, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });
  s.addText("VS", { x: 4.63, y: 2.88, w: 0.74, h: 0.74, fontSize: 10, color: COLORS.accent, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Comparison: ${slideA.title} vs ${slideB.title}`);
  return s;
}

// ── Data Table slide — fixed row height and overflow prevention ───────────────
function addDataTableSlide(pres, COLORS, metrics, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CB}");

  // Cap rows to prevent footer overlap
  const maxRows = 10;
  const items = metrics.slice(0, maxRows);
  const tableX = SAFE.x1;
  const tableY = 1.46;
  const headerH = 0.38;
  // Calculate row height to fit within safe zone
  const availH = 5.15 - tableY - headerH;
  const rowH = Math.min(availH / Math.max(items.length, 1), 0.42);

  // Header row
  s.addShape("roundRect", { x: tableX, y: tableY, w: SAFE.w, h: headerH, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark }, rectRadius: 0.04 });
  s.addText("METRIC", { x: tableX + 0.18, y: tableY, w: 5.5, h: headerH, fontSize: 9.5, color: COLORS.accent, bold: true, fontFace: "Calibri", charSpacing: 1, valign: "middle" });
  s.addText("VALUE", { x: tableX + 5.85, y: tableY, w: 3.4, h: headerH, fontSize: 9.5, color: COLORS.accent, bold: true, fontFace: "Calibri", charSpacing: 1, valign: "middle" });

  items.forEach((m, i) => {
    const y = tableY + headerH + i * rowH;
    const isAlt = i % 2 === 1;
    s.addShape("rect", { x: tableX, y, w: SAFE.w, h: rowH, fill: { color: isAlt ? COLORS.cardAlt : COLORS.cardBg }, line: { color: COLORS.border } });
    // Accent dot
    s.addShape(pres.shapes.OVAL, { x: tableX + 0.1, y: y + rowH * 0.35, w: 0.09, h: 0.09, fill: { color: COLORS.teal }, line: { color: COLORS.teal } });
    s.addText(m.label.slice(0, 50), {
      x: tableX + 0.28, y, w: 5.4, h: rowH,
      fontSize: 10.5, color: COLORS.textDark, fontFace: "Calibri", valign: "middle",
    });
    s.addText(m.value.slice(0, 30), {
      x: tableX + 5.85, y, w: 3.4, h: rowH,
      fontSize: 10.5, color: COLORS.chart2, fontFace: "Cambria", bold: true, valign: "middle",
    });
  });

  // Bottom accent line
  const bottomY = tableY + headerH + items.length * rowH;
  if (bottomY < 5.18) {
    s.addShape("rect", { x: tableX, y: bottomY - 0.02, w: SAFE.w, h: 0.03, fill: { color: COLORS.accent, transparency: 60 }, line: { color: COLORS.accent, transparency: 60 } });
  }

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Data Table: ${slideTitle}\n${items.map(m => `${m.label}: ${m.value}`).join("\n")}`);
  return s;
}

// ── Core deck builder ─────────────────────────────────────────────────────────
function buildDeck({ summary, docTitle, heroTitle, theme, detail, chartDensityConfig, includeAgendaOpt, includeNotes }) {
  const COLORS = theme;
  const rawSlides = parseSummaryToSlides(summary);

  // Separate conclusion slide
  const conclusionIdx = rawSlides.findIndex(sl => sl.title.toLowerCase().includes("conclusion"));
  let conclusionSlide = null;
  if (conclusionIdx !== -1) {
    conclusionSlide = rawSlides[conclusionIdx];
    rawSlides.splice(conclusionIdx, 1);
  }

  const contentSlides = rawSlides;

  // ── Detect content types ──────────────────────────────────────────────────
  const isBankingContent = rawSlides.some(sl =>
    /key metrics|financial summary|account overview|key transactions|fees|alerts/i.test(sl.title)
  );

  const chartCandidates = contentSlides.filter(sl => {
    const cd = extractChartData(sl.metrics);
    return cd && cd.length >= 2;
  });

  const dateCandidates = contentSlides.filter(sl =>
    /date|deadline|period|schedule/i.test(sl.title) && sl.metrics.length >= 2
  );

  const kpiCandidate = contentSlides.find(sl =>
    sl.metrics.length >= 4 && /metric|overview|summary|balance|account|kpi|perform/i.test(sl.title)
  );

  const tableCandidate = contentSlides.find(sl =>
    sl.metrics.length >= 6 && !chartCandidates.includes(sl)
  );

  const compCandidates = contentSlides.filter(sl => sl.metrics.length >= 3);
  const lineCandidates = chartCandidates.filter(sl => extractChartData(sl.metrics) && extractChartData(sl.metrics).length >= 4);
  const radarCandidates = contentSlides.filter(sl =>
    sl.metrics.length >= 5 && /analysis|score|rate|performance|compare|assess/i.test(sl.title)
  );

  const maxCharts = chartDensityConfig.maxCharts;
  const forceCharts = chartDensityConfig.forceCharts;

  const showAgenda = includeAgendaOpt && contentSlides.length > 2;
  const hasKpi = !!(kpiCandidate && (isBankingContent || forceCharts));
  const hasTimeline = dateCandidates.length > 0;
  const hasDataTable = !!(tableCandidate && (isBankingContent || forceCharts));
  const hasComparison = compCandidates.length >= 2 && (isBankingContent || forceCharts);
  const hasSectionDividers = contentSlides.length >= 4;

  const numBarPie  = Math.min(chartCandidates.length, Math.ceil(maxCharts * 0.5));
  const numLine    = Math.min(lineCandidates.length, Math.ceil(maxCharts * 0.25));
  const numRadar   = Math.min(radarCandidates.length, Math.ceil(maxCharts * 0.15));
  const numStacked = (chartCandidates.length >= 3 && maxCharts > 2) ? 1 : 0;
  const totalExtraCharts = Math.min(numBarPie + numLine + numRadar + numStacked, maxCharts);

  const numDividers = hasSectionDividers ? Math.floor(contentSlides.length / 4) : 0;

  const totalSlides =
    1
    + (showAgenda ? 1 : 0)
    + (hasKpi ? 1 : 0)
    + numDividers
    + contentSlides.length
    + totalExtraCharts
    + (hasTimeline ? 1 : 0)
    + (hasDataTable ? 1 : 0)
    + (hasComparison ? 1 : 0)
    + (conclusionSlide ? 1 : 0)
    + 1;

  let slideCounter = 1;
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = docTitle;

  // ── COVER SLIDE ───────────────────────────────────────────────────────────
  const coverSlide = pres.addSlide();
  coverSlide.background = { color: COLORS.bgDark };

  coverSlide.addShape(pres.shapes.OVAL, { x: 7.8, y: -1.0, w: 3.5, h: 3.5, fill: { color: COLORS.accent, transparency: 75 }, line: { color: COLORS.accent, transparency: 75 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.0, w: 2.0, h: 2.0, fill: { color: COLORS.teal, transparency: 80 }, line: { color: COLORS.teal, transparency: 80 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: 4.5, y: 3.5, w: 1.2, h: 1.2, fill: { color: COLORS.chart3, transparency: 85 }, line: { color: COLORS.chart3, transparency: 85 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: 6.0, y: 2.5, w: 0.6, h: 0.6, fill: { color: COLORS.chart6, transparency: 80 }, line: { color: COLORS.chart6, transparency: 80 } });

  coverSlide.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 2.8, w: 1.6, h: 0.05, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });

  coverSlide.addText("AI DOCUMENT SUMMARY", { x: 0.6, y: 1.35, w: 8.8, h: 0.5, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 4, fontFace: "Calibri" });
  coverSlide.addText(heroTitle, { x: 0.6, y: 1.82, w: 8.8, h: 1.15, fontSize: 34, color: COLORS.textLight, bold: true, fontFace: "Cambria", lineSpacing: 40 });
  coverSlide.addText("Powered by AI Document Summarizer", { x: 0.6, y: 3.05, w: 8.8, h: 0.45, fontSize: 13, color: "A0B0D0", fontFace: "Calibri" });

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalContentSections = contentSlides.length + (conclusionSlide ? 1 : 0);
  coverSlide.addText(`${today}  \u2022  ${totalContentSections} sections  \u2022  ${totalSlides} slides  \u2022  AI-generated`, {
    x: 0.6, y: 4.75, w: 8.8, h: 0.42, fontSize: 11, color: "6A80A8", fontFace: "Calibri",
  });
  if (includeNotes) coverSlide.addNotes(`Cover slide for "${docTitle}". Generated ${today}. ${totalContentSections} sections, ${totalSlides} total slides.`);

  // ── AGENDA SLIDE ──────────────────────────────────────────────────────────
  if (showAgenda) {
    const agenda = pres.addSlide();
    agenda.background = { color: COLORS.bgLight };
    addSlideHeader(agenda, pres, COLORS, "What's Inside", "\u{1F5C2}\uFE0F");

    const all = conclusionSlide ? [...contentSlides, conclusionSlide] : contentSlides;
    const cols = 2;
    const rows = Math.ceil(all.length / cols);
    const gap = 0.18;
    const cardW = (SAFE.w - gap) / cols;
    // Card height must fit all rows within safe zone
    const availH = 5.12 - SAFE.y1;
    const cardH = Math.min((availH - gap * (rows - 1)) / rows, 0.82);

    all.forEach((sec, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = SAFE.x1 + col * (cardW + gap);
      const y = SAFE.y1 + row * (cardH + gap);
      if (y + cardH > 5.14) return;  // guard overflow
      agenda.addShape("roundRect", { x, y, w: cardW, h: cardH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.08 });
      agenda.addShape("rect", { x, y, w: 0.04, h: cardH, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
      agenda.addText(sec.icon, { x: x + 0.12, y, w: 0.5, h: cardH, fontSize: 17, valign: "middle", align: "center" });
      agenda.addText(`${i + 1}.  ${sec.title}`, {
        x: x + 0.58, y: y + 0.04, w: cardW - 0.7, h: cardH - 0.08,
        fontSize: 11.5, color: COLORS.textDark, bold: true, fontFace: "Calibri", valign: "middle",
      });
    });
    addFooter(agenda, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) agenda.addNotes(`Agenda: ${all.map(sl => sl.title).join(", ")}`);
  }

  // ── KPI DASHBOARD ────────────────────────────────────────────────────────
  if (hasKpi) {
    addKpiSlide(pres, COLORS, kpiCandidate.metrics, docTitle, ++slideCounter, totalSlides, includeNotes);
  }

  // ── CONTENT SLIDES ────────────────────────────────────────────────────────
  const chartSlidesSoFar = new Set();
  let barPieCount = 0;
  let lineCount = 0;
  let radarCount = 0;
  let stackedDone = false;
  let dividerCount = 0;

  contentSlides.forEach((slide, slideIdx) => {
    // Section divider every 4 slides
    if (hasSectionDividers && slideIdx > 0 && slideIdx % 4 === 0 && dividerCount < numDividers) {
      const nextSection = contentSlides[slideIdx];
      addSectionDivider(
        pres, COLORS,
        nextSection.title,
        nextSection.body ? nextSection.body.slice(0, 140) : "",
        docTitle, ++slideCounter, totalSlides, includeNotes
      );
      dividerCount++;
    }

    const s = pres.addSlide();
    s.background = { color: COLORS.bgLight };
    addSlideHeader(s, pres, COLORS, slide.title, slide.icon);

    const hasMetrics = slide.metrics.length >= 3;
    const hasBullets = slide.bullets.length > 0;
    const hasBody    = slide.body && slide.body.length > 20;
    const maxB    = detail.maxBullets;
    const bodyLen = detail.bodyLen;

    // Content starts at y:1.4, ends at y:5.18 (footer at 5.25)
    const contentY = SAFE.y1;
    const contentH = 5.18 - contentY;  // 3.78"

    if (hasMetrics) {
      const leftoverText = hasBody
        ? slide.body.slice(0, 200)
        : (hasBullets ? slide.bullets.slice(0, 2).join(" \u2022 ").slice(0, 200) : "");
      const noteH = leftoverText ? 0.55 : 0;
      const gridH = contentH - noteH - (leftoverText ? 0.12 : 0);
      addMetricsGrid(s, COLORS, slide.metrics, contentY, gridH);
      if (leftoverText) {
        const noteY = contentY + gridH + 0.1;
        s.addShape("roundRect", { x: SAFE.x1, y: noteY, w: SAFE.w, h: noteH, fill: { color: COLORS.cardAlt }, line: { color: COLORS.border }, rectRadius: 0.06 });
        s.addText(leftoverText, {
          x: SAFE.x1 + 0.18, y: noteY + 0.05, w: SAFE.w - 0.3, h: noteH - 0.1,
          fontSize: 10.5, italic: true, color: COLORS.textMuted, fontFace: "Calibri", valign: "middle",
        });
      }
    } else if (hasBullets && hasBody) {
      const bulletItems = slide.bullets.slice(0, maxB).map((b, i) => ({
        text: b.slice(0, 130),
        options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < Math.min(slide.bullets.length, maxB) - 1, fontSize: 12.5, color: COLORS.textDark, paraSpaceAfter: 6 },
      }));
      s.addShape("roundRect", { x: SAFE.x1, y: contentY, w: 5.55, h: contentH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      s.addText(bulletItems, { x: SAFE.x1 + 0.2, y: contentY + 0.15, w: 5.15, h: contentH - 0.3, fontFace: "Calibri", valign: "top" });
      s.addShape("roundRect", { x: 6.1, y: contentY, w: 3.6, h: contentH, fill: { color: COLORS.cardAlt }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      s.addText("KEY INSIGHT", { x: 6.24, y: contentY + 0.14, w: 3.32, h: 0.3, fontSize: 9.5, color: COLORS.accent, bold: true, fontFace: "Calibri", charSpacing: 1 });
      s.addShape(pres.shapes.RECTANGLE, { x: 6.24, y: contentY + 0.48, w: 3.32, h: 0.02, fill: { color: COLORS.accent, transparency: 70 }, line: { color: COLORS.accent, transparency: 70 } });
      s.addText(slide.body.slice(0, bodyLen), {
        x: 6.24, y: contentY + 0.55, w: 3.32, h: contentH - 0.65,
        fontSize: 11.5, color: COLORS.textDark, fontFace: "Calibri", valign: "top",
      });
    } else if (hasBullets) {
      const bullets = slide.bullets.slice(0, maxB);
      const cols2 = bullets.length > 5 ? 2 : 1;
      s.addShape("roundRect", { x: SAFE.x1, y: contentY, w: SAFE.w, h: contentH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      if (cols2 === 2) {
        const half = Math.ceil(bullets.length / 2);
        const makeItems = (arr) => arr.map((b, i) => ({
          text: b.slice(0, 110),
          options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < arr.length - 1, fontSize: 12.5, color: COLORS.textDark, paraSpaceAfter: 8 },
        }));
        s.addText(makeItems(bullets.slice(0, half)), { x: SAFE.x1 + 0.2, y: contentY + 0.15, w: 4.45, h: contentH - 0.3, fontFace: "Calibri", valign: "top" });
        s.addShape(pres.shapes.RECTANGLE, { x: 5.0, y: contentY + 0.18, w: 0.02, h: contentH - 0.38, fill: { color: COLORS.border }, line: { color: COLORS.border } });
        s.addText(makeItems(bullets.slice(half)), { x: 5.12, y: contentY + 0.15, w: 4.45, h: contentH - 0.3, fontFace: "Calibri", valign: "top" });
      } else {
        const bulletItems = bullets.map((b, i) => ({
          text: b.slice(0, 150),
          options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < bullets.length - 1, fontSize: 13.5, color: COLORS.textDark, paraSpaceAfter: 10 },
        }));
        s.addText(bulletItems, { x: SAFE.x1 + 0.2, y: contentY + 0.18, w: SAFE.w - 0.3, h: contentH - 0.3, fontFace: "Calibri", valign: "top" });
      }
    } else if (hasBody) {
      s.addShape("roundRect", { x: SAFE.x1, y: contentY, w: SAFE.w, h: contentH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      s.addShape(pres.shapes.RECTANGLE, { x: SAFE.x1, y: contentY, w: 0.05, h: contentH, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
      s.addText(slide.body.slice(0, bodyLen * 2), {
        x: SAFE.x1 + 0.22, y: contentY + 0.15, w: SAFE.w - 0.3, h: contentH - 0.28,
        fontSize: 13.5, color: COLORS.textDark, fontFace: "Calibri", valign: "top", lineSpacing: 22,
      });
    } else {
      s.addText("No additional details in this section.", {
        x: SAFE.x1, y: 3.0, w: SAFE.w, h: 0.6,
        fontSize: 13, italic: true, color: COLORS.textMuted, fontFace: "Calibri", align: "center",
      });
    }

    addAIFooter(s, COLORS, docTitle, slideCounter, totalSlides);
    if (includeNotes && slide.speakerNotes) s.addNotes(slide.speakerNotes);
  });

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

// ── AI Presentation Theme Mapper ──────────────────────────────────────────────
// ── AI Presentation Theme Mapper ──────────────────────────────────────────────
const WIZARD_THEME_MAP = {
  "Professional":     "navyGold",
  "Modern":           "midnightBlue",
  "Minimal":          "tealSlate",
  "Corporate":        "corporatePurple",
  "Creative":         "forestGreen",
  "Dark":             "charcoalRuby",
  "Finance":          "financeGold",
  "Healthcare":       "healthcareMint",
  // backwards compat
  "Glassmorphism":    "midnightBlue",
  "Apple":            "tealSlate",
  "Microsoft Fluent": "navyGold",
  "Google Material":  "tealSlate",
  "Luxury":           "charcoalRuby",
  "AI Futuristic":    "midnightBlue",
  "Startup":          "forestGreen",
  "Education":        "forestGreen",
};

// ── Upgraded 8-theme palette ──────────────────────────────────────────────────
const AI_THEMES = {
  navyGold: {
    label: "Professional", bgDark: "1E2761", bgLight: "F7F9FC", bgMid: "EEF4FF",
    accent: "C9A84C", teal: "2FA4A0", textLight: "FFFFFF", textDark: "1A1A2E",
    textMuted: "5A6A8A", cardBg: "FFFFFF", cardAlt: "EEF4FF", border: "E0E8F0",
    chart1:"1E2761",chart2:"C9A84C",chart3:"2FA4A0",chart4:"E74C3C",chart5:"8E44AD",
    chart6:"2ECC71",chart7:"E67E22",chart8:"1ABC9C",gradient1:"1E2761",gradient2:"2A3A9E",
  },
  midnightBlue: {
    label: "Modern", bgDark: "0D1B2A", bgLight: "F0F6FF", bgMid: "E0EEFF",
    accent: "00B4D8", teal: "0077B6", textLight: "FFFFFF", textDark: "0D1B2A",
    textMuted: "4A6080", cardBg: "FFFFFF", cardAlt: "E0EEFF", border: "C8DCFF",
    chart1:"0D1B2A",chart2:"00B4D8",chart3:"0077B6",chart4:"E63946",chart5:"2A9D8F",
    chart6:"E9C46A",chart7:"F4A261",chart8:"264653",gradient1:"0D1B2A",gradient2:"143055",
  },
  tealSlate: {
    label: "Minimal", bgDark: "0F3D3E", bgLight: "F5FAFA", bgMid: "E6F5F3",
    accent: "3FBFAE", teal: "1F7A72", textLight: "FFFFFF", textDark: "17302F",
    textMuted: "4E6E6C", cardBg: "FFFFFF", cardAlt: "E6F5F3", border: "D6EAE8",
    chart1:"0F3D3E",chart2:"3FBFAE",chart3:"F39C12",chart4:"E74C3C",chart5:"8E44AD",
    chart6:"2ECC71",chart7:"E67E22",chart8:"1ABC9C",gradient1:"0F3D3E",gradient2:"1A5F60",
  },
  corporatePurple: {
    label: "Corporate", bgDark: "1A1A2E", bgLight: "F8F7FF", bgMid: "EEE8FF",
    accent: "7C3AED", teal: "6D28D9", textLight: "FFFFFF", textDark: "1A1A2E",
    textMuted: "5A5080", cardBg: "FFFFFF", cardAlt: "EEE8FF", border: "DDD0FF",
    chart1:"1A1A2E",chart2:"7C3AED",chart3:"06B6D4",chart4:"EF4444",chart5:"10B981",
    chart6:"F59E0B",chart7:"EC4899",chart8:"14B8A6",gradient1:"1A1A2E",gradient2:"2D1B6B",
  },
  forestGreen: {
    label: "Creative", bgDark: "1B4332", bgLight: "F6FDF9", bgMid: "E8F5EE",
    accent: "F4A261", teal: "40916C", textLight: "FFFFFF", textDark: "1B4332",
    textMuted: "4A7C59", cardBg: "FFFFFF", cardAlt: "E8F5EE", border: "C8E6D4",
    chart1:"1B4332",chart2:"F4A261",chart3:"40916C",chart4:"E63946",chart5:"457B9D",
    chart6:"E9C46A",chart7:"2A9D8F",chart8:"264653",gradient1:"1B4332",gradient2:"2D6A4F",
  },
  charcoalRuby: {
    label: "Dark", bgDark: "0F0F0F", bgLight: "F9F7F7", bgMid: "F0E8E8",
    accent: "C0392B", teal: "8B4513", textLight: "FFFFFF", textDark: "0F0F0F",
    textMuted: "5A4A48", cardBg: "FFFFFF", cardAlt: "F0E8E8", border: "E0D0CE",
    chart1:"0F0F0F",chart2:"C0392B",chart3:"E67E22",chart4:"27AE60",chart5:"2980B9",
    chart6:"8E44AD",chart7:"F39C12",chart8:"1ABC9C",gradient1:"0F0F0F",gradient2:"2C0A0A",
  },
  financeGold: {
    label: "Finance", bgDark: "0A2342", bgLight: "F8F6EE", bgMid: "EEE8D4",
    accent: "D4AF37", teal: "B8960C", textLight: "FFFFFF", textDark: "0A2342",
    textMuted: "4A5068", cardBg: "FFFFFF", cardAlt: "EEE8D4", border: "DDD0A0",
    chart1:"0A2342",chart2:"D4AF37",chart3:"C0A030",chart4:"C0392B",chart5:"2E86AB",
    chart6:"27AE60",chart7:"E67E22",chart8:"8E44AD",gradient1:"0A2342",gradient2:"143060",
  },
  healthcareMint: {
    label: "Healthcare", bgDark: "1B3A4B", bgLight: "F4FBF8", bgMid: "E0F2EC",
    accent: "52B788", teal: "40916C", textLight: "FFFFFF", textDark: "1B3A4B",
    textMuted: "456070", cardBg: "FFFFFF", cardAlt: "E0F2EC", border: "C0E0D4",
    chart1:"1B3A4B",chart2:"52B788",chart3:"40916C",chart4:"E76F51",chart5:"457B9D",
    chart6:"E9C46A",chart7:"2A9D8F",chart8:"264653",gradient1:"1B3A4B",gradient2:"264C60",
  },
};

function resolveAITheme(key) {
  return AI_THEMES[WIZARD_THEME_MAP[key] || key] || AI_THEMES.navyGold;
}

// ── MASTER LAYOUT REGISTRY (Parsed from Master Presentation Template) ─────────
const MASTER_LAYOUT_REGISTRY = {
  Cover: {
    id: "Cover",
    bg: "F5A623",
    gridLineColor: "0F1B38", gridTransparency: 92,
    watermark: { text: "R", fontFace: "Cambria", fontSize: 220, color: "0F1B38", transparency: 88, x: 6.0, y: -0.5, w: 4.5, h: 5.5 },
    sectionTag: { fontFace: "Calibri", fontSize: 10, bold: true, charSpacing: 4, color: "0F1B38", x: 0.6, y: 1.1, w: 5.0, h: 0.3 },
    title: { fontFace: "Cambria", fontSize: 34, bold: true, color: "0F1B38", lineSpacing: 40, x: 0.6, y: 1.6, w: 6.5, h: 1.3 },
    subtitle: { fontFace: "Calibri", fontSize: 18, color: "0F1B38", x: 0.6, y: 3.0, w: 6.5, h: 0.8 },
    divider: { x: 0.6, y: 3.9, w: 2.2, h: 0.04, color: "0F1B38" },
    footer: { fontFace: "Calibri", fontSize: 10.5, color: "0F1B38", x: 0.6, y: 4.8, w: 7.0, h: 0.35 },
    pagePill: { fontFace: "Calibri", fontSize: 10.5, bold: true, color: "0F1B38", x: 9.0, y: 4.8, w: 0.6, h: 0.35 }
  },

  SectionDivider: {
    id: "Section Divider",
    bg: "F5A623",
    gridLineColor: "0F1B38", gridTransparency: 92,
    watermark: { fontFace: "Cambria", fontSize: 220, color: "0F1B38", transparency: 88, x: 6.0, y: -0.5, w: 4.5, h: 5.5 },
    sectionTag: { fontFace: "Calibri", fontSize: 10, bold: true, charSpacing: 4, color: "0F1B38", x: 0.6, y: 1.1, w: 5.0, h: 0.3 },
    title: { fontFace: "Cambria", fontSize: 34, bold: true, color: "0F1B38", lineSpacing: 40, x: 0.6, y: 1.6, w: 6.5, h: 1.3 },
    subtitle: { fontFace: "Calibri", fontSize: 18, color: "0F1B38", x: 0.6, y: 3.0, w: 6.5, h: 0.8 },
    divider: { x: 0.6, y: 3.9, w: 2.2, h: 0.04, color: "0F1B38" },
    pagePill: { fontFace: "Calibri", fontSize: 10.5, bold: true, color: "0F1B38", x: 9.0, y: 4.8, w: 0.6, h: 0.35 }
  },

  Header: {
    bg: "0F1B38",
    bar: { x: 0, y: 0, w: 10, h: 1.3 },
    accentLine: { x: 0, y: 1.3, w: 10, h: 0.04, color: "F5A623" },
    ovalOrnament: { x: 8.6, y: -0.6, w: 1.8, h: 1.8, color: "F5A623", transparency: 88 },
    title: { fontFace: "Cambria", fontSize: 18, bold: true, color: "FFFFFF" },
    subtitle: { fontFace: "Calibri", fontSize: 10.5, bold: true, color: "F5A623" }
  },

  KPI6Dashboard: {
    id: "6 KPI Dashboard",
    maxItemsPerSlide: 6,
    cols: 3, rows: 2,
    gridX: 0.3, gridY: 1.45, gapX: 0.2, gapY: 0.2,
    cardWidth: 2.93, cardHeight: 1.65,
    cardBg: "FAFBFF", cardBorder: "DDE4F5", rectRadius: 0.08,
    accentBarHeight: 0.05,
    value: { fontFace: "Cambria", fontSize: 34, bold: true, xOffset: 0.18, yOffset: 0.15, w: 2.6, h: 0.65 },
    label: { fontFace: "Calibri", fontSize: 11.5, bold: true, color: "0F1B38", xOffset: 0.18, yOffset: 0.82, w: 2.6, h: 0.32 },
    sublabel: { fontFace: "Calibri", fontSize: 9, color: "4A5A7A", xOffset: 0.18, yOffset: 1.18, w: 2.6, h: 0.30 }
  },

  KPI2Dashboard: {
    id: "2 KPI Dashboard",
    maxItemsPerSlide: 3,
    cardWidth: 3.8, cardHeight: 1.1,
    cardBg: "FAFBFF", cardBorder: "DDE4F5", rectRadius: 0.08,
    accentBarHeight: 0.05,
    value: { fontFace: "Cambria", fontSize: 28, bold: true },
    label: { fontFace: "Calibri", fontSize: 11, bold: true, color: "0F1B38" }
  },

  LargeTable: {
    id: "Large Table",
    maxRowsPerSlide: 8,
    tablePos: { x: 0.4, y: 1.5, w: 9.2, h: 3.5 },
    headerRow: { h: 0.45, fill: "F5A623", color: "0F1B38", fontFace: "Calibri", fontSize: 10.5, bold: true },
    bodyRow: { h: 0.38, altFills: ["FFFFFF", "F4F6FA"], color: "0F1B38", fontFace: "Calibri", fontSize: 10 },
    totalRow: { h: 0.42, fill: "0F1B38", color: "FFFFFF", fontFace: "Calibri", fontSize: 10.5, bold: true }
  },

  WideBarChart: {
    id: "Wide Bar Chart",
    pos: { x: 0.3, y: 1.55, w: 9.4, h: 3.52 },
    colors: ["0F1B38", "F5A623", "008080", "E74C3C", "8E44AD", "2ECC71"],
    gridlineColor: "E0E8F0"
  },

  DonutChart: {
    id: "Donut Chart",
    pos: { x: 0.5, y: 1.55, w: 4.8, h: 3.52 },
    detailPos: { x: 5.4, y: 1.55, w: 4.2, h: 3.52 },
    holeSize: 50,
    colors: ["27AE60", "E74C3C"]
  },

  Recommendations: {
    id: "Recommendations",
    maxItemsPerSlide: 4,
    bg: "0F1B38",
    headerTag: { fontFace: "Calibri", fontSize: 11, bold: true, charSpacing: 4, color: "F5A623", x: 0.5, y: 0.35, w: 9.0, h: 0.3 },
    headerTitle: { fontFace: "Cambria", fontSize: 13, bold: true, color: "FFFFFF", x: 0.5, y: 0.72, w: 9.0, h: 0.4 },
    cols: 2, rows: 2,
    cardW: 4.45, cardH: 1.75, gapX: 0.3, gapY: 0.25,
    cardBg: "142448", cardBorder: "DDE4F5",
    numberBox: { w: 0.85, fill: "F5A623", fontFace: "Cambria", fontSize: 22, bold: true, color: "0F1B38" },
    title: { fontFace: "Cambria", fontSize: 12.5, bold: true, color: "F5A623" },
    description: { fontFace: "Calibri", fontSize: 10, color: "FFFFFF", lineSpacing: 16 }
  },

  Summary: {
    id: "Summary",
    bg: "0F1B38",
    title: { fontFace: "Cambria", fontSize: 44, bold: true, color: "FFFFFF", align: "center" },
    body: { fontFace: "Calibri", fontSize: 13, color: "7A90B8", align: "center" },
    messages: { fontFace: "Calibri", fontSize: 10, color: "8A9FC0" }
  }
};

// ── Build deck from AI-generated slides ───────────────────────────────────────
function buildAIDeck({ aiSlides, strategy, docTitle, heroTitle, themeKey, wizardOptions }) {
  const COLORS = resolveAITheme(themeKey);
  const includeNotes = wizardOptions.speakerNotes !== "No";
  const totalSlides = aiSlides.length;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const CARD_PALETTE = [COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart1, COLORS.teal, COLORS.chart6, COLORS.chart7];

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = docTitle;

  let slideCounter = 0;

  for (const slide of aiSlides) {
    const s = pres.addSlide();
    slideCounter++;

    // ── COVER SLIDE ──────────────────────────────────────────────────────────
    if (slide.slideType === "cover") {
      s.background = { color: COLORS.accent }; // Master PDF Amber Background

      // Grid pattern overlay
      for (let gx = 0; gx < 10; gx += 0.8) {
        s.addShape(pres.shapes.RECTANGLE, { x: gx, y: 0, w: 0.01, h: 5.63, fill: { color: COLORS.bgDark, transparency: 92 }, line: { color: COLORS.bgDark, transparency: 92 } });
      }
      for (let gy = 0; gy < 5.63; gy += 0.7) {
        s.addShape(pres.shapes.RECTANGLE, { x: 0, y: gy, w: 10, h: 0.01, fill: { color: COLORS.bgDark, transparency: 92 }, line: { color: COLORS.bgDark, transparency: 92 } });
      }

      // Giant watermark letter "R" or number on right side
      s.addText("R", {
        x: 6.0, y: -0.5, w: 4.5, h: 5.5,
        fontSize: 220, color: COLORS.bgDark, bold: true,
        fontFace: "Cambria", transparency: 88, align: "right",
      });

      // Section tag
      s.addText("S E C T I O N  0 1", { x: 0.6, y: 1.1, w: 5.0, h: 0.3, fontSize: 10, color: COLORS.bgDark, bold: true, charSpacing: 4, fontFace: "Calibri" });

      s.addText(heroTitle.toUpperCase(), { x: 0.6, y: 1.6, w: 6.5, h: 1.3, fontSize: 34, color: COLORS.bgDark, bold: true, fontFace: "Cambria", lineSpacing: 40 });
      
      if (slide.subtitle) {
        s.addText(slide.subtitle, { x: 0.6, y: 3.0, w: 6.5, h: 0.8, fontSize: 18, color: COLORS.bgDark, fontFace: "Calibri" });
      }

      s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 3.9, w: 2.2, h: 0.04, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });

      s.addText(`${docTitle}  ·  ${today}`, { x: 0.6, y: 4.8, w: 7.0, h: 0.35, fontSize: 10.5, color: COLORS.bgDark, fontFace: "Calibri" });
      s.addText("01", { x: 9.0, y: 4.8, w: 0.6, h: 0.35, fontSize: 10.5, color: COLORS.bgDark, fontFace: "Calibri", bold: true });
      if (includeNotes) s.addNotes(slide.speakerNotes || `Cover slide: ${heroTitle}`);
      continue;
    }

    // ── CLOSING SLIDE ────────────────────────────────────────────────────────
    if (slide.slideType === "closing") {
      s.background = { color: COLORS.bgDark };
      s.addShape(pres.shapes.RECTANGLE, { x: 2.5, y: 2.6, w: 5.0, h: 0.04, fill: { color: COLORS.accent, transparency: 60 }, line: { color: COLORS.accent, transparency: 60 } });
      s.addText(slide.title || "Thank You", { x: 1, y: 1.2, w: 8, h: 1.1, fontSize: 44, color: COLORS.textLight, bold: true, fontFace: "Cambria", align: "center" });
      s.addText(slide.body || strategy?.mostImportantInsight || strategy?.keyMessages?.[0] || "AI-Generated Presentation", { x: 1.5, y: 2.4, w: 7, h: 0.55, fontSize: 13, color: "7A90B8", align: "center", fontFace: "Calibri" });

      const closingMessages = slide.keyMessages || strategy?.keyMessages?.slice(0, 3) || [];
      if (closingMessages.length > 0) {
        let msgY = 3.1;
        closingMessages.slice(0, 3).forEach(msg => {
          s.addText(`▪ ${msg.slice(0, 100)}`, { x: 1.42, y: msgY, w: 7.2, h: 0.28, fontSize: 10.5, color: "8A9FC0", fontFace: "Calibri" });
          msgY += 0.33;
        });
      }
      s.addText(today, { x: 1, y: 5.05, w: 8, h: 0.28, fontSize: 9.5, color: "5A6A8A", align: "center", fontFace: "Calibri" });
      if (includeNotes) s.addNotes(slide.speakerNotes || "Closing slide.");
      continue;
    }

    // ── SECTION DIVIDER ──────────────────────────────────────────────────────
    if (slide.slideType === "section") {
      s.background = { color: COLORS.accent }; // Master PDF Amber Background

      // Grid overlay
      for (let gx = 0; gx < 10; gx += 0.8) {
        s.addShape(pres.shapes.RECTANGLE, { x: gx, y: 0, w: 0.01, h: 5.63, fill: { color: COLORS.bgDark, transparency: 92 }, line: { color: COLORS.bgDark, transparency: 92 } });
      }
      for (let gy = 0; gy < 5.63; gy += 0.7) {
        s.addShape(pres.shapes.RECTANGLE, { x: 0, y: gy, w: 10, h: 0.01, fill: { color: COLORS.bgDark, transparency: 92 }, line: { color: COLORS.bgDark, transparency: 92 } });
      }

      // Giant watermark number on right
      s.addText(String(slideCounter), {
        x: 6.0, y: -0.5, w: 4.5, h: 5.5,
        fontSize: 220, color: COLORS.bgDark, bold: true,
        fontFace: "Cambria", transparency: 88, align: "right",
      });

      s.addText("S E C T I O N  " + String(slideCounter).padStart(2, "0"), { x: 0.6, y: 1.1, w: 5.0, h: 0.3, fontSize: 10, color: COLORS.bgDark, bold: true, charSpacing: 4, fontFace: "Calibri" });
      s.addText((slide.title || "Section").toUpperCase(), { x: 0.6, y: 1.6, w: 6.5, h: 1.3, fontSize: 34, color: COLORS.bgDark, bold: true, fontFace: "Cambria", lineSpacing: 40 });
      
      if (slide.subtitle) {
        s.addText(slide.subtitle, { x: 0.6, y: 3.0, w: 6.5, h: 0.8, fontSize: 18, color: COLORS.bgDark, fontFace: "Calibri" });
      }

      s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 3.9, w: 2.2, h: 0.04, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });

      s.addText(String(slideCounter).padStart(2, "0"), { x: 9.0, y: 4.8, w: 0.6, h: 0.35, fontSize: 10.5, color: COLORS.bgDark, fontFace: "Calibri", bold: true });
      if (includeNotes) s.addNotes(slide.speakerNotes || `Section: ${slide.title}`);
      continue;
    }

    // ── All content slides share a dark header ───────────────────────────────
    s.background = { color: COLORS.bgLight };
    addAISlideHeader(s, pres, COLORS, slide.title || "Slide", slide.icon || "📄");

    const SAFE_Y = 1.45;
    const SAFE_H = 3.72;

    // ── PROCESS SLIDE ─────────────────────────────────────────────────────────
    if (slide.slideType === "process" && Array.isArray(slide.steps) && slide.steps.length > 0) {
      const steps = slide.steps.slice(0, 6);
      const count = steps.length;
      const spineY = SAFE_Y + SAFE_H * 0.38;
      const stepSpan = 9.0;
      const stepW = stepSpan / count;

      // Horizontal spine
      s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: spineY, w: stepSpan, h: 0.04, fill: { color: COLORS.teal, transparency: 60 }, line: { color: COLORS.teal, transparency: 60 } });

      steps.forEach((step, i) => {
        const cx = 0.4 + i * stepW + stepW * 0.5;
        const isAbove = i % 2 === 0 || count <= 3;
        const cc = CARD_PALETTE[i % CARD_PALETTE.length];

        // Circle on spine
        s.addShape(pres.shapes.OVAL, { x: cx - 0.22, y: spineY - 0.22, w: 0.44, h: 0.44, fill: { color: cc, transparency: 75 }, line: { color: cc, transparency: 50 } });
        s.addShape(pres.shapes.OVAL, { x: cx - 0.14, y: spineY - 0.14, w: 0.28, h: 0.28, fill: { color: cc }, line: { color: cc } });
        s.addText(String(step.number || i + 1), { x: cx - 0.14, y: spineY - 0.14, w: 0.28, h: 0.28, fontSize: 8, color: COLORS.textLight, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });

        const titleY = isAbove ? spineY - 0.75 : spineY + 0.35;
        const descY = isAbove ? spineY - 1.45 : spineY + 0.68;

        s.addText((step.icon || "") + " " + (step.title || `Step ${i + 1}`).slice(0, 30), {
          x: cx - stepW * 0.42, y: titleY, w: stepW * 0.84, h: 0.28,
          fontSize: 9.5, color: cc, bold: true, align: "center", fontFace: "Calibri",
        });
        if (step.description) {
          s.addText(step.description.slice(0, 80), {
            x: cx - stepW * 0.42, y: descY, w: stepW * 0.84, h: 0.55,
            fontSize: 8.5, color: COLORS.textMuted, align: "center", fontFace: "Calibri",
          });
        }
      });

    // ── SCORECARD SLIDE ───────────────────────────────────────────────────────
    } else if (slide.slideType === "scorecard" && Array.isArray(slide.items) && slide.items.length > 0) {
      const items = slide.items.slice(0, 8);
      const useTwoCols = items.length > 4;
      const cols = useTwoCols ? 2 : 1;
      const colW = useTwoCols ? 4.55 : 9.2;
      const gap = 0.2;
      const rowH = Math.min((SAFE_H - gap * (Math.ceil(items.length / cols) - 1)) / Math.ceil(items.length / cols), 0.82);

      const statusColor = { good: "27AE60", warning: "F39C12", critical: "E74C3C" };

      items.forEach((item, i) => {
        const col = useTwoCols ? i % 2 : 0;
        const row = useTwoCols ? Math.floor(i / 2) : i;
        const x = 0.3 + col * (colW + gap);
        const y = SAFE_Y + row * (rowH + gap);
        const sc = statusColor[item.status] || statusColor.warning;
        const pct = item.maxScore > 0 ? Math.min((item.score / item.maxScore) * 100, 100) : 0;

        s.addShape("roundRect", { x, y, w: colW, h: rowH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.07 });
        // Status pill
        s.addShape("roundRect", { x: x + colW - 1.1, y: y + rowH * 0.15, w: 0.9, h: 0.26, fill: { color: sc, transparency: 82 }, line: { color: sc, transparency: 60 }, rectRadius: 0.13 });
        s.addText(item.status?.toUpperCase() || "?", { x: x + colW - 1.1, y: y + rowH * 0.15, w: 0.9, h: 0.26, fontSize: 7.5, color: sc, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });
        // Category
        s.addText(item.category?.slice(0, 30) || "", { x: x + 0.15, y: y + 0.06, w: colW - 1.35, h: 0.26, fontSize: 10, color: COLORS.textDark, bold: true, fontFace: "Calibri" });
        // Score fraction
        s.addText(`${item.score}/${item.maxScore}`, { x: x + 0.15, y: y + 0.32, w: 1.0, h: 0.22, fontSize: 9, color: sc, bold: true, fontFace: "Cambria" });
        // Progress bar
        const barX = x + 1.3;
        const barW = colW - 1.6;
        s.addShape("roundRect", { x: barX, y: y + 0.37, w: barW, h: 0.1, fill: { color: COLORS.border }, line: { color: COLORS.border }, rectRadius: 0.05 });
        const fillW = Math.max((pct / 100) * barW, 0.05);
        s.addShape("roundRect", { x: barX, y: y + 0.37, w: fillW, h: 0.1, fill: { color: sc }, line: { color: sc }, rectRadius: 0.05 });
        // Comment
        if (item.comment && rowH > 0.6) {
          s.addText(item.comment.slice(0, 55), { x: x + 0.15, y: y + rowH - 0.25, w: colW - 0.3, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri" });
        }
      });

    // ── QUOTE SLIDE ──────────────────────────────────────────────────────────
    } else if (slide.slideType === "quote" && slide.quote) {
      s.addShape(pres.shapes.OVAL, { x: -0.5, y: 3.0, w: 2.5, h: 2.5, fill: { color: COLORS.accent, transparency: 88 }, line: { color: COLORS.accent, transparency: 88 } });
      s.addText("\u201C", { x: 0.4, y: 1.5, w: 1.2, h: 1.2, fontSize: 80, color: COLORS.accent, fontFace: "Cambria", bold: true, transparency: 30 });
      s.addText(slide.quote.text.slice(0, 300), { x: 1.2, y: 2.0, w: 7.6, h: 2.0, fontSize: 18, color: COLORS.textDark, fontFace: "Cambria", italic: true, valign: "middle", lineSpacing: 28 });
      if (slide.quote.attribution) {
        s.addText(`— ${slide.quote.attribution}`, { x: 1.2, y: 4.1, w: 7.6, h: 0.4, fontSize: 12, color: COLORS.textMuted, fontFace: "Calibri", align: "right" });
      }

    // ── RECOMMENDATIONS SLIDE ────────────────────────────────────────────────
    } else if (slide.slideType === "recommendations" && Array.isArray(slide.items) && slide.items.length > 0) {
      s.background = { color: COLORS.bgDark }; // Dark Navy background!
      
      // Top header
      s.addText("R E C O M M E N D A T I O N S", { x: 0.5, y: 0.35, w: 9.0, h: 0.3, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 4, fontFace: "Calibri" });
      s.addText(slide.title || "SUMMARY & NEXT STEPS", { x: 0.5, y: 0.72, w: 9.0, h: 0.4, fontSize: 13, color: COLORS.textLight, bold: true, fontFace: "Cambria" });

      const items = slide.items.slice(0, 4);
      const colW = 4.45;
      const rowH = 1.75;
      const gapX = 0.3;
      const gapY = 0.25;

      items.forEach((it, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 0.4 + col * (colW + gapX);
        const y = 1.35 + row * (rowH + gapY);

        s.addShape("roundRect", {
          x, y, w: colW, h: rowH,
          fill: { color: "142448" }, line: { color: COLORS.border, transparency: 70 }, rectRadius: 0.08,
        });

        // Left Amber Box with 2-digit number (e.g. 01, 02, 03, 04)
        s.addShape("rect", {
          x, y, w: 0.85, h: rowH,
          fill: { color: COLORS.accent }, line: { color: COLORS.accent }
        });
        s.addText(String(i + 1).padStart(2, "0"), {
          x, y: y + rowH / 2 - 0.25, w: 0.85, h: 0.5,
          fontSize: 22, color: COLORS.bgDark, bold: true, align: "center", valign: "middle", fontFace: "Cambria"
        });

        s.addText((it.title || "").slice(0, 50), {
          x: x + 1.0, y: y + 0.12, w: colW - 1.15, h: 0.35,
          fontSize: 12.5, color: COLORS.accent, bold: true, fontFace: "Cambria"
        });
        if (it.description) {
          s.addText(it.description.slice(0, 150), {
            x: x + 1.0, y: y + 0.48, w: colW - 1.15, h: rowH - 0.55,
            fontSize: 10, color: COLORS.textLight, fontFace: "Calibri", valign: "top", lineSpacing: 16
          });
        }
      });

      addAIFooter(s, COLORS, docTitle, slideCounter, totalSlides);
      if (includeNotes && slide.speakerNotes) s.addNotes(slide.speakerNotes);
      continue;

    // ── SWOT SLIDE ───────────────────────────────────────────────────────────
    } else if (slide.slideType === "swot" && slide.swotData) {
      const sw = slide.swotData;
      const qW = 4.65; const qH = SAFE_H / 2 - 0.08;
      const quadrants = [
        { label: "💪  STRENGTHS", items: sw.strengths || [], color: "27AE60", x: 0.3, y: SAFE_Y },
        { label: "⚠️  WEAKNESSES", items: sw.weaknesses || [], color: "E74C3C", x: 5.05, y: SAFE_Y },
        { label: "🚀  OPPORTUNITIES", items: sw.opportunities || [], color: COLORS.chart2, x: 0.3, y: SAFE_Y + qH + 0.1 },
        { label: "🛡️  THREATS", items: sw.threats || [], color: "E67E22", x: 5.05, y: SAFE_Y + qH + 0.1 },
      ];
      quadrants.forEach(q => {
        s.addShape("roundRect", { x: q.x, y: q.y, w: qW, h: qH, fill: { color: COLORS.cardBg }, line: { color: q.color, transparency: 40 }, rectRadius: 0.08 });
        // Colored header band
        s.addShape("roundRect", { x: q.x, y: q.y, w: qW, h: 0.32, fill: { color: q.color, transparency: 85 }, line: { color: q.color, transparency: 70 }, rectRadius: 0.08 });
        s.addText(q.label, { x: q.x + 0.12, y: q.y + 0.04, w: qW - 0.2, h: 0.24, fontSize: 8.5, color: q.color, bold: true, fontFace: "Calibri" });
        const bullets = q.items.slice(0, 4).map((b, i) => ({
          text: b.slice(0, 65),
          options: { bullet: { code: "2022", color: q.color }, breakLine: i < q.items.length - 1, fontSize: 10.5, color: COLORS.textDark, paraSpaceAfter: 4 },
        }));
        if (bullets.length) s.addText(bullets, { x: q.x + 0.15, y: q.y + 0.36, w: qW - 0.3, h: qH - 0.46, fontFace: "Calibri", valign: "top" });
      });

    // ── CHART SLIDE ──────────────────────────────────────────────────────────
    } else if (slide.slideType === "chart" && slide.chartData && slide.chartData.labels?.length >= 2) {
      const cd = slide.chartData;
      const chartType = cd.type || "bar";
      const labels = cd.labels.slice(0, 10);
      const values = cd.values.slice(0, 10).map(v => (typeof v === "number" ? v : parseFloat(v) || 0));
      const chartColors = [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart6, COLORS.chart7, COLORS.chart8];

      const chartY = SAFE_Y + 0.1;
      const chartH = SAFE_H - 0.2;

      try {
        if (chartType === "pie" || chartType === "donut") {
          const pieData = [{ name: cd.title || slide.title, labels, values }];
          s.addChart(pres.ChartType.doughnut, pieData, {
            x: 0.5, y: chartY, w: 5.5, h: chartH,
            chartColors: chartColors.slice(0, labels.length),
            showLegend: true, legendPos: "r", legendFontSize: 9,
            showPercent: true, showValue: false, dataLabelFontSize: 9, dataLabelColor: COLORS.textLight,
            holeSize: chartType === "donut" ? 50 : 0,
          });
        } else if (chartType === "line" || chartType === "area") {
          const lineData = [{ name: cd.title || slide.title, labels, values }];
          s.addChart(pres.ChartType.line, lineData, {
            x: 0.3, y: chartY, w: 9.4, h: chartH,
            chartColors: [COLORS.chart2],
            showLegend: false, showValue: false,
            lineDataSymbol: "circle", lineDataSymbolSize: 6,
            catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
            valGridLine: { style: "dash", color: COLORS.border },
          });
        } else {
          // Bar (default)
          const barData = [{ name: cd.title || slide.title, labels, values }];
          s.addChart(pres.ChartType.bar, barData, {
            x: 0.3, y: chartY, w: 9.4, h: chartH,
            barDir: "col",
            chartColors: chartColors.slice(0, labels.length),
            showLegend: false, showValue: true,
            dataLabelFontSize: 8, dataLabelPosition: "inEnd", dataLabelColor: COLORS.textLight,
            catAxisLabelFontSize: 8, valAxisLabelFontSize: 8,
            catGridLine: { style: "none" },
            valGridLine: { style: "dash", color: COLORS.border },
          });
        }
      } catch (chartErr) {
        console.warn("AI chart rendering error:", chartErr.message);
        const fallback = (slide.bullets || []).slice(0, 7).map((b, i) => ({
          text: b.slice(0, 130),
          options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < slide.bullets.length - 1, fontSize: 13, color: COLORS.textDark, paraSpaceAfter: 8 },
        }));
        if (fallback.length) s.addText(fallback, { x: 0.5, y: SAFE_Y + 0.5, w: 9.0, h: SAFE_H - 0.5, fontFace: "Calibri", valign: "top" });
      }

    // ── KPI DASHBOARD ─────────────────────────────────────────────────────────
    } else if (slide.slideType === "kpi" && slide.metrics?.length) {
      const items = slide.metrics.slice(0, 6);
      const cols = items.length <= 2 ? 2 : items.length <= 4 ? 2 : 3;
      const rows = Math.ceil(items.length / cols);
      const gap = 0.18;
      const totalW = 9.4;
      const cardW = (totalW - gap * (cols - 1)) / cols;
      const cardH = Math.min(Math.max((SAFE_H - gap * (rows - 1)) / rows, 1.1), 1.65);

      items.forEach((m, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 0.3 + col * (cardW + gap);
        const y = SAFE_Y + row * (cardH + gap);
        const cc = CARD_PALETTE[i % CARD_PALETTE.length];

        s.addShape("roundRect", {
          x, y, w: cardW, h: cardH,
          fill: { color: COLORS.cardBg }, line: { color: cc, transparency: 60 }, rectRadius: 0.1,
          shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.06 },
        });
        // Colored top strip (3px)
        s.addShape("rect", { x, y, w: cardW, h: 0.05, fill: { color: cc }, line: { color: cc } });
        // Label
        s.addText(String(m.label || "").toUpperCase().slice(0, 28), {
          x: x + 0.15, y: y + 0.1, w: cardW - 0.3, h: 0.26,
          fontSize: 8, color: COLORS.textMuted, bold: true, fontFace: "Calibri", charSpacing: 0.3,
        });
        // Value
        const valText = String(m.value || "").slice(0, 32);
        const valSize = valText.length > 20 ? 13 : cardH > 1.3 ? 19 : 16;
        s.addText(valText, {
          x: x + 0.15, y: y + 0.40, w: cardW - 0.28, h: cardH - 0.52,
          fontSize: valSize, color: cc, bold: true, fontFace: "Cambria", valign: "top", autoFit: true,
        });
        // Trend arrow if applicable
        const trend = m.trend;
        if (trend === "up" || trend === "down") {
          const arrow = trend === "up" ? "↑" : "↓";
          const arrowColor = trend === "up" ? "27AE60" : "E74C3C";
          s.addText(arrow, { x: x + cardW - 0.4, y: y + 0.38, w: 0.3, h: 0.3, fontSize: 14, color: arrowColor, bold: true, align: "right", fontFace: "Calibri" });
        }
      });

    // ── TWO COLUMN SLIDE ──────────────────────────────────────────────────────
    } else if (slide.slideType === "twoColumn" && slide.twoColumns) {
      const tc = slide.twoColumns;
      const colW = 4.45; const gap = 0.3;

      [
        { data: tc.left,  x: 0.3, borderColor: COLORS.chart2 },
        { data: tc.right, x: 0.3 + colW + gap + 0.2, borderColor: COLORS.chart3 },
      ].forEach(col => {
        s.addShape("roundRect", { x: col.x, y: SAFE_Y, w: colW, h: SAFE_H, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
        s.addShape("rect", { x: col.x, y: SAFE_Y, w: colW, h: 0.04, fill: { color: col.borderColor }, line: { color: col.borderColor } });
        s.addText(col.data?.title || "", { x: col.x + 0.15, y: SAFE_Y + 0.08, w: colW - 0.3, h: 0.35, fontSize: 12, color: col.borderColor, bold: true, fontFace: "Calibri" });
        s.addShape(pres.shapes.RECTANGLE, { x: col.x + 0.15, y: SAFE_Y + 0.47, w: colW - 0.3, h: 0.02, fill: { color: COLORS.border }, line: { color: COLORS.border } });
        if (col.data?.bullets?.length) {
          const items = col.data.bullets.slice(0, 6).map((b, i) => ({
            text: b.slice(0, 90),
            options: { bullet: { code: "25AA", color: col.borderColor }, breakLine: i < col.data.bullets.length - 1, fontSize: 11.5, color: COLORS.textDark, paraSpaceAfter: 8 },
          }));
          s.addText(items, { x: col.x + 0.15, y: SAFE_Y + 0.55, w: colW - 0.3, h: SAFE_H - 0.65, fontFace: "Calibri", valign: "top" });
        }
      });

      // VS badge / arrow in center
      const midX = 0.3 + colW + gap * 0.5 - 0.22;
      s.addShape(pres.shapes.OVAL, { x: midX, y: SAFE_Y + SAFE_H / 2 - 0.22, w: 0.44, h: 0.44, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });
      s.addText("→", { x: midX, y: SAFE_Y + SAFE_H / 2 - 0.22, w: 0.44, h: 0.44, fontSize: 13, color: COLORS.accent, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });

    // ── TIMELINE SLIDE ────────────────────────────────────────────────────────
    } else if (slide.slideType === "timeline" && slide.timeline?.length) {
      const events = slide.timeline.slice(0, 7);
      const count = events.length;
      const itemW = 9.0 / count;
      const lineY = SAFE_Y + SAFE_H * 0.42;
      s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: lineY, w: 9.2, h: 0.04, fill: { color: COLORS.teal }, line: { color: COLORS.teal } });

      events.forEach((evt, i) => {
        const cx = 0.4 + i * (9.2 / count) + itemW * 0.42;
        const isAbove = i % 2 === 0;
        const cc = CARD_PALETTE[i % CARD_PALETTE.length];

        // Node: outer ring + inner dot
        s.addShape(pres.shapes.OVAL, { x: cx - 0.16, y: lineY - 0.16, w: 0.32, h: 0.32, fill: { color: cc, transparency: 70 }, line: { color: cc, transparency: 50 } });
        s.addShape(pres.shapes.OVAL, { x: cx - 0.09, y: lineY - 0.09, w: 0.18, h: 0.18, fill: { color: cc }, line: { color: cc } });

        if (isAbove) {
          s.addText(evt.date || `${i + 1}`, { x: cx - itemW * 0.44, y: lineY - 0.7, w: itemW * 0.88, h: 0.26, fontSize: 8.5, color: cc, bold: true, align: "center", fontFace: "Calibri" });
          s.addText((evt.event || "").slice(0, 40), { x: cx - itemW * 0.44, y: lineY - 0.42, w: itemW * 0.88, h: 0.34, fontSize: 9, color: COLORS.textDark, bold: true, align: "center", fontFace: "Calibri" });
          if (evt.detail) s.addText(evt.detail.slice(0, 70), { x: cx - itemW * 0.44, y: SAFE_Y, w: itemW * 0.88, h: lineY - SAFE_Y - 0.48, fontSize: 8, color: COLORS.textMuted, align: "center", fontFace: "Calibri", valign: "bottom" });
        } else {
          s.addText(evt.date || `${i + 1}`, { x: cx - itemW * 0.44, y: lineY + 0.24, w: itemW * 0.88, h: 0.26, fontSize: 8.5, color: cc, bold: true, align: "center", fontFace: "Calibri" });
          s.addText((evt.event || "").slice(0, 40), { x: cx - itemW * 0.44, y: lineY + 0.50, w: itemW * 0.88, h: 0.34, fontSize: 9, color: COLORS.textDark, bold: true, align: "center", fontFace: "Calibri" });
          if (evt.detail) s.addText(evt.detail.slice(0, 70), { x: cx - itemW * 0.44, y: lineY + 0.85, w: itemW * 0.88, h: 0.7, fontSize: 8, color: COLORS.textMuted, align: "center", fontFace: "Calibri" });
        }
      });

    // ── BULLETS SLIDE (default) ───────────────────────────────────────────────
    } else {
      const hasBullets = slide.bullets?.length > 0;
      const hasBody = slide.body && slide.body.length > 20;

      if (hasBullets && hasBody) {
        s.addShape("roundRect", { x: 0.3, y: SAFE_Y, w: 5.5, h: SAFE_H, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
        const bItems = slide.bullets.slice(0, 7).map((b, i) => ({
          text: b.slice(0, 120),
          options: { bullet: { code: "25AA", color: CARD_PALETTE[i % CARD_PALETTE.length] }, breakLine: i < slide.bullets.length - 1, fontSize: 12, color: COLORS.textDark, paraSpaceAfter: 8 },
        }));
        s.addText(bItems, { x: 0.5, y: SAFE_Y + 0.15, w: 5.1, h: SAFE_H - 0.3, fontFace: "Calibri", valign: "top" });
        s.addShape("roundRect", { x: 6.05, y: SAFE_Y, w: 3.65, h: SAFE_H, fill: { color: COLORS.cardAlt }, line: { color: COLORS.border }, rectRadius: 0.1 });
        s.addText("KEY INSIGHT", { x: 6.2, y: SAFE_Y + 0.14, w: 3.35, h: 0.3, fontSize: 9, color: COLORS.accent, bold: true, fontFace: "Calibri", charSpacing: 1 });
        s.addShape(pres.shapes.RECTANGLE, { x: 6.2, y: SAFE_Y + 0.47, w: 3.35, h: 0.02, fill: { color: COLORS.accent, transparency: 70 }, line: { color: COLORS.accent, transparency: 70 } });
        s.addText(slide.body.slice(0, 350), { x: 6.2, y: SAFE_Y + 0.54, w: 3.35, h: SAFE_H - 0.65, fontSize: 11, color: COLORS.textDark, fontFace: "Calibri", valign: "top", lineSpacing: 18 });
      } else if (hasBullets) {
        const bullets = slide.bullets.slice(0, 8);
        const cols2 = bullets.length >= 5 ? 2 : 1;
        s.addShape("roundRect", { x: 0.3, y: SAFE_Y, w: 9.4, h: SAFE_H, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
        if (cols2 === 2) {
          const half = Math.ceil(bullets.length / 2);
          const mkItems = (arr, startIdx) => arr.map((b, i) => ({
            text: b.slice(0, 110),
            options: { bullet: { code: "25AA", color: CARD_PALETTE[(startIdx + i) % CARD_PALETTE.length] }, breakLine: i < arr.length - 1, fontSize: 12, color: COLORS.textDark, paraSpaceAfter: 9 },
          }));
          s.addText(mkItems(bullets.slice(0, half), 0), { x: 0.5, y: SAFE_Y + 0.15, w: 4.35, h: SAFE_H - 0.3, fontFace: "Calibri", valign: "top" });
          s.addShape(pres.shapes.RECTANGLE, { x: 5.05, y: SAFE_Y + 0.18, w: 0.02, h: SAFE_H - 0.38, fill: { color: COLORS.border }, line: { color: COLORS.border } });
          s.addText(mkItems(bullets.slice(half), half), { x: 5.2, y: SAFE_Y + 0.15, w: 4.35, h: SAFE_H - 0.3, fontFace: "Calibri", valign: "top" });
        } else {
          const bItems = bullets.map((b, i) => ({
            text: b.slice(0, 150),
            options: { bullet: { code: "25AA", color: CARD_PALETTE[i % CARD_PALETTE.length] }, breakLine: i < bullets.length - 1, fontSize: 13, color: COLORS.textDark, paraSpaceAfter: 11 },
          }));
          s.addText(bItems, { x: 0.5, y: SAFE_Y + 0.18, w: 9.0, h: SAFE_H - 0.3, fontFace: "Calibri", valign: "top" });
        }
      } else if (hasBody) {
        s.addShape("roundRect", { x: 0.3, y: SAFE_Y, w: 9.4, h: SAFE_H, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
        s.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: SAFE_Y, w: 0.05, h: SAFE_H, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
        s.addText(slide.body.slice(0, 700), { x: 0.52, y: SAFE_Y + 0.15, w: 9.1, h: SAFE_H - 0.28, fontSize: 13, color: COLORS.textDark, fontFace: "Calibri", valign: "top", lineSpacing: 22 });
      }
    }

    addAIFooter(s, COLORS, docTitle, slideCounter, totalSlides);
    if (includeNotes && slide.speakerNotes) s.addNotes(slide.speakerNotes);
  }

  return { pres, slideCount: totalSlides };
}

// ── Shared helpers for AI deck ────────────────────────────────────────────────
function addAIFooter(s, COLORS, docTitle, idx, total) {
  s.addText(docTitle.slice(0, 50), { x: 0.35, y: 5.28, w: 7.8, h: 0.27, fontSize: 8.5, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addShape("roundRect", { x: 8.85, y: 5.25, w: 0.8, h: 0.28, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark }, rectRadius: 0.14 });
  s.addText(String(idx).padStart(2, "0"), { x: 8.85, y: 5.25, w: 0.8, h: 0.28, fontSize: 8.5, color: COLORS.textLight, align: "center", valign: "middle", fontFace: "Calibri", bold: true });
}

function addAISlideHeader(s, pres, COLORS, title, icon, subtitle) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.3, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 1.3, w: 10, h: 0.04, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });

  const titleX = 0.4;
  const titleW = 9.2;

  s.addText(title.toUpperCase(), {
    x: titleX, y: 0.18, w: titleW, h: 0.48,
    fontSize: 18, color: COLORS.textLight, bold: true,
    fontFace: "Cambria", valign: "middle", margin: 0
  });

  const subText = subtitle || "Executive Summary & Quantitative Analysis";
  s.addText(subText, {
    x: titleX, y: 0.68, w: titleW, h: 0.35,
    fontSize: 10.5, color: COLORS.accent, bold: true,
    fontFace: "Calibri", valign: "middle", margin: 0
  });
}

router.post("/generate-ppt-ai", async (req, res) => {
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