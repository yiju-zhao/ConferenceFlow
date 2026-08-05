import { useState, useRef, useCallback } from "react";

type SaveState = "idle" | "saving" | "saved";

export function useDebouncedSave(delay = 600) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const pending = useRef(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const debouncedSave = useCallback(
    (key: string, fn: () => void | Promise<void>) => {
      if (!timers.current[key]) pending.current += 1;
      else clearTimeout(timers.current[key]);
      setSaveState("saving");
      timers.current[key] = setTimeout(() => {
        delete timers.current[key];
        pending.current -= 1;
        Promise.resolve(fn()).finally(() => {
          if (pending.current === 0) {
            setSaveState("saved");
            if (savedTimer.current) clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
          }
        });
      }, delay);
    },
    [delay],
  );

  return { debouncedSave, saveState };
}
