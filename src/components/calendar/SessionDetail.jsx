import { useMemo } from "react";

const COLORS = ["#CF0A2C", "#2980B9", "#E67E22", "#8E44AD", "#27AE60", "#2C3E50"];

export default function SessionDetail({ session, members, isAttending, onToggleAttend }) {
  if (!session) {
    return (
      <div className="cal-detail">
        <div className="cal-detail-title-label">Session Details</div>
        <div className="cal-detail-empty">
          <div>Select a session to see details</div>
        </div>
      </div>
    );
  }

  // Build attendee list with names and attendance mode
  const attendees = useMemo(() => {
    return (session.attendees || [])
      .map((uid) => {
        const member = members.find((m) => (m.userId || m.id) === uid);
        if (!member) return null;
        return {
          userId: uid,
          name: member.displayName || member.legacyName || uid,
          mode: member.attendanceMode || member.mode || "onsite",
          color: COLORS[member.colorIndex || 0],
        };
      })
      .filter(Boolean);
  }, [session.attendees, members]);

  const speakers = session.speakers || [];

  return (
    <div className="cal-detail">
      <div className="cal-detail-title-label">Session Details</div>

      <div className="cal-detail-title">{session.title}</div>
      <div className="cal-detail-meta">
        {session.room && `📍 ${session.room} · `}
        {session.date} · {session.start}–{session.end}
      </div>
      {session.format && (
        <div className="cal-detail-meta">
          {session.format}
          {session.recording === "Yes" && " · Recording: Yes"}
        </div>
      )}

      <div className="cal-detail-divider" />

      {/* Description from key themes */}
      {session.keyThemes?.length > 0 && (
        <div className="cal-detail-desc">
          {session.keyThemes.join(" · ")}
        </div>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <>
          <div className="cal-detail-section-label">Speaker{speakers.length > 1 ? "s" : ""}</div>
          {speakers.map((sp, i) => (
            <div key={i} className="cal-detail-speaker">
              {sp.name}
              {(sp.title || sp.company) && (
                <span className="cal-detail-speaker-role">
                  {" — "}
                  {[sp.title, sp.company].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {/* Also Attending */}
      {attendees.length > 0 && (
        <>
          <div className="cal-detail-section-label">Also Attending</div>
          <div className="cal-detail-attendees">
            {attendees.map((a) => (
              <div key={a.userId} className="cal-detail-attendee">
                <span className="cal-detail-attendee-name" style={{ background: a.color }}>
                  {a.name}
                </span>
                <span className="cal-detail-attendee-mode">
                  {a.mode === "online" ? "💻 online" : "🏢 onsite"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Action buttons */}
      <div className="cal-detail-actions">
        {isAttending ? (
          <button className="cal-detail-btn-primary cal-detail-btn-primary--danger" onClick={onToggleAttend}>
            Remove from Schedule
          </button>
        ) : (
          <button className="cal-detail-btn-primary" onClick={onToggleAttend}>
            Mark Attending
          </button>
        )}
        {session.url && (
          <a href={session.url} target="_blank" rel="noopener noreferrer" className="cal-detail-btn-secondary">
            🔗 View Official Session Page
          </a>
        )}
      </div>
    </div>
  );
}
