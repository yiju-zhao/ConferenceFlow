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
  templateHash: "1126b28e90fd1d95c342be826ff0329f060ad4a082e47eaffc88790335857ec9",
});

export const ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING = {
  templateId: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId,
  templateVersion: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.version,
  templateHash: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateHash,
} as const;
