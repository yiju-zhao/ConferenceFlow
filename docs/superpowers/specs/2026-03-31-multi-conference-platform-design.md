# ConferenceFlow: Multi-Conference Platform Design

**Date:** 2026-03-31
**Status:** Approved
**Scope:** Generalize ConferenceFlow from a GTC 2026-specific tool into a multi-conference platform with user auth, admin management, redesigned calendar, and collaborative daily reports.

---

## 1. Architecture

### Hybrid: Firebase + Next.js API on Railway

- **Firebase Auth** — email + Google sign-in (replaces current anonymous auth)
- **Firestore** — document database with real-time listeners (preserved from current system)
- **Firebase Storage** — published reports, illustrations, site photos
- **Next.js on Railway** — API routes for server-side business logic using Firebase Admin SDK
- **Frontend** — React SPA (existing), migrated incrementally to Next.js pages

**Read/Write Split:**
- Frontend reads Firestore directly via real-time listeners (sessions, reports, members) — preserves existing collaborative sync
- Next.js API handles validated writes: approvals, bulk session upload, role changes, publishing

---

## 2. Data Model

### Firestore Collections

**`users/{userId}`**
```
email: string
displayName: string
avatarUrl: string
provider: "email" | "google"
globalRole: "super_admin" | "user"
createdAt: timestamp
lastLoginAt: timestamp
```

**`conferences/{confId}`**
```
name: string
description: string
startDate: string (YYYY-MM-DD)
endDate: string (YYYY-MM-DD)
visibility: "public" | "private"
joinCode: string (for private conferences)
createdBy: string (userId)
createdAt: timestamp
updatedAt: timestamp
```

**`conferences/{confId}/members/{userId}`**
```
role: "admin" | "member"
status: "pending" | "approved" | "rejected"
attendanceMode: "onsite" | "online"
colorIndex: number (0-5)
appliedAt: timestamp
approvedAt: timestamp
approvedBy: string (userId)
```

**`conferences/{confId}/sessions/{sessionId}`**
```
code: string
title: string
date: string (YYYY-MM-DD)
start: string (HH:MM)
end: string (HH:MM)
room: string
speakers: Array<{name, title, company}>
format: string
recording: string
sessionType: string
mainTopic: string
url: string
keyThemes: string[]
attendees: string[] (userIds)
createdAt: timestamp
updatedAt: timestamp
```

**`conferences/{confId}/dailyReports/{reportId}`**
```
title: string
status: "draft" | "published" | "archived"
publishedUrl: string
sections: {
  voices: { blocks: Block[] },
  trends: { blocks: Block[] },
  analysis: { blocks: Block[] },
  insights: { blocks: Block[] }
}
createdAt: timestamp
updatedAt: timestamp
publishedAt: timestamp
```

Block type within sections:
```
id: string
type: string ("category-header" | "session-card" | "heading" | "body" | "intel-card")
content: string (HTML)
citations: string[]
sourceSessions: Array<{id: string | null, manual: string}>
contributorIds: string[] (userIds)
ownerId: string (userId — the block creator, only they can edit)
lastEditedAt: timestamp
lastEditedBy: string (userId)
```

**`conferences/{confId}/summaryReports/{reportId}`**
```
title: string
htmlContent: string
publishedUrl: string
status: "draft" | "published"
createdAt: timestamp
updatedAt: timestamp
```

---

## 3. Auth & Role System

### Authentication
- Firebase Auth with email+password and Google OAuth providers
- On first sign-in: create `users/{userId}` doc in Firestore
- Firebase Custom Claims encode: `{ globalRole }` (global role only — claims have a 1000-byte limit)
- Per-conference roles resolved by reading `conferences/{confId}/members/{userId}` doc at runtime
- Frontend caches membership data after first load; API routes verify membership on each request

### Role Hierarchy
| Role | Scope | Permissions |
|------|-------|-------------|
| `super_admin` | Global | Create conferences, assign conf admins, approve any member, access all conferences |
| `conf_admin` | Per-conference | Manage sessions (CRUD + bulk upload), approve/reject members, publish reports, edit conference settings |
| `member` | Per-conference | View calendar, edit reports (own blocks), mark attendance, add blocks |
| `pending` | Per-conference | Applied but not yet approved — can see conference info only |
| `visitor` | Per-conference | Not a member — can see published reports of public conferences |

### Conference Join Flow
1. User browses conference list (public conferences visible to all logged-in users)
2. User clicks "Apply to Join" → selects attendance mode (onsite/online)
3. Creates `members/{userId}` doc with `status: "pending"`
4. Conference admin or super_admin sees pending applications in admin panel
5. Admin approves → status updated to "approved", custom claims refreshed
6. Approved member can now access calendar, sessions, report editing

---

## 4. Next.js API Routes (Railway)

All routes use Firebase Admin SDK. Auth via Firebase ID token in Authorization header.

### Auth & Roles
- `POST /api/auth/register` — create user + Firestore profile
- `POST /api/admin/set-role` — super_admin sets globalRole or conference role
- `POST /api/admin/set-custom-claims` — sync roles to Firebase Auth tokens

### Conference Management
- `POST /api/conferences` — create conference (super_admin only)
- `PUT /api/conferences/{id}` — update conference settings (conf_admin+)
- `POST /api/conferences/{id}/members/approve` — approve pending member (conf_admin+)
- `POST /api/conferences/{id}/members/reject` — reject pending member (conf_admin+)

### Session Management
- `POST /api/conferences/{id}/sessions/bulk` — upload JSON, batch create sessions (conf_admin+)
- `POST /api/conferences/{id}/sessions` — create single session (conf_admin+)
- `PUT /api/conferences/{id}/sessions/{sid}` — edit session (conf_admin+)
- `DELETE /api/conferences/{id}/sessions/{sid}` — remove session (conf_admin+)

### Report Publishing
- `POST /api/conferences/{id}/reports/{rid}/publish` — generate & upload HTML (conf_admin+)
- `GET /api/public/reports/{rid}` — fetch published report (no auth)

---

## 5. Page Structure & Navigation

### Public Routes
| Path | Component | Purpose |
|------|-----------|---------|
| `/login` | LoginPage | Email/Google sign-in |
| `/register` | RegisterPage | Email sign-up |
| `/public/reports/{reportId}` | PublicReportViewer | Published report (no auth) |

### Authenticated User Routes
| Path | Component | Purpose |
|------|-----------|---------|
| `/dashboard` | Dashboard | Personal landing: my conferences (upcoming), pending applications, past conferences toggle, discover public conferences. Private conferences only accessible via join code (not in discover). |
| `/conference/{confId}` | ConferenceHub | Conference hub, default to calendar tab |
| `/conference/{confId}/calendar` | CalendarPage | Schedule dashboard (brutalist design) |
| `/conference/{confId}/reports` | ReportList | Daily + summary report list |
| `/conference/{confId}/report/{reportId}` | DailyReport | Collaborative report editor |
| `/conference/{confId}/members` | MemberList | Member list with roles and attendance mode |

### Admin Routes
| Path | Component | Purpose |
|------|-----------|---------|
| `/conference/{confId}/admin` | AdminPanel | Conference admin hub |
| `/conference/{confId}/admin/settings` | AdminSettings | Edit name, description, dates, visibility, join code |
| `/conference/{confId}/admin/sessions` | AdminSessions | Session CRUD + bulk JSON upload |
| `/conference/{confId}/admin/applications` | AdminApplications | Approve/reject pending members |
| `/conference/{confId}/admin/reports` | AdminReports | Publish/unpublish reports |
| `/super-admin` | SuperAdminPanel | Create conferences, assign admins |

### Access Control Matrix
| Page | Visitor | Pending | Member | Conf Admin | Super Admin |
|------|---------|---------|--------|------------|-------------|
| Dashboard | - | Y | Y | Y | Y |
| Conference info (public) | Y | Y | Y | Y | Y |
| Calendar | - | - | Y | Y | Y |
| Edit reports | - | - | Y | Y | Y |
| Published reports (public) | Y | Y | Y | Y | Y |
| Admin panel | - | - | - | Y | Y |
| Super admin | - | - | - | - | Y |

### Past Conference Access
- If user was an approved member: full read/write access retained
- If user was not a member of a past public conference: read-only (published reports only)

---

## 6. Calendar Page Design

Three-panel layout following the "Architectural Dispatch" brutalist design system.

### Layout
- **Top bar** — full-bleed red (#a20513) header with conference name, "Export Schedule" and "Sync Calendar" actions
- **Left panel: Session Pool** — searchable/filterable list of all conference sessions
  - Filters: topic tags (AI/ML, HPC, Robotics...), time (AM/PM), format (In-Person/Virtual)
  - Session cards with title, speaker, date/time
  - Click → populates right detail panel with "Mark Attending" action
- **Center: Your Schedule** — multi-day calendar grid showing only the user's scheduled sessions
  - Time slots on Y-axis, conference days on X-axis
  - All session blocks in red (#a20513) — only your sessions shown
  - Parallel sessions at the same time displayed side-by-side in the same cell
  - Small member avatar dots on blocks indicate teammates also attending
  - Click block → right panel shows details
- **Right panel: Session Details** — full session info when a session is selected
  - Title, description, speaker, room, format, recording status
  - "ALSO ATTENDING" section: teammate names with attendance mode badge (onsite/online)
  - "MARK ATTENDING" button (from pool) or "REMOVE FROM SCHEDULE" (if already scheduled)
  - "VIEW OFFICIAL SESSION PAGE" link (if URL available)

### Design System Rules
- 0px border radius on all elements
- No drop shadows — tonal contrast for depth
- Red vertical anchor (4px bar) for section titles
- Work Sans for headlines, Inter for body text
- Full-bleed red header for critical information
- Surface layering: #f9f9f9 base, #eeeeee secondary, #ffffff lifted

---

## 7. Collaborative Daily Report

### Principle: Additive Layer on Existing Layout

The existing report layout is preserved exactly. Collaboration features are overlaid.

### Existing Structure (unchanged)
```
┌─ Title Bar (eyebrow + editable title) ─────────────────┐
├─ Header: TOC (left) + 核心要点 Summary (right) ────────┤
├─ 相关议题 (Session Reports by Topic) ──────────────────┤
│  ├─ Topic Dividers ─────────────────────────────────── │
│  └─ Session Cards (code, title, speakers, takeaways,   │
│     insights, illustrations, contributors)             │
├─ 现场情报 (block editor: category headers + cards) ────┤
├─ 圈内声音 (block editor: headings + intel cards) ──────┤
├─ 深度研判 (rich text editor) ──────────────────────────┤
└─ 现场记录 (site photos with captions) ─────────────────┘
```

### New: Toolbar Presence Indicators
- Active collaborator avatars (initials + user color) + online count
- Displayed in the existing toolbar alongside 保存/导出/发布 buttons
- Presence tracked via Firestore: each user writes a heartbeat doc to `conferences/{confId}/presence/{userId}` (updated every 30s, considered offline after 60s of no update)

### New: Block Author Attribution
- Each IntelCard/block gets a colored left border matching the author's assigned color
- Contributor pill shows who created the block (using existing 贡献人 row)
- Activity timestamp per block: "editing now" / "saved Xm ago by [name]"
- `contributorIds[0]` auto-set to logged-in user on block creation

### New: Block Ownership
- Block creator (`ownerId`) is the owner — only they can edit the block's content
- Other users see the block as read-only (no contenteditable)
- Anyone can add new blocks to any section
- Anyone can reorder blocks (move up/down)
- Only block owner or conf_admin can delete a block

### New: Session Report Contributors
- Session takeaways/insights fields: "last edited by [name] Xm ago"
- Existing 贡献人 row enhanced with user-colored pills
- Auto-populated from logged-in user when they edit a field

### Unchanged
- Single scrollable document layout
- TOC + Summary header structure
- Block types: category-header, session-card, heading, body, intel-card
- EditableField, BulletEditor, SessionPicker components
- Auto-save with debounced Firestore writes (600ms)
- Snapshot system (5-min auto + manual)
- Export: markdown, HTML, email, publish flow
- Firestore real-time listeners for live updates

---

## 8. Sub-Project Decomposition

These 4 sub-projects should be implemented sequentially, each with its own plan:

### Sub-Project 1: Auth + Multi-Conference Core
- Firebase Auth setup (email + Google providers)
- User registration/login pages
- Firestore data model migration (conference-scoped subcollections)
- Role system with Firebase Custom Claims
- Conference CRUD (super_admin)
- Dashboard page (conference list, pending applications, past conferences toggle, discover)
- Conference join/apply flow with approval gate
- Next.js API project setup on Railway

### Sub-Project 2: Admin System
- Conference admin panel (settings, session management, applications, reports)
- Session bulk JSON upload via API
- Session manual CRUD via API
- Member approval/rejection via API
- Report publish/unpublish management
- Super admin panel (create conferences, assign admins)

### Sub-Project 3: Calendar Page Redesign
- Three-panel calendar layout (session pool, schedule grid, detail panel)
- Session search and filtering (topic, format, time)
- Personal schedule view (only user's sessions, parallel display)
- "Also Attending" with attendance mode badges
- Mark attending / remove from schedule actions
- Architectural Dispatch design system application
- Export/sync calendar actions

### Sub-Project 4: Collaborative Daily Report
- Block ownership model (ownerId field, edit restrictions)
- Toolbar presence indicators (active collaborators)
- Block author attribution (colored borders, activity timestamps)
- Session contributor row enhancement (user-colored pills, last edited info)
- Conference-scoped report data (migrate from top-level to subcollections)

---

## 9. Migration Strategy

### Data Migration (Sub-Project 1)
- Existing Firestore data (members, sessions, dailyReports) migrated into a `conferences/{gtc2026}/` subcollection
- A migration script copies top-level collections into the GTC 2026 conference subcollections
- Existing anonymous users cannot be migrated — fresh start with real auth
- Published reports remain accessible at existing URLs (backward-compatible public route)

### Frontend Migration
- Start as React SPA with Next.js API backend
- Incrementally move pages to Next.js as sub-projects progress
- Existing components (EditableField, IntelCard, SessionPicker, etc.) reused directly
