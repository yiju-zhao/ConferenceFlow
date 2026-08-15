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
