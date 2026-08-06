# ConferenceFlow UI/UX Redesign — BlueprintJS Adoption

**Date:** 2026-08-06
**Status:** Approved (design), pending implementation plan
**Branch:** `worktree-blueprint-redesign` (from `origin/main` @ `42e97c9`)

## Context

A new UI/UX design for ConferenceFlow was delivered as an interactive prototype at
`/home/yubaifeng/Downloads/ConferenceFlow 界面复刻.zip`. The prototype is a DirectCraft
(`.dc.html`) artifact that renders with the **Palantir BlueprintJS** component kit
(`bp6-*` classes, `Blueprint.Card` / `Button` / `Tag` / `InputGroup` / `Navbar` / `Tabs`
/ `Menu` / `Dialog`). It covers all 9 existing screens; the `github.md` inside the zip
maps each screen to its current source file and confirms the prototype was originally
derived from this repository.

The current app is React 18 + TypeScript + Vite + react-router v7 + Firebase + Tailwind,
with a bespoke red-branded theme (~3500 lines of `src/index.css`) and `lucide-react` icons.

**Source of truth for the new design:** the rendered prototype. Reference screenshots
were captured during brainstorming (login / dashboard / calendar / reports list / daily
report / admin / super-admin / avatar menu).

## Goal

Rebuild the entire UI on BlueprintJS so the running app faithfully matches the delivered
prototype — unified components, a deliberate per-section accent palette, and working dark
mode — **without changing functionality, data models, routing, or backend.**

## Decisions (approved)

1. **Adopt the real `@blueprintjs/core` + `@blueprintjs/icons`** libraries (not a CSS
   look-alike). Most faithful match to the prototype; dark mode and a11y come for free.
2. **Phased rollout**, foundation-first, then screen-by-screen. Each phase is independently
   shippable and verifiable.
3. **Build a shared foundation layer first** (`shell/` primitives + tokens), then migrate
   screens using it. Avoids per-screen duplication and token drift.

## Design language & tokens

### Color — BlueprintJS structure + per-section accent palette

Confirmed from the prototype's own color tokens. BlueprintJS cobalt (`#2D72D2`) handles
generic primary actions and status intents; each major area carries its own identity color.

| Area | Accent | Used for |
|---|---|---|
| Dashboard | `#4A7FB5` blue | area active state, "Flow" wordmark |
| Calendar (日程) | `#E8976B` orange/sand | area active state |
| Reports / Daily report | `#CF0A2C` red | brand, code badges, section-heading bars, topic dividers, dashed "+ add" buttons, left 3px accent borders |

Status uses BlueprintJS intents: `success` (线下 / 已发布), `warning`, `danger` (delete),
`primary`.

Token changes in `:root` (`src/index.css`):
- Retire global `--brand:#cf0a2c` as the *primary action* color.
- Add `--accent-dash:#4A7FB5`, `--accent-cal:#E8976B`, `--accent-report:#cf0a2c`.
- Keep `--accent-report` driving the report chrome (code badges, section bars, etc.).
- Generic primary buttons use BlueprintJS `intent="primary"` (cobalt), **not** red.

### Typography (unchanged)
Work Sans (headings/navbar) · Inter (body) · DM Mono (codes/meta/time).

### Component mapping (current bespoke → BlueprintJS)
| Current | BlueprintJS |
|---|---|
| `.btn-accent` / `.btn-ghost` | `Button intent="primary"` / `Button minimal` |
| `.gtc-input` + labels | `FormGroup` + `InputGroup` |
| `.bp6-tag` / status pills | `Tag intent="…"` |
| `.card` / `.card-raised` | `Card elevation={…}` |
| modals (`.add-session-overlay` etc.) | `Dialog` |
| `.import-member-dropdown` etc. | `Popover` + `Menu` |
| toasts / status messages | `OverlayToaster` + `Toast` |
| admin sub-nav | `Tabs` (vertical) or `Menu` |
| in-conference top nav | `ButtonGroup` (日程/报告/会议管理) |
| checkboxes / radios / toggles | `Checkbox` / `RadioGroup` / `Switch` |
| tooltips | `Tooltip` |

### Icons
Switch to `@blueprintjs/icons` (the prototype uses Blueprint icons: `calendar`, `envelope`,
`lock`, …). Keep `lucide-react` as a fallback for anything BlueprintJS lacks.

### Dark mode
The prototype supports `bp6-dark`. Toggle `.bp6-dark` on the root via the existing avatar-menu
"深色模式" switch; all BlueprintJS components follow automatically.

## Foundation (Phase 0)

**Dependencies:** add `@blueprintjs/core`, `@blueprintjs/icons`; import BlueprintJS base CSS
(`normalize` + theme). Keep Tailwind for layout utilities only.

**Token bridge:** define the accent CSS vars above so the few retained bespoke classes
(`.code-badge`, report section bar, …) stay single-source-of-truth.

**New `src/components/shell/`:**
- `AppNavbar` — top bar: `Conference **Flow**` wordmark (blue) + in-conference `ButtonGroup`
  (日程/报告/会议管理, active item underlined in the area accent) + `UserAvatar`.
- `PageContainer` — shared max-width + padding.
- `SectionAccent` (React context) — propagates the current area accent to children
  (code badges, active tab, left-accent borders) so screens don't hardcode hex values.

**Routing:** unchanged. Keep `/login`, `/register`, `/dashboard`, `/conference/:confId`,
`/conference/:confId/reports`, `/conference/:confId/report/:reportId`,
`/conference/:confId/admin` (+ nested), `/super-admin`. Only the page chrome is replaced by
`AppNavbar`; active item is derived from the current route (deep links keep working).

**i18n:** reuse i18next keys; no copy changes.

**Phase 0 exit criteria:** app runs; login + dashboard render inside the new shell with the
avatar menu and working dark-mode toggle; inner screens temporarily remain on old styling.

## Screen-by-screen plan

"Logic" column = data/behavior preserved unchanged.

| # | Screen | Current file(s) | Target | Accent |
|---|---|---|---|---|
| 1 | Login | `LoginPage.tsx` | Centered `Card`: wordmark + 2×`FormGroup`/`InputGroup` (icon) + `Button intent=primary` + Google `Button` + register link; conference brand strip | blue |
| 2 | Register | `RegisterPage.tsx` | Same form structure | blue |
| 3 | Dashboard | `Dashboard.tsx` | `AppNavbar` + status row + conference `Card` grid (Tags 线下/线上/管理员, 进入/申请加入 buttons); pending-applications notice | blue |
| 4 | Avatar menu | `UserAvatar.tsx` | `Popover`+`Menu`: edit name (inline `InputGroup`), language, dark `Switch`, admin panel, sign out | — |
| 5 | Calendar (日程) | `calendar/*` | 3-pane: Session pool (`InputGroup` search + rows) · schedule grid (date `Tabs` + filter `ButtonGroup` + time-grouped `Card`s with member pills) · session detail `Card` (code/title/when/room/format/speakers/attendees/attend toggle/official link) | orange |
| 6 | Reports list | `ReportList.tsx` | `AppNavbar` (报告 active) + create `Button`+`Popover` (pick date) + report `Card` list (date, status `Tag`, contributors, count, view/archive buttons, archived toggle) | red |
| 7 | Daily report | `report/DailyReport.tsx` + `report/*` | Sticky toolbar (back, DRAFT `Tag`, saved, save/preview, export `Menu`, version history) + red brand title band + 2-col header (TOC / key points) + topic dividers + session cards (left red accent): code badge, key takeaways, insights, contributors, speakers editor, IntelCard (现场情报/圈内声音/深度研判), site photos. **Collaborative edit / version / PDF-export logic preserved.** | red |
| 7b | Summary report | `report/ConferenceReport.tsx` | Same red report styling, shared with daily report | red |
| 8 | Admin (会议管理) | `admin/*` | Left vertical `Tabs`/`Menu` (设置/Sessions/参会计划/参会申请) + content: settings form (`FormGroup`, `RadioGroup` 公开/私有, save / `danger` delete); sessions `Table`+`Dialog`; attendance members `Table` + by-member grouping; applications approve/reject | admin |
| 9 | Super admin | `SuperAdminPanel.tsx` | 全部会议(N) + create `Button`→`Dialog` (new conf + join code) + conference `Table` + delete-confirm `Dialog` | admin-teal |

**Admin accent:** the prototype's color tokens only define dash/cal/reports/report. The admin
surfaces (会议管理 + super admin) reuse the existing `admin-teal #5E8B7E` from `tailwind.config.js`
as their identity color (exposed as `--accent-admin`).

## Phasing & verification

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 · Foundation | deps, tokens, `shell/`, UserAvatar menu, dark mode, icons | `npm run typecheck` + `npm run build` green; login + dashboard in new shell, dark mode toggles |
| A · Entry surfaces | Login + Register + Dashboard | Auth flow + conference picking fully BlueprintJS; matches prototype screens 00/01 |
| B · Core workspace | Calendar 3-pane | Most-used screen done; matches prototype screen 02 |
| C · Reports | Reports list + Daily report (+ summary) | Report production flow matches 03/04; collab/version/export intact |
| D · Admin | 会议管理 (4 sub-pages) + Super admin | All admin surfaces done; **all 9 screens migrated** |

Each phase = one commit in the worktree; all phases together → one PR.

Verification per phase: `npm run typecheck && npm run build` must pass, plus a manual smoke
of that flow against the prototype screenshot.

## Non-goals

- No backend, Firestore-schema, or `/api` changes (only if a leaked class name forces it — none expected).
- No routing-structure changes; paths preserved, deep links work.
- No new product features; flows match the prototype (≈ current flows). Pure reskin + component unification.
- No removal of existing capabilities (collaborative editing, version history, PDF export, attendance, i18n).
- No copy rewrite — reuse i18n keys.

## Risks & open items

- **BlueprintJS + Tailwind coexistence:** BlueprintJS ships its own CSS reset; verify it
  doesn't clash with Tailwind base. Mitigate by importing BlueprintJS CSS in the right order
  and scoping Tailwind to layout utilities.
- **Bundle size:** BlueprintJS is sizable; use tree-shakeable named imports and rely on
  Vite's lazy-loaded route components (already in place) to keep initial load lean.
- **Report editor fidelity:** the daily report is the most complex surface (rich editable
  fields, TOC drag-order, photos, citations). Migrate chrome to BlueprintJS + red tokens
  first; preserve the content-editable mechanics rather than reimplementing them.
- **Icon coverage:** confirm every `lucide-react` icon currently used has a BlueprintJS
  equivalent; keep lucide for any gaps.
