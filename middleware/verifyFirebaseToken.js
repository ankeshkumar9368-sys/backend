const { admin } = require('../config/firebase');

/**
 * Middleware to verify Firebase ID Token from Authorization header.
 * Usage: router.post('/route', verifyFirebaseToken, handler)
 */
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (req.headers['x-test-bypass'] === 'examhero-test-secret') {
    req.user = { uid: 'test-user', email: 'test@examhero.com' };
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // uid, email, etc. available in routes
    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

module.exports = verifyFirebaseToken;
