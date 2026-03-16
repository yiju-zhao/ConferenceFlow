import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA7QWECA-aKiIjxINnKiCj5gasiQwkcL1M",
  authDomain: "gtc-2026-session-daal.firebaseapp.com",
  projectId: "gtc-2026-session-daal",
  storageBucket: "gtc-2026-session-daal.firebasestorage.app",
  messagingSenderId: "194660870117",
  appId: "1:194660870117:web:49144e1f3f38d17324f10c",
  measurementId: "G-0FBZ6NZ15Z",
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, analytics, auth, db, storage };
