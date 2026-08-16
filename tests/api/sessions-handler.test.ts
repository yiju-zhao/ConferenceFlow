import { describe, expect, it, vi } from "vitest";

const { mockBatchSet, mockBatchCommit, mockColDoc, mockRefSet, mockRefUpdate, mockRefDelete, mockSnapGet } =
  vi.hoisted(() => ({
    mockBatchSet: vi.fn(),
    mockBatchCommit: vi.fn(),
    mockColDoc: vi.fn((id?: string) => ({
      id: id ?? "(auto)",
      get: mockSnapGet,
      set: mockRefSet,
      update: mockRefUpdate,
      delete: mockRefDelete,
    })),
    mockRefSet: vi.fn(),
    mockRefUpdate: vi.fn(),
    mockRefDelete: vi.fn(),
    mockSnapGet: vi.fn(async () => ({ exists: true, data: () => ({}) })),
  }));

vi.mock("../../api/lib/firebase-admin.js", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({ doc: mockColDoc })),
      })),
    })),
    batch: vi.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit })),
  },
  FieldValue: { serverTimestamp: vi.fn(() => "server-ts") },
}));

vi.mock("../../api/lib/auth-middleware.js", () => ({
  requireConfAdmin: vi.fn(),
  AuthError: class AuthError extends Error {
    status = 401;
  },
}));

// eslint-disable-next-line import/first
import handler from "../../api/conferences/[confId]/sessions/[action]";

function makeReqRes(method: string, action: string, body?: unknown) {
  const req = { method, query: { confId: "conf-1", action }, body: body ?? {} };
  const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return { req, res };
}

function bulkData(call = 0): Record<string, unknown> {
  return mockBatchSet.mock.calls[call][1] as Record<string, unknown>;
}

const validSession = { title: "A", date: "2026-03-18", start: "09:00", end: "10:00" };

describe("sessions [action] routing", () => {
  it("routes POST bulk to the bulk handler and maps key_themes", async () => {
    const { req, res } = makeReqRes("POST", "bulk", { sessions: [{ ...validSession, key_themes: ["AI"] }] });
    await handler(req as never, res as never);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(bulkData().keyThemes).toEqual(["AI"]);
  });

  it("routes POST create to the single-create handler", async () => {
    const { req, res } = makeReqRes("POST", "create", validSession);
    await handler(req as never, res as never);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockRefSet).toHaveBeenCalled();
  });

  it("rejects POST create when required fields are missing", async () => {
    const { req, res } = makeReqRes("POST", "create", { title: "only title" });
    await handler(req as never, res as never);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "title, date, start, and end are required" });
  });

  it("routes PUT <sessionId> to the update handler", async () => {
    const { req, res } = makeReqRes("PUT", "sess123", { title: "Updated" });
    await handler(req as never, res as never);
    expect(mockRefUpdate).toHaveBeenCalled();
  });

  it("routes DELETE <sessionId> to the delete handler", async () => {
    const { req, res } = makeReqRes("DELETE", "sess123");
    await handler(req as never, res as never);
    expect(mockRefDelete).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ id: "sess123", deleted: true });
  });

  it("returns 405 for GET on an unknown action", async () => {
    const { req, res } = makeReqRes("GET", "anything");
    await handler(req as never, res as never);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
