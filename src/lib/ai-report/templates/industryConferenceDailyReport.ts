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
    description: "日报所属日期，由报告日期固定填充。",
    type: "fixed",
    scope: "daily",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
  {
    id: "title",
    label: "日报标题",
    description: "概括当日行业会议核心主线的中文标题。",
    type: "short_text",
    scope: "daily",
    ai: {
      enabled: true,
      instruction:
        "根据提供的当前日报内容、标题草稿和用户关注方向，生成一个简洁、具体的中文日报标题。突出当日最重要的行业会议主线，优先使用材料中的明确主题、产品、公司或趋势。不得添加材料外的事实或夸大结论；输出单行标题，不超过60个中文字符。",
      allowedSources: ["report_content", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite"],
      maxLength: 60,
    },
  },
  {
    id: "summaryPoints",
    label: "核心要点",
    description: "汇总当日最重要且有材料依据的3至5条核心信息。",
    type: "bullet_list",
    scope: "daily",
    ai: {
      enabled: true,
      instruction:
        "从当前日报及本字段已有草稿中提炼3至5条互不重复的中文核心要点。保留重要的人名、机构、产品、数字和限定条件；每条同时说明关键信息及其意义。仅使用可引用材料，不得补充外部事实。",
      allowedSources: ["report_content", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      minItems: 3,
      maxItems: 5,
    },
  },
  {
    id: "speakers",
    label: "演讲嘉宾",
    description: "来自会议日程的固定演讲嘉宾信息。",
    type: "fixed",
    scope: "session",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
  {
    id: "takeaways",
    label: "关键收获",
    description: "当前 Session 中可由转录、草稿或日程验证的主题、观点、产品、方法、数据与结论。",
    type: "rich_text",
    scope: "session",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Session 的转录文字、已有草稿和日程信息，归纳会议主题、明确观点、产品或方法、关键数据及演讲者给出的结论。准确保留名称、数字与限定条件，不得把猜测写成事实。",
      allowedSources: ["transcript", "current_draft", "calendar", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "insights",
    label: "启示与分析",
    description: "基于当前 Session 材料并结合用户关注方向形成的影响、风险、机会与后续行动分析。",
    type: "rich_text",
    scope: "session",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Session 的转录文字、已有草稿、日程信息和用户关注方向，分析潜在影响、相关性、风险、机会与合理的后续行动。明确区分来源事实与分析判断，不得虚构证据。",
      allowedSources: ["transcript", "current_draft", "calendar", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "illustrations",
    label: "配图",
    description: "当前 Session 的报告配图，由用户管理。",
    type: "image",
    scope: "session",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
  {
    id: "onsiteInfoBlocks",
    label: "现场情报",
    description: "记录有明确来源或可观察的现场产品、公司、组织、客户、生态和竞争动态。",
    type: "rich_text",
    scope: "block",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Block 的转录文字和/或已有草稿生成现场情报。优先记录可观察或有明确来源的产品、公司、组织、客户、生态及竞争动态；材料支持时保留归属与限定条件，不得把传闻写成已验证事实。",
      allowedSources: ["transcript", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "reflectionsBlocks",
    label: "圈内声音",
    description: "记录有归属的业内观点、反馈、共识、分歧、担忧和态度。",
    type: "rich_text",
    scope: "block",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Block 的转录文字和/或已有草稿生成圈内声音。提取有归属的业内观点、反馈、共识、分歧、担忧和态度；已知时保留发言者或机构，并明确区分观点与已验证事实。",
      allowedSources: ["transcript", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "rumorsBlocks",
    label: "深度研判",
    description: "基于当前 Block 证据形成合理推断、潜在影响、风险与跟进建议。",
    type: "rich_text",
    scope: "block",
    ai: {
      enabled: true,
      instruction:
        "根据当前 Block 的转录文字和/或已有草稿生成深度研判。按照观察证据、合理推断、潜在影响和建议跟进的逻辑组织内容；明确标注不确定性，使结论与材料强度相匹配，不得添加外部事实。",
      allowedSources: ["transcript", "current_draft", "user_focus"],
      evidenceRequired: true,
      allowedModes: ["rewrite", "append"],
      maxLength: 3000,
    },
  },
  {
    id: "sitePhotos",
    label: "现场照片",
    description: "日报现场照片及其说明，由用户管理。",
    type: "image",
    scope: "daily",
    ai: { enabled: false, allowedSources: [], evidenceRequired: false, allowedModes: [] },
  },
];

const definition = {
  templateId: "industry-conference-daily-report",
  version: 1,
  fields,
} as const;

export const INDUSTRY_CONFERENCE_DAILY_REPORT_V1: ReportTemplateVersion = deepFreeze({
  ...definition,
  templateHash: "1b4acdc448b2d84f9b21c788b91b0c961e61cc721fa2ef921f7aaaab419c4d99",
});

export const INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING = {
  templateId: INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateId,
  templateVersion: INDUSTRY_CONFERENCE_DAILY_REPORT_V1.version,
  templateHash: INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateHash,
} as const;
