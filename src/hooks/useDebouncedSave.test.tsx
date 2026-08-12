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

  it("awaits a save whose timer already fired before flushing", async () => {
    vi.useFakeTimers();
    let resolveSave!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { result } = renderHook(() => useDebouncedSave(600));
    act(() => result.current.debouncedSave("title", save));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(save).toHaveBeenCalledTimes(1);

    let flushed = false;
    const flush = result.current.flushPending().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);

    await act(async () => {
      resolveSave();
      await flush;
    });
    expect(flushed).toBe(true);
    vi.useRealTimers();
  });

  it("flushes saves queued while an earlier save is in flight", async () => {
    vi.useFakeTimers();
    let resolveSave!: () => void;
    const firstSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const secondSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebouncedSave(600));
    act(() => result.current.debouncedSave("title", firstSave));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    const flush = result.current.flushPending();
    act(() => result.current.debouncedSave("summary", secondSave));
    expect(secondSave).not.toHaveBeenCalled();

    await act(async () => {
      resolveSave();
      await flush;
    });
    expect(secondSave).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("rejects flush when a timer-fired save fails in flight", async () => {
    vi.useFakeTimers();
    let rejectSave!: (error: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const { result } = renderHook(() => useDebouncedSave(600));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    act(() => result.current.debouncedSave("title", save));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    const flush = result.current.flushPending();
    const expectedError = new Error("in-flight save failed");
    await act(async () => {
      rejectSave(expectedError);
      await expect(flush).rejects.toThrow("in-flight save failed");
    });
    expect(consoleError).toHaveBeenCalledWith(expectedError);
    consoleError.mockRestore();
    vi.useRealTimers();
  });
});
