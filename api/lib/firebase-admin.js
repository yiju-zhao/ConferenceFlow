const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

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

module.exports = {
  get auth() { init(); return _auth; },
  get db() { init(); return _db; },
  FieldValue,
};
