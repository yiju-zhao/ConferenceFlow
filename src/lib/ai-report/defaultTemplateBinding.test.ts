import { describe, expect, it } from "vitest";
import type { Report, ReportTemplateVersion } from "../../types";
import {
  INDUSTRY_CONFERENCE_DAILY_REPORT_V1,
  INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING,
} from "./templates/industryConferenceDailyReport";
import { defaultTemplateBindingPatch, reportTemplateBindingState } from "./defaultTemplateBinding";

const template: ReportTemplateVersion = INDUSTRY_CONFERENCE_DAILY_REPORT_V1;

describe("reportTemplateBindingState", () => {
  it("classifies reports by the completeness of their template binding", () => {
    expect(reportTemplateBindingState({ id: "r1" })).toBe("unbound");
    expect(reportTemplateBindingState({ id: "r1", templateId: "partial" })).toBe("partial");
    expect(
      reportTemplateBindingState({
        id: "r1",
        templateId: "other",
        templateVersion: 2,
        templateHash: "hash",
      }),
    ).toBe("bound");
  });
});

describe("defaultTemplateBindingPatch", () => {
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
    expect(patch).not.toHaveProperty("rumors");
  });

  it("preserves existing rumors blocks without adding a legacy duplicate", () => {
    const rumorsBlocks: NonNullable<Report["rumorsBlocks"]> = [
      { id: "existing", type: "body", content: "<p>已迁移</p>" },
    ];

    expect(
      defaultTemplateBindingPatch({ id: "r1", rumors: "<p>旧内容</p>", rumorsBlocks }, template),
    ).toEqual({ ...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING, rumorsBlocks });
  });

  it.each([
    { id: "r1", templateId: "partial" },
    { id: "r1", templateVersion: 1 },
    { id: "r1", templateHash: "partial" },
    { id: "r1", templateId: "other", templateVersion: 2, templateHash: "hash" },
  ])("never changes partial or existing bindings", (report) => {
    expect(defaultTemplateBindingPatch(report, template)).toBeNull();
  });

  it("rejects a template that is not the canonical V1 identity", () => {
    expect(
      defaultTemplateBindingPatch(
        { id: "r1" },
        { ...template, templateHash: "different-template" },
      ),
    ).toBeNull();
  });
});
