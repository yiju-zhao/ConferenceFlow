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
            title: row[titleIdx] || "",
            date:  dateIdx  !== -1 ? row[dateIdx]  : "",
            start: startIdx !== -1 ? row[startIdx] : "",
            end:   endIdx   !== -1 ? row[endIdx]   : "",
            room:  roomIdx  !== -1 ? row[roomIdx]  : "",
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
    let csv = "Date,Start,End,Code,Title,Room," + members.map((m) => m.name).join(",") + "\n";
    toExport.forEach((s) => {
      const safeTitle = s.title.includes(",") ? `"${s.title}"` : s.title;
      const safeRoom  = s.room.includes(",")  ? `"${s.room}"`  : s.room;
      csv += `${s.date},${s.start},${s.end},${s.code},${safeTitle},${safeRoom},`;
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
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header
          className="card animate-fade-up"
          style={{ padding: "24px 28px", overflow: "hidden" }}
        >
          {/* decorative GTC watermark */}
          <div
            className="font-display"
            style={{
              position: "absolute", right: -10, top: -18,
              fontSize: 130, fontWeight: 800, letterSpacing: "-0.04em",
              color: "var(--accent)", opacity: 0.04,
              userSelect: "none", lineHeight: 1, pointerEvents: "none",
            }}
          >
            GTC
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
                className="font-display"
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
                日程矩阵
              </span>
            </div>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {sortedSessions.length} sessions
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            {groupedSessions.length > 0 ? (
              <table className="schedule-table" style={{ tableLayout: "fixed", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: 180, textAlign: "left" }}>时间 / 地点</th>
                    <th style={{ textAlign: "left", maxWidth: 380 }}>Session</th>
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
                        <td colSpan={members.length + 2}>
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
                          <td style={{ width: 160, maxWidth: 160 }}>
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
                          <td style={{ width: 320, maxWidth: 320 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              <span className="code-badge" style={{ alignSelf: "flex-start" }}>{session.code}</span>
                              <p style={{ margin: 0, fontSize: 13, color: "var(--text)", lineHeight: 1.45, fontWeight: 500, wordBreak: "break-word" }}>
                                {session.title}
                              </p>
                            </div>
                          </td>

                          {/* Attendance toggles */}
                          {members.map((member) => {
                            const c = COLORS[member.colorIndex];
                            const isOn = session.attendees.has(member.id);
                            return (
                              <td key={member.id} style={{ textAlign: "center", background: "transparent" }}>
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
            ) : (
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
            )}
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
