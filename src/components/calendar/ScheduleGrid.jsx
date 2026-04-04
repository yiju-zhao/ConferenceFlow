import { useMemo, useState } from "react";
import { COLORS } from "../../constants";

const PX_PER_MINUTE = 2.5; // 150px per hour
const DAYS_PER_PAGE = 3;

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Column-packing algorithm for overlapping sessions.
 * Groups overlapping sessions together, assigns columns per group.
 * Returns sessions annotated with { colIndex, totalCols }.
 */
function computeColumns(sessions) {
  if (sessions.length === 0) return [];
  const sorted = [...sessions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  // Step 1: Find overlap groups
  const groups = []; // array of { sessions: [], groupEnd: number }
  for (const s of sorted) {
    const sStart = timeToMinutes(s.start);
    const sEnd = timeToMinutes(s.end);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && sStart < lastGroup.groupEnd) {
      // Overlaps with current group
      lastGroup.sessions.push(s);
      lastGroup.groupEnd = Math.max(lastGroup.groupEnd, sEnd);
    } else {
      // New group
      groups.push({ sessions: [s], groupEnd: sEnd });
    }
  }

  // Step 2: Assign columns within each group
  const result = [];
  for (const group of groups) {
    const cols = []; // array of lastEnd per column
    const placements = [];
    for (const s of group.sessions) {
      const sStart = timeToMinutes(s.start);
      const sEnd = timeToMinutes(s.end);
      let placed = false;
      for (let i = 0; i < cols.length; i++) {
        if (sStart >= cols[i]) {
          cols[i] = sEnd;
          placements.push({ session: s, colIndex: i });
          placed = true;
          break;
        }
      }
      if (!placed) {
        cols.push(sEnd);
        placements.push({ session: s, colIndex: cols.length - 1 });
      }
    }
    const totalCols = cols.length;
    placements.forEach((p) => result.push({ ...p, totalCols }));
  }

  return result;
}

export default function ScheduleGrid({ sessions, selectedId, onSelect, members }) {
  const { days, hourLabels, dayStartMin, dayEndMin, daySessionMap } = useMemo(() => {
    if (sessions.length === 0) return { days: [], hourLabels: [], dayStartMin: 0, dayEndMin: 0, daySessionMap: {} };

    const daySet = new Set(sessions.map((s) => s.date));
    const days = [...daySet].sort();

    // Find global time range
    let globalMinH = 24, globalMaxH = 0;
    sessions.forEach((s) => {
      const sh = parseInt(s.start?.split(":")[0] || "9");
      const eh = Math.ceil(timeToMinutes(s.end) / 60);
      if (sh < globalMinH) globalMinH = sh;
      if (eh > globalMaxH) globalMaxH = eh;
    });

    const dayStartMin = globalMinH * 60;
    const dayEndMin = globalMaxH * 60;

    // Hour labels
    const hourLabels = [];
    for (let h = globalMinH; h <= globalMaxH; h++) {
      hourLabels.push(`${String(h).padStart(2, "0")}:00`);
    }

    // Group sessions by day
    const daySessionMap = {};
    days.forEach((d) => {
      daySessionMap[d] = sessions.filter((s) => s.date === d);
    });

    return { days, hourLabels, dayStartMin, dayEndMin, daySessionMap };
  }, [sessions]);

  const memberColors = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      map[m.userId || m.id] = {
        color: COLORS[(m.colorIndex || 0) % COLORS.length].hex,
        initials: (m.displayName || m.legacyName || m.userId || "?").slice(0, 1).toUpperCase(),
      };
    });
    return map;
  }, [members]);

  const [dayPage, setDayPage] = useState(0);

  if (sessions.length === 0) {
    return (
      <div className="cal-grid">
        <div className="cal-grid-label">Your Schedule</div>
        <div className="cal-grid-empty">
          <div>
            <div style={{ fontSize: 18, marginBottom: 8, color: "#A9A5A0" }}>No sessions scheduled</div>
            <div style={{ fontSize: 13 }}>Browse the session pool and mark sessions to attend</div>
          </div>
        </div>
      </div>
    );
  }
  const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MINUTE;

  // Paginate days
  const totalPages = Math.ceil(days.length / DAYS_PER_PAGE);
  const visibleDays = days.slice(dayPage * DAYS_PER_PAGE, (dayPage + 1) * DAYS_PER_PAGE);
  const hasPrev = dayPage > 0;
  const hasNext = dayPage < totalPages - 1;

  return (
    <div className="cal-grid">
      <div className="cal-grid-label">Your Schedule</div>

      {/* Day headers with pagination */}
      <div style={{ display: "flex", marginBottom: 1, alignItems: "center" }}>
        <div style={{ width: 56, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
          {hasPrev ? (
            <button onClick={() => setDayPage(dayPage - 1)}
              style={{ background: "none", border: "none", color: "#E8976B", cursor: "pointer", fontSize: 16, fontWeight: 700, padding: 0 }}>
              ←
            </button>
          ) : <span />}
          {hasNext ? (
            <button onClick={() => setDayPage(dayPage + 1)}
              style={{ background: "none", border: "none", color: "#E8976B", cursor: "pointer", fontSize: 16, fontWeight: 700, padding: 0 }}>
              →
            </button>
          ) : <span />}
        </div>
        {visibleDays.map((day) => {
          const d = new Date(day + "T00:00:00");
          const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          return (
            <div key={day} className="cal-grid-day-header" style={{ flex: 1 }}>
              {label}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div style={{ display: "flex" }}>
        {/* Hour labels column */}
        <div style={{ width: 56, flexShrink: 0, position: "relative", height: totalHeight }}>
          {hourLabels.map((label) => {
            const h = parseInt(label.split(":")[0]);
            const top = (h * 60 - dayStartMin) * PX_PER_MINUTE;
            return (
              <div key={label} style={{ position: "absolute", top, right: 6, fontSize: 12, color: "#7A7670", fontFamily: "Inter, sans-serif" }}>
                {label}
              </div>
            );
          })}
        </div>

        {/* Day columns (visible page only) */}
        {visibleDays.map((day) => {
          const daySessions = daySessionMap[day] || [];
          const placed = computeColumns(daySessions);

          return (
            <div key={day} style={{ flex: 1, position: "relative", height: totalHeight, background: "#272C35", marginLeft: 1 }}>
              {/* Hour grid lines */}
              {hourLabels.map((label) => {
                const h = parseInt(label.split(":")[0]);
                const top = (h * 60 - dayStartMin) * PX_PER_MINUTE;
                return (
                  <div key={label} style={{ position: "absolute", top, left: 0, right: 0, borderTop: "1px solid #333840", pointerEvents: "none" }} />
                );
              })}

              {/* Session blocks */}
              {placed.map(({ session: s, colIndex, totalCols }) => {
                const startMin = timeToMinutes(s.start);
                const endMin = timeToMinutes(s.end);
                const top = (startMin - dayStartMin) * PX_PER_MINUTE;
                const height = Math.max((endMin - startMin) * PX_PER_MINUTE, 24);
                const left = `${(colIndex / totalCols) * 100}%`;
                const width = `calc(${100 / totalCols}% - 2px)`;

                return (
                  <div
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    style={{
                      position: "absolute", top, left, width, height,
                      background: "#E8976B", padding: "6px 10px", cursor: "pointer",
                      overflow: "hidden", transition: "opacity 120ms ease", boxSizing: "border-box",
                      borderRadius: 3,
                      outline: s.id === selectedId ? "2px solid #fff" : "none",
                      outlineOffset: s.id === selectedId ? -2 : 0,
                      zIndex: s.id === selectedId ? 10 : 1,
                      display: "flex", flexDirection: "column",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)", flexShrink: 0 }}>
                      {s.start}–{s.end}
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflow: "hidden", marginTop: 3 }}>
                      <div style={{ fontSize: 13, color: "#fff", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {s.title}
                      </div>
                    </div>
                    {(s.attendees || []).length > 0 && (
                      <div style={{ display: "flex", gap: 2, marginTop: "auto", paddingTop: 3, flexShrink: 0 }}>
                        {(s.attendees || []).slice(0, 4).map((uid) => {
                          const mc = memberColors[uid];
                          if (!mc) return null;
                          return (
                            <div key={uid} style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", background: mc.color, borderRadius: 2 }}>
                              {mc.initials}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
