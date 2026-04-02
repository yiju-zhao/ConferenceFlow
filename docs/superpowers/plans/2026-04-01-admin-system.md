# Admin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin panel for conference management — session CRUD with bulk upload, member application management, report publishing, conference settings, and a super admin panel for creating conferences and assigning admins.

**Architecture:** Admin UI is a set of React components under `/conference/{confId}/admin/*` routes and `/super-admin`. They call the Next.js API (via `apiFetch`) for write operations and read Firestore directly for real-time data. The API uses `requireConfAdmin` or `requireSuperAdmin` middleware for authorization.

**Tech Stack:** React 18, Tailwind CSS 3 (brutalist design tokens), Firebase Firestore (real-time reads), Next.js API routes (writes), `apiFetch` helper for authenticated calls.

---

## File Structure

### New API Routes (conference-api/)

```
conference-api/app/api/conferences/[confId]/
├── sessions/
│   ├── route.js              # POST: create session, GET: list sessions
│   ├── bulk/route.js         # POST: bulk upload JSON sessions
│   └── [sessionId]/route.js  # PUT: edit session, DELETE: remove session
└── reports/
    └── [reportId]/
        └── publish/route.js  # POST: publish report, DELETE: unpublish
```

### New Frontend Components (src/)

```
src/components/admin/
├── AdminLayout.jsx           # Shared layout with tab navigation for admin pages
├── AdminSettings.jsx         # Conference settings form
├── AdminSessions.jsx         # Session table + bulk upload + add/edit modal
├── AdminApplications.jsx     # Pending member list with approve/reject
├── AdminReports.jsx          # Report list with publish/unpublish
└── SuperAdminPanel.jsx       # Create conference + assign admins
```

### Modified Files

```
src/main.jsx                  # Add admin routes
```

---

## Task 1: Session CRUD API Routes

**Files:**
- Create: `conference-api/app/api/conferences/[confId]/sessions/route.js`
- Create: `conference-api/app/api/conferences/[confId]/sessions/[sessionId]/route.js`

- [ ] **Step 1: Write POST/GET /api/conferences/[confId]/sessions**

Write to `conference-api/app/api/conferences/[confId]/sessions/route.js`:

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

    const { code, title, date, start, end, room, speakers, format, recording, sessionType, mainTopic, url, keyThemes } = body;

    if (!title || !date || !start || !end) {
      return NextResponse.json(
        { error: "title, date, start, and end are required" },
        { status: 400 }
      );
    }

    const sessionRef = db.collection("conferences").doc(confId).collection("sessions").doc();
    const sessionData = {
      code: code || "",
      title,
      date,
      start,
      end,
      room: room || "",
      speakers: speakers || [],
      format: format || "",
      recording: recording || "",
      sessionType: sessionType || "",
      mainTopic: mainTopic || "",
      url: url || "",
      keyThemes: keyThemes || [],
      attendees: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await sessionRef.set(sessionData);
    return NextResponse.json({ id: sessionRef.id, ...sessionData }, { status: 201 });
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
    const snap = await db.collection("conferences").doc(confId).collection("sessions").get();
    const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json(sessions);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write PUT/DELETE /api/conferences/[confId]/sessions/[sessionId]**

Write to `conference-api/app/api/conferences/[confId]/sessions/[sessionId]/route.js`:

```javascript
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function PUT(request, { params }) {
  try {
    const { confId, sessionId } = await params;
    await requireConfAdmin(request, confId);
    const body = await request.json();

    const sessionRef = db.collection("conferences").doc(confId).collection("sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const allowedFields = ["code", "title", "date", "start", "end", "room", "speakers", "format", "recording", "sessionType", "mainTopic", "url", "keyThemes"];
    const updates = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }
    updates.updatedAt = FieldValue.serverTimestamp();

    await sessionRef.update(updates);
    return NextResponse.json({ id: sessionId, ...updates });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { confId, sessionId } = await params;
    await requireConfAdmin(request, confId);

    const sessionRef = db.collection("conferences").doc(confId).collection("sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await sessionRef.delete();
    return NextResponse.json({ id: sessionId, deleted: true });
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
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add conference-api/app/api/conferences/\[confId\]/sessions/
git commit -m "feat: add session CRUD API routes"
```

---

## Task 2: Bulk Session Upload API

**Files:**
- Create: `conference-api/app/api/conferences/[confId]/sessions/bulk/route.js`

- [ ] **Step 1: Write POST /api/conferences/[confId]/sessions/bulk**

Write to `conference-api/app/api/conferences/[confId]/sessions/bulk/route.js`:

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

    const { sessions } = body;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({ error: "sessions array is required" }, { status: 400 });
    }

    if (sessions.length > 1000) {
      return NextResponse.json({ error: "Maximum 1000 sessions per upload" }, { status: 400 });
    }

    const sessionsCol = db.collection("conferences").doc(confId).collection("sessions");
    const results = { created: 0, errors: [] };

    // Process in batches of 500 (Firestore batch limit)
    const batchSize = 500;
    for (let i = 0; i < sessions.length; i += batchSize) {
      const chunk = sessions.slice(i, i + batchSize);
      const batch = db.batch();

      for (const session of chunk) {
        if (!session.title || !session.date || !session.start || !session.end) {
          results.errors.push({
            index: i + chunk.indexOf(session),
            error: "Missing required fields: title, date, start, end",
            session: session.title || "(no title)",
          });
          continue;
        }

        const ref = session.session_id
          ? sessionsCol.doc(session.session_id)
          : sessionsCol.doc();

        batch.set(ref, {
          code: session.session_id || session.code || "",
          title: session.title,
          date: session.date,
          start: session.start || session.time?.split(" - ")[0] || "",
          end: session.end || session.time?.split(" - ")[1] || "",
          room: session.location || session.room || "",
          speakers: Array.isArray(session.speakers) ? session.speakers : [],
          format: session.format || "",
          recording: session.recording || "",
          sessionType: session.session_type || session.sessionType || "",
          mainTopic: session.topic || session.mainTopic || "",
          url: session.url || "",
          keyThemes: Array.isArray(session.key_themes) ? session.key_themes : [],
          attendees: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.created++;
      }

      await batch.commit();
    }

    return NextResponse.json({
      message: `Uploaded ${results.created} sessions`,
      created: results.created,
      errors: results.errors,
    });
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
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add conference-api/app/api/conferences/\[confId\]/sessions/bulk/
git commit -m "feat: add bulk session upload API route"
```

---

## Task 3: Report Publish/Unpublish API

**Files:**
- Create: `conference-api/app/api/conferences/[confId]/reports/[reportId]/publish/route.js`

- [ ] **Step 1: Write POST/DELETE for report publishing**

Write to `conference-api/app/api/conferences/[confId]/reports/[reportId]/publish/route.js`:

```javascript
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request, { params }) {
  try {
    const { confId, reportId } = await params;
    await requireConfAdmin(request, confId);

    const reportRef = db
      .collection("conferences")
      .doc(confId)
      .collection("dailyReports")
      .doc(reportId);

    const snap = await reportRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    await reportRef.update({
      status: "published",
      publishedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ reportId, status: "published" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { confId, reportId } = await params;
    await requireConfAdmin(request, confId);

    const reportRef = db
      .collection("conferences")
      .doc(confId)
      .collection("dailyReports")
      .doc(reportId);

    const snap = await reportRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    await reportRef.update({
      status: "draft",
      publishedAt: null,
    });

    return NextResponse.json({ reportId, status: "draft" });
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
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add conference-api/app/api/conferences/\[confId\]/reports/
git commit -m "feat: add report publish/unpublish API routes"
```

---

## Task 4: Admin Layout Component

**Files:**
- Create: `src/components/admin/AdminLayout.jsx`

- [ ] **Step 1: Write the admin layout with tab navigation**

Write to `src/components/admin/AdminLayout.jsx`:

```jsx
import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";

const tabs = [
  { path: "settings", label: "Settings" },
  { path: "sessions", label: "Sessions" },
  { path: "applications", label: "Applications" },
  { path: "reports", label: "Reports" },
];

export default function AdminLayout() {
  const { confId } = useParams();
  const { user } = useAuth();
  const { isAdmin, loading } = useMembership(confId);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-secondary text-sm uppercase tracking-wider">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-primary font-headline text-lg font-bold uppercase">Access Denied</p>
          <p className="text-secondary text-sm mt-2">You need admin access for this conference.</p>
          <Link to={`/conference/${confId}`} className="text-primary text-sm mt-4 inline-block hover:underline">
            ← Back to conference
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-primary p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to={`/conference/${confId}`} className="text-on-primary/70 text-xs hover:text-on-primary">
              ← Back
            </Link>
            <h1 className="font-headline text-on-primary text-lg font-bold tracking-tight uppercase">
              Conference Admin
            </h1>
          </div>
          <Link to="/dashboard" className="text-on-primary/70 text-xs uppercase tracking-wider hover:text-on-primary">
            Dashboard
          </Link>
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-surface-container-lowest border-b border-surface-dim">
        <div className="max-w-6xl mx-auto flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={`/conference/${confId}/admin/${tab.path}`}
              className={({ isActive }) =>
                `px-6 py-3 text-sm font-headline uppercase tracking-wider transition-colors duration-50 ${
                  isActive
                    ? "text-primary border-b-2 border-primary"
                    : "text-secondary hover:text-on-surface"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-6">
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/admin/
git commit -m "feat: add AdminLayout with tab navigation"
```

---

## Task 5: Admin Settings Page

**Files:**
- Create: `src/components/admin/AdminSettings.jsx`

- [ ] **Step 1: Write the settings form**

Write to `src/components/admin/AdminSettings.jsx`:

```jsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";

export default function AdminSettings() {
  const { confId } = useParams();
  const [conf, setConf] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConf(data);
        setForm({
          name: data.name || "",
          description: data.description || "",
          startDate: data.startDate || "",
          endDate: data.endDate || "",
          visibility: data.visibility || "public",
          joinCode: data.joinCode || "",
        });
      }
    });
  }, [confId]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(`/api/conferences/${confId}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setMessage("Settings saved");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!conf) return <div className="text-secondary text-sm">Loading settings...</div>;

  const Field = ({ label, field, type = "text", placeholder = "" }) => (
    <div className="mb-4">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      {type === "textarea" ? (
        <textarea
          value={form[field] || ""}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-surface-container-high p-3 text-on-surface text-sm
            border-0 border-b-2 border-transparent focus:border-primary focus:outline-none resize-none"
        />
      ) : (
        <input
          type={type}
          value={form[field] || ""}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          placeholder={placeholder}
          className="w-full bg-surface-container-high p-3 text-on-surface text-sm
            border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
        />
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          Conference Settings
        </h2>
      </div>

      <div className="bg-surface-container-lowest p-6 max-w-2xl">
        <Field label="Name" field="name" placeholder="Conference name" />
        <Field label="Description" field="description" type="textarea" placeholder="Conference description" />
        <Field label="Start Date" field="startDate" type="date" />
        <Field label="End Date" field="endDate" type="date" />

        <div className="mb-4">
          <label className="block text-secondary text-xs uppercase tracking-wider mb-2">Visibility</label>
          <div className="flex gap-3">
            {["public", "private"].map((v) => (
              <button
                key={v}
                onClick={() => setForm({ ...form, visibility: v })}
                className={`px-4 py-2 text-sm font-headline uppercase tracking-wider transition-colors duration-50 ${
                  form.visibility === v
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-secondary hover:text-on-surface"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {form.visibility === "private" && (
          <div className="mb-4">
            <label className="block text-secondary text-xs uppercase tracking-wider mb-1">Join Code</label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={form.joinCode || ""}
                onChange={(e) => setForm({ ...form, joinCode: e.target.value.toUpperCase() })}
                className="bg-surface-container-high p-3 text-on-surface text-sm font-mono
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none w-48"
              />
              <span className="text-secondary text-xs">Share this code with invitees</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-on-primary px-6 py-2 text-sm font-headline uppercase tracking-wider
              hover:bg-primary-container transition-colors duration-50 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {message && (
            <span className={`text-sm ${message.startsWith("Error") ? "text-primary" : "text-[#27AE60]"}`}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/admin/AdminSettings.jsx
git commit -m "feat: add AdminSettings page for conference configuration"
```

---

## Task 6: Admin Sessions Page

**Files:**
- Create: `src/components/admin/AdminSessions.jsx`

- [ ] **Step 1: Write the session management page**

Write to `src/components/admin/AdminSessions.jsx`:

```jsx
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";

export default function AdminSessions() {
  const { confId } = useParams();
  const [sessions, setSessions] = useState([]);
  const [search, setSearch] = useState("");
  const [editModal, setEditModal] = useState(null); // null | { mode: "add"|"edit", session: {} }
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "conferences", confId, "sessions"),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        setSessions(arr);
      }
    );
  }, [confId]);

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.code?.toLowerCase().includes(q) ||
      s.mainTopic?.toLowerCase().includes(q)
    );
  });

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setUploadResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const sessionsArr = Array.isArray(json) ? json : json.sessions || [json];

      const result = await apiFetch(`/api/conferences/${confId}/sessions/bulk`, {
        method: "POST",
        body: JSON.stringify({ sessions: sessionsArr }),
      });
      setUploadResult(result);
    } catch (err) {
      setUploadResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveSession = async () => {
    if (!editModal) return;
    const { mode, session } = editModal;
    try {
      if (mode === "add") {
        await apiFetch(`/api/conferences/${confId}/sessions`, {
          method: "POST",
          body: JSON.stringify(session),
        });
      } else {
        await apiFetch(`/api/conferences/${confId}/sessions/${session.id}`, {
          method: "PUT",
          body: JSON.stringify(session),
        });
      }
      setEditModal(null);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (sessionId) => {
    setDeleting(sessionId);
    try {
      await apiFetch(`/api/conferences/${confId}/sessions/${sessionId}`, {
        method: "DELETE",
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const SessionField = ({ label, field, type = "text" }) => (
    <div className="mb-3">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      <input
        type={type}
        value={editModal?.session?.[field] || ""}
        onChange={(e) =>
          setEditModal({
            ...editModal,
            session: { ...editModal.session, [field]: e.target.value },
          })
        }
        className="w-full bg-surface-container-high p-2 text-on-surface text-sm
          border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
      />
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          Session Management
        </h2>
      </div>

      {/* Actions bar */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions..."
          className="bg-surface-container-high p-2 text-on-surface text-sm w-64
            border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
        />
        <button
          onClick={() =>
            setEditModal({
              mode: "add",
              session: { code: "", title: "", date: "", start: "", end: "", room: "", format: "", mainTopic: "", url: "" },
            })
          }
          className="bg-primary text-on-primary px-4 py-2 text-xs font-headline uppercase tracking-wider
            hover:bg-primary-container transition-colors duration-50"
        >
          + Add Session
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-surface-container text-secondary px-4 py-2 text-xs font-headline uppercase tracking-wider
            hover:text-on-surface transition-colors disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload JSON"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleBulkUpload}
          className="hidden"
        />
        <span className="text-secondary text-xs">{sessions.length} sessions total</span>
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div className={`p-3 mb-4 text-sm ${uploadResult.error ? "bg-primary/10 text-primary" : "bg-[#27AE60]/10 text-[#27AE60]"}`}>
          {uploadResult.error
            ? `Upload failed: ${uploadResult.error}`
            : `${uploadResult.message}${uploadResult.errors?.length ? ` (${uploadResult.errors.length} errors)` : ""}`}
          <button onClick={() => setUploadResult(null)} className="ml-3 opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {/* Session table */}
      <div className="bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-secondary text-xs uppercase tracking-wider">
              <th className="p-3">Code</th>
              <th className="p-3">Title</th>
              <th className="p-3">Date</th>
              <th className="p-3">Time</th>
              <th className="p-3">Room</th>
              <th className="p-3 w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-surface-dim hover:bg-surface-container-low">
                <td className="p-3 text-primary font-mono text-xs">{s.code}</td>
                <td className="p-3 text-on-surface">{s.title}</td>
                <td className="p-3 text-secondary">{s.date}</td>
                <td className="p-3 text-secondary">{s.start}–{s.end}</td>
                <td className="p-3 text-secondary">{s.room}</td>
                <td className="p-3">
                  <button
                    onClick={() => setEditModal({ mode: "edit", session: { ...s } })}
                    className="text-primary text-xs uppercase tracking-wider mr-3 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deleting === s.id}
                    className="text-secondary text-xs uppercase tracking-wider hover:text-primary disabled:opacity-50"
                  >
                    {deleting === s.id ? "..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-secondary text-sm">
                  {search ? "No sessions match your search" : "No sessions yet. Add one or upload a JSON file."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit/Add Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditModal(null)}>
          <div className="bg-surface-container-lowest p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline text-on-surface font-bold text-base mb-4 uppercase">
              {editModal.mode === "add" ? "Add Session" : "Edit Session"}
            </h3>
            <SessionField label="Session Code" field="code" />
            <SessionField label="Title" field="title" />
            <SessionField label="Date" field="date" type="date" />
            <div className="flex gap-3">
              <div className="flex-1"><SessionField label="Start Time" field="start" type="time" /></div>
              <div className="flex-1"><SessionField label="End Time" field="end" type="time" /></div>
            </div>
            <SessionField label="Room" field="room" />
            <SessionField label="Format" field="format" />
            <SessionField label="Topic" field="mainTopic" />
            <SessionField label="URL" field="url" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditModal(null)}
                className="flex-1 bg-surface-container p-2 text-secondary text-sm uppercase tracking-wider hover:text-on-surface">
                Cancel
              </button>
              <button onClick={handleSaveSession}
                className="flex-1 bg-primary text-on-primary p-2 text-sm font-headline uppercase tracking-wider hover:bg-primary-container">
                {editModal.mode === "add" ? "Create" : "Save"}
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
git add src/components/admin/AdminSessions.jsx
git commit -m "feat: add AdminSessions page with table, search, CRUD, and bulk upload"
```

---

## Task 7: Admin Applications Page

**Files:**
- Create: `src/components/admin/AdminApplications.jsx`

- [ ] **Step 1: Write the applications management page**

Write to `src/components/admin/AdminApplications.jsx`:

```jsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";

export default function AdminApplications() {
  const { confId } = useParams();
  const [members, setMembers] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [processing, setProcessing] = useState(null);
  const [filter, setFilter] = useState("pending"); // "pending" | "approved" | "all"

  useEffect(() => {
    return onSnapshot(
      collection(db, "conferences", confId, "members"),
      async (snap) => {
        const arr = snap.docs.map((d) => ({ userId: d.id, ...d.data() }));
        setMembers(arr);

        // Fetch user names for each member
        const names = {};
        for (const m of arr) {
          if (m.legacyName) {
            names[m.userId] = m.legacyName + " (legacy)";
          } else {
            try {
              const userSnap = await getDoc(doc(db, "users", m.userId));
              names[m.userId] = userSnap.exists()
                ? userSnap.data().displayName || userSnap.data().email
                : m.userId;
            } catch {
              names[m.userId] = m.userId;
            }
          }
        }
        setUserNames(names);
      }
    );
  }, [confId]);

  const handleApprove = async (userId) => {
    setProcessing(userId);
    try {
      await apiFetch(`/api/conferences/${confId}/members/approve`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId) => {
    setProcessing(userId);
    try {
      await apiFetch(`/api/conferences/${confId}/members/reject`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = members.filter((m) => {
    if (filter === "all") return true;
    return m.status === filter;
  });

  const pendingCount = members.filter((m) => m.status === "pending").length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          Member Applications
        </h2>
        {pendingCount > 0 && (
          <span className="bg-[#E67E22]/10 text-[#E67E22] text-xs px-2 py-0.5 uppercase tracking-wider">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {[
          { key: "pending", label: "Pending" },
          { key: "approved", label: "Approved" },
          { key: "all", label: "All" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${
              filter === f.key
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-secondary hover:text-on-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Members list */}
      <div className="bg-surface-container-lowest">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-secondary text-sm">
            {filter === "pending" ? "No pending applications" : "No members found"}
          </div>
        )}
        {filtered.map((m) => (
          <div key={m.userId} className="p-4 border-b border-surface-dim flex justify-between items-center">
            <div>
              <div className="text-on-surface font-bold text-sm">
                {userNames[m.userId] || m.userId}
              </div>
              <div className="text-secondary text-xs mt-1 flex gap-3">
                <span>{m.attendanceMode || "onsite"}</span>
                <span>Role: {m.role}</span>
                <span className={`uppercase tracking-wider ${
                  m.status === "approved" ? "text-[#27AE60]" :
                  m.status === "pending" ? "text-[#E67E22]" :
                  "text-primary"
                }`}>
                  {m.status}
                </span>
              </div>
            </div>
            {m.status === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(m.userId)}
                  disabled={processing === m.userId}
                  className="bg-[#27AE60] text-white px-4 py-1.5 text-xs font-headline uppercase tracking-wider
                    hover:opacity-80 transition-opacity disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(m.userId)}
                  disabled={processing === m.userId}
                  className="bg-surface-container text-secondary px-4 py-1.5 text-xs font-headline uppercase tracking-wider
                    hover:text-primary transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/admin/AdminApplications.jsx
git commit -m "feat: add AdminApplications page with approve/reject actions"
```

---

## Task 8: Admin Reports Page

**Files:**
- Create: `src/components/admin/AdminReports.jsx`

- [ ] **Step 1: Write the report management page**

Write to `src/components/admin/AdminReports.jsx`:

```jsx
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";
import { parseReportId } from "../../shared";

export default function AdminReports() {
  const { confId } = useParams();
  const [reports, setReports] = useState([]);
  const [publishing, setPublishing] = useState(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "conferences", confId, "dailyReports"),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => b.id.localeCompare(a.id));
        setReports(arr);
      }
    );
  }, [confId]);

  const handlePublish = async (reportId) => {
    setPublishing(reportId);
    try {
      await apiFetch(`/api/conferences/${confId}/reports/${reportId}/publish`, {
        method: "POST",
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setPublishing(null);
    }
  };

  const handleUnpublish = async (reportId) => {
    setPublishing(reportId);
    try {
      await apiFetch(`/api/conferences/${confId}/reports/${reportId}/publish`, {
        method: "DELETE",
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setPublishing(null);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case "published": return "text-[#27AE60]";
      case "archived": return "text-secondary";
      default: return "text-[#E67E22]";
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          Report Management
        </h2>
      </div>

      <div className="bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-secondary text-xs uppercase tracking-wider">
              <th className="p-3">Report</th>
              <th className="p-3">Status</th>
              <th className="p-3">Published</th>
              <th className="p-3 w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const { date } = parseReportId(r.id);
              const isSummary = r.id.startsWith("summary-");
              return (
                <tr key={r.id} className="border-t border-surface-dim hover:bg-surface-container-low">
                  <td className="p-3">
                    <Link
                      to={`/conference/${confId}/report/${r.id}`}
                      className="text-on-surface hover:text-primary"
                    >
                      {r.title || r.id}
                    </Link>
                    <div className="text-secondary text-xs mt-0.5">
                      {isSummary ? "Summary Report" : `Daily · ${date}`}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs uppercase tracking-wider ${statusColor(r.status)}`}>
                      {r.status || "draft"}
                    </span>
                  </td>
                  <td className="p-3 text-secondary text-xs">
                    {r.publishedAt
                      ? new Date(r.publishedAt.seconds * 1000).toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-3">
                    {r.status === "published" ? (
                      <button
                        onClick={() => handleUnpublish(r.id)}
                        disabled={publishing === r.id}
                        className="text-secondary text-xs uppercase tracking-wider hover:text-primary disabled:opacity-50"
                      >
                        {publishing === r.id ? "..." : "Unpublish"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublish(r.id)}
                        disabled={publishing === r.id}
                        className="text-primary text-xs uppercase tracking-wider hover:underline disabled:opacity-50"
                      >
                        {publishing === r.id ? "..." : "Publish"}
                      </button>
                    )}
                    {r.publishedUrl && (
                      <a
                        href={r.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary text-xs uppercase tracking-wider ml-3 hover:text-on-surface"
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {reports.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-secondary text-sm">
                  No reports yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/admin/AdminReports.jsx
git commit -m "feat: add AdminReports page with publish/unpublish management"
```

---

## Task 9: Super Admin Panel

**Files:**
- Create: `src/components/admin/SuperAdminPanel.jsx`

- [ ] **Step 1: Write the super admin panel**

Write to `src/components/admin/SuperAdminPanel.jsx`:

```jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/api";

export default function SuperAdminPanel() {
  const { isSuperAdmin } = useAuth();
  const [conferences, setConferences] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", startDate: "", endDate: "", visibility: "public" });
  const [creating, setCreating] = useState(false);
  const [assignForm, setAssignForm] = useState({ email: "", confId: "" });
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "conferences"), (snap) => {
      setConferences(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setMessage("");
    try {
      const result = await apiFetch("/api/conferences", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      setMessage(`Created: ${result.name} (ID: ${result.id})`);
      setShowCreate(false);
      setCreateForm({ name: "", description: "", startDate: "", endDate: "", visibility: "public" });
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleAssignAdmin = async () => {
    setAssigning(true);
    setMessage("");
    try {
      // Look up user by email — scan users collection
      const usersSnap = await import("firebase/firestore").then(({ getDocs, query, where, collection: col }) =>
        getDocs(query(col(db, "users"), where("email", "==", assignForm.email)))
      );

      if (usersSnap.empty) {
        setMessage(`Error: No user found with email ${assignForm.email}`);
        setAssigning(false);
        return;
      }

      const userId = usersSnap.docs[0].id;
      await apiFetch("/api/admin/set-role", {
        method: "POST",
        body: JSON.stringify({
          userId,
          confId: assignForm.confId,
          confRole: "admin",
        }),
      });
      setMessage(`Assigned admin role to ${assignForm.email}`);
      setAssignForm({ email: "", confId: "" });
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setAssigning(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-primary font-headline uppercase">Super Admin access required</p>
      </div>
    );
  }

  const Field = ({ label, value, onChange, type = "text", placeholder = "" }) => (
    <div className="mb-3">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-surface-container-high p-2 text-on-surface text-sm
          border-0 border-b-2 border-transparent focus:border-primary focus:outline-none" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-primary p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="font-headline text-on-primary text-lg font-bold tracking-tight uppercase">
            Super Admin
          </h1>
          <Link to="/dashboard" className="text-on-primary/70 text-xs uppercase tracking-wider hover:text-on-primary">
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {message && (
          <div className={`p-3 mb-4 text-sm ${message.startsWith("Error") ? "bg-primary/10 text-primary" : "bg-[#27AE60]/10 text-[#27AE60]"}`}>
            {message}
            <button onClick={() => setMessage("")} className="ml-3 opacity-50 hover:opacity-100">×</button>
          </div>
        )}

        {/* Conferences */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-1 h-5 bg-primary inline-block"></span>
              <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
                All Conferences ({conferences.length})
              </h2>
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-primary text-on-primary px-4 py-2 text-xs font-headline uppercase tracking-wider
                hover:bg-primary-container transition-colors duration-50"
            >
              + Create Conference
            </button>
          </div>

          {showCreate && (
            <div className="bg-surface-container-lowest p-6 mb-4">
              <h3 className="font-headline text-on-surface font-bold text-sm mb-3 uppercase">New Conference</h3>
              <Field label="Name" value={createForm.name} onChange={(v) => setCreateForm({ ...createForm, name: v })} placeholder="Conference name" />
              <Field label="Description" value={createForm.description} onChange={(v) => setCreateForm({ ...createForm, description: v })} placeholder="Description" />
              <div className="flex gap-3">
                <div className="flex-1"><Field label="Start Date" value={createForm.startDate} onChange={(v) => setCreateForm({ ...createForm, startDate: v })} type="date" /></div>
                <div className="flex-1"><Field label="End Date" value={createForm.endDate} onChange={(v) => setCreateForm({ ...createForm, endDate: v })} type="date" /></div>
              </div>
              <div className="mb-3">
                <label className="block text-secondary text-xs uppercase tracking-wider mb-2">Visibility</label>
                <div className="flex gap-3">
                  {["public", "private"].map((v) => (
                    <button key={v} onClick={() => setCreateForm({ ...createForm, visibility: v })}
                      className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${
                        createForm.visibility === v ? "bg-primary text-on-primary" : "bg-surface-container text-secondary"
                      }`}>{v}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleCreate} disabled={creating || !createForm.name || !createForm.startDate || !createForm.endDate}
                className="bg-primary text-on-primary px-6 py-2 text-sm font-headline uppercase tracking-wider
                  hover:bg-primary-container disabled:opacity-50">
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          )}

          {conferences.map((conf) => (
            <div key={conf.id} className="bg-surface-container-lowest p-4 mb-2 flex justify-between items-center">
              <div>
                <div className="text-on-surface font-bold text-sm">{conf.name}</div>
                <div className="text-secondary text-xs mt-1">
                  {conf.startDate} — {conf.endDate} · {conf.visibility}
                  {conf.joinCode && ` · Code: ${conf.joinCode}`}
                </div>
              </div>
              <Link
                to={`/conference/${conf.id}/admin/settings`}
                className="text-primary text-xs uppercase tracking-wider hover:underline"
              >
                Manage
              </Link>
            </div>
          ))}
        </section>

        {/* Assign Admin */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-5 bg-primary inline-block"></span>
            <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
              Assign Conference Admin
            </h2>
          </div>
          <div className="bg-surface-container-lowest p-6 max-w-lg">
            <Field label="User Email" value={assignForm.email} onChange={(v) => setAssignForm({ ...assignForm, email: v })} placeholder="user@example.com" />
            <div className="mb-3">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">Conference</label>
              <select
                value={assignForm.confId}
                onChange={(e) => setAssignForm({ ...assignForm, confId: e.target.value })}
                className="w-full bg-surface-container-high p-2 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
              >
                <option value="">Select conference...</option>
                {conferences.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button onClick={handleAssignAdmin} disabled={assigning || !assignForm.email || !assignForm.confId}
              className="bg-primary text-on-primary px-6 py-2 text-sm font-headline uppercase tracking-wider
                hover:bg-primary-container disabled:opacity-50">
              {assigning ? "Assigning..." : "Assign Admin"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/components/admin/SuperAdminPanel.jsx
git commit -m "feat: add SuperAdminPanel with conference creation and admin assignment"
```

---

## Task 10: Register Admin Routes in Router

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Add admin route imports and routes**

Add the following imports to `src/main.jsx` after the existing imports:

```jsx
import AdminLayout from "./components/admin/AdminLayout";
import AdminSettings from "./components/admin/AdminSettings";
import AdminSessions from "./components/admin/AdminSessions";
import AdminApplications from "./components/admin/AdminApplications";
import AdminReports from "./components/admin/AdminReports";
import SuperAdminPanel from "./components/admin/SuperAdminPanel";
```

Add these routes inside the `<Routes>` block, after the existing authenticated routes and before the legacy redirects:

```jsx
          {/* Admin routes */}
          <Route path="/conference/:confId/admin" element={
            <AuthGuard><AdminLayout /></AuthGuard>
          }>
            <Route index element={<AdminSettings />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="sessions" element={<AdminSessions />} />
            <Route path="applications" element={<AdminApplications />} />
            <Route path="reports" element={<AdminReports />} />
          </Route>

          <Route path="/super-admin" element={
            <AuthGuard requireSuperAdmin><SuperAdminPanel /></AuthGuard>
          } />
```

- [ ] **Step 2: Verify the app builds**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
git add src/main.jsx
git commit -m "feat: register admin and super-admin routes in router"
```

---

## Task 11: Add Admin Link to Conference View

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add admin link in App.jsx header**

In `src/App.jsx`, find the header actions area (near the `日报管理` link, around line 674). Add an admin link after it, conditionally shown for admins:

```jsx
import { useMembership } from "./hooks/useMembership";
```

Inside the component, add:
```jsx
const { isAdmin } = useMembership(confId);
```

Then in the header actions area, after the 日报管理 Link, add:

```jsx
{isAdmin && (
  <Link to={`/conference/${confId}/admin/settings`} className="btn-accent schedule-header-report-link">
    Admin
  </Link>
)}
```

- [ ] **Step 2: Verify the app builds**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add admin panel link to conference header for admin users"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Session CRUD API | `conference-api/.../sessions/route.js`, `.../[sessionId]/route.js` |
| 2 | Bulk session upload API | `conference-api/.../sessions/bulk/route.js` |
| 3 | Report publish/unpublish API | `conference-api/.../reports/[reportId]/publish/route.js` |
| 4 | Admin layout with tabs | `src/components/admin/AdminLayout.jsx` |
| 5 | Admin settings page | `src/components/admin/AdminSettings.jsx` |
| 6 | Admin sessions page | `src/components/admin/AdminSessions.jsx` |
| 7 | Admin applications page | `src/components/admin/AdminApplications.jsx` |
| 8 | Admin reports page | `src/components/admin/AdminReports.jsx` |
| 9 | Super admin panel | `src/components/admin/SuperAdminPanel.jsx` |
| 10 | Register admin routes | `src/main.jsx` |
| 11 | Admin link in conference | `src/App.jsx` |
