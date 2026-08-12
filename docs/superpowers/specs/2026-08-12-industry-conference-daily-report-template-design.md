# Industry Conference Daily Report Template V1 Design

**Date:** 2026-08-12

**Status:** Approved

**Target application:** ConferenceFlow

**Template ID:** `industry-conference-daily-report`

**Version:** `1`

## 1. Summary

ConferenceFlow will publish one immutable Chinese template version matching the current industry-conference daily-report UI. It enables AI assistance for every editable text area while keeping calendar metadata, speakers, illustrations, site photos, and other fixed content manual or source-controlled.

The template extends the existing Session- and daily-level AI workflow with a third target scope: one dynamic report Block. The three dynamic sections—现场情报, 圈内声音, and 深度研判—remain arrays of independently editable Blocks. Each Block may have its own private transcript, but all Blocks in the same section use that template field's shared `ai.instruction`.

AI always produces a candidate for review. It never writes directly into a report. A Block can be generated from its transcript, its current draft, or both; a transcript is not required when the Block already contains text.

The implementation stays intentionally small:

- one built-in V1 template and one idempotent publishing script;
- the existing authenticated AI endpoint, extended with a Block request variant;
- the existing candidate preview, rewrite/append, Evidence, and stale-content protections;
- no template editor, generic page builder, new Vercel Function, background workflow, or data-store redesign.

## 2. Goals

1. Publish `industry-conference-daily-report` version `1` to Firestore as an immutable template.
2. Match the editable and fixed content currently rendered by `DailyReport`.
3. Generate fixed-Chinese candidates for every non-image, non-fixed text field.
4. Give each dynamic Block section its own structured `ai.instruction`.
5. Generate each dynamic Block independently without replacing its surrounding array or sibling Blocks.
6. Support Block generation with Transcript only, current draft only, or both.
7. Store one optional private Transcript per Block.
8. Preserve manual editing, optional per-request user instructions, user focus, candidate preview, Evidence, and explicit adoption.
9. Bind new daily reports to V1 automatically.
10. Safely bind compatible legacy, unbound daily reports on their first editable open without overwriting content.

## 3. Non-Goals

- A template editor or template selection UI.
- A general-purpose dynamic-form or page-layout engine.
- A new `dynamic_blocks` field value type.
- Generating photographs, illustrations, speakers, dates, calendar metadata, sources, contributors, or ownership fields.
- Generating an entire dynamic section in one request.
- Sharing one Transcript across multiple Blocks.
- Reading every Session Transcript during daily- or Block-level generation.
- Persisting AI candidates or maintaining an AI generation history.
- Automatically generating content without an explicit user action.
- Rebinding a report that already has another immutable template binding.

## 4. Template Identity and Publication

The immutable document path is:

```text
reportTemplates/industry-conference-daily-report/versions/1
```

The repository contains the canonical V1 definition as a shared TypeScript constant. The document contains:

```ts
interface ReportTemplateVersion {
  templateId: "industry-conference-daily-report";
  version: 1;
  templateHash: string;
  fields: TemplateField[];
}
```

`templateHash` is the lowercase hexadecimal SHA-256 of a stable JSON serialization of `{ templateId, version, fields }`; the hash input excludes `templateHash` itself. Object keys are canonicalized and field order remains part of the versioned definition.

An idempotent admin script publishes the template:

1. Validate the canonical constant with `assertTemplateVersion()`.
2. Recompute and verify its committed `templateHash`.
3. Read the immutable Firestore path.
4. Create the document when it does not exist.
5. Exit successfully without writing when the stored document is byte-for-byte equivalent after canonicalization.
6. Fail without overwriting when the path exists with different content.

Publication uses Firebase Admin credentials and is not exposed through a public API route. This avoids adding a Serverless Function and preserves the Vercel Hobby function-count gate.

## 5. Template Contract Extension

The existing generation scope gains `block`:

```ts
type GenerationScope = "session" | "daily" | "block";
```

For a field with `scope: "block"`, `TemplateField.type` describes one target Block's `content`, not the containing Firestore array. V1 uses `rich_text` for all three dynamic section fields. This avoids a new field value type while keeping candidate values as `string | string[]`.

Only these report fields may be AI-enabled with Block scope:

```ts
type AiBlockField =
  | "onsiteInfoBlocks"
  | "reflectionsBlocks"
  | "rumorsBlocks";
```

The template validator rejects any other Block-scope ID. Existing reserved-field protections for daily and Session targets remain unchanged.

## 6. V1 Fields

Every field has a Chinese label and a non-empty description. Every AI-enabled field has a field-specific `ai.instruction`; these instructions are submitted to the model as structured target data, not concatenated with source material.

| ID | Scope | Type | Modes | Sources | Limits |
| --- | --- | --- | --- | --- | --- |
| `date` | daily | fixed | none | none | — |
| `title` | daily | short_text | rewrite | report content, current draft, user focus | 60 characters |
| `summaryPoints` | daily | bullet_list | rewrite, append | report content, current draft, user focus | 3–5 items |
| `speakers` | session | fixed | none | calendar | — |
| `takeaways` | session | rich_text | rewrite, append | Transcript, current draft, calendar, user focus | 3,000 characters |
| `insights` | session | rich_text | rewrite, append | Transcript, current draft, calendar, user focus | 3,000 characters |
| `illustrations` | session | image | none | none | — |
| `onsiteInfoBlocks` | block | rich_text | rewrite, append | Transcript, current draft, user focus | 3,000 characters |
| `reflectionsBlocks` | block | rich_text | rewrite, append | Transcript, current draft, user focus | 3,000 characters |
| `rumorsBlocks` | block | rich_text | rewrite, append | Transcript, current draft, user focus | 3,000 characters |
| `sitePhotos` | daily | image | none | none | — |

All AI-enabled fields set `evidenceRequired: true`. Fixed and image fields set `enabled: false`, `allowedSources: []`, and `allowedModes: []`.

### 6.1 Field instructions

V1 commits the following exact `ai.instruction` values:

- **`title`:** `根据提供的当前日报内容、标题草稿和用户关注方向，生成一个简洁、具体的中文日报标题。突出当日最重要的行业会议主线，优先使用材料中的明确主题、产品、公司或趋势。不得添加材料外的事实或夸大结论；输出单行标题，不超过60个中文字符。`
- **`summaryPoints`:** `从当前日报及本字段已有草稿中提炼3至5条互不重复的中文核心要点。保留重要的人名、机构、产品、数字和限定条件；每条同时说明关键信息及其意义。仅使用可引用材料，不得补充外部事实。`
- **`takeaways`:** `根据当前 Session 的转录文字、已有草稿和日程信息，归纳会议主题、明确观点、产品或方法、关键数据及演讲者给出的结论。准确保留名称、数字与限定条件，不得把猜测写成事实。`
- **`insights`:** `根据当前 Session 的转录文字、已有草稿、日程信息和用户关注方向，分析潜在影响、相关性、风险、机会与合理的后续行动。明确区分来源事实与分析判断，不得虚构证据。`
- **`onsiteInfoBlocks`:** `根据当前 Block 的转录文字和/或已有草稿生成现场情报。优先记录可观察或有明确来源的产品、公司、组织、客户、生态及竞争动态；材料支持时保留归属与限定条件，不得把传闻写成已验证事实。`
- **`reflectionsBlocks`:** `根据当前 Block 的转录文字和/或已有草稿生成圈内声音。提取有归属的业内观点、反馈、共识、分歧、担忧和态度；已知时保留发言者或机构，并明确区分观点与已验证事实。`
- **`rumorsBlocks`:** `根据当前 Block 的转录文字和/或已有草稿生成深度研判。按照观察证据、合理推断、潜在影响和建议跟进的逻辑组织内容；明确标注不确定性，使结论与材料强度相匹配，不得添加外部事实。`

All instructions require Chinese output. User focus affects selection and emphasis but never serves as factual Evidence.

### 6.2 Block kind behavior

The stored `ReportBlock.type` remains `heading | body` and is provided separately as `blockKind`:

- `heading` accepts rewrite only and must return one short plain-text heading of at most 60 Chinese characters;
- `body` accepts rewrite or append and returns rich text within the template field's length limit.

Both kinds use the enclosing template field's same `ai.instruction`. There is no per-Block copy of that instruction.

## 7. Data Model

### 7.1 Block Transcript

Add one optional Transcript reference to the existing Block:

```ts
interface ReportBlock {
  id: string;
  type: "heading" | "body";
  content: string;
  transcriptRef?: TranscriptRef | null;

  // Existing source, contributor, owner, and edit metadata remain unchanged.
}
```

`ai.instruction` belongs only to the immutable template field. It is not copied into `ReportBlock` or the report document.

Block Transcript objects use a distinct private path namespace:

```text
conference-transcripts/{confId}/{reportId}/blocks/{targetFieldId}/{blockId}/{fileId}.{ext}
```

All path segments are safely normalized. The client and server require the stored path to match the authenticated conference, report, target field, and Block. Existing `.txt`, `.md`, `.srt`, `.vtt`, UTF-8, size, content-hash, replacement, and deletion rules remain in force.

Block Transcript references and source text are excluded from snapshots, candidate persistence, publishing, export, email HTML, and public report HTML.

### 7.2 Deep-analysis Blocks

Add the dynamic field:

```ts
interface Report {
  rumorsBlocks?: ReportBlock[];
  rumors?: string; // Legacy compatibility only.
}
```

The 深度研判 UI adopts the same heading/body Block editing structure already used by现场情报 and圈内声音. New template-bound reports initialize `rumorsBlocks: []` and do not write new content to `rumors`.

## 8. Template Binding and Legacy Compatibility

### 8.1 New reports

Daily-report creation writes:

```ts
{
  templateId: "industry-conference-daily-report",
  templateVersion: 1,
  templateHash: INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateHash,
  rumorsBlocks: []
}
```

These values are written with the existing initial report fields in one create operation.

### 8.2 Existing unbound reports

On the first editable open, a compatibility function handles only reports for which all three binding fields are absent:

1. Never run in preview/read-only mode.
2. Read the exact V1 template document and validate its identity and hash before binding.
3. Never change a report with any existing template binding. A partial binding is an invalid template state, not an unbound report.
4. Merge the V1 binding into the report without overwriting current fields.
5. If `rumorsBlocks` is already non-empty, keep it unchanged.
6. Otherwise, if legacy `rumors` contains visible text, create one `body` Block with ID `legacy-rumors-v1` containing that text.
7. Keep the legacy `rumors` value for compatibility; new edits use `rumorsBlocks`.
8. If no legacy deep-analysis content exists, initialize an empty Block array.

The conversion is deterministic and idempotent. A transaction or equivalent last-read precondition prevents two clients from creating duplicate migrated Blocks.

## 9. Block Product Flow

Each heading or body Block in the three dynamic sections displays private AI controls in edit mode:

1. Paste, upload, view, replace, or delete that Block's Transcript.
2. Click **AI 生成**.
3. Choose rewrite or append when permitted. Heading Blocks show rewrite only.
4. Optionally enter a one-request user instruction. This is distinct from and lower priority than the template's shared `ai.instruction`; it is not persisted.
5. See the current user's conference focus.
6. Generate from the Block's current draft, Transcript, or both.
7. Review the candidate and expandable Evidence.
8. Adopt, regenerate, or cancel.

Adoption updates only the target Block's `content`. It does not modify its `id`, `type`, Transcript, sources, contributors, owner, edit permissions, sibling Blocks, or section order. Existing edit metadata is updated through the normal Block save path.

## 10. API Contract

The existing generation endpoint adds one request variant:

```ts
type GenerateRequest =
  | { scope: "session"; sessionId: string; mode: GenerationMode; instruction?: string }
  | { scope: "daily"; targetFieldId: string; mode: GenerationMode; instruction?: string }
  | {
      scope: "block";
      targetFieldId: AiBlockField;
      blockId: string;
      mode: GenerationMode;
      instruction?: string;
    };
```

The response continues to use a single `CandidateField` whose `fieldId` is the requested Block field. Its value is the candidate for that one Block's `content`. Response context adds the target identity:

```ts
context: {
  templateHash: string;
  transcriptHash?: string;
  baseFieldHashes: Record<string, string>;
  focusUsed: string;
  blockTarget?: {
    targetFieldId: AiBlockField;
    blockId: string;
  };
}
```

The browser verifies `templateHash`, `blockTarget`, optional `transcriptHash`, and the latest target Block content hash before adoption.

## 11. Server Context and Structured Prompt

For a Block request, the authenticated server:

1. Loads the report and its immutable template version.
2. Validates that the target is one of the three Block fields and is AI-enabled with `scope: "block"`.
3. Finds exactly one Block by `blockId` in that field.
4. Verifies the requested mode, including rewrite-only headings.
5. Normalizes the current `content` as the current-draft source.
6. If a Transcript reference exists, verifies its bound path and content hash, then parses it into timestamp-preserving segments.
7. Requires at least one non-empty factual source: current draft or Transcript.
8. Loads only the triggering member's conference focus.
9. Sends one structured prompt payload to DeepSeek.

The model-facing payload is logically equivalent to:

```json
{
  "target": {
    "fieldId": "rumorsBlocks",
    "fieldDescription": "深度研判内容块",
    "blockKind": "body",
    "generationInstruction": "基于材料形成证据、推断、影响与建议……",
    "mode": "rewrite"
  },
  "sources": {
    "currentDraft": "当前记录的文字",
    "transcriptSegments": [],
    "userFocus": "该用户在当前会议的关注方向"
  },
  "userInstruction": "可选的单次补充要求",
  "constraints": {
    "language": "zh-CN",
    "evidenceRequired": true,
    "noFabrication": true
  }
}
```

The actual prompt retains the existing system/data delimiters and treats Transcript, draft, focus, and user instruction as untrusted data. The template instruction, source policy, output schema, Block kind, language, Evidence, and safety rules remain system-controlled.

The model must return strict JSON containing the requested field ID, candidate value, Evidence supports, and an `insufficient` flag. Server validation rejects unsupported quotes, wrong IDs, invalid types, oversized output, append duplication, or unsupported claims.

## 12. Evidence Rules

- Transcript-backed statements cite exact normalized Transcript segments and preserve SRT/VTT timestamps when available.
- Draft-backed statements cite exact excerpts from the target Block's current content.
- User focus and per-request instructions are never Evidence.
- A candidate may use both Transcript and draft Evidence.
- When no valid Evidence remains after validation, the server returns the target as insufficient and no adoptable candidate.
- For append mode, the candidate must contain only new, non-duplicative content; adoption performs the existing deterministic append operation.

## 13. Errors and Conflict Safety

Expected public errors include:

- report or target Block not found;
- immutable template missing, invalid, or mismatched;
- Block target or mode not eligible;
- neither Transcript nor current draft contains usable source material;
- Transcript path outside the bound Block;
- Transcript encoding, format, size, or content hash invalid;
- model timeout, invalid JSON, or unsupported Evidence;
- template, Transcript, target Block, or report content changed after generation.

Errors never clear or replace current report content. The candidate remains in memory only. A stale candidate cannot be applied to another Block, another template version, or a changed draft.

## 14. UI Integration

- Reuse `TranscriptControl`, `AiGenerationDialog`, `AiCandidateModal`, and the existing generation hook.
- Add a small Block-specific coordinator beside `IntelCard`/heading editing rather than teaching the daily-field component to mutate arrays.
- Generalize Transcript preparation and private-object lifecycle helpers, but keep Session and Block Firestore persistence explicit.
- Render Block AI controls only when a valid bound template exposes the matching Block field and the current user may edit that Block.
- Preserve all existing manual Block controls and collaboration permissions.
- Replace the single legacy 深度研判 editor with the same dynamic heading/body controls used by the other two sections.

No new top-level page, template editor, AI status machine, or visual redesign is part of V1.

## 15. Security and Privacy

- Every AI call requires Firebase authentication and approved conference membership.
- The server derives the report, template, Block, Transcript, and user focus from authoritative storage rather than trusting client-supplied content.
- Block Transcript paths receive explicit authenticated Storage rules parallel to Session Transcript paths.
- Published reports and public Storage paths never include Transcript references or source text.
- Logs must not include Transcript content, model prompt bodies, private keys, or DeepSeek API keys.
- DeepSeek receives only the target Block's allowed sources and the minimum report context required by its template policy.

## 16. Test and Release Gates

### 16.1 Unit and contract tests

- V1 passes `assertTemplateVersion()` and contains the expected fields, scopes, modes, limits, sources, descriptions, and non-empty `ai.instruction` values.
- The committed hash equals the canonical SHA-256 and changes when any field policy changes.
- The publishing script creates, no-ops on equivalence, and refuses conflicting overwrite.
- The validator accepts only the three approved Block field IDs.
- Legacy compatibility is idempotent and never changes already-bound reports.
- Legacy `rumors` becomes exactly one body Block only when needed.

### 16.2 Server generation tests

- Transcript-only, draft-only, and combined Block sources generate candidates.
- No-source requests return insufficient without calling DeepSeek.
- Each Block type supplies its own `ai.instruction` as structured target data.
- Daily `title` and `summaryPoints` generation can use their current drafts when the template allows `current_draft`.
- Heading output is rewrite-only, plain text, and length-limited.
- Evidence, prompt-injection defenses, path ownership, Transcript hashes, and stale-content hashes are enforced.
- Adoption target identity cannot be replayed against a sibling Block.

### 16.3 UI and storage tests

- Each Block owns independent Transcript controls and generation state.
- Candidate preview, rewrite/append, regenerate, cancel, and adopt behave as specified.
- Adoption changes only target `content` and edit metadata.
- Transcript objects remain private and are excluded from snapshots and published output.
- Storage rules allow approved members and deny unrelated or public users.

### 16.4 Repository and deployment gates

- Full Vitest suite passes.
- TypeScript typecheck passes.
- Production build passes.
- Formatting check passes for changed files and the repository gate.
- Vercel deployment-function regression remains within the Hobby limit.
- A live DeepSeek quality test runs only when explicitly enabled with valid credentials.

## 17. Rollout Order

1. Publish the immutable V1 template document.
2. Deploy the contract, binding, Block model, server generation, UI, and Storage-rule changes together.
3. Open an existing unbound draft in edit mode and verify safe binding and legacy deep-analysis conversion.
4. Verify one Block with Transcript, one Block with draft only, one Session, and one daily field end to end.
5. Confirm preview/export/public HTML contain generated report text but no Transcript reference or source material.

If template publication is missing or mismatched, reports remain manually editable and AI controls show the existing template-unavailable error; content is never lost.
