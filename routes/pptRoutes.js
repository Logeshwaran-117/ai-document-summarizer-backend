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
  },
  tealSlate: {
    label: "Teal & Slate",
    bgDark: "0F3D3E", bgLight: "F5FAFA", accent: "3FBFAE", teal: "1F7A72",
    textLight: "FFFFFF", textDark: "17302F", textMuted: "4E6E6C",
    cardBg: "FFFFFF", cardAlt: "E6F5F3", border: "D6EAE8",
  },
  charcoalRuby: {
    label: "Charcoal & Ruby",
    bgDark: "231F20", bgLight: "F9F7F7", accent: "C0392B", teal: "8E7B57",
    textLight: "FFFFFF", textDark: "231F20", textMuted: "6B6260",
    cardBg: "FFFFFF", cardAlt: "F3E9E7", border: "E7DEDC",
  },
};

// ── Detail levels: how much content lands on each slide ─────────────────────
const DETAIL_LEVELS = {
  concise: { maxBullets: 4, bodyLen: 260, label: "Concise" },
  standard: { maxBullets: 7, bodyLen: 350, label: "Standard" },
  detailed: { maxBullets: 10, bodyLen: 600, label: "Detailed" },
};

function resolveTheme(key) { return THEMES[key] || THEMES.navyGold; }
function resolveDetail(key) { return DETAIL_LEVELS[key] || DETAIL_LEVELS.standard; }

// ── Icon mapping per section keyword ────────────────────────────────────────
function iconForTitle(title) {
  const t = title.toLowerCase();
  if (t.includes("overview")) return "\u{1F9ED}";
  if (t.includes("metric")) return "\u{1F4CA}";
  if (t.includes("financial")) return "\u{1F4B0}";
  if (t.includes("transaction")) return "\u{1F4B3}";
  if (t.includes("fee") || t.includes("charge")) return "\u{1F9FE}";
  if (t.includes("date") || t.includes("deadline")) return "\u{1F4C5}";
  if (t.includes("alert") || t.includes("note") || t.includes("risk")) return "\u26A0\uFE0F";
  if (t.includes("conclusion")) return "\u2705";
  if (t.includes("important")) return "\u2B50";
  if (t.includes("key point")) return "\u{1F511}";
  if (t.includes("summary")) return "\u{1F4CC}";
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
  s.addText(docTitle, {
    x: 0.3, y: 5.35, w: 6.5, h: 0.25,
    fontSize: 9, color: COLORS.textMuted, fontFace: "Calibri",
  });
  s.addShape("roundRect", {
    x: 8.75, y: 5.28, w: 0.95, h: 0.32,
    fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark },
    rectRadius: 0.16,
  });
  s.addText(`${idx} / ${total}`, {
    x: 8.75, y: 5.28, w: 0.95, h: 0.32,
    fontSize: 9, color: COLORS.textLight, align: "center", valign: "middle", fontFace: "Calibri", bold: true,
  });
}

function addSlideHeader(s, pres, COLORS, title, icon) {
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 1.25,
    fill: { color: COLORS.bgDark }, line: { color: COLORS.bgDark },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 1.25, w: 10, h: 0.04,
    fill: { color: COLORS.accent }, line: { color: COLORS.accent },
  });
  s.addText(icon, { x: 0.4, y: 0.26, w: 0.7, h: 0.7, fontSize: 26, align: "center", valign: "middle" });
  s.addText(title, {
    x: 1.05, y: 0.24, w: 8.4, h: 0.75,
    fontSize: 24, color: COLORS.textLight, bold: true, fontFace: "Cambria", valign: "middle", margin: 0,
  });
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

    s.addShape("roundRect", {
      x, y, w: cardW, h: cardH,
      fill: { color: COLORS.cardBg }, line: { color: COLORS.border }, rectRadius: 0.08,
      shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.06 },
    });
    s.addShape("rect", { x, y, w: 0.06, h: cardH, fill: { color: COLORS.teal }, line: { color: COLORS.teal } });
    s.addText(m.label.toUpperCase(), {
      x: x + 0.2, y: y + 0.12, w: cardW - 0.4, h: 0.3,
      fontSize: 9.5, color: COLORS.textMuted, bold: true, fontFace: "Calibri", charSpacing: 0.5,
    });
    s.addText(m.value.slice(0, 40), {
      x: x + 0.2, y: y + 0.42, w: cardW - 0.4, h: cardH - 0.55,
      fontSize: cardH > 1.1 ? 17 : 14, color: COLORS.textDark, bold: true, fontFace: "Cambria", valign: "top", autoFit: true,
    });
  });
}

// ── Core deck builder — returns { pres, slideCount } ─────────────────────────
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
  const showAgenda = includeAgendaOpt && contentSlides.length > 2;
  const totalSlides = 1 + (showAgenda ? 1 : 0) + contentSlides.length + (conclusionSlide ? 1 : 0) + 1;
  let slideCounter = 1;

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = docTitle;

  // ── COVER ──
  const coverSlide = pres.addSlide();
  coverSlide.background = { color: COLORS.bgDark };
  coverSlide.addShape(pres.shapes.OVAL, { x: 7.8, y: -1.0, w: 3.5, h: 3.5, fill: { color: COLORS.accent, transparency: 75 }, line: { color: COLORS.accent, transparency: 75 } });
  coverSlide.addShape(pres.shapes.OVAL, { x: -0.5, y: 4.0, w: 2.0, h: 2.0, fill: { color: COLORS.teal, transparency: 80 }, line: { color: COLORS.teal, transparency: 80 } });
  coverSlide.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 2.8, w: 1.2, h: 0.06, fill: { color: COLORS.accent }, line: { color: COLORS.accent } });
  coverSlide.addText("AI SUMMARY", { x: 0.6, y: 1.4, w: 8.8, h: 0.5, fontSize: 11, color: COLORS.accent, bold: true, charSpacing: 4, fontFace: "Calibri" });
  coverSlide.addText(heroTitle, { x: 0.6, y: 1.85, w: 8.8, h: 1.1, fontSize: 34, color: COLORS.textLight, bold: true, fontFace: "Cambria" });
  coverSlide.addText("Generated Document Summary", { x: 0.6, y: 3.0, w: 8.8, h: 0.5, fontSize: 14, color: "A0B0D0", fontFace: "Calibri" });
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  coverSlide.addText(`${today}  \u2022  ${contentSlides.length + (conclusionSlide ? 1 : 0)} sections`, { x: 0.6, y: 4.8, w: 8.8, h: 0.4, fontSize: 11, color: "6A80A8", fontFace: "Calibri" });
  if (includeNotes) coverSlide.addNotes(`Cover slide for ${docTitle}. Generated ${today}.`);

  // ── AGENDA ──
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
      agenda.addText(sec.icon, { x: x + 0.15, y, w: 0.6, h: cardH, fontSize: 18, valign: "middle", align: "center" });
      agenda.addText(`${i + 1}.  ${sec.title}`, { x: x + 0.7, y, w: cardW - 0.85, h: cardH, fontSize: 13, color: COLORS.textDark, bold: true, fontFace: "Calibri", valign: "middle" });
    });
    addFooter(agenda, COLORS, docTitle, ++slideCounter, totalSlides);
    if (includeNotes) agenda.addNotes(`Agenda: ${all.map(sl => sl.title).join(", ")}`);
  }

  // ── CONTENT ──
  contentSlides.forEach((slide) => {
    const s = pres.addSlide();
    s.background = { color: COLORS.bgLight };
    addSlideHeader(s, pres, COLORS, slide.title, slide.icon);

    const hasMetrics = slide.metrics.length >= 3;
    const hasBullets = slide.bullets.length > 0;
    const hasBody = slide.body && slide.body.length > 20;
    const maxB = detail.maxBullets;
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
      const cols = bullets.length > 5 ? 2 : 1;
      if (cols === 2) {
        const half = Math.ceil(bullets.length / 2);
        const leftBullets = bullets.slice(0, half);
        const rightBullets = bullets.slice(half);
        const makeItems = (arr) => arr.map((b, i) => ({
          text: b.slice(0, 120),
          options: { bullet: { code: "2022", color: COLORS.teal }, breakLine: i < arr.length - 1, fontSize: 13, color: COLORS.textDark, paraSpaceAfter: 8 },
        }));
        s.addText(makeItems(leftBullets), { x: 0.5, y: 1.7, w: 4.5, h: 3.45, fontFace: "Calibri", valign: "top" });
        s.addText(makeItems(rightBullets), { x: 5.1, y: 1.7, w: 4.5, h: 3.45, fontFace: "Calibri", valign: "top" });
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
  });

  // ── TAKEAWAY ──
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

  // ── CLOSING ──
  const endSlide = pres.addSlide();
  endSlide.background = { color: COLORS.bgDark };
  endSlide.addShape(pres.shapes.OVAL, { x: -1.0, y: 2.5, w: 4.0, h: 4.0, fill: { color: COLORS.accent, transparency: 82 }, line: { color: COLORS.accent, transparency: 82 } });
  endSlide.addShape(pres.shapes.OVAL, { x: 8.5, y: -0.5, w: 2.5, h: 2.5, fill: { color: COLORS.teal, transparency: 78 }, line: { color: COLORS.teal, transparency: 78 } });
  endSlide.addText("Thank You", { x: 1, y: 1.6, w: 8, h: 1.2, fontSize: 44, color: COLORS.textLight, bold: true, fontFace: "Cambria", align: "center" });
  endSlide.addText("Summary generated by AI Document Summarizer", { x: 1, y: 3.0, w: 8, h: 0.5, fontSize: 14, color: "7A90B8", align: "center", fontFace: "Calibri" });
  if (includeNotes) endSlide.addNotes("Closing slide.");

  return { pres, slideCount: totalSlides };
}

// ── POST /generate-ppt ───────────────────────────────────────────────────────
// Body: { summary, filename, documentId?, options?: { title, theme, detailLevel, includeAgenda, includeNotes } }
router.post("/generate-ppt", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const { summary, filename = "Document", documentId = null, options = {} } = req.body;
    if (!summary) return res.status(400).json({ message: "Summary is required" });

    const theme = resolveTheme(options.theme);
    const detail = resolveDetail(options.detailLevel);
    const includeAgendaOpt = options.includeAgenda !== false;
    const includeNotes = options.includeNotes !== false;

    const docTitle = (options.title && options.title.trim()) || filename.replace(/\.[^/.]+$/, "");
    const titleLineMatch = summary.match(/^#\s+(.+)$/m);
    const heroTitle = (options.title && options.title.trim()) || (titleLineMatch ? titleLineMatch[1].trim() : docTitle);

    const { pres, slideCount } = buildDeck({
      summary, docTitle, heroTitle, theme, detail, includeAgendaOpt, includeNotes,
    });

    const tmpFile = path.join(os.tmpdir(), `summary-${Date.now()}.pptx`);
    await pres.writeFile({ fileName: tmpFile });
    const buffer = fs.readFileSync(tmpFile);
    fs.unlink(tmpFile, () => {});

    // Persist so it shows up in the Presentations tab
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

// ── GET /presentations — list (paginated), optionally filtered by documentId ─
const PRES_EXT_MAP = {
  pdf: /\.pdf$/i,
  docx: /\.docx$/i,
  txt: /\.txt$/i,
  xlsx: /\.(xlsx|xls|csv)$/i,
  jpg: /\.(jpg|jpeg)$/i,
  png: /\.png$/i,
};

const PRES_SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
};

router.get("/presentations", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const search = (req.query.search || "").trim();
    const fileType = (req.query.fileType || "all").toLowerCase();
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const sortKey = PRES_SORT_MAP[req.query.sort] ? req.query.sort : "newest";

    const filter = { userId: req.user._id };
    if (req.query.documentId) filter.documentId = req.query.documentId;

    if (search) {
      filter.$or = [
        { filename: { $regex: search, $options: "i" } },
        { sourceFilename: { $regex: search, $options: "i" } },
      ];
    }

    if (fileType !== "all" && PRES_EXT_MAP[fileType]) {
      filter.sourceFilename = { $regex: PRES_EXT_MAP[fileType] };
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const total = await Presentation.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);

    const presentations = await Presentation.find(filter)
      .select("-data") // never send the binary in a list response
      .sort(PRES_SORT_MAP[sortKey])
      .skip((safePage - 1) * limit)
      .limit(limit);

    res.json({ presentations, total, page: safePage, totalPages, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch presentations" });
  }
});

// ── GET /presentations/:id/download — re-download a saved deck ──────────────
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

// ── DELETE /presentations/:id ────────────────────────────────────────────────
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
