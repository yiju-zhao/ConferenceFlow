import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore, FieldValue } from "firebase-admin/firestore";

let _auth: Auth | undefined;
let _db: Firestore | undefined;

function init(): void {
  if (_auth && _db) return;
  if (getApps().length > 0) {
    _auth = getAuth();
    _db = getFirestore();
    return;
  }
  const app: App = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "")
        .replace(/\\n/g, "\n")
        .replace(/\\\\n/g, "\n"),
    }),
  });
  _auth = getAuth(app);
  _db = getFirestore(app);
}

function lazy<T extends object>(get: () => T | undefined): T {
  return new Proxy({} as T, {
    get(_t, p) {
      init();
      const target = get() as T;
      const value = (target as Record<string | symbol, unknown>)[p];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const auth: Auth = lazy(() => _auth);
export const db: Firestore = lazy(() => _db);
export { FieldValue };
