import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

/**
 * Sort sessions by date + start time (ascending).
 */
export function sortSessionsByTime(sessions) {
  return [...sessions].sort((a, b) =>
    (a.date + a.start).localeCompare(b.date + b.start),
  );
}

/**
 * Unified hook for subscribing to conference sessions.
 * Replaces duplicated onSnapshot patterns across 6+ files.
 *
 * @param {string} confId - Conference ID
 * @param {object} [options]
 * @param {string} [options.filterDate] - Only return sessions matching this date
 * @returns {{ sessions, sessionsMap, loading }}
 */
export function useConferenceSessions(confId, options = {}) {
  const { user } = useAuth();
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }

    return onSnapshot(
      collection(db, "conferences", confId, "sessions"),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllSessions(sortSessionsByTime(arr));
        setLoading(false);
      },
    );
  }, [user, confId]);

  const sessions = useMemo(() => {
    if (!options.filterDate) return allSessions;
    return allSessions.filter((s) => s.date === options.filterDate);
  }, [allSessions, options.filterDate]);

  // Map version: { code: sessionData } with attendees as Set
  const sessionsMap = useMemo(() => {
    const map = {};
    allSessions.forEach((s) => {
      map[s.code || s.id] = {
        ...s,
        attendees: new Set(s.attendees || []),
      };
    });
    return map;
  }, [allSessions]);

  return { sessions, allSessions, sessionsMap, loading };
}
