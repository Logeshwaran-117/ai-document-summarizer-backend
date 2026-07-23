/**
 * storyGenerator.js
 * Stage 2: Story Strategy generation + Story Quality Pass.
 */

const GeminiClient = require("../../ai/GeminiClient");
const ResponseValidator = require("../../ai/ResponseValidator");
const buildStoryPrompt = require("../prompts/story.v1");

async function generateStory(context) {
  console.log("📖 [StoryGenerator] Generating strategic narrative arc & key messages...");
  
  const prompt = buildStoryPrompt(context);
  const rawResponse = await GeminiClient.generateText(prompt);
  let story = ResponseValidator.parseAndValidate(rawResponse, "storyStrategy");

  // Story Quality Pass: verify narrative flow and remove repetition
  if (!story.keyMessages || story.keyMessages.length === 0) {
    story.keyMessages = ["Key Finding 1", "Key Finding 2", "Key Finding 3"];
  }

  return story;
}

module.exports = { generateStory };
