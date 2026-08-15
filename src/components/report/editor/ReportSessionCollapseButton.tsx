import { Button } from "@blueprintjs/core";
import { useTranslation } from "react-i18next";

export interface ReportSessionCollapseButtonProps {
  collapsed: boolean;
  sessionLabel: string;
  onToggle(): void;
}

export default function ReportSessionCollapseButton({
  collapsed,
  sessionLabel,
  onToggle,
}: ReportSessionCollapseButtonProps) {
  const { t } = useTranslation();

  return (
    <Button
      minimal
      small
      icon={collapsed ? "chevron-right" : "chevron-down"}
      aria-expanded={!collapsed}
      aria-label={t(collapsed ? "report.expandSession" : "report.collapseSession", {
        session: sessionLabel,
      })}
      onClick={onToggle}
      className="session-collapse-btn no-print"
    />
  );
}
