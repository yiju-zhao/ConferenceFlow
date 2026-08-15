import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import ReportSessionCollapseButton from "./ReportSessionCollapseButton";

describe("ReportSessionCollapseButton", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("exposes collapse state through an explicit button", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ReportSessionCollapseButton
        collapsed={false}
        sessionLabel="S1 · Agent Workflow"
        onToggle={onToggle}
      />,
    );

    const button = screen.getByRole("button", { name: "收起 S1 · Agent Workflow" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
