# Calendar Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current GTC-specific schedule view with a three-panel brutalist calendar page — session pool (left), personal schedule grid (center), session detail panel (right) — following the "Architectural Dispatch" design system.

**Architecture:** New `CalendarPage` component replaces `App.jsx` as the conference landing page. Built from 4 focused sub-components (SessionPool, ScheduleGrid, SessionDetail, CalendarHeader) that communicate via shared state in the parent. Real-time Firestore listeners for sessions and members. Attendance toggling writes directly to Firestore.

**Tech Stack:** React 18, Tailwind CSS 3 (brutalist tokens), Firebase Firestore (real-time listeners), Lucide React icons

---

## File Structure

### New Files

```
src/components/calendar/
├── CalendarPage.jsx          # Parent: state management, Firestore listeners, three-panel layout
├── CalendarHeader.jsx        # Full-bleed red header with conference name + actions
├── SessionPool.jsx           # Left panel: searchable/filterable session list
├── ScheduleGrid.jsx          # Center panel: multi-day grid with user's sessions
├── SessionDetail.jsx         # Right panel: selected session info + attendees
└── calendar.css              # All calendar-specific styles
```

### Modified Files

```
src/main.jsx                  # Change /conference/:confId route to CalendarPage
```

### Preserved Files (not modified)

```
src/App.jsx                   # Kept as legacy fallback, not deleted
```

---

## Task 1: Calendar CSS Foundation

**Files:**
- Create: `src/components/calendar/calendar.css`

- [ ] **Step 1: Write the calendar styles**

Write to `src/components/calendar/calendar.css`:

```css
/* ── Calendar Page: Three-Panel Layout ─────────────────────────────────── */

.cal-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #1a1c1c;
  color: #f9f9f9;
}

/* ── Header ────────────────────────────────────────────────────────────── */

.cal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #a20513;
  color: #fff;
  flex-shrink: 0;
}

.cal-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cal-header-title {
  font-family: "Work Sans", sans-serif;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.5px;
}

.cal-header-sep {
  opacity: 0.5;
}

.cal-header-label {
  font-size: 13px;
  opacity: 0.8;
}

.cal-header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.cal-header-btn {
  padding: 6px 14px;
  font-family: "Work Sans", sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 50ms;
  text-decoration: none;
}

.cal-header-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.cal-header-btn--accent {
  background: rgba(255, 255, 255, 0.25);
}

/* ── Three-Panel Body ──────────────────────────────────────────────────── */

.cal-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Left Panel: Session Pool ──────────────────────────────────────────── */

.cal-pool {
  width: 280px;
  flex-shrink: 0;
  background: #222;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cal-pool-header {
  padding: 14px 14px 0;
}

.cal-pool-title {
  font-family: "Work Sans", sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #a20513;
  margin-bottom: 10px;
}

.cal-pool-search {
  width: 100%;
  padding: 8px 10px;
  background: #2a2a2a;
  border: none;
  color: #ddd;
  font-size: 12px;
  font-family: "Inter", sans-serif;
  outline: none;
  margin-bottom: 10px;
}

.cal-pool-search::placeholder {
  color: #666;
}

.cal-pool-search:focus {
  border-bottom: 2px solid #a20513;
}

.cal-pool-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 14px 12px;
}

.cal-pool-filter {
  padding: 3px 8px;
  font-size: 10px;
  font-family: "Work Sans", sans-serif;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  background: #333;
  color: #888;
  border: none;
  cursor: pointer;
  transition: all 50ms;
}

.cal-pool-filter--active {
  background: #a20513;
  color: #fff;
}

.cal-pool-filter:hover:not(.cal-pool-filter--active) {
  color: #ccc;
}

.cal-pool-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px 14px;
}

.cal-pool-card {
  background: #2a2a2a;
  border-left: 3px solid #a20513;
  padding: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 50ms;
}

.cal-pool-card:hover {
  background: #333;
}

.cal-pool-card--selected {
  background: #333;
  border-left-color: #fff;
}

.cal-pool-card--scheduled {
  border-left-color: #27AE60;
}

.cal-pool-card-title {
  font-size: 12px;
  font-weight: 600;
  color: #ddd;
  line-height: 1.4;
  margin-bottom: 4px;
}

.cal-pool-card-meta {
  font-size: 10px;
  color: #888;
}

/* ── Center Panel: Schedule Grid ───────────────────────────────────────── */

.cal-grid {
  flex: 1;
  overflow: auto;
  padding: 14px;
}

.cal-grid-label {
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #555;
  margin-bottom: 10px;
  font-family: "Work Sans", sans-serif;
  font-weight: 600;
}

.cal-grid-table {
  display: grid;
  gap: 1px;
  width: 100%;
}

.cal-grid-day-header {
  background: #2a2a2a;
  padding: 10px;
  text-align: center;
  font-family: "Work Sans", sans-serif;
  font-weight: 700;
  font-size: 12px;
  color: #a20513;
  letter-spacing: 0.5px;
}

.cal-grid-time-label {
  padding: 10px 6px;
  text-align: right;
  font-size: 10px;
  color: #555;
  font-family: "Inter", sans-serif;
}

.cal-grid-cell {
  background: #2a2a2a;
  min-height: 64px;
  padding: 4px;
}

.cal-grid-cell-sessions {
  display: flex;
  gap: 3px;
}

.cal-grid-session {
  flex: 1;
  background: #a20513;
  padding: 6px 8px;
  cursor: pointer;
  transition: opacity 50ms;
  min-width: 0;
}

.cal-grid-session:hover {
  opacity: 0.85;
}

.cal-grid-session--selected {
  outline: 2px solid #fff;
  outline-offset: -2px;
}

.cal-grid-session-time {
  font-size: 9px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 2px;
}

.cal-grid-session-title {
  font-size: 10px;
  color: #fff;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.cal-grid-session-avatars {
  display: flex;
  gap: 2px;
  margin-top: 4px;
}

.cal-grid-avatar {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  color: #fff;
}

.cal-grid-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #555;
  font-size: 13px;
  text-align: center;
}

/* ── Right Panel: Session Detail ───────────────────────────────────────── */

.cal-detail {
  width: 280px;
  flex-shrink: 0;
  background: #222;
  border-left: 1px solid #333;
  overflow-y: auto;
  padding: 14px;
}

.cal-detail-title-label {
  font-family: "Work Sans", sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #a20513;
  margin-bottom: 14px;
}

.cal-detail-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
  line-height: 1.3;
}

.cal-detail-meta {
  font-size: 11px;
  color: #555;
  margin-bottom: 4px;
}

.cal-detail-divider {
  height: 1px;
  background: #333;
  margin: 14px 0;
}

.cal-detail-desc {
  font-size: 12px;
  color: #888;
  line-height: 1.6;
}

.cal-detail-section-label {
  font-size: 10px;
  color: #555;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 6px;
  margin-top: 14px;
}

.cal-detail-speaker {
  font-size: 12px;
  color: #ddd;
}

.cal-detail-speaker-role {
  color: #555;
}

.cal-detail-attendees {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.cal-detail-attendee {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cal-detail-attendee-name {
  font-size: 11px;
  color: #fff;
  padding: 2px 10px;
}

.cal-detail-attendee-mode {
  font-size: 10px;
  color: #555;
  padding: 2px 8px;
  background: #2a2a2a;
}

.cal-detail-actions {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cal-detail-btn-primary {
  background: #a20513;
  color: #fff;
  text-align: center;
  padding: 10px;
  font-family: "Work Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: opacity 50ms;
}

.cal-detail-btn-primary:hover {
  opacity: 0.85;
}

.cal-detail-btn-primary--danger {
  background: #333;
  color: #a20513;
}

.cal-detail-btn-secondary {
  background: #333;
  color: #aaa;
  text-align: center;
  padding: 8px;
  font-size: 10px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  display: block;
  transition: color 50ms;
}

.cal-detail-btn-secondary:hover {
  color: #fff;
}

.cal-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #555;
  font-size: 12px;
  text-align: center;
}

/* ── Scrollbar Styling ─────────────────────────────────────────────────── */

.cal-pool-list::-webkit-scrollbar,
.cal-grid::-webkit-scrollbar,
.cal-detail::-webkit-scrollbar {
  width: 6px;
}

.cal-pool-list::-webkit-scrollbar-thumb,
.cal-grid::-webkit-scrollbar-thumb,
.cal-detail::-webkit-scrollbar-thumb {
  background: #444;
}

.cal-pool-list::-webkit-scrollbar-track,
.cal-grid::-webkit-scrollbar-track,
.cal-detail::-webkit-scrollbar-track {
  background: transparent;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/calendar.css
git commit -m "feat: add calendar page CSS with three-panel brutalist layout"
```

---

## Task 2: CalendarHeader Component

**Files:**
- Create: `src/components/calendar/CalendarHeader.jsx`

- [ ] **Step 1: Write the header component**

Write to `src/components/calendar/CalendarHeader.jsx`:

```jsx
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";

export default function CalendarHeader({ confName }) {
  const { confId } = useParams();
  const { userProfile, signOut } = useAuth();
  const { isAdmin } = useMembership(confId);

  return (
    <div className="cal-header">
      <div className="cal-header-left">
        <Link to="/dashboard" className="cal-header-btn" style={{ padding: "4px 10px", fontSize: 10 }}>
          ← Dashboard
        </Link>
        <span className="cal-header-title">{confName || "Conference"}</span>
        <span className="cal-header-sep">|</span>
        <span className="cal-header-label">Schedule</span>
      </div>
      <div className="cal-header-actions">
        {isAdmin && (
          <Link to={`/conference/${confId}/admin/settings`} className="cal-header-btn">
            Admin
          </Link>
        )}
        <Link to={`/conference/${confId}/reports`} className="cal-header-btn">
          Reports
        </Link>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
          {userProfile?.displayName}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/CalendarHeader.jsx
git commit -m "feat: add CalendarHeader with conference name and nav actions"
```

---

## Task 3: SessionPool Component (Left Panel)

**Files:**
- Create: `src/components/calendar/SessionPool.jsx`

- [ ] **Step 1: Write the session pool component**

Write to `src/components/calendar/SessionPool.jsx`:

```jsx
import { useState, useMemo } from "react";

export default function SessionPool({ sessions, selectedId, onSelect, userAttending }) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");

  // Extract unique topics for filter buttons
  const topics = useMemo(() => {
    const set = new Set();
    sessions.forEach((s) => {
      if (s.mainTopic) set.add(s.mainTopic);
      (s.keyThemes || []).forEach((t) => set.add(t));
    });
    return [...set].sort().slice(0, 8); // Top 8 topics
  }, [sessions]);

  const timeFilters = ["AM", "PM"];
  const formatFilters = ["IN-PERSON", "VIRTUAL"];

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matches =
          s.title?.toLowerCase().includes(q) ||
          s.code?.toLowerCase().includes(q) ||
          s.mainTopic?.toLowerCase().includes(q) ||
          s.speakers?.some((sp) => sp.name?.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Topic/time/format filter
      if (activeFilter !== "ALL") {
        if (activeFilter === "AM") return s.start < "12:00";
        if (activeFilter === "PM") return s.start >= "12:00";
        if (activeFilter === "IN-PERSON") return s.format?.toLowerCase().includes("person");
        if (activeFilter === "VIRTUAL") return s.format?.toLowerCase().includes("virtual");
        // Topic filter
        const topicMatch =
          s.mainTopic === activeFilter ||
          (s.keyThemes || []).includes(activeFilter);
        if (!topicMatch) return false;
      }

      return true;
    });
  }, [sessions, search, activeFilter]);

  const attendingSet = new Set(userAttending);

  return (
    <div className="cal-pool">
      <div className="cal-pool-header">
        <div className="cal-pool-title">Session Pool</div>
        <input
          type="text"
          className="cal-pool-search"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="cal-pool-filters">
        <button
          className={`cal-pool-filter ${activeFilter === "ALL" ? "cal-pool-filter--active" : ""}`}
          onClick={() => setActiveFilter("ALL")}
        >
          All
        </button>
        {timeFilters.map((f) => (
          <button
            key={f}
            className={`cal-pool-filter ${activeFilter === f ? "cal-pool-filter--active" : ""}`}
            onClick={() => setActiveFilter(activeFilter === f ? "ALL" : f)}
          >
            {f}
          </button>
        ))}
        {formatFilters.map((f) => (
          <button
            key={f}
            className={`cal-pool-filter ${activeFilter === f ? "cal-pool-filter--active" : ""}`}
            onClick={() => setActiveFilter(activeFilter === f ? "ALL" : f)}
          >
            {f}
          </button>
        ))}
        {topics.slice(0, 4).map((t) => (
          <button
            key={t}
            className={`cal-pool-filter ${activeFilter === t ? "cal-pool-filter--active" : ""}`}
            onClick={() => setActiveFilter(activeFilter === t ? "ALL" : t)}
          >
            {t.length > 12 ? t.slice(0, 12) + "…" : t}
          </button>
        ))}
      </div>

      <div className="cal-pool-list">
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`cal-pool-card ${s.id === selectedId ? "cal-pool-card--selected" : ""} ${attendingSet.has(s.id) ? "cal-pool-card--scheduled" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="cal-pool-card-title">{s.title}</div>
            <div className="cal-pool-card-meta">
              {s.code && `${s.code} · `}
              {s.date} {s.start}–{s.end}
              {s.room && ` · ${s.room}`}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "#555", fontSize: 12, textAlign: "center", padding: 20 }}>
            {search ? "No sessions match" : "No sessions available"}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/SessionPool.jsx
git commit -m "feat: add SessionPool component with search and topic/time/format filters"
```

---

## Task 4: ScheduleGrid Component (Center Panel)

**Files:**
- Create: `src/components/calendar/ScheduleGrid.jsx`

- [ ] **Step 1: Write the schedule grid component**

Write to `src/components/calendar/ScheduleGrid.jsx`:

```jsx
import { useMemo } from "react";

// Generate hour slots from earliest to latest session
function getTimeSlots(sessions) {
  if (sessions.length === 0) return [];
  let minH = 24, maxH = 0;
  sessions.forEach((s) => {
    const sh = parseInt(s.start?.split(":")[0] || "9");
    const eh = parseInt(s.end?.split(":")[0] || "10");
    if (sh < minH) minH = sh;
    if (eh > maxH) maxH = eh;
  });
  const slots = [];
  for (let h = minH; h <= maxH; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

export default function ScheduleGrid({ sessions, selectedId, onSelect, members }) {
  // Only show user's scheduled sessions
  const { days, timeSlots, grid } = useMemo(() => {
    if (sessions.length === 0) return { days: [], timeSlots: [], grid: {} };

    // Get unique dates sorted
    const daySet = new Set(sessions.map((s) => s.date));
    const days = [...daySet].sort();

    const timeSlots = getTimeSlots(sessions);

    // Build grid: { "date|hour" : [sessions] }
    const grid = {};
    sessions.forEach((s) => {
      const hour = s.start?.split(":")[0] + ":00";
      const key = `${s.date}|${hour}`;
      if (!grid[key]) grid[key] = [];
      grid[key].push(s);
    });

    return { days, timeSlots, grid };
  }, [sessions]);

  // Map member userId → color + initials
  const memberColors = useMemo(() => {
    const COLORS = ["#CF0A2C", "#2980B9", "#E67E22", "#8E44AD", "#27AE60", "#2C3E50"];
    const map = {};
    members.forEach((m) => {
      map[m.userId || m.id] = {
        color: COLORS[m.colorIndex || 0],
        initials: (m.displayName || m.legacyName || m.userId || "?").slice(0, 1).toUpperCase(),
      };
    });
    return map;
  }, [members]);

  if (sessions.length === 0) {
    return (
      <div className="cal-grid">
        <div className="cal-grid-label">Your Schedule</div>
        <div className="cal-grid-empty">
          <div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No sessions scheduled</div>
            <div style={{ fontSize: 11 }}>Browse the session pool and mark sessions to attend</div>
          </div>
        </div>
      </div>
    );
  }

  const colCount = days.length;

  return (
    <div className="cal-grid">
      <div className="cal-grid-label">Your Schedule</div>
      <div
        className="cal-grid-table"
        style={{ gridTemplateColumns: `60px repeat(${colCount}, 1fr)` }}
      >
        {/* Day headers */}
        <div style={{ background: "transparent" }} />
        {days.map((day) => {
          const d = new Date(day + "T00:00:00");
          const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div key={day} className="cal-grid-day-header">
              {label}
            </div>
          );
        })}

        {/* Time rows */}
        {timeSlots.map((slot) => (
          <>
            <div key={`t-${slot}`} className="cal-grid-time-label">{slot}</div>
            {days.map((day) => {
              const key = `${day}|${slot}`;
              const cellSessions = grid[key] || [];
              return (
                <div key={key} className="cal-grid-cell">
                  {cellSessions.length > 0 && (
                    <div className="cal-grid-cell-sessions">
                      {cellSessions.map((s) => (
                        <div
                          key={s.id}
                          className={`cal-grid-session ${s.id === selectedId ? "cal-grid-session--selected" : ""}`}
                          onClick={() => onSelect(s.id)}
                        >
                          <div className="cal-grid-session-time">
                            {s.start}–{s.end}
                          </div>
                          <div className="cal-grid-session-title">{s.title}</div>
                          {/* Teammate avatars */}
                          {(s.attendees || []).length > 0 && (
                            <div className="cal-grid-session-avatars">
                              {(s.attendees || []).slice(0, 5).map((uid) => {
                                const mc = memberColors[uid];
                                if (!mc) return null;
                                return (
                                  <div
                                    key={uid}
                                    className="cal-grid-avatar"
                                    style={{ background: mc.color }}
                                  >
                                    {mc.initials}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/ScheduleGrid.jsx
git commit -m "feat: add ScheduleGrid with multi-day grid and parallel session display"
```

---

## Task 5: SessionDetail Component (Right Panel)

**Files:**
- Create: `src/components/calendar/SessionDetail.jsx`

- [ ] **Step 1: Write the session detail component**

Write to `src/components/calendar/SessionDetail.jsx`:

```jsx
import { useMemo } from "react";

const COLORS = ["#CF0A2C", "#2980B9", "#E67E22", "#8E44AD", "#27AE60", "#2C3E50"];

export default function SessionDetail({ session, members, isAttending, onToggleAttend }) {
  if (!session) {
    return (
      <div className="cal-detail">
        <div className="cal-detail-title-label">Session Details</div>
        <div className="cal-detail-empty">
          <div>Select a session to see details</div>
        </div>
      </div>
    );
  }

  // Build attendee list with names and attendance mode
  const attendees = useMemo(() => {
    return (session.attendees || [])
      .map((uid) => {
        const member = members.find((m) => (m.userId || m.id) === uid);
        if (!member) return null;
        return {
          userId: uid,
          name: member.displayName || member.legacyName || uid,
          mode: member.attendanceMode || member.mode || "onsite",
          color: COLORS[member.colorIndex || 0],
        };
      })
      .filter(Boolean);
  }, [session.attendees, members]);

  const speakers = session.speakers || [];

  return (
    <div className="cal-detail">
      <div className="cal-detail-title-label">Session Details</div>

      <div className="cal-detail-title">{session.title}</div>
      <div className="cal-detail-meta">
        {session.room && `📍 ${session.room} · `}
        {session.date} · {session.start}–{session.end}
      </div>
      {session.format && (
        <div className="cal-detail-meta">
          {session.format}
          {session.recording === "Yes" && " · Recording: Yes"}
        </div>
      )}

      <div className="cal-detail-divider" />

      {/* Description from key themes */}
      {session.keyThemes?.length > 0 && (
        <div className="cal-detail-desc">
          {session.keyThemes.join(" · ")}
        </div>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <>
          <div className="cal-detail-section-label">Speaker{speakers.length > 1 ? "s" : ""}</div>
          {speakers.map((sp, i) => (
            <div key={i} className="cal-detail-speaker">
              {sp.name}
              {(sp.title || sp.company) && (
                <span className="cal-detail-speaker-role">
                  {" — "}
                  {[sp.title, sp.company].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {/* Also Attending */}
      {attendees.length > 0 && (
        <>
          <div className="cal-detail-section-label">Also Attending</div>
          <div className="cal-detail-attendees">
            {attendees.map((a) => (
              <div key={a.userId} className="cal-detail-attendee">
                <span className="cal-detail-attendee-name" style={{ background: a.color }}>
                  {a.name}
                </span>
                <span className="cal-detail-attendee-mode">
                  {a.mode === "online" ? "💻 online" : "🏢 onsite"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Action buttons */}
      <div className="cal-detail-actions">
        {isAttending ? (
          <button className="cal-detail-btn-primary cal-detail-btn-primary--danger" onClick={onToggleAttend}>
            Remove from Schedule
          </button>
        ) : (
          <button className="cal-detail-btn-primary" onClick={onToggleAttend}>
            Mark Attending
          </button>
        )}
        {session.url && (
          <a href={session.url} target="_blank" rel="noopener noreferrer" className="cal-detail-btn-secondary">
            🔗 View Official Session Page
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/SessionDetail.jsx
git commit -m "feat: add SessionDetail with attendees, speakers, and attend toggle"
```

---

## Task 6: CalendarPage Parent Component

**Files:**
- Create: `src/components/calendar/CalendarPage.jsx`

- [ ] **Step 1: Write the parent component that ties everything together**

Write to `src/components/calendar/CalendarPage.jsx`:

```jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import CalendarHeader from "./CalendarHeader";
import SessionPool from "./SessionPool";
import ScheduleGrid from "./ScheduleGrid";
import SessionDetail from "./SessionDetail";
import "./calendar.css";

export default function CalendarPage() {
  const { confId } = useParams();
  const { user } = useAuth();
  const [conference, setConference] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Listen to conference doc
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConference(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [confId]);

  // Listen to all sessions
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      setAllSessions(arr);
    });
  }, [confId]);

  // Listen to members
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(collection(db, "conferences", confId, "members"), async (snap) => {
      const arr = [];
      for (const d of snap.docs) {
        const data = d.data();
        // Try to get display name from users collection
        let displayName = data.legacyName || null;
        if (!displayName) {
          try {
            const userSnap = await import("firebase/firestore").then(({ getDoc, doc: docRef }) =>
              getDoc(docRef(db, "users", d.id))
            );
            displayName = userSnap.exists() ? userSnap.data().displayName || userSnap.data().email : d.id;
          } catch {
            displayName = d.id;
          }
        }
        arr.push({ userId: d.id, ...data, displayName });
      }
      setMembers(arr);
    });
  }, [confId]);

  // IDs of sessions the current user is attending
  const userAttendingIds = useMemo(() => {
    if (!user) return [];
    return allSessions
      .filter((s) => (s.attendees || []).includes(user.uid))
      .map((s) => s.id);
  }, [allSessions, user]);

  // Sessions the user is attending (for the grid)
  const mySchedule = useMemo(() => {
    return allSessions.filter((s) => (s.attendees || []).includes(user?.uid));
  }, [allSessions, user]);

  // Selected session object
  const selectedSession = useMemo(() => {
    return allSessions.find((s) => s.id === selectedSessionId) || null;
  }, [allSessions, selectedSessionId]);

  const isAttendingSelected = selectedSession
    ? (selectedSession.attendees || []).includes(user?.uid)
    : false;

  // Toggle attendance
  const handleToggleAttend = useCallback(async () => {
    if (!selectedSession || !user || !confId) return;
    const sessionRef = doc(db, "conferences", confId, "sessions", selectedSession.id);
    if (isAttendingSelected) {
      await updateDoc(sessionRef, { attendees: arrayRemove(user.uid) });
    } else {
      await updateDoc(sessionRef, { attendees: arrayUnion(user.uid) });
    }
  }, [selectedSession, user, confId, isAttendingSelected]);

  return (
    <div className="cal-page">
      <CalendarHeader confName={conference?.name} />
      <div className="cal-body">
        <SessionPool
          sessions={allSessions}
          selectedId={selectedSessionId}
          onSelect={setSelectedSessionId}
          userAttending={userAttendingIds}
        />
        <ScheduleGrid
          sessions={mySchedule}
          selectedId={selectedSessionId}
          onSelect={setSelectedSessionId}
          members={members}
        />
        <SessionDetail
          session={selectedSession}
          members={members}
          isAttending={isAttendingSelected}
          onToggleAttend={handleToggleAttend}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/calendar/CalendarPage.jsx
git commit -m "feat: add CalendarPage parent with Firestore listeners and state management"
```

---

## Task 7: Wire Up Router

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Replace App with CalendarPage in the conference route**

In `src/main.jsx`, add the import:

```jsx
import CalendarPage from "./components/calendar/CalendarPage";
```

Change the conference route from:

```jsx
<Route path="/conference/:confId" element={
  <AuthGuard><App /></AuthGuard>
} />
```

To:

```jsx
<Route path="/conference/:confId" element={
  <AuthGuard><CalendarPage /></AuthGuard>
} />
```

The `App` import can be removed if no other route uses it.

- [ ] **Step 2: Verify app builds**

```bash
cd /Users/eason/Documents/HW-Project/Conference/ConferenceFlow
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/main.jsx
git commit -m "feat: wire CalendarPage as conference landing page"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Calendar CSS (dark brutalist three-panel) | `src/components/calendar/calendar.css` |
| 2 | CalendarHeader (red header + nav) | `src/components/calendar/CalendarHeader.jsx` |
| 3 | SessionPool (left: search, filters, session cards) | `src/components/calendar/SessionPool.jsx` |
| 4 | ScheduleGrid (center: multi-day grid, parallel sessions, avatars) | `src/components/calendar/ScheduleGrid.jsx` |
| 5 | SessionDetail (right: info, attendees, attend toggle) | `src/components/calendar/SessionDetail.jsx` |
| 6 | CalendarPage (parent: Firestore listeners, state, layout) | `src/components/calendar/CalendarPage.jsx` |
| 7 | Wire router | `src/main.jsx` |
