import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBlockTranscriptSource } from "../../../hooks/useBlockTranscriptSource";
import { applyCandidateValue, candidateIsCurrent } from "../../../lib/ai-report/applyCandidate";
import { blockContentHashKey } from "../../../lib/ai-report/blockTarget";
import { hashFieldMap } from "../../../lib/ai-report/hash";
import { hasVisibleBlockContent } from "../../../lib/ai-report/reportBlocks";
import { normalizeStoredFieldValue } from "../../../lib/ai-report/templateContract";
import type {
  AiBlockField,
  GenerateRequest,
  ReportBlock,
  ReportTemplateVersion,
  TemplateField,
  TranscriptRef,
} from "../../../types";
import AiCandidateModal from "./AiCandidateModal";
import AiGenerationDialog, { type AiGenerationSetup } from "./AiGenerationDialog";
import TranscriptControl from "./TranscriptControl";
import { useAiGeneration } from "./useAiGeneration";

export interface BlockAiSectionProps {
  confId: string;
  reportId: string;
  targetFieldId: AiBlockField;
  templateHash: string;
  field: TemplateField;
  block: ReportBlock;
  focus: string;
  uid: string;
  flushPending(): Promise<void>;
  getLatestBlock(): ReportBlock | undefined;
  commitTranscript(next: TranscriptRef | null): Promise<void>;
  onSaveContent(content: string): Promise<void>;
  readOnly?: boolean;
}

export default function BlockAiSection({
  confId,
  reportId,
  targetFieldId,
  templateHash,
  field,
  block,
  focus,
  uid,
  flushPending,
  getLatestBlock,
  commitTranscript,
  onSaveContent,
  readOnly = false,
}: BlockAiSectionProps) {
  const { t } = useTranslation();
  const transcriptActions = useBlockTranscriptSource({
    confId,
    reportId,
    targetFieldId,
    blockId: block.id,
    current: block.transcriptRef,
    uid,
    commitReference: commitTranscript,
  });
  const generation = useAiGeneration(confId, reportId);
  const [setupOpen, setSetupOpen] = useState(false);
  const [lastRequest, setLastRequest] = useState<GenerateRequest | undefined>();
  const [localError, setLocalError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const attemptRef = useRef(0);
  const pendingRef = useRef(false);

  useEffect(
    () => () => {
      attemptRef.current += 1;
      pendingRef.current = false;
    },
    [],
  );

  const eligible =
    field.id === targetFieldId &&
    field.scope === "block" &&
    field.type === "rich_text" &&
    field.ai.enabled;
  const modes = (["rewrite", "append"] as const).filter(
    (mode) => field.ai.allowedModes.includes(mode) && (block.type === "body" || mode === "rewrite"),
  );
  const template = useMemo<ReportTemplateVersion>(
    () => ({ templateId: "bound-report", version: 1, templateHash, fields: [field] }),
    [field, templateHash],
  );
  const hasSource = Boolean(block.transcriptRef) || hasVisibleBlockContent(block);

  const beginPreparation = () => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    const token = ++attemptRef.current;
    setPreparing(true);
    return token;
  };

  const finishPreparation = (token: number) => {
    if (attemptRef.current !== token) return false;
    pendingRef.current = false;
    setPreparing(false);
    return true;
  };

  const close = () => {
    attemptRef.current += 1;
    pendingRef.current = false;
    setPreparing(false);
    setSetupOpen(false);
    setLocalError(null);
    setLastRequest(undefined);
    generation.cancel();
  };

  const generate = async (setup: AiGenerationSetup) => {
    const token = beginPreparation();
    if (token === null) return;
    setLocalError(null);
    try {
      await flushPending();
    } catch {
      if (!finishPreparation(token)) return;
      setLocalError(t("report.ai.generationFailed"));
      return;
    }
    if (!finishPreparation(token)) return;
    const instruction = setup.instruction?.trim();
    const request: GenerateRequest = {
      scope: "block",
      targetFieldId,
      blockId: block.id,
      mode: setup.mode,
      ...(instruction ? { instruction } : {}),
    };
    setLastRequest(request);
    setSetupOpen(false);
    await generation.generate(request);
  };

  const stale = () => setLocalError(t("report.ai.staleBlock"));

  const adopt = async () => {
    if (adopting) return;
    const response = generation.response;
    if (!response) return;
    setAdopting(true);
    setLocalError(null);
    try {
      const latest = getLatestBlock();
      const target = response.context.blockTarget;
      if (
        !latest ||
        latest.id !== block.id ||
        latest.type !== block.type ||
        response.context.templateHash !== templateHash ||
        !target ||
        target.targetFieldId !== targetFieldId ||
        target.blockId !== block.id ||
        response.context.transcriptHash !== latest.transcriptRef?.contentHash
      ) {
        stale();
        return;
      }

      const normalized = normalizeStoredFieldValue(field, latest.content);
      if (typeof normalized !== "string") {
        stale();
        return;
      }
      const hashKey = blockContentHashKey(targetFieldId, block.id);
      const baseKeys = Object.keys(response.context.baseFieldHashes);
      const latestHashes = await hashFieldMap({ [hashKey]: normalized });
      if (
        baseKeys.length !== 1 ||
        baseKeys[0] !== hashKey ||
        !candidateIsCurrent(response.context.baseFieldHashes, latestHashes)
      ) {
        stale();
        return;
      }

      if (response.candidate.length !== 1) {
        setLocalError(t("report.ai.generationFailed"));
        return;
      }
      const candidate = response.candidate[0];
      if (candidate.fieldId !== targetFieldId || typeof candidate.value !== "string") {
        setLocalError(t("report.ai.generationFailed"));
        return;
      }
      const request = lastRequest;
      if (!request || request.scope !== "block") {
        setLocalError(t("report.ai.generationFailed"));
        return;
      }
      const result = applyCandidateValue(
        normalized,
        candidate.value,
        block.type === "heading" ? "short_text" : "rich_text",
        request.mode,
      );
      if (typeof result !== "string") {
        setLocalError(t("report.ai.generationFailed"));
        return;
      }

      await onSaveContent(result);
      close();
    } catch {
      setLocalError(t("report.ai.generationFailed"));
    } finally {
      setAdopting(false);
    }
  };

  const regenerate = async () => {
    const token = beginPreparation();
    if (token === null) return;
    setLocalError(null);
    try {
      await flushPending();
    } catch {
      if (!finishPreparation(token)) return;
      setLocalError(t("report.ai.generationFailed"));
      return;
    }
    if (!finishPreparation(token)) return;
    await generation.regenerate();
  };

  if (!eligible || modes.length === 0 || readOnly) return null;

  return (
    <section className="no-print ai-session-section">
      <div className="ai-editor-source-row">
        <TranscriptControl transcriptRef={block.transcriptRef} actions={transcriptActions} />
        <button
          type="button"
          className="ai-report-action ai-report-action--generate"
          onClick={() => {
            setLocalError(null);
            setSetupOpen(true);
          }}
          disabled={!hasSource}
        >
          {t("report.ai.generateBlock")}
        </button>
      </div>
      {!hasSource && <p>{t("report.ai.missingBlockSource")}</p>}
      <AiGenerationDialog
        open={setupOpen}
        availableModes={modes}
        focus={focus}
        busy={generation.phase === "generating"}
        error={localError}
        preparing={preparing}
        onGenerate={(setup) => void generate(setup)}
        onClose={close}
      />
      {(generation.phase === "preview" || generation.phase === "error") && (
        <AiCandidateModal
          template={template}
          response={generation.response}
          request={lastRequest}
          error={localError ?? generation.error}
          retryable={generation.retryable}
          busy={adopting}
          onAdopt={() => void adopt()}
          onRegenerate={() => void regenerate()}
          onCancel={close}
        />
      )}
    </section>
  );
}
