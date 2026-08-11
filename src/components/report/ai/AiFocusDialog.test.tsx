import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import AiFocusDialog from "./AiFocusDialog";

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

it("preserves multiline focus and saves only after confirmation", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<AiFocusDialog open value="关注成本" onSave={onSave} onClose={vi.fn()} />);
  const textbox = screen.getByRole("textbox", { name: "我的关注方向" });
  await user.clear(textbox);
  await user.type(textbox, "部署成本{enter}生态合作");
  expect(onSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "保存关注方向" }));
  expect(onSave).toHaveBeenCalledWith("部署成本\n生态合作");
});

it("focuses and contains the dialog, closes on Escape, and restores the launcher", async () => {
  const user = userEvent.setup();
  const launcher = document.createElement("button");
  launcher.textContent = "打开关注方向";
  document.body.append(launcher);
  launcher.focus();
  const onClose = vi.fn();
  const props = { value: "关注成本", onSave: vi.fn().mockResolvedValue(undefined), onClose };
  const { rerender } = render(<AiFocusDialog open {...props} />);

  const dialog = screen.getByRole("dialog", { name: "我的关注方向" });
  const textbox = screen.getByRole("textbox", { name: "我的关注方向" });
  expect(dialog).toBeInTheDocument();
  expect(textbox).toHaveFocus();

  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "保存关注方向" })).toHaveFocus();
  await user.tab();
  expect(textbox).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
  rerender(<AiFocusDialog open={false} {...props} />);
  expect(launcher).toHaveFocus();
  launcher.remove();
});

it("does not close on Escape while saving", async () => {
  const user = userEvent.setup();
  let resolveSave: (() => void) | undefined;
  const onSave = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
  );
  const onClose = vi.fn();
  render(<AiFocusDialog open value="关注成本" onSave={onSave} onClose={onClose} />);

  await user.click(screen.getByRole("button", { name: "保存关注方向" }));
  expect(screen.getByRole("button", { name: "保存关注方向" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(onClose).not.toHaveBeenCalled();

  resolveSave?.();
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
