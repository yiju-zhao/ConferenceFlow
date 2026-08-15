import { lazy, Suspense } from "react";
import { useLocation, useParams } from "react-router-dom";
import DailyReportSkeleton from "./editor/DailyReportSkeleton";

const DailyReport = lazy(() => import("./DailyReport"));
const ConferenceReport = lazy(() => import("./ConferenceReport"));

interface ReportRouterProps {
  viewMode?: boolean;
}

export default function ReportRouter({ viewMode = false }: ReportRouterProps) {
  const { reportId } = useParams() as { reportId: string };
  const { search } = useLocation();
  const effectiveViewMode = viewMode || new URLSearchParams(search).get("preview") === "1";

  if (reportId.startsWith("summary-")) {
    return <ConferenceReport />;
  }

  return (
    <Suspense fallback={<DailyReportSkeleton viewMode={effectiveViewMode} />}>
      <DailyReport viewMode={effectiveViewMode} />
    </Suspense>
  );
}
