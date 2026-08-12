import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Report } from "../types";
import {
  INDUSTRY_CONFERENCE_DAILY_REPORT_V1,
  INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING,
} from "../lib/ai-report/templates/industryConferenceDailyReport";
import { useDefaultReportTemplateBinding } from "./useDefaultReportTemplateBinding";

const { mockDoc, mockGetDoc, mockRunTransaction, db } = vi.hoisted(() => ({
  mockDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockRunTransaction: vi.fn(),
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
  runTransaction: mockRunTransaction,
}));

vi.mock("../firebase", () => ({ db }));

function fakeSnapshot(value: unknown) {
  return {
    exists: () => value !== null,
    data: () => value,
  };
}

describe("useDefaultReportTemplateBinding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db, ...path: string[]) => ({ path: path.join("/") }));
  });

  it("does nothing when default binding is disabled", async () => {
    renderHook(() =>
      useDefaultReportTemplateBinding({
        confId: "c1",
        reportId: "r1",
        report: { id: "r1" },
        enabled: false,
      }),
    );

    await Promise.resolve();
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("loads and validates the exact canonical V1 template before binding", async () => {
    mockGetDoc.mockResolvedValue(fakeSnapshot(INDUSTRY_CONFERENCE_DAILY_REPORT_V1));
    const transaction = { get: vi.fn().mockResolvedValue(fakeSnapshot({})), set: vi.fn() };
    mockRunTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    renderHook(() =>
      useDefaultReportTemplateBinding({
        confId: "c1",
        reportId: "r1",
        report: { id: "r1" },
        enabled: true,
      }),
    );

    await waitFor(() => expect(mockRunTransaction).toHaveBeenCalledTimes(1));
    expect(mockDoc).toHaveBeenCalledWith(
      db,
      "reportTemplates",
      "industry-conference-daily-report",
      "versions",
      "1",
    );
    expect(mockDoc).toHaveBeenCalledWith(db, "conferences", "c1", "dailyReports", "r1");
    expect(transaction.get).toHaveBeenCalledWith({ path: "conferences/c1/dailyReports/r1" });
    expect(transaction.set).toHaveBeenCalledWith(
      { path: "conferences/c1/dailyReports/r1" },
      { ...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING, rumorsBlocks: [] },
      { merge: true },
    );
  });

  it.each([
    ["missing", null],
    ["invalid", {}],
    ["mismatched", { ...INDUSTRY_CONFERENCE_DAILY_REPORT_V1, templateHash: "changed" }],
  ])("does not transact when the template is %s", async (_kind, template) => {
    mockGetDoc.mockResolvedValue(fakeSnapshot(template));

    renderHook(() =>
      useDefaultReportTemplateBinding({
        confId: "c1",
        reportId: "r1",
        report: { id: "r1" },
        enabled: true,
      }),
    );

    await waitFor(() => expect(mockGetDoc).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("re-reads the report in the transaction before applying one patch", async () => {
    const report: Report = { id: "r1", title: "stale input" };
    mockGetDoc.mockResolvedValue(fakeSnapshot(INDUSTRY_CONFERENCE_DAILY_REPORT_V1));
    const transaction = {
      get: vi.fn().mockResolvedValue(fakeSnapshot({ title: "latest", rumors: "<p>保留内容</p>" })),
      set: vi.fn(),
    };
    mockRunTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    renderHook(() =>
      useDefaultReportTemplateBinding({ confId: "c1", reportId: "r1", report, enabled: true }),
    );

    await waitFor(() => expect(transaction.set).toHaveBeenCalledTimes(1));
    expect(transaction.set).toHaveBeenCalledWith(
      { path: "conferences/c1/dailyReports/r1" },
      {
        ...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING,
        rumorsBlocks: [{ id: "legacy-rumors-v1", type: "body", content: "<p>保留内容</p>" }],
      },
      { merge: true },
    );
  });
});
