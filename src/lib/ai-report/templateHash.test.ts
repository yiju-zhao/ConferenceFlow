import { describe, expect, it } from "vitest";
import { canonicalTemplateDefinition, hashTemplateDefinition } from "./templateHash";

describe("template definition hashes", () => {
  it("hashes equivalent template definitions identically", async () => {
    const left = { templateId: "x", version: 1, fields: [{ id: "a", label: "A" }] };
    const right = { fields: [{ label: "A", id: "a" }], version: 1, templateId: "x" };

    expect(await hashTemplateDefinition(left)).toBe(await hashTemplateDefinition(right));
  });

  it("preserves field order while canonicalizing nested object keys", () => {
    expect(
      canonicalTemplateDefinition({
        templateId: "x",
        version: 1,
        fields: [{ id: "a", ai: { enabled: true, allowedModes: ["rewrite", "append"] } }],
      }),
    ).not.toBe(
      canonicalTemplateDefinition({
        templateId: "x",
        version: 1,
        fields: [{ id: "a", ai: { enabled: true, allowedModes: ["append", "rewrite"] } }],
      }),
    );
  });
});
