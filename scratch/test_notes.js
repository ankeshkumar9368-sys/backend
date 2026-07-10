// Quick test: Smart Notes generation (same logic as /api/ai/generate-notes)
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const jsonModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: 8192,
  },
  thinkingConfig: { thinkingBudget: 0 }
});

const topic = 'Newton Laws of Motion';
const cls = '10th';
const board = 'CBSE';
const subject = 'Physics';

const prompt = `You are an expert ${subject} teacher for Indian Class ${cls} students (${board} Board).
Generate precise, accurate study notes for: "${topic}"
Subject: ${subject} | Class: ${cls} | Board: ${board}

Output strict JSON (no extra text):
{
  "topicMeta": { "topic": "${topic}", "class": "${cls}", "subject": "${subject}", "board": "${board}" },
  "intro": "2-3 line introduction in English",
  "introHindi": "Same intro in Hindi",
  "topics": [
    { "title": "Concept name", "titleHindi": "Hindi name", "content": "Explanation (English)", "contentHindi": "Hindi explanation", "definition": "Definition", "definitionHindi": "Hindi def", "examLine": "1 exam-important line", "formula": "Formula if any", "subPoints": ["point1", "point2"] }
  ],
  "importancePoints": [{ "en": "Key point", "hi": "Hindi" }],
  "formulas": [{ "title": "Name", "equation": "Formula", "usage": "When to use" }],
  "memoryTricks": [{ "trick": "Trick", "trickHindi": "Hindi trick" }],
  "subjectiveQuestions": [{ "q": "Question", "a": "Answer", "easyWay": "Simple tip", "solutionSteps": ["step1"], "weightage": 5 }],
  "objectiveQuestions": [{ "q": "Question", "options": ["A","B","C","D"], "correct": 0, "explanation": "Why correct" }],
  "quickRevision": [{ "en": "Quick point", "hi": "Hindi" }],
  "summary": ["Key takeaway 1", "Key takeaway 2"]
}
Rules: Max 5 topics, 5 formulas, 5 MCQs, 3 subjective Qs. Be accurate and concise. Use NCERT terminology.`;

async function testNotesGeneration() {
  console.log('🚀 Testing Smart Notes Generation...');
  console.log('📚 Topic:', topic);
  console.log('🏫 Class:', cls, '| Board:', board);
  console.log('⏳ Calling Gemini API...\n');

  const startTime = Date.now();
  try {
    const result = await jsonModel.generateContent(prompt);
    const text = result.response.text();
    const notes = JSON.parse(text);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ SUCCESS! Generated in ${elapsed}s\n`);
    console.log('═══════════════════════════════════════');
    console.log('📖 TOPIC META:', JSON.stringify(notes.topicMeta, null, 2));
    console.log('\n📝 INTRO (English):');
    console.log(notes.intro);
    console.log('\n📝 INTRO (Hindi):');
    console.log(notes.introHindi);
    console.log('\n🔑 KEY TOPICS:', notes.topics?.length || 0, 'topics');
    notes.topics?.forEach((t, i) => {
      console.log(`  ${i+1}. ${t.title} (${t.titleHindi})`);
      console.log(`     📌 ${t.content?.substring(0, 100)}...`);
      if (t.formula) console.log(`     🧮 Formula: ${t.formula}`);
    });
    console.log('\n🧮 FORMULAS:', notes.formulas?.length || 0);
    notes.formulas?.forEach((f, i) => console.log(`  ${i+1}. ${f.title}: ${f.equation}`));
    console.log('\n🧠 MEMORY TRICKS:', notes.memoryTricks?.length || 0);
    notes.memoryTricks?.forEach((m, i) => console.log(`  ${i+1}. ${m.trick}`));
    console.log('\n❓ MCQs:', notes.objectiveQuestions?.length || 0);
    notes.objectiveQuestions?.forEach((q, i) => console.log(`  ${i+1}. ${q.q}`));
    console.log('\n📋 SUMMARY:', notes.summary?.length || 0, 'points');
    notes.summary?.forEach((s, i) => console.log(`  ${i+1}. ${s}`));
    console.log('\n═══════════════════════════════════════');
    console.log('✅ Smart Notes system is WORKING PERFECTLY!');
  } catch (err) {
    console.error('❌ FAILED:', err.message);
  }
}

testNotesGeneration();
