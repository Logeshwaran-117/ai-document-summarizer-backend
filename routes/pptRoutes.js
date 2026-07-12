const express = require("express");
const router = express.Router();
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");
const os = require("os");
const Presentation = require("../models/Presentation");

// ── Theme palettes ───────────────────────────────────────────────────────────
const THEMES = {
  navyGold: {
    label: "Navy & Gold",
    bgDark: "1E2761", bgLight: "F7F9FC", bgMid: "EEF4FF", accent: "C9A84C", teal: "2FA4A0",
    textLight: "FFFFFF", textDark: "1A1A2E", textMuted: "5A6A8A",
    cardBg: "FFFFFF", cardAlt: "EEF4FF", border: "E0E8F0",
    chart1: "1E2761", chart2: "C9A84C", chart3: "2FA4A0", chart4: "E74C3C", chart5: "8E44AD",
    chart6: "2ECC71", chart7: "E67E22", chart8: "1ABC9C",
    gradient1: "1E2761", gradient2: "2A3A9E",
  },
  tealSlate: {
    label: "Teal & Slate",
    bgDark: "0F3D3E", bgLight: "F5FAFA", bgMid: "E6F5F3", accent: "3FBFAE", teal: "1F7A72",
    textLight: "FFFFFF", textDark: "17302F", textMuted: "4E6E6C",
    cardBg: "FFFFFF", cardAlt: "E6F5F3", border: "D6EAE8",
    chart1: "0F3D3E", chart2: "3FBFAE", chart3: "F39C12", chart4: "E74C3C", chart5: "8E44AD",
    chart6: "2ECC71", chart7: "E67E22", chart8: "1ABC9C",
    gradient1: "0F3D3E", gradient2: "1A5F60",
  },
  charcoalRuby: {
    label: "Charcoal & Ruby",
    bgDark: "231F20", bgLight: "F9F7F7", bgMid: "F3E9E7", accent: "C0392B", teal: "8E7B57",
    textLight: "FFFFFF", textDark: "231F20", textMuted: "6B6260",
    cardBg: "FFFFFF", cardAlt: "F3E9E7", border: "E7DEDC",
    chart1: "231F20", chart2: "C0392B", chart3: "E67E22", chart4: "27AE60", chart5: "2980B9",
    chart6: "8E44AD", chart7: "F39C12", chart8: "1ABC9C",
    gradient1: "231F20", gradient2: "3D3536",
  },
  midnightBlue: {
    label: "Midnight Blue",
    bgDark: "0D1B2A", bgLight: "F0F6FF", bgMid: "E0EEFF", accent: "00B4D8", teal: "0077B6",
    textLight: "FFFFFF", textDark: "0D1B2A", textMuted: "4A6080",
    cardBg: "FFFFFF", cardAlt: "E0EEFF", border: "C8DCFF",
    chart1: "0D1B2A", chart2: "00B4D8", chart3: "0077B6", chart4: "E63946", chart5: "2A9D8F",
    chart6: "E9C46A", chart7: "F4A261", chart8: "264653",
    gradient1: "0D1B2A", gradient2: "143055",
  },
  forestGreen: {
    label: "Forest & Amber",
    bgDark: "1B4332", bgLight: "F6FDF9", bgMid: "E8F5EE", accent: "F4A261", teal: "40916C",
    textLight: "FFFFFF", textDark: "1B4332", textMuted: "4A7C59",
    cardBg: "FFFFFF", cardAlt: "E8F5EE", border: "C8E6D4",
    chart1: "1B4332", chart2: "F4A261", chart3: "40916C", chart4: "E63946", chart5: "457B9D",
    chart6: "E9C46A", chart7: "2A9D8F", chart8: "264653",
    gradient1: "1B4332", gradient2: "2D6A4F",
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

// ── Shared slide elements ─────────────────────────────────────────────────────
function addFooter(s, COLORS, docTitle, idx, total) {
  s.addText(docTitle, { x: 0.3, y: 5.35, w: 6.5, h: 0.25, fontSize: 9, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addShape("roundRect", { x: 8.75, y: 5.28, w: 0.95, h: 0.32, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark }, rectRadius: 0.16 });
  s.addText(`${idx} / ${total}`, { x: 8.75, y: 5.28, w: 0.95, h: 0.32, fontSize: 9, color: COLORS.textLight, align: "center", valign: "middle", fontFace: "Calibri", bold: true });
}

function addSlideHeader(s, pres, COLORS, title, icon) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.25, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 1.25, w: 10, h: 0.05, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
  // subtle right-corner decoration
  s.addShape(pres.shapes.OVAL, { x: 8.8, y: -0.5, w: 1.8, h: 1.8, fill: { color: COLORS.accent, transparency: 88 }, line: { color: COLORS.accent, transparency: 88 } });
  s.addText(icon, { x: 0.4, y: 0.26, w: 0.7, h: 0.7, fontSize: 26, align: "center", valign: "middle" });
  s.addText(title, { x: 1.1, y: 0.24, w: 8.3, h: 0.78, fontSize: 24, color: COLORS.textLight, bold: true, fontFace: "Cambria", valign: "middle", margin: 0 });
}

// Section divider slide between major sections
function addSectionDivider(pres, COLORS, sectionTitle, sectionSubtitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgDark };

  // Left vertical accent bar
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.45, h: 5.63, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });

  // Background decorations
  s.addShape(pres.shapes.OVAL, { x: 7.5, y: -1.0, w: 4.0, h: 4.0, fill: { color: COLORS.accent, transparency: 88 }, line: { color: COLORS.accent, transparency: 88 } });
  s.addShape(pres.shapes.OVAL, { x: 6.5, y: 3.8, w: 2.5, h: 2.5, fill: { color: COLORS.teal, transparency: 85 }, line: { color: COLORS.teal, transparency: 85 } });

  // Section label
  s.addText("SECTION", { x: 0.8, y: 1.6, w: 8.5, h: 0.4, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 5, fontFace: "Calibri" });
  // Divider line
  s.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: 2.1, w: 5.5, h: 0.04, fill: { color: COLORS.accent, transparency: 50 }, line: { color: COLORS.accent, transparency: 50 } });
  // Title
  s.addText(sectionTitle, { x: 0.8, y: 2.2, w: 8.5, h: 1.2, fontSize: 36, color: COLORS.textLight, bold: true, fontFace: "Cambria", valign: "top" });
  // Subtitle / description
  if (sectionSubtitle) {
    s.addText(sectionSubtitle.slice(0, 200), { x: 0.8, y: 3.55, w: 7.5, h: 0.85, fontSize: 14, color: "8099C0", fontFace: "Calibri", italic: true, valign: "top" });
  }

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Section: ${sectionTitle}`);
  return s;
}

// ── Metrics grid (shared) ─────────────────────────────────────────────────────
function addMetricsGrid(s, COLORS, metrics, startY, availH) {
  const items = metrics.slice(0, 9);
  const cols = items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const gap = 0.22;
  const cardW = (9.4 - gap * (cols - 1)) / cols;
  const cardH = Math.min((availH - gap * (rows - 1)) / rows, 1.55);

  items.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.3 + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    s.addShape("roundRect", { x, y, w: cardW, h: cardH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.08, shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.06 } });
    s.addShape("rect", { x, y, w: 0.06, h: cardH, fill: { color: COLORS.teal }, line: { color: COLORS.teal } });
    s.addText(m.label.toUpperCase(), { x: x + 0.2, y: y + 0.12, w: cardW - 0.4, h: 0.3, fontSize: 9.5, color: COLORS.textMuted, bold: true, fontFace: "Calibri", charSpacing: 0.5 });
    s.addText(m.value.slice(0, 40), { x: x + 0.2, y: y + 0.42, w: cardW - 0.4, h: cardH - 0.55, fontSize: cardH > 1.1 ? 17 : 14, color: COLORS.textDark, bold: true, fontFace: "Cambria", valign: "top", autoFit: true });
  });
}

// ── Chart slide helpers ───────────────────────────────────────────────────────

// REPLACEMENT for addBarChartSlide - more meaningful, titled, properly labelled
function addBarChartSlide(pres, COLORS, chartData, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CA}");

  const chartColors = [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart6, COLORS.chart7];

  // Format value labels nicely
  const maxVal = Math.max(...chartData.map(d => d.numericValue));
  const formatLabel = (val) => {
    if (maxVal >= 1000000) return `${(val/1000000).toFixed(1)}M`;
    if (maxVal >= 1000) return `${(val/1000).toFixed(1)}K`;
    return val.toFixed(1);
  };

  const barData = [{
    name: slideTitle.replace(/ — Chart View$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 18)),
    values: chartData.map(d => d.numericValue),
  }];

  s.addChart(pres.ChartType.bar, barData, {
    x: 0.4, y: 1.5, w: 5.8, h: 3.8,
    barDir: "col",
    chartColors: chartColors.slice(0, chartData.length),
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 9,
    dataLabelPosition: "outEnd",
    dataLabelColor: COLORS.textDark,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: COLORS.textDark,
    valAxisLabelColor: COLORS.textMuted,
    catGridLine: { style: "none" },
    valGridLine: { style: "dash", color: COLORS.border, size: 0.5 },
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
    showTitle: true,
    title: `${slideTitle.replace(/ — Chart View$/, '')} \u2014 Comparison`,
    titleFontSize: 11,
    titleColor: COLORS.textDark,
  });

  // Insight panel on the right
  const rightX = 6.5;
  const total = chartData.reduce((a, b) => a + b.numericValue, 0);
  const maxItem = chartData.reduce((a, b) => a.numericValue > b.numericValue ? a : b);
  const minItem = chartData.reduce((a, b) => a.numericValue < b.numericValue ? a : b);

  s.addShape("roundRect", { x: rightX, y: 1.55, w: 3.1, h: 1.55, fill: { color: COLORS.cardAlt }, line: { color: COLORS.border }, rectRadius: 0.1,
    shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.07 } });
  s.addText("CHART INSIGHTS", { x: rightX + 0.18, y: 1.68, w: 2.7, h: 0.28, fontSize: 8.5, color: COLORS.accent, bold: true, charSpacing: 1, fontFace: "Calibri" });
  s.addText("Highest", { x: rightX + 0.18, y: 2.02, w: 1.1, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addText(maxItem.value, { x: rightX + 0.18, y: 2.22, w: 2.7, h: 0.28, fontSize: 13, color: COLORS.chart2, bold: true, fontFace: "Cambria" });
  s.addText(`${maxItem.label}`, { x: rightX + 0.18, y: 2.50, w: 2.7, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addText("Lowest", { x: rightX + 0.18, y: 2.76, w: 1.1, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addText(minItem.value, { x: rightX + 0.18, y: 2.96, w: 2.7, h: 0.28, fontSize: 13, color: COLORS.chart4, bold: true, fontFace: "Cambria" });

  // Value legend cards
  const cardH = Math.min(3.4 / Math.max(chartData.length, 1), 0.58);
  let rightY = 3.25;
  chartData.slice(0, 5).forEach((d, i) => {
    const pct = total > 0 ? ((d.numericValue / total) * 100).toFixed(1) : '0';
    s.addShape("roundRect", { x: rightX, y: rightY, w: 3.1, h: cardH - 0.04, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.06 });
    s.addShape("roundRect", { x: rightX + 0.12, y: rightY + cardH * 0.25, w: 0.18, h: 0.18, fill: { color: chartColors[i % 7] }, line: { color: chartColors[i % 7] }, rectRadius: 0.04 });
    s.addText(d.label.slice(0, 18), { x: rightX + 0.4, y: rightY + 0.04, w: 1.8, h: 0.22, fontSize: 8.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(d.value, { x: rightX + 0.4, y: rightY + 0.24, w: 1.6, h: cardH - 0.32, fontSize: 11, color: COLORS.textDark, fontFace: "Cambria", bold: true });
    s.addText(`${pct}%`, { x: rightX + 2.5, y: rightY + 0.04, w: 0.5, h: cardH - 0.1, fontSize: 10, color: chartColors[i % 7], bold: true, align: "right", valign: "middle", fontFace: "Cambria" });
    rightY += cardH;
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Bar Chart: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

// REPLACEMENT for addHorizontalBarChartSlide - with proper ranking context
function addHorizontalBarChartSlide(pres, COLORS, chartData, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CA}");

  const chartColors = [COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart6, COLORS.chart7, COLORS.chart1];
  const barData = [{
    name: slideTitle.replace(/ — Ranking$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 24)),
    values: chartData.map(d => d.numericValue),
  }];

  s.addChart(pres.ChartType.bar, barData, {
    x: 0.4, y: 1.5, w: 9.2, h: 3.8,
    barDir: "bar",
    chartColors: chartColors.slice(0, chartData.length),
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 9.5,
    dataLabelPosition: "outEnd",
    dataLabelColor: COLORS.textDark,
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 8,
    catAxisLabelColor: COLORS.textDark,
    valAxisLabelColor: COLORS.textMuted,
    catGridLine: { style: "none" },
    valGridLine: { style: "dash", color: COLORS.border, size: 0.5 },
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
    showTitle: true,
    title: `${slideTitle.replace(/ — Ranking$/, '')} \u2014 Ranked by Value`,
    titleFontSize: 11,
    titleColor: COLORS.textDark,
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Horizontal Bar / Ranking: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

// REPLACEMENT for addPieChartSlide - better legend, percentage, clear title
function addPieChartSlide(pres, COLORS, chartData, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F967}");

  const chartColors = [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5,
    COLORS.chart6, COLORS.chart7, COLORS.chart8, "9B59B6", "E74C3C"];
  const total = chartData.reduce((a, b) => a + b.numericValue, 0);

  const pieData = [{
    name: slideTitle.replace(/ — Distribution$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 20)),
    values: chartData.map(d => d.numericValue),
  }];

  s.addChart(pres.ChartType.doughnut, pieData, {
    x: 0.35, y: 1.45, w: 4.8, h: 4.0,
    chartColors: chartColors.slice(0, chartData.length),
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 9.5,
    dataLabelColor: "FFFFFF",
    holeSize: 50,
    showTitle: true,
    title: `${slideTitle.replace(/ — Distribution$/, '')} \u2014 Distribution`,
    titleFontSize: 11,
    titleColor: COLORS.textDark,
  });

  // Total callout in doughnut hole area
  s.addShape("roundRect", { x: 1.6, y: 2.9, w: 1.95, h: 0.75, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.08 });
  s.addText("TOTAL", { x: 1.6, y: 2.93, w: 1.95, h: 0.26, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri", bold: true, align: "center" });
  const fmtTot = total >= 1000000 ? `${(total/1000000).toFixed(2)}M` : total >= 1000 ? `${(total/1000).toFixed(1)}K` : total.toFixed(1);
  s.addText(fmtTot, { x: 1.6, y: 3.18, w: 1.95, h: 0.36, fontSize: 13, color: COLORS.textDark, fontFace: "Cambria", bold: true, align: "center" });

  // Side legend with percentage bar
  const legendX = 5.45;
  let legendY = 1.5;
  const lH = Math.min(3.85 / Math.max(chartData.length, 1), 0.74);

  chartData.forEach((d, i) => {
    const pct = total > 0 ? (d.numericValue / total) * 100 : 0;
    const cc = chartColors[i % 10];
    s.addShape("roundRect", { x: legendX, y: legendY, w: 4.3, h: lH - 0.06, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.07,
      shadow: { type: "outer", color: "000000", blur: 5, offset: 1, angle: 45, opacity: 0.06 } });
    // Colour swatch
    s.addShape("roundRect", { x: legendX + 0.12, y: legendY + lH * 0.22, w: 0.22, h: 0.22, fill: { color: cc }, line: { color: cc }, rectRadius: 0.04 });
    s.addText(d.label.slice(0, 22), { x: legendX + 0.44, y: legendY + 0.04, w: 2.35, h: 0.26, fontSize: 9.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(d.value, { x: legendX + 0.44, y: legendY + 0.26, w: 2.35, h: 0.26, fontSize: 11, color: COLORS.textDark, fontFace: "Cambria", bold: true });
    // Percentage
    s.addText(`${pct.toFixed(1)}%`, { x: legendX + 3.6, y: legendY + 0.08, w: 0.58, h: lH - 0.18, fontSize: 13, color: cc, fontFace: "Cambria", bold: true, align: "right", valign: "middle" });
    // Progress bar
    if (lH > 0.55) {
      s.addShape("roundRect", { x: legendX + 0.44, y: legendY + lH - 0.22, w: 3.2, h: 0.1, fill: { color: COLORS.border }, line: { color: COLORS.border }, rectRadius: 0.05 });
      const barW = Math.max((pct / 100) * 3.2, 0.08);
      s.addShape("roundRect", { x: legendX + 0.44, y: legendY + lH - 0.22, w: barW, h: 0.1, fill: { color: cc }, line: { color: cc }, rectRadius: 0.05 });
    }
    legendY += lH;
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Doughnut Chart: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value} (${Math.round((d.numericValue/total)*100)}%)`).join("\n")}`);
  return s;
}

// REPLACEMENT for addLineChartSlide - show values, annotate trend
function addLineChartSlide(pres, COLORS, chartData, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4C8}");

  const lineData = [{
    name: slideTitle.replace(/ — Trend Analysis$/, '').slice(0, 40),
    labels: chartData.map(d => d.label.slice(0, 16)),
    values: chartData.map(d => d.numericValue),
  }];

  s.addChart(pres.ChartType.line, lineData, {
    x: 0.4, y: 1.5, w: 6.5, h: 3.8,
    chartColors: [COLORS.chart2],
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 8.5,
    dataLabelColor: COLORS.textDark,
    lineDataSymbol: "circle",
    lineDataSymbolSize: 7,
    lineSize: 2.5,
    catAxisLabelFontSize: 9.5,
    valAxisLabelFontSize: 8.5,
    catAxisLabelColor: COLORS.textDark,
    valAxisLabelColor: COLORS.textMuted,
    catGridLine: { style: "none" },
    valGridLine: { style: "dash", color: COLORS.border, size: 0.5 },
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
    showTitle: true,
    title: `${slideTitle.replace(/ — Trend Analysis$/, '')} \u2014 Trend Over Time`,
    titleFontSize: 11,
    titleColor: COLORS.textDark,
  });

  // Insight panel on right
  const maxItem = chartData.reduce((a, b) => a.numericValue > b.numericValue ? a : b);
  const minItem = chartData.reduce((a, b) => a.numericValue < b.numericValue ? a : b);
  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const changePct = first && last && first.numericValue !== 0
    ? (((last.numericValue - first.numericValue) / first.numericValue) * 100).toFixed(1)
    : null;

  const panelX = 7.15;
  s.addShape("roundRect", { x: panelX, y: 1.55, w: 2.55, h: 3.75, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1,
    shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
  s.addText("TREND INSIGHTS", { x: panelX + 0.15, y: 1.68, w: 2.25, h: 0.28, fontSize: 8.5, color: COLORS.accent, bold: true, charSpacing: 1, fontFace: "Calibri" });

  const insightItems = [
    { label: "Peak", val: maxItem.value, sub: maxItem.label, color: COLORS.chart2 },
    { label: "Low", val: minItem.value, sub: minItem.label, color: COLORS.chart4 },
  ];
  if (changePct !== null) {
    insightItems.push({ label: "Change", val: `${changePct > 0 ? '+' : ''}${changePct}%`, sub: `${first.label} \u2192 ${last.label}`, color: parseFloat(changePct) >= 0 ? COLORS.chart2 : COLORS.chart4 });
  }

  let iy = 2.04;
  insightItems.forEach(item => {
    s.addText(item.label.toUpperCase(), { x: panelX + 0.15, y: iy, w: 2.25, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri", bold: true, charSpacing: 0.3 });
    s.addText(item.val, { x: panelX + 0.15, y: iy + 0.2, w: 2.25, h: 0.34, fontSize: 14, color: item.color, fontFace: "Cambria", bold: true });
    s.addText(item.sub, { x: panelX + 0.15, y: iy + 0.52, w: 2.25, h: 0.22, fontSize: 8, color: COLORS.textMuted, fontFace: "Calibri" });
    iy += 0.86;
  });

  // Data point list
  iy += 0.12;
  s.addShape("roundRect", { x: panelX + 0.15, y: iy, w: 2.25, h: 0.02, fill: { color: COLORS.border }, line: { color: COLORS.border }, rectRadius: 0 });
  iy += 0.1;
  s.addText("DATA POINTS", { x: panelX + 0.15, y: iy, w: 2.25, h: 0.22, fontSize: 7.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true, charSpacing: 0.3 });
  iy += 0.22;
  const availH = 5.1 - iy;
  const dpH = Math.min(availH / Math.max(chartData.length, 1), 0.32);
  chartData.forEach(d => {
    if (iy + dpH > 5.2) return;
    s.addText(d.label.slice(0, 14), { x: panelX + 0.15, y: iy, w: 1.3, h: dpH, fontSize: 7.5, color: COLORS.textMuted, fontFace: "Calibri", valign: "middle" });
    s.addText(d.value, { x: panelX + 1.35, y: iy, w: 1.05, h: dpH, fontSize: 8.5, color: COLORS.textDark, fontFace: "Cambria", bold: true, align: "right", valign: "middle" });
    iy += dpH;
  });

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
    // Fallback to simple bar
    const cd = slides[0] ? extractChartData(slides[0].metrics) : null;
    if (cd) return addBarChartSlide(pres, COLORS, cd, slideTitle, docTitle, slideCounter, totalSlides, includeNotes);
    return s;
  }

  s.addChart(pres.ChartType.bar, seriesData, {
    x: 0.4, y: 1.5, w: 9.2, h: 3.8,
    barDir: "col",
    barGrouping: "stacked",
    chartColors: [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4],
    showLegend: true,
    legendPos: "b",
    legendFontSize: 9,
    showValue: false,
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

function addRadarChartSlide(pres, COLORS, chartData, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F578}\uFE0F");

  const radarData = [{
    name: "Score",
    labels: chartData.map(d => d.label.slice(0, 18)),
    values: chartData.map(d => Math.min(d.numericValue, 100)), // normalize
  }];

  s.addChart(pres.ChartType.radar, radarData, {
    x: 0.4, y: 1.45, w: 5.5, h: 4.0,
    chartColors: [COLORS.chart2],
    showLegend: false,
    catAxisLabelFontSize: 9.5,
    catAxisLabelColor: COLORS.textDark,
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
  });

  // Right insight panel
  const rX = 6.2;
  let rY = 1.55;
  const rH = 3.8 / Math.max(chartData.length, 1);
  chartData.slice(0, 6).forEach((d, i) => {
    const fillPct = Math.min(Math.round((d.numericValue / Math.max(...chartData.map(x => x.numericValue))) * 100), 100);
    s.addShape("roundRect", { x: rX, y: rY, w: 3.5, h: rH - 0.1, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.06 });
    s.addText(d.label.slice(0, 22), { x: rX + 0.15, y: rY + 0.05, w: 2.8, h: 0.25, fontSize: 9, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    // Progress bar background
    s.addShape("roundRect", { x: rX + 0.15, y: rY + 0.32, w: 3.1, h: 0.18, fill: { color: COLORS.border }, line: { color: COLORS.border }, rectRadius: 0.09 });
    // Progress bar fill
    const barW = Math.max((fillPct / 100) * 3.1, 0.1);
    s.addShape("roundRect", { x: rX + 0.15, y: rY + 0.32, w: barW, h: 0.18, fill: { color: COLORS.chart2 }, line: { color: COLORS.chart2 }, rectRadius: 0.09 });
    s.addText(d.value, { x: rX + 3.05, y: rY + 0.05, w: 0.35, h: 0.28, fontSize: 9, color: COLORS.chart2, fontFace: "Cambria", bold: true, align: "right" });
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

// ── KPI Dashboard slide (premium dark layout) ─────────────────────────────────
function addKpiSlide(pres, COLORS, metrics, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgDark };

  // Background decorations
  s.addShape(pres.shapes.OVAL, { x: 7.5, y: -0.8, w: 3.2, h: 3.2, fill: { color: COLORS.accent, transparency: 80 }, line: { color: COLORS.accent, transparency: 80 } });
  s.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.3, w: 2.0, h: 2.0, fill: { color: COLORS.teal, transparency: 85 }, line: { color: COLORS.teal, transparency: 85 } });
  s.addShape(pres.shapes.OVAL, { x: 4.5, y: 4.8, w: 1.2, h: 1.2, fill: { color: COLORS.chart3, transparency: 88 }, line: { color: COLORS.chart3, transparency: 88 } });

  // Header
  s.addText("KEY PERFORMANCE INDICATORS", { x: 0.4, y: 0.22, w: 9.2, h: 0.42, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 3, fontFace: "Calibri" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.67, w: 9.2, h: 0.03, fill: { color: COLORS.accent, transparency: 60 }, line: { color: COLORS.accent, transparency: 60 } });

  const items = metrics.slice(0, 6);
  const cols = items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const gap = 0.2;
  const cardW = (9.2 - gap * (cols - 1)) / cols;
  const cardH = Math.min((4.35 - gap * (rows - 1)) / rows, 1.6);
  const CARD_COLORS = [COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart1, COLORS.teal];

  items.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.4 + col * (cardW + gap);
    const y = 0.85 + row * (cardH + gap);
    const cc = CARD_COLORS[i % CARD_COLORS.length];

    s.addShape("roundRect", { x, y, w: cardW, h: cardH, fill: { color: cc, transparency: 88 }, line: { color: cc, transparency: 50 }, rectRadius: 0.12 });
    s.addShape("rect", { x, y, w: 0.06, h: cardH, fill: { color: cc }, line: { color: cc } });
    // Small trend arrow (cosmetic)
    s.addText("▲", { x: x + cardW - 0.35, y: y + 0.1, w: 0.28, h: 0.28, fontSize: 10, color: COLORS.chart6, fontFace: "Calibri", align: "center" });
    s.addText(m.label.toUpperCase(), { x: x + 0.2, y: y + 0.1, w: cardW - 0.6, h: 0.3, fontSize: 9, color: cc, bold: true, fontFace: "Calibri", charSpacing: 0.5 });
    s.addText(m.value.slice(0, 28), { x: x + 0.2, y: y + 0.42, w: cardW - 0.3, h: cardH - 0.6, fontSize: cardH > 1.2 ? 18 : 15, color: COLORS.textLight, bold: true, fontFace: "Cambria", valign: "top", autoFit: true });
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes("KPI Dashboard\n" + metrics.map(m => `${m.label}: ${m.value}`).join("\n"));
  return s;
}

// ── Timeline slide ────────────────────────────────────────────────────────────
function addTimelineSlide(pres, COLORS, metrics, title, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, title, "\u{1F4C5}");

  const items = metrics.slice(0, 8);
  const dotColors = [COLORS.chart2, COLORS.accent, COLORS.teal, COLORS.chart3, COLORS.chart4, COLORS.chart5, COLORS.chart6, COLORS.chart7];
  const lineX = 0.9;
  const startY = 1.65;
  const itemH = 3.65 / Math.max(items.length, 1);

  // Vertical spine
  s.addShape(pres.shapes.RECTANGLE, { x: lineX - 0.01, y: startY, w: 0.02, h: 3.55, fill: { color: COLORS.border }, line: { color: COLORS.border } });

  items.forEach((m, i) => {
    const y = startY + i * itemH;
    const dotC = dotColors[i % dotColors.length];
    // Outer ring
    s.addShape(pres.shapes.OVAL, { x: lineX - 0.15, y: y + 0.02, w: 0.3, h: 0.3, fill: { color: dotC, transparency: 70 }, line: { color: dotC, transparency: 70 } });
    // Inner dot
    s.addShape(pres.shapes.OVAL, { x: lineX - 0.09, y: y + 0.08, w: 0.18, h: 0.18, fill: { color: dotC }, line: { color: dotC } });
    s.addText(m.label, { x: 1.2, y: y, w: 3.8, h: 0.28, fontSize: 10, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addShape("roundRect", { x: 5.2, y: y, w: 4.4, h: itemH * 0.78, fill: { color: COLORS.cardBg }, line: { color: dotC, transparency: 50 }, rectRadius: 0.06 });
    s.addShape("rect", { x: 5.2, y: y, w: 0.05, h: itemH * 0.78, fill: { color: dotC }, line: { color: dotC } });
    s.addText(m.value, { x: 5.38, y: y + 0.04, w: 4.0, h: itemH * 0.65, fontSize: 12, color: COLORS.textDark, fontFace: "Cambria", bold: true, valign: "middle" });
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Timeline: ${title}\n` + metrics.map(m => `${m.label}: ${m.value}`).join("\n"));
  return s;
}

// ── Comparison / Two-column chart slide ───────────────────────────────────────
function addComparisonSlide(pres, COLORS, slideA, slideB, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, "Comparative Analysis", "\u2696\uFE0F");

  // Left column
  s.addShape("roundRect", { x: 0.25, y: 1.45, w: 4.65, h: 3.9, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
  s.addShape("rect", { x: 0.25, y: 1.45, w: 4.65, h: 0.05, fill: { color: COLORS.chart2 }, line: { color: COLORS.chart2 } });
  s.addText(slideA.title.slice(0, 30), { x: 0.4, y: 1.52, w: 4.4, h: 0.35, fontSize: 12, color: COLORS.textDark, bold: true, fontFace: "Cambria" });

  const itemHa = 3.35 / Math.max(slideA.metrics.slice(0, 5).length, 1);
  slideA.metrics.slice(0, 5).forEach((m, i) => {
    const y = 1.9 + i * itemHa;
    s.addText(m.label.toUpperCase(), { x: 0.4, y, w: 4.3, h: 0.22, fontSize: 8.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(m.value, { x: 0.4, y: y + 0.22, w: 4.3, h: itemHa - 0.28, fontSize: 14, color: COLORS.chart2, fontFace: "Cambria", bold: true });
  });

  // Right column
  s.addShape("roundRect", { x: 5.1, y: 1.45, w: 4.65, h: 3.9, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1 });
  s.addShape("rect", { x: 5.1, y: 1.45, w: 4.65, h: 0.05, fill: { color: COLORS.chart3 }, line: { color: COLORS.chart3 } });
  s.addText(slideB.title.slice(0, 30), { x: 5.25, y: 1.52, w: 4.4, h: 0.35, fontSize: 12, color: COLORS.textDark, bold: true, fontFace: "Cambria" });

  const itemHb = 3.35 / Math.max(slideB.metrics.slice(0, 5).length, 1);
  slideB.metrics.slice(0, 5).forEach((m, i) => {
    const y = 1.9 + i * itemHb;
    s.addText(m.label.toUpperCase(), { x: 5.25, y, w: 4.3, h: 0.22, fontSize: 8.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(m.value, { x: 5.25, y: y + 0.22, w: 4.3, h: itemHb - 0.28, fontSize: 14, color: COLORS.chart3, fontFace: "Cambria", bold: true });
  });

  // VS divider
  s.addShape(pres.shapes.OVAL, { x: 4.62, y: 2.95, w: 0.76, h: 0.76, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });
  s.addText("VS", { x: 4.62, y: 2.95, w: 0.76, h: 0.76, fontSize: 10, color: COLORS.accent, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Comparison: ${slideA.title} vs ${slideB.title}`);
  return s;
}

// ── Data Table slide ──────────────────────────────────────────────────────────
function addDataTableSlide(pres, COLORS, metrics, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CB}");

  const items = metrics.slice(0, 12);
  const rows = items.length;
  const rowH = Math.min(3.7 / Math.max(rows, 1), 0.42);
  const tableX = 0.3;
  const tableY = 1.5;
  const tableW = 9.4;

  // Table header
  s.addShape("roundRect", { x: tableX, y: tableY, w: tableW, h: 0.42, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark }, rectRadius: 0.04 });
  s.addText("METRIC", { x: tableX + 0.2, y: tableY, w: 5.5, h: 0.42, fontSize: 10, color: COLORS.accent, bold: true, fontFace: "Calibri", charSpacing: 1, valign: "middle" });
  s.addText("VALUE", { x: tableX + 5.8, y: tableY, w: 3.5, h: 0.42, fontSize: 10, color: COLORS.accent, bold: true, fontFace: "Calibri", charSpacing: 1, valign: "middle" });

  items.forEach((m, i) => {
    const y = tableY + 0.44 + i * rowH;
    const isAlt = i % 2 === 1;
    s.addShape("rect", { x: tableX, y, w: tableW, h: rowH, fill: { color: isAlt ? COLORS.cardAlt : COLORS.cardBg }, line: { color: COLORS.border } });
    // Accent dot
    s.addShape(pres.shapes.OVAL, { x: tableX + 0.1, y: y + rowH * 0.3, w: 0.1, h: 0.1, fill: { color: COLORS.teal }, line: { color: COLORS.teal } });
    s.addText(m.label, { x: tableX + 0.3, y, w: 5.3, h: rowH, fontSize: 11, color: COLORS.textDark, fontFace: "Calibri", valign: "middle" });
    s.addText(m.value, { x: tableX + 5.8, y, w: 3.5, h: rowH, fontSize: 11, color: COLORS.chart2, fontFace: "Cambria", bold: true, valign: "middle" });
  });

  // Bottom border
  s.addShape("rect", { x: tableX, y: tableY + 0.44 + rows * rowH - 0.01, w: tableW, h: 0.04, fill: { color: COLORS.accent, transparency: 60 }, line: { color: COLORS.accent, transparency: 60 } });

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

  // Find slides with chart-able numeric data
  const chartCandidates = contentSlides.filter(sl => {
    const cd = extractChartData(sl.metrics);
    return cd && cd.length >= 2;
  });

  // Date-heavy slides for timeline
  const dateCandidates = contentSlides.filter(sl =>
    /date|deadline|period|schedule/i.test(sl.title) && sl.metrics.length >= 2
  );

  // Big metric slide for KPI dashboard
  const kpiCandidate = contentSlides.find(sl =>
    sl.metrics.length >= 4 && /metric|overview|summary|balance|account|kpi|perform/i.test(sl.title)
  );

  // Data table candidate (slide with many metrics but no clear chart data)
  const tableCandidate = contentSlides.find(sl =>
    sl.metrics.length >= 6 && !chartCandidates.includes(sl)
  );

  // Slides with enough metrics for comparison
  const compCandidates = contentSlides.filter(sl => sl.metrics.length >= 3);

  // Slides with sequential numeric data (for line chart)
  const lineCandidates = chartCandidates.filter(sl => extractChartData(sl.metrics) && extractChartData(sl.metrics).length >= 4);

  // Radar candidates (5+ metrics, analysis-style)
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

  // How many chart slides (bar/pie/line/radar/stacked) to add
  const numBarPie = Math.min(chartCandidates.length, Math.ceil(maxCharts * 0.5));
  const numLine   = Math.min(lineCandidates.length, Math.ceil(maxCharts * 0.25));
  const numRadar  = Math.min(radarCandidates.length, Math.ceil(maxCharts * 0.15));
  const numStacked = (chartCandidates.length >= 3 && maxCharts > 2) ? 1 : 0;
  const totalExtraCharts = Math.min(numBarPie + numLine + numRadar + numStacked, maxCharts);

  // Section divider count (every 4 content slides)
  const numDividers = hasSectionDividers ? Math.floor(contentSlides.length / 4) : 0;

  // Estimate total slides
  const totalSlides =
    1                                        // cover
    + (showAgenda ? 1 : 0)
    + (hasKpi ? 1 : 0)
    + numDividers
    + contentSlides.length
    + totalExtraCharts
    + (hasTimeline ? 1 : 0)
    + (hasDataTable ? 1 : 0)
    + (hasComparison ? 1 : 0)
    + (conclusionSlide ? 1 : 0)
    + 1;                                     // closing

  let slideCounter = 1;
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = docTitle;

  // ── COVER SLIDE ───────────────────────────────────────────────────────────
  const coverSlide = pres.addSlide();
  coverSlide.background = { color: COLORS.bgDark };

  // Premium decorative elements
  coverSlide.addShape(pres.shapes.OVAL, { x: 7.8, y: -1.0, w: 3.5, h: 3.5, fill: { color: COLORS.accent, transparency: 75 }, line: { color: COLORS.accent, transparency: 75 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.0, w: 2.0, h: 2.0, fill: { color: COLORS.teal, transparency: 80 }, line: { color: COLORS.teal, transparency: 80 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: 4.5, y: 3.5, w: 1.2, h: 1.2, fill: { color: COLORS.chart3, transparency: 85 }, line: { color: COLORS.chart3, transparency: 85 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: 6.0, y: 2.5, w: 0.6, h: 0.6, fill: { color: COLORS.chart6, transparency: 80 }, line: { color: COLORS.chart6, transparency: 80 } });

  // Accent bar
  coverSlide.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 2.8, w: 1.6, h: 0.06, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });

  // Text content
  coverSlide.addText("AI DOCUMENT SUMMARY", { x: 0.6, y: 1.35, w: 8.8, h: 0.5, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 4, fontFace: "Calibri" });
  coverSlide.addText(heroTitle, { x: 0.6, y: 1.82, w: 8.8, h: 1.15, fontSize: 34, color: COLORS.textLight, bold: true, fontFace: "Cambria", lineSpacing: 40 });
  coverSlide.addText("Powered by AI Document Summarizer", { x: 0.6, y: 3.05, w: 8.8, h: 0.45, fontSize: 13, color: "A0B0D0", fontFace: "Calibri" });

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalContentSections = contentSlides.length + (conclusionSlide ? 1 : 0);
  coverSlide.addText(`${today}  \u2022  ${totalContentSections} sections  \u2022  ${totalSlides} slides  \u2022  AI-generated`, {
    x: 0.6, y: 4.75, w: 8.8, h: 0.42, fontSize: 11, color: "6A80A8", fontFace: "Calibri"
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
    const gap = 0.2;
    const cardW = (9.4 - gap) / cols;
    const cardH = Math.min((3.75 - gap * (rows - 1)) / rows, 0.85);
    all.forEach((sec, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 0.3 + col * (cardW + gap);
      const y = 1.55 + row * (cardH + gap);
      agenda.addShape("roundRect", { x, y, w: cardW, h: cardH, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.08 });
      agenda.addShape("rect", { x, y, w: 0.04, h: cardH, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
      agenda.addText(sec.icon, { x: x + 0.15, y, w: 0.55, h: cardH, fontSize: 18, valign: "middle", align: "center" });
      agenda.addText(`${i + 1}.  ${sec.title}`, { x: x + 0.65, y, w: cardW - 0.8, h: cardH, fontSize: 12, color: COLORS.textDark, bold: true, fontFace: "Calibri", valign: "middle" });
    });
    addFooter(agenda, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) agenda.addNotes(`Agenda: ${all.map(sl => sl.title).join(", ")}`);
  }

  // ── KPI DASHBOARD (early in deck) ─────────────────────────────────────────
  if (hasKpi) {
    addKpiSlide(pres, COLORS, kpiCandidate.metrics, docTitle, ++slideCounter, totalSlides, includeNotes);
  }

  // ── CONTENT SLIDES with inline chart injection ────────────────────────────
  const chartSlidesSoFar = new Set();
  let barPieCount = 0;
  let lineCount = 0;
  let radarCount = 0;
  let stackedDone = false;
  let dividerCount = 0;

  contentSlides.forEach((slide, slideIdx) => {
    // Insert section divider every 4 slides
    if (hasSectionDividers && slideIdx > 0 && slideIdx % 4 === 0 && dividerCount < numDividers) {
      const nextSection = contentSlides[slideIdx];
      addSectionDivider(
        pres, COLORS,
        nextSection.title,
        nextSection.body ? nextSection.body.slice(0, 160) : "",
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

    if (hasMetrics) {
      const leftoverText = hasBody
        ? slide.body.slice(0, 220)
        : (hasBullets ? slide.bullets.slice(0, 2).join(" \u2022 ").slice(0, 220) : "");
      const gridH = leftoverText ? 3.05 : 3.75;
      addMetricsGrid(s, COLORS, slide.metrics, 1.55, gridH);
      if (leftoverText) {
        s.addShape("roundRect", { x: 0.3, y: 1.55 + gridH + 0.1, w: 9.4, h: 0.65, fill: { color: COLORS.cardAlt }, line: { color: COLORS.border }, rectRadius: 0.06 });
        s.addText(leftoverText, { x: 0.5, y: 1.6 + gridH + 0.1, w: 9.0, h: 0.55, fontSize: 11, italic: true, color: COLORS.textMuted, fontFace: "Calibri", valign: "middle" });
      }
    } else if (hasBullets && hasBody) {
      const bulletItems = slide.bullets.slice(0, maxB).map((b, i) => ({
        text: b.slice(0, 140),
        options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < Math.min(slide.bullets.length, maxB) - 1, fontSize: 13, color: COLORS.textDark, paraSpaceAfter: 6 },
      }));
      s.addShape("roundRect", { x: 0.3, y: 1.55, w: 5.5, h: 3.75, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      s.addText(bulletItems, { x: 0.5, y: 1.7, w: 5.1, h: 3.45, fontFace: "Calibri", valign: "top" });
      s.addShape("roundRect", { x: 6.0, y: 1.55, w: 3.7, h: 3.75, fill: { color: COLORS.cardAlt }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      s.addText("KEY INSIGHT", { x: 6.15, y: 1.68, w: 3.4, h: 0.35, fontSize: 10, color: COLORS.accent, bold: true, fontFace: "Calibri", charSpacing: 1 });
      s.addShape(pres.shapes.RECTANGLE, { x: 6.15, y: 2.05, w: 3.4, h: 0.03, fill: { color: COLORS.accent, transparency: 70 }, line: { color: COLORS.accent, transparency: 70 } });
      s.addText(slide.body.slice(0, bodyLen), { x: 6.15, y: 2.1, w: 3.4, h: 3.05, fontSize: 12, color: COLORS.textDark, fontFace: "Calibri", valign: "top" });
    } else if (hasBullets) {
      const bullets = slide.bullets.slice(0, maxB);
      const cols2 = bullets.length > 5 ? 2 : 1;
      s.addShape("roundRect", { x: 0.3, y: 1.55, w: 9.4, h: 3.75, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      if (cols2 === 2) {
        const half = Math.ceil(bullets.length / 2);
        const makeItems = (arr) => arr.map((b, i) => ({
          text: b.slice(0, 120),
          options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < arr.length - 1, fontSize: 13, color: COLORS.textDark, paraSpaceAfter: 8 },
        }));
        s.addText(makeItems(bullets.slice(0, half)), { x: 0.5, y: 1.7, w: 4.5, h: 3.45, fontFace: "Calibri", valign: "top" });
        s.addShape(pres.shapes.RECTANGLE, { x: 5.05, y: 1.75, w: 0.02, h: 3.3, fill: { color: COLORS.border }, line: { color: COLORS.border } });
        s.addText(makeItems(bullets.slice(half)), { x: 5.1, y: 1.7, w: 4.5, h: 3.45, fontFace: "Calibri", valign: "top" });
      } else {
        const bulletItems = bullets.map((b, i) => ({
          text: b.slice(0, 160),
          options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < bullets.length - 1, fontSize: 14, color: COLORS.textDark, paraSpaceAfter: 10 },
        }));
        s.addText(bulletItems, { x: 0.5, y: 1.7, w: 9.0, h: 3.45, fontFace: "Calibri", valign: "top" });
      }
    } else if (hasBody) {
      s.addShape("roundRect", { x: 0.3, y: 1.55, w: 9.4, h: 3.75, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      s.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 1.55, w: 0.06, h: 3.75, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
      s.addText(slide.body.slice(0, bodyLen * 2), { x: 0.55, y: 1.7, w: 8.9, h: 3.45, fontSize: 14, color: COLORS.textDark, fontFace: "Calibri", valign: "top", lineSpacing: 22 });
    } else {
      s.addText("No additional details in this section.", { x: 0.5, y: 2.8, w: 9.0, h: 0.6, fontSize: 13, italic: true, color: COLORS.textMuted, fontFace: "Calibri", align: "center" });
    }

    addFooter(s, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) s.addNotes(plainTextNotes(slide));

    // ── Inject chart slides after content slide ──────────────────────────────
    if (!chartSlidesSoFar.has(slide)) {
      const cd = extractChartData(slide.metrics);

      // Line chart for sequential data
      if (cd && lineCandidates.includes(slide) && lineCount < numLine) {
        addLineChartSlide(pres, COLORS, cd, `${slide.title} — Trend Analysis`, docTitle, ++slideCounter, totalSlides, includeNotes);
        chartSlidesSoFar.add(slide);
        lineCount++;
      }
      // Radar for analysis slides
      else if (cd && radarCandidates.includes(slide) && radarCount < numRadar) {
        addRadarChartSlide(pres, COLORS, cd, `${slide.title} — Radar Analysis`, docTitle, ++slideCounter, totalSlides, includeNotes);
        chartSlidesSoFar.add(slide);
        radarCount++;
      }
      // Stacked bar (once, if multiple metric slides)
      else if (cd && !stackedDone && numStacked > 0 && chartCandidates.indexOf(slide) >= 1 && chartCandidates.length >= 3) {
        const multiSlides = chartCandidates.slice(0, 4);
        addStackedBarChartSlide(pres, COLORS, multiSlides, "Multi-Section Comparison", docTitle, ++slideCounter, totalSlides, includeNotes);
        chartSlidesSoFar.add(slide);
        stackedDone = true;
      }
      // Standard bar/pie alternation
      else if (cd && chartCandidates.includes(slide) && barPieCount < numBarPie) {
        if (barPieCount % 3 === 0) {
          addBarChartSlide(pres, COLORS, cd, `${slide.title} — Chart View`, docTitle, ++slideCounter, totalSlides, includeNotes);
        } else if (barPieCount % 3 === 1) {
          addPieChartSlide(pres, COLORS, cd, `${slide.title} — Distribution`, docTitle, ++slideCounter, totalSlides, includeNotes);
        } else {
          addHorizontalBarChartSlide(pres, COLORS, cd, `${slide.title} — Ranking`, docTitle, ++slideCounter, totalSlides, includeNotes);
        }
        chartSlidesSoFar.add(slide);
        barPieCount++;
      }
    }
  });

  // ── DATA TABLE SLIDE ──────────────────────────────────────────────────────
  if (hasDataTable) {
    addDataTableSlide(pres, COLORS, tableCandidate.metrics, `${tableCandidate.title} — Data Table`, docTitle, ++slideCounter, totalSlides, includeNotes);
  }

  // ── TIMELINE SLIDE ─────────────────────────────────────────────────────────
  if (hasTimeline) {
    const dc = dateCandidates[0];
    addTimelineSlide(pres, COLORS, dc.metrics, `${dc.title} — Timeline`, docTitle, ++slideCounter, totalSlides, includeNotes);
  }

  // ── COMPARISON SLIDE ──────────────────────────────────────────────────────
  if (hasComparison && compCandidates.length >= 2) {
    addComparisonSlide(pres, COLORS, compCandidates[0], compCandidates[1], docTitle, ++slideCounter, totalSlides, includeNotes);
  }

  // ── CONCLUSION / KEY TAKEAWAY SLIDE ───────────────────────────────────────
  if (conclusionSlide) {
    const t = pres.addSlide();
    t.background = { color: COLORS.bgDark };
    t.addShape(pres.shapes.OVAL, { x: -1.2, y: -1.2, w: 3.2, h: 3.2, fill: { color: COLORS.teal, transparency: 82 }, line: { color: COLORS.teal, transparency: 82 } });
    t.addShape(pres.shapes.OVAL, { x: 8.6, y: 3.8, w: 2.6, h: 2.6, fill: { color: COLORS.accent, transparency: 80 }, line: { color: COLORS.accent, transparency: 80 } });
    t.addShape(pres.shapes.OVAL, { x: 5.0, y: 0.5, w: 1.0, h: 1.0, fill: { color: COLORS.chart6, transparency: 85 }, line: { color: COLORS.chart6, transparency: 85 } });

    t.addText("\u2705  KEY TAKEAWAY", { x: 0.8, y: 0.85, w: 8.4, h: 0.5, fontSize: 12, color: COLORS.accent, bold: true, charSpacing: 3, fontFace: "Calibri" });
    t.addShape(pres.shapes.RECTANGLE, { x: 0.85, y: 1.55, w: 0.06, h: 2.8, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
    const conclusionText = (conclusionSlide.body || conclusionSlide.bullets.join(" ")).slice(0, 520);
    t.addText(conclusionText, { x: 1.15, y: 1.5, w: 7.8, h: 2.9, fontSize: 18, color: COLORS.textLight, fontFace: "Cambria", italic: true, valign: "top", lineSpacing: 26 });
    addFooter(t, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) t.addNotes(plainTextNotes(conclusionSlide));
  }

  // ── CLOSING SLIDE ─────────────────────────────────────────────────────────
  const endSlide = pres.addSlide();
  endSlide.background = { color: COLORS.bgDark };
  endSlide.addShape(pres.shapes.OVAL, { x: -1.0, y: 2.5, w: 4.0, h: 4.0, fill: { color: COLORS.accent, transparency: 82 }, line: { color: COLORS.accent, transparency: 82 } });
  endSlide.addShape(pres.shapes.OVAL, { x: 8.5, y: -0.5, w: 2.5, h: 2.5, fill: { color: COLORS.teal, transparency: 78 }, line: { color: COLORS.teal, transparency: 78 } });
  endSlide.addShape(pres.shapes.OVAL, { x: 4.0, y: 2.0, w: 1.5, h: 1.5, fill: { color: COLORS.chart3, transparency: 85 }, line: { color: COLORS.chart3, transparency: 85 } });
  endSlide.addShape(pres.shapes.OVAL, { x: 2.5, y: 0.5, w: 0.8, h: 0.8, fill: { color: COLORS.chart6, transparency: 85 }, line: { color: COLORS.chart6, transparency: 85 } });

  // Horizontal accent line
  endSlide.addShape(pres.shapes.RECTANGLE, { x: 2.5, y: 2.9, w: 5.0, h: 0.05, fill: { color: COLORS.accent, transparency: 60 }, line: { color: COLORS.accent, transparency: 60 } });

  endSlide.addText("Thank You", { x: 1, y: 1.5, w: 8, h: 1.2, fontSize: 46, color: COLORS.textLight, bold: true, fontFace: "Cambria", align: "center" });
  endSlide.addText("Summary generated by AI Document Summarizer", { x: 1, y: 3.05, w: 8, h: 0.5, fontSize: 14, color: "7A90B8", align: "center", fontFace: "Calibri" });
  endSlide.addText(today, { x: 1, y: 3.55, w: 8, h: 0.35, fontSize: 11, color: "5A6A8A", align: "center", fontFace: "Calibri" });
  if (includeNotes) endSlide.addNotes("Closing slide.");

  return { pres, slideCount: totalSlides };
}

// ── POST /generate-ppt ────────────────────────────────────────────────────────
router.post("/generate-ppt", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const { summary, filename = "Document", documentId = null, options = {} } = req.body;
    if (!summary) return res.status(400).json({ message: "Summary is required" });

    const theme              = resolveTheme(options.theme);
    const detail             = resolveDetail(options.detailLevel);
    const chartDensityConfig = resolveChartDensity(options.chartDensity);
    const includeAgendaOpt   = options.includeAgenda !== false;
    const includeNotes       = options.includeNotes  !== false;

    const docTitle   = (options.title && options.title.trim()) || filename.replace(/\.[^/.]+$/, "");
    const titleMatch = summary.match(/^#\s+(.+)$/m);
    const heroTitle  = (options.title && options.title.trim()) || (titleMatch ? titleMatch[1].trim() : docTitle);

    const { pres, slideCount } = buildDeck({
      summary, docTitle, heroTitle, theme, detail, chartDensityConfig, includeAgendaOpt, includeNotes
    });

    const tmpFile = path.join(os.tmpdir(), `summary-${Date.now()}.pptx`);
    await pres.writeFile({ fileName: tmpFile });
    const buffer = fs.readFileSync(tmpFile);
    fs.unlink(tmpFile, () => {});

    const saved = await Presentation.create({
      userId: req.user._id,
      documentId: documentId || null,
      filename: `${docTitle}.pptx`,
      sourceFilename: filename,
      theme: options.theme || "navyGold",
      detailLevel: options.detailLevel || "standard",
      chartDensity: options.chartDensity || "auto",
      includeAgenda: includeAgendaOpt,
      includeNotes,
      slideCount,
      sizeBytes: buffer.length,
      data: buffer,
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

// ── GET /presentations ────────────────────────────────────────────────────────
const PRES_EXT_MAP = {
  pdf:  /\.pdf$/i,
  docx: /\.docx$/i,
  txt:  /\.txt$/i,
  xlsx: /\.(xlsx|xls|csv)$/i,
  jpg:  /\.(jpg|jpeg)$/i,
  png:  /\.png$/i,
};

const PRES_SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt:  1 },
};

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
    if (search) filter.$or = [
      { filename:       { $regex: search, $options: "i" } },
      { sourceFilename: { $regex: search, $options: "i" } },
    ];
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

// ── GET /presentations/:id/download (PPTX) ───────────────────────────────────
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

// ── GET /presentations/:id/download-pdf ──────────────────────────────────────
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

// ── DELETE /presentations/:id ─────────────────────────────────────────────────
router.delete("/presentations/:id", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    await Presentation.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete presentation" });
  }
});

module.exports = router;