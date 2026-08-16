import type { Timestamp } from "firebase/firestore";
import type { TranscriptRef } from "./ai-report";

export type GlobalRole = "user" | "super_admin";
export type AuthProvider = "email" | "google";
export type MemberRole = "admin" | "member";
// "rejected" is set by the approve/reject API (api/conferences/[confId]/members/[action]).
export type MemberStatus = "approved" | "pending" | "rejected";
export type AttendanceMode = "onsite" | "online";
export type ConferenceVisibility = "public" | "private";
export type ConferenceType = "industry" | "academic";

export interface UserProfile {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: AuthProvider;
  globalRole: GlobalRole;
  createdAt: Timestamp | null;
  lastLoginAt: Timestamp | null;
}

export interface SessionSpeaker {
  name?: string;
  title?: string;
  company?: string;
}

/**
 * A session document. Field set verified against the writer
 * `api/conferences/[confId]/sessions/[action].ts` (POST `data` and the PUT
 * `allowed` list). `title`/`date`/`start`/`end` are validated as required by
 * the writer; the rest default to "" or [] and are kept optional.
 */
export interface Session {
  id: string;
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
  attendees?: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Member {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  attendanceMode: AttendanceMode;
  colorIndex?: number;
  managedByAdmin?: boolean;
  displayName?: string;
  legacyName?: string;
  name?: string; // derived/resolved at runtime by useConferenceMembers
  // Legacy/defensive fields read by calendar components. Member docs are keyed
  // by uid (so `id` is the userId); `userId`/`mode` are not written by current
  // writers but older docs may carry them. Optional → reads stay type-safe.
  userId?: string;
  mode?: AttendanceMode;
  aiFocus?: string;
}

/** The recurring `{ id: snap.id, ...snap.data() }` shape. */
export type WithId<T> = T & { id: string };

/**
 * A conference document. Field set derived from the writer
 * `api/conferences/index.js` (POST) and the editable fields in
 * `api/conferences/[confId]/index.js` (PUT).
 */
export interface Conference {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  visibility: ConferenceVisibility;
  type?: ConferenceType;
  joinCode: string;
  createdBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/**
 * Status of a `dailyReports` document. Values verified against the writers:
 * `api/conferences/[confId]/reports/[reportId].js` ("published"/"draft"),
 * `src/components/report/ReportList.jsx` ("archived"/"draft"), and
 * `src/components/report/DailyReport.jsx` ("draft").
 */
export type ReportStatus = "draft" | "published" | "archived";

// ── Report content sub-shapes ───────────────────────────────────────────────
// Field sets below are verified against the report-component readers/writers
// (DailyReport, ConferenceReport, ReportList, IntelCard, SnapshotViewer,
// usePresence). Fields are optional because docs are read defensively and
// older docs may carry only a subset (legacy single-value fields are kept for
// migration).

/** A speaker entry within a report session (`Report.sessions[code].speakers`). */
export interface ReportSpeaker {
  name?: string;
  position?: string;
  company?: string;
}

/** An illustration attached to a report session. */
export interface ReportIllustration {
  url: string;
  storagePath?: string;
}

/**
 * Per-session report data — the value of `Report.sessions[code]`.
 * Verified against `DailyReport` (auto-init writer + session-field readers).
 */
export interface ReportSessionData {
  speakers?: ReportSpeaker[];
  takeaways?: string;
  insights?: string;
  insightCore?: string;
  insightExplanation?: string;
  techHighlights?: string;
  huaweiImplications?: string;
  illustration?: string; // legacy single illustration URL
  illustrations?: ReportIllustration[];
  lastEditedBy?: string;
  lastEditedAt?: number;
  speaker?: string; // legacy single-speaker field
  company?: string; // legacy
  transcriptRef?: TranscriptRef | null;
  calendarSessionId?: string;
}

/** A session id + free-text fallback chosen via the session picker. */
export interface ReportSourceSession {
  id: string | null;
  manual: string;
}

/** Block kind within `onsiteInfoBlocks` / `reflectionsBlocks` / `rumorsBlocks` / `trendBlocks`. */
export type ReportBlockType = "heading" | "body";

/** Report document fields that hold a `ReportBlock[]`. */
export type BlockField = "onsiteInfoBlocks" | "reflectionsBlocks" | "rumorsBlocks" | "trendBlocks";

/**
 * A content block within `onsiteInfoBlocks` / `reflectionsBlocks`.
 * Verified against `DailyReport` block writers (addBlock/insertBlock/
 * updateBlockFields) and the `IntelCard` reader.
 */
export interface ReportBlock {
  id: string;
  type: ReportBlockType;
  content: string;
  transcriptRef?: TranscriptRef | null;
  ownerId?: string;
  contributorIds?: string[];
  contributorId?: string; // legacy single contributor
  contributor?: string;
  sourceSessions?: ReportSourceSession[];
  sourceSession?: ReportSourceSession; // legacy single source
  lastEditedBy?: string;
  lastEditedAt?: number;
}

/** A site photo attached to a report (`Report.sitePhotos`). */
export interface SitePhoto {
  image: string;
  storagePath?: string;
  caption?: string;
  source?: string;
  w?: number;
  h?: number;
}

/** A section in a summary report's `sections` map. */
export interface ReportSection {
  order: number;
  blocks: ReportBlock[];
}

/**
 * Snapshot of report content stored in the `snapshots/{autoId}` subcollection.
 * `data` mirrors the parent report's content fields. Verified against
 * `DailyReport.createSnapshot` writer and `SnapshotViewer` reader.
 */
export interface ReportSnapshotData {
  title?: string;
  summaryPoints?: string[];
  sessions?: Record<string, ReportSessionData>;
  topicOrder?: string[];
  deletedSessions?: string[];
  onsiteInfo?: string;
  reflections?: string;
  rumors?: string;
  onsiteInfoBlocks?: ReportBlock[];
  reflectionsBlocks?: ReportBlock[];
  rumorsBlocks?: ReportBlock[];
  trendBlocks?: ReportBlock[];
}

export interface ReportSnapshot {
  id: string;
  type?: string; // "auto" | "manual"
  label?: string;
  createdAt?: Timestamp | null;
  createdBy?: string;
  data?: ReportSnapshotData;
}

/**
 * A presence heartbeat document in the `presence/{uid}` subcollection.
 * Verified against the `usePresence` writer.
 */
export interface Presence {
  displayName?: string;
  email?: string;
  lastSeen?: Timestamp | null;
}

/** A resolved active user emitted by `usePresence` (lastSeen is ms epoch). */
export interface ActiveUser {
  uid: string;
  displayName: string;
  email: string;
  lastSeen: number;
}

// ── SESSION_CATALOG entry ────────────────────────────────────────────────────
// The runtime SESSION_CATALOG map is populated from Firestore; its entry shape
// is distinct from the `Session` doc (snake_case catalog fields).

export interface SessionCatalogSpeaker {
  name?: string;
  title?: string;
  company?: string;
}

/** Verified against the report-component readers of SESSION_CATALOG. */
export interface SessionCatalogEntry {
  session_id?: string;
  title?: string;
  url?: string;
  topic?: string;
  key_themes?: string[];
  speakers?: SessionCatalogSpeaker[];
}

/**
 * A `dailyReports` document. Field set verified against the writers above and
 * the readers in `AdminReports`. Content fields (sessions, summaryPoints,
 * sections, …) are added in the report-components batch (9d) — only the fields
 * the admin tooling reads/sets are declared here.
 */
export interface Report {
  id: string;
  type?: string; // "summary" on summary reports
  title?: string;
  status?: ReportStatus;
  publishedAt?: Timestamp | null;
  publishedUrl?: string;
  // Daily-report content (verified against DailyReport auto-init writer)
  date?: string;
  summaryPoints?: string[];
  onsiteInfo?: string; // legacy string field, retained for snapshots
  reflections?: string; // legacy string field, retained for snapshots
  rumors?: string;
  sitePhotos?: SitePhoto[];
  sessions?: Record<string, ReportSessionData>;
  topicOrder?: string[];
  deletedSessions?: string[];
  onsiteInfoBlocks?: ReportBlock[];
  reflectionsBlocks?: ReportBlock[];
  rumorsBlocks?: ReportBlock[];
  trendBlocks?: ReportBlock[];
  // Summary-report content (verified against ReportList summary writer)
  dateStart?: string;
  dateEnd?: string;
  sections?: Record<string, ReportSection>;
  citations?: unknown[]; // written as [] by ReportList; not read by components
  onsiteEvents?: unknown[]; // written as [] by ReportList; not read by components
  sourceReports?: string[]; // read defensively by ReportList; no current writer
  templateId?: string;
  templateVersion?: number;
  templateHash?: string;
}
