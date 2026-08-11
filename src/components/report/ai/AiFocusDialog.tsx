import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
    <div className="delete-confirm-overlay" onClick={onClose}>
      <div
        className="delete-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-focus-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="ai-focus-dialog-title" className="delete-confirm-title">
          {t("report.ai.aiFocus")}
        </h3>
        <p className="delete-confirm-desc">{t("report.ai.aiFocusDescription")}</p>
        <label htmlFor="ai-focus-input">{t("report.ai.aiFocus")}</label>
        <textarea
          id="ai-focus-input"
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
          <button className="delete-confirm-cancel" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="delete-confirm-submit" onClick={save} disabled={saving}>
            {t("report.ai.saveAiFocus")}
          </button>
        </div>
      </div>
    </div>
  );
}
