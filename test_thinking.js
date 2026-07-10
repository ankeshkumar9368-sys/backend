const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: 8192,
  },
  thinkingConfig: { thinkingBudget: 0 }
});

async function run() {
  try {
    const result = await model.generateContent("Respond with a JSON hello: {\"message\": \"hello\"}");
    console.log("SUCCESS!");
    console.log(result.response.text());
  } catch (error) {
    console.error("FAILED WITH THINKING CONFIG:", error);
  }
}

run();
