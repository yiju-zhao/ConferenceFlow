import { useState, useRef, useCallback, useEffect } from "react";

type SaveState = "idle" | "saving" | "saved";
type SaveCallback = () => void | Promise<void>;
type PendingEntry = {
  timer: ReturnType<typeof setTimeout>;
  callback: SaveCallback;
};

export function useDebouncedSave(delay = 600) {
  const pending = useRef<Record<string, PendingEntry>>({});
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
      return Promise.resolve()
        .then(entry.callback)
        .finally(() => {
          if (Object.keys(pending.current).length === 0) markSaved();
        });
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
    const keys = Object.keys(pending.current);
    await Promise.all(
      keys.map((key) => {
        const entry = pending.current[key];
        if (entry) clearTimeout(entry.timer);
        return runEntry(key);
      }),
    );
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
