import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../constants";

export default function SessionDetail({ session, members, isAttending, onToggleAttend }) {
  const { t } = useTranslation();
  if (!session) {
    return (
      <div className="cal-detail">
        <div className="cal-detail-empty-state">
          <div className="cal-detail-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7A7670" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="cal-detail-empty-text">{t('calendar.selectSession')}</div>
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
          initials: (member.displayName || member.legacyName || uid).slice(0, 1).toUpperCase(),
        };
      })
      .filter(Boolean);
  }, [session.attendees, members]);

  const speakers = session.speakers || [];

  return (
    <div className="cal-detail">
      {/* ── Sticky Action Bar ──────────────────────────────── */}
      <div className="cal-detail-action-bar">
        {isAttending ? (
          <button className="cal-detail-btn-primary cal-detail-btn-primary--danger" onClick={onToggleAttend}>
            {t('calendar.removeFromSchedule')}
          </button>
        ) : (
          <button className="cal-detail-btn-primary" onClick={onToggleAttend}>
            {t('calendar.markAttending')}
          </button>
        )}
      </div>

      {/* ── Title Block ────────────────────────────────────── */}
      <div className="cal-detail-title-block">
        {session.code && <span className="cal-detail-code">{session.code}</span>}
        <h2 className="cal-detail-title">{session.title}</h2>
      </div>

      {/* ── Quick Info Chips ───────────────────────────────── */}
      <div className="cal-detail-chips">
        <div className="cal-detail-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{session.date} &middot; {session.start}–{session.end}</span>
        </div>
        {session.room && (
          <div className="cal-detail-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>{session.room}</span>
          </div>
        )}
        {session.format && (
          <div className="cal-detail-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>{session.format}</span>
          </div>
        )}
        {session.recording === "Yes" && (
          <div className="cal-detail-chip cal-detail-chip--accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{t('calendar.recording')}</span>
          </div>
        )}
      </div>

      {/* ── Themes / Topics ────────────────────────────────── */}
      {session.keyThemes?.length > 0 && (
        <div className="cal-detail-section">
          <div className="cal-detail-section-label">{t('calendar.topics')}</div>
          <div className="cal-detail-tags">
            {session.keyThemes.map((theme, i) => (
              <span key={i} className="cal-detail-tag">{theme}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Speakers ───────────────────────────────────────── */}
      {speakers.length > 0 && (
        <div className="cal-detail-section">
          <div className="cal-detail-section-label">
            {speakers.length > 1 ? t('calendar.speakers') : t('calendar.speaker')}
          </div>
          <div className="cal-detail-speakers">
            {speakers.map((sp, i) => (
              <div key={i} className="cal-detail-speaker-card">
                <div className="cal-detail-speaker-name">{sp.name}</div>
                {(sp.title || sp.company) && (
                  <div className="cal-detail-speaker-role">
                    {[sp.title, sp.company].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Attendees ──────────────────────────────────────── */}
      {attendees.length > 0 && (
        <div className="cal-detail-section">
          <div className="cal-detail-section-label">
            {t('calendar.attending')}
            <span className="cal-detail-count">{attendees.length}</span>
          </div>
          <div className="cal-detail-attendees">
            {attendees.map((a) => (
              <div key={a.userId} className="cal-detail-attendee">
                <div className="cal-detail-attendee-avatar" style={{ background: a.color }}>
                  {a.initials}
                </div>
                <div className="cal-detail-attendee-info">
                  <span className="cal-detail-attendee-name">{a.name}</span>
                  <span className={`cal-detail-attendee-badge cal-detail-attendee-badge--${a.mode === "online" ? "online" : "onsite"}`}>
                    {a.mode === "online" ? t('dashboard.online') : t('dashboard.onsite')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── External Link ──────────────────────────────────── */}
      {session.url && (
        <div className="cal-detail-section">
          <a href={session.url} target="_blank" rel="noopener noreferrer" className="cal-detail-btn-secondary">
            {t('calendar.viewOfficialPage')}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
