const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function answerQuestion(documentText, question, chatHistory = [], retries = 3) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const historyText = chatHistory
    .slice(-6) // last 6 messages for context, keeps prompt size reasonable
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

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      const isOverloaded = error.status === 503 || error.message?.includes("overloaded") || error.message?.includes("high demand");

      if (isOverloaded && attempt < retries) {
        const waitTime = attempt * 2000;
        console.log(`Gemini overloaded, retrying in ${waitTime / 1000}s (attempt ${attempt}/${retries})...`);
        await sleep(waitTime);
        continue;
      }

      if (isOverloaded) {
        throw new Error("The AI service is currently experiencing high demand. Please try again in a minute.");
      }
      throw error;
    }
  }
}

module.exports = answerQuestion;
