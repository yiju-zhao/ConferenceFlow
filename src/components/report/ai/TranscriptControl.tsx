import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TranscriptSourceActions } from "../../../hooks/useTranscriptSource";
import type { TranscriptRef } from "../../../types";

interface TranscriptControlProps {
  transcriptRef: TranscriptRef | null | undefined;
  actions: TranscriptSourceActions;
  readOnly?: boolean;
}

export default function TranscriptControl({
  transcriptRef,
  actions,
  readOnly = false,
}: TranscriptControlProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (readOnly) return null;

  const closePaste = () => {
    setPasteOpen(false);
    setPasteText("");
  };

  const closeSource = () => setSourceText(null);

  const closeReplace = () => setReplacementFile(null);

  const saveFile = async (file: File) => {
    try {
      await actions.saveFile(file);
      closeReplace();
    } catch {
      // The hook exposes a safe operation error without retaining source text.
    }
  };

  const savePaste = async () => {
    try {
      await actions.savePaste(pasteText);
      closePaste();
    } catch {
      // Keep the local text available so the user can correct it or try again.
    }
  };

  const viewSource = async () => {
    try {
      setSourceText(await actions.loadText());
    } catch {
      // The hook reports the safe operation error.
    }
  };

  const remove = async () => {
    try {
      await actions.remove();
      setDeleteOpen(false);
      closeSource();
    } catch {
      // Keep the confirmation open so the user can retry.
    }
  };

  return (
    <section className="no-print transcript-control" aria-label={t("report.ai.transcript")}>
      <p className="transcript-control-hint">{t("report.ai.privateSourceHint")}</p>
      {transcriptRef ? (
        <div className="transcript-control-current">
          <span>{transcriptRef.fileName}</span>
          <button type="button" onClick={viewSource} disabled={actions.busy}>
            {t("report.ai.viewTranscript")}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={actions.busy}
          >
            {t("report.ai.replaceTranscript")}
          </button>
          <button type="button" onClick={() => setDeleteOpen(true)} disabled={actions.busy}>
            {t("report.ai.deleteTranscript")}
          </button>
        </div>
      ) : (
        <div className="transcript-control-actions">
          <button type="button" onClick={() => setPasteOpen(true)} disabled={actions.busy}>
            {t("report.ai.pasteTranscript")}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={actions.busy}
          >
            {t("report.ai.uploadTranscript")}
          </button>
        </div>
      )}
      <p className="transcript-control-formats">{t("report.ai.transcriptFormats")}</p>
      {actions.error && <p role="alert">{t("report.ai.transcriptOperationFailed")}</p>}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,text/vtt,application/x-subrip"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          if (transcriptRef) {
            setReplacementFile(file);
          } else {
            void saveFile(file);
          }
        }}
      />

      {replacementFile && (
        <div className="delete-confirm-overlay" onClick={closeReplace}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="delete-confirm-title">{t("report.ai.replaceTranscript")}</h3>
            <p className="delete-confirm-desc">{replacementFile.name}</p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-confirm-cancel"
                onClick={closeReplace}
                disabled={actions.busy}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="delete-confirm-submit"
                onClick={() => void saveFile(replacementFile)}
                disabled={actions.busy}
              >
                {t("report.ai.confirmReplaceTranscript")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="delete-confirm-overlay" onClick={closePaste}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="delete-confirm-title">{t("report.ai.pasteTranscript")}</h3>
            <textarea
              aria-label={t("report.ai.pasteTranscript")}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              disabled={actions.busy}
              rows={12}
            />
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-confirm-cancel"
                onClick={closePaste}
                disabled={actions.busy}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="delete-confirm-submit"
                onClick={() => void savePaste()}
                disabled={actions.busy}
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {sourceText !== null && (
        <div className="delete-confirm-overlay" onClick={closeSource}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="delete-confirm-title">{t("report.ai.transcript")}</h3>
            <pre>{sourceText}</pre>
            <div className="delete-confirm-actions">
              <button type="button" className="delete-confirm-cancel" onClick={closeSource}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="delete-confirm-overlay" onClick={() => setDeleteOpen(false)}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="delete-confirm-title">{t("report.ai.deleteTranscript")}</h3>
            <p className="delete-confirm-desc">{t("report.ai.deleteTranscriptDescription")}</p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="delete-confirm-cancel"
                onClick={() => setDeleteOpen(false)}
                disabled={actions.busy}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="delete-confirm-submit"
                onClick={() => void remove()}
                disabled={actions.busy}
              >
                {t("report.ai.confirmDeleteTranscript")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
