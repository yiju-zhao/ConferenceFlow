import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({
  auth: { currentUser: null as null | { getIdToken: ReturnType<typeof vi.fn> } },
}));

vi.mock("../firebase", () => ({ auth }));

import { apiFetch } from "./api";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("token-1") };
  });

  it("keeps server error code and retryability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "AI unavailable", code: "DEEPSEEK", retryable: true }),
          {
            status: 502,
            statusText: "Bad Gateway",
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(apiFetch("/api/ai")).rejects.toMatchObject({
      message: "AI unavailable",
      status: 502,
      code: "DEEPSEEK",
      retryable: true,
    });
  });

  it("keeps successful JSON calls typed and authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ready: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch<{ ready: boolean }>("/api/ai")).resolves.toEqual({ ready: true });
    expect(fetch).toHaveBeenCalledWith(
      "/api/ai",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
      }),
    );
  });
});
