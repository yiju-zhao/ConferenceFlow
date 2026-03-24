import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, updateDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { DAY_CN, parseReportId, generateSummaryId } from "./shared";

export default function ReportList() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [reportDocs, setReportDocs] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [creatingSummary, setCreatingSummary] = useState(false);
  const [showSummaryDatePicker, setShowSummaryDatePicker] = useState(false);
  const [summaryDateStart, setSummaryDateStart] = useState("");
  const [summaryDateEnd, setSummaryDateEnd] = useState("");

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
      const snap = await getDocs(collection(db, "dailyReports"));
      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const summaryId = generateSummaryId(allDocs);

      await setDoc(doc(db, "dailyReports", summaryId), {
        type: "summary",
        title: "GTC 2026 总结稿",
        status: "draft",
        dateStart,
        dateEnd,
        sections: {
          "现场声音": { order: 0, blocks: [] },
          "趋势总结": { order: 1, blocks: [] },
          "推演分析": { order: 2, blocks: [] },
          "关键启示": { order: 3, blocks: [] },
        },
        citations: [],
        sitePhotos: [],
        onsiteEvents: [],
      });

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
              onClick={openSummaryDatePicker}
              disabled={creatingSummary}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              {creatingSummary ? "创建中..." : "+ 创建总结稿"}
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
                      管理总结稿 &rarr;
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

      {/* ── Summary Date Picker Modal ─────────────────────────── */}
      {showSummaryDatePicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowSummaryDatePicker(false)}>
          <div style={{ background: "#fff", padding: 32, maxWidth: 400, width: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>创建总结稿 — 确认日期范围</span>
              <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }} onClick={() => setShowSummaryDatePicker(false)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>
                起始日期
                <input type="date" value={summaryDateStart} onChange={(e) => setSummaryDateStart(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #ddd", fontSize: 14 }} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>
                结束日期
                <input type="date" value={summaryDateEnd} onChange={(e) => setSummaryDateEnd(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #ddd", fontSize: 14 }} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              <button style={{ padding: "8px 16px", fontSize: 13, background: "none", border: "1px solid #ddd", cursor: "pointer" }} onClick={() => setShowSummaryDatePicker(false)}>取消</button>
              <button className="btn-accent" style={{ padding: "8px 20px", fontSize: 13 }} disabled={!summaryDateStart || !summaryDateEnd} onClick={() => handleCreateSummary(summaryDateStart, summaryDateEnd)}>确认创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
