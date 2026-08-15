import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import { hashFieldValue } from "../../../lib/ai-report/hash";
import { blockContentHashKey } from "../../../lib/ai-report/blockTarget";
import type {
  AiBlockField,
  GenerateRequest,
  GenerateResponse,
  ReportBlock,
  TemplateField,
  TranscriptRef,
} from "../../../types";
import BlockAiSection from "./BlockAiSection";
import type { GenerationPhase } from "./useAiGeneration";

const generate = vi.fn<(request: GenerateRequest) => Promise<void>>();
const generation = {
  phase: "idle" as GenerationPhase,
  response: null as GenerateResponse | null,
  error: null as string | null,
  retryable: false,
  generate,
  regenerate: vi.fn<() => Promise<void>>(),
  cancel: vi.fn(),
  reset: vi.fn(),
};
const transcriptActions = {
  busy: false,
  error: null,
  saveFile: vi.fn(),
  savePaste: vi.fn().mockResolvedValue(undefined),
  loadText: vi.fn(),
  remove: vi.fn(),
};
const useBlockTranscriptSource = vi.fn((_options: unknown) => transcriptActions);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

vi.mock("./useAiGeneration", () => ({ useAiGeneration: () => generation }));
vi.mock("../../../hooks/useBlockTranscriptSource", () => ({
  useBlockTranscriptSource: (options: unknown) => useBlockTranscriptSource(options),
}));

const targetFieldId: AiBlockField = "onsiteInfoBlocks";
const field: TemplateField = {
  id: targetFieldId,
  label: "现场信息",
  description: "",
  type: "rich_text",
  scope: "block",
  ai: {
    enabled: true,
    instruction: "canonical secret instruction",
    allowedSources: ["current_draft", "transcript"],
    evidenceRequired: true,
    allowedModes: ["append", "rewrite"],
  },
};
const transcriptRef: TranscriptRef = {
  storagePath: "private/secret.txt",
  fileName: "secret.txt",
  format: "txt",
  contentHash: "transcript-v1",
  uploadedBy: "u1",
  uploadedAt: 1,
};

function body(overrides: Partial<ReportBlock> = {}): ReportBlock {
  return {
    id: "b1",
    type: "body",
    content: "<p>当前内容</p>",
    transcriptRef,
    ownerId: "owner-private",
    sourceSessions: [{ id: "S-private", manual: "private" }],
    ...overrides,
  };
}

function props(overrides: Partial<React.ComponentProps<typeof BlockAiSection>> = {}) {
  const block = overrides.block ?? body();
  return {
    confId: "conf-1",
    reportId: "report-1",
    targetFieldId,
    templateHash: "template-v1",
    field,
    block,
    focus: "private focus",
    uid: "u1",
    flushPending: vi.fn().mockResolvedValue(undefined),
    getLatestBlock: () => block,
    commitTranscript: vi.fn().mockResolvedValue(undefined),
    onSaveContent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function responseFor(
  latest: ReportBlock,
  overrides: Partial<GenerateResponse> = {},
): Promise<GenerateResponse> {
  const key = blockContentHashKey(targetFieldId, "b1");
  return {
    candidate: [{ fieldId: targetFieldId, value: "新的内容", evidenceIds: [] }],
    insufficientFieldIds: [],
    evidence: [],
    context: {
      templateHash: "template-v1",
      transcriptHash: latest.transcriptRef?.contentHash,
      baseFieldHashes: { [key]: await hashFieldValue(latest.content ?? "") },
      focusUsed: "private focus",
      blockTarget: { targetFieldId, blockId: "b1" },
    },
    ...overrides,
  };
}

async function setPreview(latest = body(), overrides: Partial<GenerateResponse> = {}) {
  generation.phase = "preview";
  generation.response = await responseFor(latest, overrides);
}

describe("BlockAiSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    generate.mockReset();
    generate.mockResolvedValue(undefined);
    useBlockTranscriptSource.mockClear();
    transcriptActions.savePaste.mockClear();
    Object.assign(generation, {
      phase: "idle",
      response: null,
      error: null,
      retryable: false,
      regenerate: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(() => {
        generation.phase = "idle";
        generation.response = null;
      }),
    });
  });

  it.each([
    ["wrong field", { field: { ...field, id: "reflectionsBlocks" } }],
    ["wrong scope", { field: { ...field, scope: "daily" as const } }],
    ["wrong type", { field: { ...field, type: "short_text" as const } }],
    ["disabled", { field: { ...field, ai: { ...field.ai, enabled: false } } }],
    ["no applicable mode", { field: { ...field, ai: { ...field.ai, allowedModes: [] } } }],
    ["read only", { readOnly: true }],
  ])("renders no controls when %s", (_label, overrides) => {
    render(<BlockAiSection {...props(overrides)} />);
    expect(screen.queryByRole("button", { name: "AI 生成此内容块" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "转录文字" })).not.toBeInTheDocument();
  });

  it("binds the exact Block transcript identity and passes the returned actions to the control", async () => {
    const user = userEvent.setup();
    const commitTranscript = vi.fn().mockResolvedValue(undefined);
    const sectionProps = props({ block: body({ transcriptRef: null }), commitTranscript });
    render(<BlockAiSection {...sectionProps} />);

    expect(useBlockTranscriptSource).toHaveBeenCalledWith({
      confId: "conf-1",
      reportId: "report-1",
      targetFieldId,
      blockId: "b1",
      current: null,
      uid: "u1",
      commitReference: commitTranscript,
    });
    await user.click(screen.getByRole("button", { name: "粘贴转录文字" }));
    await user.type(screen.getByRole("textbox"), "source text");
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(transcriptActions.savePaste).toHaveBeenCalledWith("source text");
  });

  it.each([
    ["draft only", body({ transcriptRef: null }), false],
    ["transcript only", body({ content: "" }), false],
    ["no source", body({ content: "<p><br></p>", transcriptRef: null }), true],
  ])("handles %s generation availability", (_label, block, disabled) => {
    render(<BlockAiSection {...props({ block })} />);
    const transcript = screen.getByRole("region", { name: "转录文字" });
    const sourceRow = transcript.closest(".ai-editor-source-row");
    const generate = screen.getByRole("button", { name: "AI 生成此内容块" });

    expect(sourceRow).toContainElement(transcript);
    expect(sourceRow).toContainElement(generate);
    expect(generate).toBeVisible();
    expect(generate).toHaveClass("ai-report-action--generate");
    expect(generate).toHaveProperty("disabled", disabled);
    expect(screen.queryByText("请先填写当前内容块或上传转录文字。")).toBe(
      disabled ? screen.getByText("请先填写当前内容块或上传转录文字。") : null,
    );
  });

  it("offers body modes in canonical rewrite/append order and heading rewrite only", async () => {
    const user = userEvent.setup();
    const sectionProps = props();
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    const bodyModes = screen.getByLabelText("生成方式").querySelectorAll("button:not([disabled])");
    expect(Array.from(bodyModes, (button) => button.textContent)).toEqual(["改写", "追加"]);

    await user.click(screen.getByRole("button", { name: "取消" }));
    rerender(<BlockAiSection {...props({ block: body({ type: "heading" }) })} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    expect(screen.getByRole("button", { name: "改写" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "追加" })).not.toBeInTheDocument();
  });

  it("flushes before sending only the exact trimmed Block request", async () => {
    const user = userEvent.setup();
    const flushPending = vi.fn().mockResolvedValue(undefined);
    render(<BlockAiSection {...props({ flushPending })} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.type(screen.getByRole("textbox", { name: "生成说明（可选）" }), "  request only  ");
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));

    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
    expect(flushPending.mock.invocationCallOrder[0]).toBeLessThan(
      generate.mock.invocationCallOrder[0],
    );
    expect(generate).toHaveBeenCalledWith({
      scope: "block",
      targetFieldId,
      blockId: "b1",
      mode: "rewrite",
      instruction: "request only",
    });
    expect(JSON.stringify(generate.mock.calls[0][0])).not.toMatch(
      /canonical secret|private focus|当前内容|secret\.txt|owner-private|S-private/,
    );
  });

  it("shows an initial flush failure inside the active setup dialog", async () => {
    const user = userEvent.setup();
    render(
      <BlockAiSection
        {...props({ flushPending: vi.fn().mockRejectedValue(new Error("private path")) })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "生成候选内容失败，请重试。",
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("invalidates a pending initial flush when cancelled", async () => {
    const user = userEvent.setup();
    const firstFlush = deferred();
    const flushPending = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstFlush.promise)
      .mockResolvedValueOnce(undefined);
    render(<BlockAiSection {...props({ flushPending })} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    await act(async () => firstFlush.resolve());

    expect(generate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await waitFor(() =>
      expect(generate).toHaveBeenCalledWith({
        scope: "block",
        targetFieldId,
        blockId: "b1",
        mode: "rewrite",
      }),
    );
  });

  it("ignores a double submit while the initial flush is pending", async () => {
    const pendingFlush = deferred();
    const flushPending = vi.fn(() => pendingFlush.promise);
    render(<BlockAiSection {...props({ flushPending })} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    const submit = screen.getByRole("button", { name: "生成候选内容" });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(flushPending).toHaveBeenCalledOnce();
    await act(async () => pendingFlush.resolve());
    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
  });

  it("keeps the winning generated request mode for adoption", async () => {
    const user = userEvent.setup();
    const pendingFlush = deferred();
    const latest = body({ content: "<p>Latest</p>" });
    const sectionProps = props({
      flushPending: vi.fn(() => pendingFlush.promise),
      getLatestBlock: () => latest,
    });
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "追加" }));
    const submit = screen.getByRole("button", { name: "生成候选内容" });
    fireEvent.click(submit);
    fireEvent.click(screen.getByRole("button", { name: "改写" }));
    fireEvent.click(submit);
    await act(async () => pendingFlush.resolve());
    await waitFor(() =>
      expect(generate).toHaveBeenCalledWith({
        scope: "block",
        targetFieldId,
        blockId: "b1",
        mode: "append",
      }),
    );
    expect(generate).toHaveBeenCalledOnce();

    await setPreview(latest, {
      candidate: [{ fieldId: targetFieldId, value: "Candidate", evidenceIds: [] }],
    });
    rerender(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    await waitFor(() =>
      expect(sectionProps.onSaveContent).toHaveBeenCalledWith(
        "<p>Latest</p><p><br></p><p>Candidate</p>",
      ),
    );
  });

  it("invalidates a pending initial flush on unmount", async () => {
    const pendingFlush = deferred();
    const flushPending = vi.fn(() => pendingFlush.promise);
    const { unmount } = render(<BlockAiSection {...props({ flushPending })} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    fireEvent.click(screen.getByRole("button", { name: "生成候选内容" }));

    unmount();
    await act(async () => pendingFlush.resolve());

    expect(generate).not.toHaveBeenCalled();
  });

  it("flushes before regenerate, preserves the modal on failure, and cancel resets generation", async () => {
    const user = userEvent.setup();
    await setPreview();
    render(
      <BlockAiSection
        {...props({ flushPending: vi.fn().mockRejectedValue(new Error("private path")) })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "重新生成" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("生成候选内容失败，请重试。");
    expect(generation.regenerate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(generation.cancel).toHaveBeenCalledOnce();
  });

  it("awaits a successful flush before regenerating", async () => {
    const user = userEvent.setup();
    await setPreview();
    const flushPending = vi.fn().mockResolvedValue(undefined);
    render(<BlockAiSection {...props({ flushPending })} />);

    await user.click(screen.getByRole("button", { name: "重新生成" }));

    await waitFor(() => expect(generation.regenerate).toHaveBeenCalledOnce());
    expect(flushPending.mock.invocationCallOrder[0]).toBeLessThan(
      generation.regenerate.mock.invocationCallOrder[0],
    );
  });

  it("invalidates a pending regeneration flush when the candidate is cancelled", async () => {
    const user = userEvent.setup();
    const pendingFlush = deferred();
    await setPreview();
    render(<BlockAiSection {...props({ flushPending: vi.fn(() => pendingFlush.promise) })} />);
    await user.click(screen.getByRole("button", { name: "重新生成" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    await act(async () => pendingFlush.resolve());

    expect(generation.regenerate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    [
      "template hash",
      async (latest: ReportBlock) =>
        responseFor(latest, {
          context: { ...(await responseFor(latest)).context, templateHash: "other" },
        }),
    ],
    [
      "target field",
      async (latest: ReportBlock) =>
        responseFor(latest, {
          context: {
            ...(await responseFor(latest)).context,
            blockTarget: { targetFieldId: "reflectionsBlocks", blockId: "b1" },
          },
        }),
    ],
    [
      "Block ID",
      async (latest: ReportBlock) =>
        responseFor(latest, {
          context: {
            ...(await responseFor(latest)).context,
            blockTarget: { targetFieldId, blockId: "other" },
          },
        }),
    ],
    [
      "Transcript hash",
      async (latest: ReportBlock) =>
        responseFor(latest, {
          context: { ...(await responseFor(latest)).context, transcriptHash: "other" },
        }),
    ],
    ["missing latest Block", async (latest: ReportBlock) => responseFor(latest)],
    ["wrong-identity latest Block", async (latest: ReportBlock) => responseFor(latest)],
    ["wrong-kind latest Block", async (latest: ReportBlock) => responseFor(latest)],
    [
      "content hash",
      async (latest: ReportBlock) =>
        responseFor(latest, {
          context: {
            ...(await responseFor(latest)).context,
            baseFieldHashes: { [blockContentHashKey(targetFieldId, "b1")]: "other" },
          },
        }),
    ],
  ])("rejects stale %s without saving", async (kind, makeResponse) => {
    const user = userEvent.setup();
    const latest =
      kind === "wrong-kind latest Block"
        ? body({ type: "heading" })
        : kind === "wrong-identity latest Block"
          ? body({ id: "b2" })
          : body();
    generation.phase = "preview";
    generation.response = await makeResponse(body());
    const onSaveContent = vi.fn();
    render(
      <BlockAiSection
        {...props({
          getLatestBlock: () => (kind === "missing latest Block" ? undefined : latest),
          onSaveContent,
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前内容块或转录文字已更新，请重新生成。",
    );
    expect(onSaveContent).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each([
    ["zero", []],
    [
      "multiple",
      [
        { fieldId: targetFieldId, value: "A", evidenceIds: [] },
        { fieldId: "reflectionsBlocks", value: "B", evidenceIds: [] },
      ],
    ],
    ["wrong field", [{ fieldId: "reflectionsBlocks", value: "A", evidenceIds: [] }]],
    ["non-string", [{ fieldId: targetFieldId, value: ["A"], evidenceIds: [] }]],
  ])("rejects %s candidates without saving", async (_kind, candidate) => {
    const user = userEvent.setup();
    const latest = body();
    await setPreview(latest, { candidate: candidate as GenerateResponse["candidate"] });
    const onSaveContent = vi.fn();
    render(<BlockAiSection {...props({ getLatestBlock: () => latest, onSaveContent })} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("生成候选内容失败，请重试。");
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it("adopts a body rewrite as safe rich-text and passes only one string argument", async () => {
    const user = userEvent.setup();
    const latest = body();
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    const sectionProps = props({ getLatestBlock: () => latest, onSaveContent });
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await setPreview(latest, {
      candidate: [{ fieldId: targetFieldId, value: "new <b>", evidenceIds: [] }],
    });
    rerender(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalledWith("<p>new &lt;b&gt;</p>"));
    expect(onSaveContent.mock.calls[0]).toHaveLength(1);
    expect(generation.cancel).toHaveBeenCalledOnce();
  });

  it("guards a pending adoption from duplicate saves", async () => {
    const user = userEvent.setup();
    const latest = body();
    let finishSave: (() => void) | undefined;
    const onSaveContent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const sectionProps = props({ getLatestBlock: () => latest, onSaveContent });
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await setPreview(latest);
    rerender(<BlockAiSection {...sectionProps} />);
    const adopt = screen.getByRole("button", { name: "采纳候选内容" });

    await user.click(adopt);
    expect(adopt).toBeDisabled();
    await user.click(adopt);
    expect(onSaveContent).toHaveBeenCalledOnce();

    finishSave?.();
    await waitFor(() => expect(generation.cancel).toHaveBeenCalledOnce());
  });

  it("adopts body append against latest collaborator content", async () => {
    const user = userEvent.setup();
    const rendered = body({ content: "old" });
    const latest = body({ content: "<p>Collaborator</p>" });
    const sectionProps = props({ block: rendered, getLatestBlock: () => latest });
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await setPreview(latest, {
      candidate: [{ fieldId: targetFieldId, value: "New", evidenceIds: [] }],
    });
    rerender(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    await waitFor(() =>
      expect(sectionProps.onSaveContent).toHaveBeenCalledWith(
        "<p>Collaborator</p><p><br></p><p>New</p>",
      ),
    );
  });

  it("adopts a heading as plain text and never exposes append", async () => {
    const user = userEvent.setup();
    const latest = body({ type: "heading", content: "Old heading" });
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    const sectionProps = props({ block: latest, getLatestBlock: () => latest, onSaveContent });
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await setPreview(latest, {
      candidate: [{ fieldId: targetFieldId, value: "Plain heading", evidenceIds: [] }],
    });
    rerender(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalledWith("Plain heading"));
    expect(onSaveContent).not.toHaveBeenCalledWith(expect.stringContaining("<p>"));
  });

  it("uses the latest Transcript hash and normalized scalar under the exact Block key", async () => {
    const user = userEvent.setup();
    const latest = body({
      content: undefined as unknown as string,
      transcriptRef: { ...transcriptRef, contentHash: "transcript-v2" },
    });
    const onSaveContent = vi.fn().mockResolvedValue(undefined);
    const sectionProps = props({ getLatestBlock: () => latest, onSaveContent });
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await setPreview(latest);
    rerender(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    await waitFor(() => expect(onSaveContent).toHaveBeenCalledWith("<p>新的内容</p>"));
  });

  it("keeps the candidate open with a safe error when saving fails", async () => {
    const user = userEvent.setup();
    const latest = body();
    const sectionProps = props({
      getLatestBlock: () => latest,
      onSaveContent: vi.fn().mockRejectedValue(new Error("private backend detail")),
    });
    const { rerender } = render(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成此内容块" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await setPreview(latest);
    rerender(<BlockAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("生成候选内容失败，请重试。");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("private backend detail")).not.toBeInTheDocument();
  });
});
