import { useState, useRef, useCallback } from "react";

export function useDebouncedSave(delay = 600) {
  const timers = useRef({});
  const pending = useRef(0);
  const savedTimer = useRef(null);
  const [saveState, setSaveState] = useState("idle");
  const debouncedSave = useCallback(
    (key, fn) => {
      if (!timers.current[key]) pending.current += 1;
      else clearTimeout(timers.current[key]);
      setSaveState("saving");
      timers.current[key] = setTimeout(() => {
        delete timers.current[key];
        pending.current -= 1;
        Promise.resolve(fn()).finally(() => {
          if (pending.current === 0) {
            setSaveState("saved");
            clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
          }
        });
      }, delay);
    },
    [delay],
  );
  return { debouncedSave, saveState };
}
