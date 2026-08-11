import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CandidateEvidence,
  GenerateRequest,
  GenerateResponse,
  ReportTemplateVersion,
  TemplateFieldValue,
} from "../../../types";
import { useModalFocus } from "./useModalFocus";

interface AiCandidateModalProps {
  open?: boolean;
  template: ReportTemplateVersion;
  response: GenerateResponse | null;
  request?: GenerateRequest;
  error?: string | null;
  retryable?: boolean;
  busy: boolean;
  onAdopt: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

function formatMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatEvidenceLocation(evidence: CandidateEvidence): string {
  if (evidence.startMs === undefined) return evidence.sourceId;
  return `${formatMs(evidence.startMs)}–${formatMs(evidence.endMs ?? evidence.startMs)}`;
}

function CandidateValue({ value }: { value: TemplateFieldValue }) {
  if (Array.isArray(value)) {
    return (
      <ul>
        {value.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p>{value}</p>;
}

export default function AiCandidateModal({
  open = true,
  template,
  response,
  request,
  error,
  retryable = false,
  busy,
  onAdopt,
  onRegenerate,
  onCancel,
}: AiCandidateModalProps) {
  const { t } = useTranslation();
  const [openEvidence, setOpenEvidence] = useState<{
    response: GenerateResponse | null;
    fieldIds: Set<string>;
  }>(() => ({ response: null, fieldIds: new Set() }));
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = useModalFocus({
    open,
    busy,
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    onClose: onCancel,
  });
  const labels = new Map(template.fields.map((field) => [field.id, field.label]));
  const evidenceById = new Map(
    (response?.evidence || []).map((evidence) => [evidence.id, evidence]),
  );

  const toggleEvidence = (fieldId: string) => {
    setOpenEvidence((current) => {
      const next = current.response === response ? new Set(current.fieldIds) : new Set<string>();
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return { response, fieldIds: next };
    });
  };

  if (!open) return null;

  return (
    <div className="ai-report-overlay" onClick={busy ? undefined : onCancel}>
      <section
        className="ai-report-dialog ai-report-candidate-modal"
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="ai-candidate-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="ai-report-dialog-header">
          <h2 id="ai-candidate-title">{t("report.ai.candidate")}</h2>
          <button
            className="ai-report-action"
            ref={closeRef}
            onClick={onCancel}
            disabled={busy}
            aria-label={t("common.close")}
          >
            {t("common.close")}
          </button>
        </header>
        <dl className="ai-report-generation-context">
          {response && (
            <div>
              <dt>{t("report.ai.currentFocus")}</dt>
              <dd>{response.context.focusUsed || t("report.ai.noAiFocus")}</dd>
            </div>
          )}
          {request && (
            <>
              <div>
                <dt>{t("report.ai.generationMode")}</dt>
                <dd>{t(`report.ai.${request.mode}`)}</dd>
              </div>
              {request.instruction && (
                <div>
                  <dt>{t("report.ai.instruction")}</dt>
                  <dd>{request.instruction}</dd>
                </div>
              )}
            </>
          )}
        </dl>
        {error ? (
          <p className="ai-report-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="ai-report-candidate-fields">
            {response?.candidate.map((field) => {
              const fieldEvidence = field.evidenceIds
                .map((id) => evidenceById.get(id))
                .filter((evidence): evidence is CandidateEvidence => evidence !== undefined);
              const evidenceOpen =
                openEvidence.response === response && openEvidence.fieldIds.has(field.fieldId);
              return (
                <article className="ai-report-candidate-field" key={field.fieldId}>
                  <h3>{labels.get(field.fieldId) || field.fieldId}</h3>
                  <CandidateValue value={field.value} />
                  {fieldEvidence.length > 0 && (
                    <div className="ai-report-evidence">
                      <button
                        type="button"
                        aria-expanded={evidenceOpen}
                        onClick={() => toggleEvidence(field.fieldId)}
                      >
                        {evidenceOpen ? t("report.ai.hideEvidence") : t("report.ai.viewEvidence")}
                      </button>
                      {evidenceOpen && (
                        <ul className="ai-report-transcript">
                          {fieldEvidence.map((evidence) => (
                            <li key={evidence.id}>
                              <span>{formatEvidenceLocation(evidence)}</span>
                              <span>{t(`report.ai.source.${evidence.sourceType}`)}</span>
                              <blockquote>{evidence.quote}</blockquote>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {response?.insufficientFieldIds.map((fieldId) => (
          <p className="ai-report-status" role="status" key={fieldId}>
            {t("report.ai.insufficient", { field: labels.get(fieldId) || fieldId })}
          </p>
        ))}
        <footer className="ai-report-action-row">
          <button className="ai-report-action" type="button" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          {(response || retryable) && (
            <button
              className="ai-report-action"
              type="button"
              onClick={onRegenerate}
              disabled={busy}
            >
              {response ? t("report.ai.regenerate") : t("report.ai.retry")}
            </button>
          )}
          {response && (
            <button
              className="ai-report-action ai-report-action-primary"
              type="button"
              onClick={onAdopt}
              disabled={busy}
            >
              {t("report.ai.adopt")}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
