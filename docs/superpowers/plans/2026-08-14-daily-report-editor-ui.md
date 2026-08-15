# Daily Report Editor Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the daily report’s bespoke editing chrome with a responsive, report-red
ConferenceFlow workbench, persistent outline and AI actions, and a report-shaped loading skeleton
without changing the report output or data behavior.

**Architecture:** Keep `DailyReport` as the owner of Firestore state and mutations, and extract
four editor-only presentation units under `report/editor/`: skeleton, outline, shell, and toolbar.
The shell wraps the existing document subtree only in edit mode; view mode continues to render the
same report document. Existing AI and transcript components keep their workflows and receive only
class/structure changes for a consistent persistent action row.

**Tech Stack:** React 18, TypeScript, Vite, React Router, BlueprintJS 6, CSS semantic tokens,
i18next, Vitest, Testing Library, agent-browser.

## Global Constraints

- Scope is the daily report editor only; `ConferenceReport` and unrelated screens do not change.
- Preview, print, published HTML, email HTML, Markdown, snapshot, and privacy behavior must remain
  structurally and visually unchanged.
- Keep `#cf0a2c` as the report accent through `SectionAccentProvider accent="report"`; do not add a
  second palette or hard-code light-only surfaces.
- The editor workspace is `1440px` maximum width including `20px` inline padding, `24px` gap,
  `224px` outline, and a document column capped at `1152px`.
- Switch to a collapsible outline at `960px`; at `700px`, expose Save, Preview, Export, and More as
  the primary toolbar actions; all interactive touch targets are at least `36px`.
- Add no dependencies, routes, backend endpoints, Firestore fields, AI prompt changes, transcript
  behavior, or new product workflow.
- All added editor chrome is absent in view mode and carries `no-print` where applicable.
- Use existing BlueprintJS components and semantic variables; preserve current dark mode.
- Do not create production Firebase users or test data without explicit authority. Authenticated
  browser QA must use an approved test identity or stop with that gate reported as blocked.
- Work test-first. Each functional task records a failing test before implementation and ends with
  a focused green test run plus its own commit.

## File map

**Create**

- `src/components/report/editor/DailyReportSkeleton.tsx` — shared lazy/data loading state.
- `src/components/report/editor/DailyReportSkeleton.test.tsx` — skeleton structure/view-mode tests.
- `src/components/report/editor/DailyReportOutline.tsx` — recursive desktop/mobile anchor outline.
- `src/components/report/editor/DailyReportOutline.test.tsx` — outline and disclosure tests.
- `src/components/report/editor/DailyReportEditorShell.tsx` — navbar and editor workspace boundary.
- `src/components/report/editor/DailyReportEditorShell.test.tsx` — edit/view shell contract tests.
- `src/components/report/editor/DailyReportToolbar.tsx` — grouped Blueprint command surface.
- `src/components/report/editor/DailyReportToolbar.test.tsx` — action/menu/status tests.
- `src/components/report/editor/ReportSessionCollapseButton.tsx` — accessible shared chevron control.
- `src/components/report/editor/ReportSessionCollapseButton.test.tsx` — collapse semantics test.

**Modify**

- `src/main.tsx:18-60` — report-specific Suspense fallback.
- `src/components/report/DailyReport.tsx:1-3499` — compose editor units; keep mutation and document
  logic in place.
- `src/components/report/PresenceBar.tsx:1-58` — replace dark-toolbar inline styling with semantic
  classes.
- `src/components/report/ReportBlockSection.tsx:1-130` — section heading action alignment.
- `src/components/report/SharedEditors.tsx:40-94` — compact vs insertion-zone add control variant.
- `src/components/report/ai/AiFieldAction.tsx:111-133` — persistent generate-action variant.
- `src/components/report/ai/SessionAiSection.tsx:145-194` — compact transcript/generate action row.
- `src/components/report/ai/BlockAiSection.tsx:215-252` — compact transcript/generate action row.
- `src/components/report/ai/TranscriptControl.tsx:110-180` — semantic compact control classes only.
- `src/components/report/ReportBlockSection.test.tsx` and existing AI component tests — lock the
  visible action hierarchy without changing generation behavior.
- `src/i18n/zh-CN.json` and `src/i18n/en-US.json` — editor shell, status, menu, and disclosure copy.
- `src/index.css:1700-2468, 3021-3109, 3300-3570` — editor shell, skeleton, action, responsive,
  reduced-motion, and dark-mode styling.
- `docs/superpowers/specs/2026-08-14-daily-report-editor-ui-design.md` — clarify that Session
  deletion remains the existing top-level flow.

---

### Task 1: Report-shaped loading state

**Files:**

- Create: `src/components/report/editor/DailyReportSkeleton.tsx`
- Create: `src/components/report/editor/DailyReportSkeleton.test.tsx`
- Modify: `src/main.tsx:18-60`
- Modify: `src/components/report/DailyReport.tsx:1472-1481`
- Modify: `src/i18n/zh-CN.json:280-355`
- Modify: `src/i18n/en-US.json:280-355`
- Modify: `src/index.css:1700-1888`

**Interfaces:**

- Produces: `DailyReportSkeleton({ viewMode?: boolean }): JSX.Element`.
- Consumes: `AppNavbar`, `SectionAccentProvider`, and `report.editorLoading`.
- Later tasks reuse the exact skeleton from the report-specific Suspense boundary and Firestore
  loading branch.

- [ ] **Step 1: Write the failing skeleton tests**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import DailyReportSkeleton from "./DailyReportSkeleton";

vi.mock("../../UserAvatar", () => ({
  default: () => <span aria-hidden="true" />,
}));

it("mirrors the editor shell while report data loads", () => {
  render(
    <MemoryRouter initialEntries={["/conference/conf-1/report/report-1"]}>
      <DailyReportSkeleton />
    </MemoryRouter>,
  );
  const status = screen.getByRole("status", { name: "正在加载日报编辑器" });
  expect(status).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("link", { name: "ConferenceFlow" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  expect(status.querySelector(".report-skeleton-toolbar")).toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-outline")).toBeInTheDocument();
  expect(status.querySelectorAll(".report-skeleton-session")).toHaveLength(3);
});

it("omits editor chrome in view mode", () => {
  render(
    <MemoryRouter initialEntries={["/view/report/report-1"]}>
      <DailyReportSkeleton viewMode />
    </MemoryRouter>,
  );
  const status = screen.getByRole("status", { name: "正在加载日报" });
  expect(screen.queryByRole("link", { name: "ConferenceFlow" })).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-toolbar")).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-outline")).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-document")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and record RED**

Run:

```bash
npx vitest run --exclude '.worktrees/**' src/components/report/editor/DailyReportSkeleton.test.tsx
```

Expected: FAIL because `./DailyReportSkeleton` does not exist.

- [ ] **Step 3: Implement the skeleton component**

Create a semantic skeleton with fixed repeated geometry rather than fake copy:

```tsx
import AppNavbar from "../../shell/AppNavbar";
import { SectionAccentProvider } from "../../shell/SectionAccent";
import { useTranslation } from "react-i18next";

export default function DailyReportSkeleton({ viewMode = false }: { viewMode?: boolean }) {
  const { t } = useTranslation();
  const label = viewMode ? t("report.loadingReport") : t("report.editorLoading");

  return (
    <SectionAccentProvider accent="report">
      <div className={`report-page report-skeleton-page${viewMode ? " report-view-mode" : ""}`}>
        {!viewMode && <AppNavbar showConfTabs />}
        <div role="status" aria-label={label} aria-busy="true" className="report-skeleton-status">
          <span className="report-skeleton-a11y">{label}</span>
          {!viewMode && <div className="report-skeleton-toolbar report-skeleton-shimmer" />}
          <div className={`report-skeleton-workspace${viewMode ? " is-view-mode" : ""}`}>
            {!viewMode && (
              <aside className="report-skeleton-outline" aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => (
                  <span key={index} className="report-skeleton-line report-skeleton-shimmer" />
                ))}
              </aside>
            )}
            <div className="report-skeleton-document" aria-hidden="true">
              <div className="report-skeleton-title" />
              <div className="report-skeleton-summary">
                <div className="report-skeleton-panel report-skeleton-shimmer" />
                <div className="report-skeleton-panel report-skeleton-shimmer" />
              </div>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="report-skeleton-session report-skeleton-shimmer" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionAccentProvider>
  );
}
```

Add exact translation values:

```json
"editorLoading": "正在加载日报编辑器",
"loadingReport": "正在加载日报"
```

```json
"editorLoading": "Loading report editor",
"loadingReport": "Loading report"
```

Add skeleton CSS with `min-height` matching the final shell, a red title band, semantic surfaces,
and a `@keyframes report-skeleton-pulse` opacity/background-position animation. Include:

```css
@media (prefers-reduced-motion: reduce) {
  .report-skeleton-shimmer {
    animation: none;
  }
}
```

- [ ] **Step 4: Use the same skeleton for lazy and data loading**

Eagerly import `DailyReportSkeleton` in `src/main.tsx`, then make `ReportRouter` the nearest
Suspense boundary:

```tsx
import DailyReportSkeleton from "./components/report/editor/DailyReportSkeleton";

function ReportRouter({ viewMode = false }: ReportRouterProps) {
  const { reportId } = useParams() as { reportId: string };
  if (reportId.startsWith("summary-")) return <ConferenceReport />;
  return (
    <Suspense fallback={<DailyReportSkeleton viewMode={viewMode} />}>
      <DailyReport viewMode={viewMode} />
    </Suspense>
  );
}
```

Replace the text-only `loading` branch in `DailyReport` with:

```tsx
if (loading) return <DailyReportSkeleton viewMode={viewMode} />;
```

- [ ] **Step 5: Run Task 1 GREEN gates**

Run:

```bash
npx vitest run --exclude '.worktrees/**' src/components/report/editor/DailyReportSkeleton.test.tsx
npm run typecheck
npm run build
```

Expected: skeleton tests pass, TypeScript passes, and Vite builds.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/main.tsx src/components/report/DailyReport.tsx \
  src/components/report/editor/DailyReportSkeleton.tsx \
  src/components/report/editor/DailyReportSkeleton.test.tsx \
  src/i18n/zh-CN.json src/i18n/en-US.json src/index.css
git commit -m "feat(report): add report-shaped editor skeleton"
```

---

### Task 2: Editor shell and responsive outline structure

**Files:**

- Create: `src/components/report/editor/DailyReportOutline.tsx`
- Create: `src/components/report/editor/DailyReportOutline.test.tsx`
- Create: `src/components/report/editor/DailyReportEditorShell.tsx`
- Create: `src/components/report/editor/DailyReportEditorShell.test.tsx`
- Modify: `src/components/report/DailyReport.tsx:337-435, 1484-2110, 2900-2918`
- Modify: `src/index.css:1706-1915, 1963-2034, 3021-3109`

**Interfaces:**

- Produces:

```ts
export interface DailyReportOutlineItem {
  href: string;
  label: string;
  accent?: boolean;
  children?: readonly DailyReportOutlineItem[];
}

export interface DailyReportEditorShellProps {
  viewMode: boolean;
  toolbar?: ReactNode;
  outlineLabel: string;
  outlineItems: readonly DailyReportOutlineItem[];
  status?: ReactNode;
  overlays?: ReactNode;
  children: ReactNode;
}
```

- Consumes: the existing report document as `children`; `DailyReport` retains all callbacks and
  data listeners.
- Later tasks supply `DailyReportToolbar` through the `toolbar` slot.

- [ ] **Step 1: Write recursive outline and shell contract tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import DailyReportOutline from "./DailyReportOutline";

const items = [
  {
    href: "#section-related",
    label: "相关议题",
    children: [
      {
        href: "#topic-ai",
        label: "AI",
        accent: true,
        children: [{ href: "#session-S1", label: "S1 · Agent Workflow" }],
      },
    ],
  },
  { href: "#section-rumors", label: "圈内声音" },
];

it("renders every outline level as an anchor", () => {
  render(<DailyReportOutline label="日报目录" items={items} />);
  expect(screen.getAllByRole("link", { name: "相关议题" })[0]).toHaveAttribute(
    "href",
    "#section-related",
  );
  expect(screen.getAllByRole("link", { name: "AI" })[0]).toHaveAttribute("href", "#topic-ai");
  expect(screen.getAllByRole("link", { name: "S1 · Agent Workflow" })[0]).toHaveAttribute(
    "href",
    "#session-S1",
  );
});

it("opens and closes the mobile disclosure", async () => {
  const user = userEvent.setup();
  render(<DailyReportOutline label="日报目录" items={items} />);
  const button = screen.getByRole("button", { name: "日报目录" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  await user.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getAllByRole("link", { name: "圈内声音" }).at(-1)!);
  expect(button).toHaveAttribute("aria-expanded", "false");
});
```

In `DailyReportEditorShell.test.tsx`, render inside `MemoryRouter`, mock only `UserAvatar`, and
assert the real ConferenceFlow `/dashboard` link plus toolbar, outline, status, overlays, and
document in edit mode. Assert view mode renders only overlays and the document with
`report-view-mode` and no editor workspace.

- [ ] **Step 2: Run Task 2 tests and record RED**

```bash
npx vitest run --exclude '.worktrees/**' \
  src/components/report/editor/DailyReportOutline.test.tsx \
  src/components/report/editor/DailyReportEditorShell.test.tsx
```

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement the recursive outline**

Use one recursive list renderer for desktop and mobile copies:

```tsx
import { useId, useState } from "react";

export interface DailyReportOutlineItem {
  href: string;
  label: string;
  accent?: boolean;
  children?: readonly DailyReportOutlineItem[];
}

function OutlineList({
  items,
  onNavigate,
}: {
  items: readonly DailyReportOutlineItem[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="report-editor-outline-list">
      {items.map((item) => (
        <li key={`${item.href}:${item.label}`}>
          <a
            href={item.href}
            className={item.accent ? "is-accent" : undefined}
            onClick={onNavigate}
          >
            {item.label}
          </a>
          {item.children?.length ? (
            <OutlineList items={item.children} onNavigate={onNavigate} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function DailyReportOutline({
  label,
  items,
}: {
  label: string;
  items: readonly DailyReportOutlineItem[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileId = useId();
  return (
    <>
      <nav className="report-editor-outline no-print" aria-label={label}>
        <h2>{label}</h2>
        <OutlineList items={items} />
      </nav>
      <div className="report-editor-outline-mobile no-print">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={mobileId}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {label}
        </button>
        <nav id={mobileId} aria-label={label} hidden={!mobileOpen}>
          <OutlineList items={items} onNavigate={() => setMobileOpen(false)} />
        </nav>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Implement the shell boundary**

`DailyReportEditorShell` must make the view-mode branch explicit rather than hiding chrome with
CSS alone:

```tsx
import type { ReactNode } from "react";
import AppNavbar from "../../shell/AppNavbar";
import { SectionAccentProvider } from "../../shell/SectionAccent";
import DailyReportOutline, { type DailyReportOutlineItem } from "./DailyReportOutline";

export interface DailyReportEditorShellProps {
  viewMode: boolean;
  toolbar?: ReactNode;
  outlineLabel: string;
  outlineItems: readonly DailyReportOutlineItem[];
  status?: ReactNode;
  overlays?: ReactNode;
  children: ReactNode;
}

export default function DailyReportEditorShell(props: DailyReportEditorShellProps) {
  const { viewMode, toolbar, outlineLabel, outlineItems, status, overlays, children } = props;
  return (
    <SectionAccentProvider accent="report">
      <div className={`report-page${viewMode ? " report-view-mode" : " report-editor-page"}`}>
        {!viewMode && <AppNavbar showConfTabs />}
        {!viewMode ? toolbar : null}
        {!viewMode ? status : null}
        {overlays}
        {viewMode ? (
          children
        ) : (
          <main className="report-editor-workspace">
            <DailyReportOutline label={outlineLabel} items={outlineItems} />
            <div className="report-editor-document">{children}</div>
          </main>
        )}
      </div>
    </SectionAccentProvider>
  );
}
```

- [ ] **Step 5: Derive outline items in `DailyReport` without new state**

Immediately after `orderedTopics`, add a `useMemo<DailyReportOutlineItem[]>` that creates:

- `#section-related` with ungrouped Session anchors and topic anchors containing their Sessions;
- `#section-onsite-info` with non-empty heading Blocks;
- `#section-reflections` with non-empty heading Blocks;
- `#section-rumors`;
- `#section-site-photos`.

Use the exact Session label expression:

```ts
`${session.code} · ${SESSION_CATALOG.get(session.code)?.title || session.title}`
```

Use `topicSlug(topic)` for topic anchors and `#block-${block.id}` for Block anchors. Dependencies
must include `noTopicSessions`, `orderedTopics`, `topicsMap`, the three Block arrays, and translated
section labels.

Wrap the existing render in `DailyReportEditorShell`. Pass the current bespoke toolbar temporarily
through `toolbar`, move floating toolbar/dialogs into `overlays`, and put the unchanged
`.report-container` subtree in `children`. Do not move, rename, or rewrite any content fields.

- [ ] **Step 6: Add desktop shell CSS and run GREEN**

Implement the exact container contract:

```css
.report-editor-workspace {
  display: grid;
  grid-template-columns: 224px minmax(0, 1152px);
  gap: 24px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 20px;
}
.report-editor-outline {
  position: sticky;
  top: 68px;
  align-self: start;
  max-height: calc(100vh - 88px);
  overflow: auto;
}
.report-editor-document .report-container {
  width: 100%;
  margin: 20px 0 48px;
}
.report-editor-outline-mobile {
  display: none;
}
```

Run:

```bash
npx vitest run --exclude '.worktrees/**' \
  src/components/report/editor/DailyReportOutline.test.tsx \
  src/components/report/editor/DailyReportEditorShell.test.tsx \
  src/components/report/ReportBlockSection.test.tsx
npm run typecheck
```

Expected: all focused tests and TypeScript pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/components/report/DailyReport.tsx \
  src/components/report/editor/DailyReportOutline.tsx \
  src/components/report/editor/DailyReportOutline.test.tsx \
  src/components/report/editor/DailyReportEditorShell.tsx \
  src/components/report/editor/DailyReportEditorShell.test.tsx \
  src/index.css
git commit -m "feat(report): add editor shell and outline"
```

---

### Task 3: Unified Blueprint editor toolbar

**Files:**

- Create: `src/components/report/editor/DailyReportToolbar.tsx`
- Create: `src/components/report/editor/DailyReportToolbar.test.tsx`
- Modify: `src/components/report/DailyReport.tsx:110-125, 1484-1785`
- Modify: `src/components/report/PresenceBar.tsx:1-58`
- Modify: `src/i18n/zh-CN.json:280-355`
- Modify: `src/i18n/en-US.json:280-355`
- Modify: `src/index.css:1715-1888, 2863-2875`

**Interfaces:**

```ts
export interface DailyReportToolbarProps {
  backTo: string;
  title: string;
  status: "draft" | "published";
  saveState: "idle" | "saving" | "saved";
  presence?: ReactNode;
  focusHint: string;
  exporting: boolean;
  publishing: boolean;
  syncing: boolean;
  syncMessage: string;
  onSave(): void;
  onOpenFocus(): void;
  onPreview(): void;
  onPublish(): void;
  onExportMarkdown(): void;
  onExportEmail(): void;
  onOpenHistory(): void;
  onSync(): void;
  onDeleteSession(): void;
}
```

- Consumes all existing `DailyReport` callbacks; owns no report state and performs no mutation.
- Produces a single `no-print` toolbar passed to `DailyReportEditorShell`.

- [ ] **Step 1: Write toolbar behavior tests**

Create a complete default props object using `vi.fn()`, then assert:

```tsx
it("shows primary commands and moves maintenance actions into More", async () => {
  const user = userEvent.setup();
  const props = makeProps();
  render(<DailyReportToolbar {...props} />);
  expect(screen.getByRole("button", { name: "保存" })).toBeVisible();
  expect(screen.getByRole("button", { name: "我的关注方向" })).toBeVisible();
  expect(screen.getByRole("button", { name: "预览" })).toBeVisible();
  expect(screen.queryByText("版本历史")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "更多" }));
  expect(screen.getByRole("menuitem", { name: "版本历史" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "更新 Session 信息" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "删除 Session" })).toBeVisible();
  await user.click(screen.getByRole("menuitem", { name: "版本历史" }));
  expect(props.onOpenHistory).toHaveBeenCalledOnce();
});

it("announces save state and invokes export actions", async () => {
  const user = userEvent.setup();
  const props = makeProps({ saveState: "saved" });
  render(<DailyReportToolbar {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("已保存");
  await user.click(screen.getByRole("button", { name: "导出" }));
  await user.click(screen.getByRole("menuitem", { name: "导出 Markdown" }));
  expect(props.onExportMarkdown).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run toolbar tests and record RED**

```bash
npx vitest run --exclude '.worktrees/**' \
  src/components/report/editor/DailyReportToolbar.test.tsx
```

Expected: FAIL because the toolbar component is missing.

- [ ] **Step 3: Implement the toolbar with Blueprint primitives**

Use `Button`, `Divider`, `Menu`, `MenuDivider`, `MenuItem`, `Popover`, `Position`, `Tag`, and
`Tooltip`, plus React Router's `useNavigate`. Resolve `const navigate = useNavigate()` in the
component. Structure it as:

```tsx
<header className="report-editor-toolbar no-print">
  <div className="report-editor-toolbar-inner">
    <div className="report-editor-toolbar-context">
      <Button
        minimal
        small
        icon="chevron-left"
        text={t("report.backToReportsShort")}
        onClick={() => navigate(backTo)}
      />
      <span className="report-editor-toolbar-title" title={title}>{title}</span>
      <Tag minimal intent={status === "published" ? "success" : "none"}>
        {status === "published" ? t("report.statusPublished") : t("report.statusDraft")}
      </Tag>
    </div>
    <div className="report-editor-toolbar-actions">
      {presence}
      <span role="status" className={`report-editor-save-state is-${saveState}`}>
        {saveState === "saving" ? t("common.saving") : null}
        {saveState === "saved" ? t("admin.saved") : null}
      </span>
      <Button small icon="floppy-disk" text={t("common.save")} onClick={onSave} />
      <Tooltip content={focusHint}>
        <Button
          small
          icon="target"
          text={t("report.ai.aiFocus")}
          className="report-editor-focus-action"
          onClick={onOpenFocus}
        />
      </Tooltip>
      <Button
        small
        icon="eye-open"
        text={t("report.preview")}
        className="report-editor-primary-action"
        onClick={onPreview}
      />
      <Popover position={Position.BOTTOM_RIGHT} content={exportMenu}>
        <Button small rightIcon="caret-down" text={t("report.export")} loading={exporting} />
      </Popover>
      <Popover position={Position.BOTTOM_RIGHT} content={moreMenu}>
        <Button small icon="more" aria-label={t("report.more")} />
      </Popover>
    </div>
  </div>
  {syncMessage ? <p role="status" className="report-editor-sync-status">{syncMessage}</p> : null}
</header>
```

`exportMenu` contains Share Report, Export Markdown, and Export Email HTML. `moreMenu` contains a
mobile-only AI focus item, Version History, Sync Session Info, a divider, and Delete Session with
`intent="danger"`. Disable Sync while `syncing`; disable Share while `publishing`.

Add exact copy:

```json
"more": "更多",
"backToReportsShort": "报告列表",
"statusDraft": "草稿",
"statusPublished": "已发布"
```

and:

```json
"more": "More",
"backToReportsShort": "Reports",
"statusDraft": "Draft",
"statusPublished": "Published"
```

Remove the triangle from the existing `report.export` values because Blueprint supplies the
caret: `"导出"` and `"Export"`.

- [ ] **Step 4: Replace the inline toolbar without changing callbacks**

Delete `showExportMenu` and its setter from `DailyReport`. Instantiate `DailyReportToolbar` and
pass it to the shell:

```tsx
<DailyReportToolbar
  backTo={`/conference/${confId}/reports`}
  title={reportData?.title || t("report.dailyReportTitle", { date })}
  status={reportData?.status === "published" ? "published" : "draft"}
  saveState={saveState}
  presence={
    <PresenceBar
      activeUsers={activeUsers}
      memberColorMap={memberColorMap}
      currentUid={user?.uid}
    />
  }
  focusHint={membership?.aiFocus || t("report.ai.noAiFocus")}
  exporting={exporting}
  publishing={publishing}
  syncing={syncing}
  syncMessage={syncMsg}
  onSave={() => void handleSave()}
  onOpenFocus={() => setShowAiFocus(true)}
  onPreview={() => window.open(`/conference/${confId}/report/${reportId}?preview=1`, "_blank")}
  onPublish={() => void handlePublish()}
  onExportMarkdown={() => void handleExport("markdown")}
  onExportEmail={handleEmailExport}
  onOpenHistory={() => setShowHistory(true)}
  onSync={() => void handleSyncFromCatalog()}
  onDeleteSession={() => setShowDeleteSelect(true)}
/>
```

Update `PresenceBar` to use `.presence-bar`, `.presence-avatars`, `.presence-avatar`, and
`.presence-count`; set avatar border to `var(--surface)` rather than `#222`.

- [ ] **Step 5: Add toolbar styling and run GREEN gates**

The toolbar uses `position: sticky; top: 0; z-index: 100`, `var(--surface)`, `var(--border)`, and
`var(--shadow-sm)`. The primary action uses `var(--accent)` and white text. Labels use Work Sans at
`12–13px`; title truncates with ellipsis; toolbar actions never shrink below `36px` height.

Run:

```bash
npx vitest run --exclude '.worktrees/**' \
  src/components/report/editor/DailyReportToolbar.test.tsx \
  src/components/report/editor/DailyReportEditorShell.test.tsx
npm run typecheck
npm run build
```

Expected: focused tests, typecheck, and build pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/report/DailyReport.tsx src/components/report/PresenceBar.tsx \
  src/components/report/editor/DailyReportToolbar.tsx \
  src/components/report/editor/DailyReportToolbar.test.tsx \
  src/i18n/zh-CN.json src/i18n/en-US.json src/index.css
git commit -m "feat(report): unify daily editor toolbar"
```

---

### Task 4: Persistent AI and content editing actions

**Files:**

- Create: `src/components/report/editor/ReportSessionCollapseButton.tsx`
- Create: `src/components/report/editor/ReportSessionCollapseButton.test.tsx`
- Modify: `src/components/report/DailyReport.tsx:1948-2780`
- Modify: `src/components/report/ReportBlockSection.tsx:48-128`
- Modify: `src/components/report/SharedEditors.tsx:40-94`
- Modify: `src/components/report/ai/AiFieldAction.tsx:111-133`
- Modify: `src/components/report/ai/SessionAiSection.tsx:145-194`
- Modify: `src/components/report/ai/BlockAiSection.tsx:215-252`
- Modify: `src/components/report/ai/TranscriptControl.tsx:110-180`
- Modify: `src/components/report/ReportBlockSection.test.tsx`
- Modify: `src/components/report/ai/AiFieldAction.test.tsx`
- Modify: `src/components/report/ai/SessionAiSection.test.tsx`
- Modify: `src/components/report/ai/BlockAiSection.test.tsx`
- Modify: `src/i18n/zh-CN.json` and `src/i18n/en-US.json`
- Modify: `src/index.css:223-430, 2035-2308, 3300-3570`

**Interfaces:**

- Extends `InlineAddButtonProps` with `variant?: "insertion" | "section"`, defaulting to
  `"insertion"`.
- Produces:

```ts
export interface ReportSessionCollapseButtonProps {
  collapsed: boolean;
  sessionLabel: string;
  onToggle(): void;
}
```

- AI requests, transcript hooks, candidate dialogs, and persistence callbacks are unchanged.

- [ ] **Step 1: Write failing hierarchy and accessibility tests**

Add assertions that:

```tsx
expect(screen.getByRole("button", { name: "AI 生成" })).toHaveClass(
  "ai-report-action--generate",
);
```

For Session and Block AI sections, assert `.ai-editor-source-row` contains the transcript control
and a visible generate button even before hover. Preserve the existing disabled assertion when a
required source is missing.

In `ReportBlockSection.test.tsx`, assert the first `InlineAddButton` receives section styling while
between-block controls remain insertion zones:

```tsx
expect(container.querySelector(".inline-add-zone--section")).toBeInTheDocument();
expect(container.querySelectorAll(".inline-add-zone--insertion").length).toBeGreaterThan(0);
```

Create the collapse test:

```tsx
it("exposes collapse state through an explicit button", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  render(
    <ReportSessionCollapseButton
      collapsed={false}
      sessionLabel="S1 · Agent Workflow"
      onToggle={onToggle}
    />,
  );
  const button = screen.getByRole("button", { name: "收起 S1 · Agent Workflow" });
  expect(button).toHaveAttribute("aria-expanded", "true");
  await user.click(button);
  expect(onToggle).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run Task 4 tests and record RED**

```bash
npx vitest run --exclude '.worktrees/**' \
  src/components/report/editor/ReportSessionCollapseButton.test.tsx \
  src/components/report/ReportBlockSection.test.tsx \
  src/components/report/ai/AiFieldAction.test.tsx \
  src/components/report/ai/SessionAiSection.test.tsx \
  src/components/report/ai/BlockAiSection.test.tsx
```

Expected: failures for the missing collapse component and absent action/variant classes.

- [ ] **Step 3: Implement persistent AI action variants**

Add `ai-report-action--generate` to `AiFieldAction`, Session AI, and Block AI generate buttons.
Wrap transcript and generation controls in:

```tsx
<div className="ai-editor-source-row">
  <TranscriptControl transcriptRef={transcriptRef} actions={transcriptActions} />
  <button type="button" className="ai-report-action ai-report-action--generate">
    {t("report.ai.generate")}
  </button>
</div>
```

Retain the existing handlers, disabled conditions, local errors, dialogs, and candidate modals
verbatim. Give `TranscriptControl` its existing semantic sections plus compact classes; do not
remove the private-source hint, supported formats, validation errors, or any modal.

- [ ] **Step 4: Align section actions without changing insertion semantics**

Add `variant` to `InlineAddButton` and class it as:

```tsx
className={`inline-add-zone inline-add-zone--${variant}`}
```

In `ReportBlockSection`, wrap the title and top add action:

```tsx
<div className="report-section-heading-row">
  <h2 id={sectionId} className="report-section-title" style={titleStyle}>{title}</h2>
  {!readOnly ? (
    <InlineAddButton
      variant="section"
      field={field}
      afterId={null}
      openKey={openInlineMenu}
      onOpen={onOpenInlineMenu}
      onInsert={onInsert}
    />
  ) : null}
</div>
```

Pass `variant="insertion"` for controls after each Block. In `DailyReport`, use the same
`.report-section-heading-row` for Core Points + `AiFieldAction` and Related Topics + Add Session.
Keep the title AI action visible inside a `.report-title-ai no-print` slot.

- [ ] **Step 5: Replace glyph collapse indicators with Blueprint icons**

Implement `ReportSessionCollapseButton` with Blueprint `Button`:

```tsx
import { Button } from "@blueprintjs/core";
import { useTranslation } from "react-i18next";

export default function ReportSessionCollapseButton(props: ReportSessionCollapseButtonProps) {
  const { t } = useTranslation();
  const { collapsed, sessionLabel, onToggle } = props;
  return (
    <Button
      minimal
      small
      icon={collapsed ? "chevron-right" : "chevron-down"}
      aria-expanded={!collapsed}
      aria-label={t(collapsed ? "report.expandSession" : "report.collapseSession", {
        session: sessionLabel,
      })}
      onClick={onToggle}
      className="session-collapse-btn no-print"
    />
  );
}
```

Replace both `▶/▼` spans in `DailyReport`. Remove collapse from the entire header’s `onClick` and
cursor style so only the explicit button toggles; links remain independently clickable. Add:

```json
"expandSession": "展开 {{session}}",
"collapseSession": "收起 {{session}}"
```

and:

```json
"expandSession": "Expand {{session}}",
"collapseSession": "Collapse {{session}}"
```

- [ ] **Step 6: Restyle the selection toolbar and action hierarchy**

Move the floating toolbar’s inline appearance into `.report-format-toolbar` and
`.report-format-action` classes. Use `var(--surface)`, `var(--border)`, `var(--text-secondary)`,
`var(--shadow-lg)`, and `var(--radius-md)`. Keep only the computed `top` and `left` inline because
they are selection coordinates. Keep `onMouseDown` behavior unchanged.

Make persistent AI buttons compact red-outline controls; title-band AI uses a white-outline
variant. Make section add controls compact, while between-block insertion zones keep the current
full-width dashed affordance.

- [ ] **Step 7: Run Task 4 GREEN gates**

```bash
npx vitest run --exclude '.worktrees/**' \
  src/components/report/editor/ReportSessionCollapseButton.test.tsx \
  src/components/report/ReportBlockSection.test.tsx \
  src/components/report/ai/AiFieldAction.test.tsx \
  src/components/report/ai/SessionAiSection.test.tsx \
  src/components/report/ai/BlockAiSection.test.tsx \
  src/components/report/ai/TranscriptControl.test.tsx
npm run typecheck
```

Expected: all focused tests and TypeScript pass; existing generation/adoption assertions remain
unchanged and green.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/components/report/DailyReport.tsx src/components/report/ReportBlockSection.tsx \
  src/components/report/SharedEditors.tsx \
  src/components/report/editor/ReportSessionCollapseButton.tsx \
  src/components/report/editor/ReportSessionCollapseButton.test.tsx \
  src/components/report/ReportBlockSection.test.tsx \
  src/components/report/ai/AiFieldAction.tsx \
  src/components/report/ai/AiFieldAction.test.tsx \
  src/components/report/ai/SessionAiSection.tsx \
  src/components/report/ai/SessionAiSection.test.tsx \
  src/components/report/ai/BlockAiSection.tsx \
  src/components/report/ai/BlockAiSection.test.tsx \
  src/components/report/ai/TranscriptControl.tsx \
  src/components/report/ai/TranscriptControl.test.tsx \
  src/i18n/zh-CN.json src/i18n/en-US.json src/index.css
git commit -m "feat(report): clarify editor and AI actions"
```

---

### Task 5: Responsive, dark-mode, print, and end-to-end verification

**Files:**

- Modify: `src/index.css:1700-2468, 3021-3109, 3300-3570`
- Modify: `src/components/report/editor/DailyReportSkeleton.test.tsx`
- Modify: `src/components/report/editor/DailyReportOutline.test.tsx`
- Modify: `src/components/report/editor/DailyReportEditorShell.test.tsx`
- Modify: `src/components/report/editor/DailyReportToolbar.test.tsx`
- Modify: `src/components/report/editor/ReportSessionCollapseButton.test.tsx`
- Modify: `src/components/report/ReportBlockSection.test.tsx`
- Modify only if a browser mismatch proves necessary: the exact editor file implicated by that
  mismatch from Tasks 1–4
- Modify: `docs/superpowers/specs/2026-08-14-daily-report-editor-ui-design.md`

**Interfaces:**

- Consumes the completed skeleton, outline, shell, toolbar, and persistent action classes.
- Produces no new product API. This task closes responsive and verification acceptance criteria.

- [ ] **Step 1: Add view/print regression assertions before CSS polish**

In `DailyReportEditorShell.test.tsx`, assert view mode does not render
`.report-editor-toolbar`, `.report-editor-outline`, or `AppNavbar`. In each editor component test,
assert its editor-only root carries `no-print`. Do not add brittle source-string assertions for the
legacy document subtree; the unchanged `.report-container`, `.report-title-bar`, `.report-header`,
`.report-sessions`, and `.report-site-photos` structure is verified by diff review and the Preview
browser check in Step 5.

Run the five editor tests and `ReportBlockSection.test.tsx` before responsive CSS. Expected:
view-mode and `no-print` assertions pass if Tasks 1–4 are correct; add a regression fix before
continuing if any editor chrome leaks.

- [ ] **Step 2: Implement exact responsive and reduced-motion rules**

Add:

```css
@media (max-width: 960px) {
  .report-editor-workspace {
    display: block;
    max-width: 1152px;
    padding: 0 16px;
  }
  .report-editor-outline {
    display: none;
  }
  .report-editor-outline-mobile {
    display: block;
    margin-top: 16px;
  }
  .report-editor-document .report-container {
    margin-top: 12px;
  }
}

@media (max-width: 700px) {
  .report-editor-toolbar-inner {
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
  }
  .report-editor-toolbar-context {
    min-width: 0;
  }
  .report-editor-focus-action,
  .report-editor-desktop-only,
  .presence-count {
    display: none !important;
  }
  .report-editor-mobile-only {
    display: flex !important;
  }
  .report-editor-workspace {
    padding: 0 10px;
  }
  .report-editor-toolbar .bp6-button {
    min-height: 36px;
  }
}

@media print {
  .report-editor-toolbar,
  .report-editor-outline,
  .report-editor-outline-mobile,
  .report-format-toolbar,
  .report-skeleton-page {
    display: none !important;
  }
}
```

Default `.report-editor-mobile-only` to `display:none`. Verify every new surface uses semantic
tokens, so no separate dark selector is needed except where Blueprint requires a component-specific
override. Keep the existing `.report-view-mode` rules intact.

- [ ] **Step 3: Run the complete automated gates**

```bash
npx prettier --check \
  src/main.tsx src/components/report/DailyReport.tsx src/components/report/PresenceBar.tsx \
  src/components/report/ReportBlockSection.tsx src/components/report/SharedEditors.tsx \
  src/components/report/editor src/components/report/ai src/i18n/zh-CN.json \
  src/i18n/en-US.json src/index.css
npm run typecheck
npx vitest run --exclude '.worktrees/**'
npm run build
git diff --check
```

Expected: Prettier passes for touched files, typecheck passes, 512 or more non-live tests pass, the
10 live DeepSeek tests remain explicitly skipped unless credentials are intentionally supplied,
Vite builds, and diff check is empty.

- [ ] **Step 4: Establish the visual reference and authenticated browser precondition**

Use `agent-browser` because it is available. The reference is the existing Report List at
`1440 × 1000`, which is the approved design-system source. Capture it to
`/tmp/daily-report-editor-reference.png` and inspect it with `view_image`.

Before opening the editor, use only an approved test identity. If no identity is available and the
user has not explicitly authorized isolated temporary Firebase data, stop this step and report the
browser gate as blocked; do not create users or documents implicitly.

- [ ] **Step 5: Run desktop, mobile, and dark-mode browser QA**

Start the app:

```bash
npm run dev -- --host 127.0.0.1
```

Keep one agent-browser namespace/session. Verify this flow:

```text
authenticated report list
→ open one daily report
→ click an outline Session anchor
→ toggle the Session collapse button
→ open an AI generation setup dialog
→ close without generating
→ observe save-state feedback after a harmless edit and restore the original text
→ open Export and More menus
→ open Preview and confirm editor chrome is absent
```

Capture and inspect with `view_image`:

- `/tmp/daily-report-editor-desktop.png` at `1440 × 1000`;
- `/tmp/daily-report-editor-mobile.png` at `390 × 844`;
- `/tmp/daily-report-editor-dark.png` at `1440 × 1000`;
- `/tmp/daily-report-preview.png` at `1440 × 1000`.

Check page identity, non-blank DOM, no framework overlay, no relevant console warnings/errors,
outline navigation, explicit collapse behavior, persistent AI action visibility, menu actions,
mobile disclosure, no horizontal overflow, dark semantic surfaces, and unchanged preview layout.

- [ ] **Step 6: Keep a five-point fidelity ledger and fix every material mismatch**

Record these comparison points during QA:

1. Navbar height, spacing, active report tab, and typography vs Report List.
2. Semantic toolbar surface, red primary Preview button, and grouped command density.
3. `224px` open outline rail, `24px` gap, and single elevated document surface.
4. Persistent AI/transcript controls, section action alignment, and selection toolbar treatment.
5. Mobile disclosure, `36px` touch targets, no clipping, plus dark-mode token fidelity.

For each mismatch, add a focused regression test when behavior is involved, make the smallest CSS
or component correction, rerun the focused test, and recapture the affected screenshot. No
material mismatch may remain at handoff.

- [ ] **Step 7: Final verification, cleanup, and commit**

Rerun:

```bash
npm run typecheck
npx vitest run --exclude '.worktrees/**'
npm run build
git diff --check
git status --short
```

Delete the four `/tmp/daily-report-*.png` QA files after the comparison unless the user asks to
keep them. Review `git status --short` and stage only the following known Task 5 files plus any
specific editor file named in the fidelity ledger; never stage a whole source directory:

```bash
git add src/index.css \
  src/components/report/editor/DailyReportSkeleton.test.tsx \
  src/components/report/editor/DailyReportOutline.test.tsx \
  src/components/report/editor/DailyReportEditorShell.test.tsx \
  src/components/report/editor/DailyReportToolbar.test.tsx \
  src/components/report/editor/ReportSessionCollapseButton.test.tsx \
  src/components/report/ReportBlockSection.test.tsx \
  docs/superpowers/specs/2026-08-14-daily-report-editor-ui-design.md
git diff --cached --check
git commit -m "fix(report): polish responsive editor workspace"
```

Expected final state: clean worktree; all automated gates green; desktop/mobile/dark screenshots
visually match the existing ConferenceFlow design system; preview contains no editor chrome; no
new backend, data, privacy, or generation behavior.
