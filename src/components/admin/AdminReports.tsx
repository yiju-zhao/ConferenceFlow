import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";
import { parseReportId } from "../../lib/reportUtils";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../../i18n/dateUtils";
import type { Report } from "../../types";

export default function AdminReports() {
  const { confId } = useParams();
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    if (!confId) return;
    return onSnapshot(collection(db, "conferences", confId, "dailyReports"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, "id">) }));
      arr.sort((a, b) => b.id.localeCompare(a.id));
      setReports(arr);
    });
  }, [confId]);

  const handlePublish = async (reportId: string) => {
    setPublishing(reportId);
    try {
      await apiFetch(`/api/conferences/${confId}/reports/${reportId}`, {
        method: "POST",
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPublishing(null);
    }
  };

  const handleUnpublish = async (reportId: string) => {
    setPublishing(reportId);
    try {
      await apiFetch(`/api/conferences/${confId}/reports/${reportId}`, {
        method: "DELETE",
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPublishing(null);
    }
  };

  const statusColor = (status: string | undefined) => {
    switch (status) {
      case "published":
        return "text-[#27AE60]";
      case "archived":
        return "text-secondary";
      default:
        return "text-[#E67E22]";
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1 h-6 rounded-full bg-admin-teal"></div>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          {t("admin.reportManagement")}
        </h2>
      </div>
      <div className="bg-white border border-[#E8E4DF] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-secondary text-xs uppercase tracking-wider bg-[#F7F5F2]">
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.reportName")}</th>
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.status")}</th>
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.publishedAt")}</th>
              <th className="p-3 w-48 border-b border-[#E8E4DF]">{t("admin.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const { date } = parseReportId(r.id);
              const isSummary = r.id.startsWith("summary-");
              return (
                <tr
                  key={r.id}
                  className="border-t border-[#E8E4DF] hover:bg-[#FAFAF8] transition-colors"
                >
                  <td className="p-3">
                    <Link
                      to={`/conference/${confId}/report/${r.id}`}
                      className="text-on-surface hover:text-admin-teal transition-colors"
                    >
                      {r.title || r.id}
                    </Link>
                    <div className="text-secondary text-xs mt-0.5">
                      {isSummary ? t("admin.summaryReport") : `${t("admin.daily")} · ${date}`}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs uppercase tracking-wider ${statusColor(r.status)}`}>
                      {r.status || t("admin.draft")}
                    </span>
                  </td>
                  <td className="p-3 text-secondary text-xs">
                    {r.publishedAt ? formatDateTime(new Date(r.publishedAt.seconds * 1000)) : "—"}
                  </td>
                  <td className="p-3">
                    {r.status === "published" ? (
                      <button
                        onClick={() => handleUnpublish(r.id)}
                        disabled={publishing === r.id}
                        className="bg-white border border-[#E8E4DF] text-secondary px-3 py-1 text-xs uppercase tracking-wider hover:text-admin-teal hover:border-admin-teal/30 disabled:opacity-50 rounded-lg transition-all"
                      >
                        {publishing === r.id ? "..." : t("admin.unpublish")}
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublish(r.id)}
                        disabled={publishing === r.id}
                        className="bg-admin-teal text-white px-3 py-1 text-xs uppercase tracking-wider hover:bg-admin-teal-deep disabled:opacity-50 rounded-lg shadow-sm transition-all"
                      >
                        {publishing === r.id ? "..." : t("admin.publish")}
                      </button>
                    )}
                    {r.publishedUrl && (
                      <a
                        href={r.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary text-xs uppercase tracking-wider ml-3 hover:text-on-surface"
                      >
                        {t("admin.view")}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {reports.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-secondary text-sm">
                  {t("admin.noReports")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
