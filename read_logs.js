const { db } = require('./config/firebase');

async function run() {
  try {
    console.log("Reading system_logs from Firestore...");
    const snapshot = await db.collection('system_logs')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    
    if (snapshot.empty) {
      console.log("No logs found in system_logs.");
      return;
    }

    console.log(`Found ${snapshot.size} logs:`);
    snapshot.forEach(doc => {
      const data = doc.data();
      const time = data.timestamp ? (typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().toISOString() : data.timestamp) : 'N/A';
      console.log(`[${time}] ${data.type.toUpperCase()}: ${data.message}`);
      if (data.details) {
        console.log("  Details:", JSON.stringify(data.details));
      }
    });
  } catch (error) {
    console.error("Failed to read logs:", error);
  }
}

run();
