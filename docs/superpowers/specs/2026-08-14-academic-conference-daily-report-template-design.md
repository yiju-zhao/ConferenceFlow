# Academic 会议日报模板 V1 设计

> 日期：2026-08-14
> 状态：已确认（头脑风暴结论）
> 前置文档：`docs/academic-conference-templates/design.md`(HTML 样例版设计)、`docs/superpowers/specs/2026-08-12-industry-conference-daily-report-template-design.md`(industry 模板规范)

---

## 1. 概述

为学术会议(NeurIPS / ICML / ICLR / CVPR / ACL 等 AI/ML 顶会)新增一套结构化日报模板 `academic-conference-daily-report` v1,与现有 `industry-conference-daily-report` v1 平行。模板复用现有 AI 报告生成管线(session/daily/block 三级 scope、证据约束、候选-应用流程),只定义新的字段集,并引入一个新的 block 字段 id `trendBlocks`。

与 industry 模板的差异:

- Session 主体内容是「洞察核心 → 启示说明 → 技术亮点 → 对华为的启示」四字段结构(论点 → 展开论证 → 论据来源 → 组织意义)。
- Block 级只保留一个「趋势研判」,砍掉 industry 的现场情报 / 圈内声音。
- 现场照片与软信息合并为「现场速记」(照片 + 描述)。

## 2. 目标

1. 定义并发布 `academic-conference-daily-report` v1 不可变模板(字段、AI 指令、hash 锁定)。
2. 支持新的 block 字段 id `trendBlocks`,打通 block AI 生成全管线(类型、合约校验、转录源、服务端生成、UI 渲染)。
3. 会议文档增加类型字段 `type: "industry" | "academic"`,新建日报按会议类型绑定对应模板。
4. 不破坏 industry 模板与既有报告的任何行为。

## 3. 非目标

- 总结报告(summary report)模板不在本次范围。
- 不做「论文类型标签」「资源链接」等独立结构化字段(主体内容已确定为四字段结构;链接可写在富文本里)。
- 不改动 industry 模板字段、hash 或已发布版本。
- 不为学术模板新增 HTML 上传式报告形态。

## 4. 模板身份与发布

- `templateId`: `academic-conference-daily-report`
- `version`: 1
- 定义文件: `src/lib/ai-report/templates/academicConferenceDailyReport.ts`,导出 `ACADEMIC_CONFERENCE_DAILY_REPORT_V1` 与 `ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING`,结构与 industry 模板一致(`deepFreeze` + `templateHash`)。
- `templateHash` 由模板字段内容计算,与 industry 相同的 hash 测试模式(`academicConferenceDailyReport.test.ts`)锁定。
- 发布脚本: `scripts/publish-academic-conference-daily-report.ts`,复用 `server/report-templates/publishImmutableTemplate.ts`,写入 Firestore `reportTemplates/academic-conference-daily-report/versions/1`。

## 5. V1 字段定义

所有 AI 字段 `evidenceRequired: true`;rich_text 字段 `maxLength: 3000`。AI 指令遵循 industry 同款约束风格:仅使用可引用材料、保留名称/数字/限定条件、区分事实与推断、不得虚构。

### 5.1 Daily 级

| 字段 | id | 类型 | AI | 说明 |
|---|---|---|---|---|
| 日期 | `date` | fixed | 否 | 由报告日期固定填充 |
| 日报标题 | `title` | short_text | rewrite, ≤60 字符 | 突出当日学术会议主线,优先使用材料中的明确方向、方法、论文 |
| 今日要点 | `summaryPoints` | bullet_list | rewrite/append, 3–5 条 | 提炼互不重复的方向性信号与代表性论文/方法,每条说明关键信息及其意义 |

### 5.2 Session 级

固定信息保留,主体内容为用户确认的四字段结构:

| 字段 | id | 类型 | AI | 说明 |
|---|---|---|---|---|
| 作者与机构 | `speakers` | fixed | 否 | 复用 industry 的 id,换 label/description;来自会议日程 |
| 洞察核心 | `insightCore` | short_text | rewrite, ≤120 字符 | 一句话提炼洞察核心:明确指出一个趋势、技术、变化及其影响(论点) |
| 启示说明 | `insightExplanation` | rich_text | rewrite/append | 从洞察核心延伸展开,结构:①当前背景与趋势下的业务痛点 ②洞察揭示的关键技术线索(解决了什么问题、相较以往的突破或变化) ③对业务/行业/研究/产品的启发 |
| 技术亮点 | `techHighlights` | rich_text | rewrite/append | 总结 session 内容要点,作为论据来源;覆盖 Keynote / Oral / Poster / Workshop / Tutorial / Paper / Demo 等形式;保留名称、数据、结论 |
| 对华为的启示 | `huaweiImplications` | rich_text | rewrite/append | 说明该技术线索为什么对华为重要、潜在应用与实际意义;明确区分来源事实与分析判断 |
| 插图 | `illustrations` | image | 否 | 论文图表、现场 slide,用户管理 |

四字段的 `allowedSources`: `["transcript", "current_draft", "calendar", "user_focus"]`(与 industry session 字段一致)。

### 5.3 Block 级

| 字段 | id | 类型 | AI | 说明 |
|---|---|---|---|---|
| 趋势研判 | `trendBlocks` | rich_text | rewrite/append | 新 block id。记录今天最值得关注的方向性信号 / 方法论 shift / 对我们的机会或威胁;按"观察证据 → 合理推断 → 潜在影响 → 建议跟进"组织,标注不确定性,结论强度与材料匹配 |

`allowedSources`: `["transcript", "current_draft", "user_focus"]`(与 industry block 字段一致)。block 支持附加转录,机制与 industry block 相同。

### 5.4 Daily 级图片

| 字段 | id | 类型 | AI | 说明 |
|---|---|---|---|---|
| 现场速记 | `sitePhotos` | image | 否 | 复用 industry 的 id,换 label/description。照片 + 描述结构;描述中可记走廊交流(hallway track)、海报区观察、人才动向等软信息。用户管理 |

不出现的 industry 字段:`onsiteInfoBlocks`、`reflectionsBlocks`、`rumorsBlocks`(模板不含即 UI 自动隐藏对应区块)。

## 6. 新 block id `trendBlocks` 管线改动

现有 block AI 管线以 `AI_BLOCK_FIELDS = ["onsiteInfoBlocks", "reflectionsBlocks", "rumorsBlocks"]` 为硬编码清单,需扩展并逐处核对:

1. `src/types/ai-report.ts`: `AI_BLOCK_FIELDS` 加入 `"trendBlocks"`;`AiBlockField` 类型自动扩展。
2. `src/types/firestore.ts`: `BlockField` 联合类型加入 `"trendBlocks"`;`Report` 与 `ReportData` 增加 `trendBlocks?: ReportBlock[]`。
3. `src/lib/ai-report/templateContract.ts`: 基于 `AI_BLOCK_FIELDS` 的校验自动覆盖新 id,核对无误。
4. `src/lib/ai-report/transcriptSource.ts`: block 转录源校验自动覆盖,核对无误。
5. `server/ai-report/generate-block.ts` 与 `api/conferences/[confId]/reports/[reportId]/ai/generate.ts`: 基于 `AI_BLOCK_FIELDS` 的判断自动覆盖,核对无误。
6. `src/components/report/DailyReport.tsx`:
   - 初始化、`reportData` 读写、persist 逻辑增加 `trendBlocks` 数组。
   - 新增「趋势研判」`ReportBlockSection` 渲染;渲染条件沿用现有模式(模板含该字段才显示)。
   - industry 报告(模板无 `trendBlocks`)的渲染与行为不变。

## 7. 会议类型与模板绑定

1. `Conference` 文档增加 `type?: "industry" | "academic"`;缺省(含全部存量会议)视为 `"industry"`,向后兼容。
2. 会议创建 / 设置界面增加类型选择(单个下拉,最小改动)。
3. 新建日报时读取会议类型,绑定对应 canonical 模板:
   - `academic` → `ACADEMIC_CONFERENCE_DAILY_REPORT_V1_BINDING`
   - 其他 → `INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING`
4. `defaultTemplateBindingPatch` 泛化:`isCanonicalV1` 检查扩展为识别两个 canonical 模板;对 unbound 报告的默认绑定仍只走 industry(存量行为不变),学术绑定只在新建日报按会议类型发生。
5. 既有 unbound 报告的 legacy 迁移逻辑(`rumorsBlocks` / `stripHtml(report.rumors)`)保持不变。

## 8. 错误处理与冲突安全

- 模板不可变发布:同名同版本已存在且 hash 不一致时 `publishImmutableTemplate` 报错,与 industry 相同。
- `trendBlocks` 的 block 增删改、转录附加、AI 生成的冲突与并发行为完全复用现有 block 机制,不引入新路径。
- 会议 `type` 缺失或非法值一律按 industry 处理。

## 9. 测试

1. **模板测试** `academicConferenceDailyReport.test.ts`:字段集快照、hash 锁定、binding 常量,对齐 industry 模板测试模式。
2. **合约 / 管线测试**: `templateContract`、`transcriptSource`、`generate-block` 补充 `trendBlocks` 用例(合法 id 通过、非法 id 拒绝)。
3. **绑定测试**: 会议类型 → 模板绑定的映射;`type` 缺失回退 industry;unbound 报告默认绑定行为不变。
4. **UI 测试**: 学术模板下 DailyReport 渲染「趋势研判」区块且不渲染 industry 的三个情报区块;industry 模板渲染不变。
5. 仓库门禁: `npm run test`、`npm run build` 通过。

## 10. 发布顺序

1. `trendBlocks` 管线扩展(类型 → 合约 → 服务端 → UI)+ 测试。
2. 学术模板定义 + hash 测试。
3. 会议类型字段 + 绑定逻辑 + UI 下拉。
4. 发布脚本上线后对学术会议建日报做端到端验证(绑定正确、block AI 生成可用、证据引用正常)。
