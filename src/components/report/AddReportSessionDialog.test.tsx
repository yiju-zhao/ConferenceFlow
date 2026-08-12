import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import AddReportSessionDialog from "./AddReportSessionDialog";
import type { Session } from "../../types";

const sessions: Session[] = [
  {
    id: "doc-a",
    code: "S101",
    title: "A",
    date: "2026-08-11",
    start: "09:00",
    end: "10:00",
    attendees: ["u1"],
  },
  {
    id: "doc-b",
    code: "S102",
    title: "B",
    date: "2026-08-12",
    start: "11:00",
    end: "12:00",
    attendees: ["u2"],
  },
];

describe("AddReportSessionDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("starts with My Sessions and can add a result from the full calendar", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <AddReportSessionDialog
        open
        sessions={sessions}
        selectedIds={new Set()}
        currentUid="u1"
        onAdd={onAdd}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "我的 Session" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全部日程" }));
    await user.type(screen.getByRole("searchbox", { name: "搜索全部日程" }), "S102");
    await user.click(screen.getByRole("button", { name: "添加 B" }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith("S102");
  });

  it("resets to My Sessions and clears the query whenever it reopens", async () => {
    const user = userEvent.setup();
    const props = {
      sessions,
      selectedIds: new Set<string>(),
      currentUid: "u1",
      onAdd: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<AddReportSessionDialog open {...props} />);

    await user.click(screen.getByRole("button", { name: "全部日程" }));
    await user.type(screen.getByRole("searchbox", { name: "搜索全部日程" }), "S102");
    expect(screen.getByText("B")).toBeInTheDocument();

    rerender(<AddReportSessionDialog open={false} {...props} />);
    rerender(<AddReportSessionDialog open {...props} />);

    expect(screen.getByRole("button", { name: "我的 Session" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("searchbox", { name: "搜索全部日程" })).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });
});
