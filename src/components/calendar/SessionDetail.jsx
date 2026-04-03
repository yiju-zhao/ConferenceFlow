import { useMemo } from "react";
import { COLORS } from "../../constants";

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
          color: COLORS[(member.colorIndex || 0) % COLORS.length].hex,
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
                <span className="cal-detail-attendee-mode" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {a.mode === "online" ? (
                    <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2980B9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="0"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> online</>
                  ) : (
                    <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> onsite</>
                  )}
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
