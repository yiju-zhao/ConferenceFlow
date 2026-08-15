import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import TranscriptControl from "./TranscriptControl";
import type { TranscriptSourceActions } from "../../../hooks/useTranscriptSource";
import type { TranscriptRef } from "../../../types";

const currentTranscript: TranscriptRef = {
  storagePath: "conference-transcripts/conf-1/r1/S101/old.txt",
  fileName: "old.txt",
  format: "txt",
  contentHash: "a".repeat(64),
  uploadedBy: "u1",
  uploadedAt: 1,
};

function transcriptActions(
  overrides: Partial<TranscriptSourceActions> = {},
): TranscriptSourceActions {
  return {
    busy: false,
    error: null,
    saveFile: vi.fn().mockResolvedValue(currentTranscript),
    savePaste: vi.fn().mockResolvedValue(currentTranscript),
    loadText: vi.fn().mockResolvedValue(""),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("TranscriptControl", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("offers paste and upload when no private transcript exists", () => {
    render(<TranscriptControl transcriptRef={null} actions={transcriptActions()} />);
    expect(screen.getByRole("button", { name: "粘贴转录文字" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传转录文字" })).toBeInTheDocument();
  });

  it("shows the current file and lifecycle actions", () => {
    render(<TranscriptControl transcriptRef={currentTranscript} actions={transcriptActions()} />);
    expect(screen.getByText("old.txt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看转录文字" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "替换转录文字" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除转录文字" })).toBeInTheDocument();
  });

  it("gives every transcript modal action the shared editor touch-target contract", async () => {
    const user = userEvent.setup();
    const actions = transcriptActions({ loadText: vi.fn().mockResolvedValue("私有原文") });
    const { container, rerender } = render(
      <TranscriptControl transcriptRef={currentTranscript} actions={actions} />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["新内容"], "new.txt", { type: "text/plain" }));
    let dialog = screen.getByRole("dialog", { name: "替换转录文字" });
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveClass(
      "report-editor-touch-target",
    );
    expect(within(dialog).getByRole("button", { name: "确认替换" })).toHaveClass(
      "report-editor-touch-target",
    );
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    await user.click(screen.getByRole("button", { name: "查看转录文字" }));
    dialog = await screen.findByRole("dialog", { name: "转录文字" });
    expect(within(dialog).getByRole("button", { name: "关闭" })).toHaveClass(
      "report-editor-touch-target",
    );
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));

    await user.click(screen.getByRole("button", { name: "删除转录文字" }));
    dialog = screen.getByRole("dialog", { name: "删除转录文字" });
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveClass(
      "report-editor-touch-target",
    );
    expect(within(dialog).getByRole("button", { name: "确认删除" })).toHaveClass(
      "report-editor-touch-target",
    );
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    rerender(<TranscriptControl transcriptRef={null} actions={actions} />);
    await user.click(screen.getByRole("button", { name: "粘贴转录文字" }));
    dialog = screen.getByRole("dialog", { name: "粘贴转录文字" });
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveClass(
      "report-editor-touch-target",
    );
    expect(within(dialog).getByRole("button", { name: "确认" })).toHaveClass(
      "report-editor-touch-target",
    );
  });

  it("reveals private text only after View and confirms deletion", async () => {
    const user = userEvent.setup();
    const actions = transcriptActions({ loadText: vi.fn().mockResolvedValue("私有原文") });
    render(<TranscriptControl transcriptRef={currentTranscript} actions={actions} />);

    expect(screen.queryByText("私有原文")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看转录文字" }));
    expect(await screen.findByText("私有原文")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "删除转录文字" }));
    expect(actions.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(actions.remove).toHaveBeenCalledOnce();
  });

  it("labels, focuses, traps, and restores focus for the paste dialog", async () => {
    const user = userEvent.setup();
    const actions = transcriptActions();
    const { rerender } = render(<TranscriptControl transcriptRef={null} actions={actions} />);
    const launcher = screen.getByRole("button", { name: "粘贴转录文字" });

    await user.click(launcher);

    expect(screen.getByRole("dialog", { name: "粘贴转录文字" })).toBeInTheDocument();
    const textbox = screen.getByRole("textbox", { name: "粘贴转录文字" });
    expect(textbox).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "确认" })).toHaveFocus();
    await user.tab();
    expect(textbox).toHaveFocus();

    rerender(<TranscriptControl transcriptRef={null} actions={{ ...actions, busy: true }} />);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "粘贴转录文字" })).toBeInTheDocument();

    rerender(<TranscriptControl transcriptRef={null} actions={actions} />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "粘贴转录文字" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("focuses the safe action in delete confirmation and restores its launcher", async () => {
    const user = userEvent.setup();
    render(<TranscriptControl transcriptRef={currentTranscript} actions={transcriptActions()} />);
    const launcher = screen.getByRole("button", { name: "删除转录文字" });

    await user.click(launcher);

    expect(screen.getByRole("dialog", { name: "删除转录文字" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "确认删除" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "删除转录文字" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("labels and focuses the transcript view dialog", async () => {
    const user = userEvent.setup();
    render(
      <TranscriptControl
        transcriptRef={currentTranscript}
        actions={transcriptActions({ loadText: vi.fn().mockResolvedValue("私有原文") })}
      />,
    );
    const launcher = screen.getByRole("button", { name: "查看转录文字" });

    await user.click(launcher);

    expect(await screen.findByRole("dialog", { name: "转录文字" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "转录文字" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("requires confirmation before replacing the current private source", async () => {
    const user = userEvent.setup();
    const actions = transcriptActions();
    const { container } = render(
      <TranscriptControl transcriptRef={currentTranscript} actions={actions} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, new File(["新内容"], "new.txt", { type: "text/plain" }));
    expect(actions.saveFile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认替换" }));
    expect(actions.saveFile).toHaveBeenCalledOnce();
  });

  it.each([
    ["unsupported transcript format", "仅支持 .txt、.md、.srt、.vtt 格式的转录文字。"],
    ["transcript must be valid UTF-8", "转录文字必须是有效的 UTF-8 编码。"],
    ["empty transcript", "转录文字不能为空。"],
    ["transcript exceeds 500000 code points", "转录文字不能超过 500,000 个 Unicode 字符。"],
    ["storage/object-not-found: private detail", "转录文字操作失败，请重试。"],
  ])("maps %s to a safe localized correction", (error, expected) => {
    render(<TranscriptControl transcriptRef={null} actions={transcriptActions({ error })} />);
    expect(screen.getByRole("alert")).toHaveTextContent(expected);
  });

  it("does not render in read-only or public mode", () => {
    const { container } = render(
      <TranscriptControl
        transcriptRef={currentTranscript}
        actions={transcriptActions()}
        readOnly
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
