import type { Timestamp } from "firebase/firestore";

export type GlobalRole = "user" | "super_admin";
export type AuthProvider = "email" | "google";
export type MemberRole = "admin" | "member";
export type MemberStatus = "approved" | "pending";
export type AttendanceMode = "onsite" | "online";

export interface UserProfile {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: AuthProvider;
  globalRole: GlobalRole;
  createdAt: Timestamp | null;
  lastLoginAt: Timestamp | null;
}

export interface Session {
  id: string;
  code?: string;
  date: string;
  start: string;
  attendees?: string[];
  // Additional fields (title, end, room, etc.) are added in the calendar/report
  // batch when their writers are read. JS consumers are unaffected meanwhile.
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
}

/** The recurring `{ id: snap.id, ...snap.data() }` shape. */
export type WithId<T> = T & { id: string };
