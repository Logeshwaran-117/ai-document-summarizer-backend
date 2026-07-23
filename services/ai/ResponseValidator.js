/**
 * ResponseValidator.js
 * JSON cleaning, syntax repair, and schema structural validation.
 */

class ResponseValidator {
  static cleanJsonString(raw) {
    if (!raw || typeof raw !== "string") return "";
    let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    s = s.replace(/,\s*([}\]])/g, "$1"); // Trailing commas
    s = s.replace(/:\s*'([^']*)'/g, ': "$1"'); // Single quotes for values
    s = s.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":'); // Single quotes for keys
    s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":'); // Unquoted keys
    s = s.replace(/[\u0000-\u001F]+/g, (m) => (m === "\n" || m === "\r" || m === "\t") ? " " : "");
    return s;
  }

  static repairAndParseJson(raw) {
    if (!raw || typeof raw !== "string") return null;

    let text = raw.trim();

    // 1. Strip markdown code fences
    text = text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/g, "").trim();

    // Direct JSON parse attempt
    try {
      return JSON.parse(text);
    } catch (e) {
      // Continue to repair
    }

    // 2. Extract bounding JSON structure (first '{' or '[' to last '}' or ']')
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");

    let cleaned = text;
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      cleaned = lastBrace > firstBrace ? text.substring(firstBrace, lastBrace + 1) : text.substring(firstBrace);
    } else if (firstBracket !== -1) {
      cleaned = lastBracket > firstBracket ? text.substring(firstBracket, lastBracket + 1) : text.substring(firstBracket);
    }

    try {
      return JSON.parse(cleaned);
    } catch (e) {}

    // 3. Clean quotes, control chars, trailing commas
    let repaired = cleaned
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u0000-\u001F]+/g, (m) => (m === "\n" || m === "\r" || m === "\t") ? " " : "");

    // 4. Missing commas between properties (e.g. "val" "key": or 123 "key": or true "key":)
    repaired = repaired.replace(/("(?:[^"\\]|\\.)*"\s*|\b(?:true|false|null|[0-9]+(?:\.[0-9]+)?)\s*)("[a-zA-Z_][a-zA-Z0-9_]*"\s*:)/g, "$1, $2");

    // 5. Missing commas between elements (e.g. } { or ] [ or "val" {)
    repaired = repaired.replace(/(\}|\]|"(?:[^"\\]|\\.)*")\s*(\{|\[|"(?:[^"\\]|\\.)*")/g, "$1, $2");

    try {
      return JSON.parse(repaired);
    } catch (e) {}

    // 6. Handle truncation: auto-close open quotes, brackets, and braces
    let stack = [];
    let inString = false;
    let escaped = false;
    let truncateFixed = "";

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (escaped) {
        escaped = false;
        truncateFixed += char;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        truncateFixed += char;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        truncateFixed += char;
        continue;
      }
      if (inString) {
        truncateFixed += char;
        continue;
      }
      if (char === "{" || char === "[") {
        stack.push(char === "{" ? "}" : "]");
      } else if (char === "}" || char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
      truncateFixed += char;
    }

    if (inString) truncateFixed += '"';
    truncateFixed = truncateFixed.trim().replace(/,\s*$/, "");
    while (stack.length > 0) {
      truncateFixed += stack.pop();
    }

    try {
      return JSON.parse(truncateFixed);
    } catch (e) {}

    // 7. Partial extract fallback
    const partial = this.partialJsonExtract(repaired);
    if (partial && Object.keys(partial).length > 0) return partial;

    return null;
  }

  static partialJsonExtract(s) {
    const result = {};
    const strRe = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = strRe.exec(s)) !== null) result[m[1]] = m[2];
    const numRe = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g;
    while ((m = numRe.exec(s)) !== null) { if (!(m[1] in result)) result[m[1]] = parseFloat(m[2]); }
    const boolRe = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*(true|false)/g;
    while ((m = boolRe.exec(s)) !== null) { if (!(m[1] in result)) result[m[1]] = m[2] === "true"; }
    return Object.keys(result).length > 0 ? result : null;
  }

  static parseAndValidate(raw, schemaKey = null) {
    if (!raw) throw new Error("Empty AI response received.");

    let parsed = this.repairAndParseJson(raw);

    if (!parsed) {
      const cleaned = this.cleanJsonString(raw);
      // Regex extract object/array fallback
      const arrMatch = cleaned.match(/(\[[\s\S]*\])/);
      if (arrMatch) {
        try { parsed = JSON.parse(arrMatch[1]); } catch {}
      }
      if (!parsed) {
        const objMatch = cleaned.match(/(\{[\s\S]*\})/);
        if (objMatch) {
          try { parsed = JSON.parse(objMatch[1]); } catch {}
        }
      }
    }

    if (!parsed) {
      throw new Error(`JSON parse failed for response snippet: ${raw.slice(0, 100)}...`);
    }

    // Schema validation / structural normalization
    if (schemaKey) {
      parsed = this.enforceSchema(parsed, schemaKey);
    }

    return parsed;
  }

  static enforceSchema(data, schemaKey) {
    if (!data || typeof data !== "object") return data;

    switch (schemaKey) {
      case "documentAnalysis":
        return {
          type: data.type || "general",
          confidence: data.confidence || "medium",
          keyTopics: Array.isArray(data.keyTopics) ? data.keyTopics : [],
          primaryLanguage: data.primaryLanguage || "English",
          dataRichness: data.dataRichness || "medium",
          hasTabularData: Boolean(data.hasTabularData),
          hasCharts: Boolean(data.hasCharts),
          suggestedSlideTypes: Array.isArray(data.suggestedSlideTypes) ? data.suggestedSlideTypes : ["bullets", "kpi"],
          documentTitle: data.documentTitle || "Document Analysis",
          estimatedAudience: data.estimatedAudience || "Executive Leadership",
          topMetrics: Array.isArray(data.topMetrics) ? data.topMetrics : [],
        };

      case "storyStrategy":
        return {
          presentationTitle: data.presentationTitle || "Executive Presentation",
          executiveSummary: data.executiveSummary || "",
          keyMessages: Array.isArray(data.keyMessages) ? data.keyMessages : [],
          narrativeFlow: data.narrativeFlow || "",
          targetSlideCount: parseInt(data.targetSlideCount) || 10,
          audience: data.audience || "Executive Leadership",
          tone: data.tone || "Professional",
          topQuantitativeFindings: Array.isArray(data.topQuantitativeFindings) ? data.topQuantitativeFindings : [],
          mostImportantInsight: data.mostImportantInsight || "",
        };

      case "slideOutline":
        return Array.isArray(data) ? data.map((s, i) => ({
          slideNumber: s.slideNumber || i + 1,
          slideType: s.slideType || "bullets",
          title: s.title || `Slide ${i + 1}`,
          contentFocus: s.contentFocus || "",
          purpose: s.purpose || "",
        })) : [];

      case "slidePlanner":
        return Array.isArray(data) ? data.map(s => ({
          slideNumber: s.slideNumber || 1,
          slideType: s.slideType || s.layout || "bullets",
          headline: s.headline || s.title || "Slide Title",
          subtitle: s.subtitle || "",
          keyInsight: s.keyInsight || "",
          bullets: Array.isArray(s.bullets) ? s.bullets : [],
          cards: Array.isArray(s.cards) ? s.cards : [],
          processSteps: Array.isArray(s.processSteps) ? s.processSteps : [],
          table: s.table || null,
          chart: s.chart || null,
          quote: s.quote || null,
          speakerNotes: s.speakerNotes || "",
        })) : [];

      default:
        return data;
    }
  }
}

module.exports = ResponseValidator;
