# AI report workflow final-review fix report

Date: 2026-08-11

Branch: `feature/ai-report-generation-workflow`

Worktree: `/home/yubaifeng/e84381970/projects/conference-flow/.worktrees/ai-report-generation-workflow`

Review range before fixes: `21548bb2fc96e7759ff484bb9e252d7273af32ae..26711771a74a4ba180287407ffb7fe3f99aeca93`

## Scope and constraints

This was the single final-review fix wave. All five review findings were handled
together without changing the fixed model, route count, Session/daily logical
call counts, candidate persistence model, template boundary, or explicit Adopt
boundary. No live DeepSeek evaluation, authenticated external test, or new
Firebase emulator dependency was run or installed.

## Finding-to-fix mapping

### 1. Mixed Session modes used an intersection instead of a union

- Changed `SessionAiSection` mode discovery from `every(...)` to `some(...)`, so
  each mode is offered when at least one eligible Session field supports it.
- Memoized the eligible field list and derived `targetFields` from the selected
  mode during render. Stale hashing and candidate adoption now use only that
  mode-specific subset.
- A candidate for a field outside the selected mode is rejected before the
  atomic `onSaveFields` callback; unsupported fields are never written.
- Added mixed-template regressions with a rewrite-only field and an append-only
  field. They prove both modes remain available, append adoption ignores a
  concurrently changed rewrite-only field, and an out-of-mode candidate cannot
  be adopted.

Files:

- `src/components/report/ai/SessionAiSection.tsx`
- `src/components/report/ai/SessionAiSection.test.tsx`

### 2. Session append output could replay existing content

- Added `APPEND_ONLY_SYSTEM_INSTRUCTION`, shared by Session and daily Writing
  prompts, explicitly requiring append responses to contain only new material.
- Extracted the source-neutral `appendCandidateRepeatsCurrentValue` validator.
  Both pipelines now use the same normalized bullet/rich-text replay check, so
  their append semantics cannot drift.
- Session validation runs the replay check after template value validation and
  before Evidence is attached. A replayed field becomes insufficient while an
  independently valid field survives.
- Added regressions for a repeated old bullet, old rich text, old-plus-new rich
  text, valid new bullets/rich text, prompt instruction presence, and partial
  survival of an unrelated valid field.
- Re-ran all existing daily append tests to prove the extraction preserved the
  daily behavior.

Files:

- `api/lib/ai-report/append-policy.ts`
- `api/lib/ai-report/generate-session.ts`
- `api/lib/ai-report/generate-session.test.ts`
- `api/lib/ai-report/generate-daily.ts`
- Existing regression coverage: `api/lib/ai-report/generate-daily.test.ts`

### 3. Deleted retained Sessions could become daily sources

- `buildDailySourceBlocks` now creates a validated deleted-Session ID set and
  excludes matching retained `report.sessions` entries before deterministic
  Session sorting and source labeling.
- Added a retained-but-deleted regression proving only the active Session
  becomes a source block and that exact-source Evidence validation rejects the
  deleted Session ID.

Files:

- `api/lib/ai-report/field-policy.ts`
- `api/lib/ai-report/field-policy.test.ts`

### 4. Storage transcript rules omitted API-authorized super-admins

- Replaced the transcript helper with `canAccessConferenceTranscript(confId)`.
  It requires authentication and then permits either the Firebase custom claim
  `globalRole == "super_admin"` or approved membership in the requested
  conference.
- Preserved the explicit transcript path and all existing explicit non-
  transcript paths. No root catch-all was introduced.
- Added a focused policy regression over `storage.rules` for the super-admin
  branch, approved-member branch, transcript rule binding, and absence of a root
  catch-all.
- Updated the non-production release checklist to require Storage Emulator
  checks for both authorized cases plus pending, other-conference, and
  unauthenticated denials. No large emulator harness was added.

Files:

- `storage.rules`
- `storage.rules.test.ts`
- `docs/ai-report-quality-checklist.md`

### 5. Focus and transcript dialogs lacked the shared modal focus behavior

- Reused `useModalFocus` in `AiFocusDialog` with the focus textarea as initial
  focus, labeled description, Tab containment, busy-safe Escape/overlay close,
  and launcher restoration.
- Reused the same hook for TranscriptControl replace, paste, source-view, and
  delete dialogs. Each dialog has a unique accessible label, a meaningful
  initial control, Tab/Shift+Tab containment, busy-safe Escape behavior, and
  restoration to the launch control.
- Kept all component types at module scope; no component was defined inside a
  component and no UI framework was added. Close handlers used by focus hooks
  have stable callback identity.
- Added keyboard/focus regressions for the focus dialog and representative
  paste, delete, and source-view transcript paths, including the busy Escape
  guard.

Files:

- `src/components/report/ai/AiFocusDialog.tsx`
- `src/components/report/ai/AiFocusDialog.test.tsx`
- `src/components/report/ai/TranscriptControl.tsx`
- `src/components/report/ai/TranscriptControl.test.tsx`
- Reused unchanged: `src/components/report/ai/useModalFocus.ts`

## RED evidence

Tests were written before production changes and run with:

```bash
npm run test:run -- src/components/report/ai/SessionAiSection.test.tsx api/lib/ai-report/generate-session.test.ts api/lib/ai-report/field-policy.test.ts storage.rules.test.ts src/components/report/ai/AiFocusDialog.test.tsx src/components/report/ai/TranscriptControl.test.tsx
```

Expected RED result: exit 1, 6 failed test files, 14 failed tests, 33 passed.
Failures directly identified:

- mixed modes produced a disabled Rewrite button and no Append button;
- Session repeated bullet/rich-text candidates were accepted and the Writing
  prompt lacked the append-only instruction;
- the retained deleted Session appeared in daily source blocks;
- the transcript authorization function lacked the super-admin branch;
- focus-dialog initial focus remained on the launcher;
- transcript dialogs had no accessible dialog name or focus behavior.

## Focused GREEN evidence

After the fixes:

```bash
npm run test:run -- src/components/report/ai/SessionAiSection.test.tsx api/lib/ai-report/generate-session.test.ts api/lib/ai-report/generate-daily.test.ts api/lib/ai-report/field-policy.test.ts storage.rules.test.ts src/components/report/ai/AiFocusDialog.test.tsx src/components/report/ai/TranscriptControl.test.tsx
```

Result: exit 0, 7 test files passed, 68 tests passed.

The first full-suite run exposed a test synchronization race in the new
mixed-mode adoption test: the component intentionally invokes an async handler
with `void`, while the test replaced mocked hook state without waiting for the
request boundary. The regression was corrected to wait for the exact append
request before injecting preview state. Production code was unchanged for this
test-only correction.

Focused recheck:

```bash
npm run test:run -- src/components/report/ai/SessionAiSection.test.tsx
```

Result: exit 0, 1 test file passed, 11 tests passed.

## Deterministic full gates

No live test or authenticated external test was included.

```bash
npm run test:run
```

Result: exit 0, 29 test files passed, 1 live-only file skipped; 224 tests
passed and 10 live tests were intentionally skipped.

```bash
npm run typecheck
```

Result: exit 0; `tsc --noEmit` reported no errors.

```bash
npm run build
```

Result: exit 0; Vite transformed 2,569 modules and completed the production
build.

```bash
npm run format:check
```

Result: exit 0; all matched files use Prettier code style.

```bash
git diff --check
```

Result: exit 0 with no whitespace errors.

## Self-review

- Requirements: re-read the plan and global constraints after implementation;
  each review finding has a production change plus focused regression.
- React: all new values are render-derived or local interaction state; there is
  no mirrored derived state, render-phase write, nested component type, or broad
  effect. Field arrays and modal close callbacks have stable identities where
  consumed by hooks.
- AI boundary: Session still performs exactly Evidence then Writing; daily still
  performs exactly one Writing call. The shared append helper performs only
  deterministic local validation.
- Adoption boundary: server modules remain storage-free; the Session component
  still calls persistence only from explicit candidate adoption after template,
  transcript, and mode-specific field-hash checks.
- Privacy: no source text, Evidence, focus, generated content, or secret was
  added to logs. Deleted Session content is removed before the daily prompt and
  Evidence source set are formed.
- Security: transcript Storage remains path-scoped and authenticated, with only
  the two intended authorization branches and no catch-all bypass.
- Diff scope: changes are limited to the five findings, their regressions, the
  release checklist, and this report.

## Concerns and deferred release checks

- The Firebase Storage Emulator scenario is documented but was not run because
  this fix wave explicitly prohibited installing a large emulator harness and
  no existing harness was present.
- The opt-in live DeepSeek quality suite and authenticated non-production flow
  were not run, as explicitly required. They remain release-time checks rather
  than deterministic CI gates.
