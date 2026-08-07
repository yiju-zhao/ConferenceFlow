import { useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useConferenceDoc } from "../../hooks/useConferenceDoc";
import { useConferenceMembers } from "../../hooks/useConferenceMembers";
import { useConferenceSessions } from "../../hooks/useConferenceSessions";
import AppNavbar from "../shell/AppNavbar";
import { SectionAccentProvider } from "../shell/SectionAccent";
import SessionPool from "./SessionPool";
import ScheduleGrid from "./ScheduleGrid";
import SessionDetail from "./SessionDetail";
import "./calendar.css";

export default function CalendarPage() {
  const { confId } = useParams();
  const { user } = useAuth();
  useConferenceDoc(confId);
  const { members } = useConferenceMembers(confId);
  const { allSessions } = useConferenceSessions(confId);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // IDs of sessions the current user is attending
  const userAttendingIds = useMemo(() => {
    if (!user) return [];
    return allSessions.filter((s) => (s.attendees || []).includes(user.uid)).map((s) => s.id);
  }, [allSessions, user]);

  // Sessions the user is attending (for the grid)
  const mySchedule = useMemo(() => {
    return allSessions.filter((s) => (s.attendees || []).includes(user?.uid ?? ""));
  }, [allSessions, user]);

  // Selected session object
  const selectedSession = useMemo(() => {
    return allSessions.find((s) => s.id === selectedSessionId) || null;
  }, [allSessions, selectedSessionId]);

  const isAttendingSelected = selectedSession
    ? (selectedSession.attendees || []).includes(user?.uid ?? "")
    : false;

  // Toggle attendance
  const handleToggleAttend = useCallback(async () => {
    if (!selectedSession || !user || !confId) return;
    const sessionRef = doc(db, "conferences", confId, "sessions", selectedSession.id);
    if (isAttendingSelected) {
      await updateDoc(sessionRef, { attendees: arrayRemove(user.uid) });
    } else {
      await updateDoc(sessionRef, { attendees: arrayUnion(user.uid) });
    }
  }, [selectedSession, user, confId, isAttendingSelected]);

  return (
    <SectionAccentProvider accent="cal">
      <div className="cal-page">
        <AppNavbar showConfTabs />
        <div className="cal-body">
          <SessionPool
            sessions={allSessions}
            selectedId={selectedSessionId}
            onSelect={setSelectedSessionId}
            userAttending={userAttendingIds}
          />
          <ScheduleGrid
            sessions={mySchedule}
            selectedId={selectedSessionId}
            onSelect={setSelectedSessionId}
            members={members}
          />
          <SessionDetail
            session={selectedSession}
            members={members}
            isAttending={isAttendingSelected}
            onToggleAttend={handleToggleAttend}
          />
        </div>
      </div>
    </SectionAccentProvider>
  );
}
