import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import AiGenerationDialog from "./AiGenerationDialog";

describe("AiGenerationDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("starts with rewrite and only offers append when available", () => {
    const { rerender } = render(
      <AiGenerationDialog
        open
        availableModes={["rewrite"]}
        focus="关注成本"
        busy={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "改写" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "关闭" })).toHaveTextContent("关闭");
    expect(screen.queryByRole("button", { name: "追加" })).not.toBeInTheDocument();

    rerender(
      <AiGenerationDialog
        open
        availableModes={["rewrite", "append"]}
        focus="关注成本"
        busy={false}
        onGenerate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("returns the selected mode and optional instruction", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <AiGenerationDialog
        open
        availableModes={["rewrite", "append"]}
        focus=""
        busy={false}
        onGenerate={onGenerate}
        onClose={vi.fn()}
      />,
    );

    const focus = screen.getByRole("textbox", { name: "当前关注方向" });
    expect(focus).toHaveValue("");
    expect(focus).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.type(screen.getByRole("textbox", { name: "生成说明（可选）" }), "突出成本");
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));

    expect(onGenerate).toHaveBeenCalledWith({ mode: "append", instruction: "突出成本" });
  });

  it("disables generation while busy and resets local setup when reopened", async () => {
    const user = userEvent.setup();
    const props = {
      availableModes: ["rewrite", "append"] as const,
      focus: "关注成本",
      busy: false,
      onGenerate: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<AiGenerationDialog open {...props} />);
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.type(screen.getByRole("textbox", { name: "生成说明（可选）" }), "强调成本");

    rerender(<AiGenerationDialog open {...props} busy />);
    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();

    rerender(<AiGenerationDialog open={false} {...props} />);
    rerender(<AiGenerationDialog open {...props} />);
    expect(screen.getByRole("button", { name: "改写" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "生成说明（可选）" })).toHaveValue("");
  });

  it("keeps cancellation available while preparing and renders errors inside the dialog", () => {
    render(
      <AiGenerationDialog
        open
        availableModes={["rewrite", "append"]}
        focus="关注成本"
        busy={false}
        preparing
        error="生成候选内容失败，请重试。"
        onGenerate={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("button", { name: "改写" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "生成说明（可选）" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "关闭" })).toBeEnabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("生成候选内容失败，请重试。");
  });

  it("focuses setup, traps Tab, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const launcher = document.createElement("button");
    launcher.textContent = "启动生成";
    document.body.append(launcher);
    launcher.focus();
    const onClose = vi.fn();
    const props = {
      availableModes: ["rewrite", "append"] as const,
      focus: "关注成本",
      busy: false,
      onGenerate: vi.fn(),
      onClose,
    };
    const { rerender } = render(<AiGenerationDialog open {...props} />);

    expect(screen.getByRole("button", { name: "改写" })).toHaveFocus();
    screen.getByRole("button", { name: "生成候选内容" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<AiGenerationDialog open={false} {...props} />);
    expect(launcher).toHaveFocus();
    launcher.remove();
  });
});
