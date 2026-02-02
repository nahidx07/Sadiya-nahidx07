const admin = require('firebase-admin');

// ফায়ারবেস ইনিশিয়ালাইজেশন (ডুপ্লিকেট এড়ানোর জন্য চেক করা হচ্ছে)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel এ প্রাইভেট কি এর নিউলাইন (\n) সমস্যা সমাধানের জন্য রিপ্লেস করা হয়েছে
      privateKey: process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined,
    }),
  });
}

const db = admin.firestore();
module.exports = { db };
