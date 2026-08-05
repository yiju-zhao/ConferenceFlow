# TypeScript Migration — Design Spec

**Date:** 2026-08-05
**Branch:** `worktree-ts-migration`
**Status:** Approved (pending spec review)

## 1. Background & Motivation

The project (`gtc-2026`) is a React 18 + Vite SPA with Vercel serverless functions and Firebase (Auth / Firestore / Storage). It is currently **pure JavaScript**: ~13,000 LOC across 58 `.js/.jsx` files (only one `.d.ts` shim exists: `src/turndown-plugin-gfm.d.ts`).

Two data-contract surfaces — the Firestore document models and the `api/` serverless function return shapes — are currently untyped. `apiFetch` returns `any`, `snap.data()` returns `any`, and there is no shared definition of `role` / `status` / `globalRole` enums. These are the areas where TypeScript delivers the most value: catching contract drift between client and server, and eliminating null/undefined runtime errors.

`jsconfig.json` is already TS-ready (`allowJs`, bundler resolution, `allowImportingTsExtensions`, `noEmit`), confirming the project has been moving toward TS organically.

## 2. Goal

Introduce TypeScript **incrementally**: configure the toolchain, type the shared/foundation layer and one sample component as a replicable pattern, and produce a complete migration plan for the remaining files.

**Success criteria:**
- `npm run dev` and `npm run build` behave exactly as before (no runtime change).
- `npm run typecheck` (`tsc --noEmit`) passes with zero errors on the converted `.ts/.tsx` files.
- Remaining `.js/.jsx` files continue to run under `allowJs` / `checkJs: false` without blocking.
- Shared Firestore + API types exist in `src/types/` and are imported by both `src/` and `api/`.
- One component is converted as the documented pattern for the remaining batches.

## 3. Scope & Non-Goals

**In scope:**
- `src/` (frontend) and `api/` (serverless functions) — both.
- Toolchain: `tsconfig.json`, TS dev dependencies, `typecheck` script, Vite path alias.
- Shared type definitions and foundation-layer conversion.
- One sample component conversion.
- A documented, batched migration plan for the remaining files.

**Non-goals (explicitly excluded):**
- Migrating to Next.js. The current SPA + Vercel Functions + Firebase architecture is retained.
- Converting all 58 files in a single round (no big-bang cutover).
- Changing runtime behavior, features, or styling.

## 4. Approach: Single-root tsconfig + shared types

**Chosen over** project-references/two-tsconfig (over-engineering for this size) and type-defs-only (too little value).

### 4.1 New dev dependencies

`typescript`, `@types/react`, `@types/react-dom`, `@types/node` (needed for `api/`).

### 4.2 `tsconfig.json` (replaces `jsconfig.json`)

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,            // enforced on new .ts/.tsx files
    "allowJs": true,           // unmigrated .js keeps working
    "checkJs": false,          // do not type-check .js
    "noEmit": true,            // Vite/Vercel compile; TS only checks
    "skipLibCheck": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "api", "vite.config.js"]
}
```

`strict` applies only to newly written `.ts/.tsx`; legacy `.js` stays silent under `checkJs: false`, so builds never break during the migration.

### 4.3 `package.json`

Add `"typecheck": "tsc --noEmit"` to `scripts`. Delete `jsconfig.json` (tsconfig takes over its responsibilities).

### 4.4 `vite.config.js`

Add `resolve.alias` mapping `@` → `src`. (TS `paths` is type-layer only; Vite needs the runtime alias.)

## 5. Data Model & Shared Types

New `src/types/` directory, imported by both `src/` and `api/`.

```
src/types/
  firestore.ts   # Firestore document models
  api.ts         # API request/response contracts (mirrors api/ routes)
  index.ts       # re-exports
```

### 5.1 Confirmed shapes

Derived from `AuthContext.jsx`, the hooks, and `lib/api.js`:

```ts
// firestore.ts
import type { Timestamp } from "firebase/firestore";

type GlobalRole    = "user" | "super_admin";          // confirmed
type AuthProvider  = "email" | "google";              // confirmed
type MemberRole    = "admin" | "member";              // "admin" confirmed; "member" to verify at impl
type MemberStatus  = "approved" | "pending";          // "approved" confirmed; "pending" to verify at impl
type AttendanceMode = "onsite" | "online";            // "onsite" confirmed; "online" to verify at impl

interface UserProfile {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: AuthProvider;
  globalRole: GlobalRole;
  createdAt: Timestamp | null;     // serverTimestamp() reads back as Timestamp; null until written
  lastLoginAt: Timestamp | null;
}

interface Session {
  id: string;
  code?: string;
  date: string;
  start: string;
  attendees?: string[];
  // remaining fields completed at impl by reading session writers
}

interface Member {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  attendanceMode: AttendanceMode;
  colorIndex?: number;
  managedByAdmin?: boolean;
  displayName?: string;
  legacyName?: string;
  name?: string;                   // derived/resolved at runtime
}

type WithId<T> = T & { id: string };   // the repeated { id: snap.id, ...data() } pattern
```

### 5.2 Decisions

- **Enum values not invented.** Only values observed in code are listed; the rest are marked "to verify at impl" and filled in by reading each collection's writers. No guessing.
- **Timestamp handling.** `serverTimestamp()` writes resolve to `Timestamp`; until then they may be `null`. Standardize on `Timestamp | null` instead of the current implicit `any`.
- **`Conference` and `Report` document shapes** are defined in `firestore.ts` during implementation (read from their writers in `api/` and components).

### 5.3 API layer upgrade

`src/lib/api.js` → `api.ts`, `apiFetch` becomes generic:

```ts
export async function apiFetch<T = unknown>(path: string, options?: ApiFetchOptions): Promise<T>;
// usage: const conf = await apiFetch<Conference>(`/api/conferences/${id}`);
```

`src/types/api.ts` defines the request/response shape for each `api/` route; both the route handler and the caller import the same type, so contract drift is a compile error.

## 6. Foundation Conversion (this round)

14 existing files converted to `.ts/.tsx`, plus 3 new type files and 1 sample component:

| Layer | Files |
|---|---|
| Shared types (new) | `src/types/firestore.ts`, `api.ts`, `index.ts` |
| Firebase | `src/firebase.js` → `.ts` |
| Config | `src/constants.js`, `sessionCatalog.js` → `.ts` |
| lib | `src/lib/api.js`, `diffUtils.js`, `reportUtils.js` → `.ts` |
| Context | `src/contexts/AuthContext.jsx` → `.tsx` |
| Hooks (5) | `useConferenceDoc`, `useConferenceSessions`, `useConferenceMembers`, `useMembership`, `useDebouncedSave` → `.ts` |
| API shared layer | `api/lib/firebase-admin.js`, `auth-middleware.js` → `.ts` |

**Sample component:** `src/components/UserAvatar.jsx` → `.tsx`. Small, clean, consumes `UserProfile`, and fully demonstrates the highest-frequency pattern: typed props + nullable Firestore data handling. This becomes the template the batch migrations follow.

## 7. Migration Plan for Remaining Files (batched)

Each batch is its own commit. **Gate:** `tsc --noEmit` and `vite build` both pass before the next batch starts. No parallel batches — every step stays reversible.

1. `src/components/*` remaining leaf components (5)
2. `src/components/calendar/*` (5)
3. `src/components/admin/*` (7)
4. `src/components/report/*` (11) — most complex / most state; last
5. `api/` route handlers (8) — wire to shared `src/types/api.ts` contracts
6. `src/main.jsx` → `main.tsx` — entry point, handled last and carefully

**Ordering rationale:** simple leaves first to establish the pattern and surface config issues; `report` (heaviest) last when confidence is highest; `api/` routes as their own batch since they share the `api.ts` contracts.

Detailed per-file steps for each batch are produced in the writing-plans phase.

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `allowJs` hides type errors in legacy files until they are converted | Expected and accepted; conversion batches progressively close the gap. `tsc` is authoritative on already-converted files. |
| Firestore data shapes are inferred, not sourced from a schema | Only observed values are typed; unknown fields verified at impl against writers. No invented enums. |
| Vercel `api/*.ts` compilation | Vercel compiles TS serverless functions natively; verify with a deploy of the `health` route during the api batch. |
| `main.jsx` entry conversion breaks startup | Done last, in isolation, verified via `npm run dev` immediately. |

## 9. Out of scope for this spec

- Next.js migration (decided against).
- Any feature, UI, or behavior change.
- CI wiring for `typecheck` (can be added later as a follow-up).
