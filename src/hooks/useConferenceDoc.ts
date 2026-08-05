import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { WithId } from "../types";

// `conference` is loosely typed until the Conference interface is introduced
// in the calendar batch; JS consumers are unaffected.
export function useConferenceDoc(confId: string | undefined) {
  const [conference, setConference] = useState<WithId<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!confId) {
      setLoading(false);
      return;
    }
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConference(snap.exists() ? { id: snap.id, ...(snap.data() as Record<string, unknown>) } : null);
      setLoading(false);
    });
  }, [confId]);

  return { conference, loading };
}
