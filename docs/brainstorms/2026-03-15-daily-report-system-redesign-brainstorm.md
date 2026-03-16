---
date: 2026-03-15
topic: daily-report-system-redesign
---

# Daily Report System Redesign

## What We're Building

A professional, reliable three-layer daily report system:

1. **Report List Page** (`/reports`) — dedicated management entry point replacing the toolbar-embedded history pills
2. **Report Editor** (`/report/:date`) — improved editing experience with auto-save indicator, collapsible session blocks, and manual "mark complete" status toggle
3. **Report Card** — each history entry shows date, draft/complete status badge, session count, and participating members

The design language stays unchanged: white container, `#CF0A2C` red accent, Microsoft YaHei / PingFang Chinese font, printable layout.

---

## Why This Approach

**Current problems identified:**

- **Chaotic generation flow**: "New Report" and "History" are hidden inside the report toolbar — you can only access history if you're already viewing a report. There's no top-level entry.
- **Poor editing experience**: `contentEditable` saves silently with no feedback; session blocks create a very long page with no way to navigate or collapse; no completion tracking.
- **Weak history**: Only date pills with no metadata — can't tell what's a draft vs. finished, how many sessions, or who participated.

**Chosen direction**: Dedicated list page + editor improvements + status system. Avoids over-engineering (no versioning, no conflict resolution, no CRDT) while solving all three pain points concretely.

---

## Key Decisions

### 1. New route: `/reports` (Report List Page)
- Add a new `ReportList` component at `/reports`
- Queries `dailyReports` collection for all documents; reads `status`, `date`, `sessions` (count), and cross-references `sessions` collection for members
- Main App (`/`) gets a "查看日报" button that links to `/reports`
- `ReportList` has a "新建日报" button with inline date picker → navigate to `/report/:date`

### 2. Report card fields (per history entry)
Each card in `/reports` shows:
- Date (large, e.g. `2026-03-19 周四`)
- Status badge: `草稿` (gray) or `已完成` (green)
- Session count: e.g. `6 sessions`
- Participating members: colored name pills based on attendees in sessions for that date
- `[查看 →]` button

### 3. Firestore: add `status` field to `dailyReports` documents
- Values: `"draft"` (default on init) | `"done"`
- Set via "标记完成" / "重置草稿" toggle button in the editor toolbar (right side)
- Auto-init always creates with `status: "draft"`

### 4. Auto-save status indicator in editor toolbar
- Three visual states: idle (nothing shown) → `● 保存中...` (gray, during 600ms debounce) → `✓ 已保存` (green, shown for 2s then fades)
- Implemented by wrapping the `debouncedSave` calls to track in-flight count

### 5. Collapsible session blocks
- Each `.report-session` card gets a collapse toggle (chevron `▼/▶` in the header)
- Default state: **collapsed if the session already has content** (takeaways non-empty), **expanded if empty** — so first-time editing expands all, subsequent views collapse filled ones
- Collapse state is local React state (not persisted), resets on page load

### 6. Editor toolbar: remove history panel, keep new-report access
- The embedded history pills are removed from the toolbar (replaced by `/reports` page)
- Keep "新建日报" button in toolbar for convenience (opens date picker inline as before)
- Add "标记完成 / 重置草稿" status toggle button on the right side of toolbar
- Add auto-save indicator between status button and export button

---

## Scope Boundaries (YAGNI)

- **No report versioning** — single Firestore document per date, edits overwrite
- **No multi-user conflict resolution** — last write wins (same as today)
- **No rich text formatting in ReportList** — plain metadata only, no summary preview
- **No delete from ReportList** — out of scope; reports can only be created/viewed
- **No main topic preview in cards** — session count + members is sufficient

---

## Open Questions

*(none — all resolved through dialogue)*

## Resolved Questions

- **Completion status**: manual toggle button (not auto-detected from content)
- **History layout**: dedicated page `/reports`, not sidebar drawer
- **Card metadata**: date + status + session count + members (topics excluded for simplicity)
- **Session block default**: collapsed if content exists, expanded if empty

---

## Next Steps
→ `/ce:plan` for implementation details

### Routes after redesign
```
/           → App (schedule table + calendar)
/reports    → ReportList (new — management page)
/report/:date → DailyReport (editor, improved)
```

### Files to change
- `src/main.jsx` — add `/reports` route
- `src/App.jsx` — add "查看日报" nav button
- `src/DailyReport.jsx` — auto-save indicator, collapsible sessions, status toggle, remove history panel, keep new-report inline
- `src/ReportList.jsx` — new component
- `src/index.css` — styles for ReportList cards, auto-save indicator, collapsible sessions, status badges
- `data/dailyReports` Firestore — add `status: "draft"` field on init
