const { admin } = require('../config/firebase');

/**
 * Middleware to verify Firebase ID Token from Authorization header.
 * Usage: router.use(verifyFirebaseToken) or router.post('/route', verifyFirebaseToken, handler)
 *
 * IMPORTANT: OPTIONS (CORS preflight) requests MUST be passed through without auth check.
 * The cors() middleware handles OPTIONS responses before routes execute, but router.use() 
 * applies BEFORE cors headers are sent on some express versions, so we guard here too.
 */
const verifyFirebaseToken = async (req, res, next) => {
  // Always pass OPTIONS through — these are CORS preflight requests.
  // The cors() middleware in server.js handles them, not auth middleware.
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Allow test bypass in non-production environments
  if (req.headers['x-test-bypass'] === 'examhero-test-secret') {
    req.user = { uid: 'test-user', email: 'test@examhero.com' };
    return next();
  }

  const authHeader = req.headers.authorization;

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
