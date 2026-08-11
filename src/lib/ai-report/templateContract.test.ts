import { describe, expect, it } from "vitest";
import {
  assertTemplateVersion,
  normalizeStoredFieldValue,
  selectEligibleFields,
} from "./templateContract";

const template = {
  templateId: "daily-brief",
  version: 3,
  templateHash: "sha256-template",
  fields: [
    {
      id: "takeaways",
      label: "核心结论",
      description: "会议明确表达的关键事实",
      type: "rich_text",
      scope: "session",
      ai: {
        enabled: true,
        allowedSources: ["transcript", "current_draft", "user_focus"],
        evidenceRequired: true,
        allowedModes: ["rewrite", "append"],
        maxLength: 600,
      },
    },
    {
      id: "speakers",
      label: "讲者",
      description: "来自日程的固定讲者",
      type: "fixed",
      scope: "session",
      ai: {
        enabled: false,
        allowedSources: ["calendar"],
        evidenceRequired: false,
        allowedModes: [],
      },
    },
  ],
} as const;

describe("template contract", () => {
  it("accepts the immutable template shape", () => {
    expect(assertTemplateVersion(template).templateHash).toBe("sha256-template");
  });

  it("selects only enabled, non-fixed fields that support the mode", () => {
    expect(selectEligibleFields(assertTemplateVersion(template), "session", "append")).toEqual([
      expect.objectContaining({ id: "takeaways" }),
    ]);
  });

  it("rejects an image field marked AI-enabled", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    const fields = invalid.fields as Array<Record<string, unknown>>;
    fields[1] = {
      ...fields[1],
      type: "image",
      ai: { ...(fields[1].ai as object), enabled: true },
    };
    expect(() => assertTemplateVersion(invalid)).toThrow("image and fixed fields cannot enable AI");
  });

  it("normalizes absent stored values by template type", () => {
    const valid = assertTemplateVersion(template);
    expect(normalizeStoredFieldValue(valid.fields[0], undefined)).toBe("");
  });

  it("requires Firestore-safe field IDs", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    (invalid.fields as Array<Record<string, unknown>>)[0].id = "not-safe-id";
    expect(() => assertTemplateVersion(invalid)).toThrow("invalid template field");
  });

  it("rejects reserved AI field IDs", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    (invalid.fields as Array<Record<string, unknown>>)[0].id = "calendarSessionId";
    expect(() => assertTemplateVersion(invalid)).toThrow("reserved AI field");
  });

  it("requires valid field scopes", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    (invalid.fields as Array<Record<string, unknown>>)[0].scope = "conference";
    expect(() => assertTemplateVersion(invalid)).toThrow("invalid field scope");
  });

  it.each([
    ["enabled", { enabled: "yes" }],
    ["evidenceRequired", { evidenceRequired: "yes" }],
  ])("requires %s to be boolean", (_name, change) => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    const ai = (invalid.fields as Array<Record<string, unknown>>)[0].ai as Record<string, unknown>;
    Object.assign(ai, change);
    expect(() => assertTemplateVersion(invalid)).toThrow("invalid AI policy");
  });

  it("rejects unknown sources and modes", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    const ai = (invalid.fields as Array<Record<string, unknown>>)[0].ai as Record<string, unknown>;
    ai.allowedSources = ["unknown"];
    expect(() => assertTemplateVersion(invalid)).toThrow("invalid AI source");
    ai.allowedSources = ["transcript"];
    ai.allowedModes = ["unknown"];
    expect(() => assertTemplateVersion(invalid)).toThrow("invalid AI mode");
  });

  it("rejects duplicate sources and modes", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    const ai = (invalid.fields as Array<Record<string, unknown>>)[0].ai as Record<string, unknown>;
    ai.allowedSources = ["transcript", "transcript"];
    expect(() => assertTemplateVersion(invalid)).toThrow("duplicate AI source");
    ai.allowedSources = ["transcript"];
    ai.allowedModes = ["append", "append"];
    expect(() => assertTemplateVersion(invalid)).toThrow("duplicate AI mode");
  });

  it("requires positive integer limits with a valid item range", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    const ai = (invalid.fields as Array<Record<string, unknown>>)[0].ai as Record<string, unknown>;
    ai.maxLength = 0;
    expect(() => assertTemplateVersion(invalid)).toThrow("invalid AI limit");
    ai.maxLength = 10;
    (invalid.fields as Array<Record<string, unknown>>)[0].type = "bullet_list";
    ai.minItems = 3;
    ai.maxItems = 2;
    expect(() => assertTemplateVersion(invalid)).toThrow("minItems cannot exceed maxItems");
  });

  it("rejects item limits on non-bullet fields", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    const ai = (invalid.fields as Array<Record<string, unknown>>)[0].ai as Record<string, unknown>;
    ai.minItems = 1;
    expect(() => assertTemplateVersion(invalid)).toThrow("item limits require bullet_list");
  });

  it("rejects append for short text, image, and fixed fields", () => {
    const invalid = structuredClone(template) as unknown as Record<string, unknown>;
    const fields = invalid.fields as Array<Record<string, unknown>>;
    fields[0] = { ...fields[0], type: "short_text" };
    expect(() => assertTemplateVersion(invalid)).toThrow("append is not allowed");
    fields[0] = { ...fields[0], type: "image" };
    (fields[0].ai as Record<string, unknown>).enabled = false;
    expect(() => assertTemplateVersion(invalid)).toThrow("append is not allowed");
    fields[0] = { ...fields[0], type: "fixed" };
    expect(() => assertTemplateVersion(invalid)).toThrow("append is not allowed");
  });
});
