import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useModalFocus } from "./useModalFocus";

interface AiFocusDialogProps {
  open: boolean;
  value: string;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
}

export default function AiFocusDialog({ open, value, onSave, onClose }: AiFocusDialogProps) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const wasOpen = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusInputRef = useRef<HTMLTextAreaElement>(null);
  const onKeyDown = useModalFocus({
    open,
    busy: saving,
    containerRef: dialogRef,
    initialFocusRef: focusInputRef,
    onClose,
  });

  useEffect(() => {
    if (open && !wasOpen.current) {
      setFocus(value);
      setError(false);
    }
    wasOpen.current = open;
  }, [open, value]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      await onSave(focus.trim());
      onClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="delete-confirm-overlay" onClick={saving ? undefined : onClose}>
      <div
        className="delete-confirm-modal"
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="ai-focus-dialog-title"
        aria-describedby="ai-focus-dialog-description"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h3 id="ai-focus-dialog-title" className="delete-confirm-title">
          {t("report.ai.aiFocus")}
        </h3>
        <p id="ai-focus-dialog-description" className="delete-confirm-desc">
          {t("report.ai.aiFocusDescription")}
        </p>
        <label htmlFor="ai-focus-input">{t("report.ai.aiFocus")}</label>
        <textarea
          id="ai-focus-input"
          ref={focusInputRef}
          value={focus}
          onChange={(event) => setFocus(event.target.value)}
          rows={5}
          disabled={saving}
        />
        {error && (
          <p role="alert" className="delete-confirm-error">
            {t("report.ai.aiFocusSaveFailed")}
          </p>
        )}
        <div className="delete-confirm-actions">
          <button
            type="button"
            className="delete-confirm-cancel report-editor-touch-target"
            onClick={onClose}
            disabled={saving}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="delete-confirm-submit report-editor-touch-target"
            onClick={save}
            disabled={saving}
          >
            {t("report.ai.saveAiFocus")}
          </button>
        </div>
      </div>
    </div>
  );
}
