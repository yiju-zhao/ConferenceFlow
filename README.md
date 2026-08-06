# ConferenceFlow

A general-purpose platform for **running conferences and collaboratively writing
daily reports**. An operator creates a conference; participants discover it (or
join a private one with a code), get approved, and then work together in real
time — managing the live schedule and co-authoring each day's report during the
event.

ConferenceFlow is conference-agnostic: spin up any number of independent
conferences in one deployment. (The canonical deployment is _GTC 2026_, which is
also the package name — but the app itself is not specific to it.)

## What it does

- **Multi-conference platform**
  - A _super admin_ creates conferences — either **public** (discoverable) or
    **private** (with an auto-generated join code).
  - Participants discover public conferences, or join a private one with its code.
  - A membership **application workflow**: apply (onsite/online) → `pending` →
    approved or rejected by that conference's admin.
- **Per-conference workspace**
  - **Schedule** — calendar view, session pool, session detail, assign members to
    sessions.
  - **Members & roles** — `admin` / `member`, attendance mode (`onsite`/`online`),
    per-member color identity.
  - **Collaborative daily reports** — real-time co-editing with presence
    (who's editing what), snapshots & restore, diff view, intel cards, and
    PDF export.
  - **Admin console** — applications, attendance, sessions, reports, settings.
- **Bilingual UI** (English / 中文).
- **Global super-admin** role for cross-conference administration.

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript (strict mode)
- **Backend:** Vercel Serverless Functions (Node), Firebase Admin
- **Data & Auth:** Firebase (Authentication, Cloud Firestore, Storage)
- **Styling:** Tailwind CSS
- **i18n:** i18next (English / 中文)

## Data Model

```
users/{uid}                              profile + globalRole (user | super_admin)
conferences/{confId}                     name, dates, visibility, joinCode, …
conferences/{confId}/members/{uid}       role, status, attendanceMode, colorIndex
conferences/{confId}/sessions/{id}       schedule entries
conferences/{confId}/reports/{id}        daily reports (+ snapshots / presence)
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Firebase](https://firebase.google.com/) project with **Authentication**,
  **Cloud Firestore**, and **Storage** enabled.
- A [Vercel](https://vercel.com/) account (hosting + the serverless API).

### Install

```bash
npm install
```

### Environment

The **client-side** Firebase config lives in [`src/firebase.ts`](src/firebase.ts).

The **serverless functions** (`api/`) use the Firebase Admin SDK and read
credentials from environment variables (`.env.local` for `vercel dev`, or the
Vercel project settings):

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

> Keep the `\n` escapes in `FIREBASE_PRIVATE_KEY` — the app converts them to real
> newlines at runtime.

Optional:

```
VITE_API_URL=...   # API base URL; defaults to same-origin ("")
```

To make a user a **super admin** (so they can create conferences), set
`globalRole: "super_admin"` on their `users/{uid}` document (the app exposes a
super-admin set-role endpoint for this).

### Scripts

| Script                 | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start the Vite dev server            |
| `npm run build`        | Production build                     |
| `npm run preview`      | Preview the production build locally |
| `npm run typecheck`    | `tsc --noEmit` (type-check the app)  |
| `npm run format`       | Format the codebase with Prettier    |
| `npm run format:check` | Verify Prettier formatting           |

## Project Structure

```
api/                    Vercel serverless functions (Firebase Admin)
  conferences/          Conference, session, member, report routes
  admin/                Super-admin actions (e.g. set-role)
  health/               Health check
  lib/                  Shared admin init + auth middleware
src/
  components/
    calendar/           Schedule UI
    admin/              Admin console
    report/             Collaborative reports
  contexts/             React contexts (Auth)
  hooks/                Firestore subscriptions (sessions, members, membership…)
  lib/                  Utilities (apiFetch, diff, report helpers)
  types/                Shared TypeScript models (Firestore + API contracts)
  i18n/                 i18next setup + date utilities
  firebase.ts           Client Firebase init
  main.tsx              App entry
```

## Deployment

The app deploys on **Vercel**: the frontend is built by Vite and the `api/`
functions are compiled by Vercel at deploy time. Route rewrites are configured in
[`vercel.json`](vercel.json).

Firebase Storage rules live in [`storage.rules`](storage.rules); deploy them with
the Firebase CLI (`firebase deploy --only storage`).

## Notes

- The codebase is fully TypeScript under `strict` mode, with
  `noUnusedLocals` / `noUnusedParameters` enabled — run `npm run typecheck`
  before submitting changes.
