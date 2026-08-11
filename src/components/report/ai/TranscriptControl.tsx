import { useCallback, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TranscriptSourceActions } from "../../../hooks/useTranscriptSource";
import type { TranscriptRef } from "../../../types";
import { useModalFocus } from "./useModalFocus";

interface TranscriptControlProps {
  transcriptRef: TranscriptRef | null | undefined;
  actions: TranscriptSourceActions;
  readOnly?: boolean;
}

const VALIDATION_ERROR_KEYS: Record<string, string> = {
  "unsupported transcript format": "report.ai.unsupportedTranscriptFormat",
  "transcript must be valid UTF-8": "report.ai.invalidTranscriptUtf8",
  "empty transcript": "report.ai.emptyTranscript",
  "transcript exceeds 500000 code points": "report.ai.oversizedTranscript",
};

function transcriptErrorKey(error: string): string {
  return VALIDATION_ERROR_KEYS[error] ?? "report.ai.transcriptOperationFailed";
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
  const dialogId = useId();
  const replaceDialogRef = useRef<HTMLDivElement>(null);
  const replaceCancelRef = useRef<HTMLButtonElement>(null);
  const pasteDialogRef = useRef<HTMLDivElement>(null);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);
  const sourceDialogRef = useRef<HTMLDivElement>(null);
  const sourceCloseRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);

  const closePaste = useCallback(() => {
    setPasteOpen(false);
    setPasteText("");
  }, []);

  const closeSource = useCallback(() => setSourceText(null), []);

  const closeReplace = useCallback(() => setReplacementFile(null), []);

  const closeDelete = useCallback(() => setDeleteOpen(false), []);

  const onReplaceKeyDown = useModalFocus({
    open: !readOnly && replacementFile !== null,
    busy: actions.busy,
    containerRef: replaceDialogRef,
    initialFocusRef: replaceCancelRef,
    onClose: closeReplace,
  });
  const onPasteKeyDown = useModalFocus({
    open: !readOnly && pasteOpen,
    busy: actions.busy,
    containerRef: pasteDialogRef,
    initialFocusRef: pasteInputRef,
    onClose: closePaste,
  });
  const onSourceKeyDown = useModalFocus({
    open: !readOnly && sourceText !== null,
    busy: actions.busy,
    containerRef: sourceDialogRef,
    initialFocusRef: sourceCloseRef,
    onClose: closeSource,
  });
  const onDeleteKeyDown = useModalFocus({
    open: !readOnly && deleteOpen,
    busy: actions.busy,
    containerRef: deleteDialogRef,
    initialFocusRef: deleteCancelRef,
    onClose: closeDelete,
  });

  if (readOnly) return null;

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
      closeDelete();
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
      {actions.error && <p role="alert">{t(transcriptErrorKey(actions.error))}</p>}
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
        <div className="delete-confirm-overlay" onClick={actions.busy ? undefined : closeReplace}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            ref={replaceDialogRef}
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby={`${dialogId}-replace-title`}
            aria-describedby={`${dialogId}-replace-description`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onReplaceKeyDown}
          >
            <h3 id={`${dialogId}-replace-title`} className="delete-confirm-title">
              {t("report.ai.replaceTranscript")}
            </h3>
            <p id={`${dialogId}-replace-description`} className="delete-confirm-desc">
              {replacementFile.name}
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                ref={replaceCancelRef}
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
        <div className="delete-confirm-overlay" onClick={actions.busy ? undefined : closePaste}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            ref={pasteDialogRef}
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby={`${dialogId}-paste-title`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onPasteKeyDown}
          >
            <h3 id={`${dialogId}-paste-title`} className="delete-confirm-title">
              {t("report.ai.pasteTranscript")}
            </h3>
            <textarea
              ref={pasteInputRef}
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
        <div className="delete-confirm-overlay" onClick={actions.busy ? undefined : closeSource}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            ref={sourceDialogRef}
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby={`${dialogId}-source-title`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onSourceKeyDown}
          >
            <h3 id={`${dialogId}-source-title`} className="delete-confirm-title">
              {t("report.ai.transcript")}
            </h3>
            <pre>{sourceText}</pre>
            <div className="delete-confirm-actions">
              <button
                type="button"
                ref={sourceCloseRef}
                className="delete-confirm-cancel"
                onClick={closeSource}
                disabled={actions.busy}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="delete-confirm-overlay" onClick={actions.busy ? undefined : closeDelete}>
          <div
            className="delete-confirm-modal"
            role="dialog"
            ref={deleteDialogRef}
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby={`${dialogId}-delete-title`}
            aria-describedby={`${dialogId}-delete-description`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onDeleteKeyDown}
          >
            <h3 id={`${dialogId}-delete-title`} className="delete-confirm-title">
              {t("report.ai.deleteTranscript")}
            </h3>
            <p id={`${dialogId}-delete-description`} className="delete-confirm-desc">
              {t("report.ai.deleteTranscriptDescription")}
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                ref={deleteCancelRef}
                className="delete-confirm-cancel"
                onClick={closeDelete}
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
