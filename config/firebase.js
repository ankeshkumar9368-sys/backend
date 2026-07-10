const admin = require('firebase-admin');

// IMPORTANT: Download your Firebase service account key JSON file
// from Firebase Console -> Project Settings -> Service Accounts
// Save it as serviceAccountKey.json in the root folder.
// For now we'll initialize it to throw an error if missing, 
// ensuring the user knows they need it.

let db;

try {
  let serviceAccount;
  
  // Production: Read from Environment Variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } 
  // Development: Fallback to local file
  else {
    serviceAccount = require('../serviceAccountKey.json');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log('Firebase Admin Initialized Successfully.');
} catch (error) {
  console.warn('⚠️ WARNING: serviceAccountKey.json or FIREBASE_SERVICE_ACCOUNT not found.');
  console.warn('⚠️ Firebase Admin SDK requires credentials to operate.');
  // Initialize without credentials for code compilation purposes
  admin.initializeApp();
  db = admin.firestore();
}

module.exports = { admin, db };
