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

const COLOR_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function SessionAssignSearch({ sessions, onAssign }) {
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
        placeholder="+ Assign session — search by title or code..."
        className="w-full bg-surface-container-high p-2 text-on-surface text-xs border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
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
                <span className="text-primary text-[10px] font-mono bg-primary/10 px-1.5 py-0.5 flex-shrink-0">{s.code}</span>
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
          No matching sessions
        </div>
      )}
    </div>
  );
}

export default function AdminAttendance() {
  const { confId } = useParams();
  const { user, isSuperAdmin } = useAuth();

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
      const id = genId();
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
          <span className="w-1 h-5 bg-primary inline-block" />
          <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
            Attendee Management
          </h2>
          <span className="text-secondary text-xs uppercase tracking-wider ml-1">
            {approvedMembers.length} members
          </span>
        </div>
        <button
          onClick={() => { setShowAddForm((v) => !v); setAddName(""); setAddMode("onsite"); }}
          className="bg-primary text-on-primary px-4 py-2 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity"
        >
          {showAddForm ? "Cancel" : "+ Add Attendee"}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-surface-container-lowest border-b border-surface-dim p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-secondary text-xs uppercase tracking-wider mb-1">Name</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddAttendee()}
              placeholder="Full name"
              className="w-full bg-surface-container-high p-2 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-secondary text-xs uppercase tracking-wider mb-1">Mode</label>
            <div className="flex gap-1">
              {["onsite", "online"].map((m) => (
                <button
                  key={m}
                  onClick={() => setAddMode(m)}
                  className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${
                    addMode === m
                      ? "bg-primary text-on-primary"
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
            className="bg-primary text-on-primary px-5 py-2 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {addLoading ? "Adding..." : "Add"}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-container-lowest mb-10">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-[2fr_100px_100px_100px_160px] gap-4 px-4 py-2 border-b border-surface-dim bg-surface-container">
          <span className="text-secondary text-xs uppercase tracking-wider font-headline">Name</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">Mode</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">Role</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">Sessions</span>
          <span className="text-secondary text-xs uppercase tracking-wider font-headline text-center">Actions</span>
        </div>

        {approvedMembers.length === 0 && (
          <div className="p-6 text-center text-secondary text-sm">No approved members found</div>
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
                    <label className="block text-secondary text-xs uppercase tracking-wider mb-1">Name</label>
                    <input
                      type="text"
                      value={editState.name}
                      onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                      className="w-full bg-surface-container-high p-2 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-secondary text-xs uppercase tracking-wider mb-1">Mode</label>
                    <div className="flex gap-1">
                      {["onsite", "online"].map((mo) => (
                        <button
                          key={mo}
                          onClick={() => setEditState({ ...editState, mode: mo })}
                          className={`px-3 py-1.5 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${
                            editState.mode === mo
                              ? "bg-primary text-on-primary"
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
                      className="bg-primary text-on-primary px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {editLoading ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditState(null)}
                      className="bg-surface-container text-secondary px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:text-on-surface transition-colors"
                    >
                      Cancel
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
                      <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 uppercase tracking-wider font-headline">
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
                    {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
                  </div>
                  <div className="flex gap-2 items-center justify-center">
                    {/* Slot 1: Promote / Demote / Edit — fixed width */}
                    <span className="w-16 text-center">
                      {!m.managedByAdmin && !m.legacyName && m.role !== "admin" && m.status === "approved" ? (
                        <button onClick={() => handleSetAdmin(m.id)} className="text-primary text-xs hover:underline">Promote</button>
                      ) : !m.managedByAdmin && !m.legacyName && m.role === "admin" && isSuperAdmin && m.id !== user.uid ? (
                        <button onClick={() => handleRemoveAdmin(m.id)} className="text-secondary text-xs hover:text-primary hover:underline">Demote</button>
                      ) : m.managedByAdmin ? (
                        <button onClick={() => setEditState({ memberId: m.id, name: m.displayName || getMemberName(m), mode: m.attendanceMode || "onsite" })}
                          className="text-secondary text-xs hover:text-on-surface">Edit</button>
                      ) : null}
                    </span>
                    {/* Slot 2: Remove — fixed width */}
                    <span className="w-20 text-center">
                      {m.role !== "admin" && m.id !== user.uid ? (
                        removeConfirm === m.id ? (
                          <span className="flex gap-1 items-center justify-center">
                            <button onClick={() => { handleRemoveAttendee(m.id); setRemoveConfirm(null); }}
                              className="bg-primary text-on-primary px-2 py-1 text-[10px] font-headline uppercase tracking-wider">Yes</button>
                            <button onClick={() => setRemoveConfirm(null)}
                              className="bg-surface-container text-secondary px-2 py-1 text-[10px] font-headline uppercase tracking-wider">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setRemoveConfirm(m.id)}
                            className="bg-surface-container text-primary px-3 py-1 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity">Remove</button>
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
        <span className="w-1 h-5 bg-primary inline-block" />
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          Session Assignment
        </h2>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-6">
        {[
          { key: "bySession", label: "By Session" },
          { key: "byMember", label: "By Member" },
        ].map((v) => (
          <button
            key={v.key}
            onClick={() => { setAssignView(v.key); setExpandedMemberId(null); setExpandedSessionId(null); }}
            className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${
              assignView === v.key
                ? "bg-primary text-on-primary"
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
              { key: "all", label: "All" },
              { key: "onsite", label: "Onsite" },
              { key: "online", label: "Online" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setModeFilter(f.key)}
                className={`px-3 py-1.5 text-[10px] font-headline uppercase tracking-wider transition-colors duration-50 ${
                  modeFilter === f.key
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-secondary hover:text-on-surface"
                }`}
              >
                {f.label} ({f.key === "all" ? approvedMembers.length : approvedMembers.filter((m) => (m.attendanceMode || "onsite") === f.key).length})
              </button>
            ))}
          </div>
          <div className="bg-surface-container-lowest">
          {filteredMembers.length === 0 && (
            <div className="p-6 text-center text-secondary text-sm">No members to display</div>
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
                      <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-headline">Admin</span>
                    ) : m.managedByAdmin ? (
                      <span className="bg-[#E67E22]/10 text-[#E67E22] text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-headline">Attendee</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-secondary text-xs">
                      {sessionCountForMember(m.id)} sessions assigned
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
                        <p className="text-secondary text-xs">No sessions assigned to this member.</p>
                      )}
                      {memberSessions.length === 0 && canAssign && (
                        <p className="text-secondary text-xs mb-3">No sessions assigned yet.</p>
                      )}
                      {memberSessions.length > 0 && (
                        <div className="mb-3">
                          {sortedDates.map((date) => (
                            <div key={date} className="mb-4 last:mb-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-1 h-4 bg-primary inline-block"></span>
                                <span className="text-xs font-headline font-bold uppercase tracking-wider text-primary">
                                  {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
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
                                        className="text-primary text-xs hover:underline flex-shrink-0"
                                      >
                                        Unassign
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

        if (!activeDay) return <div className="p-6 text-center text-secondary text-sm">No sessions found</div>;

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
        const COLORS = ["#CF0A2C", "#2980B9", "#E67E22", "#8E44AD", "#27AE60", "#2C3E50"];

        return (
          <div>
            {/* Day switcher */}
            <div className="flex gap-1 mb-4 flex-wrap">
              {allDates.map((d) => {
                const label = new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                const count = sessions.filter((s) => s.date === d).length;
                return (
                  <button key={d} onClick={() => setSelectedDay(d)}
                    className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${activeDay === d ? "bg-primary text-on-primary" : "bg-surface-container text-secondary hover:text-on-surface"}`}>
                    {label} <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Calendar grid — absolute positioned */}
            <div className="bg-[#1a1c1c] p-4">
              <div className="bg-[#2a2a2a] p-3 text-center mb-1">
                <span className="font-headline font-bold text-sm text-[#a20513] tracking-wider">
                  {new Date(activeDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </span>
                <span className="text-[#555] text-xs ml-3">{daySessions.length} sessions</span>
              </div>

              <div style={{ display: "flex" }}>
                {/* Hour labels */}
                <div style={{ width: 56, flexShrink: 0, position: "relative", height: totalHeight }}>
                  {hourLabels.map((label) => {
                    const top = (parseInt(label) * 60 - dayStartMin) * PX_PER_MIN;
                    return <div key={label} style={{ position: "absolute", top, right: 6, fontSize: 10, color: "#555", fontFamily: "monospace" }}>{label}</div>;
                  })}
                </div>

                {/* Session area */}
                <div style={{ flex: 1, position: "relative", height: totalHeight, background: "#2a2a2a" }}>
                  {/* Hour grid lines */}
                  {hourLabels.map((label) => {
                    const top = (parseInt(label) * 60 - dayStartMin) * PX_PER_MIN;
                    return <div key={label} style={{ position: "absolute", top, left: 0, right: 0, borderTop: "1px solid #333", pointerEvents: "none" }} />;
                  })}

                  {/* Session blocks */}
                  {placements.map(({ session: s, colIndex }) => {
                    const sStart = toMin(s.start), sEnd = toMin(s.end);
                    const top = (sStart - dayStartMin) * PX_PER_MIN;
                    const height = Math.max((sEnd - sStart) * PX_PER_MIN, 24);
                    const left = `${(colIndex / totalCols) * 100}%`;
                    const width = `calc(${100 / totalCols}% - 2px)`;
                    const attendeeCount = (s.attendees || []).length;

                    return (
                      <div key={s.id} onClick={() => setSessionDetailModal(s)}
                        style={{ position: "absolute", top, left, width, height, background: "#a20513", padding: "3px 6px", cursor: "pointer", overflow: "hidden", boxSizing: "border-box", transition: "opacity 50ms" }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{s.start}–{s.end}</div>
                        <div style={{ fontSize: 12, color: "#fff", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: height > 80 ? 4 : height > 50 ? 2 : 1, WebkitBoxOrient: "vertical", marginTop: 2 }}>{s.title}</div>
                        {s.room && height > 50 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{s.room}</div>}
                        {attendeeCount > 0 && height > 60 && (
                          <div style={{ display: "flex", gap: 1, marginTop: 3 }}>
                            {(s.attendees || []).slice(0, 5).map((uid) => {
                              const member = approvedMembers.find((mm) => mm.id === uid);
                              if (!member) return null;
                              return (
                                <div key={uid} style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", background: COLORS[member.colorIndex || 0] }}
                                  title={getMemberName(member)}>
                                  {(getMemberName(member) || "?").charAt(0).toUpperCase()}
                                </div>
                              );
                            })}
                            {attendeeCount > 5 && <div style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "rgba(255,255,255,0.5)", background: "#333" }}>+{attendeeCount - 5}</div>}
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSessionDetailModal(null)}>
            <div className="bg-surface-container-lowest w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-primary px-6 py-4">
                <div className="flex justify-between items-start">
                  <div>
                    {s.code && <div className="text-on-primary/60 text-xs font-mono mb-1">{s.code}</div>}
                    <h3 className="text-on-primary font-headline font-bold text-base">{s.title}</h3>
                  </div>
                  <button onClick={() => setSessionDetailModal(null)} className="text-on-primary/60 hover:text-on-primary text-lg">×</button>
                </div>
              </div>

              <div className="px-6 py-4">
                {/* Meta */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-secondary text-xs mb-3">
                  <span>{s.date}</span>
                  <span>{s.start}–{s.end}</span>
                  {s.room && <span>📍 {s.room}</span>}
                  {s.format && <span>{s.format}</span>}
                  {s.recording === "Yes" && <span>Recording: Yes</span>}
                </div>

                {/* Speakers */}
                {(s.speakers || []).length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-wider text-secondary font-headline mb-1">Speakers</div>
                    {s.speakers.map((sp, i) => (
                      <div key={i} className="text-sm text-on-surface">
                        {sp.name}
                        {(sp.title || sp.company) && (
                          <span className="text-secondary"> — {[sp.title, sp.company].filter(Boolean).join(", ")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Key Themes */}
                {(s.keyThemes || []).length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-wider text-secondary font-headline mb-1">Topics</div>
                    <div className="flex flex-wrap gap-1">
                      {s.keyThemes.map((t, i) => (
                        <span key={i} className="bg-surface-container text-secondary text-xs px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attendees */}
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-secondary font-headline mb-2">
                    Attendees ({sessionAttendees.length})
                  </div>
                  {sessionAttendees.length === 0 ? (
                    <p className="text-secondary text-xs">No one assigned yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {sessionAttendees.map((m) => (
                        <span key={m.id} className="flex items-center gap-1.5 bg-surface-container px-2 py-1 text-xs text-on-surface">
                          {getMemberName(m)}
                          {m.attendanceMode === "online" ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2980B9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="3" width="20" height="14" rx="0"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                            </svg>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Session URL */}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="text-primary text-xs hover:underline">
                    🔗 View Official Session Page
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
