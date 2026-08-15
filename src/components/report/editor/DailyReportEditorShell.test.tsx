import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import DailyReportEditorShell from "./DailyReportEditorShell";

vi.mock("../../UserAvatar", () => ({
  default: () => <span>User</span>,
}));

const outlineItems = [{ href: "#section-related", label: "Related topics" }];

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

function renderShell(viewMode: boolean) {
  return render(
    <MemoryRouter initialEntries={["/conference/conf-1/report/report-1"]}>
      <DailyReportEditorShell
        viewMode={viewMode}
        toolbar={<div>Report toolbar</div>}
        outlineLabel="Report outline"
        outlineItems={outlineItems}
        status={<div>Saved</div>}
        overlays={<div>Report overlay</div>}
      >
        <article>Report document</article>
      </DailyReportEditorShell>
    </MemoryRouter>,
  );
}

it("renders the real navbar and editor slots around the document in edit mode", () => {
  const { container } = renderShell(false);

  expect(screen.getByRole("link", { name: "Conference Flow" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  expect(screen.getByText("Report toolbar")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Report outline" })).toBeInTheDocument();
  expect(screen.getByText("Saved")).toBeInTheDocument();
  expect(screen.getByText("Report overlay")).toBeInTheDocument();
  expect(screen.getByText("Report document")).toBeInTheDocument();
  expect(container.querySelector(".report-editor-workspace")).toBeInTheDocument();
});

it("renders only overlays and the document in view mode", () => {
  const { container } = renderShell(true);

  expect(screen.getByText("Report overlay")).toBeInTheDocument();
  expect(screen.getByText("Report document")).toBeInTheDocument();
  expect(screen.queryByText("Report toolbar")).not.toBeInTheDocument();
  expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Conference Flow" })).not.toBeInTheDocument();
  expect(container.querySelector(".report-view-mode")).toBeInTheDocument();
  expect(container.querySelector(".report-editor-workspace")).not.toBeInTheDocument();
});
