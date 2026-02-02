const { db } = require('./firebase');
const bot = require('./bot');

// এডমিন আইডিগুলো প্রসেস করা
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

// এডমিন চেক করার ফাংশন
const isAdmin = (userId) => ADMIN_IDS.includes(userId);

// ========================
// 1. /START HANDLER (SILENT)
// ========================
async function handleStart(msg) {
  const user = msg.from;
  const userIdStr = user.id.toString();

  const userRef = db.collection('users').doc(userIdStr);
  const statsRef = db.collection('metadata').doc('stats');

  try {
    // Transaction ব্যবহার করা হয়েছে যেন মেম্বার নম্বর ইউনিক এবং সিরিয়াল থাকে
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);

      // ইউজার আগে থেকেই থাকলে কিছুই করবেনা (Silent)
      if (userDoc.exists) {
        return;
      }

      // মেম্বার নম্বর জেনারেট করা
      const statsDoc = await t.get(statsRef);
      let newMemberNum = 1;

      if (statsDoc.exists) {
        newMemberNum = statsDoc.data().totalMembers + 1;
        t.update(statsRef, { totalMembers: newMemberNum });
      } else {
        t.set(statsRef, { totalMembers: 1 });
      }

      // ইউজারের নাম ও ম্যানশন তৈরি
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      // ম্যানশন লিংক ফরম্যাট: tg://user?id=123456
      const mention = `<a href="tg://user?id=${user.id}">${fullName}</a>`;

      const userData = {
        memberNumber: newMemberNum,
        name: fullName,
        userId: userIdStr,
        username: user.username ? `@${user.username}` : null,
        mention: mention,
        joinedAt: new Date(),
      };

      // ডাটাবেসে সেভ করা
      t.set(userRef, userData);

      // এডমিন নোটিফিকেশন (আপনার ফরম্যাট অনুযায়ী)
      const adminMsg = `
নতুন ইউজার 👇
মেম্বার নম্বর - ${newMemberNum}
নাম - ${fullName}
আইডি - ${user.id}
ম্যানশন - ${mention}
      `;

      // সকল এডমিনকে মেসেজ পাঠানো
      ADMIN_IDS.forEach((adminId) => {
        bot.sendMessage(adminId, adminMsg, { parse_mode: 'HTML' }).catch(err => console.log('Admin send error:', err.message));
      });
    });
  } catch (error) {
    console.error('Start Handler Error:', error);
  }
  // ইউজারকে কোনো রিপ্লাই দেওয়া হবে না (Requirement 1)
}

// ========================
// 2. BROADCAST COMMAND (/broadcast)
// ========================
async function handleBroadcastCommand(msg) {
  if (!isAdmin(msg.from.id)) return; // এডমিন না হলে ইগনোর

  // এডমিনের স্টেট ডাটাবেসে সেভ করা (Serverless এ মেমোরি থাকে না, তাই DB তে রাখা নিরাপদ)
  await db.collection('admin_states').doc(msg.from.id.toString()).set({
    state: 'waiting_for_broadcast',
    timestamp: new Date()
  });

  await bot.sendMessage(msg.chat.id, "📢 ব্রডকাস্ট মেসেজ পাঠান");
}

// ========================
// 3. BROADCAST EXECUTION
// ========================
async function handleBroadcastMessage(msg) {
  if (!isAdmin(msg.from.id)) return;

  const adminRef = db.collection('admin_states').doc(msg.from.id.toString());
  const doc = await adminRef.get();

  // যদি এডমিন ব্রডকাস্ট মোডে না থাকে, তাহলে রিটার্ন
  if (!doc.exists || doc.data().state !== 'waiting_for_broadcast') {
    return;
  }

  // স্টেট ক্লিয়ার করা (যাতে ডাবল সেন্ড না হয়)
  await adminRef.delete();

  // ইউজার লোড করা
  const usersSnapshot = await db.collection('users').get();
  const total = usersSnapshot.size;
  let success = 0;
  let failed = 0;

  await bot.sendMessage(msg.chat.id, `🔄 ব্রডকাস্ট শুরু হচ্ছে... (মোট: ${total} জন)`);

  // মেসেজ সেন্ডিং লুপ
  const promises = usersSnapshot.docs.map(async (userDoc) => {
    const userData = userDoc.data();
    try {
      // copyMessage মেথড অরিজিনাল ফরম্যাট বজায় রাখে
      await bot.copyMessage(userData.userId, msg.chat.id, msg.message_id);
      success++;
    } catch (e) {
      failed++;
      // ব্লকড ইউজার হলে চাইলে এখানে হ্যান্ডেল করা যায়
    }
  });

  // সব প্রমিজ শেষ হওয়া পর্যন্ত অপেক্ষা
  await Promise.allSettled(promises);

  // ফাইনাল রিপোর্ট
  const report = `
✅ ব্রডকাস্ট সম্পন্ন
মোট ইউজার: ${total}
সফল: ${success}
ব্যর্থ: ${failed}
  `;
  await bot.sendMessage(msg.chat.id, report);
}

module.exports = { handleStart, handleBroadcastCommand, handleBroadcastMessage };
