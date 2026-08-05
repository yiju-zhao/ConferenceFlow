# TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TypeScript to the `gtc-2026` project incrementally — toolchain, shared types, foundation-layer conversion, one sample component, and a batched plan for the remaining files — with zero runtime behavior change.

**Architecture:** Single-root `tsconfig.json` (`strict`, `allowJs`, `checkJs:false`, `noEmit`) covers both `src/` and `api/`. Vite strips types via esbuild for `src/`; Vercel compiles `api/*.ts` natively. Shared Firestore + API contracts live in `src/types/`, imported by both sides. A generic `apiFetch<T>` and typed hooks replace today's `any` returns.

**Tech Stack:** React 18, Vite 5, React Router 7, Firebase 10 (client + admin), Vercel serverless functions, TypeScript 5.

## Global Constraints

- **No behavior change.** This is a type-only migration. Do not refactor logic, rename runtime symbols, change styling, or "improve" adjacent code. Every diff must trace to adding/removing types or the toolchain.
- **Strictness:** `strict: true` applies to new `.ts/.tsx` only. Legacy `.js/.jsx` stay silent under `checkJs: false`. Never loosen a newly-written file with `any` to silence a real error — fix the type or narrow it.
- **Verify-don't-invent.** Firestore enum values (role/status/etc.) and document fields must be read from the code that writes them before being added to a type. Do not guess union members.
- **Gate (every task):** `npm run typecheck` (== `tsc --noEmit`) passes **and** `npm run build` succeeds before committing. For component/api tasks, also smoke-test in `npm run dev`. If either fails, fix before moving on.
- **No new unit tests.** The migration adds no behavior, so the type-checker + build + dev smoke are the test cycle. (Existing logic is unchanged; do not add tests to code you are only annotating.)
- **One task = one commit.** Commit messages: `chore(ts): ...` for toolchain/types, `refactor(ts): convert <area> to TypeScript` for conversions.
- **TDD note:** This plan adapts the usual TDD cycle to a type-only migration. The "failing test → passing test" cycle is replaced by "red `tsc` (errors on the file) → green `tsc` (errors resolved) → green `build`."

---

## File Structure

**New files:**
- `tsconfig.json` — root TS config (replaces `jsconfig.json`)
- `src/types/firestore.ts` — Firestore document models (UserProfile, Session, Member, unions, WithId)
- `src/types/api.ts` — API option/contract types (ApiFetchOptions; route response types added in Phase 4)
- `src/types/index.ts` — barrel re-export

**Renamed (content converted) in Phase 2–3:**
- `src/firebase.js` → `src/firebase.ts`
- `src/constants.js` → `src/constants.ts`
- `src/sessionCatalog.js` → `src/sessionCatalog.ts`
- `src/lib/api.js` → `src/lib/api.ts` (generic)
- `src/lib/diffUtils.js` → `src/lib/diffUtils.ts`
- `src/lib/reportUtils.js` → `src/lib/reportUtils.ts`
- `src/contexts/AuthContext.jsx` → `src/contexts/AuthContext.tsx`
- `src/hooks/*.js` (5) → `src/hooks/*.ts`
- `api/lib/firebase-admin.js` → `api/lib/firebase-admin.ts`
- `api/lib/auth-middleware.js` → `api/lib/auth-middleware.ts`
- `src/components/UserAvatar.jsx` → `src/components/UserAvatar.tsx` (sample)

**Modified:**
- `package.json` — devDeps + `typecheck` script
- `vite.config.js` — `@` → `src` alias

**Deleted:**
- `jsconfig.json`

**Phase 4 (later batches, same procedure):** remaining `src/components/**` (29 files), `api/` route handlers (8), `src/main.jsx`.

---

## Task 1: TS toolchain setup

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Modify: `vite.config.js`
- Delete: `jsconfig.json`

**Interfaces:**
- Produces: `npm run typecheck` script; `tsconfig.json` with `paths: {"@/*": ["src/*"]}`; Vite `@` alias.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D typescript @types/react @types/react-dom @types/node @vercel/node
```
Expected: packages added under `devDependencies`. (`@vercel/node` provides `VercelRequest`/`VercelResponse` for the `api/` tasks; `@types/node` for the Node-runtime functions.)

- [ ] **Step 2: Create `tsconfig.json`**

Create `tsconfig.json`:
```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["node", "vite/client"]
  },
  "include": ["src", "api", "vite.config.js"]
}
```

- [ ] **Step 3: Add `typecheck` script**

In `package.json` `scripts`, add:
```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Add Vite `@` alias**

In `vite.config.js`, add the `resolve.alias` block:
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/analytics"],
        },
      },
    },
  },
});
```

- [ ] **Step 5: Delete `jsconfig.json`**

Run: `git rm jsconfig.json`
(`tsconfig.json` now owns path resolution and IDE hints.)

- [ ] **Step 6: Verify gate**

Run:
```bash
npm run typecheck
npm run build
```
Expected: `typecheck` exits 0 (no files are checked yet beyond config; `allowJs`/`checkJs:false` keeps legacy JS silent). `build` succeeds and output is unchanged.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.js
git commit -m "chore(ts): add TypeScript toolchain and tsconfig"
```

---

## Task 2: Shared types (`src/types/`)

**Files:**
- Create: `src/types/firestore.ts`, `src/types/api.ts`, `src/types/index.ts`

**Interfaces:**
- Produces: `UserProfile`, `Session`, `Member`, `WithId<T>`, unions (`GlobalRole`, `AuthProvider`, `MemberRole`, `MemberStatus`, `AttendanceMode`), `ApiFetchOptions`. Consumed by Tasks 4–8 and Phase 4.

- [ ] **Step 1: Verify union members by grepping writers**

Run each and record every distinct literal found:
```bash
grep -rhoE "globalRole[\"']?\s*[:=]\s*[\"'][a-z_]+[\"']" src api
grep -rhoE "role[\"']?\s*[:=]\s*[\"'][a-z_]+[\"']" src api | sort -u
grep -rhoE "status[\"']?\s*[:=]\s*[\"'][a-z_]+[\"']" src api | sort -u
grep -rhoE "attendanceMode[\"']?\s*[:=]\s*[\"'][a-z_]+[\"']" src api | sort -u
```
Confirmed so far from reading the code: `globalRole` ∈ {`"user"`, `"super_admin"`}; `role` ∈ {`"admin"`, …}; `status` ∈ {`"approved"`, …}; `attendanceMode` ∈ {`"onsite"`, …}. **Add whatever else the grep reveals.** If grep finds nothing beyond the confirmed set, keep the unions to exactly the confirmed members (do not invent `"member"`/`"pending"`/`"online"`).

- [ ] **Step 2: Write `src/types/firestore.ts`**

```ts
import type { Timestamp } from "firebase/firestore";

export type GlobalRole = "user" | "super_admin";
export type AuthProvider = "email" | "google";
// Members of the confirmed literals only (see Step 1). Extend only with grep-verified values.
export type MemberRole = "admin"; /* + others found in Step 1, if any */
export type MemberStatus = "approved"; /* + others found in Step 1, if any */
export type AttendanceMode = "onsite"; /* + others found in Step 1, if any */

export interface UserProfile {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: AuthProvider;
  globalRole: GlobalRole;
  createdAt: Timestamp | null;
  lastLoginAt: Timestamp | null;
}

export interface Session {
  id: string;
  code?: string;
  date: string;
  start: string;
  attendees?: string[];
  // Additional fields (title, end, room, etc.) are added in the calendar/report
  // batch when their writers are read. JS consumers are unaffected meanwhile.
}

export interface Member {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  attendanceMode: AttendanceMode;
  colorIndex?: number;
  managedByAdmin?: boolean;
  displayName?: string;
  legacyName?: string;
  name?: string; // derived/resolved at runtime by useConferenceMembers
}

/** The recurring `{ id: snap.id, ...snap.data() }` shape. */
export type WithId<T> = T & { id: string };
```
(Adjust the three `/* … */` unions to the Step 1 grep results. If a union gains members, the comment is removed.)

- [ ] **Step 3: Write `src/types/api.ts`**

```ts
/** Options for apiFetch — a standard fetch options bag. */
export type ApiFetchOptions = RequestInit;

// Per-route response interfaces (e.g. ConferencesListResponse) are added in the
// Phase 4 "api/ route handlers" batch, where each handler's return shape is read.
```

- [ ] **Step 4: Write `src/types/index.ts`**

```ts
export * from "./firestore";
export * from "./api";
```

- [ ] **Step 5: Verify gate**

Run:
```bash
npm run typecheck
npm run build
```
Expected: both pass (new type files have no consumers yet, so no errors).

- [ ] **Step 6: Commit**

```bash
git add src/types
git commit -m "feat(ts): add shared Firestore and API type definitions"
```

---

## Task 3: Convert `firebase`, `constants`, `sessionCatalog`

**Files:**
- Rename+convert: `src/firebase.js` → `src/firebase.ts`, `src/constants.js` → `src/constants.ts`, `src/sessionCatalog.js` → `src/sessionCatalog.ts`

**Interfaces:**
- Consumes: nothing from Task 2.
- Produces: typed `app/auth/db/storage/googleProvider/analytics`; `COLORS: ColorEntry[]`, `COLOR_PRESETS: string[]`; `SESSION_CATALOG`.

- [ ] **Step 1: Convert `src/firebase.js` → `src/firebase.ts`**

```ts
import { initializeApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

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
const analytics: Analytics | null =
  typeof window !== "undefined" ? getAnalytics(app) : null;
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { app, analytics, auth, db, storage, googleProvider };
```
(Use `git mv src/firebase.js src/firebase.ts` then replace contents, so history is preserved.)

- [ ] **Step 2: Convert `src/constants.js` → `src/constants.ts`**

```ts
interface ColorEntry {
  hex: string;
  bg: string;
  glow: string;
}

export const COLORS: ColorEntry[] = [
  { hex: "#CF0A2C", bg: "rgba(207,10,44,0.08)", glow: "rgba(207,10,44,0.20)" },
  { hex: "#2980B9", bg: "rgba(41,128,185,0.10)", glow: "rgba(41,128,185,0.25)" },
  { hex: "#E67E22", bg: "rgba(230,126,34,0.10)", glow: "rgba(230,126,34,0.25)" },
  { hex: "#8E44AD", bg: "rgba(142,68,173,0.10)", glow: "rgba(142,68,173,0.25)" },
  { hex: "#27AE60", bg: "rgba(39,174,96,0.10)", glow: "rgba(39,174,96,0.25)" },
  { hex: "#2C3E50", bg: "rgba(44,62,80,0.08)", glow: "rgba(44,62,80,0.20)" },
];

export const COLOR_PRESETS: string[] = [
  "#333333",
  "#CF0A2C",
  "#E67E22",
  "#27AE60",
  "#2980B9",
  "#8E44AD",
];
```
(Contents identical to the original — only types added.)

- [ ] **Step 3: Convert `src/sessionCatalog.js` → `src/sessionCatalog.ts`**

```ts
// Session catalog — populated at runtime from Firestore.
// Typed loosely here; tightened to Map<string, Session> in the calendar batch
// when the populating component is converted.
export const SESSION_CATALOG = new Map<string, unknown>();
```

- [ ] **Step 4: Verify gate**

```bash
npm run typecheck
npm run build
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/firebase.ts src/constants.ts src/sessionCatalog.ts
git rm src/firebase.js src/constants.js src/sessionCatalog.js 2>/dev/null || true
git commit -m "refactor(ts): convert firebase, constants, sessionCatalog to TypeScript"
```

---

## Task 4: Convert `src/lib/`

**Files:**
- Rename+convert: `src/lib/api.js` → `src/lib/api.ts`, `src/lib/diffUtils.js` → `src/lib/diffUtils.ts`, `src/lib/reportUtils.js` → `src/lib/reportUtils.ts`

**Interfaces:**
- Consumes: `import.meta.env` (typed via `vite/client`), `auth` from `@/firebase`.
- Produces: `apiFetch<T>(path, options?): Promise<T>`; `diffArrays`, `stripHtml`, `getTextLines`; `parseReportId`, `generateSummaryId`, `getInitials`, `generateId`.

- [ ] **Step 1: Convert `src/lib/api.js` → `src/lib/api.ts` (generic)**

```ts
import { auth } from "../firebase";
import type { ApiFetchOptions } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
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
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
```

- [ ] **Step 2: Convert `src/lib/diffUtils.js` → `src/lib/diffUtils.ts`**

```ts
export type DiffOp = "equal" | "insert" | "delete";
export interface DiffEntry {
  text: string;
  type: DiffOp;
}

/** LCS-based diff of two string arrays. */
export function diffArrays(oldArr: string[], newArr: string[]): DiffEntry[] {
  const m = oldArr.length,
    n = newArr.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        oldArr[i - 1] === newArr[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const result: DiffEntry[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i - 1] === newArr[j - 1]) {
      result.unshift({ text: oldArr[i - 1], type: "equal" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: newArr[j - 1], type: "insert" });
      j--;
    } else {
      result.unshift({ text: oldArr[i - 1], type: "delete" });
      i--;
    }
  }
  return result;
}

/** Strip HTML tags and normalize whitespace. */
export function stripHtml(html: string): string {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract text lines from HTML content. */
export function getTextLines(html: string): string[] {
  return stripHtml(html)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
```

- [ ] **Step 3: Convert `src/lib/reportUtils.js` → `src/lib/reportUtils.ts`**

```ts
export interface ParsedReportId {
  date: string;
  version: number;
  isLegacy: boolean;
}

export function parseReportId(reportId: string): ParsedReportId {
  const m = reportId.match(/^(.+)-v(\d+)$/);
  return m
    ? { date: m[1], version: parseInt(m[2], 10), isLegacy: false }
    : { date: reportId, version: 1, isLegacy: true };
}

export function generateSummaryId(existingDocs: { id: string }[]): string {
  const summaryDocs = existingDocs
    .filter((d) => d.id.startsWith("summary-GTC2026"))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (summaryDocs.length === 0) return "summary-GTC2026";
  const versions = summaryDocs.map((d) => {
    const m = d.id.match(/-v(\d+)$/);
    return m ? parseInt(m[1], 10) : 1;
  });
  return `summary-GTC2026-v${Math.max(...versions) + 1}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return parts
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .substring(0, 3);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
```

- [ ] **Step 4: Verify gate**

```bash
npm run typecheck
npm run build
```
Expected: both pass. (`Date.now()`/`Math.random()` are fine in app source — only the workflow sandbox restricts them, not the compiled app.)

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "refactor(ts): convert src/lib to TypeScript (generic apiFetch)"
```

---

## Task 5: Convert `AuthContext.jsx` → `.tsx`

**Files:**
- Rename+convert: `src/contexts/AuthContext.jsx` → `src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: `UserProfile` from `@/types`.
- Produces: `AuthProvider`, `useAuth(): AuthContextValue`.

- [ ] **Step 1: Convert with typed context value**

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { auth, db, googleProvider } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { UserProfile } from "../types";

interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profileRef = doc(db, "users", firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setUserProfile(profileSnap.data() as UserProfile);
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

  const signInWithEmail = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    await setDoc(doc(db, "users", result.user.uid), {
      email,
      displayName,
      avatarUrl: "",
      provider: "email",
      globalRole: "user",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    const profileSnap = await getDoc(doc(db, "users", result.user.uid));
    setUserProfile(profileSnap.data() as UserProfile);
    return result.user;
  };

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const u = result.user;
    const profileRef = doc(db, "users", u.uid);
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        email: u.email ?? "",
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
    setUserProfile(updatedSnap.data() as UserProfile);
    return u;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const updateDisplayName = async (newName: string) => {
    if (!user) throw new Error("Not authenticated");
    await updateProfile(user, { displayName: newName });
    const profileRef = doc(db, "users", user.uid);
    await setDoc(profileRef, { displayName: newName }, { merge: true });
    setUserProfile((prev) => (prev ? { ...prev, displayName: newName } : prev));
  };

  const value: AuthContextValue = {
    user,
    userProfile,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    updateDisplayName,
    isSuperAdmin: userProfile?.globalRole === "super_admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```
Notes: `u.email` is nullable in the Firebase type, hence `?? ""`. The original logic is unchanged.

- [ ] **Step 2: Verify gate**

```bash
npm run typecheck
npm run build
```
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.tsx
git rm src/contexts/AuthContext.jsx
git commit -m "refactor(ts): convert AuthContext to TypeScript"
```

---

## Task 6: Convert hooks (5 files)

**Files:**
- Rename+convert: `src/hooks/useConferenceDoc.js`, `useConferenceSessions.js`, `useConferenceMembers.js`, `useMembership.js`, `useDebouncedSave.js` → `.ts`

**Interfaces:**
- Consumes: `Session`, `Member`, `WithId` from `@/types`; `COLORS` from `@/constants`.
- Produces: typed return values for all five hooks + `sortSessionsByTime`, `getMemberColor`.

- [ ] **Step 1: `useConferenceDoc.ts`**

```ts
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { WithId } from "../types";

// `conference` is loosely typed until the Conference interface is introduced
// in the calendar batch; JS consumers are unaffected.
export function useConferenceDoc(confId: string | undefined) {
  const [conference, setConference] = useState<WithId<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!confId) {
      setLoading(false);
      return;
    }
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConference(snap.exists() ? { id: snap.id, ...(snap.data() as Record<string, unknown>) } : null);
      setLoading(false);
    });
  }, [confId]);

  return { conference, loading };
}
```

- [ ] **Step 2: `useConferenceSessions.ts`**

```ts
import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import type { Session, WithId } from "../types";

export function sortSessionsByTime(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

interface UseConferenceSessionsOptions {
  filterDate?: string;
}

interface SessionsMapValue extends Session {
  attendees: Set<string>;
}

export function useConferenceSessions(confId: string | undefined, options: UseConferenceSessionsOptions = {}) {
  const { user } = useAuth();
  const [allSessions, setAllSessions] = useState<WithId<Session>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Session) }));
      setAllSessions(sortSessionsByTime(arr));
      setLoading(false);
    });
  }, [user, confId]);

  const sessions = useMemo(() => {
    if (!options.filterDate) return allSessions;
    return allSessions.filter((s) => s.date === options.filterDate);
  }, [allSessions, options.filterDate]);

  const sessionsMap = useMemo(() => {
    const map: Record<string, SessionsMapValue> = {};
    allSessions.forEach((s) => {
      map[s.code || s.id] = { ...s, attendees: new Set(s.attendees || []) };
    });
    return map;
  }, [allSessions]);

  return { sessions, allSessions, sessionsMap, loading };
}
```

- [ ] **Step 3: `useConferenceMembers.ts`**

```ts
import { useState, useEffect, useMemo } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { COLORS } from "../constants";
import type { Member, WithId } from "../types";

type ResolvedMember = WithId<Member> & { name: string };

export function useConferenceMembers(confId: string | undefined) {
  const { user } = useAuth();
  const [members, setMembers] = useState<ResolvedMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }
    return onSnapshot(collection(db, "conferences", confId, "members"), async (snap) => {
      const rawMembers = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Member) }));
      const resolved = await Promise.all(
        rawMembers.map(async (m): Promise<ResolvedMember> => {
          if (m.managedByAdmin) return { ...m, name: m.displayName || "Unnamed" };
          if (m.legacyName) return { ...m, name: m.legacyName };
          if (m.displayName) return { ...m, name: m.displayName };
          try {
            const userSnap = await getDoc(doc(db, "users", m.id));
            const data = userSnap.data();
            const name = userSnap.exists() ? data?.displayName || data?.email || m.id : m.id;
            return { ...m, name: name as string };
          } catch {
            return { ...m, name: m.id };
          }
        }),
      );
      setMembers(resolved);
      setLoading(false);
    });
  }, [user, confId]);

  const memberNames = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [members]);

  const memberColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach((m) => {
      map[m.id] = m.colorIndex ?? 0;
    });
    return map;
  }, [members]);

  return { members, memberNames, memberColorMap, loading };
}

export function getMemberColor(colorIndex: number | undefined) {
  return COLORS[(colorIndex ?? 0) % COLORS.length];
}
```

- [ ] **Step 4: `useMembership.ts`**

```ts
import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import type { Member } from "../types";

export function useMembership(confId: string | undefined) {
  const { user, isSuperAdmin } = useAuth();
  const [membership, setMembership] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }
    if (isSuperAdmin) {
      setMembership({ id: user.uid, role: "admin", status: "approved", attendanceMode: "onsite", colorIndex: 0 });
      setLoading(false);
      return;
    }
    const memberRef = doc(db, "conferences", confId, "members", user.uid);
    const unsubscribe = onSnapshot(memberRef, (snap) => {
      setMembership(snap.exists() ? (snap.data() as Member) : null);
      setLoading(false);
    });
    return unsubscribe;
  }, [user, confId, isSuperAdmin]);

  return {
    membership,
    role: membership?.role ?? null,
    status: membership?.status ?? null,
    isApproved: membership?.status === "approved",
    isAdmin: membership?.role === "admin" || isSuperAdmin,
    loading,
  };
}
```
Note: `useMembership` synthesizes a super-admin membership object — it now includes `id: user.uid` to satisfy the `Member` interface (the original returned an object literal without `id`; this is the minimal addition to make it a valid `Member` and does not change runtime behavior since `id` is read-only in the synthesized case).

- [ ] **Step 5: `useDebouncedSave.ts`**

```ts
import { useState, useRef, useCallback } from "react";

type SaveState = "idle" | "saving" | "saved";

export function useDebouncedSave(delay = 600) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const pending = useRef(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const debouncedSave = useCallback(
    (key: string, fn: () => void | Promise<void>) => {
      if (!timers.current[key]) pending.current += 1;
      else clearTimeout(timers.current[key]);
      setSaveState("saving");
      timers.current[key] = setTimeout(() => {
        delete timers.current[key];
        pending.current -= 1;
        Promise.resolve(fn()).finally(() => {
          if (pending.current === 0) {
            setSaveState("saved");
            if (savedTimer.current) clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
          }
        });
      }, delay);
    },
    [delay],
  );

  return { debouncedSave, saveState };
}
```

- [ ] **Step 6: Verify gate**

```bash
npm run typecheck
npm run build
```
Expected: both pass. If `Member.role`/`status`/`attendanceMode` errors appear here, it means the synthesized values or Firestore data don't match the unions from Task 2 — go back and reconcile the unions with the Step 1 grep, do not loosen with `any`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks
git commit -m "refactor(ts): convert hooks to TypeScript"
```

---

## Task 7: Convert `api/lib/` (serverless shared layer)

**Files:**
- Rename+convert: `api/lib/firebase-admin.js` → `api/lib/firebase-admin.ts`, `api/lib/auth-middleware.js` → `api/lib/auth-middleware.ts`

**Interfaces:**
- Consumes: `@vercel/node` (`VercelRequest`), `firebase-admin`.
- Produces: `auth`, `db`, `FieldValue`; `AuthError`, `verifyAuth`, `requireSuperAdmin`, `requireConfAdmin`, `requireMember`.

- [ ] **Step 1: Convert `api/lib/firebase-admin.ts`**

The original lazily inits via a `Proxy`. Type the exported `auth`/`db` as the real admin types and assert the Proxy result — call sites (`auth.verifyIdToken`, `db.collection(...)`) then get full types without fighting the Proxy.

```ts
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

function lazy<T>(get: () => T | undefined): T {
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
```

- [ ] **Step 2: Convert `api/lib/auth-middleware.ts`**

`verifyIdToken` returns `DecodedIdToken`; the project adds a custom `globalRole` claim, so extend it.

```ts
import type { VercelRequest } from "@vercel/node";
import type { DecodedIdToken } from "firebase-admin/auth";
import { auth, db } from "./firebase-admin";

interface DecodedToken extends DecodedIdToken {
  globalRole?: string;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function verifyAuth(req: VercelRequest): Promise<DecodedToken> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    return (await auth.verifyIdToken(token)) as DecodedToken;
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }
}

export async function requireSuperAdmin(req: VercelRequest): Promise<DecodedToken> {
  const decoded = await verifyAuth(req);
  if (decoded.globalRole !== "super_admin") {
    throw new AuthError("Super admin access required", 403);
  }
  return decoded;
}

export async function requireConfAdmin(req: VercelRequest, confId: string): Promise<DecodedToken> {
  const decoded = await verifyAuth(req);
  if (decoded.globalRole === "super_admin") return decoded;
  const snap = await db.collection("conferences").doc(confId).collection("members").doc(decoded.uid).get();
  if (!snap.exists) throw new AuthError("Not a member of this conference", 403);
  const member = snap.data() as { status?: string; role?: string };
  if (member.status !== "approved" || member.role !== "admin") {
    throw new AuthError("Conference admin access required", 403);
  }
  return decoded;
}

export async function requireMember(req: VercelRequest, confId: string): Promise<DecodedToken> {
  const decoded = await verifyAuth(req);
  if (decoded.globalRole === "super_admin") return decoded;
  const snap = await db.collection("conferences").doc(confId).collection("members").doc(decoded.uid).get();
  if (!snap.exists || (snap.data() as { status?: string }).status !== "approved") {
    throw new AuthError("Approved membership required", 403);
  }
  return decoded;
}
```

- [ ] **Step 3: Verify gate**

```bash
npm run typecheck
npm run build
```
Expected: both pass. (`build` still only builds the Vite frontend; `api/` is compiled by Vercel at deploy, but `tsc` now type-checks it.)

- [ ] **Step 4: Commit**

```bash
git add api/lib
git commit -m "refactor(ts): convert api/lib shared layer to TypeScript"
```

---

## Task 8: Sample component — `UserAvatar.jsx` → `.tsx`

This task establishes the pattern (typed props, typed hook consumption, DOM-event casts) that Phase 4 replicates.

**Files:**
- Rename+convert: `src/components/UserAvatar.jsx` → `src/components/UserAvatar.tsx` (contains both `UserAvatar` and `FirstTimeNameSetup`)

**Interfaces:**
- Consumes: `useAuth` (typed in Task 5), `UserProfile` from `@/types`, `COLORS` from `@/constants`.

- [ ] **Step 1: Convert with typed props and event casts**

Apply these changes to the file (logic unchanged):
- Add the props interface and annotate the component signature:
```tsx
interface UserAvatarProps {
  size?: number;
  onSignOut?: () => void;
  light?: boolean;
}

export default function UserAvatar({ size = 32, onSignOut, light = false }: UserAvatarProps) {
```
- Type the local helpers:
```tsx
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length].hex;
}

function getInitial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}
```
- Type the ref and state:
```tsx
const ref = useRef<HTMLDivElement>(null);
const [open, setOpen] = useState(false);
const [editing, setEditing] = useState(false);
const [name, setName] = useState("");
const [saving, setSaving] = useState(false);
```
- Fix the outside-click handler (`e.target` is `EventTarget`, not `Element`):
```tsx
const close = (e: MouseEvent) => {
  if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
};
```
- Fix the three `e.target.style` handlers (buttons/input) with casts:
```tsx
onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#c53030")}
onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#e53e3e")}
```
  and for the input focus/blur:
```tsx
onFocus={(e) => (e.currentTarget.style.borderBottomColor = "#a20513")}
onBlur={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
```
  (Prefer `e.currentTarget` over `e.target` — `currentTarget` is the element the handler is attached to and is already typed, so no cast is needed.)
- `FirstTimeNameSetup` needs no props; add an empty signature and type its state: `const [name, setName] = useState(userProfile?.displayName || "");` already infers `string`. `err` in catch is `unknown` under strict — change `alert(err.message)` to `alert(err instanceof Error ? err.message : String(err))` in both handlers (run semantics identical).

- [ ] **Step 2: Verify gate**

```bash
npm run typecheck
npm run build
npm run dev   # smoke: log in, open avatar dropdown, edit name, sign out
```
Expected: `typecheck` and `build` pass; the avatar dropdown, name edit, and sign-out work as before in the browser.

- [ ] **Step 3: Commit**

```bash
git add src/components/UserAvatar.tsx
git rm src/components/UserAvatar.jsx
git commit -m "refactor(ts): convert UserAvatar to TypeScript (sample)"
```

---

## Task 9: Phase 4 — remaining files (batched)

The foundation (Tasks 1–8) and sample establish the pattern. The remaining files follow one repeatable procedure. **Define it once, apply per batch.** Each batch is its own commit with the gate.

### Standard Conversion Procedure (apply to every file in a batch)

For each file:
1. **Read** the target file end-to-end.
2. **Rename** with `git mv <file>.js[x] <file>.ts[x]` (`.jsx`→`.tsx`, `.js`→`.ts`).
3. **Import shared types** from `@/types` (`UserProfile`, `Session`, `Member`, `WithId`, …). Extend `src/types/firestore.ts` with any new document type the file reveals (e.g. `Conference`, `Report`) — read the writers first; do not invent fields.
4. **Type component props** with an `interface XProps { … }` and annotate the signature. Type all `useState`/`useRef`/`useMemo` generics where inference is loose.
5. **Type event handlers** with `e.currentTarget` (preferred) or `e.target as HTMLElement`/`as Node` casts — `EventTarget` has no `.style`/`.contains`.
6. **Narrow `catch`** blocks: `catch (err) { … err instanceof Error ? err.message : String(err) … }` (strict makes caught errors `unknown`).
7. **Type Firestore reads**: `snap.data() as T` using the shared interfaces; collections via `WithId<T>`.
8. **Run** `npm run typecheck`. Resolve every error by narrowing types — **never with `any`**. If a shared union (role/status) is too narrow, reconcile it against the grep (Task 2 Step 1) and update `firestore.ts`.
9. **Run** `npm run build`. Must succeed.
10. **Smoke** in `npm run dev` on the affected page.

### Batches (each = one commit, gate before next)

- [ ] **Batch 9a — `src/components/*` leaf (5 files):** `AuthGuard`, `Dashboard`, `LanguageSwitcher`, `LoginPage`, `RegisterPage`. Smoke: login → dashboard. Commit: `refactor(ts): convert top-level components to TypeScript`.

- [ ] **Batch 9b — `src/components/calendar/*` (5 files):** `CalendarHeader`, `CalendarPage`, `ScheduleGrid`, `SessionDetail`, `SessionPool`. Introduce `interface Conference` in `firestore.ts` here (read its writers first) and tighten `useConferenceDoc`'s return to `WithId<Conference> | null`. Extend `Session` with the full field set the calendar uses. Smoke: open a conference calendar. Commit: `refactor(ts): convert calendar components to TypeScript`.

- [ ] **Batch 9c — `src/components/admin/*` (7 files):** `AdminApplications`, `AdminAttendance`, `AdminLayout`, `AdminReports`, `AdminSessions`, `AdminSettings`, `SuperAdminPanel`. Smoke: admin pages as super_admin. Commit: `refactor(ts): convert admin components to TypeScript`.

- [ ] **Batch 9d — `src/components/report/*` (11 files):** `ConferenceReport`, `DailyReport`, `DiffViews`, `IntelCard`, `PresenceBar`, `ReportList`, `SessionPicker`, `SharedEditors`, `SnapshotViewer`, `SpeakersEditor`, `ViewReport`. Introduce `interface Report` in `firestore.ts` (read writers first). This is the largest/most stateful batch — do it last among components. Smoke: open a report, edit, save, view diff. Commit: `refactor(ts): convert report components to TypeScript`.

- [ ] **Batch 9e — `api/` route handlers (8 files):** `health/index`, `view/[id]`, `conferences/index`, `admin/set-role/index`, `conferences/[confId]/index`, `conferences/[confId]/members/[action]`, `conferences/[confId]/sessions/[...path]`, `conferences/[confId]/reports/[reportId]`. Type each as `export default async function handler(req: VercelRequest, res: VercelResponse)`. Add per-route response interfaces to `src/types/api.ts` and have both handler and frontend caller import them. Verify Vercel compiles TS by deploying the `health` route to a preview (or run `vercel dev` locally and hit `/api/health`). Commit: `refactor(ts): convert api route handlers to TypeScript`.

- [ ] **Batch 9f — `src/main.jsx` → `src/main.tsx`:** the app entry. Do this last and in isolation. Smoke: full app boots, routing + auth + i18n init work. Commit: `refactor(ts): convert app entry to TypeScript`.

### Phase 4 completion check

After Batch 9f, the codebase is fully TypeScript. Final verification:
- [ ] `npm run typecheck` → 0 errors.
- [ ] `npm run build` → succeeds, bundle sizes unchanged within noise.
- [ ] Grep confirms no `.jsx`/`.js` source remains (excluding configs and the `.d.ts` shim): `git ls-files 'src/**/*.js' 'src/**/*.jsx' 'api/**/*.js'` → empty.
- [ ] Full dev smoke: login, conference calendar, admin, report create/edit/view.
- [ ] Optional follow-up: wire `npm run typecheck` into CI.

---

## Self-Review Notes

- **Spec coverage:** toolchain (Task 1) ✓; shared types (Task 2) ✓; foundation files (Tasks 3–7) ✓; sample component (Task 8) ✓; all six migration batches (Task 9a–9f) ✓; both `src/` and `api/` in scope ✓; Next.js excluded ✓.
- **Type consistency:** `WithId<T>` defined once (Task 2) and reused identically in Tasks 5–7. `apiFetch<T>` signature in Task 4 matches the `ApiFetchOptions` from Task 2. `Auth`/`Firestore`/`Auth`/`User`/`DecodedIdToken`/`VercelRequest` names match across their defining imports. `Member`/`Session`/`UserProfile` field names match between `firestore.ts` and every consumer.
- **Known deliberate looseness:** `useConferenceDoc` returns `WithId<Record<string, unknown>>` (tightened to `Conference` in Batch 9b); `SESSION_CATALOG` is `Map<string, unknown>` (tightened in calendar batch); `MemberRole`/`MemberStatus`/`AttendanceMode` start at confirmed-only literals and grow per the grep. All three are documented at their definition and have an explicit tightening step — not placeholders.
