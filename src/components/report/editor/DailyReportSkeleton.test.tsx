import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import DailyReportSkeleton from "./DailyReportSkeleton";

vi.mock("../../UserAvatar", () => ({
  default: () => <span aria-hidden="true" />,
}));

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

it("mirrors the editor shell while report data loads", () => {
  render(
    <MemoryRouter initialEntries={["/conference/conf-1/report/report-1"]}>
      <DailyReportSkeleton />
    </MemoryRouter>,
  );

  const status = screen.getByRole("status", { name: "正在加载日报编辑器" });
  expect(status).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("link", { name: "Conference Flow" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  expect(status.querySelector(".report-skeleton-toolbar")).toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-outline")).toBeInTheDocument();
  expect(status.querySelectorAll(".report-skeleton-session")).toHaveLength(3);
});

it("omits editor chrome in view mode", () => {
  render(
    <MemoryRouter initialEntries={["/view/report/report-1"]}>
      <DailyReportSkeleton viewMode />
    </MemoryRouter>,
  );

  const status = screen.getByRole("status", { name: "正在加载日报" });
  expect(screen.queryByRole("link", { name: "Conference Flow" })).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-toolbar")).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-outline")).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-document")).toBeInTheDocument();
});

it("marks editor-only skeleton chrome as non-printing", () => {
  render(
    <MemoryRouter initialEntries={["/conference/conf-1/report/report-1"]}>
      <DailyReportSkeleton />
    </MemoryRouter>,
  );

  const status = screen.getByRole("status", { name: "正在加载日报编辑器" });
  expect(screen.getByRole("navigation").parentElement).toHaveClass("no-print");
  expect(status.querySelector(".report-skeleton-toolbar")).toHaveClass("no-print");
  expect(status.querySelector(".report-skeleton-outline")).toHaveClass("no-print");
});
