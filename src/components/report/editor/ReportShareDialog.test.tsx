import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import ReportShareDialog from "./ReportShareDialog";

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

it("keeps close and copy on the shared touch contract without changing callbacks", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const onCopy = vi.fn();
  render(
    <ReportShareDialog
      url="https://example.test/report"
      copied={false}
      onClose={onClose}
      onCopy={onCopy}
    />,
  );

  const close = screen.getByRole("button", { name: "关闭" });
  const copy = screen.getByRole("button", { name: "复制链接" });
  expect(close).toHaveClass("report-editor-touch-target");
  expect(copy).toHaveClass("report-editor-touch-target");

  await user.click(copy);
  expect(onCopy).toHaveBeenCalledOnce();
  await user.click(close);
  expect(onClose).toHaveBeenCalledOnce();
});
