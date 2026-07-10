const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function syncPastPayments() {
  try {
    const usersSnapshot = await db.collection('users').where('isSubscribed', '==', true).get();
    let addedCount = 0;

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;

      // Check if a payment record already exists for this user
      const existingPayment = await db.collection('payments').where('matchedUserId', '==', userId).limit(1).get();
      
      if (existingPayment.empty) {
        // Create a historical payment record
        const timestamp = userData.subscriptionActivatedAt || userData.createdAt || new Date().toISOString();
        let amount = userData.planType === 'pro' ? 1499 : 999;
        
        await db.collection('payments').add({
          orderId: `hist_${userId.substring(0, 8)}_${Date.now()}`,
          email: userData.email || '',
          phone: userData.phoneNumber || userData.phone || '',
          amount: amount,
          planType: userData.planType || 'standard',
          matchedUserId: userId,
          timestamp: timestamp,
          resolved: true,
          isHistorical: true
        });
        
        addedCount++;
        console.log(`Added historical payment for user ${userId} (${userData.email})`);
      }
    }

    console.log(`Successfully synced ${addedCount} past payments.`);
    process.exit(0);
  } catch (error) {
    console.error("Error syncing past payments:", error);
    process.exit(1);
  }
}

syncPastPayments();
