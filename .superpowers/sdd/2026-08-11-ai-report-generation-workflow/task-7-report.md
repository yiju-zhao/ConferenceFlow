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

## Fix Round 1 — review findings

### Findings addressed

- SRT cue text containing only a number is accepted; only a numeric line immediately followed by a timestamp line is treated as nested cue syntax.
- Exported `normalizeTranscriptSource` is the canonical BOM/CRLF normalization and validation function used by `parseTranscript`. Its documentation defines TXT/MD offsets as indexes into its returned canonical string, with slice-equality assertions for BOM/CRLF and Markdown.
- Added semantic parsing coverage for all ten exact fixtures, including `long.md`, `contradictory.txt`, and `insufficient.txt`.

### Files changed

- `api/lib/ai-report/transcript-parser.ts`
- `api/lib/ai-report/transcript-parser.test.ts`
- This report (`task-7-report.md`)

### RED

Command:

```bash
npm run test:run -- api/lib/ai-report/transcript-parser.test.ts
```

Result: 3 of 15 tests failed as expected: `normalizeTranscriptSource is not a function` in the new canonical-offset assertions, and `invalid SRT cue` for the new numeric-only cue test.

### GREEN and final gates

```bash
npm run test:run -- api/lib/ai-report/transcript-parser.test.ts
# Test Files  1 passed (1)
# Tests  15 passed (15)

npx prettier --check api/lib/ai-report/transcript-parser.ts api/lib/ai-report/transcript-parser.test.ts
# All matched files use Prettier code style!

npm run typecheck
# tsc --noEmit exited 0

npm run build
# vite build exited 0; 2556 modules transformed

npm run test:run
# Test Files  14 passed (14)
# Tests  75 passed (75)
```

### Self-review

The parser now preserves valid numeric subtitle text while still rejecting the distinct nested-cue shape. Canonical normalization is a single exported function used by both callers and parsing, so source quote slicing is reproducible. Fixture coverage exercises every declared format and all ten mandated files. No LLM, RAG, logging, or scope expansion was introduced.

### Concerns

None.
