import { describe, expect, it } from "vitest";
import { mySessions, newSessionDraft, selectedReportSessions } from "./sessionSelection";
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

  it("renders only keys present in the report and not deleted", () => {
    expect(selectedReportSessions(sessions, { S102: {} }, []).map((session) => session.code)).toEqual([
      "S102",
    ]);
  });

  it("retains an authoritative calendar document reference", () => {
    expect(newSessionDraft(sessions[0])).toEqual({
      calendarSessionId: "doc-a",
      takeaways: "",
      insights: "",
      transcriptRef: null,
    });
  });
});
