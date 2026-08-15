import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import type { GenerateResponse, ReportTemplateVersion } from "../../../types";
import AiCandidateModal, { formatEvidenceLocation } from "./AiCandidateModal";

const template: ReportTemplateVersion = {
  templateId: "daily-brief",
  version: 1,
  templateHash: "template-1",
  fields: [
    {
      id: "summaryPoints",
      label: "核心结论",
      description: "",
      type: "bullet_list",
      scope: "daily",
      ai: {
        enabled: true,
        allowedSources: ["report_content"],
        evidenceRequired: true,
        allowedModes: ["rewrite"],
      },
    },
    {
      id: "insights",
      label: "深度研判",
      description: "",
      type: "rich_text",
      scope: "daily",
      ai: {
        enabled: true,
        allowedSources: ["report_content"],
        evidenceRequired: true,
        allowedModes: ["rewrite"],
      },
    },
  ],
};

const response: GenerateResponse = {
  candidate: [
    { fieldId: "summaryPoints", value: ["推理成本降低约 30%。"], evidenceIds: ["evidence-1"] },
  ],
  insufficientFieldIds: ["insights"],
  evidence: [
    {
      id: "evidence-1",
      sourceType: "transcript",
      sourceId: "session-1",
      quote: "在同样精度下，推理成本降低约 30%。",
      startMs: 723000,
      endMs: 730000,
    },
  ],
  context: { templateHash: "template-1", baseFieldHashes: {}, focusUsed: "关注成本" },
};

describe("AiCandidateModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("gives every candidate dialog action the shared editor touch-target contract", () => {
    render(
      <AiCandidateModal
        template={template}
        response={response}
        busy={false}
        onAdopt={vi.fn()}
        onRegenerate={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    ["关闭", "查看证据", "取消", "重新生成", "采纳候选内容"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toHaveClass("report-editor-touch-target");
    });
  });

  it("keeps candidate evidence collapsed until requested", async () => {
    const user = userEvent.setup();
    render(
      <AiCandidateModal
        template={template}
        response={response}
        busy={false}
        onAdopt={vi.fn()}
        onRegenerate={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("核心结论")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveTextContent("关闭");
    expect(screen.queryByText("在同样精度下，推理成本降低约 30%。")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看证据" }));
    expect(screen.getByText("00:12:03–00:12:10")).toBeInTheDocument();
    expect(screen.getByText("在同样精度下，推理成本降低约 30%。")).toBeInTheDocument();
    expect(screen.getByText("材料不足：深度研判")).toBeInTheDocument();
    expect(screen.getByText("关注成本")).toBeInTheDocument();
  });

  it("calls only the matching action", async () => {
    const user = userEvent.setup();
    const onAdopt = vi.fn();
    const onRegenerate = vi.fn();
    const onCancel = vi.fn();
    render(
      <AiCandidateModal
        template={template}
        response={response}
        busy={false}
        onAdopt={onAdopt}
        onRegenerate={onRegenerate}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "采纳候选内容" }));
    expect(onAdopt).toHaveBeenCalledOnce();
    expect(onRegenerate).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "重新生成" }));
    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows a retryable generation failure without exposing a candidate", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    render(
      <AiCandidateModal
        template={template}
        response={null}
        error="生成服务暂不可用"
        retryable
        busy={false}
        onAdopt={vi.fn()}
        onRegenerate={onRegenerate}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("生成服务暂不可用");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRegenerate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "采纳候选内容" })).not.toBeInTheDocument();
  });

  it("formats source-only evidence without a timestamp", () => {
    expect(
      formatEvidenceLocation({
        id: "e",
        sourceType: "transcript",
        sourceId: "session-1",
        quote: "x",
      }),
    ).toBe("session-1");
  });

  it("keeps evidence closed for a replacement response with the same field ID", async () => {
    const user = userEvent.setup();
    const replacement: GenerateResponse = {
      ...response,
      candidate: [{ ...response.candidate[0], value: ["新的候选结论"] }],
      evidence: [{ ...response.evidence[0], quote: "新的证据不应自动显示。" }],
    };
    const { rerender } = render(
      <AiCandidateModal
        template={template}
        response={response}
        busy={false}
        onAdopt={vi.fn()}
        onRegenerate={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看证据" }));
    expect(screen.getByText("在同样精度下，推理成本降低约 30%。")).toBeInTheDocument();

    rerender(
      <AiCandidateModal
        template={template}
        response={replacement}
        busy={false}
        onAdopt={vi.fn()}
        onRegenerate={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText("新的证据不应自动显示。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看证据" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("focuses the candidate modal, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const launcher = document.createElement("button");
    launcher.textContent = "查看候选";
    document.body.append(launcher);
    launcher.focus();
    const onCancel = vi.fn();
    const props = {
      template,
      response,
      busy: false,
      onAdopt: vi.fn(),
      onRegenerate: vi.fn(),
      onCancel,
    };
    const { rerender } = render(<AiCandidateModal open {...props} />);

    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(<AiCandidateModal open={false} {...props} />);
    expect(launcher).toHaveFocus();
    launcher.remove();
  });
});
