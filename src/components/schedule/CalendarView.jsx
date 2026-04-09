import React from "react";
import { ChevronRight, CalendarDays, Clock } from "lucide-react";
import { parseTimeToMinutes, formatHourBucket } from "../../lib/timeUtils";
import CalendarSessionCard from "./CalendarSessionCard";

export default function CalendarView({
  groupedSessions,
  members,
  toggleAttendance,
  user,
  collapsedDates,
  toggleDateCollapse,
}) {
  return (
    <div className="calendar-view">
      {groupedSessions.map(({ date, sessions: dateSessions }) => {
        // Group sessions into hourly buckets by start time
        const buckets = {};
        dateSessions.forEach((s) => {
          const key = Math.floor(parseTimeToMinutes(s.start) / 60) * 60;
          if (!buckets[key]) buckets[key] = [];
          buckets[key].push(s);
        });
        const sortedBuckets = Object.entries(buckets).sort(
          ([a], [b]) => Number(a) - Number(b),
        );
        const isCollapsed = collapsedDates.has(date);

        return (
          <div key={date}>
            {/* Date header */}
            <div
              onClick={() => toggleDateCollapse(date)}
              className="calendar-date-header"
            >
              <ChevronRight
                size={13}
                color="var(--brand)"
                style={{
                  transition: "transform 0.2s",
                  transform: isCollapsed ? "none" : "rotate(90deg)",
                  flexShrink: 0,
                }}
              />
              <CalendarDays size={13} color="var(--brand)" />
              <span className="calendar-date-text">{date}</span>
              <span className="font-mono calendar-date-count">
                {dateSessions.length} sessions
              </span>
            </div>

            {/* Hourly time slot groups */}
            {!isCollapsed &&
              sortedBuckets.map(([bucketKey, slotSessions]) => (
                <div key={bucketKey} className="calendar-time-slot">
                  {/* Slot header */}
                  <div className="calendar-time-label">
                    <Clock size={11} color="var(--brand)" />
                    <span className="font-mono calendar-time-text">
                      {formatHourBucket(Number(bucketKey))}
                    </span>
                    <span className="font-mono calendar-time-count">
                      {slotSessions.length}
                    </span>
                    <div className="calendar-time-divider" />
                  </div>
                  {/* Session cards */}
                  <div className="calendar-session-list">
                    {slotSessions.map((s) => (
                      <CalendarSessionCard
                        key={s.code}
                        session={s}
                        members={members}
                        toggleAttendance={toggleAttendance}
                        user={user}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
