import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  UserPlus,
  Trash2,
  CalendarDays,
  Clock,
  MapPin,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Zap,
  FileText,
  LayoutList,
  CalendarRange,
  VideoOff,
  Plus,
} from "lucide-react";

import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { SESSION_CATALOG, COLORS, parseReportId, latestOrNewVersionId } from "./shared";

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCSVLine(text) {
  let ret = [], inQuote = false, value = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { value += '"'; i++; }
        else { inQuote = false; }
      } else { value += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { ret.push(value.trim()); value = ""; }
      else { value += ch; }
    }
  }
  ret.push(value.trim());
  return ret;
}

// ── Calendar view helpers ─────────────────────────────────────────────────────
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const s = timeStr.trim().toUpperCase();
  const isPM = s.includes("PM");
  const isAM = s.includes("AM");
  const clean = s.replace(/[^0-9:]/g, "");
  const [hStr = "0", mStr = "0"] = clean.split(":");
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function formatHourBucket(startMinutes) {
  const h = Math.floor(startMinutes / 60);
  const fmt = (hr) => `${hr % 12 || 12}:00 ${hr < 12 ? "AM" : "PM"}`;
  return `${fmt(h)} – ${fmt(h + 1)}`;
}

// ── Calendar session card ─────────────────────────────────────────────────────
function CalendarSessionCard({ session, members, toggleAttendance, user }) {
  return (
    <div className={`calendar-session-card${session.attendees.size === 0 ? " calendar-card--unassigned" : ""}${session.attendees.size >= 3 ? " calendar-card--popular" : ""}`}>
      <div className="calendar-card-top">
        <span className="code-badge">{session.code}</span>
        <span className="font-mono calendar-card-time">
          {session.start}–{session.end}
        </span>
      </div>
      <p className="calendar-card-title">
        {SESSION_CATALOG.get(session.code)?.url
          ? <a href={SESSION_CATALOG.get(session.code).url} target="_blank" rel="noopener noreferrer">
              {SESSION_CATALOG.get(session.code)?.title || session.title}
            </a>
          : SESSION_CATALOG.get(session.code)?.title || session.title
        }
      </p>
      {session.room && (
        <div className="calendar-card-room">
          <MapPin size={10} color="var(--text-dim)" />
          <span className="calendar-card-room-text">{session.room}</span>
        </div>
      )}
      {members.length > 0 && (
        <div className="calendar-card-pills">
          {members.map((m) => {
            const c = COLORS[m.colorIndex];
            const isOn = session.attendees.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => user && toggleAttendance(session.code, m.id)}
                className={`calendar-member-pill${isOn ? " active" : ""}`}
                style={{
                  cursor: user ? "pointer" : "default",
                  background: isOn ? c.bg : undefined,
                  color: isOn ? c.hex : undefined,
                  borderColor: isOn ? c.hex + "50" : undefined,
                }}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────
function CalendarView({ groupedSessions, members, toggleAttendance, user, collapsedDates, toggleDateCollapse, navigate, reportDocs }) {
  return (
    <div className="calendar-view">
      {groupedSessions.map(({ date, sessions: dateSessions }) => {
        // Group sessions into hourly buckets by start time
        const buckets = {};
        dateSessions.forEach((s) => {
          const key = Math.floor(parseTimeToMinutes(s.start) / 60) * 60;
          if (!buckets[key]) buckets[key] = [];
          buckets[key].push(s);
        });
        const sortedBuckets = Object.entries(buckets).sort(([a], [b]) => Number(a) - Number(b));
        const isCollapsed = collapsedDates.has(date);

        return (
          <div key={date}>
            {/* Date header */}
            <div
              onClick={() => toggleDateCollapse(date)}
              className="calendar-date-header"
            >
              <ChevronRight
                size={13}
                color="var(--brand)"
                style={{ transition: "transform 0.2s", transform: isCollapsed ? "none" : "rotate(90deg)", flexShrink: 0 }}
              />
              <CalendarDays size={13} color="var(--brand)" />
              <span className="calendar-date-text">{date}</span>
              <span className="font-mono calendar-date-count">
                {dateSessions.length} sessions
              </span>
              <button
                className="btn-accent calendar-date-report-btn"
                onClick={(e) => { e.stopPropagation(); navigate(`/report/${latestOrNewVersionId(date, reportDocs)}`); }}
              >
                <FileText size={12} />
                生成日报
              </button>
            </div>

            {/* Hourly time slot groups */}
            {!isCollapsed && sortedBuckets.map(([bucketKey, slotSessions]) => (
              <div key={bucketKey} className="calendar-time-slot">
                {/* Slot header */}
                <div className="calendar-time-label">
                  <Clock size={11} color="var(--brand)" />
                  <span className="font-mono calendar-time-text">
                    {formatHourBucket(Number(bucketKey))}
                  </span>
                  <span className="font-mono calendar-time-count">
                    {slotSessions.length}
                  </span>
                  <div className="calendar-time-divider" />
                </div>
                {/* Session cards */}
                <div className="calendar-session-list">
                  {slotSessions.map((s) => (
                    <CalendarSessionCard
                      key={s.code}
                      session={s}
                      members={members}
                      toggleAttendance={toggleAttendance}
                      user={user}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Catalog badges ────────────────────────────────────────────────────────────
const SessionTypeBadge = ({ type }) => (
  <span className="schedule-badge">{type}</span>
);

const FormatBadge = ({ format }) => (
  <span className="schedule-badge">{format}</span>
);

const NoRecordingBadge = () => (
  <span className="schedule-badge schedule-badge--warning">
    <VideoOff size={9} />No Rec
  </span>
);

// ── AddSessionModal ────────────────────────────────────────────────────────────
function AddSessionModal({ sessions, onAdd, onClose }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return catalogData
      .filter(s => s.session_id.toUpperCase().includes(q) || s.title.toLowerCase().includes(query.trim().toLowerCase()))
      .slice(0, 20);
  }, [query]);

  return (
    <div
      onClick={onClose}
      className="add-session-overlay"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="add-session-modal"
      >
        {/* Header */}
        <div className="add-session-header">
          <div className="add-session-header-bar">
            <span className="add-session-header-title">添加 Session</span>
            <button onClick={onClose} className="add-session-close">×</button>
          </div>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="输入 Session ID 或标题搜索..."
            className="add-session-input"
          />
        </div>

        {/* Results */}
        <div className="add-session-results">
          {!query.trim() ? (
            <div className="add-session-empty">
              输入 Session ID 或标题搜索
            </div>
          ) : results.length === 0 ? (
            <div className="add-session-empty">
              未找到匹配的 Session
            </div>
          ) : results.map(s => {
            const alreadyAdded = !!sessions[s.session_id];
            return (
              <div
                key={s.session_id}
                className="add-session-result"
              >
                <span className="font-mono add-session-result-id">
                  {s.session_id}
                </span>
                <div className="add-session-result-info">
                  <div className="add-session-result-title">
                    {s.title}
                  </div>
                  <div className="add-session-result-meta">
                    {s.date}{s.time ? ` · ${s.time.replace(/\s*(PDT|PST|EST|EDT)\s*/i, "").trim()}` : ""}
                  </div>
                </div>
                {alreadyAdded ? (
                  <span className="font-mono schedule-badge" style={{ flexShrink: 0 }}>
                    已加入
                  </span>
                ) : (
                  <button
                    onClick={() => onAdd(s.session_id)}
                    className="btn-accent"
                    style={{ fontSize: 11, padding: "3px 12px", flexShrink: 0 }}
                  >
                    添加
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState({});
  const [reportDocs, setReportDocs] = useState([]);
  const [newMemberName, setNewMemberName] = useState("");
  const fileInputRef = useRef(null);
  const [activeUploadMember, setActiveUploadMember] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportDates, setExportDates] = useState(new Set());
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [viewMode, setViewMode] = useState("table"); // "table" | "calendar"
  const [collapsedDates, setCollapsedDates] = useState(() => new Set());
  const toggleDateCollapse = (date) =>
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });

  // Auth
  useEffect(() => {
    signInAnonymously(auth).catch((err) => {
      console.error("Auth error:", err);
      setAuthError(err.message);
    });
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setAuthError(null);
    });
  }, []);

  // Members realtime
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "members"),
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push(d.data()));
        arr.sort((a, b) => Number(a.id) - Number(b.id));
        setMembers(arr);
      },
      console.error
    );
  }, [user]);

  // Sessions realtime
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "sessions"),
      (snap) => {
        const map = {};
        snap.forEach((d) => {
          const data = d.data();
          map[data.code] = { ...data, attendees: new Set(data.attendees || []) };
        });
        setSessions(map);
      },
      console.error
    );
  }, [user]);

  // Report docs (for computing latest version per date)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "dailyReports"), snap => {
      setReportDocs(snap.docs.map(d => ({ id: d.id })));
    });
  }, [user]);

  // Auto-enrich existing sessions with catalog data
  useEffect(() => {
    if (!user || Object.keys(sessions).length === 0) return;
    const toEnrich = Object.values(sessions).filter(
      (s) => !s.url && SESSION_CATALOG.has(s.code)
    );
    if (toEnrich.length === 0) return;
    Promise.all(
      toEnrich.map((s) => {
        const info = SESSION_CATALOG.get(s.code);
        return setDoc(doc(db, "sessions", s.code), {
          url: info.url || "",
          speakers: info.speakers || [],
          format: info.format || "",
          recording: info.recording || "",
          session_type: info.session_type || "",
        }, { merge: true });
      })
    ).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, Object.keys(sessions).join(",")]);

  // CSV upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !activeUploadMember) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = event.target.result.split("\n").map((l) => l.trim()).filter(Boolean);
      let hi = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Session Code") || lines[i].includes("Session Title")) { hi = i; break; }
      }
      const headers = parseCSVLine(lines[hi]).map((h) => h.toLowerCase());
      const titleIdx     = headers.findIndex((h) => h.includes("title"));
      const codeIdx      = headers.findIndex((h) => h.includes("code"));
      const dateIdx      = headers.findIndex((h) => h.includes("date"));
      const startIdx     = headers.findIndex((h) => h.includes("start"));
      const endIdx       = headers.findIndex((h) => h.includes("end"));
      const roomIdx      = headers.findIndex((h) => h.includes("room"));
      const topicIdx     = headers.findIndex((h) => h.includes("topic") || h.includes("主题"));
      const scheduledIdx = headers.findIndex((h) => h.includes("scheduled"));
      const favoritedIdx = headers.findIndex((h) => h.includes("favorit"));

      if (codeIdx === -1 || titleIdx === -1) {
        alert("无法识别的 CSV 格式。请确保包含 Session Code 和 Session Title 列。");
        return;
      }

      const map = { ...sessions };
      const touched = new Set();

      for (let i = hi + 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        const code = row[codeIdx];
        if (!code) continue;
        touched.add(code);
        const existing = map[code];
        if (!existing) {
          map[code] = {
            code,
            title:     (row[titleIdx] || "").replace(/^\(Favorited\)\s*/i, ""),
            date:      dateIdx      !== -1 ? row[dateIdx]      : "",
            start:     startIdx     !== -1 ? row[startIdx]     : "",
            end:       endIdx       !== -1 ? row[endIdx]       : "",
            room:      roomIdx      !== -1 ? row[roomIdx]      : "",
            mainTopic: topicIdx     !== -1 ? row[topicIdx]     : "",
            scheduled: scheduledIdx !== -1 ? row[scheduledIdx] : "",
            favorited: favoritedIdx !== -1 ? row[favoritedIdx] : "",
            attendees: new Set([activeUploadMember]),
          };
          // Merge catalog metadata for newly imported session
          const info = SESSION_CATALOG.get(code);
          if (info) {
            map[code].url = info.url || "";
            map[code].speakers = info.speakers || [];
            map[code].format = info.format || "";
            map[code].recording = info.recording || "";
            map[code].session_type = info.session_type || "";
          }
        } else {
          const att = new Set(existing.attendees);
          att.add(activeUploadMember);
          map[code] = { ...existing, attendees: att };
        }
      }

      if (user) {
        Promise.all(
          Array.from(touched).map((code) =>
            setDoc(doc(db, "sessions", code), {
              ...map[code],
              attendees: Array.from(map[code].attendees),
            })
          )
        ).catch(console.error);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveUploadMember(null);
    };
    reader.readAsText(file);
  };

  const triggerUpload = (memberId) => {
    setActiveUploadMember(memberId);
    fileInputRef.current?.click();
  };

  const addMember = async () => {
    if (!newMemberName.trim()) return;
    if (!user) { alert("Firebase 尚未完成登录，请稍候再试。\n错误：" + (authError || "user is null")); return; }
    try {
      const id = Date.now().toString();
      await setDoc(doc(db, "members", id), {
        id,
        name: newMemberName.trim(),
        colorIndex: (() => {
          const used = new Set(members.map((m) => m.colorIndex));
          const free = COLORS.findIndex((_, i) => !used.has(i));
          return free !== -1 ? free : members.length % COLORS.length;
        })(),
      });
      setNewMemberName("");
    } catch (err) {
      console.error("addMember error:", err);
      alert("写入失败：" + err.message);
    }
  };

  const removeMember = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, "members", id));
    await Promise.all(
      Object.values(sessions)
        .filter((session) => session.attendees.has(id))
        .map((session) => {
          const att = Array.from(session.attendees).filter((x) => x !== id);
          if (att.length === 0) {
            return deleteDoc(doc(db, "sessions", session.code));
          }
          return setDoc(doc(db, "sessions", session.code), { ...session, attendees: att }, { merge: true });
        })
    );
  };

  const toggleAttendance = async (code, memberId) => {
    if (!user) return;
    const session = sessions[code];
    if (!session) return;
    const att = new Set(session.attendees);
    if (att.has(memberId)) att.delete(memberId); else att.add(memberId);
    await setDoc(doc(db, "sessions", code), { ...session, attendees: Array.from(att) }, { merge: true });
  };

  const emptySessions = useMemo(
    () => Object.values(sessions).filter(s => s.attendees.size === 0),
    [sessions]
  );

  const cleanupEmptySessions = async () => {
    if (!user) return;
    await Promise.all(
      emptySessions.map(s => deleteDoc(doc(db, "sessions", s.code)))
    );
    setShowCleanupConfirm(false);
  };

  const addSessionFromCatalog = async (id) => {
    if (!user) return;
    const info = SESSION_CATALOG.get(id);
    if (!info) return;

    // Convert "Tuesday, March 17" → "2026-03-17"
    const parseDate = (str) => {
      const m = (str || "").match(/(\w+)\s+(\d+)/);
      if (!m) return str || "";
      const months = { January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12 };
      const mo = months[m[1]] || 1;
      return `2026-${String(mo).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;
    };

    // Convert "9:00 a.m." / "1:00 p.m." → "09:00" / "13:00"
    const parseTime = (str) => {
      const s = (str || "").replace(/\s*(PDT|PST|EST|EDT|UTC)\s*$/i, "").trim();
      const m = s.match(/(\d+):(\d+)\s*(a\.m\.|p\.m\.|am|pm)/i);
      if (!m) return s;
      let h = parseInt(m[1], 10);
      const min = m[2];
      const ampm = m[3].toLowerCase().replace(/\./g, "");
      if (ampm === "pm" && h !== 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      return `${String(h).padStart(2,"0")}:${min}`;
    };

    const timeParts = (info.time || "").split(" - ");
    const start = parseTime(timeParts[0]);
    const end = parseTime(timeParts[1]);

    await setDoc(doc(db, "sessions", id), {
      code: id,
      title: info.title || "",
      date: parseDate(info.date),
      start,
      end,
      room: info.location || "",
      mainTopic: "",
      attendees: [],
      url: info.url || "",
      speakers: info.speakers || [],
      format: info.format || "",
      recording: info.recording || "",
      session_type: info.session_type || "",
    });
  };

  const sortedSessions = useMemo(
    () => Object.values(sessions).sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.start.localeCompare(b.start)
    ),
    [sessions]
  );

  const groupedSessions = useMemo(() => {
    const groups = {};
    sortedSessions.forEach((s) => {
      const d = s.date || "TBD";
      if (!groups[d]) groups[d] = [];
      groups[d].push(s);
    });
    return Object.entries(groups).map(([date, items]) => ({ date, sessions: items }));
  }, [sortedSessions]);

  useEffect(() => {
    setExportDates(new Set(groupedSessions.map((g) => g.date)));
  }, [groupedSessions.length]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pastDates = groupedSessions
      .map((g) => g.date)
      .filter((d) => d !== "TBD" && d < today);
    if (pastDates.length > 0)
      setCollapsedDates((prev) => new Set([...prev, ...pastDates]));
  }, [groupedSessions.length]);

  const toggleExportDate = (date) =>
    setExportDates((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });

  const exportToCSV = () => {
    const toExport = sortedSessions.filter((s) => exportDates.has(s.date || "TBD"));
    if (!toExport.length) { alert("请至少选择一个日期！"); return; }
    let csv = "Date,Start,End,Code,Title,Room,主要主题," + members.map((m) => m.name).join(",") + "\n";
    toExport.forEach((s) => {
      const safeTitle = s.title.includes(",") ? `"${s.title}"` : s.title;
      const safeRoom  = s.room.includes(",")  ? `"${s.room}"`  : s.room;
      const safeTopic = (s.mainTopic || "").includes(",") ? `"${s.mainTopic}"` : (s.mainTopic || "");
      csv += `${s.date},${s.start},${s.end},${s.code},${safeTitle},${safeRoom},${safeTopic},`;
      csv += members.map((m) => (s.attendees.has(m.id) ? "是" : "")).join(",") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "GTC2026_Team_Schedule.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowExportMenu(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="schedule-page gtc-page-outer">
      <div className="schedule-container">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header className="card animate-fade-up schedule-header-card">
          {/* decorative GTC watermark – clipped in its own layer so the dropdown can overflow the header */}
          <div className="schedule-header-watermark-clip">
            <div className="schedule-watermark">GTC</div>
          </div>

          <div className="schedule-header">
            <div>
              <div className="schedule-header-status">
                <div className="status-live" style={{ background: authError ? "var(--error)" : user ? "var(--brand)" : "var(--warning)" }} />
                <span
                  className="font-mono schedule-status-dot"
                  style={{ color: authError ? "var(--error)" : user ? "var(--brand)" : "var(--warning)" }}
                >
                  {authError ? "Auth Failed" : user ? "Live Sync" : "Connecting..."}
                </span>
              </div>
              <h1 className="schedule-header-title gtc-header-title">
                <Zap size={22} color="var(--brand)" strokeWidth={2.5} />
                GTC 2026 团队日程协作
              </h1>
              <p className="schedule-header-subtitle">
                合并个人日程 · 统筹团队分工 · 实时多人协作
              </p>
            </div>

            {/* Header right actions */}
            <div className="schedule-header-actions">
            <Link to="/reports" className="btn-accent schedule-header-report-link">
              <FileText size={14} />
              日报列表
            </Link>

            {/* Export button + dropdown */}
            <div style={{ position: "relative" /* needed for dropdown positioning */ }}>
              <button
                className="btn-ghost"
                onClick={() => setShowExportMenu(!showExportMenu)}
              >
                <Download size={15} />
                导出统筹表
                <ChevronDown
                  size={14}
                  style={{ transition: "transform 0.2s", transform: showExportMenu ? "rotate(180deg)" : "none" }}
                />
              </button>

              {showExportMenu && (
                <div className="dropdown-panel">
                  <p className="font-mono export-dropdown-label">
                    选择导出日期
                  </p>
                  <div className="export-dropdown-dates">
                    {groupedSessions.length === 0 ? (
                      <span className="export-no-dates">暂无日期</span>
                    ) : (
                      groupedSessions.map((g) => (
                        <label key={g.date} className="export-date-label">
                          <input
                            type="checkbox"
                            className="gtc-check"
                            checked={exportDates.has(g.date)}
                            onChange={() => toggleExportDate(g.date)}
                          />
                          <span className="export-date-name">{g.date}</span>
                          <span className="font-mono export-date-count">
                            ×{g.sessions.length}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="export-dropdown-footer">
                    <button className="btn-ghost" onClick={() => setShowExportMenu(false)}>取消</button>
                    <button className="btn-accent export-confirm-btn" onClick={exportToCSV}>
                      确认导出
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </header>

        {/* ── MEMBERS SECTION ────────────────────────────────────────────── */}
        <section className="card animate-fade-up delay-1 schedule-members-card">
          <div className="schedule-members-header">
            <UserPlus size={15} color="var(--text-muted)" />
            <span className="font-mono schedule-section-label">
              团队成员
            </span>
            <span className="font-mono schedule-members-count">
              / {members.length} members
            </span>
          </div>

          <div className="schedule-member-grid">
            {members.map((member) => {
              const c = COLORS[member.colorIndex];
              return (
                <div
                  key={member.id}
                  className="member-card"
                  style={{
                    background: c.bg,
                    borderColor: c.hex + "40",
                    "--glow-color": c.glow,
                  }}
                >
                  <div className="member-card-header">
                    <div className="member-card-identity">
                      <div className="member-card-dot" style={{ background: c.hex, boxShadow: `0 0 6px ${c.hex}` }} />
                      <span className="member-card-name" style={{ color: c.hex }}>
                        {member.name}
                      </span>
                    </div>
                    <button
                      onClick={() => removeMember(member.id)}
                      className="member-card-remove"
                      title="移除成员"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => triggerUpload(member.id)}
                    className="member-card-upload"
                    style={{ color: c.hex, borderColor: c.hex + "30" }}
                  >
                    <Upload size={11} />
                    导入 CSV
                  </button>
                </div>
              );
            })}

            {/* Add member input */}
            <div className="schedule-member-add">
              <input
                className="gtc-input"
                placeholder="添加成员..."
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                style={{ padding: "6px 10px", fontSize: 12, flex: 1, minWidth: 0 /* dynamic sizing */ }}
              />
              <button
                onClick={addMember}
                className="btn-accent"
                style={{ padding: "6px 10px", fontSize: 12, flexShrink: 0 /* compact button */ }}
                title="添加"
              >
                <UserPlus size={13} />
              </button>
            </div>
          </div>

          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
        </section>

        {/* ── SCHEDULE TABLE ─────────────────────────────────────────────── */}
        <section className="card animate-fade-up delay-2 schedule-table-card">
          {/* Table header bar */}
          <div className="schedule-table-bar">
            <div className="schedule-table-bar-left">
              <FileSpreadsheet size={15} color="var(--text-muted)" />
              <span className="font-mono schedule-section-label">
                {viewMode === "table" ? "日程矩阵" : "日程日历"}
              </span>
            </div>
            <div className="schedule-table-bar-right">
              <button
                className="btn-ghost"
                onClick={() => setShowAddSession(true)}
                style={{ padding: "4px 10px", fontSize: 11, gap: 4 }}
              >
                <Plus size={13} />
                添加 Session
              </button>
              {emptySessions.length > 0 && !showCleanupConfirm && (
                <button
                  onClick={() => setShowCleanupConfirm(true)}
                  title="删除所有无人参与的 session"
                  className="font-mono schedule-cleanup-btn"
                >
                  清理 · {emptySessions.length}
                </button>
              )}
              {showCleanupConfirm && (
                <div className="schedule-cleanup-confirm">
                  <span className="font-mono schedule-cleanup-confirm-text">
                    删除 {emptySessions.length} 个无人 session？
                  </span>
                  <button onClick={cleanupEmptySessions} className="schedule-confirm-yes">确认</button>
                  <button onClick={() => setShowCleanupConfirm(false)} className="schedule-confirm-no">取消</button>
                </div>
              )}
              <span className="font-mono schedule-session-count">
                {sortedSessions.length} sessions
              </span>
              <div className="schedule-view-toggle">
                <button
                  onClick={() => setViewMode("table")}
                  title="表格视图"
                  className={`schedule-view-btn${viewMode === "table" ? " active" : ""}`}
                >
                  <LayoutList size={13} />
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  title="日历视图"
                  className={`schedule-view-btn${viewMode === "calendar" ? " active" : ""}`}
                >
                  <CalendarRange size={13} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" /* needed for wide tables */ }}>
            {groupedSessions.length > 0 && viewMode === "calendar" && (
              <CalendarView
                groupedSessions={groupedSessions}
                members={members}
                toggleAttendance={toggleAttendance}
                user={user}
                collapsedDates={collapsedDates}
                toggleDateCollapse={toggleDateCollapse}
                navigate={navigate}
                reportDocs={reportDocs}
              />
            )}
            {groupedSessions.length > 0 && viewMode === "table" ? (
              <table className="schedule-table" style={{ tableLayout: "fixed", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: 180, textAlign: "left" }}>时间 / 地点</th>
                    <th style={{ textAlign: "left", maxWidth: 420 }}>Session</th>
                    {members.map((m) => {
                      const c = COLORS[m.colorIndex];
                      return (
                        <th key={m.id} style={{ width: 80, textAlign: "center", color: c.hex, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>
                          {m.name}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {groupedSessions.map((group) => (
                    <React.Fragment key={group.date}>
                      {/* Date separator */}
                      <tr
                        className="date-header-row"
                        onClick={() => toggleDateCollapse(group.date)}
                        style={{ cursor: "pointer", userSelect: "none" }}
                      >
                        <td colSpan={members.length + 2}>
                          <div className="table-date-row-inner">
                            <ChevronRight
                              size={13}
                              color="var(--brand)"
                              style={{ transition: "transform 0.2s", transform: collapsedDates.has(group.date) ? "none" : "rotate(90deg)", flexShrink: 0 }}
                            />
                            <CalendarDays size={13} color="var(--brand)" />
                            <span className="table-date-text">{group.date}</span>
                            <span className="font-mono table-date-count">
                              {group.sessions.length} sessions
                            </span>
                            <button
                              className="btn-accent table-date-report-btn"
                              onClick={(e) => { e.stopPropagation(); navigate(`/report/${latestOrNewVersionId(group.date, reportDocs)}`); }}
                            >
                              <FileText size={12} />
                              生成日报
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Session rows */}
                      {!collapsedDates.has(group.date) && group.sessions.map((session) => (
                        <tr key={session.code} className="session-row">
                          {/* Time + Room */}
                          <td className="col-time" style={{ width: 160, maxWidth: 160 }}>
                            <div className="table-col-time-inner">
                              <div className="table-time-row">
                                <Clock size={11} color="var(--brand)" />
                                <span className="font-mono table-time-text">
                                  {session.start}–{session.end}
                                </span>
                              </div>
                              {session.room && (
                                <div className="table-room-row">
                                  <MapPin size={11} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 1 }} />
                                  <span className="table-room-text">
                                    {session.room}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Session code + title */}
                          <td className="col-session" style={{ width: 380, maxWidth: 420 }}>
                            <div className="table-session-inner">
                              {/* Clickable code badge */}
                              {session.url
                                ? <a href={session.url} target="_blank" rel="noopener noreferrer"
                                     style={{ textDecoration: "none", alignSelf: "flex-start" }}>
                                    <span className="code-badge">{session.code}</span>
                                  </a>
                                : <span className="code-badge" style={{ alignSelf: "flex-start" }}>{session.code}</span>
                              }

                              {/* Type / Format / Recording pills */}
                              {(session.session_type || session.format || session.recording === "No") && (
                                <div className="table-session-pills">
                                  {session.session_type && <SessionTypeBadge type={session.session_type} />}
                                  {session.format && <FormatBadge format={session.format} />}
                                  {session.recording && session.recording !== "Yes" && <NoRecordingBadge />}
                                </div>
                              )}

                              {/* Title */}
                              <p className="table-session-title">
                                {SESSION_CATALOG.get(session.code)?.url
                                  ? <a href={SESSION_CATALOG.get(session.code).url} target="_blank" rel="noopener noreferrer">
                                      {SESSION_CATALOG.get(session.code)?.title || session.title}
                                    </a>
                                  : SESSION_CATALOG.get(session.code)?.title || session.title
                                }
                              </p>

                              {/* Speakers */}
                              {session.speakers?.length > 0 && (
                                <div className="table-session-speakers">
                                  {session.speakers.map((sp, i) => (
                                    <span key={i} className="table-session-speaker">
                                      {sp.name}{sp.title ? ` · ${sp.title}` : ""}{sp.company ? `, ${sp.company}` : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Attendance toggles */}
                          {members.map((member) => {
                            const c = COLORS[member.colorIndex];
                            const isOn = session.attendees.has(member.id);
                            return (
                              <td key={member.id} className="col-attend" style={{ textAlign: "center" }}>
                                <button
                                  onClick={() => toggleAttendance(session.code, member.id)}
                                  className={`attend-btn${isOn ? " active" : ""}`}
                                  style={{
                                    "--member-color": c.hex,
                                    "--member-bg":    c.bg,
                                    "--member-glow":  c.glow,
                                  }}
                                  title={`切换 ${member.name} 参与状态`}
                                >
                                  <span className="attend-dot" />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            ) : groupedSessions.length === 0 ? (
              /* Empty state */
              <div className="schedule-empty">
                {/* Decorative grid */}
                <div className="schedule-empty-grid-wrap">
                  <div className="empty-grid">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="empty-cell" style={{ opacity: Math.random() * 0.5 + 0.05 }} />
                    ))}
                  </div>
                </div>
                <div className="schedule-empty-text">
                  <p className="schedule-empty-title">
                    暂无日程数据
                  </p>
                  <p className="schedule-empty-desc">
                    为团队成员导入 NVIDIA GTC 导出的 CSV 文件以开始协作
                  </p>
                </div>
                <div className="schedule-empty-hint">
                  <Upload size={13} />
                  <span>点击成员卡片上的「导入 CSV」开始</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <footer className="schedule-footer">
          <span className="font-mono schedule-footer-text">
            GTC 2026 · TEAM SCHEDULE SYNC · REALTIME
          </span>
        </footer>

      </div>

      {showAddSession && (
        <AddSessionModal
          sessions={sessions}
          onAdd={async (id) => { await addSessionFromCatalog(id); }}
          onClose={() => setShowAddSession(false)}
          user={user}
        />
      )}
    </div>
  );
}
