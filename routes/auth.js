const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const verifyFirebaseToken = require('../middleware/verifyFirebaseToken');

// POST /api/auth/signup
// Uses Firebase token to verify identity — never trusts client-sent uid
router.post('/signup', verifyFirebaseToken, async (req, res) => {
  try {
    const { name } = req.body;
    // Always use uid from verified token — never from req.body
    const uid = req.user.uid;
    const email = req.user.email || '';

    const newUser = {
      id: uid,
      name: name ? String(name).substring(0, 100) : '',
      email: email,
      isSubscribed: true,
      planType: 'pro',
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Use set with merge:true so existing users aren't accidentally overwritten on re-signup
    await db.collection('users').doc(uid).set(newUser, { merge: true });
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

module.exports = router;
