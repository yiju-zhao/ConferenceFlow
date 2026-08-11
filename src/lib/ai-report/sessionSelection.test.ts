import { describe, expect, it } from "vitest";
import {
  mySessions,
  newSessionDraft,
  readdReportSession,
  reportSessionSpeakers,
  selectedReportSessions,
} from "./sessionSelection";
import type { Session } from "../../types";

const sessions: Session[] = [
  {
    id: "doc-a",
    code: "S101",
    title: "A",
    date: "2026-08-11",
    start: "09:00",
    end: "10:00",
    attendees: ["u1"],
    speakers: [{ name: "Calendar speaker", title: "Researcher", company: "ConferenceFlow" }],
  },
  {
    id: "doc-b",
    code: "S102",
    title: "B",
    date: "2026-08-12",
    start: "11:00",
    end: "12:00",
    attendees: ["u2"],
  },
];

describe("report Session selection", () => {
  it("defaults My Sessions to the current user's attendance only", () => {
    expect(mySessions(sessions, "u1").map((session) => session.code)).toEqual(["S101"]);
  });

  it("renders only report keys that have not been deleted", () => {
    expect(
      selectedReportSessions(sessions, { S101: {}, S102: {} }, ["S101"]).map(
        (session) => session.code,
      ),
    ).toEqual(["S102"]);
  });

  it("retains an authoritative calendar document reference", () => {
    expect(newSessionDraft(sessions[0])).toEqual({
      calendarSessionId: "doc-a",
      takeaways: "",
      insights: "",
      transcriptRef: null,
    });
  });

  it("re-adds a deleted Session without discarding existing report drafts", () => {
    expect(readdReportSession({ S101: { takeaways: "Keep this" } }, ["S102"], sessions[1])).toEqual(
      {
        key: "S102",
        draft: {
          calendarSessionId: "doc-b",
          takeaways: "",
          insights: "",
          transcriptRef: null,
        },
        sessions: {
          S101: { takeaways: "Keep this" },
          S102: {
            calendarSessionId: "doc-b",
            takeaways: "",
            insights: "",
            transcriptRef: null,
          },
        },
        deletedSessions: [],
      },
    );
  });

  it("uses calendar speakers for template-bound reports and saved speakers for legacy reports", () => {
    const savedSpeakers = [{ name: "Legacy speaker", position: "Editor", company: "Archive" }];
    expect(reportSessionSpeakers(sessions[0], { speakers: savedSpeakers }, true)).toEqual([
      { name: "Calendar speaker", position: "Researcher", company: "ConferenceFlow" },
    ]);
    expect(reportSessionSpeakers(sessions[0], { speakers: savedSpeakers }, false)).toEqual(
      savedSpeakers,
    );
  });
});
