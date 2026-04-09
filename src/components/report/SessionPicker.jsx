import { useState, useEffect, useMemo } from "react";
import { SESSION_CATALOG } from "../../sessionCatalog";
import { useTranslation } from "react-i18next";

export default function SessionPicker({
  value,
  onChange,
  conferenceSessions = [],
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  // Look up title from conference sessions first, then fall back to SESSION_CATALOG
  const findSession = (id) =>
    conferenceSessions.find((s) => s.code === id || s.id === id) ||
    SESSION_CATALOG.get(id);
  const selectedTitle = value?.id
    ? findSession(value.id)?.title || value.id
    : null;

  const results = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    const source =
      conferenceSessions.length > 0
        ? conferenceSessions.map((s) => ({
            session_id: s.code || s.id,
            title: s.title,
          }))
        : [...SESSION_CATALOG.values()];
    return source
      .filter(
        (s) =>
          (s.session_id || "").toLowerCase().includes(ql) ||
          (s.title || "").toLowerCase().includes(ql),
      )
      .slice(0, 20);
  }, [debouncedQuery, conferenceSessions]);

  const handleSelect = (s) => {
    onChange({ id: s.session_id, manual: "" });
    setQuery("");
    setShowDropdown(false);
  };

  const handleClear = () => {
    onChange({ id: null, manual: "" });
    setQuery("");
    setShowDropdown(false);
  };

  const handleBlur = (e) => {
    // Delay so click on results fires first
    setTimeout(() => setShowDropdown(false), 150);
    if (query.trim() && !value?.id) {
      onChange({ id: null, manual: query.trim() });
    }
  };

  if (selectedTitle) {
    return (
      <div className="session-picker">
        <span className="session-picker-selected">
          {value.id && (
            <span className="session-picker-id-badge">{value.id}</span>
          )}
          {selectedTitle}
        </span>
        <button
          className="session-picker-clear"
          onClick={handleClear}
          title={t("report.clear")}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="session-picker">
      <input
        className="session-picker-input"
        type="text"
        placeholder={value?.manual || t("report.searchSession")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={handleBlur}
      />
      {value?.manual && !query && (
        <button
          className="session-picker-clear"
          onClick={handleClear}
          title={t("report.clear")}
        >
          ×
        </button>
      )}
      {showDropdown && results.length > 0 && (
        <div className="session-picker-dropdown">
          {results.map((s) => (
            <div
              key={s.session_id}
              className="session-picker-result"
              onMouseDown={() => handleSelect(s)}
            >
              <span className="session-picker-result-id">{s.session_id}</span>
              <span className="session-picker-result-title">{s.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
