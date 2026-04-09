import React from "react";
import { MapPin } from "lucide-react";
import { COLORS } from "../../constants";
import { SESSION_CATALOG } from "../../sessionCatalog";
import { getInitials } from "../../lib/reportUtils";
import { SessionTypeBadge, FormatBadge, NoRecordingBadge } from "./Badges";

export default function CalendarSessionCard({
  session,
  members,
  toggleAttendance,
  user,
}) {
  return (
    <div
      className={`calendar-session-card${session.attendees.size === 0 ? " calendar-card--unassigned" : ""}${session.attendees.size >= 3 ? " calendar-card--popular" : ""}`}
    >
      <div className="calendar-card-top">
        <span className="code-badge">{session.code}</span>
        {session.session_type && (
          <SessionTypeBadge type={session.session_type} />
        )}
        {session.format && <FormatBadge format={session.format} />}
        {session.recording && session.recording !== "Yes" && (
          <NoRecordingBadge />
        )}
        <span className="font-mono calendar-card-time">
          {session.start}–{session.end}
        </span>
      </div>
      <p className="calendar-card-title">
        {SESSION_CATALOG.get(session.code)?.url ? (
          <a
            href={SESSION_CATALOG.get(session.code).url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {SESSION_CATALOG.get(session.code)?.title || session.title}
          </a>
        ) : (
          SESSION_CATALOG.get(session.code)?.title || session.title
        )}
      </p>
      {session.room && (
        <div className="calendar-card-room">
          <MapPin size={10} color="var(--text-dim)" />
          <span className="calendar-card-room-text">{session.room}</span>
        </div>
      )}
      {members.length > 0 && (
        <div className="calendar-card-pills">
          {members.map((m) => {
            const c = COLORS[m.colorIndex];
            const isOn = session.attendees.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => user && toggleAttendance(session.code, m.id)}
                className={`calendar-member-pill${isOn ? " active" : ""}`}
                style={{
                  cursor: user ? "pointer" : "default",
                  background: isOn ? c.bg : undefined,
                  color: isOn ? c.hex : undefined,
                  borderColor: isOn ? c.hex + "50" : undefined,
                }}
                title={m.name}
              >
                {getInitials(m.name)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
