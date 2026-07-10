const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const verifyFirebaseToken = require('../middleware/verifyFirebaseToken');

// GET /api/analytics — user can only see their OWN analytics
router.get('/', verifyFirebaseToken, async (req, res) => {
  try {
    // Always use the UID from the verified token — ignore any user_id in query params
    const user_id = req.user.uid;

    const snapshot = await db.collection('UserAttempts')
      .where('user_id', '==', user_id)
      .limit(500) // Prevent enormous responses
      .get();

    let totalQuestions = 0;
    let correctAnswers = 0;

    snapshot.docs.forEach(doc => {
      totalQuestions++;
      if (doc.data().is_correct) {
        correctAnswers++;
      }
    });

    const accuracy = totalQuestions > 0
      ? ((correctAnswers / totalQuestions) * 100).toFixed(2)
      : 0;

    res.json({
      total_attempts: totalQuestions,
      correct_answers: correctAnswers,
      accuracy: `${accuracy}%`
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
