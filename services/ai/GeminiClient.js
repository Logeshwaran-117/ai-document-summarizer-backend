/**
 * GeminiClient.js
 * Low-level Gemini API client wrapper with key rotation, error handling, and timeout support.
 */

const { callWithRotation } = require("../geminiService");
const config = require("../../config/presentation.config");

class GeminiClient {
  static async generateText(prompt, options = {}) {
    const maxTokens = options.maxTokens || 8192;
    const model = options.model || "gemini-2.5-flash";
    const mimeType = options.responseMimeType || "application/json";
    
    return callWithRotation(
      () => [{ text: prompt }],
      maxTokens,
      model,
      null,
      "summarize",
      mimeType
    );
  }

  static async generateWithImage(prompt, base64Data, mimeType, options = {}) {
    const maxTokens = options.maxTokens || 4096;
    const model = options.model || "gemini-2.5-flash";
    
    return callWithRotation(
      () => [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ],
      maxTokens,
      model,
      null,
      "summarize"
    );
  }
}

module.exports = GeminiClient;
