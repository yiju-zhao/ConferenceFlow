import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GenerationMode } from "../../../types";
import { useModalFocus } from "./useModalFocus";

export interface AiGenerationSetup {
  mode: GenerationMode;
  instruction?: string;
}

interface AiGenerationDialogProps {
  open: boolean;
  availableModes: readonly GenerationMode[];
  focus: string;
  busy: boolean;
  onGenerate: (setup: AiGenerationSetup) => void;
  onClose: () => void;
}

function initialMode(availableModes: readonly GenerationMode[]): GenerationMode {
  return availableModes.includes("rewrite") ? "rewrite" : availableModes[0] || "rewrite";
}

export default function AiGenerationDialog({
  open,
  availableModes,
  focus,
  busy,
  onGenerate,
  onClose,
}: AiGenerationDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GenerationMode>(() => initialMode(availableModes));
  const [instruction, setInstruction] = useState("");
  const wasOpen = useRef(false);
  const modesKey = availableModes.join(",");
  const dialogRef = useRef<HTMLElement>(null);
  const rewriteRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = useModalFocus({
    open,
    busy,
    containerRef: dialogRef,
    initialFocusRef: rewriteRef,
    onClose,
  });

  useEffect(() => {
    if (open && !wasOpen.current) {
      setMode(initialMode(availableModes));
      setInstruction("");
    }
    wasOpen.current = open;
  }, [modesKey, open]);

  if (!open) return null;

  const submit = () => {
    const trimmedInstruction = instruction.trim();
    onGenerate({ mode, ...(trimmedInstruction ? { instruction: trimmedInstruction } : {}) });
  };

  return (
    <div className="ai-report-overlay" onClick={busy ? undefined : onClose}>
      <section
        className="ai-report-dialog"
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="ai-generation-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="ai-report-dialog-header">
          <h2 id="ai-generation-title">{t("report.ai.generate")}</h2>
          <button
            className="ai-report-action"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
          >
            {t("common.close")}
          </button>
        </header>
        <div className="ai-report-mode-selector" aria-label={t("report.ai.generationMode")}>
          <span>{t("report.ai.generationMode")}</span>
          <button
            type="button"
            ref={rewriteRef}
            aria-pressed={mode === "rewrite"}
            onClick={() => setMode("rewrite")}
            disabled={busy || !availableModes.includes("rewrite")}
          >
            {t("report.ai.rewrite")}
          </button>
          {availableModes.includes("append") && (
            <button
              type="button"
              aria-pressed={mode === "append"}
              onClick={() => setMode("append")}
              disabled={busy}
            >
              {t("report.ai.append")}
            </button>
          )}
        </div>
        <label className="ai-report-instruction" htmlFor="ai-generation-instruction">
          {t("report.ai.instruction")}
          <textarea
            id="ai-generation-instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={busy}
            rows={3}
          />
        </label>
        <label className="ai-report-focus" htmlFor="ai-generation-focus">
          {t("report.ai.currentFocus")}
          <textarea id="ai-generation-focus" value={focus} readOnly rows={3} />
        </label>
        <footer className="ai-report-action-row">
          <button className="ai-report-action" type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            className="ai-report-action ai-report-action-primary"
            type="button"
            onClick={submit}
            disabled={busy}
          >
            {busy ? t("report.ai.generating") : t("report.ai.generateCandidate")}
          </button>
        </footer>
      </section>
    </div>
  );
}
