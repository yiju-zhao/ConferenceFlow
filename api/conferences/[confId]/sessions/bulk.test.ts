import { describe, expect, it, vi } from "vitest";

const { mockBatchSet, mockBatchCommit, mockColDoc } = vi.hoisted(() => ({
  mockBatchSet: vi.fn(),
  mockBatchCommit: vi.fn(),
  mockColDoc: vi.fn((id?: string) => ({ id: id ?? "(auto)" })),
}));

vi.mock("../../../lib/firebase-admin.js", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ collection: vi.fn(() => ({ doc: mockColDoc })) })),
    })),
    batch: vi.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "server-ts") },
}));

vi.mock("../../../lib/auth-middleware.js", () => ({
  requireConfAdmin: vi.fn(),
  AuthError: class AuthError extends Error {
    status = 401;
  },
}));

// eslint-disable-next-line import/first
import handler from "./[...path]";

function makeReqRes(sessions: unknown[]) {
  const req = {
    method: "POST",
    query: { confId: "conf-1", path: ["bulk"] },
    body: { sessions },
  };
  const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return { req, res };
}

function writtenData(call = 0): Record<string, unknown> {
  return mockBatchSet.mock.calls[call][1] as Record<string, unknown>;
}

describe("POST /sessions/bulk", () => {
  it("maps snake_case key_themes to keyThemes", async () => {
    const { req, res } = makeReqRes([
      { title: "A", date: "2026-03-18", start: "09:00", end: "10:00", key_themes: ["AI"] },
    ]);
    await handler(req as never, res as never);
    expect(writtenData().keyThemes).toEqual(["AI"]);
  });

  it("accepts camelCase keyThemes as an alias", async () => {
    const { req, res } = makeReqRes([
      { title: "A", date: "2026-03-18", start: "09:00", end: "10:00", keyThemes: ["GPU"] },
    ]);
    await handler(req as never, res as never);
    expect(writtenData().keyThemes).toEqual(["GPU"]);
  });

  it("prefers key_themes when both are present", async () => {
    const { req, res } = makeReqRes([
      {
        title: "A",
        date: "2026-03-18",
        start: "09:00",
        end: "10:00",
        key_themes: ["AI"],
        keyThemes: ["GPU"],
      },
    ]);
    await handler(req as never, res as never);
    expect(writtenData().keyThemes).toEqual(["AI"]);
  });
});
