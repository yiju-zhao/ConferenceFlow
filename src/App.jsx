import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./contexts/AuthContext";
import { useMembership } from "./hooks/useMembership";
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
  Plus,
} from "lucide-react";

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { COLORS } from "./constants";
import { SESSION_CATALOG } from "./sessionCatalog";
import { getInitials } from "./lib/reportUtils";
import { parseCSVLine } from "./lib/csvUtils";
import {
  SessionTypeBadge,
  FormatBadge,
  NoRecordingBadge,
} from "./components/schedule/Badges";
import CalendarView from "./components/schedule/CalendarView";
import AddSessionModal from "./components/schedule/AddSessionModal";

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confId } = useParams();
  const { user } = useAuth();
  const { isAdmin } = useMembership(confId);
  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState({});
  const [newMemberName, setNewMemberName] = useState("");
  const fileInputRef = useRef(null);
  const [activeUploadMember, setActiveUploadMember] = useState(null);
  const [showImportMenu, setShowImportMenu] = useState(false);
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

  // Members realtime
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "conferences", confId, "members"),
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push(d.data()));
        arr.sort((a, b) => Number(a.id) - Number(b.id));
        setMembers(arr);
      },
      console.error,
    );
  }, [user, confId]);

  // Sessions realtime
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "conferences", confId, "sessions"),
      (snap) => {
        const map = {};
        snap.forEach((d) => {
          const data = d.data();
          map[data.code] = {
            ...data,
            attendees: new Set(data.attendees || []),
          };
        });
        setSessions(map);
      },
      console.error,
    );
  }, [user, confId]);

  // Auto-enrich existing sessions with catalog data
  const enrichedRef = useRef(new Set());
  useEffect(() => {
    if (!user || Object.keys(sessions).length === 0) return;
    const toEnrich = Object.values(sessions).filter(
      (s) =>
        !s.url &&
        SESSION_CATALOG.has(s.code) &&
        !enrichedRef.current.has(s.code),
    );
    if (toEnrich.length === 0) return;
    toEnrich.forEach((s) => enrichedRef.current.add(s.code));
    Promise.all(
      toEnrich.map((s) => {
        const info = SESSION_CATALOG.get(s.code);
        return setDoc(
          doc(db, "conferences", confId, "sessions", s.code),
          {
            url: info.url || "",
            speakers: info.speakers || [],
            format: info.format || "",
            recording: info.recording || "",
            session_type: info.session_type || "",
          },
          { merge: true },
        );
      }),
    ).catch(console.error);
  }, [user, confId, sessions]);

  // CSV upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !activeUploadMember) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = event.target.result
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      let hi = 0;
      for (let i = 0; i < lines.length; i++) {
        if (
          lines[i].includes("Session Code") ||
          lines[i].includes("Session Title")
        ) {
          hi = i;
          break;
        }
      }
      const headers = parseCSVLine(lines[hi]).map((h) => h.toLowerCase());
      const titleIdx = headers.findIndex((h) => h.includes("title"));
      const codeIdx = headers.findIndex((h) => h.includes("code"));
      const dateIdx = headers.findIndex((h) => h.includes("date"));
      const startIdx = headers.findIndex((h) => h.includes("start"));
      const endIdx = headers.findIndex((h) => h.includes("end"));
      const roomIdx = headers.findIndex((h) => h.includes("room"));
      const topicIdx = headers.findIndex(
        (h) => h.includes("topic") || h.includes("主题"),
      );
      const scheduledIdx = headers.findIndex((h) => h.includes("scheduled"));
      const favoritedIdx = headers.findIndex((h) => h.includes("favorit"));

      if (codeIdx === -1 || titleIdx === -1) {
        alert(t("calendar.unrecognizedCsvFormat"));
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
            title: (row[titleIdx] || "").replace(/^\(Favorited\)\s*/i, ""),
            date: dateIdx !== -1 ? row[dateIdx] : "",
            start: startIdx !== -1 ? row[startIdx] : "",
            end: endIdx !== -1 ? row[endIdx] : "",
            room: roomIdx !== -1 ? row[roomIdx] : "",
            mainTopic: topicIdx !== -1 ? row[topicIdx] : "",
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
            setDoc(doc(db, "conferences", confId, "sessions", code), {
              ...map[code],
              attendees: Array.from(map[code].attendees),
            }),
          ),
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
    if (!user) {
      alert(
        t("calendar.firebaseNotReady", { error: "user is null" }),
      );
      return;
    }
    try {
      const id = Date.now().toString();
      await setDoc(doc(db, "conferences", confId, "members", id), {
        id,
        name: newMemberName.trim(),
        mode: "onsite",
        colorIndex: (() => {
          const used = new Set(members.map((m) => m.colorIndex));
          const free = COLORS.findIndex((_, i) => !used.has(i));
          return free !== -1 ? free : members.length % COLORS.length;
        })(),
      });
      setNewMemberName("");
    } catch (err) {
      console.error("addMember error:", err);
      alert(t("calendar.writeFailed", { error: err.message }));
    }
  };

  const removeMember = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, "conferences", confId, "members", id));
    await Promise.all(
      Object.values(sessions)
        .filter((session) => session.attendees.has(id))
        .map((session) => {
          const att = Array.from(session.attendees).filter((x) => x !== id);
          if (att.length === 0) {
            return deleteDoc(
              doc(db, "conferences", confId, "sessions", session.code),
            );
          }
          return setDoc(
            doc(db, "conferences", confId, "sessions", session.code),
            { ...session, attendees: att },
            { merge: true },
          );
        }),
    );
  };

  const toggleAttendance = async (code, memberId) => {
    if (!user) return;
    const session = sessions[code];
    if (!session) return;
    const att = new Set(session.attendees);
    if (att.has(memberId)) att.delete(memberId);
    else att.add(memberId);
    await setDoc(
      doc(db, "conferences", confId, "sessions", code),
      { ...session, attendees: Array.from(att) },
      { merge: true },
    );
  };

  const emptySessions = useMemo(
    () => Object.values(sessions).filter((s) => s.attendees.size === 0),
    [sessions],
  );

  const cleanupEmptySessions = async () => {
    if (!user) return;
    await Promise.all(
      emptySessions.map((s) =>
        deleteDoc(doc(db, "conferences", confId, "sessions", s.code)),
      ),
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
      const months = {
        January: 1,
        February: 2,
        March: 3,
        April: 4,
        May: 5,
        June: 6,
        July: 7,
        August: 8,
        September: 9,
        October: 10,
        November: 11,
        December: 12,
      };
      const mo = months[m[1]] || 1;
      return `2026-${String(mo).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
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
      return `${String(h).padStart(2, "0")}:${min}`;
    };

    const timeParts = (info.time || "").split(" - ");
    const start = parseTime(timeParts[0]);
    const end = parseTime(timeParts[1]);

    await setDoc(doc(db, "conferences", confId, "sessions", id), {
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

  const onlineMembers = useMemo(
    () => members.filter((m) => (m.mode || "onsite") === "online"),
    [members],
  );

  const sortedSessions = useMemo(
    () =>
      Object.values(sessions).sort((a, b) =>
        a.date !== b.date
          ? a.date.localeCompare(b.date)
          : a.start.localeCompare(b.start),
      ),
    [sessions],
  );

  const groupedSessions = useMemo(() => {
    const groups = {};
    sortedSessions.forEach((s) => {
      const d = s.date || "TBD";
      if (!groups[d]) groups[d] = [];
      groups[d].push(s);
    });
    return Object.entries(groups).map(([date, items]) => ({
      date,
      sessions: items,
    }));
  }, [sortedSessions]);

  useEffect(() => {
    setExportDates(new Set(groupedSessions.map((g) => g.date)));
  }, [groupedSessions]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pastDates = groupedSessions
      .map((g) => g.date)
      .filter((d) => d !== "TBD" && d < today);
    if (pastDates.length > 0)
      setCollapsedDates((prev) => new Set([...prev, ...pastDates]));
  }, [groupedSessions]);

  const toggleExportDate = (date) =>
    setExportDates((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });

  const exportToCSV = () => {
    const toExport = sortedSessions.filter((s) =>
      exportDates.has(s.date || "TBD"),
    );
    if (!toExport.length) {
      alert(t("calendar.selectAtLeastOneDate"));
      return;
    }
    let csv =
      "Date,Start,End,Code,Title,Room,主要主题," +
      onlineMembers.map((m) => m.name).join(",") +
      "\n";
    toExport.forEach((s) => {
      const safeTitle = s.title.includes(",") ? `"${s.title}"` : s.title;
      const safeRoom = s.room.includes(",") ? `"${s.room}"` : s.room;
      const safeTopic = (s.mainTopic || "").includes(",")
        ? `"${s.mainTopic}"`
        : s.mainTopic || "";
      csv += `${s.date},${s.start},${s.end},${s.code},${safeTitle},${safeRoom},${safeTopic},`;
      csv +=
        onlineMembers
          .map((m) => (s.attendees.has(m.id) ? "是" : ""))
          .join(",") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
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
                <div
                  className="status-live"
                  style={{
                    background: user
                      ? "var(--success)"
                      : "var(--warning)",
                  }}
                />
                <span
                  className="font-mono schedule-status-dot"
                  style={{
                    color: user
                      ? "var(--success)"
                      : "var(--warning)",
                  }}
                >
                  {user ? "Live Sync" : "Connecting..."}
                </span>
              </div>
              <h1 className="schedule-header-title gtc-header-title">
                <Zap size={22} color="var(--brand)" strokeWidth={2.5} />
                {t("calendar.teamScheduleTitle")}
              </h1>
              <p className="schedule-header-subtitle">
                {t("calendar.teamScheduleSubtitle")}
              </p>
            </div>

            {/* Header right actions */}
            <div className="schedule-header-actions">
              <Link
                to={`/conference/${confId}/reports`}
                className="btn-accent schedule-header-report-link"
              >
                <FileText size={14} />
                {t("calendar.reportManagement")}
              </Link>
              {isAdmin && (
                <Link
                  to={`/conference/${confId}/admin/settings`}
                  className="btn-accent schedule-header-report-link"
                >
                  Admin
                </Link>
              )}

              {/* Export button + dropdown */}
              <div
                style={{
                  position: "relative",
                }}
              >
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setShowExportMenu(!showExportMenu);
                    setShowImportMenu(false);
                  }}
                >
                  <Download size={15} />
                  {t("calendar.exportSchedule")}
                  <ChevronDown
                    size={14}
                    style={{
                      transition: "transform 0.2s",
                      transform: showExportMenu ? "rotate(180deg)" : "none",
                    }}
                  />
                </button>

                {showExportMenu && (
                  <div className="dropdown-panel">
                    <p className="font-mono export-dropdown-label">
                      {t("calendar.selectExportDates")}
                    </p>
                    <div className="export-dropdown-dates">
                      {groupedSessions.length === 0 ? (
                        <span className="export-no-dates">
                          {t("calendar.noDates")}
                        </span>
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
                      <button
                        className="btn-ghost"
                        onClick={() => setShowExportMenu(false)}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        className="btn-accent export-confirm-btn"
                        onClick={exportToCSV}
                      >
                        {t("calendar.confirmExport")}
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
              {t("calendar.teamMembers")}
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
                  <div className="member-card-identity">
                    <div
                      className="member-card-dot"
                      style={{
                        background: c.hex,
                        boxShadow: `0 0 6px ${c.hex}`,
                      }}
                    />
                    <span className="member-card-name" style={{ color: c.hex }}>
                      {member.name}
                    </span>
                  </div>
                  <button
                    className="member-card-mode"
                    onClick={() =>
                      setDoc(
                        doc(db, "conferences", confId, "members", member.id),
                        {
                          ...member,
                          mode:
                            (member.mode || "onsite") === "online"
                              ? "onsite"
                              : "online",
                        },
                      )
                    }
                    title={t("report.toggleOnlineOnsite")}
                  >
                    {(member.mode || "onsite") === "online"
                      ? t("dashboard.online")
                      : t("dashboard.onsite")}
                  </button>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="member-card-remove"
                    title={t("calendar.removeMember")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}

            {/* Add member input */}
            <div className="schedule-member-add">
              <input
                className="gtc-input"
                placeholder={t("calendar.addMember")}
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  flex: 1,
                  minWidth: 0,
                }}
              />
              <button
                onClick={addMember}
                className="btn-accent"
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  flexShrink: 0,
                }}
                title={t("common.add")}
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
                {viewMode === "table"
                  ? t("calendar.scheduleMatrix")
                  : t("calendar.scheduleCalendar")}
              </span>
            </div>
            <div className="schedule-table-bar-right">
              <div style={{ position: "relative" }}>
                <button
                  className="btn-accent"
                  onClick={() => {
                    setShowImportMenu(!showImportMenu);
                    setShowExportMenu(false);
                  }}
                  style={{ padding: "4px 10px", fontSize: 11, gap: 4 }}
                  disabled={members.length === 0}
                >
                  <Upload size={12} />
                  {t("calendar.importSchedule")}
                </button>
                {showImportMenu && members.length > 0 && (
                  <div className="import-member-dropdown">
                    <div className="import-member-dropdown-label">
                      {t("calendar.selectMember")}
                    </div>
                    {members.map((m) => {
                      const c = COLORS[m.colorIndex];
                      return (
                        <button
                          key={m.id}
                          className="import-member-dropdown-item"
                          onClick={() => {
                            setShowImportMenu(false);
                            triggerUpload(m.id);
                          }}
                        >
                          <span
                            className="member-card-dot"
                            style={{
                              background: c.hex,
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ color: c.hex, fontWeight: 600 }}>
                            {m.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                className="btn-accent"
                onClick={() => setShowAddSession(true)}
                style={{ padding: "4px 10px", fontSize: 11, gap: 4 }}
              >
                <Plus size={13} />
                {t("calendar.addSession")}
              </button>
              {emptySessions.length > 0 && !showCleanupConfirm && (
                <button
                  onClick={() => setShowCleanupConfirm(true)}
                  title={t("report.deleteUnattended")}
                  className="font-mono schedule-cleanup-btn"
                >
                  {t("calendar.cleanup")} · {emptySessions.length}
                </button>
              )}
              {showCleanupConfirm && (
                <div className="schedule-cleanup-confirm">
                  <span className="font-mono schedule-cleanup-confirm-text">
                    {t("calendar.confirmCleanup", {
                      count: emptySessions.length,
                    })}
                  </span>
                  <button
                    onClick={cleanupEmptySessions}
                    className="schedule-confirm-yes"
                  >
                    {t("common.confirm")}
                  </button>
                  <button
                    onClick={() => setShowCleanupConfirm(false)}
                    className="schedule-confirm-no"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              )}
              <span className="font-mono schedule-session-count">
                {sortedSessions.length} sessions
              </span>
              <div className="schedule-view-toggle">
                <button
                  onClick={() => setViewMode("table")}
                  title={t("calendar.tableView")}
                  className={`schedule-view-btn${viewMode === "table" ? " active" : ""}`}
                >
                  <LayoutList size={13} />
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  title={t("calendar.calendarView")}
                  className={`schedule-view-btn${viewMode === "calendar" ? " active" : ""}`}
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
                members={onlineMembers}
                toggleAttendance={toggleAttendance}
                user={user}
                collapsedDates={collapsedDates}
                toggleDateCollapse={toggleDateCollapse}
              />
            )}
            {groupedSessions.length > 0 && viewMode === "table" ? (
              <table
                className="schedule-table"
                style={{ tableLayout: "fixed", width: "100%" }}
              >
                <thead>
                  <tr>
                    <th style={{ width: 180, textAlign: "left" }}>
                      {t("calendar.timeLocation")}
                    </th>
                    <th style={{ textAlign: "left", maxWidth: 420 }}>
                      Session
                    </th>
                    {onlineMembers.map((m) => {
                      const c = COLORS[m.colorIndex];
                      return (
                        <th
                          key={m.id}
                          title={m.name}
                          style={{
                            width: 48,
                            textAlign: "center",
                            color: c.hex,
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            lineHeight: 1.3,
                          }}
                        >
                          {getInitials(m.name)}
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
                        <td colSpan={onlineMembers.length + 2}>
                          <div className="table-date-row-inner">
                            <ChevronRight
                              size={13}
                              color="var(--brand)"
                              style={{
                                transition: "transform 0.2s",
                                transform: collapsedDates.has(group.date)
                                  ? "none"
                                  : "rotate(90deg)",
                                flexShrink: 0,
                              }}
                            />
                            <CalendarDays size={13} color="var(--brand)" />
                            <span className="table-date-text">
                              {group.date}
                            </span>
                            <span className="font-mono table-date-count">
                              {group.sessions.length} sessions
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Session rows */}
                      {!collapsedDates.has(group.date) &&
                        group.sessions.map((session) => (
                          <tr key={session.code} className="session-row">
                            {/* Time + Room */}
                            <td
                              className="col-time"
                              style={{ width: 160, maxWidth: 160 }}
                            >
                              <div className="table-col-time-inner">
                                <div className="table-time-row">
                                  <Clock size={11} color="var(--brand)" />
                                  <span className="font-mono table-time-text">
                                    {session.start}–{session.end}
                                  </span>
                                </div>
                                {session.room && (
                                  <div className="table-room-row">
                                    <MapPin
                                      size={11}
                                      color="var(--text-muted)"
                                      style={{ flexShrink: 0, marginTop: 1 }}
                                    />
                                    <span className="table-room-text">
                                      {session.room}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Session code + title */}
                            <td
                              className="col-session"
                              style={{ width: 380, maxWidth: 420 }}
                            >
                              <div className="table-session-inner">
                                {/* Code badge + attribute pills on same row */}
                                <div className="table-session-meta-row">
                                  {session.url ? (
                                    <a
                                      href={session.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ textDecoration: "none" }}
                                    >
                                      <span className="code-badge">
                                        {session.code}
                                      </span>
                                    </a>
                                  ) : (
                                    <span className="code-badge">
                                      {session.code}
                                    </span>
                                  )}
                                  {(session.session_type ||
                                    session.format ||
                                    session.recording === "No") && (
                                    <div className="table-session-pills">
                                      {session.session_type && (
                                        <SessionTypeBadge
                                          type={session.session_type}
                                        />
                                      )}
                                      {session.format && (
                                        <FormatBadge format={session.format} />
                                      )}
                                      {session.recording &&
                                        session.recording !== "Yes" && (
                                          <NoRecordingBadge />
                                        )}
                                    </div>
                                  )}
                                </div>

                                {/* Title */}
                                <p className="table-session-title">
                                  {SESSION_CATALOG.get(session.code)?.url ? (
                                    <a
                                      href={
                                        SESSION_CATALOG.get(session.code).url
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {SESSION_CATALOG.get(session.code)
                                        ?.title || session.title}
                                    </a>
                                  ) : (
                                    SESSION_CATALOG.get(session.code)?.title ||
                                    session.title
                                  )}
                                </p>

                                {/* Speakers */}
                                {session.speakers?.length > 0 && (
                                  <div className="table-session-speakers">
                                    {session.speakers.map((sp, i) => (
                                      <span
                                        key={i}
                                        className="table-session-speaker"
                                      >
                                        {sp.name}
                                        {sp.title ? ` · ${sp.title}` : ""}
                                        {sp.company ? `, ${sp.company}` : ""}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Attendance toggles */}
                            {onlineMembers.map((member) => {
                              const c = COLORS[member.colorIndex];
                              const isOn = session.attendees.has(member.id);
                              return (
                                <td
                                  key={member.id}
                                  className="col-attend"
                                  style={{ textAlign: "center" }}
                                >
                                  <button
                                    onClick={() =>
                                      toggleAttendance(session.code, member.id)
                                    }
                                    className={`attend-btn${isOn ? " active" : ""}`}
                                    style={{
                                      "--member-color": c.hex,
                                      "--member-bg": c.bg,
                                      "--member-glow": c.glow,
                                    }}
                                    title={t("calendar.toggleAttendance", {
                                      name: member.name,
                                    })}
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
                      <div
                        key={i}
                        className="empty-cell"
                        style={{ opacity: Math.random() * 0.5 + 0.05 }}
                      />
                    ))}
                  </div>
                </div>
                <div className="schedule-empty-text">
                  <p className="schedule-empty-title">
                    {t("calendar.noScheduleData")}
                  </p>
                  <p className="schedule-empty-desc">
                    {t("calendar.importCsvHint")}
                  </p>
                </div>
                <div className="schedule-empty-hint">
                  <Upload size={13} />
                  <span>{t("calendar.clickImportToStart")}</span>
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
          onAdd={async (id) => {
            await addSessionFromCatalog(id);
          }}
          onClose={() => setShowAddSession(false)}
          user={user}
        />
      )}
    </div>
  );
}
