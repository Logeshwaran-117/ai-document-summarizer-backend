/**
 * RetryManager.js
 * Retries AI stage execution with JSON repair, schema enforcement, and fallback options.
 */

const GeminiClient = require("./GeminiClient");
const ResponseValidator = require("./ResponseValidator");

class RetryManager {
  static async executeWithRetry(promptFn, schemaKey = null, maxRetries = 2, options = {}) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const promptText = typeof promptFn === "function" ? promptFn(attempt) : promptFn;
        const rawResponse = await GeminiClient.generateText(promptText, options);
        const parsed = ResponseValidator.parseAndValidate(rawResponse, schemaKey);
        return parsed;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ [RetryManager] Attempt ${attempt}/${maxRetries + 1} failed: ${err.message}`);
        
        if (attempt <= maxRetries) {
          // Exponential backoff delay
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }

    throw new Error(`Execution failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`);
  }
}

module.exports = RetryManager;
