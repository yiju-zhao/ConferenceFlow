# ConferenceFlow — GTC 2026

Real-time conference operations platform for **GTC 2026**. It runs the event
floor: schedule management, member coordination, and collaborative daily
reporting — designed for onsite/online hybrid conferences.

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript (strict mode)
- **Backend:** Vercel Serverless Functions (Node), Firebase Admin
- **Data & Auth:** Firebase (Authentication, Cloud Firestore, Storage)
- **Styling:** Tailwind CSS
- **i18n:** i18next (English / 中文)

## Features

- **Schedule** — calendar view, session pool, session detail, member assignment.
- **Membership & access control** — roles (`admin` / `member`), approval statuses
  (`approved` / `pending` / `rejected`), plus a global `super_admin`.
- **Collaborative daily reports** — real-time co-editing, snapshots & restore,
  diff view, presence indicators, and PDF export.
- **Admin console** — applications, attendance, sessions, reports, settings.
- **Bilingual UI** (English / Chinese).

## Getting Started

### Prerequisites

- Node.js 18+
- A [Firebase](https://firebase.google.com/) project with **Authentication**,
  **Cloud Firestore**, and **Storage** enabled.
- A [Vercel](https://vercel.com/) account (for hosting + the serverless API).

### Install

```bash
npm install
```

### Environment

The **client-side** Firebase config lives in [`src/firebase.ts`](src/firebase.ts).

The **serverless functions** (`api/`) authenticate as the Firebase Admin SDK and
read credentials from environment variables (set them in `.env.local` for local
dev with `vercel dev`, or in the Vercel project settings):

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

> Keep the `\n` escapes in `FIREBASE_PRIVATE_KEY` as-is — the app converts them
> to real newlines at runtime.

Optional:

```
VITE_API_URL=...   # API base URL; defaults to same-origin ("")
```

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
functions are compiled by Vercel at deploy time. Route rewrites are configured
in [`vercel.json`](vercel.json).

Firebase Storage rules live in [`storage.rules`](storage.rules); deploy them
with the Firebase CLI (`firebase deploy --only storage`).

## Notes

- The codebase is fully TypeScript under `strict` mode, with
  `noUnusedLocals` / `noUnusedParameters` enabled — run
  `npm run typecheck` before submitting changes.
