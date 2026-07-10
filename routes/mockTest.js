const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const verifyFirebaseToken = require('../middleware/verifyFirebaseToken');

// GET /api/mock-test — fetch questions for a mock test (auth required)
router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    const { exam_id } = req.query;
    if (!exam_id) return res.status(400).json({ error: 'exam_id is required' });

    const snapshot = await db.collection('Questions')
      .where('exam_id', '==', exam_id)
      .limit(50)
      .get();

    // Return questions WITHOUT correct_answer — client should NOT have answers before submission
    const questions = snapshot.docs.map(doc => {
      const data = doc.data();
      const { correct_answer, ...safeData } = data; // Strip correct answer
      return { id: doc.id, ...safeData };
    });

    const testId = db.collection('MockTestResults').doc().id; // Generate unique test ID
    res.json({ test_id: testId, questions });
  } catch (error) {
    console.error('Mock test fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch mock test' });
  }
});

// POST /api/mock-test/submit-test — auth required, score computed server-side
router.post('/submit-test', verifyFirebaseToken, async (req, res) => {
  try {
    const { responses, total_time } = req.body;
    const user_id = req.user.uid; // Always from token

    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: 'responses array is required' });
    }
    if (responses.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 responses per submission' });
    }
    if (typeof total_time !== 'number' || total_time < 0) {
      return res.status(400).json({ error: 'Invalid total_time' });
    }

    // Fetch correct answers from Firestore and compute score server-side
    const questionIds = responses.map(r => r.question_id).filter(Boolean);
    if (questionIds.length !== responses.length) {
      return res.status(400).json({ error: 'Each response must have a question_id' });
    }

    // Batch fetch all questions
    const questionDocs = await Promise.all(
      questionIds.map(id => db.collection('Questions').doc(id).get())
    );

    const correctAnswerMap = {};
    questionDocs.forEach(doc => {
      if (doc.exists) correctAnswerMap[doc.id] = doc.data().correct_answer;
    });

    // Compute results server-side — never trust client's is_correct
    let score = 0;
    const verifiedResponses = responses.map(r => {
      const correct_answer = correctAnswerMap[r.question_id];
      const is_correct = correct_answer !== undefined && correct_answer === r.selected_answer;
      if (is_correct) score++;
      return {
        question_id: r.question_id,
        selected_answer: r.selected_answer,
        is_correct, // Server-computed
      };
    });

    const testResult = {
      user_id,
      responses: verifiedResponses,
      score,
      total: responses.length,
      total_time,
      submitted_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('MockTestResults').add(testResult);
    res.status(201).json({
      id: docRef.id,
      message: 'Test submitted',
      score,
      total: responses.length,
    });
  } catch (error) {
    console.error('Mock test submit error:', error);
    res.status(500).json({ error: 'Failed to submit test' });
  }
});

module.exports = router;
