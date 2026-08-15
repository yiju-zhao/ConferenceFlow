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
