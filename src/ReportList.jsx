import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, updateDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { DAY_CN, parseReportId, generateSummaryId, SESSION_CATALOG } from "./shared";

export default function ReportList() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [reportDocs, setReportDocs] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summarySelections, setSummarySelections] = useState({});
  const [creatingSummary, setCreatingSummary] = useState(false);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "dailyReports"), snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data(), ...parseReportId(d.id) }))
        .sort((a, b) => b.id.localeCompare(a.id));
      setReportDocs(docs);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "sessions"), snap => {
      setAllSessions(snap.docs.map(d => d.data()));
    });
  }, [user]);

  // Daily report dates (non-summary)
  const dailyReportDates = useMemo(() => {
    return reportDocs
      .filter(r => !r.id.startsWith("summary-"))
      .map(r => parseReportId(r.id).date)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
  }, [reportDocs]);

  // Show only the latest version per date, plus summary reports at top
  const displayReports = (() => {
    // Separate summary reports from daily reports
    const summaryReports = reportDocs.filter(r => r.id.startsWith("summary-"));
    const dailyDocs = reportDocs.filter(r => !r.id.startsWith("summary-"));

    const latestByDate = dailyDocs.reduce((acc, doc) => {
      const { date, version } = parseReportId(doc.id);
      const isPlain = doc.id === date;
      const existing = acc[date];
      if (!existing || isPlain || (!existing._isPlain && version > existing._version)) {
        acc[date] = { ...doc, _date: date, _version: version, _isPlain: isPlain };
      }
      return acc;
    }, {});
    const dailyList = Object.values(latestByDate).sort((a, b) => b._date.localeCompare(a._date));
    const filteredDaily = showArchived ? dailyList : dailyList.filter(r => r.status !== "archived");
    const filteredSummary = showArchived ? summaryReports : summaryReports.filter(r => r.status !== "archived");

    // Summary reports at top, then daily reports
    return [...filteredSummary.sort((a, b) => b.id.localeCompare(a.id)), ...filteredDaily];
  })();

  // Dates that already have reports
  const reportedDates = useMemo(() => {
    const dates = new Set();
    reportDocs.forEach(r => {
      if (!r.id.startsWith("summary-")) dates.add(parseReportId(r.id).date);
    });
    return dates;
  }, [reportDocs]);

  // All session dates for the create dropdown
  const allSessionDates = useMemo(() => {
    const sessionDates = new Set(allSessions.map(s => s.date).filter(Boolean));
    return [...sessionDates].sort();
  }, [allSessions]);

  const handleCreateReport = (date) => {
    setShowDatePicker(false);
    // If report already exists, navigate to the existing one
    const existing = reportDocs.find(r => parseReportId(r.id).date === date);
    navigate(`/report/${existing ? existing.id : date}`);
  };

  const archiveReport = (id) => updateDoc(doc(db, "dailyReports", id), { status: "archived" });
  const unarchiveReport = (id) => updateDoc(doc(db, "dailyReports", id), { status: "draft" });

  const genBlockId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

  const handleCreateSummary = async () => {
    const selectedDates = Object.entries(summarySelections)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
    if (selectedDates.length === 0) return;

    setCreatingSummary(true);
    try {
      // Read all daily reports from Firestore
      const snap = await getDocs(collection(db, "dailyReports"));
      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filter to selected dates (non-summary docs)
      const selectedReports = allDocs
        .filter(d => !d.id.startsWith("summary-") && selectedDates.includes(parseReportId(d.id).date))
        .sort((a, b) => {
          const dateA = parseReportId(a.id).date;
          const dateB = parseReportId(b.id).date;
          return dateA.localeCompare(dateB);
        });

      // Build "现场声音" blocks from onsiteInfoBlocks + reflectionsBlocks
      const voiceBlocks = [];
      for (const report of selectedReports) {
        const date = parseReportId(report.id).date;
        const weekday = DAY_CN[new Date(date + "T00:00").getDay()];
        // Add day sub-heading
        voiceBlocks.push({ id: genBlockId(), type: "heading", content: `${date} ${weekday}` });

        const onsiteBlocks = report.onsiteInfoBlocks || [];
        for (const block of onsiteBlocks) {
          voiceBlocks.push({ ...block, id: genBlockId() });
        }

        const reflectionsBlocks = report.reflectionsBlocks || [];
        for (const block of reflectionsBlocks) {
          voiceBlocks.push({ ...block, id: genBlockId() });
        }
      }

      // Build "关键启示" blocks from summaryPoints + session insights
      const insightBlocks = [];
      for (const report of selectedReports) {
        const date = parseReportId(report.id).date;
        const weekday = DAY_CN[new Date(date + "T00:00").getDay()];
        // Add day sub-heading
        insightBlocks.push({ id: genBlockId(), type: "heading", content: `${date} ${weekday}` });

        // summaryPoints as body blocks
        const points = report.summaryPoints || [];
        for (const point of points) {
          if (point) {
            insightBlocks.push({ id: genBlockId(), type: "body", content: point });
          }
        }

        // Session insights
        const sessions = report.sessions || {};
        for (const [sessionId, sd] of Object.entries(sessions)) {
          if (sd.insights) {
            const catalog = SESSION_CATALOG.get(sessionId);
            const label = catalog ? catalog.title : sessionId;
            insightBlocks.push({ id: genBlockId(), type: "heading", content: label });
            insightBlocks.push({ id: genBlockId(), type: "body", content: sd.insights });
          }
        }
      }

      // Build sitePhotos with date field added
      const allSitePhotos = [];
      for (const report of selectedReports) {
        const date = parseReportId(report.id).date;
        const photos = report.sitePhotos || [];
        for (const photo of photos) {
          allSitePhotos.push({ ...photo, date });
        }
      }

      // "趋势总结" and "推演分析" — empty sections with placeholder headings
      const trendBlocks = [{ id: genBlockId(), type: "heading", content: "趋势总结" }];
      const deductionBlocks = [{ id: genBlockId(), type: "heading", content: "推演分析" }];

      // Generate summary ID
      const summaryId = generateSummaryId(allDocs);

      // Create document
      await setDoc(doc(db, "dailyReports", summaryId), {
        type: "summary",
        title: "GTC 2026 总结稿",
        status: "draft",
        sourceReports: selectedDates,
        sections: {
          "现场声音": { order: 0, blocks: voiceBlocks },
          "趋势总结": { order: 1, blocks: trendBlocks },
          "推演分析": { order: 2, blocks: deductionBlocks },
          "关键启示": { order: 3, blocks: insightBlocks },
        },
        citations: [],
        sitePhotos: allSitePhotos,
      });

      setShowSummaryModal(false);
      navigate(`/report/${summaryId}`);
    } catch (err) {
      console.error("Failed to create summary:", err);
      alert("创建总结稿失败，请重试");
    } finally {
      setCreatingSummary(false);
    }
  };

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <Link to="/" className="report-back-btn">&larr; 返回日程</Link>
        </div>
      </div>

      <div className="report-container" style={{ marginTop: 24 }}>
        <div className="report-list-header">
          <div>
            <div className="report-title-eyebrow" style={{ marginBottom: 4 }}>GTC 2026 · DAILY BRIEFING</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A1A" }}>日报管理</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className={`report-archived-toggle${showArchived ? " active" : ""}`}
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "隐藏已归档" : "显示已归档"}
            </button>
            <button
              className="btn-accent"
              onClick={() => {
                const sel = {};
                dailyReportDates.forEach(d => { sel[d] = true; });
                setSummarySelections(sel);
                setShowSummaryModal(true);
              }}
              disabled={dailyReportDates.length === 0}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              + 创建总结稿
            </button>
            <div style={{ position: "relative" }}>
              <button
                className="btn-accent"
                onClick={() => setShowDatePicker(!showDatePicker)}
                disabled={allSessionDates.length === 0}
                style={{ fontSize: 13, padding: "8px 16px", gap: 6, display: "flex", alignItems: "center" }}
              >
                + 创建日报
              </button>
              {showDatePicker && allSessionDates.length > 0 && (
                <div className="create-report-dropdown">
                  <div className="create-report-dropdown-label">选择日期</div>
                  {allSessionDates.map(date => {
                    const weekday = DAY_CN[new Date(date + "T00:00").getDay()];
                    const count = allSessions.filter(s => s.date === date).length;
                    const hasReport = reportedDates.has(date);
                    return (
                      <button
                        key={date}
                        className="create-report-dropdown-item"
                        onClick={() => handleCreateReport(date)}
                      >
                        <span className="font-mono" style={{ fontWeight: 600 }}>{date}</span>
                        <span style={{ color: "#888" }}>{weekday}</span>
                        <span style={{ color: "#aaa", fontSize: 11, marginLeft: "auto" }}>
                          {hasReport ? "已创建" : `${count} sessions`}
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
            <p style={{ color: "#AAAAAA", textAlign: "center", padding: "48px 0" }}>
              暂无日报，点击「创建日报」开始
            </p>
          ) : displayReports.map(r => {
            const isSummary = r.id.startsWith("summary-");
            const isArchived = r.status === "archived";

            if (isSummary) {
              return (
                <div key={r.id} className="report-card" style={isArchived ? { opacity: 0.6 } : undefined}>
                  <div className="report-card-main">
                    <div className="report-card-date">
                      <span className="summary-badge">总结稿</span>
                    </div>
                    <div className="report-card-meta">
                      <span style={{ fontSize: 12, color: "#888" }}>
                        {(r.sourceReports || []).join(", ")}
                      </span>
                    </div>
                  </div>
                  <div className="report-card-right">
                    <button
                      className="report-archive-btn"
                      onClick={() => isArchived ? unarchiveReport(r.id) : archiveReport(r.id)}
                    >
                      {isArchived ? "取消归档" : "归档"}
                    </button>
                    <Link to={`/report/${r.id}`} className="report-card-view-btn">
                      查看总结稿 &rarr;
                    </Link>
                  </div>
                </div>
              );
            }

            const weekday = DAY_CN[new Date(r.date + "T00:00").getDay()];
            return (
              <div key={r.id} className="report-card" style={isArchived ? { opacity: 0.6 } : undefined}>
                <div className="report-card-main">
                  <div className="report-card-date">
                    {r.date} <span style={{ fontWeight: 400, color: "#888" }}>{weekday}</span>
                  </div>
                  <div className="report-card-meta">
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {Object.keys(r.sessions || {}).length} sessions
                    </span>
                  </div>
                </div>
                <div className="report-card-right">
                  <button
                    className="report-archive-btn"
                    onClick={() => isArchived ? unarchiveReport(r.id) : archiveReport(r.id)}
                  >
                    {isArchived ? "取消归档" : "归档"}
                  </button>
                  <Link to={`/report/${r.id}`} className="report-card-view-btn">
                    查看日报 &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary creation modal */}
      {showSummaryModal && (
        <div className="share-modal-overlay" onClick={() => !creatingSummary && setShowSummaryModal(false)}>
          <div className="share-modal-card" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>创建总结稿</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#888" }}>选择要汇总的日报日期：</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {dailyReportDates.map(date => {
                const weekday = DAY_CN[new Date(date + "T00:00").getDay()];
                return (
                  <label key={date} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!summarySelections[date]}
                      onChange={e => setSummarySelections(prev => ({ ...prev, [date]: e.target.checked }))}
                      disabled={creatingSummary}
                    />
                    <span className="font-mono" style={{ fontWeight: 600 }}>{date}</span>
                    <span style={{ color: "#888" }}>{weekday}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                className="report-archive-btn"
                onClick={() => setShowSummaryModal(false)}
                disabled={creatingSummary}
              >
                取消
              </button>
              <button
                className="btn-accent"
                onClick={handleCreateSummary}
                disabled={creatingSummary || Object.values(summarySelections).every(v => !v)}
                style={{ fontSize: 13, padding: "8px 20px" }}
              >
                {creatingSummary ? "创建中..." : "创建总结稿"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
