# Conference Summary Report (总结稿) — Design Document

**Date:** 2026-03-23
**Status:** Approved
**Approach:** Shared Component (Approach A)

---

## Overview

Add a conference summary report (总结稿) feature that aggregates content from 4 daily reports into a single conference-level report. The summary report uses the same editing, snapshot, and export infrastructure as daily reports but has its own 5-section structure with a citation/reference system.

Both internal team and external audiences consume the same version. Editing and publishing workflow is identical to daily reports.

---

## Data Model

Stored in existing `dailyReports` collection with `type: "summary"`.

**Document ID:** `summary-GTC2026`, `summary-GTC2026-v2`, etc.

```
dailyReports/summary-GTC2026
├── type: "summary"
├── title: "GTC 2026 总结稿"
├── status: "draft" | "archived"
├── sourceReports: ["2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20"]
├── sections: {
│   "现场声音": {
│     order: 0,
│     blocks: [
│       { id, type: "heading", content: "<html>" },
│       { id, type: "body", content: "<html>", citations: [1, 3] }
│     ]
│   },
│   "趋势总结": { order: 1, blocks: [...] },
│   "推演分析": { order: 2, blocks: [...] },
│   "关键启示": { order: 3, blocks: [...] }
│ }
├── citations: [
│   { id: 1, type: "session", sessionCode: "S82322", title: "...", url: "..." },
│   { id: 2, type: "link", url: "https://...", label: "..." },
│   { id: 3, type: "text", content: "某业内人士透露..." }
│ ]
├── sitePhotos: [{ image, caption, source, date, ... }]  // 附录1
└── snapshots/ (subcollection, same as daily reports)
```

### Key decisions

- `citations` is a top-level array with global numbering — blocks reference by citation ID
- Each body block stores which citation IDs it uses, rendered inline as `[1]` `[2]` (no icons inline)
- `sitePhotos` aggregated from all 4 days with `date` field for grouping
- Sections keyed by name with `order` field for display sequence
- Deleted citations don't re-compact numbering; optional "整理编号" button for manual re-number

---

## 5-Section Structure

| # | Section | Content | Auto-pulled from |
|---|---------|---------|-----------------|
| 1 | **现场声音** | On-site observations and industry voices | 现场情报 + 圈内声音 from all daily reports |
| 2 | **趋势总结** | Conference trend analysis | Starts blank |
| 3 | **推演分析** | Projection/deduction analysis | Starts blank |
| 4 | **关键启示** | Key insights and takeaways | 核心要点 + session 启示 from all daily reports |
| 5 | **附录** | Reference materials | 附录1: 会议照片 (aggregated sitePhotos), 附录2: 参考信息 (citations) |

Each section (1-4) uses a block-based editor:
- Add sub-headings (heading blocks)
- Add body blocks with rich text content + citation references

---

## Citation System

### Adding citations

1. User clicks "添加引用" in a body block → popover with 3 tabs:
   - **Session** — search/select from SESSION_CATALOG
   - **Link** — paste URL + optional label
   - **Text** — free text source description
2. Citation auto-assigned next global ID, inserted as `[N]` inline
3. Reusing existing citation: popover shows "已有引用" list

### Inline rendering

Plain `[1]` `[2]` `[3]` superscript-style — no icons inline. Hovering shows tooltip with source preview.

### 附录2 参考信息 rendering

```
[1] S82322 — "NVIDIA Blackwell Architecture Deep Dive"     [跳转]
[2] https://example.com/report                              [跳转]
[3] 某业内人士在展区交流中提到，下一代产品将在Q4发布...
```

- Session: session code + title, clickable to session URL
- Link: clickable URL
- Text: full text displayed inline

---

## Aggregation Flow

### Creating a summary

1. User clicks "创建总结稿" on ReportList page
2. Modal shows checkboxes for daily reports to include (all pre-selected)
3. System reads selected daily reports and maps content:
   - `onsiteInfoBlocks` + `reflectionsBlocks` → **现场声音** (grouped by day with day sub-headings)
   - `summaryPoints` + session `insights` → **关键启示** (day-labeled)
   - `sitePhotos` → **附录1** (with date tags)
   - **趋势总结** and **推演分析** → empty with placeholder sub-heading
4. Creates `dailyReports/summary-GTC2026` with `type: "summary"`
5. Navigates to `/report/summary-GTC2026`

### Re-aggregation

If a summary already exists, creates a new version (`summary-GTC2026-v2`, `v3`, etc.). Previous versions remain untouched — no overwrite.

---

## Component Architecture

### New file

- `ConferenceReport.jsx` — 5-section editor with citation system

### Shared code extracted from DailyReport.jsx

- `EditableField` — rich text contenteditable with debounced save
- `SnapshotViewer` + diff system
- Export functions (Markdown, HTML publish, Email HTML, PDF)
- `BulletEditor` (for 关键启示 if needed)

### Routing

Same `/report/:reportId` route. If `reportId` starts with `summary-`, render `ConferenceReport`; otherwise render `DailyReport`.

### Report layout

```
┌─ Title bar: "GTC 2026 · 总结稿"
├─ TOC (5 sections)
├─ 现场声音 (block editor: heading + body blocks with citations)
├─ 趋势总结 (same block editor)
├─ 推演分析 (same block editor)
├─ 关键启示 (same block editor)
├─ 附录1: 会议照片 (photo wall with date labels)
└─ 附录2: 参考信息 (auto-generated from citations array)
```

### ReportList changes

- "创建总结稿" button alongside "创建日报"
- Summary reports appear in the same list with a visual badge/tag to distinguish from daily reports

### Export

Reuses existing Markdown/HTML/PDF pipeline. Citation `[N]` references render naturally in all formats. 附录2 becomes a numbered reference list at the end.
