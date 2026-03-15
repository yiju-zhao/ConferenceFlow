import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
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
  Zap,
  FileText,
  LayoutList,
  CalendarRange,
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

// ── TopicCell: inline editable topic field per session ───────────────────────
function TopicCell({ session, user }) {
  const [val, setVal] = useState(session.mainTopic || "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setVal(session.mainTopic || "");
  }, [session.mainTopic]);
  return (
    <input
      value={val}
      placeholder="分类..."
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (user) {
          setDoc(doc(db, "sessions", session.code), { mainTopic: val }, { merge: true }).catch(console.error);
        }
      }}
      onChange={e => setVal(e.target.value)}
      style={{
        width: "100%", fontSize: 11, padding: "3px 7px",
        background: "var(--surface)", border: "1px solid var(--border-dim)",
        borderRadius: 5, color: "var(--text)", fontFamily: "Outfit, sans-serif",
        outline: "none",
      }}
    />
  );
}

// ── Member color palette (dark-theme tuned) ───────────────────────────────────
const COLORS = [
  { hex: "#3DFFA4", bg: "rgba(61,255,164,0.10)",  glow: "rgba(61,255,164,0.30)"  },
  { hex: "#4C8EFF", bg: "rgba(76,142,255,0.10)",  glow: "rgba(76,142,255,0.30)"  },
  { hex: "#FFBB38", bg: "rgba(255,187,56,0.10)",  glow: "rgba(255,187,56,0.30)"  },
  { hex: "#FF6B9A", bg: "rgba(255,107,154,0.10)", glow: "rgba(255,107,154,0.30)" },
  { hex: "#B87FFF", bg: "rgba(184,127,255,0.10)", glow: "rgba(184,127,255,0.30)" },
  { hex: "#22D3EE", bg: "rgba(34,211,238,0.10)",  glow: "rgba(34,211,238,0.30)"  },
];

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
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 8,
        padding: "10px 14px",
        width: 280,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="code-badge">{session.code}</span>
        <span className="font-mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>
          {session.start}–{session.end}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text)", lineHeight: 1.45, fontWeight: 500 }}>
        {session.title}
      </p>
      {session.room && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <MapPin size={10} color="var(--text-dim)" />
          <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{session.room}</span>
        </div>
      )}
      {members.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
          {members.map((m) => {
            const c = COLORS[m.colorIndex];
            const isOn = session.attendees.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => user && toggleAttendance(session.code, m.id)}
                style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 99,
                  cursor: user ? "pointer" : "default",
                  background: isOn ? c.bg : "transparent",
                  color: isOn ? c.hex : "var(--text-dim)",
                  border: `1px solid ${isOn ? c.hex + "50" : "var(--border-dim)"}`,
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: isOn ? 700 : 400,
                  transition: "all 0.15s",
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
function CalendarView({ groupedSessions, members, toggleAttendance, user }) {
  return (
    <div style={{ padding: "0 0 16px" }}>
      {groupedSessions.map(({ date, sessions: dateSessions }) => {
        // Group sessions into hourly buckets by start time
        const buckets = {};
        dateSessions.forEach((s) => {
          const key = Math.floor(parseTimeToMinutes(s.start) / 60) * 60;
          if (!buckets[key]) buckets[key] = [];
          buckets[key].push(s);
        });
        const sortedBuckets = Object.entries(buckets).sort(([a], [b]) => Number(a) - Number(b));

        return (
          <div key={date}>
            {/* Date header */}
            <div
              style={{
                padding: "10px 24px",
                borderBottom: "1px solid var(--border-dim)",
                background: "rgba(255,255,255,0.02)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
              <CalendarDays size={13} color="var(--accent)" />
              <span
                className="font-display"
                style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.04em" }}
              >
                {date}
              </span>
              <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                {dateSessions.length} sessions
              </span>
              <Link
                to={`/report/${date}`}
                className="btn-ghost"
                style={{ padding: "4px 10px", fontSize: 11, gap: 4, textDecoration: "none" }}
              >
                <FileText size={12} />
                生成日报
              </Link>
            </div>

            {/* Hourly time slot groups */}
            {sortedBuckets.map(([bucketKey, slotSessions]) => (
              <div key={bucketKey} style={{ padding: "12px 24px 4px" }}>
                {/* Slot header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Clock size={11} color="var(--accent)" />
                  <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                    {formatHourBucket(Number(bucketKey))}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 10, color: "var(--text-dim)",
                      background: "var(--surface)",
                      border: "1px solid var(--border-dim)",
                      borderRadius: 99, padding: "1px 7px",
                    }}
                  >
                    {slotSessions.length}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
                </div>
                {/* Session cards */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingBottom: 12 }}>
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

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState({});
  const [newMemberName, setNewMemberName] = useState("");
  const fileInputRef = useRef(null);
  const [activeUploadMember, setActiveUploadMember] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportDates, setExportDates] = useState(new Set());
  const [viewMode, setViewMode] = useState("table"); // "table" | "calendar"

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
      const titleIdx = headers.findIndex((h) => h.includes("title"));
      const codeIdx  = headers.findIndex((h) => h.includes("code"));
      const dateIdx  = headers.findIndex((h) => h.includes("date"));
      const startIdx = headers.findIndex((h) => h.includes("start"));
      const endIdx   = headers.findIndex((h) => h.includes("end"));
      const roomIdx  = headers.findIndex((h) => h.includes("room"));
      const topicIdx = headers.findIndex((h) => h.includes("topic") || h.includes("主题"));

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
            title:     row[titleIdx] || "",
            date:      dateIdx  !== -1 ? row[dateIdx]  : "",
            start:     startIdx !== -1 ? row[startIdx] : "",
            end:       endIdx   !== -1 ? row[endIdx]   : "",
            room:      roomIdx  !== -1 ? row[roomIdx]  : "",
            mainTopic: topicIdx !== -1 ? row[topicIdx] : "",
            attendees: new Set([activeUploadMember]),
          };
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
        colorIndex: members.length % COLORS.length,
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
    <div className="gtc-page-outer" style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header
          className="card animate-fade-up"
          style={{ padding: "24px 28px" }}
        >
          {/* decorative GTC watermark – clipped in its own layer so the dropdown can overflow the header */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit", pointerEvents: "none" }}>
            <div
              className="font-display"
              style={{
                position: "absolute", right: -10, top: -18,
                fontSize: 130, fontWeight: 800, letterSpacing: "-0.04em",
                color: "var(--accent)", opacity: 0.04,
                userSelect: "none", lineHeight: 1,
              }}
            >
              GTC
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, position: "relative", zIndex: 1 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div className="status-live" style={{ background: authError ? "var(--red)" : user ? "var(--accent)" : "var(--amber)" }} />
                <span
                  className="font-mono"
                  style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: authError ? "var(--red)" : user ? "var(--accent)" : "var(--amber)" }}
                >
                  {authError ? "Auth Failed" : user ? "Live Sync" : "Connecting..."}
                </span>
              </div>
              <h1
                className="font-display gtc-header-title"
                style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "#E8F4FF", display: "flex", alignItems: "center", gap: 10 }}
              >
                <Zap size={22} color="var(--accent)" strokeWidth={2.5} />
                GTC 2026 团队日程协作
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                合并个人日程 · 统筹团队分工 · 实时多人协作
              </p>
            </div>

            {/* Export button + dropdown */}
            <div style={{ position: "relative" }}>
              <button
                className="btn-accent"
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
                  <p
                    className="font-mono"
                    style={{ margin: "0 0 12px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}
                  >
                    选择导出日期
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                    {groupedSessions.length === 0 ? (
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>暂无日期</span>
                    ) : (
                      groupedSessions.map((g) => (
                        <label
                          key={g.date}
                          style={{
                            display: "flex", alignItems: "center", gap: 9,
                            fontSize: 13, cursor: "pointer",
                            padding: "5px 6px", borderRadius: 6,
                            color: "var(--text)",
                          }}
                        >
                          <input
                            type="checkbox"
                            className="gtc-check"
                            checked={exportDates.has(g.date)}
                            onChange={() => toggleExportDate(g.date)}
                          />
                          <span style={{ flex: 1 }}>{g.date}</span>
                          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            ×{g.sessions.length}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button className="btn-ghost" onClick={() => setShowExportMenu(false)}>取消</button>
                    <button className="btn-accent" onClick={exportToCSV} style={{ padding: "7px 16px", fontSize: 12 }}>
                      确认导出
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── MEMBERS SECTION ────────────────────────────────────────────── */}
        <section className="card animate-fade-up delay-1" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <UserPlus size={15} color="var(--text-muted)" />
            <span
              className="font-mono"
              style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}
            >
              团队成员
            </span>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 2 }}>
              / {members.length} members
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.hex, flexShrink: 0, boxShadow: `0 0 6px ${c.hex}` }} />
                      <span className="font-display" style={{ fontSize: 13, fontWeight: 700, color: c.hex }}>
                        {member.name}
                      </span>
                    </div>
                    <button
                      onClick={() => removeMember(member.id)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-dim)", padding: 2, display: "flex",
                        borderRadius: 4, transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
                      title="移除成员"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => triggerUpload(member.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      background: "rgba(255,255,255,0.04)", border: `1px solid ${c.hex}30`,
                      borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                      color: c.hex, fontSize: 11, fontFamily: "'Outfit', sans-serif",
                      fontWeight: 500, letterSpacing: "0.02em", transition: "all 0.15s",
                      width: "100%",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = c.bg; e.currentTarget.style.borderColor = c.hex + "60"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = c.hex + "30"; }}
                  >
                    <Upload size={11} />
                    导入 CSV
                  </button>
                </div>
              );
            })}

            {/* Add member input */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 10,
                border: "1px dashed var(--border)", background: "transparent",
                minWidth: 150,
              }}
            >
              <input
                className="gtc-input"
                placeholder="添加成员..."
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                style={{ padding: "6px 10px", fontSize: 12, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={addMember}
                className="btn-accent"
                style={{ padding: "6px 10px", fontSize: 12, flexShrink: 0 }}
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
            style={{ display: "none" }}
          />
        </section>

        {/* ── SCHEDULE TABLE ─────────────────────────────────────────────── */}
        <section className="card animate-fade-up delay-2" style={{ overflow: "hidden", padding: 0 }}>
          {/* Table header bar */}
          <div style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileSpreadsheet size={15} color="var(--text-muted)" />
              <span
                className="font-mono"
                style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}
              >
                {viewMode === "table" ? "日程矩阵" : "日程日历"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {sortedSessions.length} sessions
              </span>
              <div style={{ display: "flex", gap: 2, background: "var(--bg)", borderRadius: 7, padding: 2 }}>
                <button
                  onClick={() => setViewMode("table")}
                  title="表格视图"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 26, borderRadius: 5, border: "none", cursor: "pointer",
                    background: viewMode === "table" ? "var(--surface)" : "transparent",
                    color: viewMode === "table" ? "var(--accent)" : "var(--text-dim)",
                    transition: "all 0.15s",
                  }}
                >
                  <LayoutList size={13} />
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  title="日历视图"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 26, borderRadius: 5, border: "none", cursor: "pointer",
                    background: viewMode === "calendar" ? "var(--surface)" : "transparent",
                    color: viewMode === "calendar" ? "var(--accent)" : "var(--text-dim)",
                    transition: "all 0.15s",
                  }}
                >
                  <CalendarRange size={13} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            {groupedSessions.length > 0 && viewMode === "calendar" && (
              <CalendarView
                groupedSessions={groupedSessions}
                members={members}
                toggleAttendance={toggleAttendance}
                user={user}
              />
            )}
            {groupedSessions.length > 0 && viewMode === "table" ? (
              <table className="schedule-table" style={{ tableLayout: "fixed", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: 180, textAlign: "left" }}>时间 / 地点</th>
                    <th style={{ textAlign: "left", maxWidth: 380 }}>Session</th>
                    <th style={{ width: 110, textAlign: "left" }}>主要主题</th>
                    {members.map((m) => {
                      const c = COLORS[m.colorIndex];
                      return (
                        <th key={m.id} style={{ width: 80, textAlign: "center", color: c.hex }}>
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
                      <tr className="date-header-row">
                        <td colSpan={members.length + 3}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
                            <CalendarDays size={13} color="var(--accent)" />
                            <span
                              className="font-display"
                              style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.04em" }}
                            >
                              {group.date}
                            </span>
                            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                              {group.sessions.length} sessions
                            </span>
                            <Link
                              to={`/report/${group.date}`}
                              className="btn-ghost"
                              style={{ padding: "4px 10px", fontSize: 11, gap: 4, textDecoration: "none" }}
                            >
                              <FileText size={12} />
                              生成日报
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* Session rows */}
                      {group.sessions.map((session) => (
                        <tr key={session.code} className="session-row">
                          {/* Time + Room */}
                          <td className="col-time" style={{ width: 160, maxWidth: 160 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text)" }}>
                                <Clock size={11} color="var(--accent)" />
                                <span className="font-mono" style={{ fontSize: 11, letterSpacing: "0.03em" }}>
                                  {session.start}–{session.end}
                                </span>
                              </div>
                              {session.room && (
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                                  <MapPin size={11} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 1 }} />
                                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, letterSpacing: "0.01em" }}>
                                    {session.room}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Session code + title */}
                          <td className="col-session" style={{ width: 320, maxWidth: 320 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              <span className="code-badge" style={{ alignSelf: "flex-start" }}>{session.code}</span>
                              <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.45, fontWeight: 500, wordBreak: "break-word" }}>
                                {session.title}
                              </p>
                            </div>
                          </td>

                          {/* Main topic */}
                          <td className="col-topic" style={{ width: 110, maxWidth: 110, verticalAlign: "top", paddingTop: 12 }}>
                            <TopicCell session={session} user={user} />
                          </td>

                          {/* Attendance toggles */}
                          {members.map((member) => {
                            const c = COLORS[member.colorIndex];
                            const isOn = session.attendees.has(member.id);
                            return (
                              <td key={member.id} className="col-attend" style={{ textAlign: "center", background: "transparent" }}>
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
              <div style={{
                padding: "72px 32px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
              }}>
                {/* Decorative grid */}
                <div style={{ width: 240, position: "relative" }}>
                  <div className="empty-grid">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="empty-cell" style={{ opacity: Math.random() * 0.5 + 0.05 }} />
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                    暂无日程数据
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                    为团队成员导入 NVIDIA GTC 导出的 CSV 文件以开始协作
                  </p>
                </div>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 16px", borderRadius: 8,
                    background: "var(--accent-soft)", border: "1px solid rgba(61,255,164,0.2)",
                    fontSize: 12, color: "var(--accent)",
                  }}
                >
                  <Upload size={13} />
                  <span>点击成员卡片上的「导入 CSV」开始</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <footer style={{ textAlign: "center", padding: "8px 0" }}>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.06em" }}>
            GTC 2026 · TEAM SCHEDULE SYNC · REALTIME
          </span>
        </footer>

      </div>
    </div>
  );
}
