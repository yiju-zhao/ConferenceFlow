import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import DailyReportOutline from "./DailyReportOutline";

const items = [
  {
    href: "#section-related",
    label: "相关议题",
    children: [
      {
        href: "#topic-ai",
        label: "AI",
        accent: true,
        children: [{ href: "#session-S1", label: "S1 · Agent Workflow" }],
      },
    ],
  },
  { href: "#section-rumors", label: "圈内声音" },
];

it("renders every outline level as an anchor", () => {
  const { container } = render(<DailyReportOutline label="日报目录" items={items} />);
  expect(container.querySelector(".report-editor-outline")).toHaveClass("no-print");
  expect(container.querySelector(".report-editor-outline-mobile")).toHaveClass("no-print");
  expect(screen.getAllByRole("link", { name: "相关议题" })[0]).toHaveAttribute(
    "href",
    "#section-related",
  );
  expect(screen.getAllByRole("link", { name: "AI" })[0]).toHaveAttribute("href", "#topic-ai");
  expect(screen.getAllByRole("link", { name: "S1 · Agent Workflow" })[0]).toHaveAttribute(
    "href",
    "#session-S1",
  );
});

it("opens and closes the mobile disclosure", async () => {
  const user = userEvent.setup();
  render(<DailyReportOutline label="日报目录" items={items} />);
  const button = screen.getByRole("button", { name: "日报目录" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  await user.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getAllByRole("link", { name: "圈内声音" }).at(-1)!);
  expect(button).toHaveAttribute("aria-expanded", "false");
});
