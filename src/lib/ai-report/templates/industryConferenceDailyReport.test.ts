import { describe, expect, it } from "vitest";
import { assertTemplateVersion } from "../templateContract";
import { hashTemplateDefinition } from "../templateHash";
import {
  INDUSTRY_CONFERENCE_DAILY_REPORT_V1,
  INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING,
} from "./industryConferenceDailyReport";

describe("industry conference daily report V1", () => {
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

  it("uses fixed policies for fixed and image fields", () => {
    const fixedOrImage = INDUSTRY_CONFERENCE_DAILY_REPORT_V1.fields.filter(
      (field) => field.type === "fixed" || field.type === "image",
    );

    expect(fixedOrImage.every((field) => !field.ai.enabled)).toBe(true);
    expect(fixedOrImage.every((field) => field.ai.allowedSources.length === 0)).toBe(true);
    expect(fixedOrImage.every((field) => field.ai.allowedModes.length === 0)).toBe(true);
  });

  it("exports the exact immutable V1 binding", () => {
    expect(INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING).toEqual({
      templateId: INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateId,
      templateVersion: INDUSTRY_CONFERENCE_DAILY_REPORT_V1.version,
      templateHash: INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateHash,
    });
  });
});
