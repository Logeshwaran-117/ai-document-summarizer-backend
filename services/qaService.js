const { callWithRotation } = require("./geminiService");

// Max chars of document to include in a Q&A prompt.
// Keeps total prompt under ~30k tokens while leaving room for the answer.
const QA_DOC_LIMIT = 40000;

async function answerQuestion(documentText, question, chatHistory = []) {
  const historyText = chatHistory
    .slice(-6)
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  // Truncate from the middle so both header and tail content are preserved
  let docSlice = documentText || "";
  if (docSlice.length > QA_DOC_LIMIT) {
    const half = Math.floor(QA_DOC_LIMIT / 2);
    docSlice =
      docSlice.slice(0, half) +
      "\n\n[... middle of document omitted for context window ...]\n\n" +
      docSlice.slice(-half);
  }

  const prompt = `
You are a helpful assistant answering questions strictly about the document provided below.

RULES:
- Answer ONLY using information found in the document. Do not use outside knowledge.
- If the answer is not in the document, say clearly: "I couldn't find that information in this document."
- Be concise and direct. Answer in 1-4 sentences unless the question requires a list or more detail.
- Quote or reference specific details (numbers, names, dates) from the document when relevant.
- Do not repeat the entire document back. Do not pad your answer with filler.
- Use plain text or simple Markdown (bold, bullet points) where it improves clarity.

${historyText ? `Previous conversation:\n${historyText}\n` : ""}

Document:
${docSlice}

Question: ${question}

Answer:
`;

  return callWithRotation(() => [{ text: prompt }], 2048);
}

module.exports = answerQuestion;