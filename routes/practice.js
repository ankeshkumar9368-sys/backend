const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const verifyFirebaseToken = require('../middleware/verifyFirebaseToken');

// POST /api/practice/attempt
// Security: Requires Firebase auth. is_correct is computed server-side, never trusted from client.
router.post('/attempt', verifyFirebaseToken, async (req, res) => {
  try {
    const { question_id, selected_answer, time_taken } = req.body;
    const user_id = req.user.uid; // Always use token UID, ignore any client-sent user_id

    if (!question_id || selected_answer === undefined) {
      return res.status(400).json({ error: 'question_id and selected_answer are required' });
    }

    if (typeof time_taken !== 'number' || time_taken < 0 || time_taken > 600) {
      return res.status(400).json({ error: 'Invalid time_taken value' });
    }

    // Fetch the question to verify the answer server-side
    const questionDoc = await db.collection('Questions').doc(question_id).get();
    if (!questionDoc.exists) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const questionData = questionDoc.data();
    // Compute is_correct server-side — never trust the client
    const is_correct = questionData.correct_answer === selected_answer;

    const attemptData = {
      user_id,
      question_id,
      selected_answer,
      is_correct, // Server-computed
      time_taken,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('UserAttempts').add(attemptData);
    res.status(201).json({ id: docRef.id, message: 'Attempt recorded', is_correct });
  } catch (error) {
    console.error('Practice attempt error:', error);
    res.status(500).json({ error: 'Failed to record attempt' });
  }
});

module.exports = router;
