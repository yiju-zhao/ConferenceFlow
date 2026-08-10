import { useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, InputGroup, SegmentedControl, Tag } from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import {
  doc,
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
import { formatShortDate, formatLongDate } from "../../i18n/dateUtils";
import { useConferenceMembers } from "../../hooks/useConferenceMembers";
import type { ResolvedMember } from "../../hooks/useConferenceMembers";
import { useConferenceSessions } from "../../hooks/useConferenceSessions";
import type { AttendanceMode, Session } from "../../types";
import type { TFunction } from "i18next";

const COLOR_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

interface SessionAssignSearchProps {
  sessions: Session[];
  onAssign: (sessionId: string) => void;
  t: TFunction;
}

function SessionAssignSearch({ sessions, onAssign, t }: SessionAssignSearchProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return sessions
      .filter(
        (s) =>
          s.title?.toLowerCase().includes(q) ||
          s.code?.toLowerCase().includes(q) ||
          s.mainTopic?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [sessions, query]);

  const handleSelect = (sessionId: string) => {
    onAssign(sessionId);
    setQuery("");
    setFocused(false);
  };

  return (
    <div className="mt-2 relative" style={{ maxWidth: 480 }}>
      <InputGroup
        small
        leftIcon={IconNames.SEARCH}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={t("admin.assignSessionSearch")}
      />
      {focused && query.trim() && results.length > 0 && (
        <div
          className="absolute z-10 left-0 right-0 max-h-60 overflow-y-auto"
          style={{
            top: "100%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "var(--shadow-md)",
          }}
        >
          {results.map((s) => (
            <button
              key={s.id}
              onMouseDown={() => handleSelect(s.id)}
              className="w-full text-left px-3 py-2 transition-colors flex items-center gap-2"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {s.code && (
                <Tag minimal intent="primary" style={{ flexShrink: 0, fontFamily: "monospace" }}>
                  {s.code}
                </Tag>
              )}
              <span
                className="text-xs flex-1 min-w-0 truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {s.title}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
                {s.date} {s.start}
              </span>
            </button>
          ))}
        </div>
      )}
      {focused && query.trim() && results.length === 0 && (
        <div
          className="absolute z-10 left-0 right-0 px-3 py-2 text-xs"
          style={{
            top: "100%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-muted)",
          }}
        >
          {t("admin.noMatchingSessions")}
        </div>
      )}
    </div>
  );
}

export default function AdminAttendance() {
  const { confId } = useParams();
  const { user, isSuperAdmin } = useAuth();
  const { t } = useTranslation();

  const { members, memberNames } = useConferenceMembers(confId);
  const { sessions } = useConferenceSessions(confId);

  // Section 2 view mode: "byMember" | "bySession"
  const [assignView, setAssignView] = useState<"byMember" | "bySession">("bySession");
  // Expanded member in "byMember" view
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  // Selected day for "bySession" calendar view
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Add attendee form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addMode, setAddMode] = useState<AttendanceMode>("onsite");
  const [addLoading, setAddLoading] = useState(false);

  // Inline edit state: { memberId, name, mode }
  const [editState, setEditState] = useState<{
    memberId: string;
    name: string;
    mode: AttendanceMode;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Remove confirmation: memberId string or null
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

  // Session detail modal: session object or null
  const [sessionDetailModal, setSessionDetailModal] = useState<Session | null>(null);

  // Mode filter for By Member view: "all" | "onsite" | "online"
  const [modeFilter, setModeFilter] = useState<"all" | "onsite" | "online">("all");

  // ── Real-time data from shared hooks ────────────────────────────────────────

  // ── Derived ────────────────────────────────────────────────────────────────

  const sessionCountForMember = useCallback(
    (memberId: string) => sessions.filter((s) => (s.attendees || []).includes(memberId)).length,
    [sessions],
  );

  const approvedMembers = useMemo(() => members.filter((m) => m.status === "approved"), [members]);

  // ── Attendee CRUD ──────────────────────────────────────────────────────────

  const handleAddAttendee = async () => {
    if (!addName.trim()) return;
    if (!confId || !user) return;
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
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveAttendee = async (memberId: string) => {
    if (!confId) return;
    if (!window.confirm("Remove this attendee? This will also unassign them from all sessions."))
      return;
    try {
      // Remove from all sessions first
      const sessionsWithMember = sessions.filter((s) => (s.attendees || []).includes(memberId));
      await Promise.all(
        sessionsWithMember.map((s) =>
          updateDoc(doc(db, "conferences", confId, "sessions", s.id), {
            attendees: arrayRemove(memberId),
          }),
        ),
      );
      await deleteDoc(doc(db, "conferences", confId, "members", memberId));
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!editState || !editState.name.trim()) return;
    if (!confId) return;
    setEditLoading(true);
    try {
      await updateDoc(doc(db, "conferences", confId, "members", editState.memberId), {
        displayName: editState.name.trim(),
        attendanceMode: editState.mode,
      });
      setEditState(null);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEditLoading(false);
    }
  };

  // ── Session Assignment ─────────────────────────────────────────────────────

  const handleToggleSession = async (
    memberId: string,
    sessionId: string,
    currentlyAssigned: boolean,
  ) => {
    if (!confId) return;
    try {
      await updateDoc(doc(db, "conferences", confId, "sessions", sessionId), {
        attendees: currentlyAssigned ? arrayRemove(memberId) : arrayUnion(memberId),
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── Role management ────────────────────────────────────────────────────────

  const handleSetAdmin = async (memberId: string) => {
    if (!confId) return;
    try {
      await updateDoc(doc(db, "conferences", confId, "members", memberId), {
        role: "admin",
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRemoveAdmin = async (memberId: string) => {
    if (!confId) return;
    try {
      await updateDoc(doc(db, "conferences", confId, "members", memberId), {
        role: "member",
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const getMemberName = (m: ResolvedMember) => memberNames[m.id] || m.displayName || m.id;

  const ModeBadge = ({ mode }: { mode: AttendanceMode }) =>
    mode === "online" ? (
      <Tag minimal intent="primary">
        Online
      </Tag>
    ) : (
      <Tag minimal intent="success">
        Onsite
      </Tag>
    );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Section 1: Attendee Table ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 4, height: 24, borderRadius: 9999, background: "var(--accent)" }} />
          <h2
            style={{
              fontFamily: "'Work Sans', sans-serif",
              color: "var(--text-primary)",
              fontSize: 18,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: 0,
            }}
          >
            {t("admin.attendeeManagement")}
          </h2>
          <Tag minimal round>
            {approvedMembers.length} {t("admin.members")}
          </Tag>
        </div>
        <Button
          intent="primary"
          icon={showAddForm ? undefined : IconNames.PLUS}
          text={showAddForm ? t("common.cancel") : t("admin.addAttendee")}
          onClick={() => {
            setShowAddForm((v) => !v);
            setAddName("");
            setAddMode("onsite");
          }}
        />
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card
          style={{
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: 1, minWidth: 160 }}>
            <label
              style={{
                display: "block",
                color: "var(--text-muted)",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              {t("admin.name")}
            </label>
            <InputGroup
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddAttendee()}
              placeholder={t("admin.fullName")}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                color: "var(--text-muted)",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              {t("admin.mode")}
            </label>
            <SegmentedControl
              small
              options={[
                { label: "onsite", value: "onsite" },
                { label: "online", value: "online" },
              ]}
              value={addMode}
              onValueChange={(v) => setAddMode(v as AttendanceMode)}
            />
          </div>
          <Button
            intent="primary"
            text={addLoading ? t("admin.adding") : t("admin.add")}
            onClick={handleAddAttendee}
            disabled={addLoading || !addName.trim()}
          />
        </Card>
      )}

      {/* Table */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 40 }}>
        {/* Header row */}
        <div
          className="hidden md:grid grid-cols-[2fr_100px_100px_100px_160px] gap-4 px-4 py-2"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-warm)",
          }}
        >
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "'Work Sans', sans-serif",
              fontWeight: 600,
            }}
          >
            {t("admin.name")}
          </span>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "'Work Sans', sans-serif",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {t("admin.mode")}
          </span>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "'Work Sans', sans-serif",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {t("admin.role")}
          </span>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "'Work Sans', sans-serif",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {t("admin.sessions")}
          </span>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "'Work Sans', sans-serif",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {t("admin.actions")}
          </span>
        </div>

        {approvedMembers.length === 0 && (
          <div
            style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}
          >
            {t("admin.noApprovedMembers")}
          </div>
        )}

        {approvedMembers.map((m, index) => {
          const isEditing = editState?.memberId === m.id;
          const sessionCount = sessionCountForMember(m.id);

          return (
            <div
              key={m.id}
              style={{ borderTop: index > 0 ? "1px solid var(--border)" : undefined }}
            >
              {isEditing ? (
                /* Edit row */
                <div
                  className="p-4 flex flex-wrap gap-3 items-end"
                  style={{ background: "var(--surface-warm)" }}
                >
                  <div className="flex-1 min-w-40">
                    <label
                      style={{
                        display: "block",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 4,
                      }}
                    >
                      {t("admin.name")}
                    </label>
                    <InputGroup
                      value={editState.name}
                      onChange={(e) => setEditState({ ...editState!, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 4,
                      }}
                    >
                      {t("admin.mode")}
                    </label>
                    <SegmentedControl
                      small
                      options={[
                        { label: "onsite", value: "onsite" },
                        { label: "online", value: "online" },
                      ]}
                      value={editState.mode}
                      onValueChange={(v) => setEditState({ ...editState!, mode: v as AttendanceMode })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      small
                      intent="primary"
                      text={editLoading ? t("common.saving") : t("common.save")}
                      onClick={handleSaveEdit}
                      disabled={editLoading}
                    />
                    <Button small text={t("common.cancel")} onClick={() => setEditState(null)} />
                  </div>
                </div>
              ) : (
                /* Normal row */
                <div className="md:grid md:grid-cols-[2fr_100px_100px_100px_160px] gap-4 px-4 py-3 flex flex-wrap items-center">
                  <div
                    className="text-sm font-bold truncate min-w-0"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {getMemberName(m)}
                  </div>
                  <div className="flex items-center justify-center">
                    <ModeBadge mode={m.attendanceMode || "onsite"} />
                  </div>
                  <div className="flex items-center justify-center">
                    {m.role === "admin" ? (
                      <Tag minimal intent="primary">
                        Admin
                      </Tag>
                    ) : m.managedByAdmin ? (
                      <Tag minimal intent="warning">
                        Attendee
                      </Tag>
                    ) : (
                      <Tag minimal>Member</Tag>
                    )}
                  </div>
                  <div className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                    {sessionCount} {t("admin.sessions").toLowerCase()}
                  </div>
                  <div className="flex gap-2 items-center justify-center">
                    {/* Slot 1: Promote / Demote / Edit — fixed width */}
                    <span className="w-16 text-center">
                      {!m.managedByAdmin &&
                      !m.legacyName &&
                      m.role !== "admin" &&
                      m.status === "approved" ? (
                        <Button
                          minimal
                          small
                          text={t("admin.promote")}
                          onClick={() => handleSetAdmin(m.id)}
                        />
                      ) : !m.managedByAdmin &&
                        !m.legacyName &&
                        m.role === "admin" &&
                        isSuperAdmin &&
                        m.id !== user?.uid ? (
                        <Button
                          minimal
                          small
                          text={t("admin.demote")}
                          onClick={() => handleRemoveAdmin(m.id)}
                        />
                      ) : m.managedByAdmin ? (
                        <Button
                          minimal
                          small
                          text={t("admin.edit")}
                          onClick={() =>
                            setEditState({
                              memberId: m.id,
                              name: m.displayName || getMemberName(m),
                              mode: m.attendanceMode || "onsite",
                            })
                          }
                        />
                      ) : null}
                    </span>
                    {/* Slot 2: Remove — fixed width */}
                    <span className="w-20 text-center">
                      {m.role !== "admin" && m.id !== user?.uid ? (
                        removeConfirm === m.id ? (
                          <span className="flex gap-1 items-center justify-center">
                            <Button
                              small
                              intent="danger"
                              text={t("admin.yes")}
                              onClick={() => {
                                handleRemoveAttendee(m.id);
                                setRemoveConfirm(null);
                              }}
                            />
                            <Button small text={t("admin.no")} onClick={() => setRemoveConfirm(null)} />
                          </span>
                        ) : (
                          <Button
                            minimal
                            small
                            intent="danger"
                            text={t("admin.remove")}
                            onClick={() => setRemoveConfirm(m.id)}
                          />
                        )
                      ) : null}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* ── Section 2: Session Assignment ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 4, height: 24, borderRadius: 9999, background: "var(--accent)" }} />
        <h2
          style={{
            fontFamily: "'Work Sans', sans-serif",
            color: "var(--text-primary)",
            fontSize: 18,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          {t("admin.sessionAssignment")}
        </h2>
      </div>

      {/* View toggle */}
      <div style={{ marginBottom: 24 }}>
        <SegmentedControl
          small
          options={[
            { label: t("admin.bySession"), value: "bySession" },
            { label: t("admin.byMember"), value: "byMember" },
          ]}
          value={assignView}
          onValueChange={(v) => {
            setAssignView(v as "byMember" | "bySession");
            setExpandedMemberId(null);
          }}
        />
      </div>

      {/* ── By Member View ────────────────────────────────────────────────── */}
      {assignView === "byMember" &&
        (() => {
          const filteredMembers = approvedMembers.filter((m) => {
            if (modeFilter === "all") return true;
            return (m.attendanceMode || "onsite") === modeFilter;
          });
          return (
            <div>
              {/* Mode filter */}
              <div style={{ marginBottom: 12 }}>
                <SegmentedControl
                  small
                  options={(
                    [
                      { key: "all", label: t("admin.filterAll") },
                      { key: "onsite", label: t("dashboard.onsite") },
                      { key: "online", label: t("dashboard.online") },
                    ] as const
                  ).map((f) => ({
                    value: f.key as string,
                    label: `${f.label} (${
                      f.key === "all"
                        ? approvedMembers.length
                        : approvedMembers.filter((m) => (m.attendanceMode || "onsite") === f.key)
                            .length
                    })`,
                  }))}
                  value={modeFilter}
                  onValueChange={(v) => setModeFilter(v as "all" | "onsite" | "online")}
                />
              </div>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                {filteredMembers.length === 0 && (
                  <div
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 14,
                    }}
                  >
                    {t("admin.noMembersToDisplay")}
                  </div>
                )}
                {filteredMembers.map((m, index) => {
                  const isExpanded = expandedMemberId === m.id;
                  return (
                    <div
                      key={m.id}
                      style={{ borderTop: index > 0 ? "1px solid var(--border)" : undefined }}
                    >
                      {/* Member row — clickable to expand */}
                      <button
                        onClick={() => setExpandedMemberId(isExpanded ? null : m.id)}
                        className="w-full px-4 py-3 flex justify-between items-center transition-colors text-left"
                        style={{ background: "transparent", border: "none", cursor: "pointer" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--surface-hover)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="text-sm font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {getMemberName(m)}
                          </span>
                          <ModeBadge mode={m.attendanceMode || "onsite"} />
                          {m.role === "admin" ? (
                            <Tag minimal intent="primary">
                              Admin
                            </Tag>
                          ) : m.managedByAdmin ? (
                            <Tag minimal intent="warning">
                              Attendee
                            </Tag>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {sessionCountForMember(m.id)} {t("admin.sessionsAssigned")}
                          </span>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>

                      {/* Expanded: attending sessions grouped by date */}
                      {isExpanded &&
                        (() => {
                          const memberSessions = sessions.filter((s) =>
                            (s.attendees || []).includes(m.id),
                          );
                          // Group by date
                          const byDate: Record<string, Session[]> = {};
                          memberSessions.forEach((s) => {
                            const d = s.date || "Unknown";
                            if (!byDate[d]) byDate[d] = [];
                            byDate[d].push(s);
                          });
                          // Sort dates, sort sessions within each date by start time
                          const sortedDates = Object.keys(byDate).sort();
                          sortedDates.forEach((d) =>
                            byDate[d].sort((a, b) => (a.start || "").localeCompare(b.start || "")),
                          );

                          const canUnassign = m.managedByAdmin; // only attendees can be unassigned by admin
                          const canAssign = m.role !== "admin"; // admins can't have sessions assigned by other admins
                          const unassignedSessions = canAssign
                            ? sessions.filter((s) => !(s.attendees || []).includes(m.id))
                            : [];

                          return (
                            <div
                              className="px-6 py-3"
                              style={{
                                background: "var(--surface-warm)",
                                borderTop: "1px solid var(--border)",
                              }}
                            >
                              {memberSessions.length === 0 && !canAssign && (
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                  {t("admin.noSessionsAssigned")}
                                </p>
                              )}
                              {memberSessions.length === 0 && canAssign && (
                                <p
                                  className="text-xs mb-3"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {t("admin.noSessionsAssigned")}
                                </p>
                              )}
                              {memberSessions.length > 0 && (
                                <div className="mb-3">
                                  {sortedDates.map((date) => (
                                    <div key={date} className="mb-4 last:mb-0">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span
                                          style={{
                                            width: 4,
                                            height: 16,
                                            borderRadius: 9999,
                                            background: "var(--accent)",
                                            display: "inline-block",
                                          }}
                                        />
                                        <span
                                          style={{
                                            fontSize: 12,
                                            fontFamily: "'Work Sans', sans-serif",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            color: "var(--accent-deep)",
                                          }}
                                        >
                                          {formatShortDate(new Date(date + "T00:00:00"))}
                                        </span>
                                        <span
                                          style={{ color: "var(--text-muted)", fontSize: 10 }}
                                        >
                                          ({byDate[date].length} sessions)
                                        </span>
                                      </div>
                                      <div className="grid gap-1 ml-3">
                                        {byDate[date].map((s) => (
                                          <div
                                            key={s.id}
                                            onClick={() => setSessionDetailModal(s)}
                                            className="flex items-center gap-3 px-3 py-2 transition-colors text-left w-full cursor-pointer"
                                            style={{ borderRadius: 4 }}
                                            onMouseEnter={(e) =>
                                              (e.currentTarget.style.background =
                                                "var(--surface-hover)")
                                            }
                                            onMouseLeave={(e) =>
                                              (e.currentTarget.style.background = "transparent")
                                            }
                                          >
                                            <span
                                              className="text-xs font-mono w-24 flex-shrink-0"
                                              style={{ color: "var(--text-muted)" }}
                                            >
                                              {s.start}–{s.end}
                                            </span>
                                            <span
                                              className="text-sm flex-1 min-w-0 truncate"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {s.title}
                                            </span>
                                            {s.room && (
                                              <span
                                                className="text-xs flex-shrink-0"
                                                style={{ color: "var(--text-muted)" }}
                                              >
                                                {s.room}
                                              </span>
                                            )}
                                            {canUnassign && (
                                              <Button
                                                minimal
                                                small
                                                intent="danger"
                                                text={t("admin.unassign")}
                                                style={{ flexShrink: 0 }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleToggleSession(m.id, s.id, true);
                                                }}
                                              />
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
                                  onAssign={(sessionId) =>
                                    handleToggleSession(m.id, sessionId, false)
                                  }
                                  t={t}
                                />
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  );
                })}
              </Card>
            </div>
          );
        })()}

      {/* ── By Session View — Single-Day Calendar ────────────────────────── */}
      {assignView === "bySession" &&
        (() => {
          // Get all unique dates
          const allDates = [...new Set(sessions.map((s) => s.date))].sort();
          const activeDay = selectedDay || allDates[0] || null;

          if (!activeDay)
            return (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 14,
                }}
              >
                {t("admin.noSessions")}
              </div>
            );

          // Sessions for the active day
          const daySessions = sessions.filter((s) => s.date === activeDay);

          const PX_PER_MIN = 2.5; // 150px per hour
          const toMin = (t: string) => {
            if (!t) return 0;
            const [h, m] = t.split(":").map(Number);
            return h * 60 + (m || 0);
          };

          // Time range
          let minH = 24,
            maxH = 0;
          daySessions.forEach((s) => {
            const sh = parseInt(s.start?.split(":")[0] || "9");
            const eh = Math.ceil(toMin(s.end) / 60);
            if (sh < minH) minH = sh;
            if (eh > maxH) maxH = eh;
          });
          const dayStartMin = minH * 60;
          const dayEndMin = maxH * 60;
          const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN;
          const hourLabels: string[] = [];
          for (let h = minH; h <= maxH; h++) hourLabels.push(`${String(h).padStart(2, "0")}:00`);

          // Column packing for overlaps — per overlap group
          const sorted = [...daySessions].sort((a, b) => toMin(a.start) - toMin(b.start));
          const groups: { sessions: Session[]; groupEnd: number }[] = [];
          for (const s of sorted) {
            const sStart = toMin(s.start),
              sEnd = toMin(s.end);
            const last = groups[groups.length - 1];
            if (last && sStart < last.groupEnd) {
              last.sessions.push(s);
              last.groupEnd = Math.max(last.groupEnd, sEnd);
            } else {
              groups.push({ sessions: [s], groupEnd: sEnd });
            }
          }
          const placements: { session: Session; colIndex: number; totalCols: number }[] = [];
          for (const g of groups) {
            const cols: number[] = [];
            const gp: { session: Session; colIndex: number }[] = [];
            for (const s of g.sessions) {
              const sStart = toMin(s.start),
                sEnd = toMin(s.end);
              let placed = false;
              for (let i = 0; i < cols.length; i++) {
                if (sStart >= cols[i]) {
                  cols[i] = sEnd;
                  gp.push({ session: s, colIndex: i });
                  placed = true;
                  break;
                }
              }
              if (!placed) {
                cols.push(sEnd);
                gp.push({ session: s, colIndex: cols.length - 1 });
              }
            }
            const totalCols = cols.length;
            gp.forEach((p) => placements.push({ ...p, totalCols }));
          }

          return (
            <div>
              {/* Day switcher */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                {allDates.map((d) => {
                  const label = formatShortDate(new Date(d + "T00:00:00"));
                  const count = sessions.filter((s) => s.date === d).length;
                  const isActive = activeDay === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDay(d)}
                      style={{
                        padding: "5px 12px",
                        fontFamily: "'Work Sans', sans-serif",
                        fontWeight: isActive ? 700 : 600,
                        fontSize: 12,
                        letterSpacing: "0.3px",
                        background: isActive ? "var(--accent)" : "transparent",
                        color: isActive ? "#fff" : "var(--text-muted)",
                        border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 3,
                        cursor: "pointer",
                      }}
                    >
                      {label} <span style={{ opacity: 0.6 }}>({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Calendar grid — matches schedule page */}
              <Card style={{ padding: 16, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
                <div
                  style={{
                    background: "var(--surface-warm)",
                    padding: "12px 16px",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Work Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 14,
                      color: "var(--accent-deep)",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {formatLongDate(new Date(activeDay + "T00:00:00"))}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {daySessions.length} {t("admin.sessions").toLowerCase()}
                  </span>
                </div>

                <div style={{ display: "flex" }}>
                  {/* Hour labels */}
                  <div
                    style={{
                      width: 56,
                      flexShrink: 0,
                      position: "relative",
                      height: totalHeight,
                    }}
                  >
                    {hourLabels.map((label) => {
                      const top = (parseInt(label) * 60 - dayStartMin) * PX_PER_MIN;
                      return (
                        <div
                          key={label}
                          style={{
                            position: "absolute",
                            top,
                            right: 6,
                            fontSize: 12,
                            color: "var(--text-muted)",
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          {label}
                        </div>
                      );
                    })}
                  </div>

                  {/* Session area */}
                  <div
                    style={{
                      flex: 1,
                      position: "relative",
                      height: totalHeight,
                      background: "var(--surface-warm)",
                      borderRadius: 4,
                    }}
                  >
                    {/* Hour grid lines */}
                    {hourLabels.map((label) => {
                      const top = (parseInt(label) * 60 - dayStartMin) * PX_PER_MIN;
                      return (
                        <div
                          key={label}
                          style={{
                            position: "absolute",
                            top,
                            left: 0,
                            right: 0,
                            borderTop: "1px solid var(--border)",
                            pointerEvents: "none",
                          }}
                        />
                      );
                    })}

                    {/* Session blocks */}
                    {placements.map(({ session: s, colIndex, totalCols }) => {
                      const sStart = toMin(s.start),
                        sEnd = toMin(s.end);
                      const top = (sStart - dayStartMin) * PX_PER_MIN;
                      const height = Math.max((sEnd - sStart) * PX_PER_MIN, 24);
                      const left = `${(colIndex / totalCols) * 100}%`;
                      const width = `calc(${100 / totalCols}% - 2px)`;
                      const attendeeCount = (s.attendees || []).length;

                      return (
                        <div
                          key={s.id}
                          onClick={() => setSessionDetailModal(s)}
                          style={{
                            position: "absolute",
                            top,
                            left,
                            width,
                            height,
                            background: "var(--accent)",
                            padding: "6px 10px",
                            cursor: "pointer",
                            overflow: "hidden",
                            boxSizing: "border-box",
                            transition: "opacity 120ms ease",
                            display: "flex",
                            flexDirection: "column",
                            borderRadius: 3,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "rgba(255,255,255,0.88)",
                              flexShrink: 0,
                            }}
                          >
                            {s.start}–{s.end}
                          </div>
                          <div
                            style={{
                              flex: 1,
                              minHeight: 0,
                              overflow: "hidden",
                              marginTop: 3,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                color: "#fff",
                                lineHeight: 1.4,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {s.title}
                            </div>
                          </div>
                          {attendeeCount > 0 && (
                            <div
                              style={{
                                display: "flex",
                                gap: 2,
                                marginTop: "auto",
                                paddingTop: 3,
                                flexShrink: 0,
                              }}
                            >
                              {(s.attendees || []).slice(0, 5).map((uid) => {
                                const member = approvedMembers.find((mm) => mm.id === uid);
                                if (!member) return null;
                                return (
                                  <div
                                    key={uid}
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 2,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 9,
                                      fontWeight: 700,
                                      color: "#fff",
                                      background:
                                        COLORS[(member.colorIndex || 0) % COLORS.length].hex,
                                    }}
                                    title={getMemberName(member)}
                                  >
                                    {(getMemberName(member) || "?").charAt(0).toUpperCase()}
                                  </div>
                                );
                              })}
                              {attendeeCount > 5 && (
                                <div
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 2,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 9,
                                    color: "var(--text-muted)",
                                    background: "var(--surface)",
                                  }}
                                >
                                  +{attendeeCount - 5}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          );
        })()}

      {/* ── Session Detail Modal ─────────────────────────────────────────── */}
      {sessionDetailModal &&
        (() => {
          const s = sessionDetailModal;
          const sessionAttendees = approvedMembers.filter((m) =>
            (s.attendees || []).includes(m.id),
          );
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(2px)",
              }}
              onClick={() => setSessionDetailModal(null)}
            >
              <div
                style={{
                  width: 380,
                  maxWidth: "90vw",
                  maxHeight: "80vh",
                  overflow: "auto",
                  background: "var(--surface)",
                  borderRadius: 10,
                  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
                  color: "var(--text-primary)",
                  boxShadow: "var(--shadow-xl)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Title block */}
                <div
                  style={{
                    padding: "18px 20px 14px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {s.code && (
                    <span
                      style={{
                        display: "inline-block",
                        fontFamily: "'Work Sans', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        color: "var(--accent-deep)",
                        background: "var(--accent-soft)",
                        padding: "3px 8px",
                        borderRadius: 3,
                        marginBottom: 8,
                      }}
                    >
                      {s.code}
                    </span>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        lineHeight: 1.35,
                      }}
                    >
                      {s.title}
                    </h3>
                    <button
                      onClick={() => setSessionDetailModal(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        fontSize: 18,
                        cursor: "pointer",
                        padding: 0,
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Info chips */}
                <div
                  style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-muted)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {s.date} · {s.start}–{s.end}
                  </div>
                  {s.room && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-muted)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {s.room}
                    </div>
                  )}
                  {s.format && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-muted)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                      {s.format}
                      {s.recording === "Yes" && " · Recording"}
                    </div>
                  )}
                </div>

                {/* Themes */}
                {(s.keyThemes || []).length > 0 && (
                  <div
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Work Sans', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      {t("admin.topics")}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(s.keyThemes || []).map((t, i) => (
                        <Tag key={i} minimal round>
                          {t}
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}

                {/* Speakers */}
                {(s.speakers || []).length > 0 && (
                  <div
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Work Sans', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      {t("admin.speakers")}
                    </div>
                    {(s.speakers || []).map((sp, i) => (
                      <div
                        key={i}
                        style={{
                          marginBottom: i < (s.speakers || []).length - 1 ? 8 : 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            lineHeight: 1.3,
                          }}
                        >
                          {sp.name}
                        </div>
                        {(sp.title || sp.company) && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              marginTop: 2,
                            }}
                          >
                            {[sp.title, sp.company].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Attendees */}
                <div
                  style={{
                    padding: "14px 20px",
                    borderBottom: s.url ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Work Sans', sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {t("admin.attending")}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--accent-deep)",
                        background: "var(--accent-soft)",
                        padding: "1px 7px",
                        borderRadius: 10,
                        letterSpacing: 0,
                        textTransform: "none",
                      }}
                    >
                      {sessionAttendees.length}
                    </span>
                  </div>
                  {sessionAttendees.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {t("admin.noOneAssigned")}
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {sessionAttendees.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: COLORS[(m.colorIndex || 0) % COLORS.length].hex,
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {(getMemberName(m) || "?").charAt(0).toUpperCase()}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                color: "var(--text-primary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {getMemberName(m)}
                            </span>
                            <ModeBadge mode={m.attendanceMode || "onsite"} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Session URL */}
                {s.url && (
                  <div style={{ padding: "14px 20px" }}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        background: "var(--surface-warm)",
                        color: "var(--text-secondary)",
                        textAlign: "center",
                        padding: "10px 14px",
                        fontSize: 13,
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        textDecoration: "none",
                        transition: "all 120ms ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                        e.currentTarget.style.borderColor = "var(--text-muted)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-secondary)";
                        e.currentTarget.style.borderColor = "var(--border)";
                      }}
                    >
                      {t("admin.viewOfficialPage")}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
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
