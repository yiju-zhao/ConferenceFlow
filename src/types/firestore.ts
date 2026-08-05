import type { Timestamp } from "firebase/firestore";

export type GlobalRole = "user" | "super_admin";
export type AuthProvider = "email" | "google";
export type MemberRole = "admin" | "member";
export type MemberStatus = "approved" | "pending";
export type AttendanceMode = "onsite" | "online";
export type ConferenceVisibility = "public" | "private";

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
 * `api/conferences/[confId]/sessions/[...path].js` (POST `data` and the PUT
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
}
