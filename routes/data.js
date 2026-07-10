const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const verifyFirebaseToken = require('../middleware/verifyFirebaseToken');

// All data routes require a valid login
router.use(verifyFirebaseToken);

// GET /categories — public reference data, auth still required to prevent scraping
router.get('/categories', async (req, res) => {
  try {
    const snapshot = await db.collection('Categories').get();
    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(categories);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /exams
router.get('/exams', async (req, res) => {
  try {
    const { category_id } = req.query;
    let query = db.collection('Exams');
    if (category_id) query = query.where('category_id', '==', category_id);
    const snapshot = await query.get();
    const exams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(exams);
  } catch (error) {
    console.error('Exams error:', error);
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
});

// GET /years
router.get('/years', async (req, res) => {
  try {
    const { exam_id } = req.query;
    let query = db.collection('Years');
    if (exam_id) query = query.where('exam_id', '==', exam_id);
    const snapshot = await query.get();
    const years = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(years);
  } catch (error) {
    console.error('Years error:', error);
    res.status(500).json({ error: 'Failed to fetch years' });
  }
});

// GET /questions — paginated, correct_answer stripped for non-admin users
router.get('/questions', async (req, res) => {
  try {
    const { exam_id, subject_id, topic_id, year } = req.query;
    let query = db.collection('Questions');

    if (exam_id) query = query.where('exam_id', '==', exam_id);
    if (subject_id) query = query.where('subject_id', '==', subject_id);
    if (topic_id) query = query.where('topic_id', '==', topic_id);
    if (year) query = query.where('year', '==', year);

    // Paginate — never return the entire collection at once
    query = query.limit(100);

    const snapshot = await query.get();
    const questions = snapshot.docs.map(doc => {
      const data = doc.data();
      // Do NOT expose correct_answer in data listing — only expose during attempt verification
      const { correct_answer, ...safeData } = data;
      return { id: doc.id, ...safeData };
    });

    res.json(questions);
  } catch (error) {
    console.error('Questions error:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

module.exports = router;
