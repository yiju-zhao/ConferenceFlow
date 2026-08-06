import { useState, useEffect } from "react";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import type { ActiveUser, Presence } from "../../types";

const HEARTBEAT_INTERVAL = 30000;
const OFFLINE_THRESHOLD = 60000;

export function usePresence(confId: string | undefined, reportId: string | undefined) {
  const { user, userProfile } = useAuth();
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  useEffect(() => {
    if (!user || !confId || !reportId) return;
    const presenceRef = doc(
      db,
      "conferences",
      confId,
      "dailyReports",
      reportId,
      "presence",
      user.uid,
    );
    const writeHeartbeat = () => {
      setDoc(
        presenceRef,
        {
          displayName: userProfile?.displayName || user.displayName || "Anonymous",
          email: userProfile?.email || user.email || "",
          lastSeen: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => {});
    };
    writeHeartbeat();
    const interval = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL);
    return () => {
      clearInterval(interval);
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [user, confId, reportId, userProfile]);

  useEffect(() => {
    if (!confId || !reportId) return;
    return onSnapshot(
      collection(db, "conferences", confId, "dailyReports", reportId, "presence"),
      (snap) => {
        const now = Date.now();
        const users: ActiveUser[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as Presence;
          const lastSeen = data.lastSeen?.toMillis?.() || 0;
          if (now - lastSeen < OFFLINE_THRESHOLD) {
            users.push({
              uid: d.id,
              displayName: data.displayName || d.id,
              email: data.email || "",
              lastSeen,
            });
          }
        });
        setActiveUsers(users);
      },
    );
  }, [confId, reportId]);

  return { activeUsers };
}
