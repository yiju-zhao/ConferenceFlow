import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

let _auth, _db;

function init() {
  if (_auth && _db) return;
  if (getApps().length > 0) {
    _auth = getAuth();
    _db = getFirestore();
    return;
  }
  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  _auth = getAuth(app);
  _db = getFirestore(app);
}

const auth = new Proxy({}, { get(_, p) { init(); return typeof _auth[p] === "function" ? _auth[p].bind(_auth) : _auth[p]; } });
const db = new Proxy({}, { get(_, p) { init(); return typeof _db[p] === "function" ? _db[p].bind(_db) : _db[p]; } });

export { auth, db, FieldValue };
