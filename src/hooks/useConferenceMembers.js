import { useState, useEffect, useMemo } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { COLORS } from "../constants";

/**
 * Unified hook for subscribing to conference members with display name resolution.
 * Replaces duplicated onSnapshot + getDoc patterns across 5+ files.
 *
 * @param {string} confId - Conference ID
 * @returns {{ members, memberNames, memberColorMap, loading }}
 */
export function useConferenceMembers(confId) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }

    return onSnapshot(
      collection(db, "conferences", confId, "members"),
      async (snap) => {
        const rawMembers = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Resolve display names in parallel
        const resolved = await Promise.all(
          rawMembers.map(async (m) => {
            // Priority: managedByAdmin displayName > legacyName > users/{id} doc > id
            if (m.managedByAdmin) {
              return { ...m, name: m.displayName || "Unnamed" };
            }
            if (m.legacyName) {
              return { ...m, name: m.legacyName };
            }
            if (m.displayName) {
              return { ...m, name: m.displayName };
            }
            try {
              const userSnap = await getDoc(doc(db, "users", m.id));
              const name = userSnap.exists()
                ? userSnap.data().displayName || userSnap.data().email
                : m.id;
              return { ...m, name };
            } catch {
              return { ...m, name: m.id };
            }
          }),
        );

        setMembers(resolved);
        setLoading(false);
      },
    );
  }, [user, confId]);

  const memberNames = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [members]);

  const memberColorMap = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      map[m.id] = m.colorIndex ?? 0;
    });
    return map;
  }, [members]);

  return { members, memberNames, memberColorMap, loading };
}

/**
 * Get the color object for a member by their color index.
 */
export function getMemberColor(colorIndex) {
  return COLORS[(colorIndex ?? 0) % COLORS.length];
}
