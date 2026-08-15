import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import type {
  GenerateRequest,
  GenerateResponse,
  TemplateField,
  TranscriptRef,
} from "../../../types";
import { hashFieldValue } from "../../../lib/ai-report/hash";
import SessionAiSection from "./SessionAiSection";
import type { GenerationPhase } from "./useAiGeneration";

const generate = vi.fn<(request: GenerateRequest) => Promise<void>>();
const generation = {
  phase: "idle" as GenerationPhase,
  response: null as GenerateResponse | null,
  error: null,
  retryable: false,
  generate,
  regenerate: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
};
const transcriptActions = {
  busy: false,
  error: null,
  saveFile: vi.fn(),
  savePaste: vi.fn(),
  loadText: vi.fn(),
  remove: vi.fn(),
};

vi.mock("./useAiGeneration", () => ({ useAiGeneration: () => generation }));
vi.mock("../../../hooks/useTranscriptSource", () => ({
  useTranscriptSource: () => transcriptActions,
}));

const takeawaysField: TemplateField = {
  id: "takeaways",
  label: "关键收获",
  description: "",
  type: "rich_text",
  scope: "session",
  ai: {
    enabled: true,
    allowedSources: ["transcript"],
    evidenceRequired: true,
    allowedModes: ["rewrite"],
  },
};
const insightsField: TemplateField = {
  id: "insights",
  label: "启示与分析",
  description: "",
  type: "rich_text",
  scope: "session",
  ai: {
    enabled: true,
    allowedSources: ["transcript"],
    evidenceRequired: true,
    allowedModes: ["rewrite"],
  },
};
const appendOnlyInsightsField: TemplateField = {
  ...insightsField,
  type: "bullet_list",
  ai: { ...insightsField.ai, allowedModes: ["append"] },
};
const currentTranscript: TranscriptRef = {
  storagePath: "private/S101.txt",
  fileName: "S101.txt",
  format: "txt",
  contentHash: "transcript-v1",
  uploadedBy: "u1",
  uploadedAt: 1,
};

function props(overrides: Partial<React.ComponentProps<typeof SessionAiSection>> = {}) {
  return {
    confId: "conf-1",
    reportId: "r1",
    sessionId: "S101",
    templateHash: "template-v1",
    fields: [takeawaysField, insightsField],
    focus: "关注成本",
    uid: "u1",
    transcriptRef: currentTranscript,
    flushPending: () => Promise.resolve(),
    getLatestValues: () => ({ takeaways: "", insights: "保留原值" }),
    onSaveFields: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function preview(overrides: Partial<GenerateResponse> = {}) {
  generation.phase = "preview";
  generation.response = {
    candidate: [{ fieldId: "takeaways", value: "新的收获", evidenceIds: [] }],
    insufficientFieldIds: ["insights"],
    evidence: [],
    context: {
      templateHash: "template-v1",
      transcriptHash: "transcript-v1",
      baseFieldHashes: {
        takeaways: await hashFieldValue(""),
        insights: await hashFieldValue("保留原值"),
      },
      focusUsed: "关注成本",
    },
    ...overrides,
  };
}

describe("SessionAiSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    generate.mockReset();
    Object.assign(generation, {
      phase: "idle",
      response: null,
      error: null,
      retryable: false,
      regenerate: vi.fn(),
      cancel: vi.fn(),
    });
  });

  it("disables generation without a transcript while leaving transcript controls available", () => {
    render(<SessionAiSection {...props({ transcriptRef: null })} />);
    const transcript = screen.getByRole("region", { name: "转录文字" });
    const sourceRow = transcript.closest(".ai-editor-source-row");
    const generate = screen.getByRole("button", { name: "AI 生成 Session 内容" });

    expect(sourceRow).toContainElement(transcript);
    expect(sourceRow).toContainElement(generate);
    expect(generate).toBeVisible();
    expect(generate).toHaveClass("ai-report-action--generate");
    expect(generate).toBeDisabled();
    expect(screen.getByRole("button", { name: "粘贴转录文字" })).toBeEnabled();
  });

  it("sends only the Session request contract and displays the triggering member focus", async () => {
    const user = userEvent.setup();
    render(<SessionAiSection {...props()} />);
    await user.click(screen.getByRole("button", { name: "AI 生成 Session 内容" }));
    expect(screen.getByRole("textbox", { name: "当前关注方向" })).toHaveValue("关注成本");
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    expect(generate).toHaveBeenCalledWith({ scope: "session", sessionId: "S101", mode: "rewrite" });
  });

  it("offers the union of modes supported by mixed Session fields", async () => {
    const user = userEvent.setup();
    render(<SessionAiSection {...props({ fields: [takeawaysField, appendOnlyInsightsField] })} />);

    await user.click(screen.getByRole("button", { name: "AI 生成 Session 内容" }));

    expect(screen.getByRole("button", { name: "改写" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "追加" })).toBeEnabled();
  });

  it("adopts append candidates only for the append-capable subset", async () => {
    const user = userEvent.setup();
    const onSaveFields = vi.fn().mockResolvedValue(undefined);
    const sectionProps = props({
      fields: [takeawaysField, appendOnlyInsightsField],
      getLatestValues: () => ({
        takeaways: "不支持追加的协作者新值",
        insights: ["现有分析"],
      }),
      onSaveFields,
    });
    const { rerender } = render(<SessionAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成 Session 内容" }));
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await waitFor(() =>
      expect(generate).toHaveBeenCalledWith({
        scope: "session",
        sessionId: "S101",
        mode: "append",
      }),
    );

    generation.phase = "preview";
    generation.response = {
      candidate: [{ fieldId: "insights", value: ["新增分析"], evidenceIds: [] }],
      insufficientFieldIds: [],
      evidence: [],
      context: {
        templateHash: "template-v1",
        transcriptHash: "transcript-v1",
        baseFieldHashes: { insights: await hashFieldValue(["现有分析"]) },
        focusUsed: "关注成本",
      },
    };
    rerender(<SessionAiSection {...sectionProps} />);

    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));

    expect(onSaveFields).toHaveBeenCalledWith("S101", {
      insights: ["现有分析", "新增分析"],
    });
    expect(onSaveFields.mock.calls[0][1]).not.toHaveProperty("takeaways");
  });

  it("does not adopt a candidate for a field unsupported by the selected mode", async () => {
    const user = userEvent.setup();
    const onSaveFields = vi.fn().mockResolvedValue(undefined);
    const sectionProps = props({
      fields: [takeawaysField, appendOnlyInsightsField],
      getLatestValues: () => ({ takeaways: "现有收获", insights: ["现有分析"] }),
      onSaveFields,
    });
    const { rerender } = render(<SessionAiSection {...sectionProps} />);
    await user.click(screen.getByRole("button", { name: "AI 生成 Session 内容" }));
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    await waitFor(() =>
      expect(generate).toHaveBeenCalledWith({
        scope: "session",
        sessionId: "S101",
        mode: "append",
      }),
    );

    generation.phase = "preview";
    generation.response = {
      candidate: [{ fieldId: "takeaways", value: "不应采用", evidenceIds: [] }],
      insufficientFieldIds: [],
      evidence: [],
      context: {
        templateHash: "template-v1",
        transcriptHash: "transcript-v1",
        baseFieldHashes: { insights: await hashFieldValue(["现有分析"]) },
        focusUsed: "关注成本",
      },
    };
    rerender(<SessionAiSection {...sectionProps} />);

    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));

    expect(await screen.findByText("候选内容无效，请重新生成。")).toBeInTheDocument();
    expect(onSaveFields).not.toHaveBeenCalled();
  });

  it("previews successful and insufficient Session fields", async () => {
    await preview();
    render(<SessionAiSection {...props()} />);
    expect(screen.getByText("关键收获")).toBeInTheDocument();
    expect(screen.getByText("材料不足：启示与分析")).toBeInTheDocument();
  });

  it("adopts all successful Session fields and leaves insufficient fields absent", async () => {
    const user = userEvent.setup();
    await preview();
    const onSaveFields = vi.fn().mockResolvedValue(undefined);
    render(<SessionAiSection {...props({ onSaveFields })} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(onSaveFields).toHaveBeenCalledWith("S101", { takeaways: expect.any(String) });
    expect(onSaveFields.mock.calls[0][1]).not.toHaveProperty("insights");
  });

  it.each([
    [
      "template",
      {
        context: {
          templateHash: "template-v2",
          transcriptHash: "transcript-v1",
          baseFieldHashes: { takeaways: "", insights: "" },
          focusUsed: "关注成本",
        },
      },
      {},
    ],
    ["transcript", {}, { transcriptRef: { ...currentTranscript, contentHash: "transcript-v2" } }],
    ["field", {}, { getLatestValues: () => ({ takeaways: "协作者已改", insights: "保留原值" }) }],
  ])(
    "blocks Session adoption when the %s context changed",
    async (_kind, responseOverrides, propOverrides) => {
      const user = userEvent.setup();
      await preview(responseOverrides);
      const onSaveFields = vi.fn();
      render(<SessionAiSection {...props({ ...propOverrides, onSaveFields })} />);
      await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
      expect(await screen.findByText("内容已被修改，请重新生成。")).toBeInTheDocument();
      expect(onSaveFields).not.toHaveBeenCalled();
    },
  );

  it("omits transcript actions and AI controls in read-only mode", () => {
    render(<SessionAiSection {...props({ readOnly: true })} />);
    expect(screen.queryByRole("button", { name: "AI 生成 Session 内容" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看转录文字" })).not.toBeInTheDocument();
  });
});
