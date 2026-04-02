import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let _auth;
let _db;

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

export const auth = new Proxy({}, {
  get(_, prop) { init(); return _auth[prop]; }
});

export const db = new Proxy({}, {
  get(_, prop) { init(); return typeof _db[prop] === "function" ? _db[prop].bind(_db) : _db[prop]; }
});
