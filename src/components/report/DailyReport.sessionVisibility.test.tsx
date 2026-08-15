import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { ACADEMIC_CONFERENCE_DAILY_REPORT_V1 } from "../../lib/ai-report/templates/academicConferenceDailyReport";
import DailyReport from "./DailyReport";

const { onSnapshotMock, useBoundReportTemplateMock } = vi.hoisted(() => ({
  onSnapshotMock:
    vi.fn<(referenceValue: unknown, callback: (snapshot: never) => void) => () => void>(),
  useBoundReportTemplateMock: vi.fn(),
}));

vi.mock("../../firebase", () => ({ db: {}, storage: {} }));

vi.mock("firebase/firestore", () => {
  const reference = (...args: unknown[]) => ({ path: args.slice(1).join("/") });
  return {
    addDoc: vi.fn().mockResolvedValue({ id: "snapshot-1" }),
    collection: vi.fn(reference),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    doc: vi.fn(reference),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    limit: vi.fn((count: number) => count),
    onSnapshot: onSnapshotMock,
    orderBy: vi.fn((field: string, direction: string) => ({ field, direction })),
    query: vi.fn((referenceValue: unknown) => referenceValue),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(() => 1),
    setDoc: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("firebase/storage", () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
  getDownloadURL: vi.fn().mockResolvedValue("https://example.test/report"),
  listAll: vi.fn().mockResolvedValue({ items: [] }),
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadString: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: (() => {
    const value = { user: { uid: "u1" }, userProfile: null };
    return () => value;
  })(),
}));
vi.mock("../../hooks/useMembership", () => ({
  useMembership: (() => {
    const value = { membership: null, isAdmin: false };
    return () => value;
  })(),
}));
vi.mock("../../hooks/useDebouncedSave", () => ({
  useDebouncedSave: (() => {
    const value = {
      debouncedSave: vi.fn(),
      flushPending: vi.fn().mockResolvedValue(undefined),
      saveState: "idle",
    };
    return () => value;
  })(),
}));
vi.mock("../../hooks/useBoundReportTemplate", () => ({
  useBoundReportTemplate: useBoundReportTemplateMock,
}));
vi.mock("../../hooks/useDefaultReportTemplateBinding", () => ({
  useDefaultReportTemplateBinding: vi.fn(),
}));
vi.mock("./usePresence", () => ({
  usePresence: (() => {
    const value = { activeUsers: [] };
    return () => value;
  })(),
}));
vi.mock("../UserAvatar", () => ({ default: () => <span aria-hidden="true" /> }));

const session = {
  id: "calendar-session-1",
  code: "S101",
  title: "Agent Workflow",
  date: "2026-08-14",
  start: "09:00",
  end: "10:00",
  attendees: ["u1"],
};

const report = {
  date: "2026-08-14",
  title: "Daily Report",
  summaryPoints: [],
  onsiteInfoBlocks: [],
  reflectionsBlocks: [],
  rumorsBlocks: [],
  sitePhotos: [],
  sessions: {
    S101: {
      takeaways: "<p>Visible session body</p>",
      insights: "<p>Visible session insight</p>",
    },
  },
  topicOrder: [],
  status: "draft",
};

const academicReport = {
  ...report,
  templateId: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId,
  templateVersion: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.version,
  templateHash: ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateHash,
  sessions: {
    S101: {
      insightCore: "学术洞察核心",
      insightExplanation: "<p>学术启示说明</p>",
      techHighlights: "<p>学术技术亮点</p>",
      huaweiImplications: "<p>学术业务启示</p>",
    },
  },
  trendBlocks: [{ id: "trend-1", type: "body" as const, content: "方向性信号" }],
};

let currentReport: typeof report | typeof academicReport = report;

const snapshot = {
  id: "snapshot-abcdef",
  data: () => ({
    type: "manual",
    createdAt: { toDate: () => new Date("2026-08-14T12:00:00Z") },
    createdBy: "u1",
    data: report,
  }),
};

function documentSnapshot(data: unknown) {
  return { exists: () => true, data: () => data };
}

function collectionSnapshot(items: Array<{ id: string; data: () => unknown }>) {
  return {
    docs: items,
    forEach: (callback: (item: (typeof items)[number]) => void) => items.forEach(callback),
  };
}

function renderReport(viewMode: boolean) {
  return render(
    <MemoryRouter initialEntries={["/conference/conf-1/report/2026-08-14-v1"]}>
      <Routes>
        <Route
          path="/conference/:confId/report/:reportId"
          element={<DailyReport viewMode={viewMode} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DailyReport Session visibility", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    currentReport = report;
    useBoundReportTemplateMock.mockReturnValue({ template: null, loading: false, error: null });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    onSnapshotMock.mockImplementation((referenceValue, callback) => {
      const path = (referenceValue as unknown as { path: string }).path;
      if (path.endsWith("/snapshots")) callback(collectionSnapshot([snapshot]) as never);
      else if (path === "conferences/conf-1") callback(documentSnapshot({ name: "Conf" }) as never);
      else if (path.endsWith("/members")) callback(collectionSnapshot([]) as never);
      else if (path.endsWith("/sessions")) {
        callback(collectionSnapshot([{ id: session.id, data: () => session }]) as never);
      } else if (path.endsWith("/dailyReports/2026-08-14-v1")) {
        callback(documentSnapshot(currentReport) as never);
      }
      return vi.fn();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every included Session expanded in view mode without an editor-only toggle", async () => {
    const { container } = renderReport(true);

    expect(await screen.findByText("Visible session body")).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText("Visible session insight")).toBeVisible();
      expect(screen.queryByRole("button", { name: "收起 S101 · Agent Workflow" })).toBeNull();
      expect(screen.queryByRole("button", { name: "展开 S101 · Agent Workflow" })).toBeNull();
    });
    expect(container.querySelector(".report-summary > .report-section-title")).toHaveTextContent(
      "核心要点",
    );
    expect(container.querySelector(".report-sessions > .report-section-title")).toHaveTextContent(
      "相关议题",
    );
    expect(container.querySelector(".report-view-mode .report-section-heading-row")).toBeNull();
  });

  it("expands from the focused edit control with Enter and ignores Session title clicks", async () => {
    const user = userEvent.setup();
    renderReport(false);

    const toggle = await screen.findByRole("button", { name: "展开 S101 · Agent Workflow" });
    expect(screen.queryByText("Visible session body")).toBeNull();

    toggle.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Visible session body")).toBeVisible();

    await user.click(screen.getByRole("heading", { name: "Agent Workflow", level: 3 }));
    expect(screen.getByText("Visible session body")).toBeVisible();
  });

  it("collapses a populated academic Session until its explicit edit control expands it", async () => {
    currentReport = academicReport;
    useBoundReportTemplateMock.mockReturnValue({
      template: ACADEMIC_CONFERENCE_DAILY_REPORT_V1,
      loading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderReport(false);

    const toggle = await screen.findByRole("button", { name: "展开 S101 · Agent Workflow" });
    expect(screen.queryByText("学术洞察核心")).toBeNull();

    await user.click(toggle);
    expect(await screen.findByText("学术洞察核心")).toBeVisible();
    expect(screen.getByText("学术启示说明")).toBeVisible();
  });

  it("keeps a populated academic Session expanded in view mode", async () => {
    currentReport = academicReport;
    useBoundReportTemplateMock.mockReturnValue({
      template: ACADEMIC_CONFERENCE_DAILY_REPORT_V1,
      loading: false,
      error: null,
    });
    renderReport(true);

    expect(await screen.findByText("学术洞察核心")).toBeVisible();
    expect(screen.getByText("学术技术亮点")).toBeVisible();
    expect(screen.queryByRole("button", { name: /S101 · Agent Workflow/ })).toBeNull();
  });

  it("keeps the editor outline aligned with academic-only visible sections", async () => {
    currentReport = academicReport;
    useBoundReportTemplateMock.mockReturnValue({
      template: ACADEMIC_CONFERENCE_DAILY_REPORT_V1,
      loading: false,
      error: null,
    });
    const { container } = renderReport(false);

    const outline = await waitFor(() => {
      const navigation = container.querySelector(".report-editor-outline");
      expect(navigation).not.toBeNull();
      return navigation as HTMLElement;
    });
    expect(within(outline).getByRole("link", { name: "趋势研判" })).toHaveAttribute(
      "href",
      "#section-trends",
    );
    expect(within(outline).getByRole("link", { name: "现场速记" })).toHaveAttribute(
      "href",
      "#section-site-photos",
    );
    expect(within(outline).queryByRole("link", { name: "现场情报" })).toBeNull();
    expect(within(outline).queryByRole("link", { name: "圈内声音" })).toBeNull();
    expect(within(outline).queryByRole("link", { name: "深度研判" })).toBeNull();
  });

  it("keeps delete, restore, and history controls on the shared editor touch-target contract", async () => {
    const user = userEvent.setup();
    renderReport(false);
    await screen.findByRole("button", { name: "更多" });

    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(screen.getByRole("menuitem", { name: "版本历史" }));
    const historyTitle = screen.getByRole("heading", { name: "版本历史", level: 2 });
    const historyPanel = historyTitle.parentElement?.parentElement as HTMLElement;
    const closeHistory = within(historyPanel).getByRole("button", { name: "✕" });
    const viewChanges = within(historyPanel).getByRole("button", { name: "查看变更" });
    const restore = within(historyPanel).getByRole("button", { name: "恢复" });
    [closeHistory, viewChanges, restore].forEach((control) => {
      expect(control).toHaveClass("report-editor-touch-target");
    });

    await user.click(viewChanges);
    expect(within(historyPanel).getByRole("button", { name: "返回" })).toHaveClass(
      "report-editor-touch-target",
    );
    expect(within(historyPanel).getByRole("button", { name: "恢复此版本" })).toHaveClass(
      "report-editor-touch-target",
    );
    await user.click(within(historyPanel).getByRole("button", { name: "返回" }));
    await user.click(within(historyPanel).getByRole("button", { name: "恢复" }));

    const restoreModal = screen.getByText("确认恢复此版本？").closest(".delete-confirm-modal")!;
    expect(within(restoreModal as HTMLElement).getByRole("button", { name: "取消" })).toHaveClass(
      "report-editor-touch-target",
    );
    expect(
      within(restoreModal as HTMLElement).getByRole("button", { name: "确认恢复" }),
    ).toHaveClass("report-editor-touch-target");
    await user.click(within(restoreModal as HTMLElement).getByRole("button", { name: "取消" }));
    await user.click(closeHistory);

    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(screen.getByRole("menuitem", { name: "删除 Session" }));
    const selectModal = screen
      .getByRole("heading", { name: "选择要删除的 Session", level: 3 })
      .closest(".delete-confirm-modal") as HTMLElement;
    const sessionChoice = within(selectModal).getByRole("button", { name: /S101/ });
    expect(sessionChoice).toHaveClass("report-editor-touch-target");
    expect(within(selectModal).getByRole("button", { name: "取消" })).toHaveClass(
      "report-editor-touch-target",
    );
    await user.click(sessionChoice);

    const deleteModal = screen
      .getByRole("heading", { name: "从日报移除此 Session", level: 3 })
      .closest(".delete-confirm-modal") as HTMLElement;
    expect(within(deleteModal).getByRole("button", { name: "取消" })).toHaveClass(
      "report-editor-touch-target",
    );
    expect(within(deleteModal).getByRole("button", { name: "确认删除" })).toHaveClass(
      "report-editor-touch-target",
    );
  });
});
