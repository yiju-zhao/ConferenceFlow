import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Session } from "../../types";

interface SessionPoolProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  userAttending: string[];
}

export default function SessionPool({
  sessions,
  selectedId,
  onSelect,
  userAttending,
}: SessionPoolProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");

  // Extract unique topics for filter buttons
  const topics = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.mainTopic) set.add(s.mainTopic);
      (s.keyThemes || []).forEach((t) => set.add(t));
    });
    return [...set].sort().slice(0, 8); // Top 8 topics
  }, [sessions]);

  const timeFilters = ["AM", "PM"];
  const formatFilters = ["IN-PERSON", "VIRTUAL"];

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matches =
          s.title?.toLowerCase().includes(q) ||
          s.code?.toLowerCase().includes(q) ||
          s.mainTopic?.toLowerCase().includes(q) ||
          s.speakers?.some((sp) => sp.name?.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Topic/time/format filter
      if (activeFilter !== "ALL") {
        if (activeFilter === "AM") return s.start < "12:00";
        if (activeFilter === "PM") return s.start >= "12:00";
        if (activeFilter === "IN-PERSON") return s.format?.toLowerCase().includes("person");
        if (activeFilter === "VIRTUAL") return s.format?.toLowerCase().includes("virtual");
        // Topic filter
        const topicMatch =
          s.mainTopic === activeFilter || (s.keyThemes || []).includes(activeFilter);
        if (!topicMatch) return false;
      }

      return true;
    });
  }, [sessions, search, activeFilter]);

  const attendingSet = new Set(userAttending);

  return (
    <div className="cal-pool">
      <div className="cal-pool-header">
        <div className="cal-pool-title">{t("calendar.sessionPool")}</div>
        <input
          type="text"
          className="cal-pool-search"
          placeholder={t("calendar.searchSessions")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="cal-pool-filters">
        <button
          className={`cal-pool-filter ${activeFilter === "ALL" ? "cal-pool-filter--active" : ""}`}
          onClick={() => setActiveFilter("ALL")}
        >
          {t("calendar.filterAll")}
        </button>
        {timeFilters.map((f) => (
          <button
            key={f}
            className={`cal-pool-filter ${activeFilter === f ? "cal-pool-filter--active" : ""}`}
            onClick={() => setActiveFilter(activeFilter === f ? "ALL" : f)}
          >
            {f === "AM" ? t("calendar.am") : t("calendar.pm")}
          </button>
        ))}
        {formatFilters.map((f) => (
          <button
            key={f}
            className={`cal-pool-filter ${activeFilter === f ? "cal-pool-filter--active" : ""}`}
            onClick={() => setActiveFilter(activeFilter === f ? "ALL" : f)}
          >
            {f === "IN-PERSON" ? t("calendar.inPerson") : t("calendar.virtual")}
          </button>
        ))}
        {topics.slice(0, 4).map((topic) => (
          <button
            key={topic}
            className={`cal-pool-filter ${activeFilter === topic ? "cal-pool-filter--active" : ""}`}
            onClick={() => setActiveFilter(activeFilter === topic ? "ALL" : topic)}
          >
            {topic.length > 12 ? topic.slice(0, 12) + "…" : topic}
          </button>
        ))}
      </div>

      <div className="cal-pool-list">
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`cal-pool-card ${s.id === selectedId ? "cal-pool-card--selected" : ""} ${attendingSet.has(s.id) ? "cal-pool-card--scheduled" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="cal-pool-card-title">{s.title}</div>
            <div className="cal-pool-card-meta">
              {s.code && `${s.code} · `}
              {s.date} {s.start}–{s.end}
              {s.room && ` · ${s.room}`}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div
            style={{
              color: "#7A7670",
              fontSize: 14,
              textAlign: "center",
              padding: 20,
            }}
          >
            {search ? t("calendar.noSessionsMatch") : t("calendar.noSessionsAvailable")}
          </div>
        )}
      </div>
    </div>
  );
}
