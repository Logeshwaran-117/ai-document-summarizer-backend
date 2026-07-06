const { callWithRotation } = require("./geminiService");

async function answerQuestion(documentText, question, chatHistory = []) {
  const historyText = chatHistory
    .slice(-6)
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

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
${documentText}

Question: ${question}

Answer:
`;

  // callWithRotation handles key rotation + retry automatically
  return callWithRotation(() => [
    { text: prompt }   // ✅ correct — just plain parts array
  ], 2048);
}

module.exports = answerQuestion;
