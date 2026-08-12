import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyCandidateValue, candidateIsCurrent } from "../../../lib/ai-report/applyCandidate";
import { hashFieldMap } from "../../../lib/ai-report/hash";
import { normalizeStoredFieldValue } from "../../../lib/ai-report/templateContract";
import { useTranscriptSource } from "../../../hooks/useTranscriptSource";
import type {
  GenerationMode,
  ReportTemplateVersion,
  TemplateField,
  TemplateFieldValue,
  TranscriptRef,
} from "../../../types";
import AiCandidateModal from "./AiCandidateModal";
import AiGenerationDialog, { type AiGenerationSetup } from "./AiGenerationDialog";
import TranscriptControl from "./TranscriptControl";
import { useAiGeneration } from "./useAiGeneration";

export interface SessionAiSectionProps {
  confId: string;
  reportId: string;
  sessionId: string;
  templateHash: string;
  fields: TemplateField[];
  focus: string;
  uid: string;
  transcriptRef: TranscriptRef | null | undefined;
  flushPending: () => Promise<void>;
  getLatestValues: () => Record<string, unknown>;
  onSaveFields: (sessionId: string, values: Record<string, TemplateFieldValue>) => Promise<void>;
  readOnly?: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "保存失败，请重试。";
}

export default function SessionAiSection({
  confId,
  reportId,
  sessionId,
  templateHash,
  fields,
  focus,
  uid,
  transcriptRef,
  flushPending,
  getLatestValues,
  onSaveFields,
  readOnly = false,
}: SessionAiSectionProps) {
  const { t } = useTranslation();
  const transcriptActions = useTranscriptSource({
    confId,
    reportId,
    sessionId,
    current: transcriptRef,
    uid,
  });
  const generation = useAiGeneration(confId, reportId);
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GenerationMode>("rewrite");
  const [localError, setLocalError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);
  const eligibleFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.scope === "session" &&
          field.ai.enabled &&
          field.type !== "fixed" &&
          field.type !== "image" &&
          field.ai.allowedModes.length > 0,
      ),
    [fields],
  );
  const modes = useMemo(
    () =>
      (["rewrite", "append"] as const).filter((mode) =>
        eligibleFields.some((field) => field.ai.allowedModes.includes(mode)),
      ),
    [eligibleFields],
  );
  const targetFields = useMemo(
    () => eligibleFields.filter((field) => field.ai.allowedModes.includes(selectedMode)),
    [eligibleFields, selectedMode],
  );
  const template = useMemo<ReportTemplateVersion>(
    () => ({ templateId: "bound-report", version: 1, templateHash, fields: eligibleFields }),
    [eligibleFields, templateHash],
  );

  const close = () => {
    setSetupOpen(false);
    setLocalError(null);
    generation.cancel();
  };

  const generate = async (setup: AiGenerationSetup) => {
    if (!transcriptRef) {
      setLocalError(t("report.ai.missingTranscript"));
      return;
    }
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
      scope: "session",
      sessionId,
      mode: setup.mode,
      ...(setup.instruction ? { instruction: setup.instruction } : {}),
    });
  };

  const adopt = async () => {
    const response = generation.response;
    if (!response) return;
    setLocalError(null);
    if (
      response.context.templateHash !== templateHash ||
      response.context.transcriptHash !== transcriptRef?.contentHash
    ) {
      setLocalError("内容已被修改，请重新生成。");
      return;
    }
    const latestRaw = getLatestValues();
    const latest = Object.fromEntries(
      targetFields.map((field) => [
        field.id,
        normalizeStoredFieldValue(field, latestRaw[field.id]),
      ]),
    ) as Record<string, TemplateFieldValue>;
    const latestHashes = await hashFieldMap(latest);
    if (!candidateIsCurrent(response.context.baseFieldHashes, latestHashes)) {
      setLocalError("内容已被修改，请重新生成。");
      return;
    }
    const values: Record<string, TemplateFieldValue> = {};
    for (const candidate of response.candidate) {
      const field = targetFields.find((item) => item.id === candidate.fieldId);
      if (!field) {
        setLocalError("候选内容无效，请重新生成。");
        return;
      }
      values[field.id] = applyCandidateValue(
        latest[field.id],
        candidate.value,
        field.type,
        selectedMode,
      );
    }
    if (Object.keys(values).length === 0) return;
    setAdopting(true);
    try {
      await onSaveFields(sessionId, values);
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

  if (eligibleFields.length === 0) return null;

  return (
    <section className="no-print ai-session-section">
      <TranscriptControl
        transcriptRef={transcriptRef}
        actions={transcriptActions}
        readOnly={readOnly}
      />
      {!readOnly && (
        <>
          <button
            type="button"
            className="ai-report-action"
            onClick={() => setSetupOpen(true)}
            disabled={!transcriptRef}
          >
            AI 生成 Session 内容
          </button>
          {localError && setupOpen && <p role="alert">{localError}</p>}
          <AiGenerationDialog
            open={setupOpen}
            availableModes={modes}
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
        </>
      )}
    </section>
  );
}
