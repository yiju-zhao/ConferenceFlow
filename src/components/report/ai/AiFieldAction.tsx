import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyCandidateValue, candidateIsCurrent } from "../../../lib/ai-report/applyCandidate";
import { hashFieldValue } from "../../../lib/ai-report/hash";
import { normalizeStoredFieldValue } from "../../../lib/ai-report/templateContract";
import type {
  GenerationMode,
  ReportTemplateVersion,
  TemplateField,
  TemplateFieldValue,
} from "../../../types";
import AiCandidateModal from "./AiCandidateModal";
import AiGenerationDialog, { type AiGenerationSetup } from "./AiGenerationDialog";
import { useAiGeneration } from "./useAiGeneration";

export interface AiFieldActionProps {
  confId: string;
  reportId: string;
  templateHash: string;
  field: TemplateField;
  focus: string;
  getCurrentValue: () => unknown;
  flushPending: () => Promise<void>;
  onSave: (value: TemplateFieldValue) => Promise<void>;
  readOnly?: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "保存失败，请重试。";
}

export default function AiFieldAction({
  confId,
  reportId,
  templateHash,
  field,
  focus,
  getCurrentValue,
  flushPending,
  onSave,
  readOnly = false,
}: AiFieldActionProps) {
  const { t } = useTranslation();
  const generation = useAiGeneration(confId, reportId);
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GenerationMode>("rewrite");
  const [localError, setLocalError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);
  const template = useMemo<ReportTemplateVersion>(
    () => ({ templateId: "bound-report", version: 1, templateHash, fields: [field] }),
    [field, templateHash],
  );

  const eligible =
    field.ai.enabled &&
    field.scope === "daily" &&
    field.type !== "fixed" &&
    field.type !== "image" &&
    field.ai.allowedModes.length > 0;

  if (!eligible || readOnly) return null;

  const close = () => {
    setSetupOpen(false);
    setLocalError(null);
    generation.cancel();
  };

  const generate = async (setup: AiGenerationSetup) => {
    setLocalError(null);
    setSelectedMode(setup.mode);
    try {
      await flushPending();
    } catch (error) {
      setLocalError(message(error));
      return;
    }
    setSetupOpen(false);
    await generation.generate({
      scope: "daily",
      targetFieldId: field.id,
      mode: setup.mode,
      ...(setup.instruction ? { instruction: setup.instruction } : {}),
    });
  };

  const adopt = async () => {
    const response = generation.response;
    const candidate = response?.candidate.find((item) => item.fieldId === field.id);
    if (!response || !candidate) return;
    setLocalError(null);
    if (response.context.templateHash !== templateHash) {
      setLocalError("内容已被修改，请重新生成。");
      return;
    }
    const latest = normalizeStoredFieldValue(field, getCurrentValue());
    const latestHash = await hashFieldValue(latest);
    if (!candidateIsCurrent(response.context.baseFieldHashes, { [field.id]: latestHash })) {
      setLocalError("内容已被修改，请重新生成。");
      return;
    }
    setAdopting(true);
    try {
      await onSave(applyCandidateValue(latest, candidate.value, field.type, selectedMode));
      close();
    } catch (error) {
      setLocalError(message(error));
    } finally {
      setAdopting(false);
    }
  };

  const regenerate = async () => {
    setLocalError(null);
    try {
      await flushPending();
    } catch (error) {
      setLocalError(message(error));
      return;
    }
    await generation.regenerate();
  };

  return (
    <span className="no-print ai-field-action">
      <button
        type="button"
        className="ai-report-action ai-report-action--generate"
        onClick={() => setSetupOpen(true)}
      >
        {t("report.ai.generate")}
      </button>
      {localError && setupOpen && <p role="alert">{localError}</p>}
      <AiGenerationDialog
        open={setupOpen}
        availableModes={field.ai.allowedModes}
        focus={focus}
        busy={generation.phase === "generating"}
        onGenerate={(setup) => void generate(setup)}
        onClose={close}
      />
      {(generation.phase === "preview" || generation.phase === "error") && (
        <AiCandidateModal
          template={template}
          response={generation.response}
          error={localError ?? generation.error}
          retryable={generation.retryable}
          busy={adopting}
          onAdopt={() => void adopt()}
          onRegenerate={() => void regenerate()}
          onCancel={close}
        />
      )}
    </span>
  );
}
