const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LRUCache } = require('lru-cache');
const crypto = require('crypto');
const verifyFirebaseToken = require('../middleware/verifyFirebaseToken');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '');

// ─── MODEL INSTANCES (pre-warmed at startup) ───────────────────────────────

// Standard text model
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  // Disable thinking to avoid empty output errors
  thinkingConfig: { thinkingBudget: 0 }
});

// Notes JSON model — high token limit for rich bilingual notes
const jsonModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: 16384,
    topK: 40,
    topP: 0.95,
  },
  // Disable thinking — thinking tokens are not returned as text, causing empty output
  thinkingConfig: { thinkingBudget: 0 }
});

// MCQ model
const mcqModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.2,
    maxOutputTokens: 6000,
    topK: 40,
    topP: 0.95,
  },
  // Disable thinking — thinking tokens are not returned as text, causing empty output
  thinkingConfig: { thinkingBudget: 0 }
});

// ─── IN-MEMORY LRU CACHE ───────────────────────────────────────────────────
const aiCache = new LRUCache({
  max: 200,
  ttl: 1000 * 60 * 60 * 2, // 2 hours
  allowStale: false,
});

function getCacheKey(...parts) {
  return parts.map(p => String(p || '').toLowerCase().replace(/\W+/g, '_')).join('|');
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
function sanitizeInput(str, maxLen = 300) {
  if (typeof str !== 'string') return '';
  return str.replace(/[`"\\]/g, '').substring(0, maxLen).trim();
}

// Check Gemini finish reason and throw descriptive error if blocked/empty
function checkFinishReason(response, label = 'AI') {
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    const safetyRatings = candidate?.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || 'none';
    console.error(`[${label}] Non-STOP finish reason: ${finishReason} | Safety: ${safetyRatings}`);
    throw new Error(`${label} was blocked or returned no output. Reason: ${finishReason}. Try rephrasing your topic.`);
  }
}

function extractJSON(text) {
  if (!text) throw new Error('Empty response from AI');
  // Direct parse
  try { return JSON.parse(text); } catch (_) {}
  // Strip markdown code fences
  const stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(stripped); } catch (_) {}
  // Extract first JSON block
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }
  // Last resort: try to fix truncated JSON by finding last complete field
  throw new Error('Could not parse AI response as JSON. Response may have been truncated.');
}

// ─── COMPREHENSIVE SUBJECT DETECTION ──────────────────────────────────────
// Detects subject from topic name — covers all Indian school board subjects
function detectSubject(topic, subjectHint) {
  // If caller already knows the subject, trust it
  if (subjectHint && subjectHint !== 'General' && subjectHint !== 'general') {
    return subjectHint;
  }

  const t = (topic || '').toLowerCase();

  // Science subjects (Physics)
  if (/newton|force|motion|velocity|acceleration|energy|wave|optic|electric|magnetic|quantum|thermo|fluid|gravit|work|power|light|sound|atom|nucleus|semi.?cond|circuit|ohm|lens|mirror|refraction|reflection|capacitor|inductor|transformer|pressure|buoyancy|archimedes|bernoulli|heat|temperature|friction|momentum|torque|angular|centripetal|kepler|doppler/.test(t)) return 'Physics';

  // Science subjects (Chemistry)
  if (/acid|base|salt|bond|reaction|periodic|organic|mole|solution|oxidat|redox|polymer|carbon|alkane|alkene|alkyne|benzene|element|compound|mixture|colloid|electrolysis|corrosion|combustion|catalyst|chemical|metal|nonmetal|ionic|covalent|hydrogen|oxygen|nitrogen|carbon.dioxide|water|ph|indicator|titration|soap|detergent|petroleum|coal|natural.gas|synthetic|plastic|rubber|fertilizer|pesticide/.test(t)) return 'Chemistry';

  // Science subjects (Biology)
  if (/cell|tissue|organ|evolution|genetic|dna|rna|virus|bacteria|plant|animal|photosyn|respir|digest|nervous|enzyme|hormone|ecosystem|biodiversity|food.chain|food.web|reproduction|heredity|variation|adaptation|microorganism|fungi|algae|protozoa|vaccination|immunity|blood|heart|lung|kidney|liver|brain|neuron|muscle|skeleton|phototropism|geotropism|transpiration|pollination|fertilization|germination|chlorophyll|mitosis|meiosis|chromosome|gene|allele|dominant|recessive|mendel/.test(t)) return 'Biology';

  // Mathematics
  if (/triangle|algebra|polynomial|quadratic|arithmetic|geometr|circle|proof|statistic|probabilit|calculus|matrix|vector|integral|derivative|logarithm|permutation|combination|progression|series|binomial|coordinate|parabola|ellipse|hyperbola|function|limit|continuity|set theory|relation|number system|rational|irrational|real number|complex number|determinant|equation|inequality|ratio|proportion|percentage|profit|loss|interest|mensuration|volume|surface area|perimeter|area|angle|theorem/.test(t)) return 'Mathematics';

  // History
  if (/mughal|british|revolt|independence|gandhi|nehru|partition|harappa|maurya|gupta|maratha|coloniz|nationalism|french revolution|world war|civil war|industrial revolution|renaissance|reform|caste|untouchability|swaraj|swadeshi|non.cooperation|civil.disobedience|quit.india|jallianwala|salt.march|constituent assembly|vedic|indus|civilization|emperor|sultan|dynasty|kingdom|empire|treaty|charter|act of|battle of|war of|freedom fighter|revolutionary/.test(t)) return 'History';

  // Geography
  if (/map|river|mountain|climate|soil|forest|agriculture|population|resource|disaster|latitude|longitude|continent|ocean|sea|bay|gulf|strait|peninsula|island|plateau|plain|desert|rainfall|monsoon|erosion|deposition|weathering|rock|mineral|earthquake|volcano|tsunami|flood|drought|irrigation|dam|transport|road|railway|port|trade|import|export|sustainable|environment|pollution|ozone|greenhouse/.test(t)) return 'Geography';

  // Political Science / Civics
  if (/constitution|parliament|election|judiciary|preamble|rights|duties|federalism|democracy|policy|government|fundamental|directive|president|prime.minister|cabinet|legislature|executive|lok.sabha|rajya.sabha|high.court|supreme.court|amendment|bill|act|law|citizen|franchise|vote|party|coalition|separation.of.powers|sovereignty|secularism|republic/.test(t)) return 'Political Science';

  // Economics
  if (/supply|demand|gdp|inflation|market|trade|budget|bank|money|poverty|development|econom|micro|macro|consumer|producer|price|quantity|elasticity|revenue|cost|profit|monopoly|oligopoly|competition|globalization|liberalization|privatization|nationalization|fiscal|monetary|tax|revenue|expenditure|investment|capital|labour|land|rent|wage|interest|dividend|stock|share|bond|forex/.test(t)) return 'Economics';

  // English Language/Literature
  if (/grammar|poem|prose|story|essay|comprehension|tense|verb|noun|pronoun|adjective|adverb|preposition|conjunction|interjection|active|passive|voice|speech|direct|indirect|clause|phrase|paragraph|letter|application|report|speech.writing|summary|precis|idiom|phrase|figurative|metaphor|simile|alliteration|shakespeare|character|theme|plot|setting|author|narrator|stanza|rhyme/.test(t)) return 'English';

  // Hindi
  if (/doha|kabir|surdas|tulsidas|premchand|munshi|hindi|kavita|gadya|nibandh|patra|sahitya|vyakaran|upsarg|pratyay|sandhi|samas|vakya|ling|vachan|vibhakti|karak|kriya|vishleshan|ras|chhand|alankar|muhavara|lokokti|paryayvachi|vilom|anekarthi|shabdkosh/.test(t)) return 'Hindi';

  // Computer Science
  if (/algorithm|program|code|function|loop|array|database|network|html|css|python|java|c\+\+|javascript|operating system|software|hardware|internet|web|binary|decimal|hexadecimal|data structure|sorting|searching|recursion|object|class|inheritance|polymorphism|encapsulation|sql|query|table|relation|normalization|cybersecurity/.test(t)) return 'Computer Science';

  // Accountancy
  if (/ledger|journal|balance sheet|profit|loss|account|trial balance|debit|credit|audit|depreciation|asset|liability|capital|revenue|expense|cash flow|fund flow|ratio analysis|partnership|company|shares|debenture|financial statement|trading account|manufacturing account/.test(t)) return 'Accountancy';

  // Business Studies
  if (/business|entrepreneur|marketing|management|organisation|finance|hrm|company|consumer|planning|staffing|directing|controlling|coordination|delegation|authority|responsibility|span of control|motivation|leadership|communication|market|product|price|promotion|place|brand|advertising/.test(t)) return 'Business Studies';

  // Sanskrit
  if (/sanskrit|shloka|sutra|granth|vedic|upanishad|gita|ramayana|mahabharat|panini|ashtadhyayi|sandhi|samas|vibhakti|dhatu|pratyay|shabd|karak|ling|vachan|purusha|lakar/.test(t)) return 'Sanskrit';

  // Physical Education
  if (/physical education|sports|athletics|yoga|asana|pranayama|meditation|nutrition|diet|obesity|fitness|exercise|training|first.aid|doping|tournament|olympic|commonwealth|asian.games|national.games/.test(t)) return 'Physical Education';

  return 'General';
}

// All AI routes require a valid Firebase login
router.use(verifyFirebaseToken);

// ─── 1. GENERATE NOTES (ALL SUBJECTS) ────────────────────────────────────
router.post('/generate-notes', async (req, res) => {
  try {
    const topic    = sanitizeInput(req.body.topic, 300);
    const cls      = sanitizeInput(req.body.cls || req.body.class || '10th', 10);
    const board    = sanitizeInput(req.body.board || 'CBSE', 50);
    const lang     = sanitizeInput(req.body.lang || 'en-hi', 10);
    const subHint  = sanitizeInput(req.body.subject || '', 100);

    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const subject = detectSubject(topic, subHint);
    const localLang = lang === 'en-hi' ? 'Hindi' : lang;

    // ⚡ Cache check
    const cacheKey = getCacheKey('notes', topic, cls, board, subject, lang);
    const cached = aiCache.get(cacheKey);
    if (cached) {
      console.log(`⚡ CACHE HIT: notes [${topic}]`);
      return res.status(200).json({ ...cached, _cached: true });
    }

    console.log(`🤖 Generating notes: "${topic}" [${subject}, ${cls}, ${board}]`);

    const isLanguageSubject = ['Hindi', 'English', 'Sanskrit'].includes(subject);
    const isMaths = subject === 'Mathematics';

    const prompt = `You are an expert ${subject} teacher for Indian Class ${cls} students (${board} Board).
Generate comprehensive bilingual study notes for: "${topic}"
Subject: ${subject} | Class: ${cls} | Board: ${board}

CRITICAL RULES:
- Output ONLY valid JSON. No extra text, no markdown, no code blocks.
- Language: English + ${localLang} for all key fields.
- Use NCERT/official board terminology only.
- Be 100% accurate — double-check all facts, formulas, dates, names.
- EVERY section below MUST be filled. Empty arrays are NOT acceptable.
- Max 5 topics, 5 formulas${isLanguageSubject ? ' (or literary devices if no formulas)' : ''}, 5 MCQs, 3 subjective questions.
- LATEX EQUATION RULE: All mathematical expressions, equations, chemical equations, and formulas MUST be written in clean, standard LaTeX math format (e.g. use \\\\frac{a}{b} for fractions, \\\\cdot for multiplication, ^ for superscript, _ for subscript). Example: \\\\frac{G \\\\cdot m_1 \\\\cdot m_2}{r^2}. Do NOT write plain text equations like 'a/b' or use '*' for multiplication.

JSON Schema (fill ALL fields):
{
  "topicMeta": {
    "topic": "${topic}",
    "class": "${cls}",
    "subject": "${subject}",
    "board": "${board}",
    "language": "${localLang}"
  },
  "intro": "2-3 line introduction in English — what is this topic about and why is it important",
  "introHindi": "Same intro in ${localLang}",
  "topics": [
    {
      "title": "Concept/Sub-topic name in English",
      "titleHindi": "Name in ${localLang}",
      "content": "Clear explanation in English (3-4 sentences)",
      "contentHindi": "Same explanation in ${localLang}",
      "definition": "Precise definition in English",
      "definitionHindi": "Definition in ${localLang}",
      "examLine": "1 important line that is commonly asked in exams",
      "formula": "${isMaths ? 'Mathematical formula or expression' : isLanguageSubject ? 'Key rule or literary device' : 'Formula if applicable, else empty string'}",
      "subPoints": ["Key point 1", "Key point 2", "Key point 3"]
    }
  ],
  "formulas": [
    {
      "title": "Formula name",
      "equation": "${isMaths ? 'Mathematical equation' : isLanguageSubject ? 'Rule or pattern' : 'Equation or expression'}",
      "usage": "When and how to use this formula/rule"
    }
  ],
  "memoryTricks": [
    {
      "trick": "Memory trick or mnemonic in English",
      "trickHindi": "Same trick in ${localLang}"
    }
  ],
  "subjectiveQuestions": [
    {
      "q": "Full question as it would appear in board exam",
      "a": "Complete model answer",
      "easyWay": "Simple tip to remember/write the answer",
      "solutionSteps": ["Step 1", "Step 2", "Step 3"],
      "weightage": 5
    }
  ],
  "objectiveQuestions": [
    {
      "q": "MCQ question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Why this option is correct"
    }
  ],
  "quickRevision": [
    { "en": "Key revision point in English", "hi": "Same in ${localLang}" }
  ],
  "importancePoints": [
    { "en": "Important fact/concept in English", "hi": "In ${localLang}" }
  ],
  "summary": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"],
  "diagramSuggestions": [
    {
      "label": "Detailed caption describing the diagram, explaining each labeled part, and listing all mandatory labels/arrows needed for exam-readiness.",
      "wikiTitle": "Exact title of a Wikipedia article showing this diagram.",
      "section": "snapshot",
      "insertAfterConcept": "Name of concept"
    }
  ],
  "masterNotes": {
    "snapshotConcepts": "Complete overview in English + ${localLang}",
    "definitions": [{"term": "Term", "definition": "English definition"}],
    "shortTricks": ["Trick 1", "Trick 2"],
    "commonMistakes": [{"mistake": "Common error students make", "correction": "What to do instead"}],
    "fiveOneLinePoints": ["One-liner 1", "One-liner 2", "One-liner 3", "One-liner 4", "One-liner 5"],
    "revisionSummary": "One paragraph complete summary for last-minute revision"
  }
}`;

    let responseText = '';
    const result = await jsonModel.generateContent(prompt);
    checkFinishReason(result.response, 'Notes');
    responseText = result.response.text();

    if (!responseText || responseText.trim() === '') {
      throw new Error('AI returned empty response. The topic may have triggered a safety filter — please try a different wording.');
    }

    const notes = extractJSON(responseText);

    // Post-process: ensure topics array is never empty
    if (!notes.topics || notes.topics.length === 0) {
      const mn = notes.masterNotes || {};
      notes.topics = [{
        title: topic,
        titleHindi: topic,
        content: mn.snapshotConcepts || notes.intro || `Overview of ${topic}`,
        contentHindi: notes.introHindi || mn.snapshotConcepts || `${topic} का परिचय`,
        definition: (mn.definitions || [])[0]?.definition || `${topic} is an important concept in ${subject}`,
        definitionHindi: `${topic} ${subject} का एक महत्वपूर्ण विषय है`,
        examLine: (mn.fiveOneLinePoints || [])[0] || `${topic} is frequently asked in ${board} exams`,
        formula: (notes.formulas || [])[0]?.equation || '',
        subPoints: mn.fiveOneLinePoints?.slice(0, 3) || mn.shortTricks || []
      }];
    }

    // Post-process: ensure MCQs have proper structure
    if (notes.objectiveQuestions) {
      notes.objectiveQuestions = notes.objectiveQuestions.map((q, i) => ({
        ...q,
        q: q.q || q.question || q.text || `Question ${i + 1}`,
        options: q.options || ['A', 'B', 'C', 'D'],
        correct: typeof q.correct === 'number' ? q.correct : (typeof q.correctAnswer === 'number' ? q.correctAnswer : 0),
        explanation: q.explanation || ''
      }));
    }

    aiCache.set(cacheKey, notes);
    console.log(`✅ Generated notes: "${topic}" (${subject}, ${cls}, ${board})`);
    res.status(200).json(notes);

  } catch (error) {
    console.error('generate-notes error:', error?.message);
    if (responseText) {
      console.error('RAW AI RESPONSE THAT FAILED:', responseText);
    }
    res.status(500).json({
      error: 'Notes generation failed',
      detail: error?.message || 'Unknown error',
      suggestion: 'Please try again. If the issue persists, try a more specific topic name.'
    });
  }
});

// ─── 2. GENERATE MCQs ────────────────────────────────────────────────────
router.post('/generate-mcqs', async (req, res) => {
  try {
    const topic   = sanitizeInput(req.body.topic, 300);
    const count   = Math.min(Math.max(parseInt(req.body.count) || 10, 1), 30);
    const cls     = sanitizeInput(req.body.cls || req.body.class || '10th', 10);
    const board   = sanitizeInput(req.body.board || 'CBSE', 50);
    const subHint = sanitizeInput(req.body.subject || '', 100);

    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const subject = detectSubject(topic, subHint);

    const cacheKey = getCacheKey('mcqs', topic, count, cls, board, subject);
    const cached = aiCache.get(cacheKey);
    if (cached) {
      console.log(`⚡ CACHE HIT: mcqs [${topic}]`);
      return res.status(200).json({ ...cached, _cached: true });
    }

    const prompt = `Generate ${count} accurate MCQs for Class ${cls} ${subject} — Topic: "${topic}" (${board} Board).
Rules: Verify each correct answer. Use NCERT syllabus. correctAnswer is 0-indexed integer (0-3).
Output strict JSON only:
{
  "questions": [
    {
      "id": "q1",
      "text": "Question text (English)",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Why this option is correct"
    }
  ]
}`;

    const result = await mcqModel.generateContent(prompt);
    checkFinishReason(result.response, 'MCQ');
    const data   = extractJSON(result.response.text());
    aiCache.set(cacheKey, data);
    console.log(`✅ Generated ${count} MCQs: [${topic}]`);
    res.status(200).json(data);

  } catch (error) {
    console.error('generate-mcqs error:', error?.message);
    res.status(500).json({ error: 'MCQ generation failed: ' + (error?.message || 'Unknown error') });
  }
});

// ─── 3. WEAK AREA ANALYSIS ───────────────────────────────────────────────
router.post('/analyze-weak-areas', async (req, res) => {
  try {
    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0)
      return res.status(400).json({ error: 'results array is required' });
    if (results.length > 100)
      return res.status(400).json({ error: 'Maximum 100 results per analysis' });

    const prompt = `Analyze student MCQ performance and identify weak areas with improvement tips.
Data: ${JSON.stringify(results.slice(0, 50))}
Output strict JSON:
{
  "weakAreas": ["topic1", "topic2"],
  "analysisReport": "2-3 line summary",
  "improvementTips": [{ "area": "Topic", "tip": "Specific tip", "priority": "High" }],
  "suggestedChapters": ["Chapter 1", "Chapter 2"]
}`;

    const result   = await jsonModel.generateContent(prompt);
    checkFinishReason(result.response, 'WeakArea');
    const analysis = extractJSON(result.response.text());
    res.status(200).json(analysis);

  } catch (error) {
    console.error('analyze-weak-areas error:', error?.message);
    res.status(500).json({ error: 'Analysis failed: ' + (error?.message || 'Unknown error') });
  }
});

// ─── 4. DOUBT SOLVER ─────────────────────────────────────────────────────
router.post('/ask-doubt', async (req, res) => {
  try {
    const question = sanitizeInput(req.body.question, 500);
    const context  = sanitizeInput(req.body.context, 200);
    if (!question) return res.status(400).json({ error: 'question is required' });

    const result = await model.generateContent(
      `You are an expert Indian school teacher. Answer this student's doubt clearly and step-by-step.\nContext: ${context}\nQuestion: ${question}\nAnswer:`
    );
    res.status(200).json({ answer: result.response.text() });

  } catch (error) {
    console.error('ask-doubt error:', error?.message);
    res.status(500).json({ error: 'Failed to solve doubt.' });
  }
});

// ─── 5. SECURE AI PROXY (used by frontend gemini.ts) ────────────────────
router.post('/proxy', async (req, res) => {
  try {
    const { prompt, isJsonMode } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    // Cache JSON mode requests
    if (isJsonMode) {
      const hash = crypto.createHash('md5').update(prompt).digest('hex');
      const cacheKey = getCacheKey('proxy', hash);
      const cached = aiCache.get(cacheKey);
      if (cached) {
        console.log(`⚡ CACHE HIT: proxy [Hash: ${hash}]`);
        return res.status(200).json({ text: JSON.stringify(cached), _cached: true });
      }
    }

    const dynamicModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: isJsonMode
        ? {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 12000,
            topK: 40,
            topP: 0.95
          }
        : { temperature: 0.7, maxOutputTokens: 4096 },
      // Disable thinking — thinking tokens are not returned as text
      thinkingConfig: { thinkingBudget: 0 }
    });

    const result   = await dynamicModel.generateContent(prompt);
    const response = result.response;
    checkFinishReason(response, 'Proxy');
    const text     = response.text();

    if (!text || text.trim() === '') {
      return res.status(500).json({ error: 'AI returned empty response. The prompt may have been blocked by a safety filter.' });
    }

    if (isJsonMode) {
      const hash = crypto.createHash('md5').update(prompt).digest('hex');
      const cacheKey = getCacheKey('proxy', hash);
      try { aiCache.set(cacheKey, JSON.parse(text)); } catch (_) {}
    }

    res.status(200).json({ text, usageMetadata: response.usageMetadata });

  } catch (error) {
    console.error('AI Proxy error:', error?.message);
    res.status(500).json({
      error: error?.message || 'Failed to generate content via proxy.',
      suggestion: 'Check API key and try again.'
    });
  }
});

// ─── 6. CACHE STATS (admin) ───────────────────────────────────────────────
router.get('/cache-stats', (req, res) => {
  res.json({
    size: aiCache.size,
    max: aiCache.max,
    message: `${aiCache.size} items cached`
  });
});

module.exports = router;
