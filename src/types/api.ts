import type { FieldValue } from "firebase-admin/firestore";
import type { ConferenceType, ConferenceVisibility, SessionSpeaker } from "./firestore";

/** Options for apiFetch — a standard fetch options bag. */
export type ApiFetchOptions = RequestInit;

// ── Per-route request/response interfaces ──────────────────────────────────
// Field sets verified against the handler bodies in `api/` (Batch 9e). These
// describe the JSON the handlers read from `req.body` and return via
// `res.json(...)`. Timestamp fields written via `FieldValue.serverTimestamp()`
// are typed as `FieldValue` (the literal value present at write time).

// ── GET /api/health ──
export interface HealthResponse {
  status: "ok";
}

// ── POST /api/conferences ──
export interface CreateConferenceBody {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  visibility?: ConferenceVisibility;
  type?: ConferenceType;
}

/** The conference document payload written by POST /api/conferences. */
export interface ConferenceWriteData {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  visibility: ConferenceVisibility;
  type: ConferenceType;
  joinCode: string;
  createdBy: string;
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

export interface CreateConferenceResponse extends ConferenceWriteData {
  id: string;
}

// ── PUT /api/conferences/[confId] ──
export interface UpdateConferenceBody {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  visibility?: ConferenceVisibility;
  type?: ConferenceType;
  joinCode?: string;
}

// ── POST /api/admin/set-role ──
export interface SetRoleBody {
  userId: string;
  globalRole?: "user" | "super_admin";
  confId?: string;
  confRole?: "admin" | "member";
}

export interface SetRoleResponse {
  userId: string;
  globalRole?: "user" | "super_admin";
  confId?: string;
  confRole?: "admin" | "member";
}

// ── POST /api/conferences/[confId]/members/[action] ──
export interface MemberActionBody {
  userId: string;
}

export interface MemberActionResponse {
  userId: string;
  status: "approved" | "rejected";
}

// ── POST /api/conferences/[confId]/sessions/create (single create) ──
export interface CreateSessionBody {
  code?: string;
  title: string;
  date: string;
  start: string;
  end: string;
  room?: string;
  speakers?: SessionSpeaker[];
  format?: string;
  recording?: string;
  sessionType?: string;
  mainTopic?: string;
  url?: string;
  keyThemes?: string[];
}

/** The session document payload written by single + bulk create. */
export interface SessionWriteData {
  code: string;
  title: string;
  date: string;
  start: string;
  end: string;
  room: string;
  speakers: SessionSpeaker[];
  format: string;
  recording: string;
  sessionType: string;
  mainTopic: string;
  url: string;
  keyThemes: string[];
  attendees: string[];
  createdAt: FieldValue;
  updatedAt: FieldValue;
}

export interface CreateSessionResponse extends SessionWriteData {
  id: string;
}

// ── POST /api/conferences/[confId]/sessions/bulk ──
/**
 * A single bulk-upload input row. Snake_case aliases (`session_id`,
 * `session_type`, `key_themes`, `location`, `topic`) are read by the bulk
 * handler alongside camelCase names — verified against the writer.
 */
export interface BulkSessionInput {
  session_id?: string;
  code?: string;
  title: string;
  date: string;
  start?: string;
  end?: string;
  location?: string;
  room?: string;
  speakers?: SessionSpeaker[];
  format?: string;
  recording?: string;
  session_type?: string;
  sessionType?: string;
  topic?: string;
  mainTopic?: string;
  url?: string;
  key_themes?: string[];
  keyThemes?: string[];
}

export interface BulkSessionsBody {
  sessions: BulkSessionInput[];
}

export interface BulkSessionError {
  index: number;
  error: string;
  session: string;
}

export interface BulkSessionsResponse {
  message: string;
  created: number;
  errors: BulkSessionError[];
}

// ── PUT /api/conferences/[confId]/sessions/[id] ──
export interface UpdateSessionBody {
  code?: string;
  title?: string;
  date?: string;
  start?: string;
  end?: string;
  room?: string;
  speakers?: SessionSpeaker[];
  format?: string;
  recording?: string;
  sessionType?: string;
  mainTopic?: string;
  url?: string;
  keyThemes?: string[];
}

// ── POST|DELETE /api/conferences/[confId]/reports/[reportId] ──
export interface ReportActionResponse {
  reportId: string;
  status: "published" | "draft";
}
