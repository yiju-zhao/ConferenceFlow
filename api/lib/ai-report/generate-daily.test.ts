import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeepSeekMessage } from "./deepseek";
import type { TemplateField } from "../../../src/types";

const { mockDeepSeek } = vi.hoisted(() => ({
  mockDeepSeek: vi.fn(),
}));

vi.mock("./deepseek", () => ({
  requestDeepSeekJson: mockDeepSeek,
}));

import {
  decodeDailyWritingModelOutput,
  generateDailyCandidate,
  type DailyGenerationInput,
} from "./generate-daily";

function field(
  id: string,
  overrides: Omit<Partial<TemplateField>, "ai"> & { ai?: Partial<TemplateField["ai"]> } = {},
): TemplateField {
  const { ai: aiOverrides, ...fieldOverrides } = overrides;
  return {
    id,
    label: id,
    description: `${id} 描述`,
    type: "bullet_list",
    scope: "daily",
    ai: {
      enabled: true,
      allowedSources: ["report_content"],
      evidenceRequired: true,
      allowedModes: ["rewrite"],
      minItems: 1,
      maxItems: 5,
      maxLength: 200,
      ...aiOverrides,
    },
    ...fieldOverrides,
  };
}

function makeInput(overrides: Partial<DailyGenerationInput> = {}): DailyGenerationInput {
  const target = field("summaryPoints");
  const source = field("takeaways", { scope: "session", type: "rich_text" });
  return {
    template: {
      templateId: "daily",
      version: 1,
      templateHash: "template-hash",
      fields: [target, source],
    },
    field: target,
    currentValue: ["现有要点"],
    sourceBlocks: [
      {
        sourceId: "session:S101:takeaways",
        sourceType: "report_field",
        text: "推理成本下降 30%",
      },
    ],
    focus: "关注成本",
    mode: "rewrite",
    instruction: "优先写成本",
    templateHash: "template-hash",
    baseFieldHashes: { summaryPoints: "summary-hash" },
    ...overrides,
  };
}

function messages(call = 0): DeepSeekMessage[] {
  return mockDeepSeek.mock.calls[call]?.[0] as DeepSeekMessage[];
}

function sourceData(call = 0): Record<string, unknown> {
  const content = messages(call)[1]?.content ?? "";
  const source = content.match(/SOURCE_DATA_START\n([\s\S]*)\nSOURCE_DATA_END/);
  if (!source) throw new Error("missing SOURCE_DATA block");
  return JSON.parse(source[1]) as Record<string, unknown>;
}

describe("generateDailyCandidate", () => {
  beforeEach(() => mockDeepSeek.mockReset());

  it("uses one Writing call and validates exact report-source excerpts", async () => {
    mockDeepSeek.mockResolvedValue({
      fieldId: "summaryPoints",
      value: ["S101 的推理成本下降 30%。"],
      supports: [{ sourceId: "session:S101:takeaways", quote: "推理成本下降 30%" }],
      insufficient: false,
    });

    const result = await generateDailyCandidate(makeInput());

    expect(mockDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.candidate).toHaveLength(1);
    expect(result.candidate[0]).toMatchObject({
      fieldId: "summaryPoints",
      evidenceIds: ["daily_ev_0001"],
    });
    expect(result.evidence[0]).toMatchObject({
      id: "daily_ev_0001",
      sourceType: "report_field",
      sourceId: "session:S101:takeaways",
      quote: "推理成本下降 30%",
    });
  });

  it("keeps source blocks, focus, and instruction in lower-priority user data", async () => {
    mockDeepSeek.mockResolvedValue({
      fieldId: "summaryPoints",
      value: ["推理成本下降 30%。"],
      supports: [{ sourceId: "session:S101:takeaways", quote: "推理成本下降 30%" }],
      insufficient: false,
    });

    await generateDailyCandidate(makeInput());

    expect(messages()[0].content).toContain("中文");
    expect(messages()[0].content).toContain("不可信");
    expect(sourceData()).toEqual(
      expect.objectContaining({
        targetField: expect.objectContaining({ id: "summaryPoints" }),
        currentValue: ["现有要点"],
        sourceBlocks: [
          expect.objectContaining({
            sourceId: "session:S101:takeaways",
            sourceType: "report_field",
            text: "推理成本下降 30%",
          }),
        ],
        focus: "关注成本",
        mode: "rewrite",
        instruction: "优先写成本",
      }),
    );
  });

  it.each([
    [
      "unknown source IDs",
      { supports: [{ sourceId: "report:unknown", quote: "推理成本下降 30%" }] },
    ],
    [
      "non-matching quotes",
      { supports: [{ sourceId: "session:S101:takeaways", quote: "不存在" }] },
    ],
    ["wrong target IDs", { fieldId: "rumors" }],
    ["invalid type", { value: "不是列表" }],
    ["invalid length", { value: ["x".repeat(201)] }],
    ["invalid item count", { value: ["一", "二", "三", "四", "五", "六"] }],
  ])("withholds a candidate for %s", async (_name, output) => {
    mockDeepSeek.mockResolvedValue({
      fieldId: "summaryPoints",
      value: ["推理成本下降 30%。"],
      supports: [{ sourceId: "session:S101:takeaways", quote: "推理成本下降 30%" }],
      insufficient: false,
      ...output,
    });

    const result = await generateDailyCandidate(makeInput());

    expect(mockDeepSeek).toHaveBeenCalledTimes(1);
    expect(result.candidate).toEqual([]);
    expect(result.insufficientFieldIds).toEqual(["summaryPoints"]);
    expect(result.evidence).toEqual([]);
  });

  it("withholds a candidate when the response marks the target insufficient", async () => {
    mockDeepSeek.mockResolvedValue({
      fieldId: "summaryPoints",
      value: ["推理成本下降 30%。"],
      supports: [{ sourceId: "session:S101:takeaways", quote: "推理成本下降 30%" }],
      insufficient: true,
    });

    const result = await generateDailyCandidate(makeInput());

    expect(result.candidate).toEqual([]);
    expect(result.insufficientFieldIds).toEqual(["summaryPoints"]);
    expect(mockDeepSeek).toHaveBeenCalledTimes(1);
  });

  it("does not call the model when report sources are empty", async () => {
    const result = await generateDailyCandidate(makeInput({ sourceBlocks: [] }));

    expect(result.candidate).toEqual([]);
    expect(result.insufficientFieldIds).toEqual(["summaryPoints"]);
    expect(mockDeepSeek).not.toHaveBeenCalled();
  });

  it("does not call the model for unsupported append mode", async () => {
    const result = await generateDailyCandidate(makeInput({ mode: "append" }));

    expect(result.candidate).toEqual([]);
    expect(result.insufficientFieldIds).toEqual(["summaryPoints"]);
    expect(mockDeepSeek).not.toHaveBeenCalled();
  });

  it("rejects a response supported only by the target current value", async () => {
    mockDeepSeek.mockResolvedValue({
      fieldId: "summaryPoints",
      value: ["现有要点"],
      supports: [{ sourceId: "report:summaryPoints", quote: "现有要点" }],
      insufficient: false,
    });

    const result = await generateDailyCandidate(makeInput());

    expect(result.candidate).toEqual([]);
    expect(result.insufficientFieldIds).toEqual(["summaryPoints"]);
    expect(result.evidence).toEqual([]);
    expect(mockDeepSeek).toHaveBeenCalledTimes(1);
  });
});

describe("decodeDailyWritingModelOutput", () => {
  it("requires exactly the documented top-level and support keys", () => {
    expect(() =>
      decodeDailyWritingModelOutput({
        fieldId: "summaryPoints",
        value: [],
        supports: [],
        insufficient: false,
        extra: true,
      }),
    ).toThrow();
    expect(() =>
      decodeDailyWritingModelOutput({
        fieldId: "summaryPoints",
        value: [],
        supports: [{ sourceId: "x", quote: "y", extra: true }],
        insufficient: false,
      }),
    ).toThrow();
    expect(() =>
      decodeDailyWritingModelOutput({
        fieldId: "summaryPoints",
        value: [],
        supports: [],
        insufficient: "false",
      }),
    ).toThrow();
  });
});
