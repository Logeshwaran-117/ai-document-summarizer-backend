/**
 * documentAnalyzer.js
 * Stage 1: Document classification, metric detection, entity extraction.
 */

const GeminiClient = require("../../ai/GeminiClient");
const ResponseValidator = require("../../ai/ResponseValidator");
const buildDocumentPrompt = require("../prompts/document.v1");

async function analyzeDocument(context) {
  console.log("🔍 [DocumentAnalyzer] Analyzing document type & structural metrics...");
  
  const prompt = buildDocumentPrompt(context);
  const rawResponse = await GeminiClient.generateText(prompt);
  const analysis = ResponseValidator.parseAndValidate(rawResponse, "documentAnalysis");

  return analysis;
}

module.exports = { analyzeDocument };
