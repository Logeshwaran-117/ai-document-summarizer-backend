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
    bgDark: "1E2761", bgLight: "F7F9FC", accent: "C9A84C", teal: "2FA4A0",
    textLight: "FFFFFF", textDark: "1A1A2E", textMuted: "5A6A8A",
    cardBg: "FFFFFF", cardAlt: "EEF4FF", border: "E0E8F0",
    chart1: "1E2761", chart2: "C9A84C", chart3: "2FA4A0", chart4: "E74C3C", chart5: "8E44AD",
  },
  tealSlate: {
    label: "Teal & Slate",
    bgDark: "0F3D3E", bgLight: "F5FAFA", accent: "3FBFAE", teal: "1F7A72",
    textLight: "FFFFFF", textDark: "17302F", textMuted: "4E6E6C",
    cardBg: "FFFFFF", cardAlt: "E6F5F3", border: "D6EAE8",
    chart1: "0F3D3E", chart2: "3FBFAE", chart3: "F39C12", chart4: "E74C3C", chart5: "8E44AD",
  },
  charcoalRuby: {
    label: "Charcoal & Ruby",
    bgDark: "231F20", bgLight: "F9F7F7", accent: "C0392B", teal: "8E7B57",
    textLight: "FFFFFF", textDark: "231F20", textMuted: "6B6260",
    cardBg: "FFFFFF", cardAlt: "F3E9E7", border: "E7DEDC",
    chart1: "231F20", chart2: "C0392B", chart3: "E67E22", chart4: "27AE60", chart5: "2980B9",
  },
};

const DETAIL_LEVELS = {
  concise:  { maxBullets: 4, bodyLen: 260, label: "Concise" },
  standard: { maxBullets: 7, bodyLen: 350, label: "Standard" },
  detailed: { maxBullets: 10, bodyLen: 600, label: "Detailed" },
};

function resolveTheme(key)  { return THEMES[key]  || THEMES.navyGold; }
function resolveDetail(key) { return DETAIL_LEVELS[key] || DETAIL_LEVELS.standard; }

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
  return "\u{1F4C4}";
}

function parseMetricLine(rawLine) {
  const line = rawLine.replace(/^[-*]\s+/, "").trim();
  const m = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
  if (m) return { label: m[1].trim(), value: m[2].trim().replace(/\*\*/g, "") };
  const m2 = line.match(/^([A-Za-z][A-Za-z0-9 /&()]{1,32}):\s*(.+)$/);
  if (m2 && m2[2].length < 80) return { label: m2[1].trim(), value: m2[2].trim() };
  return null;
}

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
    chunks.slice(0, 6).forEach((chunk, i) => {
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

function addFooter(s, COLORS, docTitle, idx, total) {
  s.addText(docTitle, { x: 0.3, y: 5.35, w: 6.5, h: 0.25, fontSize: 9, color: COLORS.textMuted, fontFace: "Calibri" });
  s.addShape("roundRect", { x: 8.75, y: 5.28, w: 0.95, h: 0.32, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark }, rectRadius: 0.16 });
  s.addText(`${idx} / ${total}`, { x: 8.75, y: 5.28, w: 0.95, h: 0.32, fontSize: 9, color: COLORS.textLight, align: "center", valign: "middle", fontFace: "Calibri", bold: true });
}

function addSlideHeader(s, pres, COLORS, title, icon) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.25, fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 1.25, w: 10, h: 0.04, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
  s.addText(icon, { x: 0.4, y: 0.26, w: 0.7, h: 0.7, fontSize: 26, align: "center", valign: "middle" });
  s.addText(title, { x: 1.05, y: 0.24, w: 8.4, h: 0.75, fontSize: 24, color: COLORS.textLight, bold: true, fontFace: "Cambria", valign: "middle", margin: 0 });
}

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

// ── Bar chart slide ───────────────────────────────────────────────────────────
function addBarChartSlide(pres, COLORS, chartData, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F4CA}");

  const chartColors = [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5];
  const barData = [{
    name: "Value",
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
    dataLabelColor: COLORS.textDark,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    catAxisLabelColor: COLORS.textMuted,
    valAxisLabelColor: COLORS.textMuted,
    plotAreaBorderColor: COLORS.border,
    chartAreaBorderColor: COLORS.border,
  });

  // Legend / label cards on the right
  const rightX = 6.5;
  let rightY = 1.55;
  const cardH = Math.min(3.8 / chartData.length, 0.7);
  chartData.slice(0, 6).forEach((d, i) => {
    s.addShape("roundRect", { x: rightX, y: rightY, w: 3.1, h: cardH - 0.05, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.06 });
    s.addShape("rect", { x: rightX, y: rightY, w: 0.06, h: cardH - 0.05, fill: { color: chartColors[i % 5] }, line: { color: chartColors[i % 5] } });
    s.addText(d.label.slice(0, 22), { x: rightX + 0.15, y: rightY + 0.05, w: 2.0, h: 0.25, fontSize: 9, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(d.value, { x: rightX + 0.15, y: rightY + 0.3, w: 2.8, h: 0.28, fontSize: 13, color: COLORS.textDark, fontFace: "Cambria", bold: true });
    rightY += cardH;
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Chart: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

// ── Pie chart slide ───────────────────────────────────────────────────────────
function addPieChartSlide(pres, COLORS, chartData, slideTitle, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, slideTitle, "\u{1F967}");

  const chartColors = [COLORS.chart1, COLORS.chart2, COLORS.chart3, COLORS.chart4, COLORS.chart5,
    "2ECC71", "E67E22", "9B59B6", "1ABC9C", "E74C3C"];
  const pieData = [{
    name: "Distribution",
    labels: chartData.map(d => d.label.slice(0, 20)),
    values: chartData.map(d => d.numericValue),
  }];

  s.addChart(pres.ChartType.doughnut, pieData, {
    x: 0.5, y: 1.45, w: 4.5, h: 3.9,
    chartColors: chartColors.slice(0, chartData.length),
    showLegend: false,
    showValue: true,
    dataLabelFontSize: 10,
    dataLabelColor: "FFFFFF",
    holeSize: 40,
  });

  // Side legend
  const legendX = 5.3;
  let legendY = 1.6;
  const lH = Math.min(3.8 / chartData.length, 0.75);
  chartData.forEach((d, i) => {
    s.addShape("roundRect", { x: legendX, y: legendY, w: 4.3, h: lH - 0.06, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.06 });
    s.addShape("roundRect", { x: legendX + 0.12, y: legendY + (lH * 0.2), w: 0.25, h: 0.25, fill: { color: chartColors[i % 10] }, line: { color: chartColors[i % 10] }, rectRadius: 0.04 });
    s.addText(d.label.slice(0, 24), { x: legendX + 0.48, y: legendY + 0.05, w: 2.6, h: 0.25, fontSize: 9.5, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addText(d.value, { x: legendX + 0.48, y: legendY + 0.28, w: 2.6, h: 0.25, fontSize: 12, color: COLORS.textDark, fontFace: "Cambria", bold: true });
    const pct = Math.round((d.numericValue / chartData.reduce((a, b) => a + b.numericValue, 0)) * 100);
    s.addText(`${pct}%`, { x: legendX + 3.6, y: legendY + 0.1, w: 0.6, h: lH - 0.2, fontSize: 13, color: chartColors[i % 10], fontFace: "Cambria", bold: true, align: "right", valign: "middle" });
    legendY += lH;
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Pie Chart: ${slideTitle}\n${chartData.map(d => `${d.label}: ${d.value}`).join("\n")}`);
  return s;
}

// ── Try to extract chart-able data from metrics ───────────────────────────────
function extractChartData(metrics) {
  const result = [];
  for (const m of metrics) {
    // Strip currency symbols and commas, try to parse a number
    const cleaned = m.value.replace(/[₹$€£,\s]/g, "").replace(/[^\d.\-]/g, "");
    const num = parseFloat(cleaned);
    if (!isNaN(num) && isFinite(num) && num !== 0) {
      result.push({ label: m.label, value: m.value, numericValue: Math.abs(num) });
    }
  }
  return result.length >= 2 ? result : null;
}

// ── KPI Summary slide (2-col layout of big metric cards + a sparkline area) ──
function addKpiSlide(pres, COLORS, metrics, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgDark };

  // Diagonal accent
  s.addShape(pres.shapes.OVAL, { x: 7.5, y: -0.8, w: 3.2, h: 3.2, fill: { color: COLORS.accent, transparency: 80 }, line: { color: COLORS.accent, transparency: 80 } });
  s.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.3, w: 2.0, h: 2.0, fill: { color: COLORS.teal, transparency: 85 }, line: { color: COLORS.teal, transparency: 85 } });

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

    s.addShape("roundRect", { x, y, w: cardW, h: cardH, fill: { color: cc, transparency: 88 }, line: { color: cc, transparency: 50 }, rectRadius: 0.1 });
    s.addShape("rect", { x, y, w: 0.06, h: cardH, fill: { color: cc }, line: { color: cc } });
    s.addText(m.label.toUpperCase(), { x: x + 0.2, y: y + 0.1, w: cardW - 0.3, h: 0.3, fontSize: 9, color: cc, bold: true, fontFace: "Calibri", charSpacing: 0.5 });
    s.addText(m.value.slice(0, 28), { x: x + 0.2, y: y + 0.42, w: cardW - 0.3, h: cardH - 0.6, fontSize: cardH > 1.2 ? 18 : 15, color: COLORS.textLight, bold: true, fontFace: "Cambria", valign: "top", autoFit: true });
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes("KPI Summary\n" + metrics.map(m => `${m.label}: ${m.value}`).join("\n"));
  return s;
}

// ── Timeline / dates slide ───────────────────────────────────────────────────
function addTimelineSlide(pres, COLORS, metrics, title, docTitle, slideCounter, totalSlides, includeNotes) {
  const s = pres.addSlide();
  s.background = { color: COLORS.bgLight };
  addSlideHeader(s, pres, COLORS, title, "\u{1F4C5}");

  const items = metrics.slice(0, 8);
  const dotColors = [COLORS.chart2, COLORS.accent, COLORS.teal, COLORS.chart3, COLORS.chart4];
  const lineX = 0.9;
  const startY = 1.65;
  const itemH = (3.65) / Math.max(items.length, 1);

  // Vertical line
  s.addShape(pres.shapes.RECTANGLE, { x: lineX - 0.01, y: startY, w: 0.02, h: 3.55, fill: { color: COLORS.border }, line: { color: COLORS.border } });

  items.forEach((m, i) => {
    const y = startY + i * itemH;
    const dotC = dotColors[i % dotColors.length];
    s.addShape(pres.shapes.OVAL, { x: lineX - 0.11, y: y + 0.05, w: 0.22, h: 0.22, fill: { color: dotC }, line: { color: dotC } });
    s.addText(m.label, { x: 1.2, y: y, w: 3.8, h: 0.28, fontSize: 10, color: COLORS.textMuted, fontFace: "Calibri", bold: true });
    s.addShape("roundRect", { x: 5.2, y: y, w: 4.4, h: itemH * 0.75, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.06 });
    s.addText(m.value, { x: 5.4, y: y + 0.04, w: 4.0, h: itemH * 0.65, fontSize: 12, color: COLORS.textDark, fontFace: "Cambria", bold: true, valign: "middle" });
  });

  addFooter(s, COLORS, docTitle, slideCounter, totalSlides);
  if (includeNotes) s.addNotes(`Timeline: ${title}\n` + metrics.map(m => `${m.label}: ${m.value}`).join("\n"));
  return s;
}

// ── Core deck builder ─────────────────────────────────────────────────────────
function buildDeck({ summary, docTitle, heroTitle, theme, detail, includeAgendaOpt, includeNotes }) {
  const COLORS = theme;
  const rawSlides = parseSummaryToSlides(summary);

  const conclusionIdx = rawSlides.findIndex(sl => sl.title.toLowerCase().includes("conclusion"));
  let conclusionSlide = null;
  if (conclusionIdx !== -1) {
    conclusionSlide = rawSlides[conclusionIdx];
    rawSlides.splice(conclusionIdx, 1);
  }

  const contentSlides = rawSlides;

  // ── Detect banking/financial and auto-insert chart slides ─────────────────
  const isBankingContent = rawSlides.some(sl =>
    /key metrics|financial summary|account overview|key transactions|fees|alerts/i.test(sl.title)
  );

  // Find metric-rich slides for chart candidates
  const chartCandidates = contentSlides.filter(sl => {
    const cd = extractChartData(sl.metrics);
    return cd && cd.length >= 2;
  });

  // Extract date-heavy slides for timeline
  const dateCandidates = contentSlides.filter(sl =>
    /date|deadline|period|schedule/i.test(sl.title) && sl.metrics.length >= 2
  );

  // Find big metric slide for KPI
  const kpiCandidate = contentSlides.find(sl =>
    sl.metrics.length >= 4 && /metric|overview|summary|balance|account/i.test(sl.title)
  );

  // We'll insert chart slides AFTER their source content slides
  const showAgenda = includeAgendaOpt && contentSlides.length > 2;

  // Estimate total slides: cover + agenda? + content + charts + kpi + timeline + conclusion? + end
  const extraChartSlides = Math.min(chartCandidates.length, 2); // max 2 bar/pie pairs
  const hasKpi = !!kpiCandidate && isBankingContent;
  const hasTimeline = dateCandidates.length > 0;
  const totalSlides = 1
    + (showAgenda ? 1 : 0)
    + contentSlides.length
    + extraChartSlides * 1        // one chart per candidate (bar or pie alternating)
    + (hasKpi ? 1 : 0)
    + (hasTimeline ? 1 : 0)
    + (conclusionSlide ? 1 : 0)
    + 1; // end

  let slideCounter = 1;

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = docTitle;

  // ── COVER ──────────────────────────────────────────────────────────────────
  const coverSlide = pres.addSlide();
  coverSlide.background = { color: COLORS.bgDark };
  coverSlide.addShape(pres.shapes.OVAL, { x: 7.8, y: -1.0, w: 3.5, h: 3.5, fill: { color: COLORS.accent, transparency: 75 }, line: { color: COLORS.accent, transparency: 75 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.0, w: 2.0, h: 2.0, fill: { color: COLORS.teal, transparency: 80 }, line: { color: COLORS.teal, transparency: 80 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: 4.5, y: 3.5, w: 1.2, h: 1.2, fill: { color: COLORS.chart3, transparency: 85 }, line: { color: COLORS.chart3, transparency: 85 } });
  coverSlide.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 2.8, w: 1.2, h: 0.06, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
  coverSlide.addText("AI SUMMARY", { x: 0.6, y: 1.4, w: 8.8, h: 0.5, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 4, fontFace: "Calibri" });
  coverSlide.addText(heroTitle, { x: 0.6, y: 1.85, w: 8.8, h: 1.1, fontSize: 34, color: COLORS.textLight, bold: true, fontFace: "Cambria" });
  coverSlide.addText("Generated Document Summary", { x: 0.6, y: 3.0, w: 8.8, h: 0.5, fontSize: 14, color: "A0B0D0", fontFace: "Calibri" });
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalContentSections = contentSlides.length + (conclusionSlide ? 1 : 0);
  coverSlide.addText(`${today}  \u2022  ${totalContentSections} sections  \u2022  AI-generated`, { x: 0.6, y: 4.8, w: 8.8, h: 0.4, fontSize: 11, color: "6A80A8", fontFace: "Calibri" });
  if (includeNotes) coverSlide.addNotes(`Cover slide for ${docTitle}. Generated ${today}.`);

  // ── AGENDA ─────────────────────────────────────────────────────────────────
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
      agenda.addText(sec.icon, { x: x + 0.15, y, w: 0.6, h: cardH, fontSize: 18, valign: "middle", align: "center" });
      agenda.addText(`${i + 1}.  ${sec.title}`, { x: x + 0.7, y, w: cardW - 0.85, h: cardH, fontSize: 13, color: COLORS.textDark, bold: true, fontFace: "Calibri", valign: "middle" });
    });
    addFooter(agenda, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) agenda.addNotes(`Agenda: ${all.map(sl => sl.title).join(", ")}`);
  }

  // ── KPI SLIDE (banking only, early in deck after agenda) ──────────────────
  if (hasKpi) {
    addKpiSlide(pres, COLORS, kpiCandidate.metrics, docTitle, ++slideCounter, totalSlides, includeNotes);
  }

  // ── CONTENT SLIDES (with inline chart injection) ───────────────────────────
  const chartSlidesSoFar = new Set();
  contentSlides.forEach((slide) => {
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
      s.addText(slide.body.slice(0, bodyLen), { x: 6.15, y: 2.05, w: 3.4, h: 3.1, fontSize: 12, color: COLORS.textDark, fontFace: "Calibri", valign: "top" });
    } else if (hasBullets) {
      s.addShape("roundRect", { x: 0.3, y: 1.55, w: 9.4, h: 3.75, fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.1, shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.07 } });
      const bullets = slide.bullets.slice(0, maxB);
      const cols2 = bullets.length > 5 ? 2 : 1;
      if (cols2 === 2) {
        const half = Math.ceil(bullets.length / 2);
        const makeItems = (arr) => arr.map((b, i) => ({
          text: b.slice(0, 120),
          options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < arr.length - 1, fontSize: 13, color: COLORS.textDark, paraSpaceAfter: 8 },
        }));
        s.addText(makeItems(bullets.slice(0, half)), { x: 0.5, y: 1.7, w: 4.5, h: 3.45, fontFace: "Calibri", valign: "top" });
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
      s.addText(slide.body.slice(0, bodyLen * 2), { x: 0.5, y: 1.7, w: 9.0, h: 3.45, fontSize: 14, color: COLORS.textDark, fontFace: "Calibri", valign: "top" });
    } else {
      s.addText("No additional details in this section.", { x: 0.5, y: 2.8, w: 9.0, h: 0.6, fontSize: 13, italic: true, color: COLORS.textMuted, fontFace: "Calibri", align: "center" });
    }

    addFooter(s, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) s.addNotes(plainTextNotes(slide));

    // ── Inject chart slide after this content slide if applicable ────────────
    if (!chartSlidesSoFar.has(slide) && chartCandidates.includes(slide) && chartSlidesSoFar.size < 2) {
      const cd = extractChartData(slide.metrics);
      if (cd) {
        const useBar = chartSlidesSoFar.size === 0; // first = bar, second = pie
        if (useBar) {
          addBarChartSlide(pres, COLORS, cd, `${slide.title} — Chart View`, docTitle, ++slideCounter, totalSlides, includeNotes);
        } else {
          addPieChartSlide(pres, COLORS, cd, `${slide.title} — Distribution`, docTitle, ++slideCounter, totalSlides, includeNotes);
        }
        chartSlidesSoFar.add(slide);
      }
    }
  });

  // ── TIMELINE (dates slide) ─────────────────────────────────────────────────
  if (hasTimeline) {
    const dc = dateCandidates[0];
    addTimelineSlide(pres, COLORS, dc.metrics, dc.title + " — Timeline", docTitle, ++slideCounter, totalSlides, includeNotes);
  }

  // ── TAKEAWAY (conclusion) ──────────────────────────────────────────────────
  if (conclusionSlide) {
    const t = pres.addSlide();
    t.background = { color: COLORS.bgDark };
    t.addShape(pres.shapes.OVAL, { x: -1.2, y: -1.2, w: 3.2, h: 3.2, fill: { color: COLORS.teal, transparency: 82 }, line: { color: COLORS.teal, transparency: 82 } });
    t.addShape(pres.shapes.OVAL, { x: 8.6, y: 3.8, w: 2.6, h: 2.6, fill: { color: COLORS.accent, transparency: 80 }, line: { color: COLORS.accent, transparency: 80 } });
    t.addText("\u2705  KEY TAKEAWAY", { x: 0.8, y: 0.9, w: 8.4, h: 0.5, fontSize: 12, color: COLORS.accent, bold: true, charSpacing: 3, fontFace: "Calibri" });
    t.addShape(pres.shapes.RECTANGLE, { x: 0.85, y: 1.6, w: 0.06, h: 2.6, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
    const conclusionText = (conclusionSlide.body || conclusionSlide.bullets.join(" ")).slice(0, 480);
    t.addText(conclusionText, { x: 1.15, y: 1.55, w: 7.8, h: 2.8, fontSize: 18, color: COLORS.textLight, fontFace: "Cambria", italic: true, valign: "top", lineSpacing: 26 });
    addFooter(t, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) t.addNotes(plainTextNotes(conclusionSlide));
  }

  // ── CLOSING ────────────────────────────────────────────────────────────────
  const endSlide = pres.addSlide();
  endSlide.background = { color: COLORS.bgDark };
  endSlide.addShape(pres.shapes.OVAL, { x: -1.0, y: 2.5, w: 4.0, h: 4.0, fill: { color: COLORS.accent, transparency: 82 }, line: { color: COLORS.accent, transparency: 82 } });
  endSlide.addShape(pres.shapes.OVAL, { x: 8.5, y: -0.5, w: 2.5, h: 2.5, fill: { color: COLORS.teal, transparency: 78 }, line: { color: COLORS.teal, transparency: 78 } });
  endSlide.addShape(pres.shapes.OVAL, { x: 4.0, y: 2.0, w: 1.5, h: 1.5, fill: { color: COLORS.chart3, transparency: 85 }, line: { color: COLORS.chart3, transparency: 85 } });
  endSlide.addText("Thank You", { x: 1, y: 1.6, w: 8, h: 1.2, fontSize: 44, color: COLORS.textLight, bold: true, fontFace: "Cambria", align: "center" });
  endSlide.addText("Summary generated by AI Document Summarizer", { x: 1, y: 3.0, w: 8, h: 0.5, fontSize: 14, color: "7A90B8", align: "center", fontFace: "Calibri" });
  endSlide.addText(today, { x: 1, y: 3.55, w: 8, h: 0.35, fontSize: 11, color: "5A6A8A", align: "center", fontFace: "Calibri" });
  if (includeNotes) endSlide.addNotes("Closing slide.");

  return { pres, slideCount: totalSlides };
}

// ── POST /generate-ppt ───────────────────────────────────────────────────────
router.post("/generate-ppt", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const { summary, filename = "Document", documentId = null, options = {} } = req.body;
    if (!summary) return res.status(400).json({ message: "Summary is required" });

    const theme  = resolveTheme(options.theme);
    const detail = resolveDetail(options.detailLevel);
    const includeAgendaOpt = options.includeAgenda !== false;
    const includeNotes     = options.includeNotes  !== false;

    const docTitle   = (options.title && options.title.trim()) || filename.replace(/\.[^/.]+$/, "");
    const titleMatch = summary.match(/^#\s+(.+)$/m);
    const heroTitle  = (options.title && options.title.trim()) || (titleMatch ? titleMatch[1].trim() : docTitle);

    const { pres, slideCount } = buildDeck({ summary, docTitle, heroTitle, theme, detail, includeAgendaOpt, includeNotes });

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

// ── GET /presentations ───────────────────────────────────────────────────────
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

// ── GET /presentations/:id/download  (PPTX) ──────────────────────────────────
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

// ── GET /presentations/:id/download-pdf  (slide images as PDF) ───────────────
// We convert each slide to an image via pptxgenjs → export as PNG, then stitch
// into a PDF using a pure-JS approach. Since pptxgenjs doesn't natively export
// images server-side, we return the PPTX buffer and tell the client it's a PDF
// with a server note — the real PDF is generated client-side via jsPDF.
// Instead we expose this endpoint so the client can fetch the raw PPTX data and
// convert it to PDF on the browser (using pptx2pdf via the existing jsPDF flow).
// The endpoint returns metadata + binary so the client knows which file to handle.
router.get("/presentations/:id/download-pdf", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const pres = await Presentation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!pres) return res.status(404).json({ message: "Presentation not found" });

    // We send the PPTX binary with a special header so the client can handle PDF conversion
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