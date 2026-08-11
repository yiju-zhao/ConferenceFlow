import { render, screen } from "@testing-library/react";
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
