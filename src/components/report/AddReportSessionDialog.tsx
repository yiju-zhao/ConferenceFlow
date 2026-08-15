import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mySessions, sessionKey } from "../../lib/ai-report/sessionSelection";
import type { Session } from "../../types";

interface AddReportSessionDialogProps {
  open: boolean;
  sessions: Session[];
  selectedIds: Set<string>;
  currentUid: string;
  onAdd: (sessionId: string) => void;
  onClose: () => void;
}

export default function AddReportSessionDialog({
  open,
  sessions,
  selectedIds,
  currentUid,
  onAdd,
  onClose,
}: AddReportSessionDialogProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<"mine" | "all">("mine");
  const [query, setQuery] = useState("");
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setView("mine");
      setQuery("");
    }
    wasOpen.current = open;
  }, [open]);

  const results = useMemo(() => {
    const available = sessions.filter((session) => !selectedIds.has(sessionKey(session)));
    if (view === "mine") return mySessions(available, currentUid);

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return available;
    return available.filter((session) => {
      const searchable = [
        session.code,
        session.title,
        session.date,
        session.room,
        ...(session.speakers || []).flatMap((speaker) => [
          speaker.name,
          speaker.title,
          speaker.company,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [currentUid, query, selectedIds, sessions, view]);

  if (!open) return null;

  return (
    <div className="add-session-overlay" onClick={onClose}>
      <div
        className="add-session-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("report.addSession")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="add-session-header">
          <div className="add-session-header-bar">
            <h3 className="add-session-header-title">{t("report.addSession")}</h3>
            <button
              className="add-session-close report-editor-touch-target"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
          <div aria-label={t("report.addSession")}>
            <button
              className="report-editor-touch-target"
              aria-pressed={view === "mine"}
              onClick={() => setView("mine")}
            >
              {t("report.mySessions")}
            </button>
            <button
              className="report-editor-touch-target"
              aria-pressed={view === "all"}
              onClick={() => setView("all")}
            >
              {t("report.allSessions")}
            </button>
          </div>
          {view === "all" && (
            <input
              className="add-session-input"
              type="search"
              role="searchbox"
              aria-label={t("report.searchAllSessions")}
              placeholder={t("report.searchAllSessions")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
        </div>
        <div className="add-session-results">
          {results.length === 0 ? (
            <p className="add-session-empty">{t("report.noMatchingSessions")}</p>
          ) : (
            results.map((session) => {
              const key = sessionKey(session);
              return (
                <div className="add-session-result" key={key}>
                  <span className="add-session-result-id">{key}</span>
                  <div className="add-session-result-info">
                    <div className="add-session-result-title">{session.title}</div>
                    <div className="add-session-result-meta">
                      {session.date} {session.start}–{session.end}
                      {session.room ? ` · ${session.room}` : ""}
                    </div>
                  </div>
                  <button
                    className="report-editor-touch-target"
                    onClick={() => onAdd(key)}
                    aria-label={`${t("common.add")} ${session.title}`}
                  >
                    {t("common.add")}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
