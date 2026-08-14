# Industry Conference Daily Report Template V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish and automatically bind an immutable `industry-conference-daily-report` V1 template, including independent transcript-or-draft AI generation for every现场情报、圈内声音、深度研判 Block.

**Architecture:** Keep the current report document and `ReportBlock[]` storage model. Extend the existing template contract and single authenticated generation endpoint with a `block` scope, add one focused Block generation service, and reuse the current Transcript controls, candidate preview, Evidence validation, and explicit adoption flow. Store the canonical template in code and publish it through an idempotent Firebase Admin script; no template editor, new API Function, queue, or generic page-builder layer is introduced.

**Tech Stack:** React 18, TypeScript 5.9, Vite 5, Vitest 3, Firebase Auth/Firestore/Storage, Firebase Admin, Vercel Functions, DeepSeek JSON API, `tsx` for the one-off admin publishing script.

## Global Constraints

- Template identity is exactly `industry-conference-daily-report`, version `1`, with a lowercase SHA-256 `templateHash`.
- Generated report content is fixed Chinese (`zh-CN`).
- Templates are immutable after publication; an existing differing version must never be overwritten.
- The three Block fields are exactly `onsiteInfoBlocks`, `reflectionsBlocks`, and `rumorsBlocks`.
- Every Block generates independently; AI changes only that Block's `content`.
- Each Block field owns one shared template `ai.instruction`; instructions are not copied into report data.
- Every Block-scope template field has `type: "rich_text"`; the validator rejects every other field type at Block scope.
- A Block may generate from its private Transcript, current draft, or both. If both are empty, do not call DeepSeek.
- Block Transcript `confId`, `reportId`, `blockId`, and `fileId` values must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`; validate them without replacement, decoding, normalization, or re-encoding.
- A Block Transcript object name has exactly seven path segments. Build and parse it through one shared utility, compare every identity exactly, and reject extra/missing segments, encoded separators, invalid extensions, and format disagreement before reading Storage.
- Keep the existing Session Transcript namespace and legacy Session path normalization unchanged. V1 is unreleased, so do not add Block-path migration or dual-read behavior.
- AI always returns an in-memory candidate with Evidence; it never directly writes report content.
- Heading Blocks are rewrite-only, plain, single-line, and at most 60 Chinese characters. Body Blocks allow rewrite and append.
- Transcript references and text must not enter snapshots, published HTML, exports, email HTML, or public Storage paths.
- Keep one existing AI API Function; the Vercel Hobby deployment must remain at or below 12 TypeScript API entries.
- Preserve all manual editing, source, contributor, ownership, ordering, and collaboration behavior.
- Use test-driven development for every production change: verify RED, implement minimally, verify GREEN, then commit.
- Do not run the live DeepSeek test unless explicitly enabled with valid credentials.

---

## File Structure

### Shared contract and template

- `src/types/ai-report.ts`: adds Block scope, request target, response target identity, and `AiBlockField`.
- `src/types/firestore.ts`: adds Block Transcript references, `rumorsBlocks`, and expands `BlockField`.
- `src/lib/ai-report/templateContract.ts`: validates only the three approved Block target IDs.
- `src/lib/ai-report/templateHash.ts`: canonical template serialization and SHA-256 calculation.
- `src/lib/ai-report/templates/industryConferenceDailyReport.ts`: canonical immutable V1 definition and binding constant.

### Publication and binding

- `server/report-templates/publishImmutableTemplate.ts`: store-agnostic create/no-op/conflict publication rule.
- `scripts/publish-industry-conference-daily-report.ts`: Firebase Admin command-line publisher.
- `src/lib/ai-report/defaultTemplateBinding.ts`: pure unbound/partial/bound classification and legacy `rumors` migration patch.
- `src/hooks/useDefaultReportTemplateBinding.ts`: validates the published V1 and transactionally binds unbound editable reports.

### Transcript and generation

- `src/hooks/usePrivateTranscriptSource.ts`: shared private Storage lifecycle with injected persistence.
- `src/hooks/useTranscriptSource.ts`: existing Session-specific persistence wrapper.
- `src/hooks/useBlockTranscriptSource.ts`: Block-specific persistence wrapper.
- `server/ai-report/context.ts`: authoritative Block target, optional Transcript, focus, and hash loading.
- `server/ai-report/generate-block.ts`: strict structured DeepSeek prompt, source validation, Evidence, and candidate response.
- `api/conferences/[confId]/reports/[reportId]/ai/generate.ts`: validates and dispatches the new request variant.

### Report UI

- `src/components/report/ai/BlockAiSection.tsx`: one Block's Transcript, generation setup, preview, stale checks, and adoption.
- `src/components/report/ReportBlockSection.tsx`: shared renderer for the three dynamic Block sections.
- `src/components/report/DailyReport.tsx`: default binding, three section instances, immediate Block persistence, and snapshot sanitization.
- `src/components/report/IntelCard.tsx`: accepts the Block AI controls without changing metadata behavior.
- `src/components/report/SnapshotViewer.tsx`: shows `rumorsBlocks` diffs alongside the other Block sections.

---

### Task 1: Extend the AI and Firestore contracts for Block targets

**Files:**

- Modify: `src/types/ai-report.ts`
- Modify: `src/types/firestore.ts`
- Modify: `src/lib/ai-report/templateContract.ts`
- Modify: `src/lib/ai-report/templateContract.test.ts`

**Interfaces:**

- Produces: `AiBlockField`, `AI_BLOCK_FIELDS`, `GenerationScope = "session" | "daily" | "block"`.
- Produces: the `GenerateRequest` Block variant and `GenerateResponse.context.blockTarget`.
- Produces: `BlockField` including `rumorsBlocks`, plus `ReportBlock.transcriptRef` and `Report.rumorsBlocks`.
- Consumed by: Tasks 2–13.

- [ ] **Step 1: Write failing contract tests**

Add this factory and the assertions to `templateContract.test.ts`:

```ts
const blockField = {
  id: "onsiteInfoBlocks",
  label: "现场情报",
  description: "独立的现场情报内容块",
  type: "rich_text",
  scope: "block",
  ai: {
    enabled: true,
    instruction: "仅根据当前 Block 材料生成现场情报。",
    allowedSources: ["transcript", "current_draft", "user_focus"],
    evidenceRequired: true,
    allowedModes: ["rewrite", "append"],
    maxLength: 3000,
  },
} as const;

it("accepts only approved Block-scope field IDs", () => {
  const valid = { ...template, fields: [...template.fields, blockField] };
  expect(assertTemplateVersion(valid).fields.at(-1)?.scope).toBe("block");

  const invalid = structuredClone(valid) as unknown as Record<string, unknown>;
  (invalid.fields as Array<Record<string, unknown>>).at(-1)!.id = "arbitraryBlocks";
  expect(() => assertTemplateVersion(invalid)).toThrow("invalid AI Block field");
});

it("selects eligible Block fields by mode", () => {
  const valid = assertTemplateVersion({ ...template, fields: [...template.fields, blockField] });
  expect(selectEligibleFields(valid, "block", "append").map((field) => field.id)).toEqual([
    "onsiteInfoBlocks",
  ]);
});

it.each(["short_text", "bullet_list", "fixed", "image"])(
  "rejects %s at Block scope",
  (type) => {
    const invalid = structuredClone({ ...template, fields: [...template.fields, blockField] });
    (invalid.fields.at(-1) as Record<string, unknown>).type = type;
    expect(() => assertTemplateVersion(invalid)).toThrow("invalid AI Block field type");
  },
);
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
npx vitest run src/lib/ai-report/templateContract.test.ts
```

Expected: FAIL because `block` is not a valid scope and the validator rejects it.

- [ ] **Step 3: Implement the minimal shared contract**

In `src/types/ai-report.ts`, add:

```ts
export const AI_BLOCK_FIELDS = [
  "onsiteInfoBlocks",
  "reflectionsBlocks",
  "rumorsBlocks",
] as const;
export type AiBlockField = (typeof AI_BLOCK_FIELDS)[number];
export type GenerationScope = "session" | "daily" | "block";

export type GenerateRequest =
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

Add `blockTarget?: { targetFieldId: AiBlockField; blockId: string }` to response context. In `src/types/firestore.ts`, use:

```ts
export type BlockField = "onsiteInfoBlocks" | "reflectionsBlocks" | "rumorsBlocks";

export interface ReportBlock {
  id: string;
  type: ReportBlockType;
  content: string;
  transcriptRef?: TranscriptRef | null;
  // retain every existing metadata property
}
```

Add `rumorsBlocks?: ReportBlock[]` to `Report` and `ReportSnapshotData`. In `templateContract.ts`, allow the `block` scope and reject any Block ID outside a Set built from `AI_BLOCK_FIELDS`:

```ts
if (field.scope === "block") {
  if (!AI_BLOCK_FIELD_IDS.has(field.id as AiBlockField)) {
    throw new Error(`invalid AI Block field: ${field.id}`);
  }
  if (field.type !== "rich_text") {
    throw new Error(`invalid AI Block field type: ${field.id}`);
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

```bash
npx vitest run src/lib/ai-report/templateContract.test.ts
npm run typecheck
```

Expected: template tests pass. Update only exhaustive type branches necessary to keep compilation green; do not implement Block behavior in those branches yet.

- [ ] **Step 5: Commit the contract**

```bash
git add src/types/ai-report.ts src/types/firestore.ts src/lib/ai-report/templateContract.ts src/lib/ai-report/templateContract.test.ts
git commit -m "feat(ai-report): add Block generation contract"
```

### Task 2: Define and hash the immutable V1 template

**Files:**

- Create: `src/lib/ai-report/templateHash.ts`
- Create: `src/lib/ai-report/templateHash.test.ts`
- Create: `src/lib/ai-report/templates/industryConferenceDailyReport.ts`
- Create: `src/lib/ai-report/templates/industryConferenceDailyReport.test.ts`

**Interfaces:**

- Produces: `canonicalTemplateDefinition(template)` and `hashTemplateDefinition(template)`.
- Produces: `INDUSTRY_CONFERENCE_DAILY_REPORT_V1` and `INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING`.
- Consumed by: publishing, binding, and new-report initialization.

- [ ] **Step 1: Write failing hash and template tests**

```ts
it("hashes equivalent template definitions identically", async () => {
  const left = { templateId: "x", version: 1, fields: [{ id: "a", label: "A" }] };
  const right = { fields: [{ label: "A", id: "a" }], version: 1, templateId: "x" };
  expect(await hashTemplateDefinition(left)).toBe(await hashTemplateDefinition(right));
});

it("publishes the approved V1 identity and field policies", async () => {
  const template = assertTemplateVersion(INDUSTRY_CONFERENCE_DAILY_REPORT_V1);
  expect(template.templateId).toBe("industry-conference-daily-report");
  expect(template.version).toBe(1);
  expect(template.templateHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await hashTemplateDefinition(template)).toBe(template.templateHash);
  expect(template.fields.map(({ id, scope }) => [id, scope])).toEqual([
    ["date", "daily"],
    ["title", "daily"],
    ["summaryPoints", "daily"],
    ["speakers", "session"],
    ["takeaways", "session"],
    ["insights", "session"],
    ["illustrations", "session"],
    ["onsiteInfoBlocks", "block"],
    ["reflectionsBlocks", "block"],
    ["rumorsBlocks", "block"],
    ["sitePhotos", "daily"],
  ]);
});

it("stores one non-empty shared instruction per enabled field", () => {
  const enabled = INDUSTRY_CONFERENCE_DAILY_REPORT_V1.fields.filter((field) => field.ai.enabled);
  expect(enabled.every((field) => Boolean(field.ai.instruction?.trim()))).toBe(true);
  expect(enabled.filter((field) => field.scope === "block").map((field) => field.id)).toEqual([
    "onsiteInfoBlocks",
    "reflectionsBlocks",
    "rumorsBlocks",
  ]);
});
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
npx vitest run src/lib/ai-report/templateHash.test.ts src/lib/ai-report/templates/industryConferenceDailyReport.test.ts
```

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement canonical hashing**

Use recursively sorted object keys while preserving array order and excluding only top-level `templateHash`:

```ts
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalTemplateDefinition(template: {
  templateId: string;
  version: number;
  fields: unknown[];
}): string {
  return JSON.stringify(
    canonicalize({ templateId: template.templateId, version: template.version, fields: template.fields }),
  );
}

export function hashTemplateDefinition(template: {
  templateId: string;
  version: number;
  fields: unknown[];
}): Promise<string> {
  return hashText(canonicalTemplateDefinition(template));
}
```

- [ ] **Step 4: Implement the exact V1 fields and binding**

Create the 11 fields in the asserted order. Copy the exact Chinese `ai.instruction` strings, descriptions, modes, sources, and limits from Section 6 of the approved spec. Start from this hashable definition:

```ts
const definition = {
  templateId: "industry-conference-daily-report",
  version: 1,
  fields,
} as const;
```

Compute `hashTemplateDefinition(definition)` once, then commit that lowercase 64-character result as the literal `templateHash` in `INDUSTRY_CONFERENCE_DAILY_REPORT_V1`. Export `INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING` by copying the constant's `templateId`, `version` as `templateVersion`, and `templateHash`. The equality test is the permanent guard: no temporary hash value or runtime mutation may remain in committed code.

- [ ] **Step 5: Verify and commit the template**

```bash
npx vitest run src/lib/ai-report/templateHash.test.ts src/lib/ai-report/templates/industryConferenceDailyReport.test.ts src/lib/ai-report/templateContract.test.ts
npm run typecheck
git add src/lib/ai-report/templateHash.ts src/lib/ai-report/templateHash.test.ts src/lib/ai-report/templates/industryConferenceDailyReport.ts src/lib/ai-report/templates/industryConferenceDailyReport.test.ts
git commit -m "feat(report): define industry daily template V1"
```

### Task 3: Add an idempotent Firebase Admin publisher

**Files:**

- Create: `server/report-templates/publishImmutableTemplate.ts`
- Create: `server/report-templates/publishImmutableTemplate.test.ts`
- Create: `scripts/publish-industry-conference-daily-report.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: canonical V1 and `hashTemplateDefinition()`.
- Produces: `publishImmutableTemplate(template, store): Promise<"created" | "unchanged">`.
- Produces: `npm run template:publish:industry-daily`.

- [ ] **Step 1: Install `tsx` and write failing publication tests**

```bash
npm install --save-dev tsx
```

Use a fake `ImmutableTemplateStore` to test:

```ts
it("creates a missing immutable version", async () => {
  const store = fakeStore(null);
  await expect(publishImmutableTemplate(template, store)).resolves.toBe("created");
  expect(store.create).toHaveBeenCalledWith(template);
});

it("does not rewrite an equivalent existing version", async () => {
  const store = fakeStore(structuredClone(template));
  await expect(publishImmutableTemplate(template, store)).resolves.toBe("unchanged");
  expect(store.create).not.toHaveBeenCalled();
});

it("refuses to overwrite a conflicting immutable version", async () => {
  const store = fakeStore({ ...template, fields: [] });
  await expect(publishImmutableTemplate(template, store)).rejects.toThrow(
    "immutable template version already exists with different content",
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npx vitest run server/report-templates/publishImmutableTemplate.test.ts
```

Expected: FAIL because the publication module is absent.

- [ ] **Step 3: Implement create/no-op/conflict behavior**

```ts
export interface ImmutableTemplateStore {
  read(): Promise<unknown | null>;
  create(template: ReportTemplateVersion): Promise<void>;
}

export async function publishImmutableTemplate(
  rawTemplate: unknown,
  store: ImmutableTemplateStore,
): Promise<"created" | "unchanged"> {
  const template = assertTemplateVersion(rawTemplate);
  if ((await hashTemplateDefinition(template)) !== template.templateHash) {
    throw new Error("templateHash does not match canonical template definition");
  }
  const existing = await store.read();
  if (existing === null) {
    await store.create(template);
    return "created";
  }
  if (canonicalPublishedTemplate(existing) === canonicalPublishedTemplate(template)) {
    return "unchanged";
  }
  throw new Error("immutable template version already exists with different content");
}
```

`canonicalPublishedTemplate()` validates the stored value with `assertTemplateVersion()` and compares stable full JSON including `templateHash`.

- [ ] **Step 4: Add the Firebase Admin entry script**

Use the exact Firestore path and `DocumentReference.create()`:

```ts
const ref = db
  .collection("reportTemplates")
  .doc(INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateId)
  .collection("versions")
  .doc(String(INDUSTRY_CONFERENCE_DAILY_REPORT_V1.version));

const result = await publishImmutableTemplate(INDUSTRY_CONFERENCE_DAILY_REPORT_V1, {
  async read() {
    const snapshot = await ref.get();
    return snapshot.exists ? snapshot.data() : null;
  },
  async create(template) {
    await ref.create(template);
  },
});

console.info(`${INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateId}@1: ${result}`);
```

Add `"template:publish:industry-daily": "tsx scripts/publish-industry-conference-daily-report.ts"` to `scripts`. Never log environment values or template contents.

- [ ] **Step 5: Verify and commit the publisher**

```bash
npx vitest run server/report-templates/publishImmutableTemplate.test.ts src/lib/ai-report/templates/industryConferenceDailyReport.test.ts
env -u FIREBASE_PRIVATE_KEY -u FIREBASE_CLIENT_EMAIL -u FIREBASE_PROJECT_ID -u FIREBASE_STORAGE_BUCKET npm run template:publish:industry-daily
```

Expected: tests pass; the second command exits nonzero with a configuration error and prints no secret.

```bash
git add server/report-templates scripts/publish-industry-conference-daily-report.ts package.json package-lock.json
git commit -m "feat(report): publish immutable daily template"
```

### Task 4: Build deterministic default binding and legacy migration

**Files:**

- Create: `src/lib/ai-report/defaultTemplateBinding.ts`
- Create: `src/lib/ai-report/defaultTemplateBinding.test.ts`
- Create: `src/hooks/useDefaultReportTemplateBinding.ts`
- Create: `src/hooks/useDefaultReportTemplateBinding.test.tsx`

**Interfaces:**

- Produces: `reportTemplateBindingState(report): "unbound" | "partial" | "bound"`.
- Produces: `defaultTemplateBindingPatch(report, template): Partial<Report> | null`.
- Produces: `useDefaultReportTemplateBinding({ confId, reportId, report, enabled })`.

- [ ] **Step 1: Write failing pure migration tests**

```ts
it("binds a fully unbound report without replacing content", () => {
  expect(defaultTemplateBindingPatch({ id: "r1", title: "已有标题" }, template)).toEqual({
    ...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING,
    rumorsBlocks: [],
  });
});

it("migrates visible legacy rumors exactly once", () => {
  const patch = defaultTemplateBindingPatch({ id: "r1", rumors: "<p>已有研判</p>" }, template);
  expect(patch?.rumorsBlocks).toEqual([
    { id: "legacy-rumors-v1", type: "body", content: "<p>已有研判</p>" },
  ]);
});

it.each([
  { id: "r1", templateId: "partial" },
  { id: "r1", templateVersion: 1 },
  { id: "r1", templateHash: "partial" },
  { id: "r1", templateId: "other", templateVersion: 2, templateHash: "hash" },
])("never changes partial or existing bindings", (report) => {
  expect(defaultTemplateBindingPatch(report, template)).toBeNull();
});
```

- [ ] **Step 2: Run pure tests and verify RED**

```bash
npx vitest run src/lib/ai-report/defaultTemplateBinding.test.ts
```

- [ ] **Step 3: Implement classification and the pure patch**

```ts
export function reportTemplateBindingState(report: Partial<Report>) {
  const values = [report.templateId, report.templateVersion, report.templateHash];
  if (values.every((value) => value === undefined)) return "unbound" as const;
  if (values.every((value) => value !== undefined)) return "bound" as const;
  return "partial" as const;
}
```

`defaultTemplateBindingPatch()` validates exact V1 identity/hash, returns `null` unless state is `unbound`, preserves a non-empty `rumorsBlocks`, and creates the deterministic legacy Block only when `htmlToPlainText(report.rumors ?? "").trim()` is non-empty.

- [ ] **Step 4: Write failing hook tests**

Mock `doc`, `getDoc`, and `runTransaction`. Assert that disabled/read-only mode does nothing; the exact V1 path is loaded and validated; missing, invalid, or mismatched templates do not start a transaction; and the transaction re-reads the report before applying one patch.

```ts
useDefaultReportTemplateBinding({ confId: "c1", reportId: "r1", report, enabled: true });
```

- [ ] **Step 5: Run hook tests and verify RED**

```bash
npx vitest run src/hooks/useDefaultReportTemplateBinding.test.tsx
```

- [ ] **Step 6: Implement transactional binding**

Read `reportTemplates/industry-conference-daily-report/versions/1`, validate its full identity against the canonical constant, then use `runTransaction()` to re-read `conferences/{confId}/dailyReports/{reportId}`. Call `transaction.set(reportRef, patch, { merge: true })` only when the pure helper returns a patch. Use a cancellation flag to prevent stale effect state changes.

- [ ] **Step 7: Verify and commit binding logic**

```bash
npx vitest run src/lib/ai-report/defaultTemplateBinding.test.ts src/hooks/useDefaultReportTemplateBinding.test.tsx
npm run typecheck
git add src/lib/ai-report/defaultTemplateBinding.ts src/lib/ai-report/defaultTemplateBinding.test.ts src/hooks/useDefaultReportTemplateBinding.ts src/hooks/useDefaultReportTemplateBinding.test.tsx
git commit -m "feat(report): bind default daily template safely"
```

### Task 5: Bind new reports and sanitize dynamic Blocks in snapshots

**Files:**

- Create: `src/lib/ai-report/reportBlocks.ts`
- Create: `src/lib/ai-report/reportBlocks.test.ts`
- Modify: `src/components/report/DailyReport.tsx`
- Modify: `src/components/report/SnapshotViewer.tsx`

**Interfaces:**

- Consumes: default binding hook and V1 binding constant.
- Produces: `blocksWithoutTranscripts(blocks)` and `replaceReportBlock(blocks, blockId, patch)`.
- Produces: template-bound new report documents and privacy-safe snapshots for all three Block arrays.

- [ ] **Step 1: Write failing Block utility tests**

```ts
it("removes only private Transcript references from snapshot Blocks", () => {
  expect(
    blocksWithoutTranscripts([
      {
        id: "b1",
        type: "body",
        content: "正文",
        transcriptRef,
        ownerId: "u1",
        sourceSessions: [{ id: "S1", manual: "" }],
      },
    ]),
  ).toEqual([
    {
      id: "b1",
      type: "body",
      content: "正文",
      ownerId: "u1",
      sourceSessions: [{ id: "S1", manual: "" }],
    },
  ]);
});

it("patches exactly one Block without changing sibling identity", () => {
  const blocks = [body("b1", "A"), body("b2", "B")];
  expect(replaceReportBlock(blocks, "b1", { content: "新内容" })).toEqual([
    body("b1", "新内容"),
    body("b2", "B"),
  ]);
});
```

- [ ] **Step 2: Run utility tests and verify RED**

```bash
npx vitest run src/lib/ai-report/reportBlocks.test.ts
```

- [ ] **Step 3: Implement immutable Block helpers**

`blocksWithoutTranscripts()` maps every Block through object-rest removal of `transcriptRef`. `replaceReportBlock()` requires exactly one matching ID, throws `report Block not found` otherwise, and returns a new array with only that Block shallow-patched.

- [ ] **Step 4: Integrate report initialization, binding, and snapshots**

In `DailyReport.tsx`:

- call `useDefaultReportTemplateBinding({ confId, reportId, report: reportData, enabled: Boolean(user) && !viewMode })`;
- add `...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING` and `rumorsBlocks: []` to auto-init `setDoc()`;
- retain legacy `rumors` for compatibility;
- include `rumorsBlocks` in snapshot data;
- pass all three Block arrays through `blocksWithoutTranscripts()` before snapshot persistence.

In `SnapshotViewer.tsx`, add `rumorsBlocks` to the Block-diff list while retaining legacy `rumors` diffs.

- [ ] **Step 5: Verify snapshot privacy and type safety**

```bash
npx vitest run src/lib/ai-report/reportBlocks.test.ts src/lib/ai-report/defaultTemplateBinding.test.ts src/hooks/useDefaultReportTemplateBinding.test.tsx
npm run typecheck
```

- [ ] **Step 6: Commit initialization and snapshot changes**

```bash
git add src/lib/ai-report/reportBlocks.ts src/lib/ai-report/reportBlocks.test.ts src/components/report/DailyReport.tsx src/components/report/SnapshotViewer.tsx
git commit -m "feat(report): initialize template-bound daily reports"
```

### Task 6: Generalize private Transcript lifecycle for Block persistence

**Files:**

- Modify: `src/lib/ai-report/transcriptSource.ts`
- Modify: `src/lib/ai-report/transcriptSource.test.ts`
- Create: `src/hooks/usePrivateTranscriptSource.ts`
- Create: `src/hooks/usePrivateTranscriptSource.test.tsx`
- Modify: `src/hooks/useTranscriptSource.ts`
- Modify: `src/hooks/useTranscriptSource.test.tsx`
- Create: `src/hooks/useBlockTranscriptSource.ts`
- Create: `src/hooks/useBlockTranscriptSource.test.tsx`

**Interfaces:**

- Produces: `buildBlockTranscriptStoragePath(confId, reportId, targetFieldId, blockId, fileId, format)`.
- Produces: `isBlockTranscriptPathId(value)` and `parseBlockTranscriptStoragePath(path)` as the single browser/server Block-path contract.
- Produces: `usePrivateTranscriptSource({ current, uid, buildStoragePath, commitReference })`.
- Preserves: existing `useTranscriptSource()` Session API.
- Produces: `useBlockTranscriptSource()` with caller-injected Block persistence.

- [ ] **Step 1: Write and run failing strict Block-path tests**

```ts
it("builds an exact Block Transcript path without transforming accepted IDs", () => {
  expect(
    buildBlockTranscriptStoragePath(
      "conf-1",
      "report_1",
      "rumorsBlocks",
      "block.1",
      "file-1",
      "vtt",
    ),
  ).toBe("conference-transcripts/conf-1/report_1/blocks/rumorsBlocks/block.1/file-1.vtt");
});

it.each([
  "",
  ".",
  "..",
  "block/1",
  "block%2F1",
  "block 1",
  "区块1",
  `b${"x".repeat(128)}`,
])("rejects an unsafe Block Transcript identity: %s", (value) => {
  expect(isBlockTranscriptPathId(value)).toBe(false);
  expect(() =>
    buildBlockTranscriptStoragePath("conf-1", "report-1", "rumorsBlocks", value, "file-1", "vtt"),
  ).toThrow("invalid Block Transcript path identity");
});

it("parses only the exact seven-segment Block Transcript path", () => {
  const path = "conference-transcripts/conf-1/report-1/blocks/rumorsBlocks/block-1/file-1.vtt";
  expect(parseBlockTranscriptStoragePath(path)).toEqual({
    confId: "conf-1",
    reportId: "report-1",
    targetFieldId: "rumorsBlocks",
    blockId: "block-1",
    fileId: "file-1",
    format: "vtt",
  });
  expect(parseBlockTranscriptStoragePath(`${path}/extra`)).toBeNull();
  expect(parseBlockTranscriptStoragePath(path.replace("block-1", "block%2F1"))).toBeNull();
});
```

```bash
npx vitest run src/lib/ai-report/transcriptSource.test.ts
```

Expected: FAIL because the strict Block identity/parser contract is absent.

- [ ] **Step 2: Implement the authoritative strict Block path contract**

Do not reuse or change the legacy Session `safePathSegment()` behavior. Add:

```ts
export const BLOCK_TRANSCRIPT_PATH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isBlockTranscriptPathId(value: unknown): value is string {
  return typeof value === "string" && BLOCK_TRANSCRIPT_PATH_ID_PATTERN.test(value);
}

export interface ParsedBlockTranscriptStoragePath {
  confId: string;
  reportId: string;
  targetFieldId: AiBlockField;
  blockId: string;
  fileId: string;
  format: TranscriptFormat;
}
```

`buildBlockTranscriptStoragePath()` must validate all four ID segments, accept only an `AiBlockField` and `TranscriptFormat`, throw `invalid Block Transcript path identity` on failure, and interpolate accepted strings unchanged.

`parseBlockTranscriptStoragePath()` must split on `/`, require exactly seven segments, require the fixed `conference-transcripts` and `blocks` literals, validate the four identity segments with the same predicate, validate the field through a Set built from `AI_BLOCK_FIELDS`, and parse only a final filename matching `^(.+)\.(txt|md|srt|vtt)$`. Return `null` for any invalid path. The final `fileId` must independently pass the strict ID predicate.

- [ ] **Step 3: Write failing shared lifecycle tests**

Using mocked Storage operations and injected persistence, verify in order:

- upload normalized UTF-8 text, then commit the new reference;
- if commit fails, delete the new object and retain the old reference;
- after commit succeeds, best-effort delete the previous object;
- removal commits `null` before best-effort object deletion;
- load returns UTF-8 text and rejects invalid bytes.

Use this exact hook boundary:

```ts
usePrivateTranscriptSource({
  current,
  uid: "u1",
  buildStoragePath: (fileId, format) => `private/${fileId}.${format}`,
  commitReference: vi.fn(async (_next: TranscriptRef | null) => undefined),
});
```

- [ ] **Step 4: Run lifecycle tests and verify RED**

```bash
npx vitest run src/hooks/usePrivateTranscriptSource.test.tsx
```

- [ ] **Step 5: Extract lifecycle and keep explicit persistence wrappers**

Move only file reading, preparation, upload, view, replacement cleanup, deletion ordering, busy state, and error state into the shared hook. `useTranscriptSource()` supplies the existing Session path and existing Firestore `setDoc()` persistence. `useBlockTranscriptSource()` supplies the Block path and this interface:

```ts
interface UseBlockTranscriptSourceOptions {
  confId: string;
  reportId: string;
  targetFieldId: AiBlockField;
  blockId: string;
  current: TranscriptRef | null | undefined;
  uid: string;
  commitReference(next: TranscriptRef | null): Promise<void>;
}
```

Do not put Block array mutation in a Storage hook.

- [ ] **Step 6: Verify and commit Transcript changes**

```bash
npx vitest run src/lib/ai-report/transcriptSource.test.ts src/hooks/usePrivateTranscriptSource.test.tsx src/hooks/useTranscriptSource.test.tsx src/hooks/useBlockTranscriptSource.test.tsx src/components/report/ai/TranscriptControl.test.tsx
npm run typecheck
git add src/lib/ai-report/transcriptSource.ts src/lib/ai-report/transcriptSource.test.ts src/hooks/usePrivateTranscriptSource.ts src/hooks/usePrivateTranscriptSource.test.tsx src/hooks/useTranscriptSource.ts src/hooks/useTranscriptSource.test.tsx src/hooks/useBlockTranscriptSource.ts src/hooks/useBlockTranscriptSource.test.tsx
git commit -m "feat(ai-report): add private Block transcripts"
```

### Task 7: Authorize private Block Transcript paths

**Files:**

- Modify: `storage.rules`
- Modify: `storage.rules.test.ts`

**Interfaces:**

- Consumes: the Block path from Task 6.
- Produces: approved conference-member/super-admin read-write access to exactly that namespace.

- [ ] **Step 1: Write a failing Storage-rule assertion**

```ts
it("protects nested Block Transcript objects with conference membership", () => {
  expect(rules).toMatch(
    /match \/conference-transcripts\/\{confId\}\/\{reportId\}\/blocks\/\{targetFieldId\}\/\{blockId\}\/\{fileName\}[\s\S]*allow read, write: if canAccessConferenceTranscript\(confId\);/,
  );
});
```

Keep the existing no-root-catch-all test.

- [ ] **Step 2: Run the rule test and verify RED**

```bash
npx vitest run storage.rules.test.ts
```

- [ ] **Step 3: Add the explicit nested match**

```text
match /conference-transcripts/{confId}/{reportId}/blocks/{targetFieldId}/{blockId}/{fileName} {
  allow read, write: if canAccessConferenceTranscript(confId);
}
```

Do not broaden `/public`, `/published-reports`, or a root wildcard.

- [ ] **Step 4: Verify and commit Storage policy**

```bash
npx vitest run storage.rules.test.ts
git add storage.rules storage.rules.test.ts
git commit -m "feat(storage): protect Block transcripts"
```

### Task 8: Allow daily fields to cite their current drafts

**Files:**

- Modify: `server/ai-report/field-policy.ts`
- Modify: `server/ai-report/field-policy.test.ts`
- Modify: `server/ai-report/generate-daily.ts`
- Modify: `server/ai-report/generate-daily.test.ts`
- Modify: `server/ai-report/context.test.ts`

**Interfaces:**

- Produces: `buildDailySourceBlocks()` returning target draft support only when `current_draft` is allowed.
- Preserves: other report and Session fields as `report_content` sources.

- [ ] **Step 1: Write a failing daily-draft source test**

```ts
it("includes the target draft only when current_draft is allowed", () => {
  const target = field("summaryPoints", {
    scope: "daily",
    type: "bullet_list",
    ai: { allowedSources: ["report_content", "current_draft"] },
  });
  expect(
    buildDailySourceBlocks(
      { summaryPoints: ["已有核心要点"], rumors: "其他日报内容" },
      [target, field("rumors", { scope: "daily" })],
      target,
    ),
  ).toEqual(
    expect.arrayContaining([
      { sourceId: "draft:summaryPoints", sourceType: "current_draft", text: "已有核心要点" },
    ]),
  );
});
```

Add a second assertion that removing `current_draft` removes `draft:summaryPoints`.

- [ ] **Step 2: Run field-policy tests and verify RED**

```bash
npx vitest run server/ai-report/field-policy.test.ts
```

- [ ] **Step 3: Build the target draft source**

Make `SourceBlock.sourceType` accept `"transcript"` for Task 10. In `buildDailySourceBlocks()`, after target validation:

```ts
if (target.ai.allowedSources.includes("current_draft")) {
  const text = toSourceText(readReportFieldValue(report, targetId));
  if (text) {
    blocks.push({ sourceId: `draft:${targetId}`, sourceType: "current_draft", text });
  }
}
```

Keep excluding the target from `report:${targetId}` so it cannot be mislabeled as report-content Evidence.

- [ ] **Step 4: Write a failing generation Evidence test**

Mock DeepSeek to support `draft:summaryPoints`, assert the candidate Evidence has `sourceType: "current_draft"`, and assert a template without `current_draft` treats that support as insufficient.

- [ ] **Step 5: Run generation tests and verify RED**

```bash
npx vitest run server/ai-report/generate-daily.test.ts server/ai-report/context.test.ts
```

- [ ] **Step 6: Accept allowed draft blocks in daily generation**

Replace the `report_field`-only filter with:

```ts
return input.sourceBlocks.filter(
  (block) =>
    ((block.sourceType === "report_field" && targetField.ai.allowedSources.includes("report_content")) ||
      (block.sourceType === "current_draft" && targetField.ai.allowedSources.includes("current_draft"))) &&
    block.text.trim() !== "",
);
```

When building `CandidateEvidence`, retain each matched source Block's real `sourceType` rather than forcing `report_field`.

- [ ] **Step 7: Verify and commit daily draft support**

```bash
npx vitest run server/ai-report/field-policy.test.ts server/ai-report/generate-daily.test.ts server/ai-report/context.test.ts
npm run typecheck
git add server/ai-report/field-policy.ts server/ai-report/field-policy.test.ts server/ai-report/generate-daily.ts server/ai-report/generate-daily.test.ts server/ai-report/context.test.ts
git commit -m "feat(ai-report): use daily field drafts as evidence"
```

### Task 9: Load authoritative Block generation context

**Files:**

- Create: `src/lib/ai-report/blockTarget.ts`
- Create: `src/lib/ai-report/blockTarget.test.ts`
- Modify: `src/lib/ai-report/templateContract.ts`
- Modify: `src/lib/ai-report/templateContract.test.ts`
- Modify: `src/lib/ai-report/transcriptSource.ts`
- Modify: `src/lib/ai-report/transcriptSource.test.ts`
- Modify: `server/ai-report/context.ts`
- Modify: `server/ai-report/context.test.ts`

**Interfaces:**

- Produces: `blockContentHashKey(targetFieldId, blockId)`.
- Produces: a `LoadedGenerationContext` Block member with template field, Block kind/content, optional parsed segments/hash, focus, mode, instruction, and base hash.
- Consumed by: Block generator, API route, and UI stale checks.

- [ ] **Step 1: Write failing Block-target and context tests**

```ts
it("uses a collision-safe key for one Block content hash", () => {
  expect(blockContentHashKey("rumorsBlocks", "block.1")).toBe(
    "block:rumorsBlocks:block.1:content",
  );
});
```

Add the Task 1 non-`rich_text` Block-field tests and Task 6 strict builder/parser matrix if they are not already present. Add context tests for draft-only body input; valid VTT Transcript and timestamps; a true Transcript-only input whose current draft is `""`; missing Block; duplicate Block ID; wrong field; append on heading; exact path mismatch; extra/missing path segments; encoded separators; extension/format mismatch; content-hash mismatch; and empty draft with no Transcript. Use:

```ts
const request = {
  scope: "block",
  targetFieldId: "rumorsBlocks",
  blockId: "b1",
  mode: "rewrite",
} as const;
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run src/lib/ai-report/blockTarget.test.ts server/ai-report/context.test.ts
```

- [ ] **Step 3: Implement the stable hash key**

```ts
export function blockContentHashKey(targetFieldId: AiBlockField, blockId: string): string {
  return `block:${targetFieldId}:${encodeURIComponent(blockId)}:content`;
}
```

- [ ] **Step 4: Extend context errors and loaded input**

Add sanitized `BLOCK_NOT_FOUND`, `BLOCK_DUPLICATE`, and `BLOCK_TRANSCRIPT_PATH_MISMATCH` codes. Extend `LoadedGenerationContext` with this exact input shape:

```ts
export interface BlockGenerationInput {
  template: ReportTemplateVersion;
  field: TemplateField;
  targetFieldId: AiBlockField;
  blockId: string;
  blockKind: "heading" | "body";
  currentValue: string;
  segments: TranscriptSegment[];
  focus: string;
  mode: GenerationMode;
  instruction: string;
  templateHash: string;
  transcriptHash?: string;
  baseFieldHashes: Record<string, string>;
}
```

Define it in `context.ts` until Task 10 creates `generate-block.ts`, then move it there without changing the shape.

- [ ] **Step 5: Implement the Block branch before Session loading**

1. Select the exact eligible Block field and reject non-approved IDs.
2. Read `report[targetFieldId]` as an array and require exactly one matching `blockId`.
3. Require `heading | body`; reject append for heading.
4. Without `transcriptRef`, use `segments: []` and omit `transcriptHash`.
5. Normalize the target Block's scalar `content` using the validated `rich_text` field policy, require a string result, and use that same string as `currentValue`.
6. With a reference, parse `storagePath` through `parseBlockTranscriptStoragePath()` before reading the object. Reject unless it yields exactly the authoritative `confId`, `reportId`, `targetFieldId`, and `blockId`, and its parsed extension agrees with `transcriptRef.format`.
7. Reject all malformed or ambiguous paths; do not use `startsWith()`, segment replacement, percent decoding, Unicode normalization, or a sanitized-prefix comparison.
8. Only after identity validation, load UTF-8 bytes, verify content hash, and parse the Transcript while preserving SRT/VTT timestamps.
9. Hash the normalized scalar `currentValue` under `blockContentHashKey()`.
10. Load only the triggering user's focus.

- [ ] **Step 6: Verify and commit Block context**

```bash
npx vitest run src/lib/ai-report/blockTarget.test.ts server/ai-report/context.test.ts server/ai-report/transcript-parser.test.ts
npm run typecheck
git add src/lib/ai-report/blockTarget.ts src/lib/ai-report/blockTarget.test.ts src/lib/ai-report/templateContract.ts src/lib/ai-report/templateContract.test.ts src/lib/ai-report/transcriptSource.ts src/lib/ai-report/transcriptSource.test.ts server/ai-report/context.ts server/ai-report/context.test.ts
git commit -m "feat(ai-report): load Block generation context"
```

### Task 10: Generate one grounded Block candidate

**Files:**

- Create: `server/ai-report/generate-block.ts`
- Create: `server/ai-report/generate-block.test.ts`
- Modify: `server/ai-report/context.ts`

**Interfaces:**

- Consumes: `BlockGenerationInput`, Transcript segments, `validateSourceSupports()`, `validateCandidateValue()`, and append policy.
- Produces: `generateBlockCandidate(input, signal?): Promise<GenerateResponse>`.
- Produces: model payload keys `target`, `sources`, `userInstruction`, and `constraints`.

- [ ] **Step 1: Write failing decoder and no-source tests**

```ts
it("decodes only the exact Block writing schema", () => {
  expect(
    decodeBlockWritingModelOutput({
      fieldId: "rumorsBlocks",
      value: "研判",
      supports: [{ sourceId: "draft:rumorsBlocks:b1", quote: "原始记录" }],
      insufficient: false,
    }),
  ).toEqual(expect.objectContaining({ fieldId: "rumorsBlocks", value: "研判" }));
  expect(() =>
    decodeBlockWritingModelOutput({
      fieldId: "rumorsBlocks",
      value: "研判",
      supports: [],
      insufficient: false,
      extra: true,
    }),
  ).toThrow("invalid Block writing response");
});

it("returns insufficient without calling DeepSeek when both sources are empty", async () => {
  const result = await generateBlockCandidate(input({ currentValue: "", segments: [] }));
  expect(requestDeepSeekJson).not.toHaveBeenCalled();
  expect(result.candidate).toEqual([]);
  expect(result.insufficientFieldIds).toEqual(["rumorsBlocks"]);
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run server/ai-report/generate-block.test.ts
```

- [ ] **Step 3: Implement sources and structured prompt**

Create draft source ID `draft:{targetFieldId}:{encodeURIComponent(blockId)}` only when `current_draft` is allowed and visible text exists. Create one allowed Transcript source per segment with ID `transcript:{segmentId}`. The user-message JSON has this exact top-level structure:

```ts
{
  outputSchema:
    "{ fieldId: string, value: unknown, supports: [{ sourceId, quote }], insufficient: boolean }",
  target: {
    fieldId: input.field.id,
    fieldDescription: input.field.description,
    blockKind: input.blockKind,
    generationInstruction: input.field.ai.instruction ?? "",
    mode: input.mode,
  },
  sources: {
    currentDraft: draftSource ?? null,
    transcriptSegments: transcriptSources,
    userFocus: input.focus,
  },
  userInstruction: input.instruction,
  constraints: {
    language: "zh-CN",
    evidenceRequired: input.field.ai.evidenceRequired,
    noFabrication: true,
  },
}
```

Wrap it in existing `SOURCE_DATA_START`/`SOURCE_DATA_END` delimiters. State in the system message that template policy outranks focus and user instruction and all source fields are untrusted data.

- [ ] **Step 4: Write failing prompt and Evidence tests**

Cover draft-only `current_draft` Evidence, Transcript-only `transcript` Evidence with timestamps, and combined Evidence. Inspect mocked DeepSeek messages and assert the exact template `ai.instruction` is at `target.generationInstruction`. Add cases for unsupported quote, wrong ID, missing Evidence, oversized body, duplicate append, and heading output containing HTML/newline or more than 60 code points.

- [ ] **Step 5: Run tests and verify RED**

```bash
npx vitest run server/ai-report/generate-block.test.ts
```

- [ ] **Step 6: Validate output and construct the response**

- Validate body Blocks with the immutable rich-text policy.
- For headings, derive a validation-only field with `type: "short_text"`, `maxLength: 60`, and `allowedModes: ["rewrite"]`; never mutate the template.
- Require every support to match its labeled source through `validateSourceSupports()`.
- Map Transcript Evidence back to parsed segment timestamps and retain draft Evidence source type.
- Return `blockTarget`, optional `transcriptHash`, exact base hashes, and `focusUsed`.
- Apply `appendCandidateRepeatsCurrentValue()` before returning append content.

- [ ] **Step 7: Move the input type and verify**

Move `BlockGenerationInput` from `context.ts` to `generate-block.ts` and import it type-only in context without changing its shape.

```bash
npx vitest run server/ai-report/generate-block.test.ts server/ai-report/evidence.test.ts server/ai-report/context.test.ts
npm run typecheck
```

- [ ] **Step 8: Commit Block generation**

```bash
git add server/ai-report/generate-block.ts server/ai-report/generate-block.test.ts server/ai-report/context.ts
git commit -m "feat(ai-report): generate grounded Block candidates"
```

### Task 11: Validate and dispatch Block requests through the existing API

**Files:**

- Modify: `api/conferences/[confId]/reports/[reportId]/ai/generate.ts`
- Modify: `server/ai-report/route.test.ts`

**Interfaces:**

- Consumes: Block request contract, loaded context, and `generateBlockCandidate()`.
- Preserves: one `/ai/generate` Vercel Function.

- [ ] **Step 1: Write failing request-parser tests**

```ts
it("accepts one exact Block generation request", () => {
  expect(
    parseGenerateRequest({
      scope: "block",
      targetFieldId: "rumorsBlocks",
      blockId: "b1",
      mode: "append",
      instruction: "关注供应链影响",
    }),
  ).toEqual({
    scope: "block",
    targetFieldId: "rumorsBlocks",
    blockId: "b1",
    mode: "append",
    instruction: "关注供应链影响",
  });
});
```

Reject unknown Block fields, every `blockId` outside the exact strict Block Transcript identity grammar, extra keys, wrong mode, and overlong instruction. Add handler-boundary cases for slash, `%2F`, whitespace, Unicode, `.`, `..`, empty, and 129-character IDs. Add Block-scope cases where `confId` or `reportId` violates the same grammar.

- [ ] **Step 2: Run route tests and verify RED**

```bash
npx vitest run server/ai-report/route.test.ts
```

- [ ] **Step 3: Implement exact request parsing**

Use an `AI_BLOCK_FIELDS` Set. For Block scope, allow exactly `scope`, `targetFieldId`, `blockId`, `mode`, and `instruction`. Require the original, untrimmed `blockId` to pass `isBlockTranscriptPathId()`; never normalize it or accept an arbitrary Firestore field name.

After parsing a Block request, require the route `confId` and `reportId` to pass `isBlockTranscriptPathId()` before context loading. Keep the existing route-ID behavior for Session and daily requests. This intentionally means an imported Block/report with an unsafe identity remains manually editable but cannot use Block AI/Transcript until recreated with application-generated safe IDs.

- [ ] **Step 4: Write a failing handler-dispatch test**

Mock `{ scope: "block", input }`, assert `generateBlockCandidate(input, signal)` is called once, and assert sanitized response/log metadata contains only counts and scope, never prompt or source content.

- [ ] **Step 5: Dispatch with an exhaustive switch**

```ts
let result: GenerateResponse;
switch (context.scope) {
  case "session":
    result = await generateSessionCandidate(context.input, disconnect.signal);
    break;
  case "daily":
    result = await generateDailyCandidate(context.input, disconnect.signal);
    break;
  case "block":
    result = await generateBlockCandidate(context.input, disconnect.signal);
    break;
}
```

Add the new context error messages without exposing paths or source text.

- [ ] **Step 6: Verify route, Function count, and commit**

```bash
npx vitest run server/ai-report/route.test.ts src/test/vercelDeployment.test.ts
npm run typecheck
git add 'api/conferences/[confId]/reports/[reportId]/ai/generate.ts' server/ai-report/route.test.ts
git commit -m "feat(api): route Block AI generation"
```

### Task 12: Build the independent Block AI coordinator

**Files:**

- Create: `src/components/report/ai/BlockAiSection.tsx`
- Create: `src/components/report/ai/BlockAiSection.test.tsx`
- Modify: `src/lib/ai-report/reportBlocks.ts`
- Modify: `src/lib/ai-report/reportBlocks.test.ts`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en-US.json`

**Interfaces:**

- Consumes: `useBlockTranscriptSource()`, `useAiGeneration()`, candidate modal/dialog, `blockContentHashKey()`, and immutable field policy.
- Produces: one self-contained AI control for one Block; persistence remains callback-driven.

- [ ] **Step 1: Add and test visible-draft detection**

Add `hasVisibleBlockContent(block)` to `reportBlocks.ts`, using `htmlToPlainText(block.content).trim().length > 0`. Test empty HTML such as `<p><br></p>` returns false and meaningful HTML returns true.

- [ ] **Step 2: Write failing component tests**

Render one body Block with a valid Block template field and mock generation/transcript hooks. Assert:

- draft-only content enables generation without a Transcript;
- Transcript-only content enables generation;
- no draft and no Transcript disables generation and shows `report.ai.missingBlockSource`;
- heading exposes only rewrite while body exposes rewrite and append;
- request is exactly `{ scope: "block", targetFieldId, blockId, mode, instruction? }`;
- template field `ai.instruction` is not copied into the user instruction request;
- adoption rejects template, Block target, Transcript hash, or draft hash mismatch;
- successful adoption calls `onSaveContent()` once and never passes metadata or sibling data.

Use this public component boundary:

```ts
interface BlockAiSectionProps {
  confId: string;
  reportId: string;
  targetFieldId: AiBlockField;
  templateHash: string;
  field: TemplateField;
  block: ReportBlock;
  focus: string;
  uid: string;
  flushPending(): Promise<void>;
  getLatestBlock(): ReportBlock | undefined;
  commitTranscript(next: TranscriptRef | null): Promise<void>;
  onSaveContent(content: string): Promise<void>;
  readOnly?: boolean;
}
```

- [ ] **Step 3: Run component tests and verify RED**

```bash
npx vitest run src/components/report/ai/BlockAiSection.test.tsx src/lib/ai-report/reportBlocks.test.ts
```

- [ ] **Step 4: Implement generation setup and Transcript controls**

- Return `null` unless the field is enabled, has `scope: "block"`, matches `targetFieldId`, and has a supported mode.
- Use `useBlockTranscriptSource()` with the injected `commitTranscript` callback.
- Render existing `TranscriptControl` and `AiGenerationDialog`.
- Body modes are the field's modes; heading modes are `rewrite` only.
- Before generate/regenerate, await `flushPending()`.
- Allow generation when `block.transcriptRef` exists or `hasVisibleBlockContent(block)` is true.
- Pass only the optional per-request instruction to the API.

- [ ] **Step 5: Implement preview and conflict-safe adoption**

Require:

```ts
response.context.templateHash === templateHash;
response.context.blockTarget?.targetFieldId === targetFieldId;
response.context.blockTarget?.blockId === block.id;
response.context.transcriptHash === getLatestBlock()?.transcriptRef?.contentHash;
```

Hash the latest normalized `content` under `blockContentHashKey(targetFieldId, block.id)` and compare through `candidateIsCurrent()`. Apply the candidate through `applyCandidateValue()`, require a string result, then await `onSaveContent(result)`. Keep the modal open with a localized error on any mismatch or save failure.

- [ ] **Step 6: Add localized copy**

Add fixed Chinese strings for `missingBlockSource`, `generateBlock`, and stale Block content. Add English fallback keys with the same semantics so key lookup never renders raw IDs.

- [ ] **Step 7: Verify and commit the Block coordinator**

```bash
npx vitest run src/components/report/ai/BlockAiSection.test.tsx src/components/report/ai/AiCandidateModal.test.tsx src/components/report/ai/AiGenerationDialog.test.tsx src/components/report/ai/TranscriptControl.test.tsx src/lib/ai-report/reportBlocks.test.ts
npm run typecheck
git add src/components/report/ai/BlockAiSection.tsx src/components/report/ai/BlockAiSection.test.tsx src/lib/ai-report/reportBlocks.ts src/lib/ai-report/reportBlocks.test.ts src/i18n/zh-CN.json src/i18n/en-US.json
git commit -m "feat(report): add independent Block AI controls"
```

### Task 13: Render all three equivalent dynamic Block sections

**Files:**

- Create: `src/components/report/ReportBlockSection.tsx`
- Create: `src/components/report/ReportBlockSection.test.tsx`
- Modify: `src/components/report/IntelCard.tsx`
- Modify: `src/components/report/DailyReport.tsx`
- Modify: `src/index.css`

**Interfaces:**

- Produces: one small renderer shared by现场情报、圈内声音、深度研判.
- Preserves: current heading/body insertion, deletion, ownership, source, contributor, ordering, and read-only behavior.
- Integrates: one `BlockAiSection` per editable Block without moving AI state into the renderer.

- [ ] **Step 1: Write failing shared-renderer tests**

Cover these exact behaviors:

- a heading is rendered as the existing plain editable heading and a body as `IntelCard`;
- `renderAiControls(block, blockReadOnly)` is called once beside each Block;
- insert, update, and remove callbacks receive the renderer's exact `AiBlockField` and Block ID;
- another user's owned Block is read-only for a normal member but editable for an admin;
- view mode hides insert, delete, and AI controls while preserving report content.

Use this focused component boundary:

```ts
interface ReportBlockSectionProps {
  sectionId: string;
  title: string;
  field: AiBlockField;
  blocks: ReportBlock[];
  members: Member[];
  currentUid?: string;
  isAdmin: boolean;
  readOnly: boolean;
  memberColorMap: Record<string, number>;
  conferenceSessions: Session[];
  bodyPlaceholder?: string;
  openInlineMenu: string | null;
  onOpenInlineMenu(value: string | null): void;
  onInsert(field: AiBlockField, type: ReportBlockType, afterId: string | null): void;
  onUpdate(field: AiBlockField, blockId: string, patch: Partial<ReportBlock>): void;
  onRemove(field: AiBlockField, blockId: string): void;
  renderAiControls(block: ReportBlock, blockReadOnly: boolean): ReactNode;
}
```

- [ ] **Step 2: Run renderer tests and verify RED**

```bash
npx vitest run src/components/report/ReportBlockSection.test.tsx
```

- [ ] **Step 3: Implement the renderer and one IntelCard slot**

Move only the duplicated heading/body presentation from `DailyReport.tsx`. Keep `InlineAddButton` and the existing heading paste normalization. Add an optional `aiControls?: ReactNode` prop to `IntelCard` and render it in a `no-print` row adjacent to that card's content; do not alter source or contributor metadata. Heading controls render in the heading row. Use the same ownership predicate already enforced by `IntelCard` when calculating `blockReadOnly`.

- [ ] **Step 4: Write failing DailyReport integration assertions**

Add source-level or component tests that prove:

- `ReportBlockSection` is instantiated exactly once for each of `onsiteInfoBlocks`, `reflectionsBlocks`, and `rumorsBlocks`;
- the old daily-scope `rumors` `AiFieldAction` and single `EditableField` are no longer rendered;
- every rendered Block receives a `BlockAiSection` using its own field ID, Block ID, Transcript reference, and the current member's `aiFocus`;
- a Transcript commit or adopted candidate persists only the selected Block and preserves all sibling data.

- [ ] **Step 5: Add conflict-safe single-Block persistence**

Import `runTransaction` and add an immediate `persistBlockPatch(field, blockId, patch)` callback. Inside one Firestore transaction:

```ts
const reportRef = doc(db, "conferences", confId, "dailyReports", reportId);
const snapshot = await transaction.get(reportRef);
if (!snapshot.exists()) throw new Error("report not found");
const latest = snapshot.data() as Report;
const blocks = Array.isArray(latest[field]) ? latest[field] : [];
const next = replaceReportBlock(blocks, blockId, patch);
transaction.set(reportRef, { [field]: next }, { merge: true });
```

The Transcript callback first awaits `flushPending()`, then writes only `transcriptRef`. Candidate adoption writes only `content`, `lastEditedBy`, and `lastEditedAt`. Manual metadata edits keep the existing save path. Throw on missing/duplicate target Blocks; never recreate a deleted Block or replace an array built from stale client state.

- [ ] **Step 6: Replace the three section implementations**

For each approved Block field:

1. Read the matching field from the bound template.
2. Render `ReportBlockSection` with the existing Chinese label and placeholder.
3. In `renderAiControls`, render `BlockAiSection` only when the template field exists and the user is authenticated.
4. Supply `getLatestBlock()` from `reportDataRef`, a Transcript commit backed by `persistBlockPatch()`, and an adopted-content callback backed by the same transaction helper.
5. Pass `membership?.aiFocus ?? ""` so generation always uses the triggering user's focus.

Retain the legacy `rumors` field in stored data and snapshot comparison for compatibility, but stop using it for new editing or generation. Add only the minimal CSS needed to place the controls without redesigning the report.

- [ ] **Step 7: Verify all Block UI behavior and commit**

```bash
npx vitest run src/components/report/ReportBlockSection.test.tsx src/components/report/ai/BlockAiSection.test.tsx src/components/report/ai/AiFieldAction.test.tsx src/components/report/ai/SessionAiSection.test.tsx src/lib/ai-report/reportBlocks.test.ts
npm run typecheck
npm run build
git add src/components/report/ReportBlockSection.tsx src/components/report/ReportBlockSection.test.tsx src/components/report/IntelCard.tsx src/components/report/DailyReport.tsx src/index.css
git commit -m "feat(report): add AI to all dynamic report Blocks"
```

### Task 14: Verify privacy, publish V1, deploy rules, and update the existing PR

**Files:**

- Verify all changed production, test, configuration, and documentation files.
- No new production file is expected in this task.

**Interfaces:**

- Publishes: only `reportTemplates/industry-conference-daily-report/versions/1`.
- Deploys: only Firebase Storage rules to project `gtc-2026-session-daal`.
- Updates: the current feature branch and its existing pull request; it does not merge the PR.

- [ ] **Step 1: Run the focused regression suite**

```bash
npx vitest run \
  src/lib/ai-report/templateContract.test.ts \
  src/lib/ai-report/templateHash.test.ts \
  src/lib/ai-report/templates/industryConferenceDailyReport.test.ts \
  src/lib/ai-report/defaultTemplateBinding.test.ts \
  src/lib/ai-report/reportBlocks.test.ts \
  src/lib/ai-report/transcriptSource.test.ts \
  src/lib/ai-report/blockTarget.test.ts \
  src/hooks/useDefaultReportTemplateBinding.test.tsx \
  src/hooks/usePrivateTranscriptSource.test.tsx \
  src/hooks/useTranscriptSource.test.tsx \
  src/hooks/useBlockTranscriptSource.test.tsx \
  server/report-templates/publishImmutableTemplate.test.ts \
  server/ai-report/field-policy.test.ts \
  server/ai-report/context.test.ts \
  server/ai-report/generate-daily.test.ts \
  server/ai-report/generate-block.test.ts \
  server/ai-report/route.test.ts \
  src/components/report/ai/BlockAiSection.test.tsx \
  src/components/report/ReportBlockSection.test.tsx \
  storage.rules.test.ts \
  src/test/vercelDeployment.test.ts
```

- [ ] **Step 2: Run every repository gate from a clean status**

```bash
npm run format:check
npm run typecheck
npm run test:run
npm run build
git diff --check
git status --short
```

Do not hide a failing gate by broadly rewriting unrelated files. If a repository-wide gate has a pre-existing failure, reproduce it on `origin/main`, keep task files individually clean, and report the exact baseline evidence before proceeding.

- [ ] **Step 3: Audit Transcript privacy and endpoint count**

Review the final diff and tests to confirm:

- `transcriptRef` is stripped from all three Block arrays before snapshots;
- no Transcript source text/reference enters published HTML, public Storage namespaces, exports, email HTML, analytics, or logs;
- Storage rules grant the nested Block Transcript path only through `canAccessConferenceTranscript(confId)` and retain no root catch-all;
- DeepSeek receives only the target Block's allowed draft/Transcript, user focus, and one-request instruction;
- `api/` still contains no more than 12 TypeScript Function entries.

- [ ] **Step 4: Publish the immutable template twice**

With server-side Firebase credentials loaded without printing them:

```bash
npm run template:publish:industry-daily
npm run template:publish:industry-daily
```

Require the first result to be `created` or `unchanged` and the second to be `unchanged`. If V1 exists with different content, stop and report the immutable-version conflict; never overwrite or delete it.

- [ ] **Step 5: Deploy only Storage rules**

```bash
npx firebase-tools deploy --only storage --project gtc-2026-session-daal
```

Confirm the command targets `gtc-2026-session-daal` before accepting success. Do not deploy Firestore rules, Functions, Hosting, or any other Firebase resource.

- [ ] **Step 6: Push the reviewed branch and wait for Vercel Preview**

After all task-owned gates and the final whole-branch review pass, fast-forward the temporary implementation branch into the existing PR branch, then run:

```bash
git status --short --branch
git log --oneline --decorate origin/main..HEAD
git push
gh pr status
```

Wait for the pushed commit's Vercel Preview to become ready. Do not create a second PR or merge the existing PR.

- [ ] **Step 7: Perform the authenticated smoke test and update the PR**

On that Vercel Preview, verify one editable report end to end:

1. A new report binds to `industry-conference-daily-report@1`; a fully unbound legacy report migrates legacy `rumors` once without losing it.
2. Each of the three dynamic sections supports heading and body insertion.
3. One Block can generate from draft only, Transcript only, and both; the candidate preview shows Evidence and the current user's focus.
4. Rewrite and append affect only that Block; heading offers rewrite only.
5. Refresh preserves adopted content and private Transcript controls.
6. View/print/export and snapshot history expose no Transcript reference or text.

If the smoke test finds a code defect, fix it on the implementation branch, rerun the affected and repository gates, review the fix diff, fast-forward the PR branch again, push, and repeat the smoke test. After success, update the existing PR description with the template identity, three independent Block flows, migration rule, privacy behavior, tests, template publication result, Storage deployment result, and smoke-test evidence. Do not merge the PR.
