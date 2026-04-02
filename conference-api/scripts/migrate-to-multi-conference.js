import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore(app);

const CONF_ID = "gtc-2026";
const CONF_DATA = {
  name: "GTC 2026",
  description: "NVIDIA GPU Technology Conference 2026",
  startDate: "2026-03-17",
  endDate: "2026-03-21",
  visibility: "public",
  joinCode: "",
  createdBy: "migration",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
};

async function migrate() {
  console.log("Starting migration to multi-conference structure...");

  // 1. Create conference doc
  console.log(`Creating conference: ${CONF_ID}`);
  await db.collection("conferences").doc(CONF_ID).set(CONF_DATA);

  // 2. Migrate members
  const membersSnap = await db.collection("members").get();
  console.log(`Migrating ${membersSnap.size} members...`);
  for (const memberDoc of membersSnap.docs) {
    const data = memberDoc.data();
    await db.collection("conferences").doc(CONF_ID)
      .collection("members").doc(data.id).set({
        role: "member",
        status: "approved",
        attendanceMode: data.mode || "onsite",
        colorIndex: data.colorIndex || 0,
        legacyName: data.name,
        appliedAt: FieldValue.serverTimestamp(),
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: "migration",
      });
  }

  // 3. Migrate sessions
  const sessionsSnap = await db.collection("sessions").get();
  console.log(`Migrating ${sessionsSnap.size} sessions...`);
  for (const sessionDoc of sessionsSnap.docs) {
    const data = sessionDoc.data();
    await db.collection("conferences").doc(CONF_ID)
      .collection("sessions").doc(sessionDoc.id).set({
        ...data,
        attendees: data.attendees ? [...data.attendees] : [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  // 4. Migrate daily reports
  const reportsSnap = await db.collection("dailyReports").get();
  console.log(`Migrating ${reportsSnap.size} daily reports...`);
  for (const reportDoc of reportsSnap.docs) {
    const data = reportDoc.data();
    await db.collection("conferences").doc(CONF_ID)
      .collection("dailyReports").doc(reportDoc.id).set(data);

    // Also migrate snapshots subcollection
    const snapshotsSnap = await db
      .collection("dailyReports").doc(reportDoc.id)
      .collection("snapshots").get();

    for (const snapDoc of snapshotsSnap.docs) {
      await db.collection("conferences").doc(CONF_ID)
        .collection("dailyReports").doc(reportDoc.id)
        .collection("snapshots").doc(snapDoc.id)
        .set(snapDoc.data());
    }
  }

  console.log("Migration complete!");
  console.log(`Conference ID: ${CONF_ID}`);
  console.log("Old collections are preserved (not deleted). Remove them manually when ready.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
