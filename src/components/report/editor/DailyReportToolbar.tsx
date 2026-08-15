import type { ReactNode } from "react";
import {
  Button,
  Divider,
  Menu,
  MenuDivider,
  MenuItem,
  Popover,
  Position,
  Tag,
  Tooltip,
} from "@blueprintjs/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export interface DailyReportToolbarProps {
  backTo: string;
  title: string;
  status: "draft" | "published";
  saveState: "idle" | "saving" | "saved";
  presence?: ReactNode;
  focusHint: string;
  exporting: boolean;
  publishing: boolean;
  syncing: boolean;
  syncMessage: string;
  onSave(): void;
  onOpenFocus(): void;
  onPreview(): void;
  onPublish(): void;
  onExportMarkdown(): void;
  onExportEmail(): void;
  onOpenHistory(): void;
  onSync(): void;
  onDeleteSession(): void;
}

export default function DailyReportToolbar({
  backTo,
  title,
  status,
  saveState,
  presence,
  focusHint,
  exporting,
  publishing,
  syncing,
  syncMessage,
  onSave,
  onOpenFocus,
  onPreview,
  onPublish,
  onExportMarkdown,
  onExportEmail,
  onOpenHistory,
  onSync,
  onDeleteSession,
}: DailyReportToolbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const exportMenu = (
    <Menu className="report-editor-toolbar-menu">
      <MenuItem
        icon="share"
        text={publishing ? t("report.sharing") : t("report.shareReport")}
        disabled={publishing}
        onClick={onPublish}
      />
      <MenuDivider />
      <MenuItem icon="document" text={t("report.exportMarkdown")} onClick={onExportMarkdown} />
      <MenuItem icon="envelope" text={t("report.exportEmailHtml")} onClick={onExportEmail} />
    </Menu>
  );
  const moreMenu = (
    <Menu className="report-editor-toolbar-menu">
      <MenuItem
        className="report-editor-focus-menu-item"
        icon="target"
        text={t("report.ai.aiFocus")}
        onClick={onOpenFocus}
      />
      <MenuItem icon="history" text={t("report.versionHistory")} onClick={onOpenHistory} />
      <MenuItem
        icon="refresh"
        text={syncing ? t("report.syncing") : t("report.syncFromCatalog")}
        disabled={syncing}
        onClick={onSync}
      />
      <MenuDivider />
      <MenuItem
        icon="trash"
        intent="danger"
        text={t("report.deleteSession")}
        onClick={onDeleteSession}
      />
    </Menu>
  );

  return (
    <header className="report-editor-toolbar no-print">
      <div className="report-editor-toolbar-inner">
        <div className="report-editor-toolbar-context">
          <Button
            minimal
            small
            icon="chevron-left"
            text={t("report.backToReportsShort")}
            onClick={() => navigate(backTo)}
          />
          <span className="report-editor-toolbar-title" title={title}>
            {title}
          </span>
          <Tag minimal intent={status === "published" ? "success" : "none"}>
            {status === "published" ? t("report.statusPublished") : t("report.statusDraft")}
          </Tag>
        </div>
        <Divider />
        <div className="report-editor-toolbar-actions">
          {presence}
          <span role="status" className={`report-editor-save-state is-${saveState}`}>
            {saveState === "saving" ? t("common.saving") : null}
            {saveState === "saved" ? t("admin.saved") : null}
          </span>
          <Button small icon="floppy-disk" text={t("common.save")} onClick={onSave} />
          <Tooltip content={focusHint}>
            <Button
              small
              icon="target"
              text={t("report.ai.aiFocus")}
              className="report-editor-focus-action"
              onClick={onOpenFocus}
            />
          </Tooltip>
          <Button
            small
            icon="eye-open"
            text={t("report.preview")}
            className="report-editor-primary-action"
            onClick={onPreview}
          />
          <Popover position={Position.BOTTOM_RIGHT} content={exportMenu}>
            <Button small rightIcon="caret-down" text={t("report.export")} loading={exporting} />
          </Popover>
          <Popover position={Position.BOTTOM_RIGHT} content={moreMenu}>
            <Button small icon="more" aria-label={t("report.more")} />
          </Popover>
        </div>
      </div>
      {syncMessage ? (
        <p role="status" className="report-editor-sync-status">
          {syncMessage}
        </p>
      ) : null}
    </header>
  );
}
