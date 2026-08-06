import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import type { Session, WithId } from "../types";

export function sortSessionsByTime(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

interface UseConferenceSessionsOptions {
  filterDate?: string;
}

interface SessionsMapValue extends Omit<Session, "attendees"> {
  attendees: Set<string>;
}

export function useConferenceSessions(confId: string | undefined, options: UseConferenceSessionsOptions = {}) {
  const { user } = useAuth();
  const [allSessions, setAllSessions] = useState<WithId<Session>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Session, "id">) }));
      setAllSessions(sortSessionsByTime(arr));
      setLoading(false);
    });
  }, [user, confId]);

  const sessions = useMemo(() => {
    if (!options.filterDate) return allSessions;
    return allSessions.filter((s) => s.date === options.filterDate);
  }, [allSessions, options.filterDate]);

  const sessionsMap = useMemo(() => {
    const map: Record<string, SessionsMapValue> = {};
    allSessions.forEach((s) => {
      map[s.code || s.id] = { ...s, attendees: new Set(s.attendees || []) };
    });
    return map;
  }, [allSessions]);

  return { sessions, allSessions, sessionsMap, loading };
}
