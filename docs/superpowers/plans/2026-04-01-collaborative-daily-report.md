# Collaborative Daily Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collaboration features to the existing daily report editor — block ownership, presence indicators, author attribution with colored borders, and activity timestamps — without changing the existing page layout.

**Architecture:** Additive layer on existing DailyReport.jsx. New fields (`ownerId`, `lastEditedBy`, `lastEditedAt`) added to block objects on creation and edit. Presence tracked via Firestore heartbeat documents. Member color data loaded from conference membership docs. IntelCard enhanced with owner border and edit restriction. Toolbar gains presence avatars.

**Tech Stack:** React 18, Firebase Firestore (real-time listeners + heartbeat docs), existing shared.jsx utilities (COLORS, EditableField)

---

## File Structure

### New Files

```
src/components/report/
├── PresenceBar.jsx              # Toolbar presence avatars + online count
└── usePresence.js               # Hook: write heartbeat, listen to active users
```

### Modified Files

```
src/DailyReport.jsx              # Load member data with colors, pass user info to blocks,
                                 #   add ownerId/lastEditedBy on block create/edit,
                                 #   integrate PresenceBar in toolbar
src/sections/VoicesSection.jsx   # Add owner border + edit restriction + timestamps
```

---

## Task 1: Presence Hook

**Files:**
- Create: `src/components/report/usePresence.js`

- [ ] **Step 1: Write the presence hook**

Write to `src/components/report/usePresence.js`:

```javascript
import { useState, useEffect, useCallback } from "react";
import { doc, setDoc, deleteDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const OFFLINE_THRESHOLD = 60000;  // 60 seconds

/**
 * Writes heartbeat to Firestore and listens to other active users.
 * Returns { activeUsers: [{uid, displayName, colorIndex, lastSeen}] }
 */
export function usePresence(confId, reportId) {
  const { user, userProfile } = useAuth();
  const [activeUsers, setActiveUsers] = useState([]);

  // Write heartbeat
  useEffect(() => {
    if (!user || !confId || !reportId) return;

    const presenceRef = doc(db, "conferences", confId, "dailyReports", reportId, "presence", user.uid);

    const writeHeartbeat = () => {
      setDoc(presenceRef, {
        displayName: userProfile?.displayName || user.displayName || "Anonymous",
        email: userProfile?.email || user.email || "",
        lastSeen: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    };

    // Write immediately, then every 30s
    writeHeartbeat();
    const interval = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL);

    // Cleanup: remove presence on unmount
    return () => {
      clearInterval(interval);
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [user, confId, reportId, userProfile]);

  // Listen to all presence docs
  useEffect(() => {
    if (!confId || !reportId) return;

    return onSnapshot(
      collection(db, "conferences", confId, "dailyReports", reportId, "presence"),
      (snap) => {
        const now = Date.now();
        const users = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const lastSeen = data.lastSeen?.toMillis?.() || 0;
          // Only include users seen within threshold
          if (now - lastSeen < OFFLINE_THRESHOLD) {
            users.push({
              uid: d.id,
              displayName: data.displayName || d.id,
              email: data.email || "",
              lastSeen,
            });
          }
        });
        setActiveUsers(users);
      }
    );
  }, [confId, reportId]);

  return { activeUsers };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/report/usePresence.js
git commit -m "feat: add usePresence hook with Firestore heartbeat and active user tracking"
```

---

## Task 2: Presence Bar Component

**Files:**
- Create: `src/components/report/PresenceBar.jsx`

- [ ] **Step 1: Write the presence bar component**

Write to `src/components/report/PresenceBar.jsx`:

```jsx
import { COLORS } from "../../shared";

/**
 * Displays active collaborator avatars in the toolbar.
 * Props:
 *   activeUsers: [{uid, displayName, email}]
 *   memberColorMap: {uid: colorIndex}
 *   currentUid: string
 */
export default function PresenceBar({ activeUsers, memberColorMap, currentUid }) {
  if (activeUsers.length <= 1) return null; // Only show when others are present

  const others = activeUsers.filter((u) => u.uid !== currentUid);
  if (others.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex" }}>
        {others.slice(0, 5).map((u, i) => {
          const colorIdx = memberColorMap[u.uid] ?? 0;
          const color = COLORS[colorIdx]?.hex || "#5f5e5e";
          const initial = (u.displayName || "?").charAt(0).toUpperCase();
          return (
            <div
              key={u.uid}
              title={u.displayName}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: color,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'Work Sans', sans-serif",
                marginLeft: i > 0 ? -6 : 0,
                border: "2px solid var(--bg, #fff)",
                zIndex: 5 - i,
                position: "relative",
              }}
            >
              {initial}
            </div>
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: "var(--text-muted, #999)" }}>
        {others.length} online
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/report/PresenceBar.jsx
git commit -m "feat: add PresenceBar component with overlapping avatar circles"
```

---

## Task 3: Add ownerId and Timestamps to Block Operations

**Files:**
- Modify: `src/DailyReport.jsx`

This task modifies the block creation and update functions to include `ownerId`, `lastEditedBy`, and `lastEditedAt`.

- [ ] **Step 1: Update addBlock to include ownerId**

Find the `addBlock` function (around line 673):

```javascript
const addBlock = useCallback((field, type) => {
  const newBlock = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), type, content: "" };
  saveField(field, [...(reportDataRef.current?.[field] || []), newBlock]);
}, [saveField]);
```

Replace with:

```javascript
const addBlock = useCallback((field, type) => {
  const newBlock = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    type, content: "",
    ownerId: user?.uid || "",
    contributorIds: user?.uid ? [user.uid] : [],
    lastEditedBy: user?.uid || "",
    lastEditedAt: Date.now(),
  };
  saveField(field, [...(reportDataRef.current?.[field] || []), newBlock]);
}, [saveField, user]);
```

- [ ] **Step 2: Update insertBlock similarly**

Find `insertBlock` (around line 683):

```javascript
const insertBlock = useCallback((field, type, afterId) => {
  const newBlock = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), type, content: "" };
```

Replace the `newBlock` line with:

```javascript
  const newBlock = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    type, content: "",
    ownerId: user?.uid || "",
    contributorIds: user?.uid ? [user.uid] : [],
    lastEditedBy: user?.uid || "",
    lastEditedAt: Date.now(),
  };
```

Update the dependency array to include `user`.

- [ ] **Step 3: Update updateBlockFields to track last editor**

Find `updateBlockFields` (around line 691):

```javascript
const updateBlockFields = useCallback((field, id, fields) => {
  saveField(field, (reportDataRef.current?.[field] || []).map(b => b.id === id ? { ...b, ...fields } : b));
}, [saveField]);
```

Replace with:

```javascript
const updateBlockFields = useCallback((field, id, fields) => {
  saveField(field, (reportDataRef.current?.[field] || []).map(b => {
    if (b.id !== id) return b;
    return { ...b, ...fields, lastEditedBy: user?.uid || b.lastEditedBy, lastEditedAt: Date.now() };
  }));
}, [saveField, user]);
```

- [ ] **Step 4: Commit**

```bash
git add src/DailyReport.jsx
git commit -m "feat: add ownerId, lastEditedBy, lastEditedAt to block operations"
```

---

## Task 4: Load Member Colors and Integrate Presence

**Files:**
- Modify: `src/DailyReport.jsx`

- [ ] **Step 1: Import presence hook and PresenceBar**

Add imports near the top of DailyReport.jsx:

```javascript
import { usePresence } from "./components/report/usePresence";
import PresenceBar from "./components/report/PresenceBar";
import { COLORS } from "./shared";
```

- [ ] **Step 2: Build memberColorMap from members data**

After the existing `memberMap` useMemo (around line 611), add:

```javascript
const memberColorMap = useMemo(() => {
  const map = {};
  members.forEach((m) => {
    map[m.id || m.userId] = m.colorIndex ?? 0;
  });
  return map;
}, [members]);
```

- [ ] **Step 3: Add presence hook**

After the memberColorMap, add:

```javascript
const { activeUsers } = usePresence(confId, reportId);
```

- [ ] **Step 4: Add PresenceBar to toolbar**

In the toolbar area (around line 1380, in the right side of the toolbar), add the PresenceBar before the save status indicators:

```jsx
<PresenceBar
  activeUsers={activeUsers}
  memberColorMap={memberColorMap}
  currentUid={user?.uid}
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/DailyReport.jsx
git commit -m "feat: integrate presence tracking and PresenceBar in report toolbar"
```

---

## Task 5: Block Author Attribution in IntelCard

**Files:**
- Modify: `src/DailyReport.jsx` (the IntelCard component, lines 115-228)

- [ ] **Step 1: Add owner color border and activity timestamp to IntelCard**

Find the IntelCard component. It currently starts with:

```jsx
<div className="intel-card">
```

Update IntelCard to accept new props and render owner attribution:

Add new props to IntelCard:
```javascript
function IntelCard({ block, onUpdate, onRemove, members = [], placeholder = "记录内容...", readOnly = false, currentUid, memberColorMap }) {
```

Get the owner's color for the left border:

```javascript
const ownerColorIdx = memberColorMap?.[block.ownerId] ?? null;
const ownerColor = ownerColorIdx !== null ? (COLORS[ownerColorIdx]?.hex || "#5f5e5e") : null;
const isOwner = currentUid && block.ownerId === currentUid;
const isEditable = !readOnly && (!block.ownerId || isOwner);
```

Find the last editor info:

```javascript
const lastEditor = block.lastEditedBy ? members.find(m => m.id === block.lastEditedBy)?.name : null;
const editedAgo = block.lastEditedAt ? Math.round((Date.now() - block.lastEditedAt) / 60000) : null;
const editLabel = lastEditor
  ? (editedAgo !== null && editedAgo < 60 ? `${lastEditor} · ${editedAgo}m ago` : lastEditor)
  : null;
```

Update the outer div to include the owner color border:

```jsx
<div className="intel-card" style={ownerColor ? { borderLeft: `3px solid ${ownerColor}` } : undefined}>
```

Add an activity label after the remove button:

```jsx
{editLabel && (
  <div style={{ fontSize: 10, color: "var(--text-dim)", padding: "0 12px 6px", textAlign: "right" }}>
    {editLabel}
  </div>
)}
```

Pass `readOnly={!isEditable}` to the EditableField instead of the parent `readOnly`.

- [ ] **Step 2: Update all IntelCard usages to pass new props**

Search for `<IntelCard` in DailyReport.jsx. Each usage needs to add:

```jsx
currentUid={user?.uid}
memberColorMap={memberColorMap}
```

- [ ] **Step 3: Commit**

```bash
git add src/DailyReport.jsx
git commit -m "feat: add owner color border and activity timestamps to IntelCard"
```

---

## Task 6: Auto-set Contributor on Session Field Edit

**Files:**
- Modify: `src/DailyReport.jsx`

- [ ] **Step 1: Update saveSessionField to track last editor**

Find `saveSessionField` (around line 759):

```javascript
const saveSessionField = useCallback((code, field, value) => {
  if (!user) return;
  debouncedSave(`${code}.${field}`, () => {
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
      sessions: { [code]: { [field]: value } }
    }, { merge: true }).catch(console.error);
  });
}, [user, reportId, debouncedSave]);
```

Replace with:

```javascript
const saveSessionField = useCallback((code, field, value) => {
  if (!user) return;
  debouncedSave(`${code}.${field}`, () => {
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
      sessions: { [code]: { [field]: value, lastEditedBy: user.uid, lastEditedAt: Date.now() } }
    }, { merge: true }).catch(console.error);
  });
}, [user, reportId, debouncedSave, confId]);
```

- [ ] **Step 2: Add "last edited by" display to session contributor row**

Find the contributor row in session rendering (around line 1742-1747):

```jsx
{contributors && (
  <div className="report-contributors-row">
    <span className="report-contributors-label">贡献人</span>
    <span className="report-contributors-names">{contributors}</span>
  </div>
)}
```

Replace with:

```jsx
<div className="report-contributors-row">
  <span className="report-contributors-label">贡献人</span>
  <span className="report-contributors-names">
    {contributorNames.length > 0 ? contributorNames.map((name, i) => {
      const uid = Array.from(session.attendees)[i];
      const colorIdx = memberColorMap[uid] ?? 0;
      const color = COLORS[colorIdx]?.hex || "#5f5e5e";
      return (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2, marginRight: 6 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, background: color, borderRadius: 0, flexShrink: 0 }} />
          {name}
        </span>
      );
    }) : null}
  </span>
  {sd.lastEditedBy && (() => {
    const editorName = members.find(m => m.id === sd.lastEditedBy)?.name || "";
    const ago = sd.lastEditedAt ? Math.round((Date.now() - sd.lastEditedAt) / 60000) : null;
    if (!editorName) return null;
    return (
      <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: "auto" }}>
        edited by {editorName}{ago !== null && ago < 60 ? ` · ${ago}m ago` : ""}
      </span>
    );
  })()}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/DailyReport.jsx
git commit -m "feat: track last editor on session fields and show colored contributor pills"
```

---

## Task 7: Build Verification

- [ ] **Step 1: Verify build**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
npm run build
```

Expected: Build passes with no errors.

- [ ] **Step 2: Commit any fixes**

If build errors found, fix and commit.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Presence hook (heartbeat + listener) | `src/components/report/usePresence.js` |
| 2 | Presence bar (avatar circles + count) | `src/components/report/PresenceBar.jsx` |
| 3 | ownerId + timestamps on block CRUD | `src/DailyReport.jsx` |
| 4 | Member colors + presence integration | `src/DailyReport.jsx` |
| 5 | IntelCard owner border + edit restriction | `src/DailyReport.jsx` |
| 6 | Session field last-editor tracking | `src/DailyReport.jsx` |
| 7 | Build verification | — |
