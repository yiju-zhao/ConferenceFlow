# Task 6 — private transcript lifecycle report

## Status

Implemented browser-side transcript preparation, private Storage/Firestore lifecycle actions, and the non-public transcript control. The implementation deliberately does not add transcript parsing, report integration, or AI calls.

## RED / GREEN

### RED 1 — missing modules

Command:

```bash
npm run test:run -- src/lib/ai-report/transcriptSource.test.ts src/hooks/useTranscriptSource.test.tsx src/components/report/ai/TranscriptControl.test.tsx
```

Result: failed as expected with three unresolved imports: `./transcriptSource`, `./useTranscriptSource`, and `./TranscriptControl`.

### GREEN 1 — core implementation

The same focused command passed with 14 tests after the first implementation.

### RED 2 — replacement confirmation gap

Command:

```bash
npm run test:run -- src/components/report/ai/TranscriptControl.test.tsx
```

Result: failed as expected because selecting a replacement called `saveFile` before confirmation.

### GREEN 2 — replacement confirmation

The full focused command passed with 15 tests after adding the confirmation modal.

## Files

- Added `src/lib/ai-report/transcriptSource.ts` and validation/path tests.
- Added `src/hooks/useTranscriptSource.ts` and lifecycle-order/rollback tests.
- Added `src/components/report/ai/TranscriptControl.tsx` and private-view/confirmation tests.
- Tightened `storage.rules`; the transcript path is exclusively readable/writable by approved members of its conference, with no catch-all rule.
- Added English and Simplified Chinese transcript UI/error copy.

## Final verification

```bash
npm run test:run -- src/lib/ai-report/transcriptSource.test.ts src/hooks/useTranscriptSource.test.tsx src/components/report/ai/TranscriptControl.test.tsx
# 3 passed, 15 passed

npm run typecheck
# tsc --noEmit exited 0

npm run build
# vite build exited 0; 2556 modules transformed
```

## Self-review

- Input is restricted to `.txt`, `.md`, `.srt`, `.vtt`; UTF-8 is fatal-decoded, BOM/line endings normalized, empty and above-500,000-code-point input rejected, and hashes use normalized text.
- Upload writes a newly random conference/report/session-scoped object, commits `TranscriptRef` only after upload succeeds, rolls back a new object after a failed Firestore commit, and deletes the former object only after a successful commit.
- Removal clears the committed reference before its best-effort Storage deletion. View uses Storage bytes and fatal UTF-8 decoding. No raw source is logged or stored in report field state.
- All controls and viewed source reside below `.no-print`; read-only/public mode returns `null`; paste, replace, and delete use explicit confirmation.
- Storage rules contain no `/{allPaths=**}` catch-all. An explicit authenticated `/public/{allPaths=**}` rule preserves the existing `ConferenceReport` legacy summary upload path; it cannot match or widen `conference-transcripts/...` access. This compatibility decision was approved by the coordinator. An emulator rule check is still recommended when Firebase emulator configuration is available.

## Concern

This task provides the hook and control but intentionally does not mount them into `DailyReport`; that report/template integration belongs to a later workflow task.
