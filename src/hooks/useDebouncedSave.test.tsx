import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDebouncedSave } from "./useDebouncedSave";

describe("useDebouncedSave", () => {
  it("flushes each latest pending callback exactly once", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(600));
    act(() => {
      result.current.debouncedSave("title", () => save("old"));
      result.current.debouncedSave("title", () => save("new"));
    });
    await act(async () => result.current.flushPending());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("new");
    vi.runAllTimers();
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("rejects flush when a pending persistence callback fails", async () => {
    const { result } = renderHook(() => useDebouncedSave(600));
    act(() => {
      result.current.debouncedSave("title", () => Promise.reject(new Error("save failed")));
    });
    await expect(result.current.flushPending()).rejects.toThrow("save failed");
  });
});
