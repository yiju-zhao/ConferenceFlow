import type { ReportSessionData, Session } from "../../types";

export function sessionKey(session: Session): string {
  return session.code || session.id;
}

export function mySessions(sessions: Session[], uid: string): Session[] {
  return sessions.filter((session) => session.attendees?.includes(uid));
}

export function selectedReportSessions(
  sessions: Session[],
  reportSessions: Record<string, ReportSessionData>,
  deleted: string[],
): Session[] {
  const removed = new Set(deleted);
  return sessions
    .filter((session) => sessionKey(session) in reportSessions && !removed.has(sessionKey(session)))
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}

export function newSessionDraft(session: Session): ReportSessionData {
  return {
    calendarSessionId: session.id,
    takeaways: "",
    insights: "",
    transcriptRef: null,
  };
}
