import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import type { Member } from "../types";

export function useMembership(confId: string | undefined) {
  const { user, isSuperAdmin } = useAuth();
  const [membership, setMembership] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }
    if (isSuperAdmin) {
      setMembership({
        id: user.uid,
        role: "admin",
        status: "approved",
        attendanceMode: "onsite",
        colorIndex: 0,
      });
      setLoading(false);
      return;
    }
    const memberRef = doc(db, "conferences", confId, "members", user.uid);
    const unsubscribe = onSnapshot(memberRef, (snap) => {
      setMembership(snap.exists() ? (snap.data() as Member) : null);
      setLoading(false);
    });
    return unsubscribe;
  }, [user, confId, isSuperAdmin]);

  return {
    membership,
    role: membership?.role ?? null,
    status: membership?.status ?? null,
    isApproved: membership?.status === "approved",
    isAdmin: membership?.role === "admin" || isSuperAdmin,
    loading,
  };
}
