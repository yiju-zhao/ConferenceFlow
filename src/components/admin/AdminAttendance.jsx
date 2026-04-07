import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { COLORS } from "../../constants";
import { generateId } from "../../lib/reportUtils";
import { useTranslation } from "react-i18next";
import { formatShortDate, formatLongDate } from '../../i18n/dateUtils';

const COLOR_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

function SessionAssignSearch({ sessions, onAssign, t }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return sessions
      .filter((s) =>
        s.title?.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q) ||
        s.mainTopic?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [sessions, query]);

  const handleSelect = (sessionId) => {
    onAssign(sessionId);
    setQuery("");
    setFocused(false);
  };

  return (
    <div className="mt-2 relative" style={{ maxWidth: 480 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={t('admin.assignSessionSearch')}
        className="w-full bg-surface-container-high p-2 text-on-surface text-xs border-0 border-b-2 border-transparent focus:border-admin-teal focus:outline-none"
      />
      {focused && query.trim() && results.length > 0 && (
        <div className="absolute z-10 left-0 right-0 bg-surface-container-lowest shadow-lg max-h-60 overflow-y-auto"
          style={{ top: "100%", border: "1px solid #dadada" }}>
          {results.map((s) => (
            <button
              key={s.id}
              onMouseDown={() => handleSelect(s.id)}
              className="w-full text-left px-3 py-2 hover:bg-surface-container/50 transition-colors flex items-center gap-2"
            >
              {s.code && (
                <span className="text-admin-teal text-[10px] font-mono bg-admin-teal/10 px-1.5 py-0.5 flex-shrink-0">{s.code}</span>
              )}
              <span className="text-on-surface text-xs flex-1 min-w-0 truncate">{s.title}</span>
              <span className="text-secondary text-[10px] flex-shrink-0">{s.date} {s.start}</span>
            </button>
          ))}
        </div>
      )}
      {focused && query.trim() && results.length === 0 && (
        <div className="absolute z-10 left-0 right-0 bg-surface-container-lowest px-3 py-2 text-secondary text-xs"
          style={{ top: "100%", border: "1px solid #dadada" }}>
          {t('admin.noMatchingSessions')}
        </div>
      )}
    </div>
  );
}

export default function AdminAttendance() {
  const { confId } = useParams();
  const { user, isSuperAdmin } = useAuth();
  const { t } = useTranslation();

  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [userNames, setUserNames] = useState({});

  // Section 2 view mode: "byMember" | "bySession"
  const [assignView, setAssignView] = useState("bySession");
  // Expanded member in "byMember" view
  const [expandedMemberId, setExpandedMemberId] = useState(null);
  // Expanded session in "bySession" view
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  // Selected day for "bySession" calendar view
  const [selectedDay, setSelectedDay] = useState(null);

  // Add attendee form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addMode, setAddMode] = useState("onsite");
  const [addLoading, setAddLoading] = useState(false);

  // Inline edit state: { memberId, name, mode }
  const [editState, setEditState] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Remove confirmation: memberId string or null
  const [removeConfirm, setRemoveConfirm] = useState(null);

  // Session detail modal: session object or null
  const [sessionDetailModal, setSessionDetailModal] = useState(null);

  // Mode filter for By Member view: "all" | "onsite" | "online"
  const [modeFilter, setModeFilter] = useState("all");

  // By-session: dropdown open for a session
  const [bySessionDropdown, setBySessionDropdown] = useState(null);

  // ── Real-time listeners ────────────────────────────────────────────────────

  useEffect(() => {
    return onSnapshot(
      collection(db, "conferences", confId, "members"),
      async (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMembers(arr);

        const names = {};
        for (const m of arr) {
          if (m.managedByAdmin) {
            names[m.id] = m.displayName || "Unnamed";
          } else if (m.legacyName) {
            names[m.id] = m.legacyName + " (legacy)";
          } else {
            try {
              const userSnap = await getDoc(doc(db, "users", m.id));
              names[m.id] = userSnap.exists()
                ? userSnap.data().displayName || userSnap.data().email || m.id
                : m.id;
            } catch {
              names[m.id] = m.id;
            }
          }
        }
        setUserNames(names);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confId]);

  useEffect(() => {
    return onSnapshot(
      collection(db, "conferences", confId, "sessions"),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        setSessions(arr);
      }
    );
  }, [confId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const sessionCountForMember = useCallback(
    (memberId) => sessions.filter((s) => (s.attendees || []).includes(memberId)).length,
    [sessions]
  );

  const approvedMembers = useMemo(
    () => members.filter((m) => m.status === "approved"),
    [members]
  );

  // ── Attendee CRUD ──────────────────────────────────────────────────────────

  const handleAddAttendee = async () => {
    if (!addName.trim()) return;
    setAddLoading(true);
    try {
      const id = generateId();
      const usedIndices = members.map((m) => m.colorIndex).filter((c) => c !== undefined);
      const colorIndex =
        COLOR_INDICES.find((i) => !usedIndices.includes(i)) ??
        Math.floor(Math.random() * COLOR_INDICES.length);
      await setDoc(doc(db, "conferences", confId, "members", id), {
        displayName: addName.trim(),
        attendanceMode: addMode,
        role: "member",
        status: "approved",
        managedByAdmin: true,
        colorIndex,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      setAddName("");
      setAddMode("onsite");
      setShowAddForm(false);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveAttendee = async (memberId) => {
    if (!window.confirm("Remove this attendee? This will also unassign them from all sessions.")) return;
    try {
      // Remove from all sessions first
      const sessionsWithMember = sessions.filter((s) =>
        (s.attendees || []).includes(memberId)
      );
      await Promise.all(
        sessionsWithMember.map((s) =>
          updateDoc(doc(db, "conferences", confId, "sessions", s.id), {
            attendees: arrayRemove(memberId),
          })
        )
      );
      await deleteDoc(doc(db, "conferences", confId, "members", memberId));
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!editState || !editState.name.trim()) return;
    setEditLoading(true);
    try {
      await updateDoc(doc(db, "conferences", confId, "members", editState.memberId), {
        displayName: editState.name.trim(),
        attendanceMode: editState.mode,
      });
      // Update local name cache immediately
      setUserNames((prev) => ({ ...prev, [editState.memberId]: editState.name.trim() }));
      setEditState(null);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setEditLoading(false);
    }
  };

  // ── Session Assignment ─────────────────────────────────────────────────────

  const handleToggleSession = async (memberId, sessionId, currentlyAssigned) => {
    try {
      await updateDoc(doc(db, "conferences", confId, "sessions", sessionId), {
        attendees: currentlyAssigned ? arrayRemove(memberId) : arrayUnion(memberId),
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleAssignToSession = async (memberId, sessionId) => {
    try {
      await updateDoc(doc(db, "conferences", confId, "sessions", sessionId), {
        attendees: arrayUnion(memberId),
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
    setBySessionDropdown(null);
  };

  // ── Role management ────────────────────────────────────────────────────────

  const handleSetAdmin = async (memberId) => {
    try {
      await updateDoc(doc(db, "conferences", confId, "members", memberId), { role: "admin" });
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleRemoveAdmin = async (memberId) => {
    try {
      await updateDoc(doc(db, "conferences", confId, "members", memberId), { role: "member" });
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const getMemberName = (m) => userNames[m.id] || m.displayName || m.id;

  const ModeBadge = ({ mode }) => (
    mode === "online" ? (
      <span className="inline-flex items-center gap-1.5 bg-[#2980B9]/10 text-[#2980B9] text-xs px-2.5 py-1 uppercase tracking-wider font-headline">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="0" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        Online
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 bg-[#27AE60]/10 text-[#27AE60] text-xs px-2.5 py-1 uppercase tracking-wider font-headline">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
        </svg>
        Onsite
      </span>
    )
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Section 1: Attendee Table ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 bg-admin-teal inline-block" />
          <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
            {t('admin.attendeeManagement')}
          </h2>
          <span className="text-secondary text-xs uppercase tracking-wider ml-1">
            {approvedMembers.length} {t('admin.members')}
          </span>
        </div>
        <button
          onClick={() => { setShowAddForm((v) => !v); setAddName(""); setAddMode("onsite"); }}
          className="bg-admin-teal text-white px-4 py-2 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity rounded-lg"
        >
          {showAddForm ? t('common.cancel') : t('admin.addAttendee')}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-surface-container-lowest border-b border-surface-dim p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{t('admin.name')}</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddAttendee()}
              placeholder={t('admin.fullName')}
              className="w-full bg-surface-container-high p-2 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-admin-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{t('admin.mode')}</label>
            <div className="flex gap-1">
              {["onsite", "online"].map((m) => (
                <button
                  key={m}
                  onClick={() => setAddMode(m)}
                  className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 rounded-lg ${
                    addMode === m
                      ? "bg-admin-teal text-white"
                      : "bg-surface-container text-secondary hover:text-on-surface"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleAddAttendee}
            disabled={addLoading || !addName.trim()}
            className="bg-admin-teal text-white px-5 py-2 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50 rounded-lg"
          >
            {addLoading ? t('admin.adding') : t('admin.add')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-container-lowest mb-10 rounded-lg shadow-sm">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[2fr_100px_100px_100px_160px] gap-4 px-4 py-2 border-b border-surface-dim bg-surface-container">
          <span className="text-secondary text-xs uppercase tracking-wider font-headline">{t('admin.name')}</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">{t('admin.mode')}</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">{t('admin.role')}</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">{t('admin.sessions')}</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">{t('admin.actions')}</span>
        </div>

        {approvedMembers.length === 0 && (
          <div className="p-6 text-center text-secondary text-sm">{t('admin.noApprovedMembers')}</div>
        )}

        {approvedMembers.map((m) => {
          const isEditing = editState?.memberId === m.id;
          const sessionCount = sessionCountForMember(m.id);

          return (
            <div key={m.id} className="border-b border-surface-dim last:border-b-0">
              {isEditing ? (
                /* Edit row */
                <div className="p-4 flex flex-wrap gap-3 items-end bg-surface-container/40">
                  <div className="flex-1 min-w-40">
                    <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{t('admin.name')}</label>
                    <input
                      type="text"
                      value={editState.name}
                      onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                      className="w-full bg-surface-container-high p-2 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-admin-teal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{t('admin.mode')}</label>
                    <div className="flex gap-1">
                      {["onsite", "online"].map((mo) => (
                        <button
                          key={mo}
                          onClick={() => setEditState({ ...editState, mode: mo })}
                          className={`px-3 py-1.5 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${
                            editState.mode === mo
                              ? "bg-admin-teal text-white"
                              : "bg-surface-container text-secondary hover:text-on-surface"
                          }`}
                        >
                          {mo}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={editLoading}
                      className="bg-admin-teal text-white px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {editLoading ? t('common.saving') : t('common.save')}
                    </button>
                    <button
                      onClick={() => setEditState(null)}
                      className="bg-surface-container text-secondary px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:text-on-surface transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal row */
                <div className="md:grid md:grid-cols-[2fr_100px_100px_100px_160px] gap-4 px-4 py-3 flex flex-wrap items-center">
                  <div className="text-on-surface text-sm font-bold truncate min-w-0">
                    {getMemberName(m)}
                  </div>
                  <div className="flex items-center justify-center">
                    <ModeBadge mode={m.attendanceMode || "onsite"} />
                  </div>
                  <div className="flex items-center justify-center">
                    {m.role === "admin" ? (
                      <span className="bg-admin-teal/10 text-admin-teal text-xs px-2 py-0.5 uppercase tracking-wider font-headline">
                        Admin
                      </span>
                    ) : m.managedByAdmin ? (
                      <span className="bg-[#E67E22]/10 text-[#E67E22] text-xs px-2 py-0.5 uppercase tracking-wider font-headline">
                        Attendee
                      </span>
                    ) : (
                      <span className="bg-[#F1C40F]/10 text-[#D4AC0D] text-xs px-2 py-0.5 uppercase tracking-wider font-headline">
                        Member
                      </span>
                    )}
                  </div>
                  <div className="text-secondary text-xs text-center">
                    {sessionCount} {t('admin.sessions').toLowerCase()}
                  </div>
                  <div className="flex gap-2 items-center justify-center">
                    {/* Slot 1: Promote / Demote / Edit — fixed width */}
                    <span className="w-16 text-center">
                      {!m.managedByAdmin && !m.legacyName && m.role !== "admin" && m.status === "approved" ? (
                        <button onClick={() => handleSetAdmin(m.id)} className="text-admin-teal text-xs hover:underline">{t('admin.promote')}</button>
                      ) : !m.managedByAdmin && !m.legacyName && m.role === "admin" && isSuperAdmin && m.id !== user.uid ? (
                        <button onClick={() => handleRemoveAdmin(m.id)} className="text-secondary text-xs hover:text-admin-teal hover:underline">{t('admin.demote')}</button>
                      ) : m.managedByAdmin ? (
                        <button onClick={() => setEditState({ memberId: m.id, name: m.displayName || getMemberName(m), mode: m.attendanceMode || "onsite" })}
                          className="text-secondary text-xs hover:text-on-surface">{t('admin.edit')}</button>
                      ) : null}
                    </span>
                    {/* Slot 2: Remove — fixed width */}
                    <span className="w-20 text-center">
                      {m.role !== "admin" && m.id !== user.uid ? (
                        removeConfirm === m.id ? (
                          <span className="flex gap-1 items-center justify-center">
                            <button onClick={() => { handleRemoveAttendee(m.id); setRemoveConfirm(null); }}
                              className="bg-admin-teal text-white px-2 py-1 text-[10px] font-headline uppercase tracking-wider">{t('admin.yes')}</button>
                            <button onClick={() => setRemoveConfirm(null)}
                              className="bg-surface-container text-secondary px-2 py-1 text-[10px] font-headline uppercase tracking-wider">{t('admin.no')}</button>
                          </span>
                        ) : (
                          <button onClick={() => setRemoveConfirm(m.id)}
                            className="bg-surface-container text-admin-teal px-3 py-1 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity">{t('admin.remove')}</button>
                        )
                      ) : null}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Section 2: Session Assignment ─────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 bg-admin-teal inline-block" />
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          {t('admin.sessionAssignment')}
        </h2>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-6">
        {[
          { key: "bySession", label: t('admin.bySession') },
          { key: "byMember", label: t('admin.byMember') },
        ].map((v) => (
          <button
            key={v.key}
            onClick={() => { setAssignView(v.key); setExpandedMemberId(null); setExpandedSessionId(null); }}
            className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${
              assignView === v.key
                ? "bg-admin-teal text-white"
                : "bg-surface-container text-secondary hover:text-on-surface"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* ── By Member View ────────────────────────────────────────────────── */}
      {assignView === "byMember" && (() => {
        const filteredMembers = approvedMembers.filter((m) => {
          if (modeFilter === "all") return true;
          return (m.attendanceMode || "onsite") === modeFilter;
        });
        return (
        <div>
          {/* Mode filter */}
          <div className="flex gap-1 mb-3">
            {[
              { key: "all", label: t('admin.filterAll') },
              { key: "onsite", label: t('dashboard.onsite') },
              { key: "online", label: t('dashboard.online') },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setModeFilter(f.key)}
                className={`px-3 py-1.5 text-[10px] font-headline uppercase tracking-wider transition-colors duration-50 ${
                  modeFilter === f.key
                    ? "bg-admin-teal text-white"
                    : "bg-surface-container text-secondary hover:text-on-surface"
                }`}
              >
                {f.label} ({f.key === "all" ? approvedMembers.length : approvedMembers.filter((m) => (m.attendanceMode || "onsite") === f.key).length})
              </button>
            ))}
          </div>
          <div className="bg-surface-container-lowest">
          {filteredMembers.length === 0 && (
            <div className="p-6 text-center text-secondary text-sm">{t('admin.noMembersToDisplay')}</div>
          )}
          {filteredMembers.map((m) => {
            const isExpanded = expandedMemberId === m.id;
            return (
              <div key={m.id} className="border-b border-surface-dim last:border-b-0">
                {/* Member row — clickable to expand */}
                <button
                  onClick={() => setExpandedMemberId(isExpanded ? null : m.id)}
                  className="w-full px-4 py-3 flex justify-between items-center hover:bg-surface-container/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-on-surface text-sm font-bold">{getMemberName(m)}</span>
                    <ModeBadge mode={m.attendanceMode || "onsite"} />
                    {m.role === "admin" ? (
                      <span className="bg-admin-teal/10 text-admin-teal text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-headline">Admin</span>
                    ) : m.managedByAdmin ? (
                      <span className="bg-[#E67E22]/10 text-[#E67E22] text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-headline">Attendee</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-secondary text-xs">
                      {sessionCountForMember(m.id)} {t('admin.sessionsAssigned')}
                    </span>
                    <span className="text-secondary text-xs font-headline uppercase tracking-wider">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {/* Expanded: attending sessions grouped by date */}
                {isExpanded && (() => {
                  const memberSessions = sessions.filter((s) => (s.attendees || []).includes(m.id));
                  // Group by date
                  const byDate = {};
                  memberSessions.forEach((s) => {
                    const d = s.date || "Unknown";
                    if (!byDate[d]) byDate[d] = [];
                    byDate[d].push(s);
                  });
                  // Sort dates, sort sessions within each date by start time
                  const sortedDates = Object.keys(byDate).sort();
                  sortedDates.forEach((d) => byDate[d].sort((a, b) => (a.start || "").localeCompare(b.start || "")));

                  const canUnassign = m.managedByAdmin; // only attendees can be unassigned by admin
                  const canAssign = m.role !== "admin"; // admins can't have sessions assigned by other admins
                  const unassignedSessions = canAssign ? sessions.filter((s) => !(s.attendees || []).includes(m.id)) : [];

                  return (
                    <div className="bg-surface-container/20 px-6 py-3 border-t border-surface-dim">
                      {memberSessions.length === 0 && !canAssign && (
                        <p className="text-secondary text-xs">{t('admin.noSessionsAssigned')}</p>
                      )}
                      {memberSessions.length === 0 && canAssign && (
                        <p className="text-secondary text-xs mb-3">{t('admin.noSessionsAssigned')}</p>
                      )}
                      {memberSessions.length > 0 && (
                        <div className="mb-3">
                          {sortedDates.map((date) => (
                            <div key={date} className="mb-4 last:mb-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-1 h-4 bg-admin-teal inline-block"></span>
                                <span className="text-xs font-headline font-bold uppercase tracking-wider text-admin-teal">
                                  {formatShortDate(new Date(date + "T00:00:00"))}
                                </span>
                                <span className="text-secondary text-[10px]">({byDate[date].length} sessions)</span>
                              </div>
                              <div className="grid gap-1 ml-3">
                                {byDate[date].map((s) => (
                                  <div
                                    key={s.id}
                                    onClick={() => setSessionDetailModal(s)}
                                    className="flex items-center gap-3 px-3 py-2 hover:bg-surface-container/50 transition-colors text-left w-full cursor-pointer"
                                  >
                                    <span className="text-secondary text-xs font-mono w-24 flex-shrink-0">
                                      {s.start}–{s.end}
                                    </span>
                                    <span className="text-on-surface text-sm flex-1 min-w-0 truncate">
                                      {s.title}
                                    </span>
                                    {s.room && (
                                      <span className="text-secondary text-xs flex-shrink-0">{s.room}</span>
                                    )}
                                    {canUnassign && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleSession(m.id, s.id, true); }}
                                        className="text-admin-teal text-xs hover:underline flex-shrink-0"
                                      >
                                        {t('admin.unassign')}
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Assign new session — search input */}
                      {canAssign && unassignedSessions.length > 0 && (
                        <SessionAssignSearch
                          sessions={unassignedSessions}
                          onAssign={(sessionId) => handleToggleSession(m.id, sessionId, false)}
                          t={t}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        </div>
        );
      })()}

      {/* ── By Session View — Single-Day Calendar ────────────────────────── */}
      {assignView === "bySession" && (() => {
        // Get all unique dates
        const allDates = [...new Set(sessions.map((s) => s.date))].sort();
        const activeDay = selectedDay || allDates[0] || null;

        if (!activeDay) return <div className="p-6 text-center text-secondary text-sm">{t('admin.noSessions')}</div>;

        // Sessions for the active day
        const daySessions = sessions.filter((s) => s.date === activeDay);

        const PX_PER_MIN = 2.5; // 150px per hour
        const toMin = (t) => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

        // Time range
        let minH = 24, maxH = 0;
        daySessions.forEach((s) => {
          const sh = parseInt(s.start?.split(":")[0] || "9");
          const eh = Math.ceil(toMin(s.end) / 60);
          if (sh < minH) minH = sh;
          if (eh > maxH) maxH = eh;
        });
        const dayStartMin = minH * 60;
        const dayEndMin = maxH * 60;
        const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN;
        const hourLabels = [];
        for (let h = minH; h <= maxH; h++) hourLabels.push(`${String(h).padStart(2, "0")}:00`);

        // Column packing for overlaps — per overlap group
        const sorted = [...daySessions].sort((a, b) => toMin(a.start) - toMin(b.start));
        const groups = [];
        for (const s of sorted) {
          const sStart = toMin(s.start), sEnd = toMin(s.end);
          const last = groups[groups.length - 1];
          if (last && sStart < last.groupEnd) {
            last.sessions.push(s); last.groupEnd = Math.max(last.groupEnd, sEnd);
          } else {
            groups.push({ sessions: [s], groupEnd: sEnd });
          }
        }
        const placements = [];
        for (const g of groups) {
          const cols = [];
          const gp = [];
          for (const s of g.sessions) {
            const sStart = toMin(s.start), sEnd = toMin(s.end);
            let placed = false;
            for (let i = 0; i < cols.length; i++) {
              if (sStart >= cols[i]) { cols[i] = sEnd; gp.push({ session: s, colIndex: i }); placed = true; break; }
            }
            if (!placed) { cols.push(sEnd); gp.push({ session: s, colIndex: cols.length - 1 }); }
          }
          const totalCols = cols.length;
          gp.forEach((p) => placements.push({ ...p, totalCols }));
        }


        return (
          <div>
            {/* Day switcher — Warm Midnight style */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              {allDates.map((d) => {
                const label = formatShortDate(new Date(d + "T00:00:00"));
                const count = sessions.filter((s) => s.date === d).length;
                const isActive = activeDay === d;
                return (
                  <button key={d} onClick={() => setSelectedDay(d)}
                    style={{
                      padding: "8px 16px", fontSize: 12, fontFamily: "'Work Sans', sans-serif", fontWeight: 600,
                      letterSpacing: "0.5px", textTransform: "uppercase", border: "none", cursor: "pointer",
                      borderRadius: 4, transition: "all 120ms ease",
                      background: isActive ? "#E8976B" : "#272C35",
                      color: isActive ? "#fff" : "#A9A5A0",
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#EDEAE5"; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#A9A5A0"; }}>
                    {label} <span style={{ opacity: 0.6 }}>({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Calendar grid — Warm Midnight theme (matches schedule page) */}
            <div style={{ background: "#171B21", padding: 16, borderRadius: 8, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
              <div style={{ background: "#272C35", padding: "12px 16px", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontFamily: "'Work Sans', sans-serif", fontWeight: 700, fontSize: 14, color: "#E8976B", letterSpacing: "0.3px" }}>
                  {formatLongDate(new Date(activeDay + "T00:00:00"))}
                </span>
                <span style={{ color: "#7A7670", fontSize: 13 }}>{daySessions.length} {t('admin.sessions').toLowerCase()}</span>
              </div>

              <div style={{ display: "flex" }}>
                {/* Hour labels */}
                <div style={{ width: 56, flexShrink: 0, position: "relative", height: totalHeight }}>
                  {hourLabels.map((label) => {
                    const top = (parseInt(label) * 60 - dayStartMin) * PX_PER_MIN;
                    return <div key={label} style={{ position: "absolute", top, right: 6, fontSize: 12, color: "#7A7670", fontFamily: "'Inter', sans-serif" }}>{label}</div>;
                  })}
                </div>

                {/* Session area */}
                <div style={{ flex: 1, position: "relative", height: totalHeight, background: "#272C35", borderRadius: 4 }}>
                  {/* Hour grid lines */}
                  {hourLabels.map((label) => {
                    const top = (parseInt(label) * 60 - dayStartMin) * PX_PER_MIN;
                    return <div key={label} style={{ position: "absolute", top, left: 0, right: 0, borderTop: "1px solid #333840", pointerEvents: "none" }} />;
                  })}

                  {/* Session blocks */}
                  {placements.map(({ session: s, colIndex, totalCols }) => {
                    const sStart = toMin(s.start), sEnd = toMin(s.end);
                    const top = (sStart - dayStartMin) * PX_PER_MIN;
                    const height = Math.max((sEnd - sStart) * PX_PER_MIN, 24);
                    const left = `${(colIndex / totalCols) * 100}%`;
                    const width = `calc(${100 / totalCols}% - 2px)`;
                    const attendeeCount = (s.attendees || []).length;

                    return (
                      <div key={s.id} onClick={() => setSessionDetailModal(s)}
                        style={{ position: "absolute", top, left, width, height, background: "#E8976B", padding: "6px 10px", cursor: "pointer", overflow: "hidden", boxSizing: "border-box", transition: "opacity 120ms ease", display: "flex", flexDirection: "column", borderRadius: 3 }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)", flexShrink: 0 }}>{s.start}–{s.end}</div>
                        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", marginTop: 3 }}>
                          <div style={{ fontSize: 13, color: "#fff", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.title}</div>
                        </div>
                        {attendeeCount > 0 && (
                          <div style={{ display: "flex", gap: 2, marginTop: "auto", paddingTop: 3, flexShrink: 0 }}>
                            {(s.attendees || []).slice(0, 5).map((uid) => {
                              const member = approvedMembers.find((mm) => mm.id === uid);
                              if (!member) return null;
                              return (
                                <div key={uid} style={{ width: 16, height: 16, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", background: COLORS[(member.colorIndex || 0) % COLORS.length].hex }}
                                  title={getMemberName(member)}>
                                  {(getMemberName(member) || "?").charAt(0).toUpperCase()}
                                </div>
                              );
                            })}
                            {attendeeCount > 5 && <div style={{ width: 16, height: 16, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#7A7670", background: "#1E2229" }}>+{attendeeCount - 5}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Session Detail Modal ─────────────────────────────────────────── */}
      {sessionDetailModal && (() => {
        const s = sessionDetailModal;
        const sessionAttendees = approvedMembers.filter((m) => (s.attendees || []).includes(m.id));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }} onClick={() => setSessionDetailModal(null)}>
            <div style={{ width: 380, maxWidth: "90vw", maxHeight: "80vh", overflow: "auto", background: "#1E2229", borderRadius: 10, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: "#EDEAE5" }} onClick={(e) => e.stopPropagation()}>

              {/* Title block */}
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #333840" }}>
                {s.code && (
                  <span style={{ display: "inline-block", fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#E8976B", background: "rgba(232,151,107,0.1)", padding: "3px 8px", borderRadius: 3, marginBottom: 8 }}>{s.code}</span>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#EDEAE5", lineHeight: 1.35 }}>{s.title}</h3>
                  <button onClick={() => setSessionDetailModal(null)} style={{ background: "none", border: "none", color: "#7A7670", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              </div>

              {/* Info chips */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #333840", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A9A5A0" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A7670" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {s.date} · {s.start}–{s.end}
                </div>
                {s.room && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A9A5A0" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A7670" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {s.room}
                  </div>
                )}
                {s.format && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A9A5A0" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A7670" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    {s.format}{s.recording === "Yes" && " · Recording"}
                  </div>
                )}
              </div>

              {/* Themes */}
              {(s.keyThemes || []).length > 0 && (
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #333840" }}>
                  <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#7A7670", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>{t('admin.topics')}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {s.keyThemes.map((t, i) => (
                      <span key={i} style={{ fontSize: 12, fontWeight: 500, color: "#EDEAE5", background: "#272C35", padding: "4px 10px", borderRadius: 12, border: "1px solid #333840" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Speakers */}
              {(s.speakers || []).length > 0 && (
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #333840" }}>
                  <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#7A7670", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>{t('admin.speakers')}</div>
                  {s.speakers.map((sp, i) => (
                    <div key={i} style={{ marginBottom: i < s.speakers.length - 1 ? 8 : 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#EDEAE5", lineHeight: 1.3 }}>{sp.name}</div>
                      {(sp.title || sp.company) && (
                        <div style={{ fontSize: 12, color: "#A9A5A0", marginTop: 2 }}>{[sp.title, sp.company].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Attendees */}
              <div style={{ padding: "14px 20px", borderBottom: s.url ? "1px solid #333840" : "none" }}>
                <div style={{ fontFamily: "'Work Sans', sans-serif", fontSize: 11, fontWeight: 700, color: "#7A7670", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  {t('admin.attending')}
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#E8976B", background: "rgba(232,151,107,0.12)", padding: "1px 7px", borderRadius: 10, letterSpacing: 0, textTransform: "none" }}>{sessionAttendees.length}</span>
                </div>
                {sessionAttendees.length === 0 ? (
                  <p style={{ color: "#7A7670", fontSize: 13 }}>{t('admin.noOneAssigned')}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sessionAttendees.map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS[(m.colorIndex || 0) % COLORS.length].hex, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {(getMemberName(m) || "?").charAt(0).toUpperCase()}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: "#EDEAE5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getMemberName(m)}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, letterSpacing: "0.3px", padding: "2px 8px", borderRadius: 10, flexShrink: 0,
                            ...(m.attendanceMode === "online"
                              ? { color: "#7BA4D4", background: "rgba(123,164,212,0.1)", border: "1px solid rgba(123,164,212,0.2)" }
                              : { color: "#6BBBAD", background: "rgba(107,187,173,0.1)", border: "1px solid rgba(107,187,173,0.2)" })
                          }}>
                            {m.attendanceMode === "online" ? "Online" : "Onsite"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Session URL */}
              {s.url && (
                <div style={{ padding: "14px 20px" }}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#272C35", color: "#A9A5A0", textAlign: "center", padding: "10px 14px", fontSize: 13, border: "1px solid #333840", borderRadius: 6, textDecoration: "none", transition: "all 120ms ease" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#EDEAE5"; e.currentTarget.style.borderColor = "#7A7670"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "#A9A5A0"; e.currentTarget.style.borderColor = "#333840"; }}>
                    {t('admin.viewOfficialPage')}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
