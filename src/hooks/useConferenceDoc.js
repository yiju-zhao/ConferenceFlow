import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Subscribe to a conference document.
 * Replaces duplicated onSnapshot(doc(db, "conferences", confId)) across 4+ files.
 *
 * @param {string} confId - Conference ID
 * @returns {{ conference, loading }}
 */
export function useConferenceDoc(confId) {
  const [conference, setConference] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!confId) {
      setLoading(false);
      return;
    }

    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConference(
        snap.exists() ? { id: snap.id, ...snap.data() } : null,
      );
      setLoading(false);
    });
  }, [confId]);

  return { conference, loading };
}
