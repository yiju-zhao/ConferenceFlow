import { render, screen } from "@testing-library/react";
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
