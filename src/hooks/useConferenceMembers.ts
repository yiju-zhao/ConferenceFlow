import { useState, useEffect, useMemo } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { COLORS } from "../constants";
import type { Member, WithId } from "../types";

export type ResolvedMember = WithId<Member> & { name: string };

export function useConferenceMembers(confId: string | undefined) {
  const { user } = useAuth();
  const [members, setMembers] = useState<ResolvedMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !confId) {
      setLoading(false);
      return;
    }
    return onSnapshot(collection(db, "conferences", confId, "members"), async (snap) => {
      const rawMembers = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Member, "id">) }));
      const resolved = await Promise.all(
        rawMembers.map(async (m): Promise<ResolvedMember> => {
          if (m.managedByAdmin) return { ...m, name: m.displayName || "Unnamed" };
          if (m.legacyName) return { ...m, name: m.legacyName };
          if (m.displayName) return { ...m, name: m.displayName };
          try {
            const userSnap = await getDoc(doc(db, "users", m.id));
            const data = userSnap.data();
            const name = userSnap.exists() ? data?.displayName || data?.email || m.id : m.id;
            return { ...m, name: name as string };
          } catch {
            return { ...m, name: m.id };
          }
        }),
      );
      setMembers(resolved);
      setLoading(false);
    });
  }, [user, confId]);

  const memberNames = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [members]);

  const memberColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach((m) => {
      map[m.id] = m.colorIndex ?? 0;
    });
    return map;
  }, [members]);

  return { members, memberNames, memberColorMap, loading };
}

export function getMemberColor(colorIndex: number | undefined) {
  return COLORS[(colorIndex ?? 0) % COLORS.length];
}
