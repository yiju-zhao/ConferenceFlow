import { describe, expect, it } from "vitest";
import type { Report } from "../../src/types/firestore";
import type { TemplateField } from "../../src/types";
import {
  buildDailySourceBlocks,
  buildSessionDraftBlocks,
  readReportFieldValue,
  validateCandidateValue,
} from "./field-policy";
import { validateSourceSupports } from "./evidence";

const policy: TemplateField["ai"] = {
  enabled: true,
  allowedSources: ["report_content"],
  evidenceRequired: true,
  allowedModes: ["rewrite", "append"],
};
const textField: TemplateField = {
  id: "summary",
  label: "摘要",
  description: "摘要",
  type: "rich_text",
  scope: "daily",
  ai: { ...policy, maxLength: 100 },
};
const bulletField: TemplateField = {
  id: "points",
  label: "要点",
  description: "要点",
  type: "bullet_list",
  scope: "daily",
  ai: { ...policy, minItems: 1, maxItems: 3 },
};

describe("candidate field policy", () => {
  it("validates all generated field types and numeric constraints", () => {
    expect(validateCandidateValue(["A", "B"], bulletField)).toEqual(["A", "B"]);
    expect(validateCandidateValue("段落\n内容", textField)).toBe("段落\n内容");
    expect(validateCandidateValue("标题", { ...textField, type: "short_text" })).toBe("标题");
    expect(() => validateCandidateValue("A", bulletField)).toThrow("expected bullet_list");
    expect(() => validateCandidateValue(["A", "B", "C", "D"], bulletField)).toThrow(
      "too many items",
    );
    expect(() =>
      validateCandidateValue("123456", { ...textField, ai: { ...textField.ai, maxLength: 5 } }),
    ).toThrow("value too long");
    expect(() =>
      validateCandidateValue(["A"], { ...bulletField, ai: { ...bulletField.ai, minItems: 2 } }),
    ).toThrow("too few items");
    expect(() =>
      validateCandidateValue(["😀😀"], { ...bulletField, ai: { ...bulletField.ai, maxLength: 3 } }),
    ).not.toThrow();
  });

  it("rejects fixed and image fields as candidate targets", () => {
    expect(() => validateCandidateValue("x", { ...textField, type: "fixed" })).toThrow();
    expect(() => validateCandidateValue("x", { ...textField, type: "image" })).toThrow();
    expect(() => validateCandidateValue("x", { ...textField, type: "short_text" })).not.toThrow();
  });
});

describe("report source policy", () => {
  it("reads only authoritative report values and filters session append drafts", () => {
    const report = {
      summary: "日报值",
      sessions: { B: { takeaways: "B 草稿" }, A: { takeaways: "A 草稿" } },
    } as unknown as Report;
    expect(readReportFieldValue(report, "summary")).toBe("日报值");
    expect(readReportFieldValue(report, "takeaways", "A")).toBe("A 草稿");
    const fields: TemplateField[] = [
      {
        ...textField,
        id: "takeaways",
        scope: "session" as const,
        ai: { ...textField.ai, allowedSources: ["current_draft"], allowedModes: ["rewrite"] },
      },
      {
        ...textField,
        id: "insights",
        scope: "session" as const,
        ai: {
          ...textField.ai,
          allowedSources: ["current_draft"],
          allowedModes: ["rewrite", "append"],
        },
      },
    ];
    expect(
      buildSessionDraftBlocks(
        fields,
        { takeaways: "不应出现在追加", insights: "保留草稿" },
        "append",
      ),
    ).toEqual([{ sourceId: "draft:insights", sourceType: "current_draft", text: "保留草稿" }]);
  });

  it("strips editor HTML and excludes metadata, photos, focus, and the daily target", () => {
    const fields: TemplateField[] = [
      { ...textField, id: "summary", ai: { ...textField.ai, allowedSources: ["report_content"] } },
      { ...textField, id: "rumors", ai: { ...textField.ai, allowedSources: ["report_content"] } },
      {
        ...textField,
        id: "rumorsBlocks",
        ai: { ...textField.ai, allowedSources: ["report_content"] },
      },
      { ...textField, id: "fixedThing", type: "fixed", ai: { ...textField.ai, enabled: false } },
      {
        ...textField,
        id: "takeaways",
        scope: "session",
        ai: { ...textField.ai, allowedSources: ["transcript"] },
      },
    ];
    const report = {
      summary: "<p>第一段 &amp; 第二段</p><p>第三&nbsp;段<br>第四 &quot;段&quot;</p>",
      rumors: "保留",
      rumorsBlocks: ["不应作为日报来源"],
      sitePhotos: [{ image: "photo" }],
      aiFocus: "不应作为来源",
      status: "draft",
      sessions: {
        S2: { takeaways: "S2 草稿", transcriptRef: { fileName: "secret.txt" } },
        S1: { takeaways: "S1 草稿" },
      },
    } as unknown as Report & { aiFocus?: string };
    const blocks = buildDailySourceBlocks(report, fields, "summary");
    expect(blocks).toEqual([
      { sourceId: "report:rumors", sourceType: "report_field", text: "保留" },
      { sourceId: "session:S1:takeaways", sourceType: "report_field", text: "S1 草稿" },
      { sourceId: "session:S2:takeaways", sourceType: "report_field", text: "S2 草稿" },
    ]);
    expect(blocks.map((block) => block.text).join(" ")).not.toContain("第一段");
    expect(blocks.map((block) => block.text).join(" ")).not.toContain("secret.txt");
    expect(blocks.map((block) => block.text).join(" ")).not.toContain("不应作为日报来源");
  });

  it("includes the target draft only when current_draft is allowed", () => {
    const target: TemplateField = {
      ...bulletField,
      id: "summaryPoints",
      ai: { ...bulletField.ai, allowedSources: ["report_content", "current_draft"] },
    };
    const rumors: TemplateField = { ...textField, id: "rumors" };
    const report = {
      summaryPoints: ["已有核心要点"],
      rumors: "其他日报内容",
    } as unknown as Report;

    expect(buildDailySourceBlocks(report, [target, rumors], target)).toEqual(
      expect.arrayContaining([
        {
          sourceId: "draft:summaryPoints",
          sourceType: "current_draft",
          text: "已有核心要点",
        },
      ]),
    );
    expect(
      buildDailySourceBlocks(
        report,
        [{ ...target, ai: { ...target.ai, allowedSources: ["report_content"] } }, rumors],
        target.id,
      ).map((block) => block.sourceId),
    ).not.toContain("draft:summaryPoints");
  });

  it("excludes retained report Sessions marked deleted from daily source and Evidence", () => {
    const fields: TemplateField[] = [
      { ...textField, id: "summary", ai: { ...textField.ai, allowedSources: ["report_content"] } },
      { ...textField, id: "takeaways", scope: "session" },
    ];
    const report = {
      deletedSessions: ["S1"],
      sessions: {
        S1: { takeaways: "已删除 Session 的内容" },
        S2: { takeaways: "仍在日报中的内容" },
      },
    } as unknown as Report;

    const blocks = buildDailySourceBlocks(report, fields, "summary");

    expect(blocks).toEqual([
      {
        sourceId: "session:S2:takeaways",
        sourceType: "report_field",
        text: "仍在日报中的内容",
      },
    ]);
    expect(
      validateSourceSupports(
        [{ sourceId: "session:S1:takeaways", quote: "已删除 Session 的内容" }],
        blocks,
      ),
    ).toEqual([]);
  });
});
