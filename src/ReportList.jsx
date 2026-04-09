import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { parseReportId, generateSummaryId } from "./lib/reportUtils";
import { formatWeekday } from "./i18n/dateUtils";
import { useAuth } from "./contexts/AuthContext";
import UserAvatar from "./components/UserAvatar";

function ReportCard({
  report,
  confId,
  dateContent,
  metaContent,
  linkText,
  deleteConfirmId,
  onArchive,
  onUnarchive,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
}) {
  const { t } = useTranslation();
  const isArchived = report.status === "archived";

  return (
    <div
      className="report-card"
      style={isArchived ? { opacity: 0.6 } : undefined}
    >
      <div className="report-card-main">
        <div className="report-card-date">{dateContent}</div>
        <div className="report-card-meta">{metaContent}</div>
      </div>
      <div className="report-card-right">
        <button
          className="report-archive-btn"
          onClick={() =>
            isArchived ? onUnarchive(report.id) : onArchive(report.id)
          }
        >
          {isArchived
            ? t("reportList.unarchive")
            : t("reportList.archive")}
        </button>
        {isArchived &&
          (deleteConfirmId === report.id ? (
            <span
              style={{
                display: "inline-flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "#CF0A2C" }}>
                {t("reportList.confirmDelete")}
              </span>
              <button
                className="report-archive-btn"
                style={{ color: "#CF0A2C", fontWeight: 700 }}
                onClick={() => onDelete(report.id)}
              >
                {t("common.delete")}
              </button>
              <button
                className="report-archive-btn"
                onClick={onDeleteCancel}
              >
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button
              className="report-archive-btn"
              style={{ color: "#CF0A2C" }}
              onClick={() => onDeleteConfirm(report.id)}
            >
              {t("common.delete")}
            </button>
          ))}
        <Link
          to={`/conference/${confId}/report/${report.id}`}
          className="report-card-view-btn"
        >
          {linkText} &rarr;
        </Link>
      </div>
    </div>
  );
}

export default function ReportList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confId } = useParams();
  const { user } = useAuth();
  const [reportDocs, setReportDocs] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [creatingSummary, setCreatingSummary] = useState(false);
  const [showSummaryDatePicker, setShowSummaryDatePicker] = useState(false);
  const [summaryDateStart, setSummaryDateStart] = useState("");
  const [summaryDateEnd, setSummaryDateEnd] = useState("");

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "conferences", confId, "dailyReports"),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data(), ...parseReportId(d.id) }))
          .sort((a, b) => b.id.localeCompare(a.id));
        setReportDocs(docs);
      },
    );
  }, [user, confId]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "conferences", confId, "sessions"),
      (snap) => {
        setAllSessions(snap.docs.map((d) => d.data()));
      },
    );
  }, [user, confId]);

  // Daily report dates (non-summary)
  const dailyReportDates = useMemo(() => {
    return reportDocs
      .filter((r) => !r.id.startsWith("summary-"))
      .map((r) => parseReportId(r.id).date)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
  }, [reportDocs]);

  // Show only the latest version per date, plus summary reports at top
  const displayReports = useMemo(() => {
    // Separate summary reports from daily reports
    const summaryReports = reportDocs.filter((r) =>
      r.id.startsWith("summary-"),
    );
    const dailyDocs = reportDocs.filter((r) => !r.id.startsWith("summary-"));

    const latestByDate = dailyDocs.reduce((acc, doc) => {
      const { date, version } = parseReportId(doc.id);
      const isPlain = doc.id === date;
      const existing = acc[date];
      if (
        !existing ||
        isPlain ||
        (!existing._isPlain && version > existing._version)
      ) {
        acc[date] = {
          ...doc,
          _date: date,
          _version: version,
          _isPlain: isPlain,
        };
      }
      return acc;
    }, {});
    const dailyList = Object.values(latestByDate).sort((a, b) =>
      b._date.localeCompare(a._date),
    );
    const filteredDaily = showArchived
      ? dailyList.filter((r) => r.status === "archived")
      : dailyList.filter((r) => r.status !== "archived");
    const filteredSummary = showArchived
      ? summaryReports.filter((r) => r.status === "archived")
      : summaryReports.filter((r) => r.status !== "archived");

    // Summary reports at top, then daily reports
    return [
      ...filteredSummary.sort((a, b) => b.id.localeCompare(a.id)),
      ...filteredDaily,
    ];
  }, [reportDocs, showArchived]);

  // Dates that already have reports
  const reportedDates = useMemo(() => {
    const dates = new Set();
    reportDocs.forEach((r) => {
      if (!r.id.startsWith("summary-")) dates.add(parseReportId(r.id).date);
    });
    return dates;
  }, [reportDocs]);

  // All session dates for the create dropdown
  const allSessionDates = useMemo(() => {
    const sessionDates = new Set(
      allSessions.map((s) => s.date).filter(Boolean),
    );
    return [...sessionDates].sort();
  }, [allSessions]);

  const handleCreateReport = (date) => {
    setShowDatePicker(false);
    // If report already exists, navigate to the existing one
    const existing = reportDocs.find((r) => parseReportId(r.id).date === date);
    navigate(`/conference/${confId}/report/${existing ? existing.id : date}`);
  };

  const archiveReport = (id) =>
    updateDoc(doc(db, "conferences", confId, "dailyReports", id), {
      status: "archived",
    });
  const unarchiveReport = (id) =>
    updateDoc(doc(db, "conferences", confId, "dailyReports", id), {
      status: "draft",
    });
  const handleDeleteReport = async (id) => {
    await deleteDoc(doc(db, "conferences", confId, "dailyReports", id));
    setDeleteConfirmId(null);
  };

  const openSummaryDatePicker = () => {
    // Pre-fill with earliest and latest daily report dates
    const dates = dailyReportDates;
    setSummaryDateStart(dates.length > 0 ? dates[0] : "");
    setSummaryDateEnd(dates.length > 0 ? dates[dates.length - 1] : "");
    setShowSummaryDatePicker(true);
  };

  const handleCreateSummary = async (dateStart, dateEnd) => {
    setShowSummaryDatePicker(false);
    setCreatingSummary(true);
    try {
      const snap = await getDocs(
        collection(db, "conferences", confId, "dailyReports"),
      );
      const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const summaryId = generateSummaryId(allDocs);

      await setDoc(doc(db, "conferences", confId, "dailyReports", summaryId), {
        type: "summary",
        title: t("reportList.summaryTitle"),
        status: "draft",
        dateStart,
        dateEnd,
        sections: {
          [t("reportList.sectionVoices")]: { order: 0, blocks: [] },
          [t("reportList.sectionTrends")]: { order: 1, blocks: [] },
          [t("reportList.sectionAnalysis")]: { order: 2, blocks: [] },
          [t("reportList.sectionInsights")]: { order: 3, blocks: [] },
        },
        citations: [],
        sitePhotos: [],
        onsiteEvents: [],
      });

      navigate(`/conference/${confId}/report/${summaryId}`);
    } catch (err) {
      console.error("Failed to create summary:", err);
      alert(t("reportList.createSummaryFailed"));
    } finally {
      setCreatingSummary(false);
    }
  };

  return (
    <div className="report-page report-list-page">
      <div className="report-toolbar no-print">
        <div
          className="report-toolbar-inner"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Link to={`/conference/${confId}`} className="report-back-btn">
            {t("reportList.backToSchedule")}
          </Link>
          <UserAvatar size={28} onSignOut={() => navigate("/login")} />
        </div>
      </div>

      <div className="report-container" style={{ marginTop: 24 }}>
        <div className="report-list-header">
          <div>
            <div className="report-title-eyebrow" style={{ marginBottom: 4 }}>
              GTC 2026 · DAILY BRIEFING
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              {t("reportList.reportManagement")}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className={`report-archived-toggle${showArchived ? " active" : ""}`}
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived
                ? t("reportList.hideArchived")
                : t("reportList.showArchived")}
            </button>
            <button
              className="btn-accent"
              onClick={openSummaryDatePicker}
              disabled={creatingSummary}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              {creatingSummary
                ? t("reportList.creating")
                : t("reportList.createSummary")}
            </button>
            <div style={{ position: "relative" }}>
              <button
                className="btn-accent"
                onClick={() => setShowDatePicker(!showDatePicker)}
                disabled={allSessionDates.length === 0}
                style={{
                  fontSize: 13,
                  padding: "8px 16px",
                  gap: 6,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {t("reportList.createDailyReport")}
              </button>
              {showDatePicker && allSessionDates.length > 0 && (
                <div className="create-report-dropdown">
                  <div className="create-report-dropdown-label">
                    {t("reportList.selectDate")}
                  </div>
                  {allSessionDates.map((date) => {
                    const weekday = formatWeekday(new Date(date + "T00:00"));
                    const count = allSessions.filter(
                      (s) => s.date === date,
                    ).length;
                    const hasReport = reportedDates.has(date);
                    return (
                      <button
                        key={date}
                        className="create-report-dropdown-item"
                        onClick={() => handleCreateReport(date)}
                      >
                        <span className="font-mono" style={{ fontWeight: 600 }}>
                          {date}
                        </span>
                        <span style={{ color: "#888" }}>{weekday}</span>
                        <span
                          style={{
                            color: "#aaa",
                            fontSize: 11,
                            marginLeft: "auto",
                          }}
                        >
                          {hasReport
                            ? t("reportList.alreadyCreated")
                            : `${count} sessions`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="report-list-cards">
          {displayReports.length === 0 ? (
            <p
              style={{
                color: "#AAAAAA",
                textAlign: "center",
                padding: "48px 0",
              }}
            >
              {t("reportList.noReports")}
            </p>
          ) : (
            displayReports.map((r) => {
              const isSummary = r.id.startsWith("summary-");

              if (isSummary) {
                return (
                  <ReportCard
                    key={r.id}
                    report={r}
                    confId={confId}
                    dateContent={
                      <span className="summary-badge">
                        {t("reportList.summaryBadge")}
                      </span>
                    }
                    metaContent={
                      <span style={{ fontSize: 12, color: "#888" }}>
                        {(r.sourceReports || []).join(", ")}
                      </span>
                    }
                    linkText={t("reportList.manageSummary")}
                    deleteConfirmId={deleteConfirmId}
                    onArchive={archiveReport}
                    onUnarchive={unarchiveReport}
                    onDelete={handleDeleteReport}
                    onDeleteConfirm={setDeleteConfirmId}
                    onDeleteCancel={() => setDeleteConfirmId(null)}
                  />
                );
              }

              const weekday = formatWeekday(new Date(r.date + "T00:00"));
              return (
                <ReportCard
                  key={r.id}
                  report={r}
                  confId={confId}
                  dateContent={
                    <>
                      {r.date}{" "}
                      <span style={{ fontWeight: 400, color: "#888" }}>
                        {weekday}
                      </span>
                    </>
                  }
                  metaContent={
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {Object.keys(r.sessions || {}).length} sessions
                    </span>
                  }
                  linkText={t("reportList.viewReport")}
                  deleteConfirmId={deleteConfirmId}
                  onArchive={archiveReport}
                  onUnarchive={unarchiveReport}
                  onDelete={handleDeleteReport}
                  onDeleteConfirm={setDeleteConfirmId}
                  onDeleteCancel={() => setDeleteConfirmId(null)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ── Summary Date Picker Modal ─────────────────────────── */}
      {showSummaryDatePicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowSummaryDatePicker(false)}
        >
          <div
            style={{
              background: "#fff",
              maxWidth: 400,
              width: "90vw",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                background: "#CF0A2C",
                padding: "14px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "Work Sans, sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#fff",
                  letterSpacing: "0.3px",
                }}
              >
                {t("reportList.summaryDateRange")}
              </span>
              <button
                style={{
                  background: "rgba(255,255,255,0.18)",
                  border: "none",
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: "pointer",
                  color: "#fff",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => setShowSummaryDatePicker(false)}
              >
                ×
              </button>
            </div>
            <div style={{ padding: "24px 24px 0" }}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                <label
                  style={{
                    fontFamily: "Work Sans, sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#888",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  {t("reportList.startDate")}
                  <input
                    type="date"
                    value={summaryDateStart}
                    onChange={(e) => setSummaryDateStart(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      padding: "10px 12px",
                      border: "1px solid #E8E4DF",
                      borderRadius: 6,
                      fontSize: 14,
                      background: "#F7F5F2",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
                <label
                  style={{
                    fontFamily: "Work Sans, sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#888",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  {t("reportList.endDate")}
                  <input
                    type="date"
                    value={summaryDateEnd}
                    onChange={(e) => setSummaryDateEnd(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      padding: "10px 12px",
                      border: "1px solid #E8E4DF",
                      borderRadius: 6,
                      fontSize: 14,
                      background: "#F7F5F2",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "20px 24px 24px",
              }}
            >
              <button
                style={{
                  fontFamily: "Work Sans, sans-serif",
                  padding: "8px 18px",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.5px",
                  background: "none",
                  border: "1px solid #E8E4DF",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: "#888",
                  textTransform: "uppercase",
                }}
                onClick={() => setShowSummaryDatePicker(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn-accent"
                style={{
                  padding: "8px 20px",
                  fontSize: 12,
                  fontFamily: "Work Sans, sans-serif",
                  letterSpacing: "0.5px",
                }}
                disabled={!summaryDateStart || !summaryDateEnd}
                onClick={() =>
                  handleCreateSummary(summaryDateStart, summaryDateEnd)
                }
              >
                {t("reportList.confirmCreate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
