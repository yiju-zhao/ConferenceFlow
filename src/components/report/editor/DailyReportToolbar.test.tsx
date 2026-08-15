import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import DailyReportToolbar, { type DailyReportToolbarProps } from "./DailyReportToolbar";

function makeProps(overrides: Partial<DailyReportToolbarProps> = {}): DailyReportToolbarProps {
  return {
    backTo: "/conference/conf-1/reports",
    title: "Conference daily report",
    status: "draft",
    saveState: "idle",
    presence: <span>2 人在线</span>,
    focusHint: "Track agent infrastructure",
    exporting: false,
    publishing: false,
    syncing: false,
    syncMessage: "",
    onSave: vi.fn(),
    onOpenFocus: vi.fn(),
    onPreview: vi.fn(),
    onPublish: vi.fn(),
    onExportMarkdown: vi.fn(),
    onExportEmail: vi.fn(),
    onOpenHistory: vi.fn(),
    onSync: vi.fn(),
    onDeleteSession: vi.fn(),
    ...overrides,
  };
}

function CurrentPath() {
  return <div>{useLocation().pathname}</div>;
}

function renderToolbar(props: DailyReportToolbarProps) {
  return render(
    <MemoryRouter initialEntries={["/conference/conf-1/report/report-1"]}>
      <DailyReportToolbar {...props} />
      <CurrentPath />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

it("shows primary commands and moves maintenance actions into More", async () => {
  const user = userEvent.setup();
  const props = makeProps();
  const { container } = renderToolbar(props);

  expect(container.querySelector(".report-editor-toolbar")).toHaveClass("no-print");
  expect(screen.getByRole("button", { name: "保存" })).toBeVisible();
  expect(screen.getByRole("button", { name: "我的关注方向" })).toHaveClass(
    "report-editor-desktop-only",
  );
  expect(screen.getByRole("button", { name: "预览" })).toBeVisible();
  expect(screen.queryByText("版本历史")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "更多" }));

  expect(screen.getByRole("menuitem", { name: "我的关注方向" })).toHaveClass(
    "report-editor-mobile-only",
  );
  expect(screen.getByRole("menuitem", { name: "版本历史" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "更新 Session 信息" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "删除 Session" })).toBeVisible();

  await user.click(screen.getByRole("menuitem", { name: "版本历史" }));
  expect(props.onOpenHistory).toHaveBeenCalledOnce();
});

it("announces save state and invokes export actions", async () => {
  const user = userEvent.setup();
  const props = makeProps({ saveState: "saved" });
  renderToolbar(props);

  expect(screen.getByRole("status")).toHaveTextContent("已保存");
  await user.click(screen.getByRole("button", { name: "导出" }));
  await user.click(screen.getByRole("menuitem", { name: "导出 Markdown" }));
  expect(props.onExportMarkdown).toHaveBeenCalledOnce();
});

it("marks portalled command menus for toolbar touch-target styling", async () => {
  const user = userEvent.setup();
  renderToolbar(makeProps());

  await user.click(screen.getByRole("button", { name: "导出" }));
  expect(
    screen.getByRole("menuitem", { name: "导出 Markdown" }).closest("[role=menu]"),
  ).toHaveClass("report-editor-toolbar-menu");

  await user.click(screen.getByRole("button", { name: "导出" }));
  await user.click(screen.getByRole("button", { name: "更多" }));
  expect(screen.getByRole("menuitem", { name: "版本历史" }).closest("[role=menu]")).toHaveClass(
    "report-editor-toolbar-menu",
  );
});

it("navigates back and preserves disabled command states", async () => {
  const user = userEvent.setup();
  const props = makeProps({ publishing: true, syncing: true });
  renderToolbar(props);

  await user.click(screen.getByRole("button", { name: "报告列表" }));
  expect(screen.getByText("/conference/conf-1/reports")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "导出" }));
  expect(screen.getByRole("menuitem", { name: "分享中..." })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await user.click(screen.getByRole("button", { name: "更多" }));
  expect(screen.getByRole("menuitem", { name: "更新中..." })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
