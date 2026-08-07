import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import {
  Button,
  Tag,
  Icon,
  Popover,
  Menu,
  MenuItem,
  MenuDivider,
  Dialog,
  Switch,
  InputGroup,
  Classes,
} from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { db } from "../../firebase";
import { parseReportId, generateSummaryId } from "../../lib/reportUtils";
import type { ParsedReportId } from "../../lib/reportUtils";
import { formatWeekday } from "../../i18n/dateUtils";
import { useAuth } from "../../contexts/AuthContext";
import AppNavbar from "../shell/AppNavbar";
import { SectionAccentProvider } from "../shell/SectionAccent";
import type { Report, Session } from "../../types";

type ListReport = Report & ParsedReportId;
type ReducedReport = ListReport & {
  _date: string;
  _version: number;
  _isPlain: boolean;
};

interface ReportCardProps {
  report: ListReport;
  confId: string;
  dateContent: ReactNode;
  metaContent: ReactNode;
  deleteConfirmId: string | null;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
}

function ReportCard({
  report,
  confId,
  dateContent,
  metaContent,
  deleteConfirmId,
  onArchive,
  onUnarchive,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
}: ReportCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isArchived = report.status === "archived";
  const isSummary = report.id.startsWith("summary-");
  const statusIntent =
    report.status === "published" ? "success" : report.status === "archived" ? "warning" : "none";
  const statusLabel =
    report.status === "published"
      ? t("reportList.statusPublished")
      : report.status === "archived"
        ? t("reportList.statusArchived")
        : t("reportList.statusDraft");

  return (
    <div
      onClick={() => navigate(`/conference/${confId}/report/${report.id}`)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderLeft: "3px solid var(--accent)",
        borderRadius: "4px 3px 3px 4px",
        background: "var(--surface)",
        boxShadow: "0 1px 2px rgba(95,107,124,.12), 0 0 0 1px rgba(95,107,124,.10)",
        cursor: "pointer",
        opacity: isArchived ? 0.6 : undefined,
      }}
    >
      <Icon
        icon={isSummary ? IconNames.JOIN_TABLE : IconNames.DOCUMENT}
        size={20}
        style={{ color: "var(--accent)", flexShrink: 0 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontFamily: "'Work Sans', sans-serif",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {dateContent}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{metaContent}</span>
      </div>
      <Tag minimal intent={statusIntent}>
        {statusLabel}
      </Tag>
      <Button
        small
        minimal
        text={isArchived ? t("reportList.unarchive") : t("reportList.archive")}
        onClick={(e) => {
          e.stopPropagation();
          isArchived ? onUnarchive(report.id) : onArchive(report.id);
        }}
      />
      {isArchived &&
        (deleteConfirmId === report.id ? (
          <span
            style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: 11, color: "var(--accent)" }}>
              {t("reportList.confirmDelete")}
            </span>
            <Button
              small
              minimal
              intent="danger"
              text={t("common.delete")}
              onClick={() => onDelete(report.id)}
            />
            <Button small minimal text={t("common.cancel")} onClick={onDeleteCancel} />
          </span>
        ) : (
          <Button
            small
            minimal
            intent="danger"
            text={t("common.delete")}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteConfirm(report.id);
            }}
          />
        ))}
      <Icon icon={IconNames.CHEVRON_RIGHT} size={16} style={{ color: "var(--text-muted)" }} />
    </div>
  );
}

export default function ReportList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confId } = useParams() as { confId: string };
  const { user } = useAuth();
  const [reportDocs, setReportDocs] = useState<ListReport[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [creatingSummary, setCreatingSummary] = useState(false);
  const [showSummaryDatePicker, setShowSummaryDatePicker] = useState(false);
  const [summaryDateStart, setSummaryDateStart] = useState("");
  const [summaryDateEnd, setSummaryDateEnd] = useState("");

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences", confId, "dailyReports"), (snap) => {
      const docs = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Report, "id">),
          ...parseReportId(d.id),
        }))
        .sort((a, b) => b.id.localeCompare(a.id)) as ListReport[];
      setReportDocs(docs);
    });
  }, [user, confId]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      setAllSessions(snap.docs.map((d) => d.data() as Session));
    });
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
    const summaryReports = reportDocs.filter((r) => r.id.startsWith("summary-"));
    const dailyDocs = reportDocs.filter((r) => !r.id.startsWith("summary-"));

    const latestByDate = dailyDocs.reduce<Record<string, ReducedReport>>((acc, doc) => {
      const { date, version } = parseReportId(doc.id);
      const isPlain = doc.id === date;
      const existing = acc[date];
      if (!existing || isPlain || (!existing._isPlain && version > existing._version)) {
        acc[date] = {
          ...doc,
          _date: date,
          _version: version,
          _isPlain: isPlain,
        };
      }
      return acc;
    }, {});
    const dailyList: ReducedReport[] = Object.values(latestByDate).sort((a, b) =>
      b._date.localeCompare(a._date),
    );
    const filteredDaily: ListReport[] = showArchived
      ? dailyList.filter((r) => r.status === "archived")
      : dailyList.filter((r) => r.status !== "archived");
    const filteredSummary: ListReport[] = showArchived
      ? summaryReports.filter((r) => r.status === "archived")
      : summaryReports.filter((r) => r.status !== "archived");

    // Summary reports at top, then daily reports
    return [...filteredSummary.sort((a, b) => b.id.localeCompare(a.id)), ...filteredDaily];
  }, [reportDocs, showArchived]);

  // Dates that already have reports
  const reportedDates = useMemo(() => {
    const dates = new Set<string>();
    reportDocs.forEach((r) => {
      if (!r.id.startsWith("summary-")) dates.add(parseReportId(r.id).date);
    });
    return dates;
  }, [reportDocs]);

  // All session dates for the create dropdown
  const allSessionDates = useMemo(() => {
    const sessionDates = new Set(allSessions.map((s) => s.date).filter(Boolean) as string[]);
    return [...sessionDates].sort();
  }, [allSessions]);

  const handleCreateReport = (date: string) => {
    setShowDatePicker(false);
    // If report already exists, navigate to the existing one
    const existing = reportDocs.find((r) => parseReportId(r.id).date === date);
    navigate(`/conference/${confId}/report/${existing ? existing.id : date}`);
  };

  const archiveReport = (id: string) =>
    updateDoc(doc(db, "conferences", confId, "dailyReports", id), {
      status: "archived",
    });
  const unarchiveReport = (id: string) =>
    updateDoc(doc(db, "conferences", confId, "dailyReports", id), {
      status: "draft",
    });
  const handleDeleteReport = async (id: string) => {
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

  const handleCreateSummary = async (dateStart: string, dateEnd: string) => {
    setShowSummaryDatePicker(false);
    setCreatingSummary(true);
    try {
      const snap = await getDocs(collection(db, "conferences", confId, "dailyReports"));
      const allDocs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, "id">) }));
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

  const dateLabelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "'Work Sans', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };

  return (
    <SectionAccentProvider accent="report">
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <AppNavbar showConfTabs />
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "24px 20px 56px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* Status row + actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontFamily: "'Work Sans', sans-serif",
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              {displayReports.length} {t("reportList.reportCount")}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Switch
                checked={showArchived}
                onChange={() => setShowArchived(!showArchived)}
                label={
                  showArchived ? t("reportList.hideArchived") : t("reportList.showArchived")
                }
                style={{ marginBottom: 0 }}
              />
              <Button
                icon={IconNames.JOIN_TABLE}
                text={
                  creatingSummary ? t("reportList.creating") : t("reportList.createSummary")
                }
                onClick={openSummaryDatePicker}
                disabled={creatingSummary}
              />
              <Popover
                isOpen={showDatePicker}
                onInteraction={(nextOpen) => setShowDatePicker(nextOpen)}
                placement="bottom-end"
                content={
                  <Menu>
                    <MenuDivider title={t("reportList.selectDate")} />
                    {allSessionDates.map((date) => {
                      const weekday = formatWeekday(new Date(date + "T00:00"));
                      const count = allSessions.filter((s) => s.date === date).length;
                      const hasReport = reportedDates.has(date);
                      return (
                        <MenuItem
                          key={date}
                          icon={IconNames.CALENDAR}
                          text={
                            <span>
                              <span style={{ fontWeight: 600 }}>{date}</span>{" "}
                              <span style={{ color: "var(--text-muted)" }}>{weekday}</span>
                            </span>
                          }
                          labelElement={
                            hasReport ? t("reportList.alreadyCreated") : `${count} sessions`
                          }
                          onClick={() => handleCreateReport(date)}
                        />
                      );
                    })}
                  </Menu>
                }
              >
                <Button
                  intent="primary"
                  icon={IconNames.PLUS}
                  text={t("reportList.createDailyReport")}
                  disabled={allSessionDates.length === 0}
                  onClick={() => setShowDatePicker(!showDatePicker)}
                />
              </Popover>
            </div>
          </div>

          {/* Report cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {displayReports.length === 0 ? (
              <p
                style={{
                  color: "var(--text-muted)",
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
                        <>
                          <Tag
                            minimal
                            intent="danger"
                            style={{ borderRadius: 6, fontWeight: 700 }}
                          >
                            {t("reportList.summaryBadge")}
                          </Tag>
                          {r.title}
                        </>
                      }
                      metaContent={
                        <span>{(r.sourceReports || []).join(", ")}</span>
                      }
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
                        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                          {weekday}
                        </span>
                      </>
                    }
                    metaContent={
                      <span>{Object.keys(r.sessions || {}).length} sessions</span>
                    }
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

        {/* Summary date-range picker */}
        <Dialog
          isOpen={showSummaryDatePicker}
          onClose={() => setShowSummaryDatePicker(false)}
          title={t("reportList.summaryDateRange")}
          icon={IconNames.JOIN_TABLE}
          style={{ width: 400 }}
        >
          <div className={Classes.DIALOG_BODY}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={dateLabelStyle}>
                {t("reportList.startDate")}
                <InputGroup
                  type="date"
                  value={summaryDateStart}
                  onChange={(e) => setSummaryDateStart(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              </label>
              <label style={dateLabelStyle}>
                {t("reportList.endDate")}
                <InputGroup
                  type="date"
                  value={summaryDateEnd}
                  onChange={(e) => setSummaryDateEnd(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              </label>
            </div>
          </div>
          <div className={Classes.DIALOG_FOOTER}>
            <div className={Classes.DIALOG_FOOTER_ACTIONS}>
              <Button onClick={() => setShowSummaryDatePicker(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                intent="primary"
                disabled={!summaryDateStart || !summaryDateEnd}
                loading={creatingSummary}
                onClick={() => handleCreateSummary(summaryDateStart, summaryDateEnd)}
              >
                {t("reportList.confirmCreate")}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </SectionAccentProvider>
  );
}
