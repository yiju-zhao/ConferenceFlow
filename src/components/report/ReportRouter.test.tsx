import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import ReportRouter from "./ReportRouter";

vi.mock("./DailyReport", () => {
  const pendingReport = new Promise<never>(() => {});
  return {
    default: () => {
      throw pendingReport;
    },
  };
});

vi.mock("../UserAvatar", () => ({
  default: () => <span aria-hidden="true" />,
}));

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

it("uses the view-mode fallback while a preview report module loads", async () => {
  render(
    <MemoryRouter initialEntries={["/conference/conf-1/report/report-1?preview=1"]}>
      <Routes>
        <Route path="/conference/:confId/report/:reportId" element={<ReportRouter />} />
      </Routes>
    </MemoryRouter>,
  );

  const status = await screen.findByRole("status", { name: "正在加载日报" });
  expect(screen.queryByRole("link", { name: "Conference Flow" })).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-toolbar")).not.toBeInTheDocument();
  expect(status.querySelector(".report-skeleton-outline")).not.toBeInTheDocument();
});
