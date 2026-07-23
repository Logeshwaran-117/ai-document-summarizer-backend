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

function getLayoutHint(slideType) {
  switch (slideType) {
    case "cover":
      return "Large centered title, subtitle below, decorative horizontal line using primary color";
    case "kpi":
      return "3 metric cards side by side at y=200, each 340px wide with label above value";
    case "twoColumn":
      return "Left column x=60 w=560, right column x=660 w=560, divider line at x=640";
    case "chart":
      return "Draw actual horizontal bars using rect elements. Place category labels cleanly at x=60 (w=180), start bars at x=260, place metric value text immediately to the right of each bar (x = bar_x + bar_width + 15). Place legends cleanly at top-right (x=850, y=160). Do NOT overlap text or stack labels over bars.";
    case "swot":
      return "4 quadrants: top-left Strengths (green), top-right Weaknesses (red), bottom-left Opportunities (blue), bottom-right Threats (orange)";
    case "executiveSummary":
      return "Summary header card at y=140 h=120, 2 wide key takeaway boxes below at y=280 and y=480 w=1160";
    case "process":
      return "4 horizontal step cards side-by-side (x=60, 360, 660, 960; width=260) with arrow connectors between them";
    case "scorecard":
      return "Grid layout of 4 scorecard containers (2x2) with category title, status color pill/badge, and metric text inside";
    case "recommendations":
      return "3 full-width horizontal recommendation rows stacked vertically at y=160, y=320, y=480 (height=130, width=1160) with numbered callouts";
    case "closing":
      return "Large centered closing title, subtitle below, contact/next steps details";
    default:
      return "Balanced container layout with 40px margin, clear text hierarchy, and structured card backgrounds";
  }
}

// ── Step B: Per-Slide SVG Generation ─────────────────────────────────────────
async function generateSlideSVG(slideSpec, designSpec, documentText, slideIndex, totalSlides) {
  const palette = designSpec.colorPalette || THEME_PALETTES.Professional;
  const slideNumber = slideIndex + 1;
  const slideType = slideSpec.slideType || "executiveSummary";
  const slideTitle = slideSpec.title || `Slide ${slideNumber}`;
  const slideContent = `${slideSpec.contentFocus || ""}\nContext from document:\n${documentText.slice(0, 3000)}`;

  const prompt = `You are an expert SVG slide designer. Generate a SINGLE complete, valid SVG for slide ${slideNumber} of ${totalSlides}.

SLIDE SPEC:
- Type: ${slideType}
- Title: ${slideTitle}
- Content: ${slideContent}
- Theme colors: background=${palette.background}, primary=${palette.primary}, text=${palette.text}, card=${palette.cardBg}

CRITICAL REQUIREMENTS — follow ALL of these or the output is unusable:
1. Output ONLY the SVG tag. No markdown, no code fences, no explanation.
2. Start with <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"> — width and height are MANDATORY.
3. CLOSE every tag you open. <text> must have </text>. <g> must have </g>. No exceptions.
4. Keep total SVG under 8000 characters. Do NOT truncate mid-tag.
5. Use only these safe SVG elements: rect, text, line, circle, path, g, defs, linearGradient, stop. Never use foreignObject, image with external URL, or script.
6. Every <text> element must have x, y, font-size, and fill attributes explicitly set.
7. Use tspan for multi-line text — never put raw newlines inside a <text> element.
8. All colors must be valid hex (#RRGGBB) or rgb() — never "transparent" or named colors except "white" and "black".

SLIDE DESIGN RULES:
- Fill the full 1280×720 canvas. Background rect must be first: <rect width="1280" height="720" fill="${palette.background}"/>
- Title at y=80, font-size=36, fill="${palette.primary}", font-weight="bold"
- Body text minimum font-size=14. Never place text beyond x=1220 or y=680.
- Metric cards: use rect with fill="${palette.cardBg}", rx="8", and place value text centered inside.
- Leave at least 40px margin on all 4 edges.
- For ${slideType} slides specifically:
  ${getLayoutHint(slideType)}

Generate the complete SVG now. Remember: close ALL tags.`;

  const raw = await callWithRotation(
    () => [{ text: prompt }], 8192, "gemini-3.5-flash", null, "summarize", null
  );

  let svgContent = extractValidSvg(raw, palette);
  if (!svgContent) {
    console.warn(`⚠️ Raw AI output for slide ${slideIndex + 1}: ${String(raw).slice(0, 150)}`);
    throw new Error(`Slide ${slideIndex + 1}: AI did not return valid SVG`);
  }

  // 1. Programmatic auto-repair first
  svgContent = repairSvgXmlProgrammatically(svgContent);
  svgContent = normalizeSvgAttributes(svgContent, palette);

  // 2. Validate XML well-formedness and check for truncation
  let validation = validateSvgXml(svgContent);
  if (!validation.valid) {
    console.warn(`⚠️ [SVG Pipeline] Slide ${slideIndex + 1} XML validation failed (${validation.error}). Attempting targeted AI repair retry...`);
    try {
      const repaired = await repairSvgXmlWithAi(svgContent, validation.error);
      if (repaired) {
        let sanitizedRepaired = repairSvgXmlProgrammatically(repaired);
        sanitizedRepaired = normalizeSvgAttributes(sanitizedRepaired, palette);
        const reCheck = validateSvgXml(sanitizedRepaired);
        if (reCheck.valid) {
          console.log(`✅ [SVG Pipeline] Slide ${slideIndex + 1} SVG XML repaired successfully by AI.`);
          svgContent = sanitizedRepaired;
        } else {
          console.warn(`⚠️ [SVG Pipeline] Repaired SVG still has validation warning: ${reCheck.error}`);
        }
      }
    } catch (repairErr) {
      console.warn(`⚠️ [SVG Pipeline] Targeted AI repair retry failed: ${repairErr.message}`);
    }
  }

  // 3. Final validation check: if still invalid XML after repair, throw to trigger fallback SVG
  const finalCheck = validateSvgXml(svgContent);
  if (!finalCheck.valid) {
    throw new Error(`Slide ${slideIndex + 1} SVG validation failed: ${finalCheck.error}`);
  }

  return svgContent;
}

/**
 * Programmatically repairs common XML tag truncation and syntax issues in SVG markup.
 */
function repairSvgXmlProgrammatically(svgStr) {
  if (!svgStr || typeof svgStr !== "string") return "";
  let result = svgStr.trim();

  // 1. Ensure opening <svg> tag exists
  if (!/<svg/i.test(result)) {
    result = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">\n` + result;
  }

  // 2. Escape unescaped ampersands
  result = sanitizeXmlEntities(result);

  // 3. Remove truncated trailing open tag if present at the end (e.g., `<text x="100" y=`)
  result = result.replace(/<[a-zA-Z0-9_-]+\s*[^>]*$/, "");

  // 4. Balance unclosed <tspan> tags
  const openTspan = (result.match(/<tspan\b/gi) || []).length;
  const closeTspan = (result.match(/<\/tspan>/gi) || []).length;
  for (let i = 0; i < openTspan - closeTspan; i++) {
    result += "</tspan>";
  }

  // 5. Balance unclosed <text> tags
  const openText = (result.match(/<text\b/gi) || []).length;
  const closeText = (result.match(/<\/text>/gi) || []).length;
  for (let i = 0; i < openText - closeText; i++) {
    result += "</text>";
  }

  // 6. Balance unclosed <g> tags
  const openG = (result.match(/<g\b/gi) || []).length;
  const closeG = (result.match(/<\/g>/gi) || []).length;
  for (let i = 0; i < openG - closeG; i++) {
    result += "</g>";
  }

  // 7. Ensure closing </svg> tag
  if (!/<\/svg>\s*$/i.test(result)) {
    result = result.replace(/<\/svg>[\s\S]*/i, "") + "\n</svg>";
  }

  return result;
}

/**
 * Escapes standalone '&' characters without double-escaping valid XML entities.
 */
function sanitizeXmlEntities(svgStr) {
  if (!svgStr || typeof svgStr !== "string") return "";
  // Entity-aware regex: replaces '&' only when NOT followed by valid XML entity patterns
  return svgStr.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)/g, "&amp;");
}

/**
 * Ensures standard SVG attributes (xmlns, viewBox, width, height) are present on root <svg> tag.
 */
function normalizeSvgAttributes(svgStr, palette = null) {
  if (!svgStr || typeof svgStr !== "string") return "";
  let result = svgStr.trim();

  // Ensure opening <svg> tag exists
  if (!/<svg/i.test(result)) return result;

  const bg = palette && palette.background ? palette.background : "#0F1B38";
  
  result = result.replace(/<svg([^>]*)>/i, (match, attrs) => {
    let newAttrs = attrs;
    if (!/xmlns\s*=/i.test(newAttrs)) {
      newAttrs += ' xmlns="http://www.w3.org/2000/svg"';
    }
    if (!/viewBox\s*=/i.test(newAttrs)) {
      newAttrs += ' viewBox="0 0 1280 720"';
    }
    if (!/width\s*=/i.test(newAttrs)) {
      newAttrs += ' width="1280"';
    }
    if (!/height\s*=/i.test(newAttrs)) {
      newAttrs += ' height="720"';
    }
    return `<svg${newAttrs}>`;
  });

  return result;
}

/**
 * Performs XML syntax validation and checks for truncation.
 */
function validateSvgXml(svgStr) {
  if (!svgStr || typeof svgStr !== "string") {
    return { valid: false, error: "Empty SVG content" };
  }
  const trimmed = svgStr.trim();
  if (!trimmed.startsWith("<svg") && !/<svg/i.test(trimmed)) {
    return { valid: false, error: "Missing opening <svg> root tag" };
  }
  if (!trimmed.endsWith("</svg>") && !/<\/svg>/i.test(trimmed)) {
    return { valid: false, error: "Truncated SVG: Missing closing </svg> tag" };
  }

  // Tag balance checks for critical container elements
  const openText = (trimmed.match(/<text\b/gi) || []).length;
  const closeText = (trimmed.match(/<\/text>/gi) || []).length;
  if (openText > closeText) {
    return { valid: false, error: `Truncated <text> tags (${openText} opened vs ${closeText} closed)` };
  }

  const openG = (trimmed.match(/<g\b/gi) || []).length;
  const closeG = (trimmed.match(/<\/g>/gi) || []).length;
  if (openG > closeG) {
    return { valid: false, error: `Truncated <g> tags (${openG} opened vs ${closeG} closed)` };
  }

  return { valid: true };
}

/**
 * Prompts Gemini to repair XML syntax errors in a broken SVG without redesigning the slide layout.
 */
async function repairSvgXmlWithAi(brokenSvg, errorMsg) {
  const prompt = `The following SVG markup contains XML validation errors: "${errorMsg}".

BROKEN SVG MARKUP:
\`\`\`xml
${brokenSvg.slice(0, 7000)}
\`\`\`

REPAIR INSTRUCTIONS:
1. Return ONLY the repaired raw SVG string starting with <svg> and ending with </svg>.
2. Do NOT redesign the slide, change layout, or alter existing colors.
3. Fix all unescaped '&' characters to &amp;, close any unclosed tags (<text>, <g>, </svg>), and balance XML syntax.
4. Output MUST be ONLY valid raw SVG.

Repaired SVG:`;

  const raw = await callWithRotation(
    () => [{ text: prompt }], 8192, "gemini-3.5-flash", null, "summarize", null
  );

  return extractValidSvg(raw);
}

function cleanSvgString(svgStr) {
  if (!svgStr) return "";
  return svgStr
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (
        t.startsWith("->") ||
        t.startsWith("* ") ||
        t.startsWith("•") ||
        t.includes("Good catch") ||
        t.includes("Wait, I missed") ||
        t.includes("Value: `x=") ||
        t.includes("Label: `x=")
      ) {
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

  const metrics = (slideSpec.keyMetrics && slideSpec.keyMetrics.length > 0)
    ? slideSpec.keyMetrics
    : ["Strategic Metric 1", "Performance Metric 2"];

  let cardsHtml = "";
  if (metrics.length >= 1) {
    const count = Math.min(3, metrics.length);
    const cardWidth = Math.floor((1160 - (count - 1) * 20) / count);
    cardsHtml = metrics.slice(0, count).map((m, i) => {
      const cx = 60 + i * (cardWidth + 20);
      return `<g>
        <rect x="${cx}" y="180" width="${cardWidth}" height="140" fill="${c.cardBg}" stroke="${c.cardBorder}" rx="8" ry="8"/>
        <text x="${cx + 20}" y="220" font-family="Calibri" font-size="14" fill="${c.muted}">INDICATOR ${i + 1}</text>
        <text x="${cx + 20}" y="265" font-family="Cambria" font-size="22" fill="${c.primary}" font-weight="bold">${escapeXml(m)}</text>
      </g>`;
    }).join("\n");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <rect width="1280" height="720" fill="${c.background}"/>
  <rect x="0" y="0" width="1280" height="120" fill="${c.background}"/>
  <rect x="0" y="120" width="1280" height="4" fill="${c.primary}"/>
  <text x="60" y="70" font-family="Cambria" font-size="32" fill="${c.text}" font-weight="bold">${title}</text>
  <text x="60" y="102" font-family="Calibri" font-size="15" fill="${c.primary}" font-weight="bold">${focus}</text>
  <rect x="60" y="160" width="1160" height="480" fill="${c.cardBg}" stroke="${c.cardBorder}" rx="10" ry="10"/>
  ${cardsHtml}
  <g>
    <rect x="100" y="350" width="1080" height="240" fill="${c.background}" rx="8" ry="8"/>
    <text x="130" y="400" font-family="Cambria" font-size="20" fill="${c.text}" font-weight="bold">Executive Summary &amp; Key Analysis Findings</text>
    <text x="130" y="440" font-family="Calibri" font-size="16" fill="${c.muted}">• Strategic overview compiled from primary financial statement data and account records.</text>
    <text x="130" y="475" font-family="Calibri" font-size="16" fill="${c.muted}">• Key operational risk indicators, cash flow velocity, and account liquidity verified.</text>
    <text x="130" y="510" font-family="Calibri" font-size="16" fill="${c.muted}">• Actionable recommendations prioritized based on debt structure and compliance rules.</text>
  </g>
  <text x="1220" y="690" font-family="Calibri" font-size="14" fill="${c.muted}" text-anchor="end">${index + 1} / ${total}</text>
</svg>`;
}

function escapeXml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main Orchestrator Function ───────────────────────────────────────────────
async function renderSvgToPngCanvas(svgContent, pngPath, svgPath = null) {
  // Ensure explicit dimensions
  let svgStr = normalizeSvgAttributes(svgContent);

  try {
    const { createCanvas, loadImage } = require("canvas");
    const canvas = createCanvas(1280, 720);
    const ctx = canvas.getContext("2d");
    
    let img;
    // Prefer loading directly from local filesystem if svgPath exists
    if (svgPath && fs.existsSync(svgPath)) {
      try {
        img = await loadImage(path.resolve(svgPath));
      } catch (fileErr) {
        const base64Svg = Buffer.from(svgStr, "utf8").toString("base64");
        const dataUri = `data:image/svg+xml;charset=utf-8;base64,${base64Svg}`;
        img = await loadImage(dataUri);
      }
    } else {
      const base64Svg = Buffer.from(svgStr, "utf8").toString("base64");
      const dataUri = `data:image/svg+xml;charset=utf-8;base64,${base64Svg}`;
      img = await loadImage(dataUri);
    }

    ctx.drawImage(img, 0, 0, 1280, 720);
    const pngBuffer = canvas.toBuffer("image/png");

    // Quality check threshold: A valid 1280x720 rendered slide PNG must be >= 15 KB
    const MIN_PNG_SIZE = 15 * 1024;
    if (pngBuffer.length < MIN_PNG_SIZE) {
      console.warn(`⚠️ [SVG Pipeline] node-canvas PNG size too small (${pngBuffer.length} bytes < 15KB threshold), skipping PNG background.`);
      if (fs.existsSync(pngPath)) {
        try { fs.unlinkSync(pngPath); } catch (_) {}
      }
      return false;
    }

    fs.writeFileSync(pngPath, pngBuffer);
    return true;
  } catch (err) {
    console.warn(`⚠️ [SVG Pipeline] node-canvas PNG render warning: ${err.message}`);
    if (fs.existsSync(pngPath)) {
      try { fs.unlinkSync(pngPath); } catch (_) {}
    }
    return false;
  }
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

      console.log(`  📊 Slide ${i + 1} SVG size: ${svgContent.length} chars`);

      const filename = `slide_${String(i + 1).padStart(3, "0")}.svg`;
      const svgPath = path.join(svgDir, filename);
      fs.writeFileSync(svgPath, svgContent, "utf8");

      // Pre-render high-res PNG for CairoSVG-less Python environments (e.g. Windows)
      const pngPath = svgPath.replace(/\.svg$/i, ".png");
      const rendered = await renderSvgToPngCanvas(svgContent, pngPath, svgPath);
      if (rendered) {
        const stats = fs.statSync(pngPath);
        console.log(`  🖼️ Slide ${i + 1} PNG pre-rendered successfully (${Math.round(stats.size / 1024)} KB)`);
      } else {
        console.log(`  ⚠️ Slide ${i + 1} PNG pre-render skipped or failed, falling through to Python vector parsing`);
      }
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