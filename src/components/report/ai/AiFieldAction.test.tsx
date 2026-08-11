import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import type { GenerateRequest, GenerateResponse, TemplateField } from "../../../types";
import { hashFieldValue } from "../../../lib/ai-report/hash";
import AiFieldAction from "./AiFieldAction";
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

vi.mock("./useAiGeneration", () => ({
  useAiGeneration: () => generation,
}));

const summaryPointsField: TemplateField = {
  id: "summaryPoints",
  label: "核心要点",
  description: "",
  type: "bullet_list",
  scope: "daily",
  ai: {
    enabled: true,
    allowedSources: ["report_content"],
    evidenceRequired: true,
    allowedModes: ["rewrite", "append"],
  },
};

function response(): GenerateResponse {
  return {
    candidate: [{ fieldId: "summaryPoints", value: ["新的要点"], evidenceIds: [] }],
    insufficientFieldIds: [],
    evidence: [],
    context: { templateHash: "template-v1", baseFieldHashes: {}, focusUsed: "关注成本" },
  };
}

async function preview(base = ["旧值"]) {
  generation.phase = "preview";
  generation.response = {
    ...response(),
    context: {
      ...response().context,
      baseFieldHashes: { summaryPoints: await hashFieldValue(base) },
    },
  };
}

describe("AiFieldAction", () => {
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

  it("flushes manual edits before it starts daily generation", async () => {
    const user = userEvent.setup();
    let releaseFlush!: () => void;
    const flushPending = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseFlush = resolve;
        }),
    );
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v1"
        field={summaryPointsField}
        focus="关注成本"
        getCurrentValue={() => []}
        flushPending={flushPending}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "AI 生成" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    expect(flushPending).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    releaseFlush();
    await vi.waitFor(() =>
      expect(generate).toHaveBeenCalledWith({
        scope: "daily",
        targetFieldId: "summaryPoints",
        mode: "rewrite",
      }),
    );
  });

  it("does not call generation when flushing manual edits fails", async () => {
    const user = userEvent.setup();
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v1"
        field={summaryPointsField}
        focus=""
        getCurrentValue={() => []}
        flushPending={() => Promise.reject(new Error("保存失败"))}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "AI 生成" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
    expect(generate).not.toHaveBeenCalled();
  });

  it("does not save when the candidate is cancelled", async () => {
    const user = userEvent.setup();
    await preview();
    const onSave = vi.fn();
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v1"
        field={summaryPointsField}
        focus=""
        getCurrentValue={() => ["旧值"]}
        flushPending={() => Promise.resolve()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("replaces a daily bullet list only after explicit adoption", async () => {
    const user = userEvent.setup();
    await preview();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v1"
        field={summaryPointsField}
        focus=""
        getCurrentValue={() => ["旧值"]}
        flushPending={() => Promise.resolve()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(["新的要点"]));
  });

  it("appends only new bullet items after adoption", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    await preview(["旧值"]);
    generation.phase = "idle";
    generation.response = null;
    generate.mockImplementation(async () => {
      await preview(["旧值"]);
    });
    const actionProps = {
      confId: "conf-1",
      reportId: "r1",
      templateHash: "template-v1",
      field: summaryPointsField,
      focus: "",
      getCurrentValue: () => ["旧值"],
      flushPending: () => Promise.resolve(),
      onSave,
    };
    const { rerender } = render(<AiFieldAction {...actionProps} />);

    await user.click(screen.getByRole("button", { name: "AI 生成" }));
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.click(screen.getByRole("button", { name: "生成候选内容" }));
    rerender(<AiFieldAction {...actionProps} />);
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(onSave).toHaveBeenCalledWith(["旧值", "新的要点"]);
  });

  it("blocks adoption when the subscribed daily value changed", async () => {
    const user = userEvent.setup();
    await preview(["旧值"]);
    const onSave = vi.fn();
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v1"
        field={summaryPointsField}
        focus="关注成本"
        getCurrentValue={() => ["协作者新值"]}
        flushPending={() => Promise.resolve()}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(await screen.findByText("内容已被修改，请重新生成。")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("blocks adoption when the bound template changed", async () => {
    const user = userEvent.setup();
    await preview();
    const onSave = vi.fn();
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v2"
        field={summaryPointsField}
        focus=""
        getCurrentValue={() => ["旧值"]}
        flushPending={() => Promise.resolve()}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(await screen.findByText("内容已被修改，请重新生成。")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("leaves an insufficient daily field untouched", async () => {
    const user = userEvent.setup();
    generation.phase = "preview";
    generation.response = { ...response(), candidate: [], insufficientFieldIds: ["summaryPoints"] };
    const onSave = vi.fn();
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v1"
        field={summaryPointsField}
        focus=""
        getCurrentValue={() => ["旧值"]}
        flushPending={() => Promise.resolve()}
        onSave={onSave}
      />,
    );
    expect(screen.getByText("材料不足：核心要点")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not render for a field whose AI policy is disabled", () => {
    render(
      <AiFieldAction
        confId="conf-1"
        reportId="r1"
        templateHash="template-v1"
        field={{ ...summaryPointsField, ai: { ...summaryPointsField.ai, enabled: false } }}
        focus=""
        getCurrentValue={() => []}
        flushPending={() => Promise.resolve()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "AI 生成" })).not.toBeInTheDocument();
  });
});
