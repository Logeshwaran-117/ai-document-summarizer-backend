/**
 * chatRoutes.js — ultra-minimal, no dependencies at all
 * Save to: server/routes/chatRoutes.js
 */

"use strict";

const express = require("express");
const https   = require("https");

const router = express.Router();

// ── Ping (test this first: GET http://localhost:5000/api/chat/ping) ───────────
router.get("/ping", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ── POST /api/chat/plans ──────────────────────────────────────────────────────
router.post("/plans", (req, res) => {
  const { question, history, context, billingInfo } = req.body || {};

  if (!question || !question.trim()) {
    return res.status(400).json({ message: "question is required" });
  }

  const isPlans = context !== "billing";

  const systemContent = isPlans
    ? "You are a support assistant for AI Document Summarizer. Answer questions about plans and pricing.\n\nPlans:\n- Free: Rs.0/mo — 5 summaries/day, 10MB max\n- Pro: Rs.499/mo — 15/day, 50MB, PPT export, all AI models\n- Enterprise: Rs.1999/mo — Unlimited, 200MB, bulk processing\nAll prices include 18% GST. Razorpay payments. Daily limits reset midnight."
    : "You are a billing assistant for AI Document Summarizer. Help with invoices, subscriptions, and payments. All prices in INR+18% GST. Razorpay payments.";

  const extra = billingInfo ? "\nUser billing: " + JSON.stringify(billingInfo) : "";
  const system = systemContent + extra;

  const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
  const messages = [
    { role: "system", content: system },
    ...safeHistory.map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content || ""),
    })),
    { role: "user", content: question.trim() },
  ];

  const body = JSON.stringify({
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    messages: messages,
    max_tokens: 512,
    temperature: 0.7,
  });

  const options = {
    hostname: "api.groq.com",
    port: 443,
    path: "/openai/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type":   "application/json",
      "Authorization":  "Bearer " + process.env.GROQ_API_KEY,
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const apiReq = https.request(options, (apiRes) => {
    let raw = "";
    apiRes.on("data", chunk => { raw += chunk; });
    apiRes.on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          console.error("[chatRoutes] Groq error:", parsed.error);
          return res.status(500).json({ message: parsed.error.message || "Groq error" });
        }
        const reply = (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content)
          ? parsed.choices[0].message.content
          : "Sorry, no response generated.";
        return res.json({ reply: reply });
      } catch (e) {
        console.error("[chatRoutes] parse error:", e.message, "raw:", raw.slice(0, 200));
        return res.status(500).json({ message: "Failed to parse AI response" });
      }
    });
  });

  apiReq.on("error", (e) => {
    console.error("[chatRoutes] https error:", e.message);
    return res.status(500).json({ message: "Network error calling AI" });
  });

  apiReq.write(body);
  apiReq.end();
});

module.exports = router;