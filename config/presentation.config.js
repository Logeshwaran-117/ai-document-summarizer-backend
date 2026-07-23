/**
 * presentation.config.js
 * Centralized presentation constraints & configuration rules.
 */

module.exports = {
  MAX_TITLE_LEN: 70,
  MAX_HEADLINE_LEN: 90,
  MAX_SUBTITLE_LEN: 120,
  MAX_INSIGHT_LEN: 160,
  MAX_BULLETS: 6,
  MAX_BULLET_LEN: 140,
  MAX_CARDS: 6,
  MAX_CHART_SERIES: 6,
  MAX_TABLE_ROWS: 8,
  MAX_TABLE_COLS: 5,
  MAX_PROCESS_STEPS: 5,
  DEFAULT_SLIDE_COUNT: 10,
  DEFAULT_THEME: "executive",
  DEFAULT_LANGUAGE: "English",
  
  // Pipeline Settings
  PARALLEL_EXTRACTION: true,
  CACHE_ENABLED: true,
  DEBUG_MODE: process.env.NODE_ENV !== "production",
  
  // Stage Timeout (ms)
  STAGE_TIMEOUT_MS: 30000,
};
