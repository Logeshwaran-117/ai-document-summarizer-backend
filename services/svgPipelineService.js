/**
 * svgPipelineService.js — Premium SVG-to-PPTX Presentation Generator
 * Converts document text into structured slide SVGs and compiles them into editable PPTX.
 */

const { callWithRotation } = require("./geminiService");
const ResponseValidator = require("./ai/ResponseValidator");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Theme map helper ─────────────────────────────────────────────────────────
const THEME_PALETTES = {
  Professional: { background: "#0F1B38", primary: "#F5A623", secondary: "#008080", text: "#FFFFFF", textDark: "#0F1B38", cardBg: "#1A2B50", cardBorder: "#2A3B60", muted: "#8099C0" },
  Modern:       { background: "#0D1B2A", primary: "#00B4D8", secondary: "#0077B6", text: "#FFFFFF", textDark: "#0D1B2A", cardBg: "#1B2A4A", cardBorder: "#2B3A5A", muted: "#8099C0" },
  Minimal:      { background: "#0F3D3E", primary: "#3FBFAE", secondary: "#1F7A72", text: "#FFFFFF", textDark: "#17302F", cardBg: "#1A4D4E", cardBorder: "#2A5D5E", muted: "#6E8E8C" },
  Dark:         { background: "#0F0F0F", primary: "#C0392B", secondary: "#E67E22", text: "#FFFFFF", textDark: "#0F0F0F", cardBg: "#1F1F1F", cardBorder: "#2F2F2F", muted: "#808080" },
  Corporate:    { background: "#1A1A2E", primary: "#7C3AED", secondary: "#06B6D4", text: "#FFFFFF", textDark: "#1A1A2E", cardBg: "#2A2A4E", cardBorder: "#3A3A5E", muted: "#8A80B0" },
};

function generateFallbackDesignSpec(documentText, wizardOptions = {}) {
  const slideCount = Math.max(3, Math.min(20, parseInt(wizardOptions.slideCount) || 10));
  const themeName = wizardOptions.theme && THEME_PALETTES[wizardOptions.theme] ? wizardOptions.theme : "Professional";
  const palette = THEME_PALETTES[themeName];

  const lines = (documentText || "").split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 10);
  const title = wizardOptions.title || (lines[0] ? lines[0].slice(0, 60) : "Executive Presentation");

  const slideTypes = ["cover", "executiveSummary", "kpi", "twoColumn", "process", "scorecard", "chart", "swot", "recommendations", "closing"];
  const slides = [];

  for (let i = 0; i < slideCount; i++) {
    const sType = i === 0 ? "cover" : i === slideCount - 1 ? "closing" : slideTypes[i % slideTypes.length];
    const sampleSnippet = lines[(i + 1) % lines.length] || `Section ${i + 1} Strategic Findings`;
    slides.push({
      slideNumber: i + 1,
      slideType: sType,
      title: sType === "cover" ? title : (sampleSnippet.slice(0, 45) || `Slide ${i + 1}`),
      contentFocus: sampleSnippet.slice(0, 90),
      visualLayoutPattern: sType === "kpi" ? "3-card metric grid" : "2-column container layout",
      keyMetrics: [`Metric ${i + 1}`, `Data Point ${i * 15 + 10}`],
    });
  }

  return {
    presentationTitle: title,
    slideCount,
    colorPalette: palette,
    fonts: { heading: "Cambria", body: "Calibri" },
    slideWidth: 1280,
    slideHeight: 720,
    slides,
  };
}

// ── Step A: Build Design Specification ───────────────────────────────────────
async function buildDesignSpec(documentText, wizardOptions = {}) {
  const prompt = `You are an executive presentation designer. Analyze this document and generate a JSON design specification.

DOCUMENT SAMPLE:
"""
${(documentText || "").slice(0, 8000)}
"""

TARGET SLIDE COUNT: ${wizardOptions.slideCount || 10}
PREFERRED THEME: ${wizardOptions.theme || "Professional"}

Return ONLY a valid JSON object matching this schema:
{
  "presentationTitle": "<Concise presentation title max 60 chars>",
  "slideCount": ${wizardOptions.slideCount || 10},
  "colorPalette": {
    "background": "#0F1B38",
    "primary": "#F5A623",
    "secondary": "#008080",
    "text": "#FFFFFF",
    "textDark": "#0F1B38",
    "cardBg": "#1A2B50",
    "cardBorder": "#2A3B60",
    "muted": "#8099C0"
  },
  "fonts": {
    "heading": "Cambria",
    "body": "Calibri"
  },
  "slideWidth": 1280,
  "slideHeight": 720,
  "slides": [
    {
      "slideNumber": 1,
      "slideType": "cover|executiveSummary|kpi|twoColumn|process|scorecard|recommendations|chart|swot|closing",
      "title": "<Slide title>",
      "contentFocus": "<Core message/subtitle>",
      "visualLayoutPattern": "<3-card metric grid | 2-column before/after | dark recommendation cards | step workflow>",
      "keyMetrics": ["<Metric 1>", "<Metric 2>"]
    }
  ]
}`;

  let parsed = null;
  try {
    const raw = await callWithRotation(
      () => [{ text: prompt }], 8192, "gemini-3.5-flash", null, "summarize", "application/json"
    );
    parsed = ResponseValidator.parseAndValidate(raw);
  } catch (err) {
    console.warn(`⚠️ [buildDesignSpec] AI design spec generation failed or returned invalid JSON: ${err.message}`);
  }

  if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    console.log("ℹ️ [buildDesignSpec] Utilizing structured fallback design spec.");
    parsed = generateFallbackDesignSpec(documentText, wizardOptions);
  }

  if (wizardOptions.theme && THEME_PALETTES[wizardOptions.theme]) {
    parsed.colorPalette = THEME_PALETTES[wizardOptions.theme];
  }
  return parsed;
}

// ── Step B: Per-Slide SVG Generation ─────────────────────────────────────────
async function generateSlideSVG(slideSpec, designSpec, documentText, slideIndex, totalSlides) {
  const c = designSpec.colorPalette;
  const fonts = designSpec.fonts || { heading: "Cambria", body: "Calibri" };
  const isDataSlide = ["chart", "kpi", "table"].includes(slideSpec.slideType);

  const nativeMarkerInstructions = isDataSlide ? `
NATIVE CHART & TABLE MARKERS (CRITICAL for chart/table/kpi slides):
Instead of drawing bars or tables as SVG rects only, embed a marker <g> with metadata so PowerPoint renders native editable elements:

For CHART slides use:
<g data-pptx-replace-with="chart" id="chart-${slideIndex}">
  <!-- Visual fallback SVG bars (shown in preview, replaced in native PPTX) -->
  <rect x="100" y="200" width="80" height="150" fill="${c.primary}"/>
  <rect x="220" y="120" width="80" height="230" fill="${c.secondary}"/>
  <!-- JSON metadata for native chart -->
  <metadata type="application/json">{
    "chartType": "bar",
    "title": "${slideSpec.title || 'Chart Title'}",
    "x": 60, "y": 150, "width": 700, "height": 400,
    "series": [
      {
        "name": "Series 1",
        "labels": ["Category A", "Category B", "Category C"],
        "values": [42, 78, 35]
      }
    ],
    "colors": ["${c.primary}", "${c.secondary}"],
    "showLegend": true,
    "showValues": true
  }</metadata>
</g>

For TABLE slides use:
<g data-pptx-replace-with="table" id="table-${slideIndex}">
  <!-- Visual fallback -->
  <rect x="60" y="150" width="900" height="400" fill="${c.cardBg}" rx="8"/>
  <metadata type="application/json">{
    "x": 60, "y": 150, "width": 900, "height": 400,
    "headers": ["Metric / Column 1", "Value 1", "Value 2"],
    "rows": [
      ["Row 1 Data", "100", "200"],
      ["Row 2 Data", "300", "400"]
    ],
    "headerFill": "${c.primary}",
    "headerTextColor": "${c.textDark}",
    "rowFills": ["${c.cardBg}", "${c.background}"],
    "fontSize": 14
  }</metadata>
</g>

IMPORTANT: Extract and populate REAL numbers from the document. Never invent placeholder numbers.
` : "";

  const prompt = `You are an expert vector layout designer generating slide ${slideIndex + 1} of ${totalSlides} in SVG format.

CANVAS BOUNDS & SPATIAL MATH:
- Canvas: 1280x720px (16:9 aspect ratio)
- Header Bar: y:0 to y:120px with background ${c.background} and bottom accent line
- Content Area: x:60px to x:1220px, y:140px to y:640px (Outer padding: 60px, Gap between cards: 20px)
- Footer: y:660px to y:700px

DESIGN SYSTEM TOKENS:
- Canvas Background: ${c.background}
- Primary Accent (Gold/Highlight): ${c.primary}
- Secondary Accent (Teal): ${c.secondary}
- Text Light: ${c.text}
- Card Background: ${c.cardBg}
- Card Border: ${c.cardBorder}
- Muted Text: ${c.muted}
- Heading Font: ${fonts.heading}
- Body Font: ${fonts.body}

SLIDE SPECIFICATION:
- Slide Number: ${slideIndex + 1} / ${totalSlides}
- Type: ${slideSpec.slideType}
- Title: ${slideSpec.title}
- Subtitle/Focus: ${slideSpec.contentFocus}
- Layout Pattern: ${slideSpec.visualLayoutPattern}

DOCUMENT FACTS (Use ONLY real data from here, never invent placeholder numbers):
"""
${documentText.slice(0, 6000)}
"""

${nativeMarkerInstructions}

RULES (CRITICAL):
1. Output MUST BE ONLY THE RAW SVG CODE starting with <svg> and ending with </svg>.
2. Absolutely NO conversational text, chain-of-thought, self-corrections (e.g. "Wait, I missed..."), or explanations.
3. Every <text> element MUST explicitly declare x, y, font-family, font-size, fill, and font-weight.
4. Typography Scale: Title font-size 32px (bold), Subtitle font-size 15px, Card Headings 18px (bold), Body text font-size 13px, Metric values 28-34px (bold).
5. Surround content elements in rounded rectangular containers (<rect rx="10" ry="10" fill="${c.cardBg}" stroke="${c.cardBorder}">).
6. Slide footer must render page number "${slideIndex + 1} / ${totalSlides}" on the right.
7. NO foreignObject tags. Use standard SVG tags (<rect>, <circle>, <path>, <text>, <line>, <g>).
8. ${isDataSlide ? "Use native marker <g> blocks for charts/tables as shown above with fallback shapes." : "Use standard SVG elements."}

Generate the raw SVG for slide ${slideIndex + 1} now:`;

  const raw = await callWithRotation(
    () => [{ text: prompt }], 8192, "gemini-3.5-flash", null, "summarize", null
  );

  const svgContent = extractValidSvg(raw, c);
  if (!svgContent) {
    console.warn(`⚠️ Raw AI output for slide ${slideIndex + 1}: ${String(raw).slice(0, 150)}`);
    throw new Error(`Slide ${slideIndex + 1}: AI did not return valid SVG`);
  }
  return svgContent;
}

function cleanSvgString(svgStr) {
  if (!svgStr) return "";
  return svgStr
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (t.startsWith("->") || t.startsWith("*   Let's") || t.includes("Good catch") || t.includes("Wait, I missed")) {
        return false;
      }
      return true;
    })
    .join("\n");
}

function extractValidSvg(raw, palette = null) {
  if (!raw || typeof raw !== "string") return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:xml|svg)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Direct match for <svg ... </svg>
  const fullMatch = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  if (fullMatch) {
    return cleanSvgString(fullMatch[0]);
  }

  // 2. Unclosed <svg ...
  const partialMatch = cleaned.match(/<svg[\s\S]*/i);
  if (partialMatch) {
    let svgStr = partialMatch[0].trim().replace(/```\s*$/, "").trim();
    if (!/<\/svg>/i.test(svgStr)) svgStr += "\n</svg>";
    return cleanSvgString(svgStr);
  }

  // 3. Fallback: If AI returned SVG elements without opening <svg> root tag
  if (/<(rect|g|text|path|circle|line)/i.test(cleaned)) {
    const elemMatch = cleaned.match(/<(?:rect|g|text|path|circle|line)[\s\S]*/i);
    if (elemMatch) {
      let innerContent = cleanSvgString(elemMatch[0]).replace(/<\/svg>/gi, "");
      const bg = palette && palette.background ? palette.background : "#0F1B38";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <rect width="1280" height="720" fill="${bg}"/>
  ${innerContent}
</svg>`;
    }
  }

  return null;
}

function getPythonBinary() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  return process.platform === "win32" ? "python" : "python3";
}

function runPythonScript(scriptPath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonCmd = getPythonBinary();
    execFile(pythonCmd, [scriptPath, ...args], options, (err, stdout, stderr) => {
      if (err && pythonCmd !== "python") {
        execFile("python", [scriptPath, ...args], options, (err2, stdout2, stderr2) => {
          if (err2) return reject(new Error(stderr2 || stderr || err2.message || err.message));
          resolve(stdout2);
        });
      } else if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

// ── Step C: Run Python finalize_svg.py ────────────────────────────────────────
async function finalizeSvgs(svgDir) {
  const scriptPath = path.join(__dirname, "../python/finalize_svg.py");
  if (!fs.existsSync(scriptPath)) {
    console.warn("finalize_svg.py script not found, skipping finalization.");
    return;
  }
  try {
    await runPythonScript(scriptPath, [svgDir]);
  } catch (err) {
    console.warn("finalize_svg warning:", err.message);
  }
}

// ── Step D: Run Python SVG to PPTX converter ────────────────────────────────
async function convertSvgsToPptx(svgDir, outputPath) {
  const fullConverter = path.join(__dirname, "../python/svg_to_pptx.py");
  const simpleConverter = path.join(__dirname, "../python/inject_native_charts.py");

  const scriptPath = fs.existsSync(simpleConverter) ? simpleConverter : fullConverter;
  const args = scriptPath === fullConverter
    ? [svgDir, "--output", outputPath]
    : [svgDir, outputPath];

  try {
    await runPythonScript(scriptPath, args, { timeout: 120000 });
    console.log("✅ PPTX conversion complete");
    return outputPath;
  } catch (err) {
    console.error("PPTX conversion error:", err.message);
    throw new Error("Conversion failed: " + err.message.slice(0, 500));
  }
}

// ── Fallback SVG Generator ───────────────────────────────────────────────────
function generateFallbackSVG(slideSpec, designSpec, index, total) {
  const c = designSpec.colorPalette || THEME_PALETTES.Professional;
  const title = escapeXml(slideSpec.title || `Slide ${index + 1}`);
  const focus = escapeXml(slideSpec.contentFocus || "");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <rect width="1280" height="720" fill="${c.background}"/>
  <rect x="0" y="0" width="1280" height="120" fill="${c.background}"/>
  <rect x="0" y="120" width="1280" height="4" fill="${c.primary}"/>
  <text x="60" y="70" font-family="Cambria" font-size="32" fill="${c.text}" font-weight="bold">${title}</text>
  <text x="60" y="102" font-family="Calibri" font-size="15" fill="${c.primary}" font-weight="bold">${focus}</text>
  <rect x="60" y="160" width="1160" height="480" fill="${c.cardBg}" stroke="${c.cardBorder}" rx="10" ry="10"/>
  <text x="100" y="240" font-family="Calibri" font-size="18" fill="${c.text}">Executive Content &amp; Quantitative Findings</text>
  <text x="1220" y="690" font-family="Calibri" font-size="14" fill="${c.muted}" text-anchor="end">${index + 1} / ${total}</text>
</svg>`;
}

function escapeXml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main Orchestrator Function ───────────────────────────────────────────────
async function generatePresentationViaSVG(documentText, wizardOptions = {}) {
  const workDir = path.join(os.tmpdir(), `ppt-svg-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    console.log("📐 [SVG Pipeline] Building design spec & layout strategy...");
    const designSpec = await buildDesignSpec(documentText, wizardOptions);
    const slides = designSpec.slides || [];
    console.log(`📋 [SVG Pipeline] Layout plan created for ${slides.length} slides.`);

    const svgDir = path.join(workDir, "svg_output");
    fs.mkdirSync(svgDir, { recursive: true });

    for (let i = 0; i < slides.length; i++) {
      console.log(`🎨 [SVG Pipeline] Generating SVG slide ${i + 1}/${slides.length}: ${slides[i].title}`);
      let svgContent;
      try {
        svgContent = await generateSlideSVG(slides[i], designSpec, documentText, i, slides.length);
      } catch (err) {
        console.warn(`⚠️ SVG generation fallback for slide ${i + 1}: ${err.message}`);
        svgContent = generateFallbackSVG(slides[i], designSpec, i, slides.length);
      }

      const filename = `slide_${String(i + 1).padStart(3, "0")}.svg`;
      fs.writeFileSync(path.join(svgDir, filename), svgContent, "utf8");
    }

    console.log("🔧 [SVG Pipeline] Finalizing SVG vectors...");
    await finalizeSvgs(svgDir);

    const outputPptx = path.join(workDir, "presentation.pptx");
    console.log("📦 [SVG Pipeline] Converting SVGs to DrawingML PPTX...");
    await convertSvgsToPptx(svgDir, outputPptx);

    const buffer = fs.readFileSync(outputPptx);
    return {
      buffer,
      slideCount: slides.length,
      title: designSpec.presentationTitle || "Presentation",
    };
  } finally {
    setTimeout(() => fs.rmSync(workDir, { recursive: true, force: true }), 60000);
  }
}

module.exports = {
  generatePresentationViaSVG,
  buildDesignSpec,
  generateSlideSVG,
};
