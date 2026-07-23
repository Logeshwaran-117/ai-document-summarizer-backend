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

    let parsed = null;
    const cleaned = this.cleanJsonString(raw);

    // 1. Direct JSON parse
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // 2. Regex extract object/array
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
      if (!parsed) {
        parsed = this.partialJsonExtract(cleaned);
      }
    }

    if (!parsed) {
      throw new Error(`JSON parse failed for response snippet: ${raw.slice(0, 100)}...`);
    }

    // 3. Schema validation / structural normalization
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
