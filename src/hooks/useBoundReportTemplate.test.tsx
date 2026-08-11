import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBoundReportTemplate } from "./useBoundReportTemplate";
import type { Report, ReportTemplateVersion } from "../types";

const { mockDoc, mockGetDoc, db } = vi.hoisted(() => ({
  mockDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
}));

vi.mock("../firebase", () => ({ db }));

const templateVersion: ReportTemplateVersion = {
  templateId: "daily-brief",
  version: 3,
  templateHash: "sha256-template",
  fields: [
    {
      id: "takeaways",
      label: "Takeaways",
      description: "Key takeaways",
      type: "bullet_list",
      scope: "daily",
      ai: {
        enabled: true,
        allowedSources: ["report_content"],
        evidenceRequired: false,
        allowedModes: ["rewrite"],
      },
    },
  ],
};

const boundReport: Report = {
  id: "r1",
  templateId: "daily-brief",
  templateVersion: 3,
  templateHash: "sha256-template",
};

function fakeSnapshot(value: unknown) {
  return {
    exists: () => value !== null,
    data: () => value,
  };
}

describe("useBoundReportTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue({});
  });

  it("stays manual when the report has no template binding", async () => {
    const { result } = renderHook(() => useBoundReportTemplate({ id: "r1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.template).toBeNull();
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it("loads the exact bound version and verifies its hash", async () => {
    mockGetDoc.mockResolvedValue(fakeSnapshot(templateVersion));
    const { result } = renderHook(() => useBoundReportTemplate(boundReport));
    await waitFor(() => expect(result.current.template?.version).toBe(3));
    expect(mockDoc).toHaveBeenCalledWith(db, "reportTemplates", "daily-brief", "versions", "3");
    expect(result.current.error).toBeNull();
  });

  it("rejects a version whose hash differs from the report binding", async () => {
    mockGetDoc.mockResolvedValue(fakeSnapshot({ ...templateVersion, templateHash: "changed" }));
    const { result } = renderHook(() => useBoundReportTemplate(boundReport));
    await waitFor(() => expect(result.current.error).toBe("template hash mismatch"));
    expect(result.current.template).toBeNull();
  });
});
