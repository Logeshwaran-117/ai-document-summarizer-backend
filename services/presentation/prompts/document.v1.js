/**
 * document.v1.js — Prompt template for Document Type & Entity Analyzer
 */

module.exports = function buildDocumentPrompt(context) {
  return `You are a McKinsey-grade document analyst. Classify and extract key features from this document text.
Return ONLY a JSON object, no markdown or extra commentary.

DOCUMENT SAMPLE:
"""
${context.documentSample}
"""

JSON SCHEMA REQUIRED:
{
  "type": "banking|financial_report|research_paper|business_proposal|legal_contract|resume_cv|technical_doc|annual_report|medical_report|meeting_notes|educational_content|government_report|healthcare_data|sales_report|hr_document|marketing_report|project_plan|audit_report|policy_document|general",
  "confidence": "high|medium|low",
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "primaryLanguage": "English",
  "dataRichness": "low|medium|high",
  "hasTabularData": true|false,
  "hasCharts": true|false,
  "suggestedSlideTypes": ["bullets", "kpi", "chart", "scorecard", "twoColumn"],
  "documentTitle": "<Concise Document Title max 60 chars>",
  "estimatedAudience": "<Target Audience>",
  "topMetrics": ["<Metric 1 with exact figure>", "<Metric 2 with exact figure>", "<Metric 3 with exact figure>"]
}`;
};
