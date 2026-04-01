import { useMemo } from "react";

// Generate hour slots from earliest to latest session
function getTimeSlots(sessions) {
  if (sessions.length === 0) return [];
  let minH = 24, maxH = 0;
  sessions.forEach((s) => {
    const sh = parseInt(s.start?.split(":")[0] || "9");
    const eh = parseInt(s.end?.split(":")[0] || "10");
    if (sh < minH) minH = sh;
    if (eh > maxH) maxH = eh;
  });
  const slots = [];
  for (let h = minH; h <= maxH; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

export default function ScheduleGrid({ sessions, selectedId, onSelect, members }) {
  // Only show user's scheduled sessions
  const { days, timeSlots, grid } = useMemo(() => {
    if (sessions.length === 0) return { days: [], timeSlots: [], grid: {} };

    // Get unique dates sorted
    const daySet = new Set(sessions.map((s) => s.date));
    const days = [...daySet].sort();

    const timeSlots = getTimeSlots(sessions);

    // Build grid: { "date|hour" : [sessions] }
    const grid = {};
    sessions.forEach((s) => {
      const hour = s.start?.split(":")[0] + ":00";
      const key = `${s.date}|${hour}`;
      if (!grid[key]) grid[key] = [];
      grid[key].push(s);
    });

    return { days, timeSlots, grid };
  }, [sessions]);

  // Map member userId → color + initials
  const memberColors = useMemo(() => {
    const COLORS = ["#CF0A2C", "#2980B9", "#E67E22", "#8E44AD", "#27AE60", "#2C3E50"];
    const map = {};
    members.forEach((m) => {
      map[m.userId || m.id] = {
        color: COLORS[m.colorIndex || 0],
        initials: (m.displayName || m.legacyName || m.userId || "?").slice(0, 1).toUpperCase(),
      };
    });
    return map;
  }, [members]);

  if (sessions.length === 0) {
    return (
      <div className="cal-grid">
        <div className="cal-grid-label">Your Schedule</div>
        <div className="cal-grid-empty">
          <div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No sessions scheduled</div>
            <div style={{ fontSize: 11 }}>Browse the session pool and mark sessions to attend</div>
          </div>
        </div>
      </div>
    );
  }

  const colCount = days.length;

  return (
    <div className="cal-grid">
      <div className="cal-grid-label">Your Schedule</div>
      <div
        className="cal-grid-table"
        style={{ gridTemplateColumns: `60px repeat(${colCount}, 1fr)` }}
      >
        {/* Day headers */}
        <div style={{ background: "transparent" }} />
        {days.map((day) => {
          const d = new Date(day + "T00:00:00");
          const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div key={day} className="cal-grid-day-header">
              {label}
            </div>
          );
        })}

        {/* Time rows */}
        {timeSlots.map((slot) => (
          <>
            <div key={`t-${slot}`} className="cal-grid-time-label">{slot}</div>
            {days.map((day) => {
              const key = `${day}|${slot}`;
              const cellSessions = grid[key] || [];
              return (
                <div key={key} className="cal-grid-cell">
                  {cellSessions.length > 0 && (
                    <div className="cal-grid-cell-sessions">
                      {cellSessions.map((s) => (
                        <div
                          key={s.id}
                          className={`cal-grid-session ${s.id === selectedId ? "cal-grid-session--selected" : ""}`}
                          onClick={() => onSelect(s.id)}
                        >
                          <div className="cal-grid-session-time">
                            {s.start}–{s.end}
                          </div>
                          <div className="cal-grid-session-title">{s.title}</div>
                          {/* Teammate avatars */}
                          {(s.attendees || []).length > 0 && (
                            <div className="cal-grid-session-avatars">
                              {(s.attendees || []).slice(0, 5).map((uid) => {
                                const mc = memberColors[uid];
                                if (!mc) return null;
                                return (
                                  <div
                                    key={uid}
                                    className="cal-grid-avatar"
                                    style={{ background: mc.color }}
                                  >
                                    {mc.initials}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
