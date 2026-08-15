# Daily Report Editor UI/UX Optimization

**Date:** 2026-08-14

**Status:** Implemented; authenticated editor browser verification pending an approved session

**Target:** `src/components/report/DailyReport.tsx` and editor-only supporting UI

## Context

The daily-report editor currently uses a bespoke black, inline-styled toolbar while the rest of
ConferenceFlow uses `AppNavbar`, `SectionAccentProvider`, BlueprintJS controls, and semantic CSS
tokens. The editor loading state is a centered “Loading…” line, so the first meaningful render
causes a large layout shift. Long reports also require users to navigate through an in-document
table of contents rather than a persistent editing aid.

The report output itself is already an established, red-branded document. Its preview, print,
email, Markdown export, and published HTML appearance must remain unchanged.

This is an editor-shell improvement inside the existing design system. It introduces no new
brand language, illustration, or raster asset, so the existing ConferenceFlow screens and tokens
are the visual source of truth; an Image Gen asset pass is intentionally unnecessary.

## Goals

1. Make the editor feel like the same product as the calendar, report list, and admin pages.
2. Make long reports easier to navigate without changing the formal report document.
3. Make AI generation consistently discoverable beside every eligible field, Session, and Block.
4. Reduce toolbar clutter while preserving every current editing action.
5. Replace text-only loading with a stable, accessible skeleton that mirrors the editor layout.
6. Preserve all existing report data, collaboration, generation, preview, publishing, and export
   behavior.

## Non-goals

- No Firestore schema, API, AI prompt, generation, adoption, evidence, or transcript changes.
- No changes to preview, print, published HTML, email, or Markdown document structure.
- No right-side AI inspector, command palette, scroll-spy, or new editor framework.
- No copy rewrite and no new workflow beyond regrouping existing actions.
- No redesign of `ConferenceReport` or unrelated application pages.

## Chosen approach

Use a lightweight two-column editing workbench:

- the shared application navigation and a compact sticky editor command bar on top;
- a `224px` sticky outline rail on desktop;
- the existing report document centered in the remaining column;
- a collapsible outline above the document below the desktop breakpoint.

This was selected over a single-column restyle because persistent navigation materially improves
long-report editing, and over a three-column workbench because a permanent AI inspector would
duplicate the existing candidate dialogs and add unnecessary complexity.

## Visual system

### Existing primitives to reuse

- `SectionAccentProvider accent="report"` supplies `--accent-report: #cf0a2c`.
- `AppNavbar showConfTabs` supplies the same application shell as the report list.
- BlueprintJS `Button`, `ButtonGroup`, `Tag`, `Popover`, `Menu`, `MenuItem`, `Divider`, `Icon`, and
  `Tooltip` provide controls and interaction states.
- Existing semantic variables provide surfaces, borders, text, elevation, radii, and dark mode.
- Work Sans remains the UI/chrome typeface; the report document keeps its current typography.

### Color rules

- Red remains the area identity and the primary report action color.
- White/semantic surface replaces the bespoke black toolbar.
- Destructive actions use Blueprint danger styling and live inside the overflow menu.
- Save success remains green; loading and neutral metadata use semantic muted text.
- No hard-coded light-only surface values; dark mode resolves through existing variables and
  Blueprint’s `bp6-dark` styles.

## Editor shell

### Application navigation

Edit mode renders `AppNavbar showConfTabs` inside `SectionAccentProvider accent="report"`.
Preview/view mode renders neither the application navigation nor editor chrome.

### Sticky command bar

The command bar is a white semantic surface with a bottom border and subtle shadow. It becomes
sticky at the top after the navbar scrolls away.

Left group:

- back to report list;
- current report title, truncated safely on narrow widths;
- draft/published `Tag`.

Right group, in priority order:

- presence avatars;
- saving/saved status;
- Save;
- AI focus;
- Preview as the red primary action;
- Export/Share menu;
- More menu.

The More menu contains version history, sync from catalog, and delete Session. Delete remains
visually separated and uses danger intent. Sync progress and result feedback appear next to the
trigger or as a compact status message. No existing command is removed.

### Desktop content grid

The editor-only workspace has a `1440px` maximum width including `20px` inline padding and a
`24px` grid gap. The inner columns are `224px minmax(0, 1152px)`.

The document remains the only elevated “paper” surface. The outline is an open navigation rail,
not another nested card. In edit mode, the document’s existing `.report-container` is aligned in
the grid; view mode keeps its current centered margins and dimensions.

## Outline navigation

The outline is derived from the same current report data as the in-document table of contents:

- related topics and selected Sessions;
- onsite information headings;
- reflections headings;
- rumors;
- site records.

It uses anchor navigation only. There is no IntersectionObserver scroll-spy in this iteration.
Long outlines scroll independently within the viewport. Links use the report-red active/hover
treatment and clear keyboard focus rings.

The in-document table of contents remains untouched because it is part of the formal report
output. The editor outline is marked `no-print` and exists only in edit mode.

## Editing and AI interactions

- Every AI-eligible Daily field, Session, Block heading, and Block body keeps a persistently visible
  compact “AI 生成” action beside its field or section heading.
- AI generation uses red emphasis; transcript upload and other supporting controls use neutral
  secondary styling.
- The existing candidate preview, evidence, rewrite, append, insufficient-source, adoption, and
  stale-content behavior remains unchanged.
- Section-level commands such as Add Session and Add Block align to the right of their section
  heading rather than floating separately in the document flow.
- Session headers present code, title, time, and collapse in one consistent row. Session deletion
  remains in the command bar’s More menu and keeps the existing selection/confirmation flow; no
  second per-Session delete shortcut is introduced.
- Editable field hover and focus states use the existing semantic border/surface tokens. Saving,
  saved, generating, disabled, and error feedback must be visibly distinct and accessible.
- The selection formatting toolbar becomes a semantic surface popover with the shared border,
  radius, and shadow; bold, italic, underline, and color behavior is unchanged.
- All new editor controls are `no-print` and do not enter snapshots or exports.

## Loading skeleton

Create one reusable `DailyReportSkeleton` for both lazy-route loading and Firestore report loading.
It mirrors the final editor geometry:

- navbar shell;
- command bar;
- desktop outline rows;
- document paper;
- red title band;
- two-column table-of-contents/key-points header;
- three Session-shaped content blocks.

The skeleton uses semantic surface and border tokens plus a low-contrast shimmer. It declares an
accessible loading label and `aria-busy="true"`. `prefers-reduced-motion: reduce` disables the
shimmer. Skeleton dimensions closely match the loaded layout to minimize cumulative layout shift.

`ReportRouter` owns a report-specific Suspense boundary so the lazy-module state does not first
show the generic application “Loading…” fallback. `DailyReport` reuses the same skeleton while its
Firestore listeners are resolving.

## Responsive behavior

- Above `960px`: sticky `224px` outline and document grid.
- At or below `960px`: the rail is replaced with a compact collapsible “目录” control above the
  document; the document becomes single-column.
- At or below `700px`: command actions are reduced to Save, Preview, Export, and More; status and
  presence wrap without overlapping the title. Interactive touch targets are at least `36px`.
- The document keeps its current mobile content rules. No horizontal scrolling is introduced.
- Both light and dark mode must be verified at desktop size; desktop and mobile light mode are the
  minimum screenshot gates.

## Component boundaries

Keep `DailyReport` responsible for report state and mutations, but extract presentational editor
chrome so the large component does not grow further:

- `DailyReportEditorShell`: accent provider, navbar, command bar, responsive workspace.
- `DailyReportToolbar`: grouped controls and existing callbacks only.
- `DailyReportOutline`: pure data-to-anchor navigation.
- `DailyReportSkeleton`: shared route/data loading representation.

The shell accepts rendered document content rather than owning report mutations. Toolbar callbacks
remain defined by `DailyReport`. Outline data is derived with `useMemo` from existing topics,
Sessions, and Blocks. Static configuration is hoisted outside render where possible.

## Accessibility and error states

- Menus and tooltips provide accessible names for icon-only controls.
- The mobile outline uses a real disclosure button with `aria-expanded` and `aria-controls`.
- Save and generation status use `role="status"` without repeatedly stealing focus.
- Keyboard focus uses the current `--accent` focus ring.
- Template and AI errors appear in a constrained editor-level banner below the command bar.
- Failed loading behavior remains driven by existing listeners; this change must not hide or
  replace existing recoverable error feedback.

## Testing and verification

### Automated

- Component tests for the editor shell action grouping and overflow menu.
- Outline tests for anchor generation and mobile disclosure.
- Skeleton tests for structure, accessible loading state, and reduced-motion class behavior.
- Daily report integration assertions that edit-only chrome is absent from view mode and remains
  `no-print`.
- Existing report, AI, privacy, export, and Block mutation suites remain green.
- `npm run typecheck`, the complete Vitest suite excluding nested worktrees, and `npm run build`.

### Browser QA

Target flow: authenticated daily-report edit route → navigate through outline → collapse a Session
→ open an AI candidate dialog → observe save state → open Preview/Export/More.

Required viewports:

- desktop at `1440 × 1000`;
- mobile at `390 × 844`;
- desktop dark mode.

Verify page identity, meaningful content, no framework overlay, no relevant console warnings or
errors, no clipping/overlap, working anchor navigation, Session collapse, persistent AI controls,
menu actions, responsive outline disclosure, and unchanged preview document appearance.

## Risks and mitigations

- **Large `DailyReport` component:** extract editor-only presentational components; do not move
  mutation logic during this visual change.
- **Print/export regressions:** keep the report document subtree and existing class names intact;
  mark all added chrome `no-print` and cover view-mode absence with tests.
- **Mobile toolbar crowding:** use grouped menus rather than shrinking text below the design-system
  scale.
- **Duplicate TOC semantics:** label the editor rail as navigation and keep the document TOC as
  report content; do not synchronize active state in this iteration.
- **Dark-mode drift:** use semantic tokens and Blueprint controls rather than new literal colors.

## Acceptance criteria

1. The edit page visibly shares the same navbar, controls, spacing, and state language as other
   ConferenceFlow pages while retaining the red report identity.
2. Desktop editing has a persistent left outline and a centered, unchanged report document.
3. Every eligible AI action is visible without hover and opens the existing candidate workflow.
4. The loading experience shows the report-shaped skeleton with no large content jump.
5. Mobile editing has no horizontal overflow and exposes the outline through a compact disclosure.
6. Preview, print, published HTML, email, and Markdown output are visually and structurally
   unchanged.
7. Automated gates and desktop/mobile/dark browser verification pass with no material mismatch.
