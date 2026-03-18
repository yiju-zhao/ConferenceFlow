import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

// ── Version helpers ──────────────────────────────────────────────────────────
function parseReportId(reportId) {
  const m = reportId.match(/^(.+)-v(\d+)$/);
  return m
    ? { date: m[1], version: parseInt(m[2]), isLegacy: false }
    : { date: reportId, version: 1, isLegacy: true };
}


const COLORS = [
  { hex: "#3DFFA4", bg: "rgba(61,255,164,0.10)" },
  { hex: "#4C8EFF", bg: "rgba(76,142,255,0.10)" },
  { hex: "#FFBB38", bg: "rgba(255,187,56,0.10)" },
  { hex: "#FF6B9A", bg: "rgba(255,107,154,0.10)" },
  { hex: "#B87FFF", bg: "rgba(184,127,255,0.10)" },
  { hex: "#22D3EE", bg: "rgba(34,211,238,0.10)" },
];
const DAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export default function ReportList() {
  const [user, setUser] = useState(null);
  const [reportDocs, setReportDocs] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [memberMap, setMemberMap] = useState({});

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

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "members"), snap => {
      const map = {};
      snap.forEach(d => { map[d.data().id] = d.data(); });
      setMemberMap(map);
    });
  }, [user]);

  // Show only the latest version per date
  const displayReports = (() => {
    const latestByDate = reportDocs.reduce((acc, doc) => {
      const { date, version } = parseReportId(doc.id);
      const isPlain = doc.id === date;
      const existing = acc[date];
      if (!existing || isPlain || (!existing._isPlain && version > existing._version)) {
        acc[date] = { ...doc, _date: date, _version: version, _isPlain: isPlain };
      }
      return acc;
    }, {});
    return Object.values(latestByDate).sort((a, b) => b._date.localeCompare(a._date));
  })();

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <Link to="/" className="report-back-btn">← 返回日程</Link>
        </div>
      </div>

      <div className="report-container" style={{ marginTop: 24 }}>
        <div className="report-list-header">
          <div>
            <div className="report-title-eyebrow" style={{ marginBottom: 4 }}>GTC 2026 · DAILY BRIEFING</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A1A" }}>日报管理</h2>
          </div>
        </div>

        <div className="report-list-cards">
          {displayReports.length === 0 ? (
            <p style={{ color: "#AAAAAA", textAlign: "center", padding: "48px 0" }}>
              暂无日报，在日程页面点击「生成日报」开始
            </p>
          ) : displayReports.map(r => {
            const sessionsForDate = allSessions.filter(s => s.date === r.date);
            const memberIds = [...new Set(sessionsForDate.flatMap(s => s.attendees || []))];
            const members = memberIds.map(id => memberMap[id]).filter(Boolean);
            const isDone = r.status === "done";
            const weekday = DAY_CN[new Date(r.date + "T00:00").getDay()];
            return (
              <div key={r.id} className="report-card">
                <div className="report-card-main">
                  <div className="report-card-date">
                    {r.date} <span style={{ fontWeight: 400, color: "#888" }}>{weekday}</span>
                  </div>
                  <div className="report-card-meta">
                    <span style={{ fontSize: 12, color: "#888" }}>
                      {Object.keys(r.sessions || {}).length} sessions
                    </span>
                    {members.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {members.map(m => {
                          const c = COLORS[m.colorIndex] || COLORS[0];
                          return (
                            <span key={m.id} style={{
                              fontSize: 11, padding: "2px 7px", borderRadius: 99,
                              background: c.bg, color: c.hex, border: `1px solid ${c.hex}40`,
                            }}>
                              {m.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="report-card-right">
                  <span className={`report-status-badge ${isDone ? "done" : "draft"}`}>
                    {isDone ? "✓ 已完成" : "● 草稿"}
                  </span>
                  <Link to={`/report/${r.id}`} className="report-card-view-btn">
                    查看日报 →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
