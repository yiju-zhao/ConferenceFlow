import { useTranslation } from "react-i18next";
import AppNavbar from "../../shell/AppNavbar";
import { SectionAccentProvider } from "../../shell/SectionAccent";

export default function DailyReportSkeleton({ viewMode = false }: { viewMode?: boolean }) {
  const { t } = useTranslation();
  const label = viewMode ? t("report.loadingReport") : t("report.editorLoading");

  return (
    <SectionAccentProvider accent="report">
      <div className={`report-page report-skeleton-page${viewMode ? " report-view-mode" : ""}`}>
        {!viewMode && <AppNavbar showConfTabs />}
        <div role="status" aria-label={label} aria-busy="true" className="report-skeleton-status">
          <span className="report-skeleton-a11y">{label}</span>
          {!viewMode && <div className="report-skeleton-toolbar report-skeleton-shimmer" />}
          <div className={`report-skeleton-workspace${viewMode ? " is-view-mode" : ""}`}>
            {!viewMode && (
              <aside className="report-skeleton-outline" aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => (
                  <span key={index} className="report-skeleton-line report-skeleton-shimmer" />
                ))}
              </aside>
            )}
            <div className="report-skeleton-document" aria-hidden="true">
              <div className="report-skeleton-title" />
              <div className="report-skeleton-summary">
                <div className="report-skeleton-panel report-skeleton-shimmer" />
                <div className="report-skeleton-panel report-skeleton-shimmer" />
              </div>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="report-skeleton-session report-skeleton-shimmer" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionAccentProvider>
  );
}
