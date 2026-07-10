const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

console.log("Testing API Key:", process.env.GEMINI_API_KEY ? "EXISTS" : "MISSING");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

async function run() {
  try {
    const result = await model.generateContent("Say hello in Hindi");
    console.log("RESPONSE SUCCESS!");
    console.log("Response text:", result.response.text());
  } catch (error) {
    console.error("API KEY CALL FAILED:", error);
  }
}

run();
