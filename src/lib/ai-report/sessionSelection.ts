import type { ReportSessionData, ReportSpeaker, Session } from "../../types";

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

export function readdReportSession(
  reportSessions: Record<string, ReportSessionData>,
  deletedSessions: string[],
  session: Session,
): {
  key: string;
  draft: ReportSessionData;
  sessions: Record<string, ReportSessionData>;
  deletedSessions: string[];
} {
  const key = sessionKey(session);
  const draft = newSessionDraft(session);
  return {
    key,
    draft,
    sessions: { ...reportSessions, [key]: draft },
    deletedSessions: deletedSessions.filter((deleted) => deleted !== key),
  };
}

export function reportSessionSpeakers(
  session: Pick<Session, "speakers">,
  reportSession: ReportSessionData,
  templateBound: boolean,
): ReportSpeaker[] {
  if (templateBound) {
    return (session.speakers || []).map((speaker) => ({
      name: speaker.name || "",
      position: speaker.title || "",
      company: speaker.company || "",
    }));
  }
  if (reportSession.speakers) return reportSession.speakers;
  if (reportSession.speaker) {
    return [{ name: reportSession.speaker, position: "", company: reportSession.company || "" }];
  }
  return [{ name: "", position: "", company: "" }];
}
