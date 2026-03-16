---
title: "feat: Daily Report System Redesign"
type: feat
status: active
date: 2026-03-15
origin: docs/brainstorms/2026-03-15-daily-report-system-redesign-brainstorm.md
---

# feat: Daily Report System Redesign

## Overview

Redesign the three-piece daily report system — generation flow, editor UX, and history — to be professional and reliable while keeping the existing design language (white container, `#CF0A2C` red accent, Microsoft YaHei/PingFang font stack).

Three concrete improvements:
1. **New `/reports` list page** — dedicated management entry replacing toolbar-embedded history pills
2. **Editor improvements** — auto-save indicator, collapsible session blocks, manual "mark complete" toggle
3. **Rich report cards** — each history entry shows date, draft/complete status, session count, and participating members

---

## Problem Statement

(see brainstorm: `docs/brainstorms/2026-03-15-daily-report-system-redesign-brainstorm.md`)

- **Chaotic flow**: History and new-report creation are buried inside the report editor toolbar — no top-level entry point, no overview.
- **Silent editor**: `contentEditable` saves with zero feedback. Users can't tell if their changes persisted.
- **Long, unstructured page**: All session blocks are always expanded, making the editor a very long scroll with no navigation aid.
- **Weak history**: Only bare date pills — no status, no session count, no participants.

---

## Proposed Solution

### Routes after redesign
```
/              → App (schedule table + calendar view)  [unchanged]
/reports       → ReportList  [NEW]
/report/:date  → DailyReport (editor, improved)        [improved]
```

### Three-layer architecture

| Layer | Change | Files |
|---|---|---|
| List page | New `ReportList.jsx` component + route | `src/ReportList.jsx`, `src/main.jsx`, `src/App.jsx`, `src/index.css` |
| Editor | Auto-save indicator, collapse, status toggle, toolbar cleanup | `src/DailyReport.jsx`, `src/index.css` |
| Data | Add `status: "draft"` to auto-init Firestore write | `src/DailyReport.jsx` |

---

## Technical Approach

### Phase 1 — Firestore schema + `useDebouncedSave` enhancement

#### 1a. Add `status` field to auto-init (`src/DailyReport.jsx`)

The existing auto-init `setDoc` at line ~246 writes without a `status` field. Add it:

```js
// src/DailyReport.jsx — auto-init useEffect, setDoc call
setDoc(doc(db, "dailyReports", date), {
  date, summary: "", onsiteInfo: "", reflections: "", rumors: "",
  sessions: sessionMap, topicOrder: [],
  status: "draft",   // ← ADD THIS
}).catch(console.error);
```

Existing documents without `status` should be treated as `"draft"` everywhere — use `reportData?.status === "done"` (missing/undefined → falsy → draft display). **No migration needed.**

#### 1b. Enhance `useDebouncedSave` to expose `saveState`

Currently returns a single function. Modify to return `{ debouncedSave, saveState }` tuple:

```js
// src/DailyReport.jsx — useDebouncedSave hook (module level, lines 14–21)
function useDebouncedSave(delay = 600) {
  const timers = useRef({});
  const pending = useRef(0);
  const savedTimer = useRef(null);
  const [saveState, setSaveState] = useState("idle"); // "idle" | "saving" | "saved"

  const debouncedSave = useCallback((key, fn) => {
    if (!timers.current[key]) pending.current += 1;
    else clearTimeout(timers.current[key]);
    setSaveState("saving");
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      pending.current -= 1;
      Promise.resolve(fn()).finally(() => {
        if (pending.current === 0) {
          setSaveState("saved");
          clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        }
      });
    }, delay);
  }, [delay]);

  return { debouncedSave, saveState };
}
```

Update instantiation site (line ~180):
```js
// Before:
const debouncedSave = useDebouncedSave(600);
// After:
const { debouncedSave, saveState } = useDebouncedSave(600);
```

No changes needed at the 3 `debouncedSave(key, fn)` call sites — signature unchanged.

---

### Phase 2 — `ReportList.jsx` (new file)

**File:** `src/ReportList.jsx`

#### Data loading (3 parallel Firestore subscriptions)

```js
// Three onSnapshot listeners (same pattern as DailyReport.jsx)
onSnapshot(collection(db, "dailyReports"), snap => {
  // → reportDocs: [{ id (date), status, sessions (map) }]
  // sort descending by date string
})
onSnapshot(collection(db, "sessions"), snap => {
  // → allSessions: [{ code, date, attendees[] }]
  // group by date: sessionsByDate[date] = { count, memberIds: Set }
})
onSnapshot(collection(db, "members"), snap => {
  // → memberMap: { [id]: { name, colorIndex } }
})
```

#### Per-card derived data

For each report date `d`:
```js
const sessionsForDate = allSessions.filter(s => s.date === d);
const sessionCount = sessionsForDate.length;
const memberIds = [...new Set(sessionsForDate.flatMap(s => s.attendees || []))];
const participantMembers = memberIds.map(id => memberMap[id]).filter(Boolean);
```

#### Weekday helper

```js
const DAY_CN = ["周日","周一","周二","周三","周四","周五","周六"];
const getWeekday = (dateStr) => DAY_CN[new Date(dateStr + "T00:00").getDay()];
// → "周四"
```

#### COLORS constant

Duplicate the COLORS array from `App.jsx` locally in `ReportList.jsx` (6 entries). YAGNI — no shared constants file needed yet.

```js
const COLORS = [
  { hex: "#3DFFA4", bg: "rgba(61,255,164,0.10)" },
  { hex: "#4C8EFF", bg: "rgba(76,142,255,0.10)" },
  { hex: "#FFBB38", bg: "rgba(255,187,56,0.10)" },
  { hex: "#FF6B9A", bg: "rgba(255,107,154,0.10)" },
  { hex: "#B87FFF", bg: "rgba(184,127,255,0.10)" },
  { hex: "#22D3EE", bg: "rgba(34,211,238,0.10)" },
];
```

#### Report card anatomy

```
┌──────────────────────────────────────────────────────────┐
│  2026-03-19 周四                 ● 草稿   [查看日报 →]   │
│  6 sessions  ·  ● 张三  ● 李四  ● 王五                  │
└──────────────────────────────────────────────────────────┘
```

- **Status badge**: `草稿` = gray `#888` + `#F5F5F5 bg`; `已完成` = green `#27AE60` + `rgba(39,174,96,0.08) bg`
- **Member pills**: small colored dots + name, using `COLORS[m.colorIndex].hex`
- **"查看日报 →"**: `<Link to={`/report/${d}`}>` red button

#### New report creation

```jsx
{/* Header area */}
<div className="report-list-header">
  <h1>日报管理</h1>
  <button onClick={() => setShowCreate(v => !v)}>+ 新建日报</button>
</div>

{/* Inline date picker (conditional) */}
{showCreate && (
  <div className="report-list-create-row">
    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
    <button onClick={() => navigate(`/report/${newDate}`)}>生成</button>
  </div>
)}
```

#### Full component structure

```js
// src/ReportList.jsx
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

const COLORS = [ /* 6 entries */ ];
const DAY_CN = ["周日","周一","周二","周三","周四","周五","周六"];

export default function ReportList() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [reportDocs, setReportDocs] = useState([]);      // sorted desc by date
  const [allSessions, setAllSessions] = useState([]);
  const [memberMap, setMemberMap] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Auth
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  // Daily reports
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "dailyReports"), snap => {
      const docs = snap.docs
        .map(d => ({ date: d.id, ...d.data() }))
        .sort((a, b) => b.date.localeCompare(a.date));
      setReportDocs(docs);
    });
  }, [user]);

  // Sessions
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "sessions"), snap => {
      setAllSessions(snap.docs.map(d => d.data()));
    });
  }, [user]);

  // Members
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "members"), snap => {
      const map = {};
      snap.forEach(d => { map[d.data().id] = d.data(); });
      setMemberMap(map);
    });
  }, [user]);

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <Link to="/" className="report-back-btn">← 返回日程</Link>
        </div>
      </div>
      <div className="report-container" style={{ marginTop: 24 }}>
        {/* Header */}
        <div className="report-list-header">
          <div>
            <div className="report-title-eyebrow" style={{ marginBottom: 4 }}>GTC 2026 · DAILY BRIEFING</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>日报管理</h2>
          </div>
          <button className="report-list-create-btn" onClick={() => setShowCreate(v => !v)}>
            + 新建日报
          </button>
        </div>

        {/* New report row */}
        {showCreate && (
          <div className="report-list-create-row">
            <span>选择日期：</span>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            <button onClick={() => { navigate(`/report/${newDate}`); setShowCreate(false); }}>生成</button>
          </div>
        )}

        {/* Report cards */}
        <div className="report-list-cards">
          {reportDocs.length === 0
            ? <p style={{ color: "#AAAAAA", textAlign: "center", padding: "48px 0" }}>暂无日报，点击「新建日报」开始</p>
            : reportDocs.map(r => {
                const sessionsForDate = allSessions.filter(s => s.date === r.date);
                const memberIds = [...new Set(sessionsForDate.flatMap(s => s.attendees || []))];
                const members = memberIds.map(id => memberMap[id]).filter(Boolean);
                const isDone = r.status === "done";
                const weekday = DAY_CN[new Date(r.date + "T00:00").getDay()];
                return (
                  <div key={r.date} className="report-card">
                    <div className="report-card-main">
                      <div className="report-card-date">
                        {r.date} <span style={{ fontWeight: 400, color: "#888" }}>{weekday}</span>
                      </div>
                      <div className="report-card-meta">
                        <span style={{ fontSize: 12, color: "#888" }}>
                          {Object.keys(r.sessions || {}).length} sessions
                        </span>
                        {members.length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {members.map(m => {
                              const c = COLORS[m.colorIndex] || COLORS[0];
                              return (
                                <span key={m.id} style={{
                                  fontSize: 11, padding: "2px 7px", borderRadius: 99,
                                  background: c.bg, color: c.hex, border: `1px solid ${c.hex}40`,
                                }}>
                                  {m.name}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="report-card-right">
                      <span className={`report-status-badge ${isDone ? "done" : "draft"}`}>
                        {isDone ? "✓ 已完成" : "● 草稿"}
                      </span>
                      <Link to={`/report/${r.date}`} className="report-card-view-btn">
                        查看日报 →
                      </Link>
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}
```

---

### Phase 3 — `DailyReport.jsx` editor improvements

#### 3a. State additions and removals

**Remove** (history feature replaced by `/reports` page):
```js
// DELETE these state variables:
const [reportDates, setReportDates] = useState([]);
const [showHistory, setShowHistory] = useState(false);

// DELETE this useEffect (history subscription):
useEffect(() => {
  if (!user) return;
  return onSnapshot(collection(db, "dailyReports"), (snap) => { ... });
}, [user]);
```

**Add** (collapse + status):
```js
const [collapsedSessions, setCollapsedSessions] = useState(new Set());
const collapsedInit = useRef(false);
```

**Add collapse init effect** (after the report data useEffect):
```js
useEffect(() => {
  if (!reportData || collapsedInit.current) return;
  collapsedInit.current = true;
  const initial = new Set(
    sessions
      .filter(s => {
        const sd = reportData.sessions?.[s.code];
        return sd?.takeaways && sd.takeaways !== "";
      })
      .map(s => s.code)
  );
  setCollapsedSessions(initial);
}, [reportData, sessions]);
```

**Add toggle handler**:
```js
const toggleCollapse = useCallback((code) => {
  setCollapsedSessions(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
}, []);
```

**Add status toggle handler**:
```js
const handleToggleStatus = () => {
  if (!user) return;
  const newStatus = reportData?.status === "done" ? "draft" : "done";
  setDoc(doc(db, "dailyReports", date), { status: newStatus }, { merge: true }).catch(console.error);
};
```

#### 3b. Toolbar changes

Replace the current toolbar left section. Remove `历史记录` button; add `查看日报列表` link + status toggle + auto-save indicator.

```jsx
{/* Left group */}
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <Link to="/" className="report-back-btn">← 返回日程</Link>
  <div style={{ width: 1, height: 20, background: "#E8E8E8" }} />
  <Link to="/reports" className="report-tool-btn" style={{ fontSize: 12, padding: "4px 10px", textDecoration: "none" }}>
    日报列表
  </Link>
  <button
    className="report-tool-btn"
    onClick={() => { setShowNewReport(v => !v); }}
    style={{ fontSize: 12, padding: "4px 10px" }}
  >
    + 新建日报
  </button>
</div>

{/* Right group */}
<div className="report-toolbar-actions">
  {/* Auto-save indicator */}
  {saveState === "saving" && (
    <span style={{ fontSize: 11, color: "#AAAAAA" }}>● 保存中...</span>
  )}
  {saveState === "saved" && (
    <span style={{ fontSize: 11, color: "#27AE60" }}>✓ 已保存</span>
  )}

  <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 4px" }} />

  {/* Status toggle */}
  <button
    className="report-tool-btn"
    onClick={handleToggleStatus}
    style={{
      fontSize: 12, padding: "4px 10px",
      ...(reportData?.status === "done" ? {
        background: "rgba(39,174,96,0.08)",
        color: "#27AE60",
        border: "1px solid rgba(39,174,96,0.3)",
        borderRadius: 4,
      } : {}),
    }}
  >
    {reportData?.status === "done" ? "✓ 已完成" : "标记完成"}
  </button>

  <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 8px" }} />

  {/* Existing: Bold, Color picker, Export PDF */}
  <button className="report-tool-btn" onClick={execBold} title="加粗"><strong>B</strong></button>
  {/* ... color picker ... */}
  <button className="report-export-btn" onClick={handleExportPDF} disabled={exporting}>
    {exporting ? "生成中..." : "导出 PDF"}
  </button>
</div>

{/* New report form — keep as-is */}
{showNewReport && ( /* ... date picker row ... */ )}

{/* DELETE: History panel and all its JSX */}
```

#### 3c. Collapsible session blocks

Wrap the session body content in a conditional. Add a chevron toggle to the header:

```jsx
{(topicsMap[topic] || []).map(session => {
  const sd = sessionData[session.code] || {};
  const isCollapsed = collapsedSessions.has(session.code);
  // ... existing derived vars (speakers, contributors) ...

  return (
    <div key={session.code} id={`session-${session.code}`} className="report-session">

      {/* Session Header — now clickable to collapse */}
      <div
        className="report-session-header"
        onClick={() => toggleCollapse(session.code)}
        style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: isCollapsed ? 0 : 6 }}>
            <span className="report-session-code">{session.code}</span>
            <h3 className="report-session-title" style={{ margin: 0 }}>
              {/* existing title/link JSX unchanged */}
            </h3>
          </div>
          {!isCollapsed && (
            <div className="report-session-time">
              {session.start}–{session.end}{session.room && ` | ${session.room}`}
            </div>
          )}
        </div>
        <span className="session-collapse-btn">{isCollapsed ? "▶" : "▼"}</span>
      </div>

      {/* Collapsible body */}
      {!isCollapsed && (
        <>
          {/* .report-session-meta — speakers */}
          <div className="report-session-meta"> {/* ... unchanged ... */} </div>

          {/* Illustration upload */}
          {/* ... unchanged ... */}

          {/* .report-session-body — takeaways + insights + contributors */}
          <div className="report-session-body"> {/* ... unchanged ... */} </div>
        </>
      )}

    </div>
  );
})}
```

---

### Phase 4 — CSS additions (`src/index.css`)

Add after existing `.report-*` styles:

```css
/* ── Report List Page ──────────────────────────────── */
.report-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 40px 16px;
  border-bottom: 1px solid #EEEEEE;
}
.report-list-create-btn {
  font-size: 13px; padding: 7px 16px; border-radius: 6px;
  background: #CF0A2C; color: #fff; border: none; cursor: pointer;
  font-family: inherit; font-weight: 600;
  transition: opacity 0.15s;
}
.report-list-create-btn:hover { opacity: 0.88; }
.report-list-create-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 40px 12px;
  border-bottom: 1px solid #F5F5F5;
  background: #FAFAFA;
  font-size: 13px;
}
.report-list-create-row input[type="date"] {
  font-size: 13px; padding: 4px 8px; border-radius: 6px;
  border: 1px solid #DDDDDD; font-family: inherit;
}
.report-list-create-row button {
  font-size: 13px; padding: 4px 14px; border-radius: 6px;
  background: #CF0A2C; color: #fff; border: none; cursor: pointer; font-family: inherit;
}
.report-list-cards {
  padding: 16px 40px 40px;
  display: flex; flex-direction: column; gap: 10px;
}
.report-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border: 1px solid #E8E8E8;
  border-left: 3px solid #CF0A2C;
  border-radius: 4px;
  background: #fff;
  transition: box-shadow 0.15s;
}
.report-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.07); }
.report-card-main { display: flex; flex-direction: column; gap: 6px; }
.report-card-date { font-size: 15px; font-weight: 700; color: #1A1A1A; }
.report-card-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.report-card-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.report-status-badge {
  font-size: 11px; padding: 3px 9px; border-radius: 99px; font-weight: 600;
  letter-spacing: 0.03em;
}
.report-status-badge.draft {
  color: #888; background: #F5F5F5; border: 1px solid #E0E0E0;
}
.report-status-badge.done {
  color: #27AE60; background: rgba(39,174,96,0.08); border: 1px solid rgba(39,174,96,0.3);
}
.report-card-view-btn {
  font-size: 12px; padding: 5px 12px; border-radius: 6px;
  background: #CF0A2C; color: #fff; text-decoration: none;
  font-weight: 600; transition: opacity 0.15s;
}
.report-card-view-btn:hover { opacity: 0.88; }

/* ── Session Collapse ──────────────────────────────── */
.session-collapse-btn {
  font-size: 11px; color: #BBBBBB;
  flex-shrink: 0; padding-top: 3px;
  user-select: none;
  transition: color 0.1s;
}
.report-session-header:hover .session-collapse-btn { color: #888; }
```

---

### Phase 5 — Routing and App nav wiring

#### `src/main.jsx`

```jsx
import ReportList from "./ReportList";

<Routes>
  <Route path="/" element={<App />} />
  <Route path="/reports" element={<ReportList />} />        {/* ADD */}
  <Route path="/report/:date" element={<DailyReport />} />
</Routes>
```

#### `src/App.jsx` — Add "日报管理" link to header

The header right side currently has only the Export button. Wrap both in a flex row:

```jsx
{/* In the header, right-side actions group */}
<div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
  <Link to="/reports" className="btn-ghost" style={{ padding: "6px 14px", fontSize: 13, textDecoration: "none", gap: 5 }}>
    <FileText size={14} />
    日报管理
  </Link>
  {/* existing Export button */}
  <div style={{ position: "relative" }}>
    <button className="btn-accent" onClick={() => setShowExportMenu(!showExportMenu)}>
      ...
    </button>
    {/* export dropdown */}
  </div>
</div>
```

---

## System-Wide Impact

### State lifecycle risks
- **`collapsedInit.current` guard**: prevents the collapse-init effect from re-running when `reportData` updates due to field edits (since the effect also lists `sessions` as a dependency, and sessions can update). The ref guard ensures initialization only runs once per mount.
- **`status` field missing on old docs**: treated as `"draft"` everywhere via `=== "done"` check (falsy for undefined). No data corruption.
- **`useDebouncedSave` return value change**: all existing destructuring call sites (`const debouncedSave = ...`) must be updated to `const { debouncedSave, saveState } = ...`. There is exactly one call site in `DailyReport.jsx`.

### Integration notes
- `ReportList.jsx` subscribes to the full `sessions` collection (not date-filtered) to count sessions per date. At GTC 2026 scale (~200 sessions), this is fine — no pagination needed.
- The `COLORS` array is duplicated between `App.jsx` and `ReportList.jsx`. If a third file needs it in future, extract to `src/constants.js`.
- `DailyReport.jsx` retains `showNewReport` / `newReportDate` / `handleCreateReport` states for the "新建日报" inline form — the history-specific state (`reportDates`, `showHistory`) is the only thing removed.

---

## Acceptance Criteria

### Functional

- [ ] `/reports` route renders without errors, showing all saved report dates sorted newest-first
- [ ] Each report card displays: date + weekday, session count, participating member pills (colored), draft/done status badge, "查看日报 →" link
- [ ] "新建日报" button on `/reports` shows inline date picker; submitting navigates to `/report/YYYY-MM-DD`
- [ ] Report cards correctly show `已完成` badge (green) vs `草稿` (gray) based on `status` field
- [ ] App header has "日报管理" link that navigates to `/reports`
- [ ] DailyReport toolbar shows "日报列表" link (navigates to `/reports`) and "新建日报" button
- [ ] DailyReport toolbar shows "标记完成" button; clicking sets `status: "done"` in Firestore; button turns green and shows "✓ 已完成"
- [ ] Clicking "✓ 已完成" again resets to `status: "draft"`
- [ ] DailyReport auto-save indicator shows `● 保存中...` during debounce period, then `✓ 已保存` for 2s, then disappears
- [ ] Each session block in DailyReport is collapsible by clicking the header; chevron indicates state
- [ ] Sessions with existing `takeaways` content are **collapsed** by default on page load; empty sessions are expanded by default
- [ ] Toggle works correctly (click to expand, click to collapse); state resets on page reload
- [ ] New reports auto-initialized with `status: "draft"` (verify Firestore document)
- [ ] Existing reports without `status` field display as `草稿` (not broken)

### Non-functional

- [ ] Design language unchanged: white bg, `#CF0A2C` red accent, same font stack
- [ ] Toolbar is hidden in `@media print` (existing `.no-print` class handles this — no change needed)
- [ ] No console errors

### Out of scope (per brainstorm)

- Report deletion
- Report versioning / conflict resolution
- Main topic preview in list cards
- Auto-detection of completion status

---

## Dependencies & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `collapsedInit` effect fires before `sessions` is populated | Low | The effect depends on both `reportData` and `sessions`; if sessions is empty, no sessions get collapsed (safe default: all expanded) |
| `useDebouncedSave` Promise wrapping (`Promise.resolve(fn())`) — if `fn()` returns `void` (not a Promise), `finally` still fires immediately | None | `Promise.resolve(void)` resolves synchronously; `finally` fires correctly |
| COLORS duplication — out of sync if palette changes | Low | Currently stable; only 2 locations; easy to reconcile when needed |
| Firestore cost — ReportList subscribes to full `sessions` collection | Low | ~200 docs, static after conference; negligible read cost |

---

## Sources & References

### Origin

- **Brainstorm document:** [`docs/brainstorms/2026-03-15-daily-report-system-redesign-brainstorm.md`](docs/brainstorms/2026-03-15-daily-report-system-redesign-brainstorm.md)
  - Key decisions carried forward: (1) dedicated `/reports` list page, not sidebar; (2) manual status toggle, not auto-detected; (3) card metadata = date + status + session count + members (no topics)

### Internal References

- `src/DailyReport.jsx:14–21` — `useDebouncedSave` hook to enhance
- `src/DailyReport.jsx:246–249` — auto-init setDoc to add `status: "draft"`
- `src/DailyReport.jsx:430–517` — toolbar to restructure
- `src/DailyReport.jsx:596–630` — session render loop to add collapse toggle
- `src/App.jsx:62–70` — COLORS array to duplicate in ReportList.jsx
- `src/App.jsx:564–607` — header to add "日报管理" link
- `src/App.jsx:221–228` — CalendarView per-date "生成日报" links (keep unchanged)
- `src/main.jsx:12–13` — routes to extend
- `src/index.css:341–357` — `.report-toolbar` styles (no changes needed)
- `src/index.css:550–604` — `.report-session` styles (no changes needed)
