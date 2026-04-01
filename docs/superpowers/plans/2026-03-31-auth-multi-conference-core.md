# Auth + Multi-Conference Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace anonymous auth with email/Google sign-in, restructure Firestore into conference-scoped subcollections, add role-based access, build a dashboard page, and set up the Next.js API backend on Railway.

**Architecture:** Firebase Auth stays for identity (email + Google OAuth). Firestore data moves under `conferences/{confId}/` subcollections. A Next.js API on Railway handles server-side operations (conference CRUD, membership approval, role management) via Firebase Admin SDK. The React SPA frontend reads Firestore directly for real-time data.

**Tech Stack:** React 18, Firebase Auth + Firestore + Storage, Next.js 14 (App Router), Firebase Admin SDK, Tailwind CSS 3, Vite 5

---

## File Structure

### New Files (Next.js API — separate project)

```
conference-api/                          # New Next.js project on Railway
├── package.json
├── next.config.js
├── .env.example
├── lib/
│   ├── firebase-admin.js               # Firebase Admin SDK init
│   └── auth-middleware.js              # Verify Firebase ID token, extract user
├── app/
│   └── api/
│       ├── auth/
│       │   └── register/route.js       # POST: create user profile in Firestore
│       ├── conferences/
│       │   ├── route.js                # POST: create conference (super_admin)
│       │   └── [confId]/
│       │       ├── route.js            # PUT: update conference settings
│       │       └── members/
│       │           ├── approve/route.js # POST: approve pending member
│       │           └── reject/route.js  # POST: reject pending member
│       └── admin/
│           └── set-role/route.js       # POST: set global or conference role
```

### New Files (React Frontend — in existing project)

```
src/
├── contexts/
│   └── AuthContext.jsx                 # Auth state provider (user, role, loading)
├── components/
│   ├── AuthGuard.jsx                   # Route protection wrapper
│   ├── LoginPage.jsx                   # Email/Google sign-in page
│   ├── RegisterPage.jsx                # Email sign-up page
│   └── Dashboard.jsx                   # Conference list + join + discover
├── hooks/
│   └── useMembership.js               # Hook: fetch user's membership for a conference
├── lib/
│   └── api.js                         # Helper to call Next.js API routes
```

### Modified Files (React Frontend)

```
src/main.jsx                            # Add new routes, wrap with AuthContext
src/firebase.js                         # Add GoogleAuthProvider, email auth helpers
src/shared.jsx                          # Remove hardcoded SESSION_CATALOG, add conference context helpers
src/App.jsx                             # Scope to conference: read from subcollections
src/ReportList.jsx                      # Scope to conference: read from subcollections
src/DailyReport.jsx                     # Scope to conference: read from subcollections
```

---

## Task 1: Set Up Next.js API Project

**Files:**
- Create: `conference-api/package.json`
- Create: `conference-api/next.config.js`
- Create: `conference-api/.env.example`
- Create: `conference-api/.gitignore`

- [ ] **Step 1: Initialize the Next.js project**

```bash
cd /Users/eason/Documents/HW-Project/Conference
mkdir conference-api && cd conference-api
npx create-next-app@latest . --app --no-src-dir --js --no-tailwind --no-eslint --import-alias "@/*"
```

Accept defaults. This creates a Next.js 14 project with App Router.

- [ ] **Step 2: Install Firebase Admin SDK**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
npm install firebase-admin
```

- [ ] **Step 3: Create `.env.example`**

Write to `conference-api/.env.example`:

```env
# Firebase Admin SDK — download service account JSON from Firebase Console
# Settings → Service accounts → Generate new private key
FIREBASE_PROJECT_ID=gtc-2026-session-daal
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@gtc-2026-session-daal.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Frontend origin for CORS
FRONTEND_ORIGIN=http://localhost:5173
```

- [ ] **Step 4: Create `.env.local` with real values**

Copy `.env.example` to `.env.local` and fill in the real Firebase service account values. Download the service account key from Firebase Console → Project Settings → Service accounts → Generate new private key.

- [ ] **Step 5: Update `.gitignore`**

Ensure `conference-api/.gitignore` includes:

```
.env.local
.env
node_modules/
.next/
```

- [ ] **Step 6: Verify project starts**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
npm run dev
```

Expected: Next.js dev server starts on http://localhost:3000

- [ ] **Step 7: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git init
git add -A
git commit -m "feat: initialize Next.js API project for conference platform"
```

---

## Task 2: Firebase Admin SDK Initialization

**Files:**
- Create: `conference-api/lib/firebase-admin.js`

- [ ] **Step 1: Write Firebase Admin init module**

Write to `conference-api/lib/firebase-admin.js`:

```javascript
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseAdmin() {
  if (getApps().length > 0) {
    return {
      auth: getAuth(),
      db: getFirestore(),
    };
  }

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });

  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}

export const { auth, db } = getFirebaseAdmin();
```

- [ ] **Step 2: Verify import works**

Create a temporary test route at `conference-api/app/api/health/route.js`:

```javascript
import { db } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Attempt to read a non-existent doc to verify connection
    const snap = await db.collection("_health").doc("ping").get();
    return NextResponse.json({ status: "ok", connected: true });
  } catch (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
```

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
npm run dev
# In another terminal:
curl http://localhost:3000/api/health
```

Expected: `{"status":"ok","connected":true}`

- [ ] **Step 3: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add lib/firebase-admin.js app/api/health/route.js
git commit -m "feat: add Firebase Admin SDK initialization and health check"
```

---

## Task 3: Auth Middleware

**Files:**
- Create: `conference-api/lib/auth-middleware.js`

- [ ] **Step 1: Write the auth middleware**

Write to `conference-api/lib/auth-middleware.js`:

```javascript
import { auth } from "@/lib/firebase-admin";

/**
 * Verifies Firebase ID token from Authorization header.
 * Returns decoded token with uid, email, and custom claims.
 * Throws if token is missing or invalid.
 */
export async function verifyAuth(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch (error) {
    throw new AuthError("Invalid or expired token", 401);
  }
}

/**
 * Verifies the user has super_admin global role.
 */
export async function requireSuperAdmin(request) {
  const decoded = await verifyAuth(request);
  if (decoded.globalRole !== "super_admin") {
    throw new AuthError("Super admin access required", 403);
  }
  return decoded;
}

/**
 * Verifies the user is an approved admin for the given conference.
 * Also allows super_admin.
 */
export async function requireConfAdmin(request, confId) {
  const decoded = await verifyAuth(request);
  if (decoded.globalRole === "super_admin") return decoded;

  const { db } = await import("@/lib/firebase-admin");
  const memberSnap = await db
    .collection("conferences")
    .doc(confId)
    .collection("members")
    .doc(decoded.uid)
    .get();

  if (!memberSnap.exists) {
    throw new AuthError("Not a member of this conference", 403);
  }

  const member = memberSnap.data();
  if (member.status !== "approved" || member.role !== "admin") {
    throw new AuthError("Conference admin access required", 403);
  }

  return decoded;
}

/**
 * Verifies the user is an approved member (any role) of the given conference.
 * Also allows super_admin.
 */
export async function requireMember(request, confId) {
  const decoded = await verifyAuth(request);
  if (decoded.globalRole === "super_admin") return decoded;

  const { db } = await import("@/lib/firebase-admin");
  const memberSnap = await db
    .collection("conferences")
    .doc(confId)
    .collection("members")
    .doc(decoded.uid)
    .get();

  if (!memberSnap.exists || memberSnap.data().status !== "approved") {
    throw new AuthError("Approved membership required", 403);
  }

  return decoded;
}

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add lib/auth-middleware.js
git commit -m "feat: add auth middleware with role verification helpers"
```

---

## Task 4: Conference CRUD API

**Files:**
- Create: `conference-api/app/api/conferences/route.js`
- Create: `conference-api/app/api/conferences/[confId]/route.js`

- [ ] **Step 1: Write POST /api/conferences (create conference)**

Write to `conference-api/app/api/conferences/route.js`:

```javascript
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireSuperAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request) {
  try {
    const decoded = await requireSuperAdmin(request);
    const body = await request.json();

    const { name, description, startDate, endDate, visibility } = body;

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: "name, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const confRef = db.collection("conferences").doc();
    const confData = {
      name,
      description: description || "",
      startDate,
      endDate,
      visibility: visibility || "public",
      joinCode: visibility === "private" ? generateJoinCode() : "",
      createdBy: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await confRef.set(confData);

    return NextResponse.json({ id: confRef.id, ...confData }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
```

- [ ] **Step 2: Write PUT /api/conferences/[confId] (update conference)**

Write to `conference-api/app/api/conferences/[confId]/route.js`:

```javascript
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function PUT(request, { params }) {
  try {
    const { confId } = await params;
    await requireConfAdmin(request, confId);
    const body = await request.json();

    const allowedFields = ["name", "description", "startDate", "endDate", "visibility", "joinCode"];
    const updates = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }
    updates.updatedAt = FieldValue.serverTimestamp();

    const confRef = db.collection("conferences").doc(confId);
    const snap = await confRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }

    await confRef.update(updates);
    return NextResponse.json({ id: confId, ...updates });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const { confId } = await params;
    const confRef = db.collection("conferences").doc(confId);
    const snap = await confRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }
    return NextResponse.json({ id: confId, ...snap.data() });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Test conference creation manually**

```bash
# First, get a Firebase ID token for a super_admin user (we'll set this up later)
# For now, verify the route responds to unauthenticated requests correctly:
curl -X POST http://localhost:3000/api/conferences \
  -H "Content-Type: application/json" \
  -d '{"name": "test"}'
```

Expected: `{"error":"Missing or invalid Authorization header"}` with status 401

- [ ] **Step 4: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add app/api/conferences/
git commit -m "feat: add conference CRUD API routes"
```

---

## Task 5: Membership Approval API

**Files:**
- Create: `conference-api/app/api/conferences/[confId]/members/approve/route.js`
- Create: `conference-api/app/api/conferences/[confId]/members/reject/route.js`

- [ ] **Step 1: Write POST /api/conferences/[confId]/members/approve**

Write to `conference-api/app/api/conferences/[confId]/members/approve/route.js`:

```javascript
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request, { params }) {
  try {
    const { confId } = await params;
    const decoded = await requireConfAdmin(request, confId);
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const memberRef = db
      .collection("conferences")
      .doc(confId)
      .collection("members")
      .doc(userId);

    const snap = await memberRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (snap.data().status !== "pending") {
      return NextResponse.json({ error: "Member is not in pending status" }, { status: 400 });
    }

    await memberRef.update({
      status: "approved",
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: decoded.uid,
    });

    return NextResponse.json({ userId, status: "approved" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write POST /api/conferences/[confId]/members/reject**

Write to `conference-api/app/api/conferences/[confId]/members/reject/route.js`:

```javascript
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request, { params }) {
  try {
    const { confId } = await params;
    await requireConfAdmin(request, confId);
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const memberRef = db
      .collection("conferences")
      .doc(confId)
      .collection("members")
      .doc(userId);

    const snap = await memberRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (snap.data().status !== "pending") {
      return NextResponse.json({ error: "Member is not in pending status" }, { status: 400 });
    }

    await memberRef.update({
      status: "rejected",
    });

    return NextResponse.json({ userId, status: "rejected" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add app/api/conferences/
git commit -m "feat: add membership approve/reject API routes"
```

---

## Task 6: Set Role API

**Files:**
- Create: `conference-api/app/api/admin/set-role/route.js`

- [ ] **Step 1: Write POST /api/admin/set-role**

Write to `conference-api/app/api/admin/set-role/route.js`:

```javascript
import { NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase-admin";
import { requireSuperAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const { userId, globalRole, confId, confRole } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Set global role (super_admin or user)
    if (globalRole) {
      if (!["super_admin", "user"].includes(globalRole)) {
        return NextResponse.json({ error: "Invalid globalRole" }, { status: 400 });
      }

      // Update Firestore user doc
      await db.collection("users").doc(userId).update({ globalRole });

      // Update Firebase Auth custom claims
      await auth.setCustomUserClaims(userId, { globalRole });
    }

    // Set conference role (admin or member)
    if (confId && confRole) {
      if (!["admin", "member"].includes(confRole)) {
        return NextResponse.json({ error: "Invalid confRole" }, { status: 400 });
      }

      const memberRef = db
        .collection("conferences")
        .doc(confId)
        .collection("members")
        .doc(userId);

      const snap = await memberRef.get();
      if (snap.exists) {
        await memberRef.update({ role: confRole });
      } else {
        // Create membership if it doesn't exist (admin assigning directly)
        await memberRef.set({
          role: confRole,
          status: "approved",
          attendanceMode: "onsite",
          colorIndex: 0,
          appliedAt: FieldValue.serverTimestamp(),
          approvedAt: FieldValue.serverTimestamp(),
          approvedBy: "super_admin",
        });
      }
    }

    return NextResponse.json({ userId, globalRole, confId, confRole });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add app/api/admin/
git commit -m "feat: add set-role API for global and conference role assignment"
```

---

## Task 7: CORS Configuration for Next.js API

**Files:**
- Modify: `conference-api/next.config.js`
- Create: `conference-api/middleware.js`

- [ ] **Step 1: Add CORS middleware**

Write to `conference-api/middleware.js`:

```javascript
import { NextResponse } from "next/server";

export function middleware(request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    "https://conferenceflow.vercel.app",
  ];

  const response = NextResponse.next();

  if (allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
```

- [ ] **Step 2: Update next.config.js**

Write to `conference-api/next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only project — disable page rendering features we don't need
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 3: Verify CORS works**

```bash
curl -X OPTIONS http://localhost:3000/api/health \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -v 2>&1 | grep -i "access-control"
```

Expected: `Access-Control-Allow-Origin: http://localhost:5173`

- [ ] **Step 4: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add middleware.js next.config.js
git commit -m "feat: add CORS middleware for frontend API access"
```

---

## Task 8: Firebase Auth Setup in Frontend

**Files:**
- Modify: `src/firebase.js`

- [ ] **Step 1: Add auth providers to firebase.js**

Edit `src/firebase.js` — replace the entire file:

```javascript
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
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
const googleProvider = new GoogleAuthProvider();

export {
  app,
  analytics,
  auth,
  db,
  storage,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
};
```

- [ ] **Step 2: Verify existing app still starts**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
npm run dev
```

Expected: App starts without errors (anonymous auth in components still works for now).

- [ ] **Step 3: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/firebase.js
git commit -m "feat: add Google OAuth provider and auth helpers to firebase.js"
```

---

## Task 9: Auth Context Provider

**Files:**
- Create: `src/contexts/AuthContext.jsx`

- [ ] **Step 1: Write the AuthContext**

Write to `src/contexts/AuthContext.jsx`:

```jsx
import { createContext, useContext, useState, useEffect } from "react";
import {
  auth,
  db,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch user profile from Firestore
        const profileRef = doc(db, "users", firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setUserProfile(profileSnap.data());
          // Update lastLoginAt
          setDoc(profileRef, { lastLoginAt: serverTimestamp() }, { merge: true });
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const signUpWithEmail = async (email, password, displayName) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    // Create Firestore user profile
    await setDoc(doc(db, "users", result.user.uid), {
      email,
      displayName,
      avatarUrl: "",
      provider: "email",
      globalRole: "user",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    // Refresh profile
    const profileSnap = await getDoc(doc(db, "users", result.user.uid));
    setUserProfile(profileSnap.data());
    return result.user;
  };

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const u = result.user;
    // Create profile if first time
    const profileRef = doc(db, "users", u.uid);
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        email: u.email,
        displayName: u.displayName || "",
        avatarUrl: u.photoURL || "",
        provider: "google",
        globalRole: "user",
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    } else {
      await setDoc(profileRef, { lastLoginAt: serverTimestamp() }, { merge: true });
    }
    const updatedSnap = await getDoc(profileRef);
    setUserProfile(updatedSnap.data());
    return u;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    userProfile,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    isSuperAdmin: userProfile?.globalRole === "super_admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/contexts/AuthContext.jsx
git commit -m "feat: add AuthContext with email/Google sign-in and user profile"
```

---

## Task 10: API Helper for Frontend

**Files:**
- Create: `src/lib/api.js`

- [ ] **Step 1: Write API helper**

Write to `src/lib/api.js`:

```javascript
import { auth } from "../firebase";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Makes an authenticated API call to the Next.js backend.
 * Automatically attaches the Firebase ID token.
 */
export async function apiFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not authenticated");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/lib/api.js
git commit -m "feat: add API helper with Firebase auth token injection"
```

---

## Task 11: Login Page

**Files:**
- Create: `src/components/LoginPage.jsx`

- [ ] **Step 1: Write the LoginPage component**

Write to `src/components/LoginPage.jsx`:

```jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.code === "auth/invalid-credential"
        ? "Invalid email or password"
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="bg-primary p-6 mb-0">
          <h1 className="font-headline text-on-primary text-2xl font-bold tracking-tight">
            CONFERENCEFLOW
          </h1>
          <p className="text-on-primary/70 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Form */}
        <div className="bg-surface-container-lowest p-6">
          {error && (
            <div className="bg-primary/10 text-primary text-sm p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin}>
            <div className="mb-4">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary p-3 font-headline text-sm font-bold
                uppercase tracking-wider hover:bg-primary-container transition-colors duration-50
                disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-surface-dim"></div>
            <span className="text-secondary text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-surface-dim"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-surface-container p-3 text-on-surface text-sm font-body
              hover:bg-surface-container-high transition-colors duration-50
              disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>

          <p className="text-center text-secondary text-sm mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/LoginPage.jsx
git commit -m "feat: add LoginPage with email and Google sign-in"
```

---

## Task 12: Register Page

**Files:**
- Create: `src/components/RegisterPage.jsx`

- [ ] **Step 1: Write the RegisterPage component**

Write to `src/components/RegisterPage.jsx`:

```jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmail(email, password, displayName.trim());
      navigate("/dashboard");
    } catch (err) {
      setError(err.code === "auth/email-already-in-use"
        ? "An account with this email already exists"
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="bg-primary p-6 mb-0">
          <h1 className="font-headline text-on-primary text-2xl font-bold tracking-tight">
            CONFERENCEFLOW
          </h1>
          <p className="text-on-primary/70 text-sm mt-1">Create your account</p>
        </div>

        {/* Form */}
        <div className="bg-surface-container-lowest p-6">
          {error && (
            <div className="bg-primary/10 text-primary text-sm p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister}>
            <div className="mb-4">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="Your name"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="At least 6 characters"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-surface-container-high p-3 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                placeholder="Repeat your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary p-3 font-headline text-sm font-bold
                uppercase tracking-wider hover:bg-primary-container transition-colors duration-50
                disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-surface-dim"></div>
            <span className="text-secondary text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-surface-dim"></div>
          </div>

          <button
            onClick={handleGoogleSignUp}
            disabled={loading}
            className="w-full bg-surface-container p-3 text-on-surface text-sm font-body
              hover:bg-surface-container-high transition-colors duration-50
              disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign up with Google
          </button>

          <p className="text-center text-secondary text-sm mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/RegisterPage.jsx
git commit -m "feat: add RegisterPage with email and Google sign-up"
```

---

## Task 13: AuthGuard Component

**Files:**
- Create: `src/components/AuthGuard.jsx`

- [ ] **Step 1: Write the AuthGuard**

Write to `src/components/AuthGuard.jsx`:

```jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/**
 * Route protection wrapper.
 * - requireAuth: redirects to /login if not authenticated
 * - requireSuperAdmin: redirects to /dashboard if not super_admin
 */
export default function AuthGuard({ children, requireSuperAdmin = false }) {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-secondary text-sm uppercase tracking-wider">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && userProfile?.globalRole !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/AuthGuard.jsx
git commit -m "feat: add AuthGuard for route protection"
```

---

## Task 14: Membership Hook

**Files:**
- Create: `src/hooks/useMembership.js`

- [ ] **Step 1: Write the useMembership hook**

Write to `src/hooks/useMembership.js`:

```javascript
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

/**
 * Real-time hook for user's membership in a conference.
 * Returns { membership, role, status, loading }
 */
export function useMembership(confId) {
  const { user, isSuperAdmin } = useAuth();
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }

    // Super admins have implicit full access
    if (isSuperAdmin) {
      setMembership({
        role: "admin",
        status: "approved",
        attendanceMode: "onsite",
        colorIndex: 0,
      });
      setLoading(false);
      return;
    }

    const memberRef = doc(db, "conferences", confId, "members", user.uid);
    const unsubscribe = onSnapshot(memberRef, (snap) => {
      setMembership(snap.exists() ? snap.data() : null);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, confId, isSuperAdmin]);

  return {
    membership,
    role: membership?.role || null,
    status: membership?.status || null,
    isApproved: membership?.status === "approved",
    isAdmin: membership?.role === "admin" || isSuperAdmin,
    loading,
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/hooks/useMembership.js
git commit -m "feat: add useMembership hook for real-time conference membership"
```

---

## Task 15: Dashboard Page

**Files:**
- Create: `src/components/Dashboard.jsx`

- [ ] **Step 1: Write the Dashboard component**

Write to `src/components/Dashboard.jsx`:

```jsx
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, onSnapshot, doc, setDoc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

export default function Dashboard() {
  const { user, userProfile, signOut, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [conferences, setConferences] = useState([]);
  const [myMemberships, setMyMemberships] = useState({});
  const [showPast, setShowPast] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [applyModal, setApplyModal] = useState(null); // { confId, confName }
  const [attendanceMode, setAttendanceMode] = useState("onsite");
  const [applying, setApplying] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  // Listen to all conferences (public ones + ones user is member of)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences"), (snap) => {
      setConferences(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  // Listen to user's memberships across all conferences
  useEffect(() => {
    if (!user) return;
    const unsubscribes = [];

    // For each conference, check if user has a membership doc
    conferences.forEach((conf) => {
      const memberRef = doc(db, "conferences", conf.id, "members", user.uid);
      const unsub = onSnapshot(memberRef, (snap) => {
        setMyMemberships((prev) => ({
          ...prev,
          [conf.id]: snap.exists() ? snap.data() : null,
        }));
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }, [user, conferences]);

  const { upcoming, past, pending, discover } = useMemo(() => {
    const upcoming = [];
    const past = [];
    const pending = [];
    const discover = [];

    conferences.forEach((conf) => {
      const membership = myMemberships[conf.id];
      const isPast = conf.endDate < today;

      if (membership?.status === "pending") {
        pending.push(conf);
      } else if (membership?.status === "approved") {
        if (isPast) past.push(conf);
        else upcoming.push(conf);
      } else if (conf.visibility === "public" && !membership) {
        discover.push(conf);
      }
    });

    // Sort upcoming by startDate ascending, past by endDate descending
    upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
    past.sort((a, b) => b.endDate.localeCompare(a.endDate));
    discover.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return { upcoming, past, pending, discover };
  }, [conferences, myMemberships, today]);

  const handleApply = async () => {
    if (!applyModal) return;
    setApplying(true);
    try {
      const nextColorIndex = Object.keys(myMemberships).length % 6;
      await setDoc(
        doc(db, "conferences", applyModal.confId, "members", user.uid),
        {
          role: "member",
          status: "pending",
          attendanceMode,
          colorIndex: nextColorIndex,
          appliedAt: serverTimestamp(),
        }
      );
      setApplyModal(null);
      setAttendanceMode("onsite");
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const handleJoinByCode = async () => {
    setJoinError("");
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    const match = conferences.find(
      (c) => c.visibility === "private" && c.joinCode === code
    );
    if (!match) {
      setJoinError("Invalid join code");
      return;
    }

    setApplyModal({ confId: match.id, confName: match.name });
    setJoinCode("");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const ConferenceCard = ({ conf, membership, showApply = false }) => (
    <div className="bg-surface-container-lowest p-4 mb-2">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-headline text-on-surface font-bold text-base">
            {membership?.status === "approved" ? (
              <Link
                to={`/conference/${conf.id}`}
                className="text-on-surface hover:text-primary transition-colors"
              >
                {conf.name}
              </Link>
            ) : (
              conf.name
            )}
          </h3>
          <p className="text-secondary text-xs mt-1">
            {conf.startDate} — {conf.endDate}
          </p>
          {conf.description && (
            <p className="text-secondary text-sm mt-2 line-clamp-2">{conf.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {membership?.status === "approved" && (
            <span className="text-xs px-2 py-0.5 bg-[#27AE60]/10 text-[#27AE60] uppercase tracking-wider">
              {membership.attendanceMode}
            </span>
          )}
          {membership?.status === "pending" && (
            <span className="text-xs px-2 py-0.5 bg-[#E67E22]/10 text-[#E67E22] uppercase tracking-wider">
              Pending Approval
            </span>
          )}
          {membership?.role === "admin" && (
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary uppercase tracking-wider">
              Admin
            </span>
          )}
        </div>
      </div>
      {showApply && !membership && (
        <button
          onClick={() => setApplyModal({ confId: conf.id, confName: conf.name })}
          className="mt-3 bg-primary text-on-primary px-4 py-2 text-xs font-headline
            uppercase tracking-wider hover:bg-primary-container transition-colors duration-50"
        >
          Apply to Join
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-primary p-4 flex justify-between items-center">
        <h1 className="font-headline text-on-primary text-xl font-bold tracking-tight">
          CONFERENCEFLOW
        </h1>
        <div className="flex items-center gap-4">
          {isSuperAdmin && (
            <Link
              to="/super-admin"
              className="text-on-primary/70 text-xs uppercase tracking-wider hover:text-on-primary"
            >
              Admin Panel
            </Link>
          )}
          <span className="text-on-primary/70 text-sm">{userProfile?.displayName}</span>
          <button
            onClick={handleSignOut}
            className="text-on-primary/70 text-xs uppercase tracking-wider hover:text-on-primary"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* My Conferences */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-5 bg-primary inline-block"></span>
            <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
              My Conferences
            </h2>
          </div>

          {upcoming.length === 0 && (
            <p className="text-secondary text-sm">No upcoming conferences. Browse the discover section below to join one.</p>
          )}
          {upcoming.map((conf) => (
            <ConferenceCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} />
          ))}
        </section>

        {/* Pending Applications */}
        {pending.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 bg-[#E67E22] inline-block"></span>
              <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
                Pending Applications
              </h2>
            </div>
            {pending.map((conf) => (
              <ConferenceCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} />
            ))}
          </section>
        )}

        {/* Past Conferences Toggle */}
        <section className="mb-8">
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-2 text-secondary text-sm hover:text-on-surface transition-colors"
          >
            <span>{showPast ? "▼" : "▶"}</span>
            <span className="uppercase tracking-wider">Past Conferences ({past.length})</span>
          </button>
          {showPast && past.length > 0 && (
            <div className="mt-3">
              {past.map((conf) => (
                <ConferenceCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} />
              ))}
            </div>
          )}
        </section>

        {/* Discover */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-5 bg-primary inline-block"></span>
            <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
              Discover
            </h2>
          </div>

          {/* Join by code */}
          <div className="bg-surface-container-lowest p-4 mb-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Join Private Conference
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Enter join code"
                className="w-full bg-surface-container-high p-2 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
              />
            </div>
            <button
              onClick={handleJoinByCode}
              className="bg-surface-container px-4 py-2 text-secondary text-xs
                uppercase tracking-wider hover:text-on-surface transition-colors"
            >
              Join
            </button>
          </div>
          {joinError && (
            <div className="bg-primary/10 text-primary text-sm p-2 mb-3">{joinError}</div>
          )}

          {discover.length === 0 && (
            <p className="text-secondary text-sm">No public conferences available to join.</p>
          )}
          {discover.map((conf) => (
            <ConferenceCard key={conf.id} conf={conf} showApply />
          ))}
        </section>
      </div>

      {/* Apply Modal */}
      {applyModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setApplyModal(null)}
        >
          <div
            className="bg-surface-container-lowest p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline text-on-surface font-bold text-base mb-1">
              Apply to Join
            </h3>
            <p className="text-secondary text-sm mb-4">{applyModal.confName}</p>

            <div className="mb-4">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-2">
                Attendance Mode
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setAttendanceMode("onsite")}
                  className={`flex-1 p-3 text-sm font-headline uppercase tracking-wider
                    ${attendanceMode === "onsite"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-secondary hover:text-on-surface"
                    } transition-colors duration-50`}
                >
                  Onsite
                </button>
                <button
                  onClick={() => setAttendanceMode("online")}
                  className={`flex-1 p-3 text-sm font-headline uppercase tracking-wider
                    ${attendanceMode === "online"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-secondary hover:text-on-surface"
                    } transition-colors duration-50`}
                >
                  Online
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setApplyModal(null)}
                className="flex-1 bg-surface-container p-2 text-secondary text-sm
                  uppercase tracking-wider hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex-1 bg-primary text-on-primary p-2 text-sm font-headline
                  uppercase tracking-wider hover:bg-primary-container transition-colors duration-50
                  disabled:opacity-50"
              >
                {applying ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/Dashboard.jsx
git commit -m "feat: add Dashboard page with conference list, join flow, and discover"
```

---

## Task 16: Update Router with New Routes

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Update main.jsx with new routes and AuthProvider**

Replace the entire content of `src/main.jsx`:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";
import { inject } from "@vercel/analytics";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import AuthGuard from "./components/AuthGuard";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import Dashboard from "./components/Dashboard";
import App from "./App";
import DailyReport from "./DailyReport";
import ConferenceReport from "./ConferenceReport";
import ReportList from "./ReportList";
import ViewReport from "./ViewReport";

inject();

function ReportRouter({ viewMode = false }) {
  const { reportId } = useParams();
  if (reportId.startsWith("summary-")) {
    return <ConferenceReport />;
  }
  return <DailyReport viewMode={viewMode} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/view/:date/:fileId" element={<ViewReport />} />
          <Route path="/view/report/:reportId" element={<ReportRouter viewMode />} />

          {/* Authenticated routes */}
          <Route path="/dashboard" element={
            <AuthGuard><Dashboard /></AuthGuard>
          } />

          {/* Conference-scoped routes (legacy paths still work for now) */}
          <Route path="/conference/:confId" element={
            <AuthGuard><App /></AuthGuard>
          } />
          <Route path="/conference/:confId/reports" element={
            <AuthGuard><ReportList /></AuthGuard>
          } />
          <Route path="/conference/:confId/report/:reportId" element={
            <AuthGuard><ReportRouter /></AuthGuard>
          } />

          {/* Legacy routes redirect to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
          <Route path="/report/:reportId" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 2: Verify the app builds without errors**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
npm run dev
```

Expected: App starts. Navigating to `/` redirects to `/dashboard`, which redirects to `/login` (not authenticated).

- [ ] **Step 3: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/main.jsx
git commit -m "feat: update router with auth routes, dashboard, and conference-scoped paths"
```

---

## Task 17: Enable Firebase Auth Providers in Console

**Files:** None (Firebase Console configuration)

- [ ] **Step 1: Enable Email/Password auth**

Go to Firebase Console → Authentication → Sign-in method → Add provider → Email/Password → Enable → Save.

- [ ] **Step 2: Enable Google auth**

Go to Firebase Console → Authentication → Sign-in method → Add provider → Google → Enable → Set project support email → Save.

- [ ] **Step 3: Add localhost to authorized domains**

Go to Firebase Console → Authentication → Settings → Authorized domains → Ensure `localhost` is listed (it should be by default).

- [ ] **Step 4: Test sign-up flow manually**

Open the app at `http://localhost:5173/register`. Create a test account with email/password. Verify:
1. Account appears in Firebase Console → Authentication → Users
2. User profile doc created in Firestore → `users/{uid}`
3. Redirected to `/dashboard` after sign-up

- [ ] **Step 5: Test Google sign-in**

On the login page, click "Sign in with Google". Verify the same as above.

---

## Task 18: Create First Super Admin

**Files:** None (one-time manual step)

- [ ] **Step 1: Identify your user's UID**

After signing up in Task 17, go to Firebase Console → Authentication → Users. Copy your UID.

- [ ] **Step 2: Set super_admin role via Firestore Console**

Go to Firebase Console → Firestore → `users/{your-uid}` → Edit → Set `globalRole` field to `"super_admin"`.

- [ ] **Step 3: Set custom claims via the API**

With the Next.js API running locally, use the API to set custom claims. Since we need a token first, we can use the Firebase Admin SDK directly. Create a one-time script at `conference-api/scripts/set-super-admin.js`:

```javascript
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
```

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
npm install dotenv
node scripts/set-super-admin.js YOUR_UID_HERE
```

Expected: `Set super_admin claims for user <uid>`

- [ ] **Step 4: Verify by signing out and back in**

Sign out in the app, sign back in. The custom claims refresh on next token fetch. Dashboard should show "Admin Panel" link in the header.

- [ ] **Step 5: Commit the script**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add scripts/set-super-admin.js
git commit -m "feat: add one-time script to set super_admin custom claims"
```

---

## Task 19: Scope Existing Components to Conference

**Files:**
- Modify: `src/App.jsx` (first ~30 lines of auth + data loading)

This task updates App.jsx to read from conference-scoped subcollections instead of top-level collections. Only the data-fetching hooks change — the rendering logic stays the same.

- [ ] **Step 1: Update App.jsx to use confId from route params**

At the top of `src/App.jsx`, find the existing anonymous auth and top-level collection listeners. Replace them with conference-scoped versions.

Find and replace the auth useEffect (around line 50-55):

```jsx
// FIND THIS:
useEffect(() => {
  signInAnonymously(auth).catch(console.error);
  return onAuthStateChanged(auth, u => setUser(u));
}, []);

// REPLACE WITH:
// Auth is now handled by AuthContext — just get the user from there
```

Add `useParams` import and extract confId:

```jsx
import { useParams, Link } from "react-router-dom";
// ... at top of component:
const { confId } = useParams();
```

Update all Firestore collection references from:
- `collection(db, "members")` → `collection(db, "conferences", confId, "members")`
- `collection(db, "sessions")` → `collection(db, "conferences", confId, "sessions")`

Update the member data model — members now use `userId` as the doc ID with role/status/attendanceMode fields instead of the old {id, name, mode, colorIndex} structure. The `name` comes from the `users/{userId}` profile doc.

This is a significant refactor of App.jsx. The key changes are:
1. Remove `signInAnonymously` — auth comes from AuthContext
2. Add `confId` from `useParams()`
3. Change all `collection(db, "X")` to `collection(db, "conferences", confId, "X")`
4. Members: join `conferences/{confId}/members` with `users/{userId}` to get display names

- [ ] **Step 2: Verify the app still renders**

Navigate to `/conference/test-conf-id` (won't have data, but should not crash).

- [ ] **Step 3: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/App.jsx
git commit -m "refactor: scope App.jsx to conference subcollections"
```

---

## Task 20: Data Migration Script

**Files:**
- Create: `conference-api/scripts/migrate-to-multi-conference.js`

- [ ] **Step 1: Write migration script**

Write to `conference-api/scripts/migrate-to-multi-conference.js`:

```javascript
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
    // Old members had {id, name, mode, colorIndex}
    // New members use userId as doc ID with role/status/attendanceMode
    // Since old system had no real users, we store them as legacy members
    await db.collection("conferences").doc(CONF_ID)
      .collection("members").doc(data.id).set({
        role: "member",
        status: "approved",
        attendanceMode: data.mode || "onsite",
        colorIndex: data.colorIndex || 0,
        legacyName: data.name, // Preserve name since there's no users/ doc
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
```

- [ ] **Step 2: Run the migration**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
node scripts/migrate-to-multi-conference.js
```

Expected output:
```
Starting migration to multi-conference structure...
Creating conference: gtc-2026
Migrating N members...
Migrating N sessions...
Migrating N daily reports...
Migration complete!
Conference ID: gtc-2026
Old collections are preserved (not deleted). Remove them manually when ready.
```

- [ ] **Step 3: Verify in Firebase Console**

Check Firestore → `conferences/gtc-2026/sessions` — should contain the migrated sessions.
Check Firestore → `conferences/gtc-2026/dailyReports` — should contain the migrated reports.

- [ ] **Step 4: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/conference-api
git add scripts/migrate-to-multi-conference.js
git commit -m "feat: add data migration script for multi-conference structure"
```

---

## Task 21: End-to-End Smoke Test

- [ ] **Step 1: Start both servers**

```bash
# Terminal 1: Next.js API
cd /Users/eason/Documents/HW-Project/Conference/conference-api
npm run dev

# Terminal 2: React frontend
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
npm run dev
```

- [ ] **Step 2: Test full flow**

1. Open `http://localhost:5173` → should redirect to `/login`
2. Register a new account with email → should redirect to `/dashboard`
3. Dashboard shows "GTC 2026" in "Discover" section (if migration ran)
4. Click "Apply to Join" → select Onsite → Apply
5. Card moves to "Pending Applications"
6. Sign out, sign in as super_admin account
7. Verify "Admin Panel" link appears in dashboard header
8. Use API to approve the pending member:
   ```bash
   # Get the super_admin's token from browser DevTools:
   # Firebase Auth → currentUser.getIdToken()
   curl -X POST http://localhost:3000/api/conferences/gtc-2026/members/approve \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"userId": "<PENDING_USER_UID>"}'
   ```
9. Switch back to the other user → their "GTC 2026" should now be in "My Conferences"
10. Click the conference name → should open `/conference/gtc-2026` (the calendar/schedule view)

- [ ] **Step 3: Document any issues found**

Note any issues for follow-up fixes. Common issues at this stage:
- CSS conflicts between new and existing pages
- Missing `confId` in existing components (gradually fix in subsequent tasks)
- Legacy member format vs new member format in App.jsx

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Next.js project setup | `conference-api/*` | — |
| 2 | Firebase Admin init | `lib/firebase-admin.js` | — |
| 3 | Auth middleware | `lib/auth-middleware.js` | — |
| 4 | Conference CRUD API | `app/api/conferences/*` | — |
| 5 | Membership approval API | `app/api/.../approve,reject` | — |
| 6 | Set role API | `app/api/admin/set-role` | — |
| 7 | CORS config | `middleware.js` | `next.config.js` |
| 8 | Firebase Auth in frontend | — | `src/firebase.js` |
| 9 | AuthContext | `src/contexts/AuthContext.jsx` | — |
| 10 | API helper | `src/lib/api.js` | — |
| 11 | Login page | `src/components/LoginPage.jsx` | — |
| 12 | Register page | `src/components/RegisterPage.jsx` | — |
| 13 | AuthGuard | `src/components/AuthGuard.jsx` | — |
| 14 | Membership hook | `src/hooks/useMembership.js` | — |
| 15 | Dashboard page | `src/components/Dashboard.jsx` | — |
| 16 | Router update | — | `src/main.jsx` |
| 17 | Firebase Console config | — (manual) | — |
| 18 | Super admin setup | `scripts/set-super-admin.js` | — |
| 19 | Scope components to conf | — | `src/App.jsx` |
| 20 | Data migration | `scripts/migrate-to-multi-conference.js` | — |
| 21 | End-to-end smoke test | — | — |
