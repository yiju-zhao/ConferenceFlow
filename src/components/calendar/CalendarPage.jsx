import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import CalendarHeader from "./CalendarHeader";
import SessionPool from "./SessionPool";
import ScheduleGrid from "./ScheduleGrid";
import SessionDetail from "./SessionDetail";
import "./calendar.css";

export default function CalendarPage() {
  const { confId } = useParams();
  const { user } = useAuth();
  const [conference, setConference] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Listen to conference doc
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConference(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [confId]);

  // Listen to all sessions
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      setAllSessions(arr);
    });
  }, [confId]);

  // Listen to members
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(collection(db, "conferences", confId, "members"), async (snap) => {
      const arr = [];
      for (const d of snap.docs) {
        const data = d.data();
        // Try to get display name from users collection
        let displayName = data.legacyName || null;
        if (!displayName) {
          try {
            const userSnap = await import("firebase/firestore").then(({ getDoc, doc: docRef }) =>
              getDoc(docRef(db, "users", d.id))
            );
            displayName = userSnap.exists() ? userSnap.data().displayName || userSnap.data().email : d.id;
          } catch {
            displayName = d.id;
          }
        }
        arr.push({ userId: d.id, ...data, displayName });
      }
      setMembers(arr);
    });
  }, [confId]);

  // IDs of sessions the current user is attending
  const userAttendingIds = useMemo(() => {
    if (!user) return [];
    return allSessions
      .filter((s) => (s.attendees || []).includes(user.uid))
      .map((s) => s.id);
  }, [allSessions, user]);

  // Sessions the user is attending (for the grid)
  const mySchedule = useMemo(() => {
    return allSessions.filter((s) => (s.attendees || []).includes(user?.uid));
  }, [allSessions, user]);

  // Selected session object
  const selectedSession = useMemo(() => {
    return allSessions.find((s) => s.id === selectedSessionId) || null;
  }, [allSessions, selectedSessionId]);

  const isAttendingSelected = selectedSession
    ? (selectedSession.attendees || []).includes(user?.uid)
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
    <div className="cal-page">
      <CalendarHeader confName={conference?.name} />
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
  );
}
