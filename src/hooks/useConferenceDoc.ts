import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { Conference, WithId } from "../types";

export function useConferenceDoc(confId: string | undefined) {
  const [conference, setConference] = useState<WithId<Conference> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!confId) {
      setLoading(false);
      return;
    }
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConference(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Conference, "id">) } : null);
      setLoading(false);
    });
  }, [confId]);

  return { conference, loading };
}
