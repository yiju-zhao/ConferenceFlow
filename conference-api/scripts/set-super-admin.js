import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node scripts/set-super-admin.js <uid>");
  process.exit(1);
}

await getAuth(app).setCustomUserClaims(uid, { globalRole: "super_admin" });
console.log(`Set super_admin claims for user ${uid}`);
process.exit(0);
