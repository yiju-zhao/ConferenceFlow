import { useTranslation } from "react-i18next";

interface ReportShareDialogProps {
  url: string;
  copied: boolean;
  onClose(): void;
  onCopy(): void;
}

export default function ReportShareDialog({
  url,
  copied,
  onClose,
  onCopy,
}: ReportShareDialogProps) {
  const { t } = useTranslation();

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="share-modal-header">
          <span className="share-modal-title">{t("report.shareableLink")}</span>
          <button
            type="button"
            className="share-modal-close report-editor-touch-target"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="share-modal-url-row">
          <span className="share-modal-url">{url}</span>
          <button
            type="button"
            className={`share-modal-copy-btn report-editor-touch-target${
              copied ? " share-modal-copy-btn--copied" : ""
            }`}
            onClick={onCopy}
          >
            {copied ? t("report.linkCopied") : t("report.copyLink")}
          </button>
        </div>
        <p className="share-modal-hint">{t("report.shareLinkHint")}</p>
      </div>
    </div>
  );
}
