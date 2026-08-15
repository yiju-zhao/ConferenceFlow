# Academic 会议日报模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `academic-conference-daily-report` v1 模板(含新 block id `trendBlocks` 全管线),并按会议类型绑定日报模板。

**Architecture:** 复用现有 AI 报告管线(session/daily/block 三级)。block 管线全部由 `AI_BLOCK_FIELDS` 常量数据驱动,扩展常量即打通 contract/transcript/generate-block/API;UI 侧 `DailyReport.tsx` 从硬编码 industry 字段改为模板驱动渲染。会议文档加 `type` 字段,新建日报 auto-init 时按类型选模板绑定。

**Tech Stack:** React + TypeScript + Firestore + Vitest + Vercel serverless API。

**Spec:** `docs/superpowers/specs/2026-08-14-academic-conference-daily-report-template-design.md`

## Global Constraints

- 所有 AI 字段 `evidenceRequired: true`;rich_text `maxLength: 3000`。
- 不改动 industry 模板定义、hash(`1b4acdc4...`)、已发布版本及其 UI 行为。
- block 字段 id 必须加入 `AI_BLOCK_FIELDS`,否则 `assertTemplateVersion` 拒绝。
- `image`/`fixed` 类型字段不允许启用 AI;`short_text` 不允许 `append` mode(contract 强制)。
- 测试命令:`npx vitest run <path>`(`npm run test` 是 watch 模式,不要用)。
- 门禁:`npx vitest run`、`npm run typecheck`、`npm run build` 全绿。
- commit message 遵循 repo 现有风格(如 `feat(report): ...`),结尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`。

---

### Task 1: `trendBlocks` block id 管线扩展

**Files:**
- Modify: `src/types/ai-report.ts:2`
- Modify: `src/types/firestore.ts:149`(BlockField)、`:201-203`(ReportSnapshotData)、`:276-278`(Report)
- Modify: `src/lib/ai-report/templateContract.ts:30-52`(RESERVED_AI_FIELD_IDS.daily)
- Test: `src/lib/ai-report/trendBlocks.test.ts`(新建)

**Interfaces:**
- Consumes: 现有 `AI_BLOCK_FIELDS`、`assertTemplateVersion`、`buildBlockTranscriptStoragePath`、`parseBlockTranscriptStoragePath`(全部数据驱动,无需改函数体)。
- Produces: `AiBlockField` 包含 `"trendBlocks"`;`Report.trendBlocks?: ReportBlock[]`;后续任务依赖这些类型。

背景:`templateContract.ts`、`transcriptSource.ts`、`server/ai-report/generate-block.ts`、`api/.../ai/generate.ts`、`storage.rules` 全部基于 `AI_BLOCK_FIELDS` 常量或通配符校验,扩展常量即自动覆盖,逐一核对即可。

- [ ] **Step 1: 写失败测试** `src/lib/ai-report/trendBlocks.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { AI_BLOCK_FIELDS } from "../../types";
import { assertTemplateVersion } from "./templateContract";
import {
  buildBlockTranscriptStoragePath,
  parseBlockTranscriptStoragePath,
} from "./transcriptSource";

function trendBlocksTemplate() {
  return {
    templateId: "academic-conference-daily-report",
    version: 1,
    templateHash: "0".repeat(64),
    fields: [
      {
        id: "trendBlocks",
        label: "趋势研判",
        description: "记录方向性信号与方法论 shift。",
        type: "rich_text",
        scope: "block",
        ai: {
          enabled: true,
          instruction: "按观察证据、合理推断、潜在影响组织内容。",
          allowedSources: ["transcript", "current_draft", "user_focus"],
          evidenceRequired: true,
          allowedModes: ["rewrite", "append"],
          maxLength: 3000,
        },
      },
    ],
  };
}

describe("trendBlocks block field", () => {
  it("is a registered AI block field", () => {
    expect(AI_BLOCK_FIELDS).toContain("trendBlocks");
  });

  it("passes template contract validation as a block field", () => {
    const template = assertTemplateVersion(trendBlocksTemplate());
    expect(template.fields[0].id).toBe("trendBlocks");
  });

  it("builds and parses block transcript storage paths", () => {
    const path = buildBlockTranscriptStoragePath(
      "conf1",
      "report1",
      "trendBlocks",
      "block1",
      "file1",
      "md",
    );
    expect(path).toBe("conference-transcripts/conf1/report1/blocks/trendBlocks/block1/file1.md");
    expect(parseBlockTranscriptStoragePath(path)).toEqual({
      confId: "conf1",
      reportId: "report1",
      targetFieldId: "trendBlocks",
      blockId: "block1",
      fileId: "file1",
      format: "md",
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/ai-report/trendBlocks.test.ts`
Expected: FAIL(`AI_BLOCK_FIELDS` 不含 trendBlocks;contract 抛 `invalid AI Block field`)

- [ ] **Step 3: 扩展类型常量与文档类型**

`src/types/ai-report.ts:2`:

```ts
export const AI_BLOCK_FIELDS = ["onsiteInfoBlocks", "reflectionsBlocks", "rumorsBlocks", "trendBlocks"] as const;
```

`src/types/firestore.ts`:
- `:149` `BlockField` 加 `"trendBlocks"`,并更新 `:145` 注释为 "Block kind within `onsiteInfoBlocks` / `reflectionsBlocks` / `rumorsBlocks` / `trendBlocks`."
- `ReportSnapshotData`(`:201-203` 附近)加 `trendBlocks?: ReportBlock[];`
- `Report`(`:276-278` 附近)加 `trendBlocks?: ReportBlock[];`

`src/lib/ai-report/templateContract.ts` `RESERVED_AI_FIELD_IDS.daily` 数组加 `"trendBlocks"`(防止 daily 级 AI 字段占用该文档字段名)。

- [ ] **Step 4: 跑测试确认通过 + 既有 block 测试不回归**

Run: `npx vitest run src/lib/ai-report server/ai-report`
Expected: 全部 PASS(含既有 templateContract/transcriptSource/generate-block 测试)

- [ ] **Step 5: Commit**

```bash
git add src/types/ai-report.ts src/types/firestore.ts src/lib/ai-report/templateContract.ts src/lib/ai-report/trendBlocks.test.ts
git commit -m "feat(report): register trendBlocks AI block field"
```

---

### Task 2: 学术模板定义 + hash 锁定

**Files:**
- Create: `src/lib/ai-report/templates/academicConferenceDailyReport.ts`
- Test: `src/lib/ai-report/templates/academicConferenceDailyReport.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `"trendBlocks"` 注册;`ReportTemplateVersion`、`TemplateField` 类型;`assertTemplateVersion`、`hashTemplateDefinition`。
- Produces: `ACADEMIC_CONFERENCE_DAILY_REPORT_V1: ReportTemplateVersion` 与 `ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING = { templateId, templateVersion, templateHash }`,供 Task 3/5 使用。

- [ ] **Step 1: 写模板定义**(hash 先填 `"0".repeat(64)` 占位,Step 3 替换)

`src/lib/ai-report/templates/academicConferenceDailyReport.ts`,完整内容:

```ts
import type { ReportTemplateVersion, TemplateField } from "../../../types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const fields: TemplateField[] = [
  {
    id: "date",
    label: "日期",
    description: "日报所属日期,由报告日期固定填充。",
    type: "fixed",
    scope: "daily",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
  {
    id: "title",
    label: "日报标题",
    description: "概括当日学术会议核心主线的中文标题。",
    type: "short_text",
    scope: "daily",
    ai: {
      enabled: true,
      instruction:
        "根据提供的当前日报内容、标题草稿和用户关注方向,生成一个简洁、具体的中文日报标题。突出当日最重要的学术会议主线,优先使用材料中的明确研究方向、方法、论文或机构。不得添加材料外的事实或夸大结论;输出单行标题,不超过60个中文字符。",
      allowedSources: ["report_content", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite"],
      maxLength: 60,
    },
  },
  {
    id: "summaryPoints",
    label: "今日要点",
    description: "汇总当日最重要且有材料依据的3至5条方向性信号与代表性论文/方法。",
    type: "bullet_list",
    scope: "daily",
    ai: {
      enabled: true,
      instruction:
        "从当前日报及本字段已有草稿中提炼3至5条互不重复的中文要点,优先覆盖方向性信号与代表性论文或方法。保留重要的人名、机构、方法名、数据和限定条件;每条同时说明关键信息及其意义。仅使用可引用材料,不得补充外部事实。",
      allowedSources: ["report_content", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      minItems: 3,
      maxItems: 5,
    },
  },
  {
    id: "speakers",
    label: "作者与机构",
    description: "来自会议日程的作者与机构信息。",
    type: "fixed",
    scope: "session",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
  {
    id: "insightCore",
    label: "洞察核心",
    description: "一句话提炼洞察核心,明确指出一个趋势、技术、变化及其影响(论点)。",
    type: "short_text",
    scope: "session",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Session 的转录文字、已有草稿和日程信息,用一句话提炼洞察核心:明确指出一个趋势、技术或变化,以及它带来的影响。句子必须具体、可由材料支撑,保留关键名称与限定条件,不得空泛或夸大;输出单行,不超过120个中文字符。",
      allowedSources: ["transcript", "current_draft", "calendar", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite"],
      maxLength: 120,
    },
  },
  {
    id: "insightExplanation",
    label: "启示说明",
    description: "从洞察核心延伸,围绕解决了什么问题、相较以往的突破或变化、带来的启发展开。",
    type: "rich_text",
    scope: "session",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Session 的转录文字、已有草稿、日程信息和用户关注方向,围绕洞察核心展开启示说明,按以下结构组织:1. 当前背景与趋势下的业务痛点;2. 洞察揭示的关键技术线索(解决了什么问题、相较以往有哪些突破或变化);3. 对业务/行业/研究/产品的启发。明确区分来源事实与分析判断,不得虚构证据。",
      allowedSources: ["transcript", "current_draft", "calendar", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "techHighlights",
    label: "技术亮点",
    description: "总结 Session 内容要点,作为洞察的论据来源。",
    type: "rich_text",
    scope: "session",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Session 的转录文字、已有草稿和日程信息,总结 session 内容要点作为论据来源。覆盖材料中出现的 Keynote、Oral/Poster Session、Workshop/Tutorial、Paper、Demo 等形式;准确保留论文、方法、数据集、指标名称与关键数字,不得把猜测写成事实。",
      allowedSources: ["transcript", "current_draft", "calendar", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "huaweiImplications",
    label: "对华为的启示",
    description: "该技术线索为什么对华为重要,潜在应用与实际意义。",
    type: "rich_text",
    scope: "session",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Session 的转录文字、已有草稿、日程信息和用户关注方向,分析该技术线索为什么对华为重要:潜在应用方向、与华为业务或研究的相关性、实际意义与风险。明确区分来源事实与分析判断,不得虚构证据或夸大结论。",
      allowedSources: ["transcript", "current_draft", "calendar", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "illustrations",
    label: "插图",
    description: "当前 Session 的论文图表、现场 slide 等配图,由用户管理。",
    type: "image",
    scope: "session",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
  {
    id: "trendBlocks",
    label: "趋势研判",
    description: "今天最值得关注的方向性信号、方法论 shift、对我们的机会或威胁。",
    type: "rich_text",
    scope: "block",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Block 的转录文字和/或已有草稿生成趋势研判:今天最值得关注的方向性信号、方法论转变、对我们的机会或威胁。按照观察证据、合理推断、潜在影响和建议跟进的逻辑组织内容;明确标注不确定性,使结论与材料强度相匹配,不得添加外部事实。",
      allowedSources: ["transcript", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "sitePhotos",
    label: "现场速记",
    description: "现场照片及描述;描述中可记走廊交流、海报区观察、人才动向等软信息,由用户管理。",
    type: "image",
    scope: "daily",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
];

const definition = {
  templateId: "academic-conference-daily-report",
  version: 1,
  fields,
} as const;

export const ACADEMIC_CONFERENCE_DAILY_REPORT_V1: ReportTemplateVersion = deepFreeze({
  ...definition,
  templateHash: "0000000000000000000000000000000000000000000000000000000000000000",
});

export const ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING = {
  templateId: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId,
  templateVersion: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.version,
  templateHash: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateHash,
} as const;
```

- [ ] **Step 2: 写测试** `src/lib/ai-report/templates/academicConferenceDailyReport.test.ts`(对齐 industry 测试模式)

```ts
import { describe, expect, it } from "vitest";
import { assertTemplateVersion } from "../templateContract";
import { hashTemplateDefinition } from "../templateHash";
import {
  ACADEMIC_CONFERENCE_DAILY_REPORT_V1,
  ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING,
} from "./academicConferenceDailyReport";

describe("academic conference daily report V1", () => {
  it("publishes the approved V1 identity and field policies", async () => {
    const template = assertTemplateVersion(ACADEMIC_CONFERENCE_DAILY_REPORT_V1);

    expect(template.templateId).toBe("academic-conference-daily-report");
    expect(template.version).toBe(1);
    expect(template.templateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashTemplateDefinition(template)).toBe(template.templateHash);
    expect(template.fields.map(({ id, scope }) => [id, scope])).toEqual([
      ["date", "daily"],
      ["title", "daily"],
      ["summaryPoints", "daily"],
      ["speakers", "session"],
      ["insightCore", "session"],
      ["insightExplanation", "session"],
      ["techHighlights", "session"],
      ["huaweiImplications", "session"],
      ["illustrations", "session"],
      ["trendBlocks", "block"],
      ["sitePhotos", "daily"],
    ]);
  });

  it("stores one non-empty shared instruction per enabled field", () => {
    const enabled = ACADEMIC_CONFERENCE_DAILY_REPORT_V1.fields.filter((field) => field.ai.enabled);

    expect(enabled.every((field) => Boolean(field.ai.instruction?.trim()))).toBe(true);
    expect(enabled.filter((field) => field.scope === "block").map((field) => field.id)).toEqual([
      "trendBlocks",
    ]);
  });

  it("uses fixed policies for fixed and image fields", () => {
    const fixedOrImage = ACADEMIC_CONFERENCE_DAILY_REPORT_V1.fields.filter(
      (field) => field.type === "fixed" || field.type === "image",
    );

    expect(fixedOrImage.every((field) => !field.ai.enabled)).toBe(true);
    expect(fixedOrImage.every((field) => field.ai.allowedSources.length === 0)).toBe(true);
    expect(fixedOrImage.every((field) => field.ai.allowedModes.length === 0)).toBe(true);
  });

  it("exports the exact immutable V1 binding", () => {
    expect(ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING).toEqual({
      templateId: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId,
      templateVersion: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.version,
      templateHash: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateHash,
    });
  });

  it("freezes the published template root and fields", () => {
    const [firstField] = ACADEMIC_CONFERENCE_DAILY_REPORT_V1.fields;

    expect(Object.isFrozen(ACADEMIC_CONFERENCE_DAILY_REPORT_V1)).toBe(true);
    expect(Object.isFrozen(ACADEMIC_CONFERENCE_DAILY_REPORT_V1.fields)).toBe(true);
    expect(Object.isFrozen(firstField)).toBe(true);
    expect(() => {
      ACADEMIC_CONFERENCE_DAILY_REPORT_V1.fields.push(firstField);
    }).toThrow(TypeError);
  });
});
```

- [ ] **Step 3: 算出真实 hash 并替换占位值**

Run: `npx vitest run src/lib/ai-report/templates/academicConferenceDailyReport.test.ts`
Expected: 第一个用例 FAIL,断言 diff 中 `Expected` 为占位 hash、`Received` 为真实计算 hash。把 Received 的 64 位 hex 填回模板文件的 `templateHash`,再跑确认全 PASS。

- [ ] **Step 4: 全量 ai-report 测试不回归**

Run: `npx vitest run src/lib/ai-report`
Expected: PASS(industry 模板测试不受影响)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-report/templates/academicConferenceDailyReport.ts src/lib/ai-report/templates/academicConferenceDailyReport.test.ts
git commit -m "feat(report): add academic conference daily report template V1"
```

---

### Task 3: DailyReport — trendBlocks 数据通路 + block 区块模板条件化

**Files:**
- Modify: `src/components/report/DailyReport.tsx`(init `:320-333`、fieldById `:345-349`、snapshot `:558-575`、TOC `:2026-2086`、block 区块 `:2598-2776`、现场速记标题 `:2780-2782`)
- Test: `src/lib/ai-report/templateFields.test.ts`(新建)+ `src/lib/ai-report/templateFields.ts`(新建小模块)

**Interfaces:**
- Consumes: Task 1 的 `Report.trendBlocks`;Task 2 的模板(`trendBlocksField.label` 用作区块标题)。
- Produces: `templateFields.ts` 导出 `templateHasField(template: ReportTemplateVersion | null, fieldId: string): boolean`(Task 4 复用);DailyReport 在绑定学术模板时渲染「趋势研判」区块、隐藏三个 industry 情报区块。

可见性规则(关键,不要偏离):区块仅在 **template 已加载且不含该字段** 时隐藏 —— `!template || templateHasField(template, id)` 时显示。unbound 旧报告与 industry 报告行为完全不变;学术报告在模板加载完成前会短暂显示 industry 区块,可接受。

- [ ] **Step 1: 写 helper + 失败测试** `src/lib/ai-report/templateFields.ts`

```ts
import type { ReportTemplateVersion, TemplateField } from "../../types";

export function templateHasField(
  template: ReportTemplateVersion | null,
  fieldId: string,
): boolean {
  return Boolean(template?.fields.some((field) => field.id === fieldId));
}

export function sessionContentFieldsOf(
  template: ReportTemplateVersion | null,
): TemplateField[] | null {
  if (!template) return null;
  return template.fields.filter(
    (field) => field.scope === "session" && field.type !== "fixed" && field.type !== "image",
  );
}
```

`src/lib/ai-report/templateFields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ACADEMIC_CONFERENCE_DAILY_REPORT_V1 } from "./templates/academicConferenceDailyReport";
import { INDUSTRY_CONFERENCE_DAILY_REPORT_V1 } from "./templates/industryConferenceDailyReport";
import { sessionContentFieldsOf, templateHasField } from "./templateFields";

describe("templateHasField", () => {
  it("returns false without a template", () => {
    expect(templateHasField(null, "trendBlocks")).toBe(false);
  });

  it("detects academic-only and industry-only block fields", () => {
    expect(templateHasField(ACADEMIC_CONFERENCE_DAILY_REPORT_V1, "trendBlocks")).toBe(true);
    expect(templateHasField(ACADEMIC_CONFERENCE_DAILY_REPORT_V1, "rumorsBlocks")).toBe(false);
    expect(templateHasField(INDUSTRY_CONFERENCE_DAILY_REPORT_V1, "rumorsBlocks")).toBe(true);
    expect(templateHasField(INDUSTRY_CONFERENCE_DAILY_REPORT_V1, "trendBlocks")).toBe(false);
  });
});

describe("sessionContentFieldsOf", () => {
  it("returns null without a template", () => {
    expect(sessionContentFieldsOf(null)).toBeNull();
  });

  it("lists academic session content fields in template order", () => {
    expect(sessionContentFieldsOf(ACADEMIC_CONFERENCE_DAILY_REPORT_V1)?.map((f) => f.id)).toEqual([
      "insightCore",
      "insightExplanation",
      "techHighlights",
      "huaweiImplications",
    ]);
  });

  it("lists industry session content fields", () => {
    expect(sessionContentFieldsOf(INDUSTRY_CONFERENCE_DAILY_REPORT_V1)?.map((f) => f.id)).toEqual([
      "takeaways",
      "insights",
    ]);
  });
});
```

Run: `npx vitest run src/lib/ai-report/templateFields.test.ts` → PASS(纯新增,无失败步骤需要;若失败先修 Task 2)

- [ ] **Step 2: DailyReport 数据通路加 trendBlocks**

`DailyReport.tsx`:
1. import `templateHasField`、`sessionContentFieldsOf`(from `../../lib/ai-report/templateFields`)。
2. auto-init `:320-333` 的 setDoc payload 加 `trendBlocks: [],`。
3. `:349` 后加:
   ```ts
   const trendBlocksField = fieldById.get("trendBlocks");
   const sitePhotosField = fieldById.get("sitePhotos");
   ```
4. snapshot `:572-574` 后加:
   ```ts
   trendBlocks: blocksWithoutTranscripts(rd.trendBlocks || []),
   ```

- [ ] **Step 3: 三个 industry 区块条件化 + 新增趋势研判区块**

`:2598-2776` 的 `report-onsite` div 内:
- 三个现有 `ReportBlockSection` 分别包一层条件(以 onsiteInfoBlocks 为例,其余两个同理):
  ```jsx
  {(!template || templateHasField(template, "onsiteInfoBlocks")) && (
    <ReportBlockSection sectionId="section-onsite-info" ... />
  )}
  ```
- 在 rumors 区块之后追加:
  ```jsx
  {trendBlocksField && (
    <ReportBlockSection
      sectionId="section-trends"
      title={trendBlocksField.label}
      titleStyle={{ marginTop: 24 }}
      field="trendBlocks"
      blocks={reportData?.trendBlocks || []}
      members={members}
      currentUid={user?.uid}
      isAdmin={isConfAdmin}
      readOnly={viewMode}
      memberColorMap={memberColorMap}
      conferenceSessions={allConferenceSessions}
      bodyPlaceholder={trendBlocksField.description}
      openInlineMenu={openInlineMenu}
      onOpenInlineMenu={setOpenInlineMenu}
      onInsert={insertBlock}
      onUpdate={updateBlockFields}
      onRemove={removeBlock}
      renderAiControls={(block, blockReadOnly) =>
        template && user ? (
          <BlockAiSection
            confId={confId}
            reportId={reportId}
            targetFieldId="trendBlocks"
            templateHash={template.templateHash}
            field={trendBlocksField}
            block={block}
            focus={membership?.aiFocus ?? ""}
            uid={user.uid}
            flushPending={flushPending}
            getLatestBlock={() =>
              reportDataRef.current?.trendBlocks?.find(
                (candidate) => candidate.id === block.id,
              )
            }
            commitTranscript={async (next) => {
              await flushPending();
              await persistBlockPatch("trendBlocks", block.id, { transcriptRef: next });
            }}
            onSaveContent={async (content) => {
              await flushPending();
              await persistBlockPatch(
                "trendBlocks",
                block.id,
                { content, lastEditedBy: user.uid, lastEditedAt: Date.now() },
                block.content,
              );
            }}
            readOnly={blockReadOnly}
          />
        ) : null
      }
    />
  )}
  ```

- [ ] **Step 4: TOC 条件化 + 趋势研判条目 + 现场速记标题**

`:2026-2086` TOC:
- onsite-info / reflections / rumors 三个 `<li>` 分别用与 Step 3 相同的条件包裹。
- rumors 条目后加:
  ```jsx
  {trendBlocksField && (
    <li className="report-toc-section-item">
      <a href="#section-trends" className="report-toc-link report-toc-section-link">
        <span className="report-toc-title">{trendBlocksField.label}</span>
      </a>
    </li>
  )}
  ```
- `:2780-2782` 现场照片标题改为:
  ```jsx
  {template?.templateId === "academic-conference-daily-report" && sitePhotosField
    ? sitePhotosField.label
    : t("report.siteRecords")}
  ```
- TOC 的 `section-site-photos` 条目(`:2081-2085`)标题做同样处理。

- [ ] **Step 5: 验证 + Commit**

Run: `npx vitest run src/lib/ai-report && npm run typecheck && npm run build`
Expected: 全绿。手动 smoke(可选):`npm run dev` 打开 industry 报告确认三个情报区块仍在。

```bash
git add src/lib/ai-report/templateFields.ts src/lib/ai-report/templateFields.test.ts src/components/report/DailyReport.tsx
git commit -m "feat(report): render trendBlocks section and template-driven block visibility"
```

---

### Task 4: DailyReport — session 内容字段模板驱动渲染

**Files:**
- Modify: `src/types/firestore.ts`(`ReportSessionData`,`:122-137` 附近)
- Modify: `src/components/report/DailyReport.tsx`(collapse init `:1109-1121`、viewMode 跳过 `:2128-2133`、两处 session body `:2284-2306` 与 `:2556-2577`)

**Interfaces:**
- Consumes: Task 3 的 `sessionContentFieldsOf`;`saveSessionField(code, field, value)`(已存在,通用);`EditableField`(rich_text 编辑器)。
- Produces: `ReportSessionData` 增加 `insightCore?: string; insightExplanation?: string; techHighlights?: string; huaweiImplications?: string;`;绑定模板时 session body 按模板字段渲染,未绑定时保持 takeaways/insights 旧 UI。

- [ ] **Step 1: 扩展 ReportSessionData**

`src/types/firestore.ts` `ReportSessionData` 接口在 `insights?: string;` 后加:

```ts
  insightCore?: string;
  insightExplanation?: string;
  techHighlights?: string;
  huaweiImplications?: string;
```

- [ ] **Step 2: DailyReport 加派生字段与辅助函数**

`:350-357` `sessionAiFields` 附近加:

```ts
const sessionContentFields = sessionContentFieldsOf(template);
```

组件内加两个辅助函数(放在 `sessionContentFields` 之后):

```ts
const LEGACY_SESSION_CONTENT_FIELDS = [
  { id: "takeaways", type: "rich_text" as const },
  { id: "insights", type: "rich_text" as const },
];
const renderedSessionFields = sessionContentFields ?? LEGACY_SESSION_CONTENT_FIELDS;

const sessionFieldHeading = (fieldId: string): string => {
  if (!template) {
    return fieldId === "takeaways" ? t("report.keyTakeaways") : t("report.insightsLabel");
  }
  return fieldById.get(fieldId)?.label ?? fieldId;
};

const sessionFieldPlaceholder = (fieldId: string): string => {
  if (!template) {
    return fieldId === "takeaways" ? t("report.recordKeyTakeaways") : t("report.recordInsights");
  }
  return fieldById.get(fieldId)?.description ?? "";
};

const sessionHasContent = (sd: ReportSessionData | undefined): boolean => {
  if (!sd) return false;
  return renderedSessionFields.some((field) => {
    const raw = (sd as Record<string, unknown>)[field.id];
    return typeof raw === "string" && raw.replace(/<[^>]*>/g, "").trim().length > 0;
  });
};
```

- [ ] **Step 3: 替换两处 session body 硬编码**

两处(`:2284-2306` noTopicSessions 与 `:2556-2577` topicsMap,结构相同)的 takeaways/insights 两个 `report-field-block` div 替换为:

```jsx
{renderedSessionFields.map((field) => (
  <div className="report-field-block" key={field.id}>
    <h4 className="report-field-heading report-field-heading--highlight">
      {sessionFieldHeading(field.id)}
    </h4>
    {field.type === "short_text" ? (
      <span
        className="report-short-text"
        contentEditable={!viewMode}
        suppressContentEditableWarning
        onBlur={(e) =>
          saveSessionField(session.code, field.id, e.currentTarget.textContent?.trim() || "")
        }
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
      >
        {((sd as Record<string, unknown>)[field.id] as string) ?? ""}
      </span>
    ) : (
      <EditableField
        value={((sd as Record<string, unknown>)[field.id] as string) ?? ""}
        onSave={(html) => saveSessionField(session.code, field.id, html)}
        placeholder={sessionFieldPlaceholder(field.id)}
        readOnly={viewMode}
      />
    )}
  </div>
))}
```

注意两处各自的 `sd`、`session` 变量名沿用原作用域。原 `{t("report.keyTakeaways")}` / `{t("report.insightsLabel")}` 两个块整体被替换。

- [ ] **Step 4: viewMode 空内容跳过 + collapse init 泛化**

- `:2128-2133` 的 `if (viewMode && !sd.takeaways...&& !sd.insights...) return null;` 改为:
  ```ts
  if (viewMode && !sessionHasContent(sd)) return null;
  ```
- `:1109-1121` collapse init:过滤条件 `sd?.takeaways && sd.takeaways !== ""` 改为 `sessionHasContent(sd)`;effect 依赖加 `template`,并在模板未加载完成时跳过等待:
  ```ts
  useEffect(() => {
    if (!reportData || collapsedInit.current) return;
    if (reportData.templateId && !template) return; // 等模板加载,绑定报告按模板字段判断
    collapsedInit.current = true;
    const initial = new Set(
      activeSessions.filter((s) => sessionHasContent(reportData.sessions?.[s.code])).map((s) => s.code),
    );
    setCollapsedSessions(initial);
  }, [reportData, activeSessions, template]);
  ```

- [ ] **Step 5: 验证 + Commit**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: 全绿。

```bash
git add src/types/firestore.ts src/components/report/DailyReport.tsx
git commit -m "feat(report): render session content fields from bound template"
```

---

### Task 5: 会议类型字段 + 按类型绑定模板

**Files:**
- Modify: `src/types/firestore.ts`(`Conference`,`:80-91`)
- Modify: `src/types/api.ts`(`CreateConferenceBody` `:19-25`、`ConferenceWriteData` `:28-38`、`UpdateConferenceBody` `:45-52`)
- Modify: `api/conferences/index.ts:18-32`(POST)
- Modify: `api/conferences/[confId]/index.ts:18-30`(PUT allowedFields)
- Modify: `src/lib/ai-report/defaultTemplateBinding.ts`
- Modify: `src/components/report/DailyReport.tsx`(conference 加载 `:261-267`、auto-init `:316-334`)
- Modify: `src/components/admin/SuperAdminPanel.tsx`(form `:24-43`、`:53-75`、Dialog `:244-258`)
- Modify: `src/i18n/zh-CN.json`、`src/i18n/en-US.json`
- Test: `src/lib/ai-report/defaultTemplateBinding.test.ts`(追加用例)

**Interfaces:**
- Consumes: Task 2 的 `ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING`。
- Produces: `ConferenceType = "industry" | "academic"`;`bindingForConferenceType(type: ConferenceType | undefined)` 返回对应 binding 常量;`Conference.type?: ConferenceType`。

- [ ] **Step 1: 写失败测试**(追加到 `src/lib/ai-report/defaultTemplateBinding.test.ts`)

```ts
import { ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING } from "./templates/academicConferenceDailyReport";
import { bindingForConferenceType } from "./defaultTemplateBinding";
// INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING 按文件现有 import 情况补充

describe("bindingForConferenceType", () => {
  it("binds academic conferences to the academic template", () => {
    expect(bindingForConferenceType("academic")).toEqual(
      ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING,
    );
  });

  it("defaults missing or industry type to the industry template", () => {
    expect(bindingForConferenceType(undefined)).toEqual(INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING);
    expect(bindingForConferenceType("industry")).toEqual(INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING);
  });
});
```

Run: `npx vitest run src/lib/ai-report/defaultTemplateBinding.test.ts`
Expected: FAIL(`bindingForConferenceType is not a function`)

- [ ] **Step 2: 实现 bindingForConferenceType + 类型**

`src/lib/ai-report/defaultTemplateBinding.ts`:import 学术 binding,追加:

```ts
import type { ConferenceType } from "../../types";
import { ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING } from "./templates/academicConferenceDailyReport";

export function bindingForConferenceType(type: ConferenceType | undefined) {
  return type === "academic"
    ? ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING
    : INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING;
}
```

`src/types/firestore.ts`:`Conference` 接口前加 `export type ConferenceType = "industry" | "academic";`,接口内加 `type?: ConferenceType;`。确认 `src/types/index.ts` re-export(若 `firestore.ts` 已整体 re-export 则自动)。

`src/types/api.ts`:`CreateConferenceBody` 加 `type?: ConferenceType;`;`ConferenceWriteData` 加 `type: ConferenceType;`;`UpdateConferenceBody` 加 `type?: ConferenceType;`(import ConferenceType from "./firestore" 或相对路径,按文件现有 import 风格)。

- [ ] **Step 3: API 支持 type**

`api/conferences/index.ts` POST:
```ts
const { name, description, startDate, endDate, visibility, type } = req.body as CreateConferenceBody;
if (type !== undefined && type !== "industry" && type !== "academic")
  return res.status(400).json({ error: "invalid conference type" });
```
`confData` 加 `type: type ?? "industry",`。

`api/conferences/[confId]/index.ts` PUT:`allowedFields` 数组加 `"type"`,并在循环后加校验:
```ts
if (updates.type !== undefined && updates.type !== "industry" && updates.type !== "academic")
  return res.status(400).json({ error: "invalid conference type" });
```

- [ ] **Step 4: SuperAdminPanel 创建表单加类型选择**

- `ConferenceCreateForm` 接口加 `type: ConferenceType;`;两处 useState 初始值与 reset 加 `type: "industry"`。
- Dialog 中 visibility FormGroup 后加:
  ```jsx
  <FormGroup label={t("admin.conferenceType")}>
    <div>
      <SegmentedControl
        small
        options={[
          { label: t("admin.typeIndustry"), value: "industry" },
          { label: t("admin.typeAcademic"), value: "academic" },
        ]}
        value={createForm.type}
        onValueChange={(v) => setCreateForm({ ...createForm, type: v as ConferenceType })}
      />
    </div>
  </FormGroup>
  ```
- i18n:`zh-CN.json` 加 `"admin.conferenceType": "会议类型"`、`"admin.typeIndustry": "行业会议"`、`"admin.typeAcademic": "学术会议"`;`en-US.json` 对应 `"Conference type"` / `"Industry"` / `"Academic"`(位置跟随现有 `admin.visibility` 键附近,保持 JSON 合法)。

- [ ] **Step 5: DailyReport auto-init 按会议类型绑定**

- conference 加载 effect(`:261-267`)改为同时存类型与加载标记:
  ```ts
  const [confType, setConfType] = useState<ConferenceType | undefined>(undefined);
  const [confLoaded, setConfLoaded] = useState(false);
  // effect 内:
  setConfName(snap.exists() ? snap.data().name || confId : confId);
  setConfType(snap.exists() ? (snap.data().type as ConferenceType | undefined) : undefined);
  setConfLoaded(true);
  ```
- auto-init effect(`:316-334`):早退条件加 `!confLoaded`,payload 的 `...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING` 改为 `...bindingForConferenceType(confType)`,effect 依赖数组加 `confLoaded`、`confType`。

- [ ] **Step 6: 验证 + Commit**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: 全绿。

```bash
git add src/types/firestore.ts src/types/api.ts api/conferences/index.ts "api/conferences/[confId]/index.ts" src/lib/ai-report/defaultTemplateBinding.ts src/lib/ai-report/defaultTemplateBinding.test.ts src/components/report/DailyReport.tsx src/components/admin/SuperAdminPanel.tsx src/i18n/zh-CN.json src/i18n/en-US.json
git commit -m "feat(conference): bind daily report template by conference type"
```

---

### Task 6: 发布脚本 + 全量门禁

**Files:**
- Create: `scripts/publish-academic-conference-daily-report.ts`

**Interfaces:**
- Consumes: Task 2 的 `ACADEMIC_CONFERENCE_DAILY_REPORT_V1`;`publishImmutableTemplate`(`server/report-templates/publishImmutableTemplate.ts`)。

- [ ] **Step 1: 写发布脚本**

```ts
import { db } from "../api/lib/firebase-admin.js";
import { ACADEMIC_CONFERENCE_DAILY_REPORT_V1 } from "../src/lib/ai-report/templates/academicConferenceDailyReport";
import { publishImmutableTemplate } from "../server/report-templates/publishImmutableTemplate";

const ref = db
  .collection("reportTemplates")
  .doc(ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId)
  .collection("versions")
  .doc(String(ACADEMIC_CONFERENCE_DAILY_REPORT_V1.version));

const result = await publishImmutableTemplate(ACADEMIC_CONFERENCE_DAILY_REPORT_V1, {
  async read() {
    const snapshot = await ref.get();
    return snapshot.exists ? snapshot.data() : null;
  },
  async create(template) {
    await ref.create(template);
  },
});

console.info(`${ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId}@1: ${result}`);
```

对照 industry 发布脚本的运行方式执行(需本机 Firebase admin 凭据;若无凭据,记录为发布前手动步骤)。

- [ ] **Step 2: 全量门禁**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add scripts/publish-academic-conference-daily-report.ts
git commit -m "feat(report): add academic template publish script"
```

---

## Self-Review 记录

- Spec 覆盖:§4 发布(Task 2/6)、§5 字段(Task 2)、§6 trendBlocks 管线(Task 1/3)、§7 会议类型绑定(Task 5)、§9 测试(各 Task 内)+ 门禁(Task 6)。✅
- 已知留白(有意为之,不阻塞):DailyReport 无组件级渲染测试(组件过大、无既有测试基座),区块可见性逻辑以 `templateFields.ts` 纯函数测试覆盖,UI 手动 smoke;导出文件名 `GTC2026_*` 硬编码为既有问题,不在本计划范围。
- 类型一致性:`trendBlocks` / `bindingForConferenceType` / `sessionContentFieldsOf` / `templateHasField` 在 Task 间签名一致;Task 3/4 均 import 自 `../../lib/ai-report/templateFields`(相对 DailyReport.tsx 的路径为 `../lib/ai-report/templateFields`,实施时按实际位置校正)。
