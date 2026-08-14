import { describe, expect, it, vi } from "vitest";
import type { ReportTemplateVersion } from "../../src/types";
import { INDUSTRY_CONFERENCE_DAILY_REPORT_V1 as template } from "../../src/lib/ai-report/templates/industryConferenceDailyReport";
import { publishImmutableTemplate, type ImmutableTemplateStore } from "./publishImmutableTemplate";

function fakeStore(existing: unknown | null): ImmutableTemplateStore & {
  create: ReturnType<typeof vi.fn>;
} {
  return {
    read: vi.fn(async () => existing),
    create: vi.fn(async (_template: ReportTemplateVersion) => undefined),
  };
}

describe("publishImmutableTemplate", () => {
  it("creates a missing immutable version", async () => {
    const store = fakeStore(null);

    await expect(publishImmutableTemplate(template, store)).resolves.toBe("created");

    expect(store.create).toHaveBeenCalledWith(template);
  });

  it("does not rewrite an equivalent existing version", async () => {
    const store = fakeStore(structuredClone(template));

    await expect(publishImmutableTemplate(template, store)).resolves.toBe("unchanged");

    expect(store.create).not.toHaveBeenCalled();
  });

  it("refuses to overwrite a conflicting immutable version", async () => {
    const store = fakeStore({ ...template, fields: [] });

    await expect(publishImmutableTemplate(template, store)).rejects.toThrow(
      "immutable template version already exists with different content",
    );
  });
});
