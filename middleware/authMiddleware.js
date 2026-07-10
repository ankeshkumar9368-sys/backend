const { admin } = require('../config/firebase');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

const verifyAdmin = async (req, res, next) => {
  verifyToken(req, res, async () => {
    // Assuming custom claims are set for admin, or checking an 'Admins' collection
    try {
      // Option 1: Using Custom Claims (recommended)
      if (req.user.admin === true) {
        return next();
      }
      
      // Option 2: Checking Firestore 'Users' collection for role
      const { db } = require('../config/firebase');
      const userDoc = await db.collection('Users').doc(req.user.uid).get();
      
      if (userDoc.exists && userDoc.data().role === 'admin') {
        return next();
      }
      
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    } catch (error) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
};

module.exports = { verifyToken, verifyAdmin };
