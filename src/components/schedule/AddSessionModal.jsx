import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SESSION_CATALOG } from "../../sessionCatalog";

export default function AddSessionModal({ sessions, onAdd, onClose }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return [...SESSION_CATALOG.values()]
      .filter(
        (s) =>
          s.session_id.toUpperCase().includes(q) ||
          s.title.toLowerCase().includes(query.trim().toLowerCase()),
      )
      .slice(0, 20);
  }, [query]);

  return (
    <div onClick={onClose} className="add-session-overlay">
      <div onClick={(e) => e.stopPropagation()} className="add-session-modal">
        {/* Header */}
        <div className="add-session-header">
          <div className="add-session-header-bar">
            <span className="add-session-header-title">
              {t("calendar.addSession")}
            </span>
            <button onClick={onClose} className="add-session-close">
              ×
            </button>
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("calendar.searchSessionPlaceholder")}
            className="add-session-input"
          />
        </div>

        {/* Results */}
        <div className="add-session-results">
          {!query.trim() ? (
            <div className="add-session-empty">
              {t("calendar.searchSessionPlaceholder")}
            </div>
          ) : results.length === 0 ? (
            <div className="add-session-empty">
              {t("calendar.noMatchingSession")}
            </div>
          ) : (
            results.map((s) => {
              const alreadyAdded = !!sessions[s.session_id];
              return (
                <div key={s.session_id} className="add-session-result">
                  <span className="font-mono add-session-result-id">
                    {s.session_id}
                  </span>
                  <div className="add-session-result-info">
                    <div className="add-session-result-title">{s.title}</div>
                    <div className="add-session-result-meta">
                      {s.date}
                      {s.time
                        ? ` · ${s.time.replace(/\s*(PDT|PST|EST|EDT)\s*/i, "").trim()}`
                        : ""}
                    </div>
                  </div>
                  {alreadyAdded ? (
                    <span
                      className="font-mono schedule-badge"
                      style={{ flexShrink: 0 }}
                    >
                      {t("calendar.alreadyAdded")}
                    </span>
                  ) : (
                    <button
                      onClick={() => onAdd(s.session_id)}
                      className="btn-accent"
                      style={{
                        fontSize: 11,
                        padding: "3px 12px",
                        flexShrink: 0,
                      }}
                    >
                      {t("common.add")}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
