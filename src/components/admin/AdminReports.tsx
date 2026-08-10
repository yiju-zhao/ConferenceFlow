import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { Button, Card, Tag } from "@blueprintjs/core";
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

  const statusIntent = (status: string | undefined) => {
    switch (status) {
      case "published":
        return "success" as const;
      case "archived":
        return "none" as const;
      default:
        return "warning" as const;
    }
  };

  const thStyle: React.CSSProperties = {
    padding: 12,
    borderBottom: "1px solid var(--border)",
    textAlign: "left",
    color: "var(--text-secondary)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 600,
  };
  const tdStyle: React.CSSProperties = {
    padding: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 14,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <div style={{ width: 4, height: 24, borderRadius: 9999, background: "var(--accent)" }} />
        <h2
          style={{
            fontFamily: "'Work Sans', sans-serif",
            color: "var(--text-primary)",
            fontSize: 18,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          {t("admin.reportManagement")}
        </h2>
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-warm)" }}>
              <th style={thStyle}>{t("admin.reportName")}</th>
              <th style={thStyle}>{t("admin.status")}</th>
              <th style={thStyle}>{t("admin.publishedAt")}</th>
              <th style={{ ...thStyle, width: 192 }}>{t("admin.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const { date } = parseReportId(r.id);
              const isSummary = r.id.startsWith("summary-");
              return (
                <tr key={r.id}>
                  <td style={tdStyle}>
                    <Link
                      to={`/conference/${confId}/report/${r.id}`}
                      style={{ color: "var(--text-primary)", textDecoration: "none" }}
                    >
                      {r.title || r.id}
                    </Link>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 2 }}>
                      {isSummary ? t("admin.summaryReport") : `${t("admin.daily")} · ${date}`}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <Tag minimal intent={statusIntent(r.status)}>
                      {r.status || t("admin.draft")}
                    </Tag>
                  </td>
                  <td style={{ ...tdStyle, color: "var(--text-secondary)", fontSize: 12 }}>
                    {r.publishedAt ? formatDateTime(new Date(r.publishedAt.seconds * 1000)) : "—"}
                  </td>
                  <td style={tdStyle}>
                    {r.status === "published" ? (
                      <Button
                        small
                        outlined
                        onClick={() => handleUnpublish(r.id)}
                        disabled={publishing === r.id}
                        text={publishing === r.id ? "..." : t("admin.unpublish")}
                      />
                    ) : (
                      <Button
                        small
                        intent="primary"
                        onClick={() => handlePublish(r.id)}
                        disabled={publishing === r.id}
                        text={publishing === r.id ? "..." : t("admin.publish")}
                      />
                    )}
                    {r.publishedUrl && (
                      <a
                        href={r.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--accent)",
                          fontSize: 12,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginLeft: 12,
                          textDecoration: "none",
                        }}
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
                <td
                  colSpan={4}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                  }}
                >
                  {t("admin.noReports")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
