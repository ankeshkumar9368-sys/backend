const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { admin, db } = require('../config/firebase');
const { verifyAdmin } = require('../middleware/authMiddleware');

// File upload: CSV only, max 2MB
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Apply admin auth middleware to ALL routes in this file
router.use(verifyAdmin);

// Allowed question fields — whitelist to prevent arbitrary data injection
const ALLOWED_FIELDS = [
  'question_text', 'options', 'correct_answer', 'explanation',
  'subject', 'topic', 'exam_id', 'subject_id', 'topic_id',
  'year', 'difficulty', 'marks', 'language'
];

function sanitizeQuestion(data) {
  const clean = {};
  ALLOWED_FIELDS.forEach(field => {
    if (data[field] !== undefined) clean[field] = data[field];
  });
  return clean;
}

// POST /api/admin/questions (Add single)
router.post('/questions', async (req, res) => {
  try {
    const questionData = sanitizeQuestion(req.body);
    if (!questionData.question_text || !questionData.correct_answer) {
      return res.status(400).json({ error: 'question_text and correct_answer are required' });
    }
    questionData.created_at = admin.firestore.FieldValue.serverTimestamp();
    questionData.created_by = req.user.uid;
    const docRef = await db.collection('Questions').add(questionData);
    res.status(201).json({ id: docRef.id, message: 'Question added successfully' });
  } catch (error) {
    console.error('Admin add question error:', error);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

// POST /api/admin/questions/upload (CSV Upload)
router.post('/questions/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const results = [];
  const cleanup = () => {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  };

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(sanitizeQuestion(data)))
    .on('end', async () => {
      try {
        if (results.length === 0) {
          cleanup();
          return res.status(400).json({ error: 'CSV file is empty or has no valid rows' });
        }
        if (results.length > 500) {
          cleanup();
          return res.status(400).json({ error: 'Maximum 500 questions per upload' });
        }

        const batch = db.batch();
        results.forEach(row => {
          const docRef = db.collection('Questions').doc();
          row.created_at = admin.firestore.FieldValue.serverTimestamp();
          row.created_by = req.user.uid;
          batch.set(docRef, row);
        });
        await batch.commit();
        cleanup();
        res.status(200).json({ message: `${results.length} questions uploaded successfully` });
      } catch (error) {
        cleanup(); // Always clean up on error too
        console.error('CSV upload error:', error);
        res.status(500).json({ error: 'Failed to upload questions' });
      }
    })
    .on('error', (error) => {
      cleanup();
      res.status(500).json({ error: 'Failed to parse CSV file' });
    });
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = sanitizeQuestion(req.body);
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    updateData.updated_at = admin.firestore.FieldValue.serverTimestamp();
    updateData.updated_by = req.user.uid;
    await db.collection('Questions').doc(id).update(updateData);
    res.json({ message: 'Question updated' });
  } catch (error) {
    console.error('Admin update question error:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('Questions').doc(id).delete();
    res.json({ message: 'Question deleted' });
  } catch (error) {
    console.error('Admin delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

module.exports = router;
