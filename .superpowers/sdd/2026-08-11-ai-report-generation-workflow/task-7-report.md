# Task 7 — deterministic transcript parser report

## Status

Implemented deterministic server-side parsing for normalized TXT/MD/SRT/VTT transcripts, with stable source segments, source offsets, timestamps, evidence normalization, malformed-input validation, and the ten mandated fixtures.

## RED / GREEN

### RED

Command:

```bash
npm run test:run -- api/lib/ai-report/transcript-parser.test.ts
```

Result: failed as expected before implementation because Vitest could not resolve `./transcript-parser`; no tests ran.

### GREEN

The same focused command passed after implementation:

```text
✓ api/lib/ai-report/transcript-parser.test.ts (13 tests)
Test Files  1 passed (1)
Tests  13 passed (13)
```

## Files

- Added `api/lib/ai-report/transcript-parser.ts`.
- Added `api/lib/ai-report/transcript-parser.test.ts`.
- Added exactly the ten fixtures under `api/lib/ai-report/__fixtures__/`: `short.txt`, `long.md`, `timestamps.srt`, `timestamps.vtt`, `mixed-language.txt`, `names-numbers.txt`, `contradictory.txt`, `insufficient.txt`, `prompt-injection.txt`, and `focus-relevant.md`.

## Final verification

```bash
npm run test:run -- api/lib/ai-report/transcript-parser.test.ts
# 1 passed, 13 passed

npm run test:run
# 14 passed, 73 passed

npm run typecheck
# tsc --noEmit exited 0

npm run build
# vite build exited 0; 2556 modules transformed
```

## Self-review

- BOM/CRLF normalization, empty input rejection, and the 500,000 Unicode-code-point limit mirror browser preparation.
- TXT/MD paragraphs retain normalized-source UTF-16 offsets; all formats receive deterministic `seg_####` IDs and whitespace-only `normalizedText`.
- SRT requires numbered cues and comma-millisecond timestamps; VTT requires a `WEBVTT` header, supports optional cue IDs and dot-millisecond timestamps, and removes only `NOTE` blocks.
- Empty cues, malformed or nested cue syntax, malformed timestamps, and non-increasing cue ranges are rejected. Original transcript text is never interpreted as instructions.
- Focused tests cover stable repeat parsing, quote-preserving text, offsets, timestamp metadata, NOTE removal, normalization, limits, and all fixture categories.

## Concerns

None. Parser consumers/evidence validation are intentionally outside this task.
