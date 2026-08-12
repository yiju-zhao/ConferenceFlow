import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";

let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _bucket: Bucket | undefined;

function storageBucketName(): string {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("Firebase Storage bucket is not configured");
  return bucketName;
}

function init(): void {
  if (_auth && _db && _bucket) return;
  if (getApps().length > 0) {
    _auth = getAuth();
    _db = getFirestore();
    _bucket = getStorage().bucket(storageBucketName());
    return;
  }
  const app: App = initializeApp({
    storageBucket: storageBucketName(),
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
  _bucket = getStorage(app).bucket(storageBucketName());
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
export const bucket: Bucket = lazy(() => _bucket);
export { FieldValue };
