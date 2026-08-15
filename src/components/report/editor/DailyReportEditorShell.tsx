import type { ReactNode } from "react";
import AppNavbar from "../../shell/AppNavbar";
import { SectionAccentProvider } from "../../shell/SectionAccent";
import DailyReportOutline, { type DailyReportOutlineItem } from "./DailyReportOutline";

export interface DailyReportEditorShellProps {
  viewMode: boolean;
  toolbar?: ReactNode;
  outlineLabel: string;
  outlineItems: readonly DailyReportOutlineItem[];
  status?: ReactNode;
  overlays?: ReactNode;
  children: ReactNode;
}

export default function DailyReportEditorShell(props: DailyReportEditorShellProps) {
  const { viewMode, toolbar, outlineLabel, outlineItems, status, overlays, children } = props;
  return (
    <SectionAccentProvider accent="report">
      <div className={`report-page${viewMode ? " report-view-mode" : " report-editor-page"}`}>
        {!viewMode && <AppNavbar showConfTabs />}
        {!viewMode ? toolbar : null}
        {!viewMode ? status : null}
        {overlays}
        {viewMode ? (
          children
        ) : (
          <main className="report-editor-workspace">
            <DailyReportOutline label={outlineLabel} items={outlineItems} />
            <div className="report-editor-document">{children}</div>
          </main>
        )}
      </div>
    </SectionAccentProvider>
  );
}
