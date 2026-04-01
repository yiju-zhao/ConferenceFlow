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

export default function AdminAttendance() {
  const { confId } = useParams();
  const { user, isSuperAdmin } = useAuth();

  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [userNames, setUserNames] = useState({});

  // Section 2 view mode: "byMember" | "bySession"
  const [assignView, setAssignView] = useState("byMember");
  // Expanded member in "byMember" view
  const [expandedMemberId, setExpandedMemberId] = useState(null);
  // Expanded session in "bySession" view
  const [expandedSessionId, setExpandedSessionId] = useState(null);

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
      <span className="bg-[#2980B9]/10 text-[#2980B9] text-xs px-2 py-0.5 uppercase tracking-wider font-headline">
        💻 Online
      </span>
    ) : (
      <span className="bg-[#27AE60]/10 text-[#27AE60] text-xs px-2 py-0.5 uppercase tracking-wider font-headline">
        🏢 Onsite
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
          { key: "byMember", label: "By Member" },
          { key: "bySession", label: "By Session" },
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
      {assignView === "byMember" && (
        <div className="bg-surface-container-lowest">
          {approvedMembers.length === 0 && (
            <div className="p-6 text-center text-secondary text-sm">No members to display</div>
          )}
          {approvedMembers.map((m) => {
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

                {/* Expanded: session checklist */}
                {isExpanded && (
                  <div className="bg-surface-container/20 px-6 py-3 border-t border-surface-dim">
                    {sessions.length === 0 ? (
                      <p className="text-secondary text-xs">No sessions found.</p>
                    ) : (
                      <div className="grid gap-2">
                        {sessions.map((s) => {
                          const assigned = (s.attendees || []).includes(m.id);
                          return (
                            <label
                              key={s.id}
                              className="flex items-center gap-3 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={assigned}
                                onChange={() => handleToggleSession(m.id, s.id, assigned)}
                                className="accent-primary w-4 h-4 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-on-surface text-sm group-hover:text-primary transition-colors">
                                  {s.title || s.code || s.id}
                                </span>
                                <span className="text-secondary text-xs ml-2">
                                  {s.date} {s.start && `· ${s.start}`}
                                </span>
                              </div>
                              {assigned && (
                                <span className="text-xs text-[#27AE60] uppercase tracking-wider font-headline">
                                  Assigned
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── By Session View ───────────────────────────────────────────────── */}
      {assignView === "bySession" && (
        <div className="bg-surface-container-lowest">
          {sessions.length === 0 && (
            <div className="p-6 text-center text-secondary text-sm">No sessions found</div>
          )}
          {sessions.map((s) => {
            const isExpanded = expandedSessionId === s.id;
            const sessionAttendees = approvedMembers.filter((m) =>
              (s.attendees || []).includes(m.id)
            );
            const unassignedMembers = approvedMembers.filter(
              (m) => !(s.attendees || []).includes(m.id)
            );
            const isDropdownOpen = bySessionDropdown === s.id;

            return (
              <div key={s.id} className="border-b border-surface-dim last:border-b-0">
                {/* Session row — clickable to expand */}
                <button
                  onClick={() => {
                    setExpandedSessionId(isExpanded ? null : s.id);
                    setBySessionDropdown(null);
                  }}
                  className="w-full px-4 py-3 flex justify-between items-center hover:bg-surface-container/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-on-surface text-sm font-bold truncate">
                      {s.title || s.code || s.id}
                    </span>
                    <span className="text-secondary text-xs shrink-0">
                      {s.date} {s.start && `· ${s.start}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-secondary text-xs">
                      {sessionAttendees.length} attendee{sessionAttendees.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-secondary text-xs font-headline uppercase tracking-wider">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {/* Expanded: attendee list + assign dropdown */}
                {isExpanded && (
                  <div className="bg-surface-container/20 px-6 py-4 border-t border-surface-dim">
                    {/* Current attendees */}
                    {sessionAttendees.length === 0 ? (
                      <p className="text-secondary text-xs mb-3">No attendees assigned yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {sessionAttendees.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2 bg-surface-container px-3 py-1.5"
                          >
                            <span className="text-on-surface text-xs">{getMemberName(m)}</span>
                            <button
                              onClick={() => handleToggleSession(m.id, s.id, true)}
                              className="text-primary text-xs hover:opacity-70 transition-opacity font-headline uppercase tracking-wider"
                              title="Unassign"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add attendee dropdown */}
                    {unassignedMembers.length > 0 && (
                      <div className="relative inline-block">
                        <button
                          onClick={() => setBySessionDropdown(isDropdownOpen ? null : s.id)}
                          className="bg-surface-container text-secondary px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:text-on-surface transition-colors"
                        >
                          + Add Attendee
                        </button>
                        {isDropdownOpen && (
                          <div className="absolute top-full left-0 mt-1 bg-surface-container-lowest border border-surface-dim z-20 min-w-48 max-h-52 overflow-y-auto shadow-none">
                            {unassignedMembers.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => handleAssignToSession(m.id, s.id)}
                                className="w-full px-4 py-2 text-left text-sm text-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
                              >
                                <span className="flex-1">{getMemberName(m)}</span>
                                <span className="text-secondary text-xs uppercase">
                                  {m.attendanceMode || "onsite"}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {unassignedMembers.length === 0 && (
                      <p className="text-secondary text-xs">All members assigned.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
