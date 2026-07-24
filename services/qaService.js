const { callWithRotation } = require("./geminiService");

// Max chars of document to include in a Q&A prompt.
const QA_DOC_LIMIT = 40000;

async function answerQuestion(documentText, question, chatHistory = []) {
  try {
    const historyText = (chatHistory || [])
      .slice(-6)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n");

    let docSlice = documentText || "";
    if (docSlice.length > QA_DOC_LIMIT) {
      const half = Math.floor(QA_DOC_LIMIT / 2);
      docSlice =
        docSlice.slice(0, half) +
        "\n\n[... middle of document omitted for context window ...]\n\n" +
        docSlice.slice(-half);
    }

    const prompt = `You are a helpful assistant answering questions strictly about the document provided below.

RULES:
- Answer ONLY using information found in the document. Do not use outside knowledge.
- If the answer is not in the document, say clearly: "I couldn't find that information in this document."
- Be concise, clear, and direct.
- Quote or reference specific details (numbers, names, dates) from the document when relevant.
- Use plain text or simple Markdown (bold, bullet points, numbers) where it improves clarity.

${historyText ? `Previous conversation:\n${historyText}\n` : ""}

Document:
${docSlice || "No document text available."}

Question: ${question}

Answer:`;

    const res = await callWithRotation(() => [{ text: prompt }], 2048, "gemini-2.5-flash");
    if (res && res.trim()) return res.trim();

    return "I analyzed the document, but couldn't find a direct answer to your question.";
  } catch (err) {
    console.error("[qaService] Error answering question:", err);
    return "Sorry, I ran into an issue analyzing the document for that question. Please try asking again.";
  }
}

module.exports = answerQuestion;