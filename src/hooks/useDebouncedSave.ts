import { useState, useRef, useCallback, useEffect } from "react";

type SaveState = "idle" | "saving" | "saved";
type SaveCallback = () => void | Promise<void>;
type PendingEntry = {
  timer: ReturnType<typeof setTimeout>;
  callback: SaveCallback;
};

export function useDebouncedSave(delay = 600) {
  const pending = useRef<Record<string, PendingEntry>>({});
  const inFlight = useRef(new Set<Promise<void>>());
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const markSaved = useCallback(() => {
    setSaveState("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
  }, []);

  const runEntry = useCallback(
    (key: string): Promise<void> => {
      const entry = pending.current[key];
      if (!entry) return Promise.resolve();
      delete pending.current[key];
      clearTimeout(entry.timer);
      const operation = Promise.resolve().then(entry.callback);
      inFlight.current.add(operation);
      const settle = () => {
        inFlight.current.delete(operation);
        if (Object.keys(pending.current).length === 0 && inFlight.current.size === 0) {
          markSaved();
        }
      };
      operation.then(settle, settle);
      return operation;
    },
    [markSaved],
  );

  const debouncedSave = useCallback(
    (key: string, fn: SaveCallback) => {
      const existing = pending.current[key];
      if (existing) clearTimeout(existing.timer);
      setSaveState("saving");
      const timer = setTimeout(() => {
        void runEntry(key).catch((error: unknown) => console.error(error));
      }, delay);
      pending.current[key] = { timer, callback: fn };
    },
    [delay, runEntry],
  );

  const flushPending = useCallback(async (): Promise<void> => {
    while (Object.keys(pending.current).length > 0 || inFlight.current.size > 0) {
      const inFlightPromises = [...inFlight.current];
      const pendingPromises = Object.keys(pending.current).map((key) => {
        const entry = pending.current[key];
        if (entry) clearTimeout(entry.timer);
        return runEntry(key);
      });
      await Promise.all([...inFlightPromises, ...pendingPromises]);
    }
  }, [runEntry]);

  useEffect(
    () => () => {
      Object.values(pending.current).forEach(({ timer }) => clearTimeout(timer));
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  return { debouncedSave, flushPending, saveState };
}
