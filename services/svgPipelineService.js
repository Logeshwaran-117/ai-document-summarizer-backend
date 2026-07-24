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

const AIContentExtractor = require("./presentation/engine/AIContentExtractor");
const LayoutPlanner = require("./presentation/engine/LayoutPlanner");
const SVGBuilder = require("./presentation/engine/SVGBuilder");

const { THEME_PALETTES, resolveThemePalette } = require("./presentation/engine/ThemeRegistry");

// ── Step A: Build Design Specification ───────────────────────────────────────
async function buildDesignSpec(documentText, wizardOptions = {}) {
  console.log("📄 [SVG Pipeline] Extracting structured slide content via AI Content Extractor...");
  const content = await AIContentExtractor.extractPresentationContent(documentText, wizardOptions);

  const palette = resolveThemePalette(wizardOptions.theme || content.theme);
  const themeName = wizardOptions.theme || content.theme || "Professional";

  return {
    presentationTitle: content.presentationTitle || wizardOptions.title || "Executive Presentation",
    slideCount: content.slides ? content.slides.length : (wizardOptions.slideCount || 10),
    colorPalette: palette,
    themeName,
    fonts: { heading: "Cambria", body: "Calibri" },
    slideWidth: 1280,
    slideHeight: 720,
    slides: content.slides || [],
  };
}

// ── Step B: Per-Slide SVG Generation via Programmatic Layout Planner ─────────
async function generateSlideSVG(slideSpec, designSpec, documentText, slideIndex, totalSlides) {
  const themeName = designSpec.themeName || "Professional";

  try {
    // 1. Compute exact element layout tree (coordinates, text wrapping, font scaling, safe margins)
    const layoutTree = LayoutPlanner.computeSlideLayout(slideSpec, themeName, slideIndex, totalSlides);

    // 2. Build 100% syntactically valid SVG string programmatically
    const svgContent = SVGBuilder.buildSvgFromLayout(layoutTree);

    // 3. Simple XML sanity validation
    const validation = validateSvgXml(svgContent);
    if (!validation.valid) {
      console.warn(`⚠️ [SVG Pipeline] Layout SVG validation issue on slide ${slideIndex + 1}: ${validation.error}`);
    }

    return svgContent;
  } catch (err) {
    console.warn(`⚠️ [SVG Pipeline] Layout computation failed for slide ${slideIndex + 1}: ${err.message}. Using rich fallback.`);
    return generateFallbackSVG(slideSpec, designSpec, slideIndex, totalSlides);
  }
}

/**
 * Programmatically repairs common XML tag truncation and syntax issues in SVG markup.
 */
function repairSvgXmlProgrammatically(svgStr) {
  if (!svgStr || typeof svgStr !== "string") return "";
  let result = svgStr.trim();
  result = result.replace(/^```(?:xml|svg)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Ensure opening <svg> tag exists
  if (!/<svg/i.test(result)) {
    result = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">\n` + result;
  }

  // 2. Escape unescaped ampersands
  result = sanitizeXmlEntities(result);

  // 3. Remove truncated trailing open tag if present at the end (e.g., `<text x="100" y=`)
  result = result.replace(/<[a-zA-Z0-9_-]+(?:\s+[^>]*?)?$/, "");

  // 4. Remove any existing closing </svg> tag before balancing internal container tags
  result = result.replace(/<\/svg>\s*$/i, "").trim();

  // 5. Balance unclosed container tags in strict LIFO order (inside out)
  const tagsToBalance = ["tspan", "text", "linearGradient", "defs", "g"];
  for (const tag of tagsToBalance) {
    const openCount = (result.match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
    const closeCount = (result.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    if (openCount > closeCount) {
      result += `</${tag}>`.repeat(openCount - closeCount);
    }
  }

  // 6. Append final closing </svg> tag
  if (!/<\/svg>\s*$/i.test(result)) {
    result += "\n</svg>";
  }

  return result;
}

/**
 * Escapes standalone '&' characters without double-escaping valid XML entities.
 */
function sanitizeXmlEntities(svgStr) {
  if (!svgStr || typeof svgStr !== "string") return "";
  return svgStr.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)/g, "&amp;");
}

/**
 * Ensures standard SVG attributes (xmlns, viewBox, width, height) are present on root <svg> tag.
 */
function normalizeSvgAttributes(svgStr, palette = null) {
  if (!svgStr || typeof svgStr !== "string") return "";
  let result = svgStr.trim();

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

  const openTspan = (trimmed.match(/<tspan\b/gi) || []).length;
  const closeTspan = (trimmed.match(/<\/tspan>/gi) || []).length;
  if (openTspan > closeTspan) {
    return { valid: false, error: `Truncated <tspan> tags (${openTspan} opened vs ${closeTspan} closed)` };
  }

  // Minimum content richness: must have at least 1 rect and 1 text element
  const hasRect = /<rect\b/i.test(trimmed);
  const hasText = /<text\b/i.test(trimmed);
  if (!hasRect || !hasText) {
    return { valid: false, error: `SVG lacks minimum content (hasRect=${hasRect}, hasText=${hasText}) — stub SVG` };
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
    () => [{ text: prompt }], 16384, "gemini-2.5-flash", null, "summarize", null
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

// ── Helper: Multi-Line SVG Text Wrapping Generator ───────────────────────────
function wrapTextToTspans(text, maxChars, x, startY, dyEm = 1.25, fontSize = 16, fill = "#FFFFFF", fontFace = "Calibri", fontWeight = "normal", textAnchor = "start") {
  if (!text) return "";
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  if (lines.length === 0) return "";

  const tspansHtml = lines.map((line, i) => {
    const yAttr = i === 0 ? `y="${startY}"` : `dy="${dyEm}em"`;
    return `<tspan x="${x}" ${yAttr}>${escapeXml(line)}</tspan>`;
  }).join("\n");

  return `<text font-family="${fontFace}" font-size="${fontSize}" fill="${fill}" font-weight="${fontWeight}" text-anchor="${textAnchor}">
${tspansHtml}
</text>`;
}

// ── Fallback SVG Generator (Slide-Type Aware, Layout-Rich, Safe Bounds) ──────
function generateFallbackSVG(slideSpec, designSpec, index, total) {
  const c = designSpec.colorPalette || THEME_PALETTES.Professional;
  const title = slideSpec.title || `Slide ${index + 1}`;
  const focus = slideSpec.contentFocus || "";
  const slideType = slideSpec.slideType || "executiveSummary";
  const metrics = (slideSpec.keyMetrics && slideSpec.keyMetrics.length > 0)
    ? slideSpec.keyMetrics
    : ["Primary Indicator", "Secondary Metric", "Operational Goal"];

  let bodyContentSvg = "";

  if (slideType === "cover") {
    bodyContentSvg = `
      <g>
        ${wrapTextToTspans(title, 40, 640, 250, 1.15, 36, c.primary || "#F5A623", "Cambria", "bold", "middle")}
        ${wrapTextToTspans(focus || "Executive Strategic Overview & Technical Analysis", 55, 640, 330, 1.2, 18, c.text || "#FFFFFF", "Calibri", "normal", "middle")}
        <rect x="540" y="390" width="200" height="4" fill="${c.primary || '#F5A623'}" rx="2" ry="2"/>
        ${wrapTextToTspans("CONFIDENTIAL & PROPRIETARY", 40, 640, 440, 1.2, 13, c.muted || "#8099C0", "Calibri", "bold", "middle")}
      </g>`;
  } else if (slideType === "closing") {
    bodyContentSvg = `
      <g>
        ${wrapTextToTspans(title || "Thank You", 40, 640, 250, 1.15, 36, c.primary || "#F5A623", "Cambria", "bold", "middle")}
        ${wrapTextToTspans(focus || "Questions & Strategic Discussion", 55, 640, 330, 1.2, 18, c.text || "#FFFFFF", "Calibri", "normal", "middle")}
        <rect x="340" y="410" width="600" height="150" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="10" ry="10"/>
        ${wrapTextToTspans("Next Steps & Implementation Timeline", 45, 640, 450, 1.2, 18, c.primary || "#F5A623", "Cambria", "bold", "middle")}
        ${wrapTextToTspans("Contact project lead for detailed audit documentation and technical appendix.", 65, 640, 495, 1.2, 14, c.text || "#FFFFFF", "Calibri", "normal", "middle")}
      </g>`;
  } else if (slideType === "twoColumn") {
    const titleSvg = wrapTextToTspans(title, 45, 60, 65, 1.1, 28, c.text || "#FFFFFF", "Cambria", "bold");
    const focusSvg = wrapTextToTspans(focus, 65, 60, 105, 1.2, 14, c.primary || "#F5A623", "Calibri", "bold");
    bodyContentSvg = `
      ${titleSvg}
      ${focusSvg}
      <g>
        <!-- Left Column -->
        <rect x="60" y="160" width="560" height="480" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="10" ry="10"/>
        ${wrapTextToTspans("Key Observations & Financial Drivers", 35, 85, 200, 1.2, 18, c.primary || "#F5A623", "Cambria", "bold")}
        ${wrapTextToTspans("• Primary operational metrics indicate steady portfolio velocity.\n• Cash flow stability supported by diversified balance reserves.\n• Liquidity ratios remain within targeted risk parameters.", 40, 85, 250, 1.3, 14, c.text || "#FFFFFF", "Calibri", "normal")}

        <!-- Right Column -->
        <rect x="660" y="160" width="560" height="480" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="10" ry="10"/>
        ${wrapTextToTspans("Strategic Recommendations", 35, 685, 200, 1.2, 18, c.primary || "#F5A623", "Cambria", "bold")}
        ${wrapTextToTspans("• Optimize debt servicing structures to reduce annual interest overhead.\n• Implement automated audit trails for transaction verification.\n• Expand liquidity buffers during peak market volatility.", 40, 685, 250, 1.3, 14, c.text || "#FFFFFF", "Calibri", "normal")}
      </g>`;
  } else if (slideType === "twoColumn" || slideType === "kpi") {
    const titleSvg = wrapTextToTspans(title, 45, 60, 65, 1.1, 28, c.text || "#FFFFFF", "Cambria", "bold");
    const focusSvg = wrapTextToTspans(focus, 65, 60, 105, 1.2, 14, c.primary || "#F5A623", "Calibri", "bold");
    const count = Math.min(3, metrics.length);
    const cardW = Math.floor((1160 - (count - 1) * 20) / count);

    const cardsSvg = metrics.slice(0, count).map((m, i) => {
      const cx = 60 + i * (cardW + 20);
      const mStr = String(m).trim();
      return `<g>
        <rect x="${cx}" y="160" width="${cardW}" height="480" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="10" ry="10"/>
        ${wrapTextToTspans(`METRIC 0${i + 1}`, 25, cx + 25, 205, 1.2, 12, c.muted || "#8099C0", "Calibri", "bold")}
        ${wrapTextToTspans(mStr, 20, cx + 25, 250, 1.15, 22, c.primary || "#F5A623", "Cambria", "bold")}
        <line x1="${cx + 25}" y1="310" x2="${cx + cardW - 25}" y2="310" stroke="${c.cardBorder || '#2A3B60'}" stroke-width="1"/>
        ${wrapTextToTspans("• Verified performance baseline.\n• Positive trend relative to Q3 target.\n• Low variance across accounts.", 24, cx + 25, 340, 1.3, 14, c.text || "#FFFFFF", "Calibri", "normal")}
      </g>`;
    }).join("\n");

    bodyContentSvg = `${titleSvg}${focusSvg}${cardsSvg}`;
  } else if (slideType === "chart") {
    const titleSvg = wrapTextToTspans(title, 45, 60, 65, 1.1, 28, c.text || "#FFFFFF", "Cambria", "bold");
    const focusSvg = wrapTextToTspans(focus, 65, 60, 105, 1.2, 14, c.primary || "#F5A623", "Calibri", "bold");
    const chartBars = [
      { label: "Operating Revenue", value: "85%", w: 650 },
      { label: "Portfolio Yield", value: "72%", w: 550 },
      { label: "Asset Reserve Ratio", value: "90%", w: 720 },
      { label: "Cost Efficiency", value: "64%", w: 480 },
    ];
    let barY = 200;
    const barsSvg = chartBars.map(b => {
      const g = `<g>
        ${wrapTextToTspans(b.label, 25, 80, barY + 22, 1.2, 14, c.text || "#FFFFFF", "Calibri", "bold")}
        <rect x="280" y="${barY}" width="${b.w}" height="32" fill="${c.primary || '#F5A623'}" rx="6" ry="6"/>
        <text x="${280 + b.w + 15}" y="${barY + 22}" font-family="Calibri" font-size="14" font-weight="bold" fill="${c.text || '#FFFFFF'}">${b.value}</text>
      </g>`;
      barY += 70;
      return g;
    }).join("\n");

    bodyContentSvg = `
      ${titleSvg}
      ${focusSvg}
      <g>
        <rect x="60" y="160" width="1160" height="480" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="10" ry="10"/>
        ${barsSvg}
      </g>`;
  } else if (slideType === "swot") {
    const titleSvg = wrapTextToTspans(title, 45, 60, 65, 1.1, 28, c.text || "#FFFFFF", "Cambria", "bold");
    const focusSvg = wrapTextToTspans(focus, 65, 60, 105, 1.2, 14, c.primary || "#F5A623", "Calibri", "bold");
    const quads = [
      { title: "STRENGTHS", color: "#27AE60", x: 60, y: 160, text: "• Strong balance sheet reserves\n• Robust risk management frameworks" },
      { title: "WEAKNESSES", color: "#E74C3C", x: 660, y: 160, text: "• Legacy core processing overhead\n• Manual reconciliation bottlenecks" },
      { title: "OPPORTUNITIES", color: "#2980B9", x: 60, y: 410, text: "• Automation of credit risk scoring\n• Digital account onboarding integration" },
      { title: "THREATS", color: "#E67E22", x: 660, y: 410, text: "• Regulatory compliance cost inflation\n• Market liquidity rate fluctuations" },
    ];
    const quadsSvg = quads.map(q => `
      <g>
        <rect x="${q.x}" y="${q.y}" width="560" height="220" fill="${c.cardBg || '#1A2B50'}" stroke="${q.color}" stroke-width="2" rx="8" ry="8"/>
        ${wrapTextToTspans(q.title, 25, q.x + 25, q.y + 35, 1.2, 16, q.color, "Cambria", "bold")}
        ${wrapTextToTspans(q.text, 40, q.x + 25, q.y + 75, 1.3, 14, c.text || "#FFFFFF", "Calibri", "normal")}
      </g>
    `).join("\n");
    bodyContentSvg = `${titleSvg}${focusSvg}${quadsSvg}`;
  } else if (slideType === "recommendations") {
    const titleSvg = wrapTextToTspans(title, 45, 60, 65, 1.1, 28, c.text || "#FFFFFF", "Cambria", "bold");
    const focusSvg = wrapTextToTspans(focus, 65, 60, 105, 1.2, 14, c.primary || "#F5A623", "Calibri", "bold");
    const recs = [
      { num: "01", title: "Immediate Liquidity Optimization", body: "Reallocate short-term reserve capital to high-yield interest accounts to maximize float efficiency." },
      { num: "02", title: "Automated Reconciliation Pipeline", body: "Deploy structured parser for daily bank ledger entries to eliminate manual audit lag." },
      { num: "03", title: "Governance & Risk Policy Review", body: "Update internal credit authorization thresholds based on quarterly stress test models." },
    ];
    let rowY = 160;
    const recsSvg = recs.map(r => {
      const g = `<g>
        <rect x="60" y="${rowY}" width="1160" height="135" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="8" ry="8"/>
        <rect x="80" y="${rowY + 20}" width="45" height="45" fill="${c.primary || '#F5A623'}" rx="6" ry="6"/>
        <text x="102" y="${rowY + 48}" font-family="Cambria" font-size="18" font-weight="bold" fill="${c.textDark || '#0F1B38'}" text-anchor="middle">${r.num}</text>
        ${wrapTextToTspans(r.title, 45, 145, rowY + 38, 1.2, 18, c.primary || "#F5A623", "Cambria", "bold")}
        ${wrapTextToTspans(r.body, 70, 145, rowY + 70, 1.2, 14, c.text || "#FFFFFF", "Calibri", "normal")}
      </g>`;
      rowY += 160;
      return g;
    }).join("\n");
    bodyContentSvg = `${titleSvg}${focusSvg}${recsSvg}`;
  } else {
    // Default Executive Summary & Metric fallback
    const titleSvg = wrapTextToTspans(title, 42, 60, 65, 1.1, 28, c.text || "#FFFFFF", "Cambria", "bold");
    const focusSvg = wrapTextToTspans(focus, 65, 60, 108, 1.2, 14, c.primary || "#F5A623", "Calibri", "bold");

    const count = Math.min(3, metrics.length);
    const cardWidth = Math.floor((1160 - (count - 1) * 20) / count);

    const cardsHtml = metrics.slice(0, count).map((m, i) => {
      const cx = 60 + i * (cardWidth + 20);
      const mStr = String(m).trim();
      const valFontSize = mStr.length > 25 ? 14 : mStr.length > 15 ? 18 : 22;
      const labelSvg = wrapTextToTspans(`KEY METRIC ${i + 1}`, 25, cx + 20, 205, 1.2, 11, c.muted || "#8099C0", "Calibri", "bold");
      const valSvg = wrapTextToTspans(mStr, 22, cx + 20, 240, 1.2, valFontSize, c.primary || "#F5A623", "Cambria", "bold");

      return `<g>
        <rect x="${cx}" y="170" width="${cardWidth}" height="130" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="8" ry="8"/>
        ${labelSvg}
        ${valSvg}
      </g>`;
    }).join("\n");

    const bullets = [
      "Strategic analysis generated from primary financial statement data and account records.",
      "Key operational risk indicators, cash flow velocity, and account liquidity verified.",
      "Actionable recommendations prioritized based on debt structure and compliance rules."
    ];

    let bulletY = 370;
    const bulletsSvg = bullets.map(b => {
      const bSvg = wrapTextToTspans(`• ${b}`, 80, 100, bulletY, 1.25, 14, c.text || "#FFFFFF", "Calibri", "normal");
      bulletY += 45;
      return bSvg;
    }).join("\n");

    bodyContentSvg = `${titleSvg}${focusSvg}${cardsHtml}
    <g>
      <rect x="60" y="320" width="1160" height="320" fill="${c.cardBg || '#1A2B50'}" stroke="${c.cardBorder || '#2A3B60'}" rx="10" ry="10"/>
      ${wrapTextToTspans("Executive Summary & Strategic Overview", 50, 90, 355, 1.2, 18, c.primary || "#F5A623", "Cambria", "bold")}
      ${bulletsSvg}
    </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <rect width="1280" height="720" fill="${c.background || '#0F1B38'}"/>
  <rect x="0" y="0" width="1280" height="120" fill="${c.background || '#0F1B38'}"/>
  <rect x="0" y="120" width="1280" height="4" fill="${c.primary || '#F5A623'}"/>
  ${bodyContentSvg}
  <text x="1220" y="695" font-family="Calibri" font-size="14" fill="${c.muted || '#8099C0'}" text-anchor="end">${index + 1} / ${total}</text>
</svg>`;
}

function escapeXml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main Orchestrator Function ───────────────────────────────────────────────
async function renderSvgToPngCanvas(svgContent, pngPath, svgPath = null) {
  let svgStr = normalizeSvgAttributes(svgContent);

  try {
    const { createCanvas, loadImage } = require("canvas");
    const canvas = createCanvas(1280, 720);
    const ctx = canvas.getContext("2d");
    
    let img;
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
        console.warn(`⚠️ SVG generation attempt 1 failed for slide ${i + 1}: ${err.message}. Retrying...`);
        try {
          svgContent = await generateSlideSVG(slides[i], designSpec, documentText, i, slides.length);
          console.log(`✅ [SVG Pipeline] Slide ${i + 1} succeeded on retry.`);
        } catch (retryErr) {
          console.warn(`⚠️ SVG generation retry also failed for slide ${i + 1}: ${retryErr.message}. Using rich layout-aware fallback.`);
          svgContent = generateFallbackSVG(slides[i], designSpec, i, slides.length);
        }
      }

      console.log(`  📊 Slide ${i + 1} SVG size: ${svgContent.length} chars`);

      const filename = `slide_${String(i + 1).padStart(3, "0")}.svg`;
      const svgPath = path.join(svgDir, filename);
      fs.writeFileSync(svgPath, svgContent, "utf8");

      // Pre-render high-res PNG for CairoSVG-less Python environments (e.g. Windows)
      const pngPath = svgPath.replace(/\.svg$/i, ".png");
      let rendered = await renderSvgToPngCanvas(svgContent, pngPath, svgPath);
      if (rendered) {
        const stats = fs.statSync(pngPath);
        console.log(`  🖼️ Slide ${i + 1} PNG pre-rendered successfully (${Math.round(stats.size / 1024)} KB)`);
      } else {
        // PNG pre-render failed. DO NOT overwrite svgPath! Keep the real AI SVG on disk so Python can parse vector shapes.
        console.log(`  ⚠️ Slide ${i + 1} PNG pre-render skipped — keeping SVG vector source for PowerPoint shape parsing`);
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