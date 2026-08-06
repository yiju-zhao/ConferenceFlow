import { useTranslation } from "react-i18next";
import { COLORS } from "../../constants";
import { SESSION_CATALOG } from "../../sessionCatalog";
import { EditableField } from "./SharedEditors";
import SessionPicker from "./SessionPicker";
import type { Member, ReportBlock, ReportSourceSession, Session } from "../../types";

export const topicSlug = (t: string) =>
  t
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export function formatOneSource(s: ReportSourceSession): string {
  if (s?.manual) return s.manual.trim();
  if (!s?.id) return "";
  const title = SESSION_CATALOG.get(s.id)?.title?.trim();
  return title ? `${s.id} · ${title}` : s.id;
}

export function normaliseSources(block: ReportBlock): ReportSourceSession[] {
  if (Array.isArray(block.sourceSessions) && block.sourceSessions.length)
    return block.sourceSessions;
  if (block.sourceSession?.id || block.sourceSession?.manual) return [block.sourceSession];
  return [];
}

interface IntelCardProps {
  block: ReportBlock;
  onUpdate: (fields: Partial<ReportBlock>) => void;
  onRemove: () => void;
  members?: Member[];
  placeholder?: string;
  readOnly?: boolean;
  currentUid?: string;
  memberColorMap: Record<string, number>;
  isAdmin?: boolean;
  conferenceSessions?: Session[];
}

export default function IntelCard({
  block,
  onUpdate,
  onRemove,
  members = [],
  placeholder,
  readOnly = false,
  currentUid,
  memberColorMap,
  isAdmin = false,
  conferenceSessions = [],
}: IntelCardProps) {
  const { t } = useTranslation();
  const ph = placeholder || t("report.recordContent");
  const sources = normaliseSources(block);
  // Normalise legacy single contributorId -> contributorIds array
  const contributorIds = block.contributorIds?.length
    ? block.contributorIds
    : block.contributorId
      ? [block.contributorId]
      : [];
  const contributorNames = contributorIds
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter(Boolean);
  const contributorText = contributorNames.join("\u3001") || (block.contributor || "").trim();

  const ownerColorIdx = block.ownerId ? (memberColorMap[block.ownerId] ?? null) : null;
  const ownerColor = ownerColorIdx !== null ? COLORS[ownerColorIdx]?.hex || "#5f5e5e" : null;
  const isOwner = currentUid && block.ownerId === currentUid;
  // Admins can edit any block, members can only edit their own
  const isEditable = !readOnly && (!block.ownerId || isOwner || isAdmin);
  // Admins can delete any block, members can only delete their own
  const canDelete = !readOnly && (!block.ownerId || isOwner || isAdmin);

  const lastEditor = block.lastEditedBy
    ? members.find((m) => m.id === block.lastEditedBy)?.name
    : null;
  const editedAgo = block.lastEditedAt
    ? Math.round((Date.now() - block.lastEditedAt) / 60000)
    : null;
  const editLabel = lastEditor
    ? editedAgo !== null && editedAgo < 60
      ? `${lastEditor} \u00b7 ${editedAgo}m ago`
      : lastEditor
    : null;

  const updateSource = (idx: number, v: ReportSourceSession) => {
    const next = [...sources];
    next[idx] = v;
    onUpdate({ sourceSessions: next, sourceSession: next[0] || null });
  };
  const removeSource = (idx: number) => {
    const next = sources.filter((_, i) => i !== idx);
    onUpdate({ sourceSessions: next, sourceSession: next[0] || null });
  };
  const addSource = () => {
    const next = [...sources, { id: null, manual: "" }];
    onUpdate({ sourceSessions: next, sourceSession: next[0] || null });
  };

  return (
    <div
      className="intel-card"
      style={ownerColor ? { borderLeft: `3px solid ${ownerColor}` } : undefined}
    >
      {canDelete && (
        <button className="onsite-block-body-remove no-print" onClick={onRemove}>
          ×
        </button>
      )}
      <div className="intel-card-section intel-card-content">
        <EditableField
          value={block.content}
          onSave={(html) => onUpdate({ content: html })}
          placeholder={ph}
          minHeight={60}
          readOnly={!isEditable}
        />
      </div>
      {sources.map((src, i) => (
        <div key={i} className="intel-card-section intel-card-meta no-print">
          <span className="intel-card-label">
            {sources.length > 1
              ? t("report.sourceWithIndex", { index: i + 1 })
              : t("report.source")}
          </span>
          <SessionPicker
            value={src}
            onChange={(v) => updateSource(i, v)}
            conferenceSessions={conferenceSessions}
          />
          {sources.length > 1 && (
            <button
              className="intel-card-source-remove"
              onClick={() => removeSource(i)}
              title={t("report.removeSource")}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {sources.length === 0 && (
        <div className="intel-card-section intel-card-meta no-print">
          <span className="intel-card-label">{t("report.source")}</span>
          <SessionPicker
            value={{ id: null, manual: "" }}
            onChange={(v) => onUpdate({ sourceSessions: [v], sourceSession: v })}
            conferenceSessions={conferenceSessions}
          />
        </div>
      )}
      <div className="intel-card-section intel-card-meta no-print">
        <button className="intel-card-add-source" onClick={addSource}>
          {t("report.addSource")}
        </button>
      </div>
      {sources.filter((s) => formatOneSource(s)).length > 0 && (
        <div className="intel-card-section intel-card-meta print-only">
          <span className="intel-card-label">{t("report.source")}</span>
          <span className="intel-card-static-value">
            {sources.map((s, i) => {
              const text = formatOneSource(s);
              if (!text) return null;
              const url = s?.id ? SESSION_CATALOG.get(s.id)?.url : null;
              const inner = (
                <>
                  {i > 0 && <span style={{ margin: "0 4px", color: "var(--text-dim)" }}>｜</span>}
                  {s?.id && <span className="session-picker-id-badge">{s.id}</span>}
                  {s?.id ? ` ${SESSION_CATALOG.get(s.id)?.title?.trim() || ""}` : text}
                </>
              );
              return url ? (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  {inner}
                </a>
              ) : (
                <span key={i}>{inner}</span>
              );
            })}
          </span>
        </div>
      )}
      <div
        className="intel-card-section intel-card-meta no-print"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <span className="intel-card-label">{t("report.contributorLabel")}</span>
        {contributorIds.map((id) => {
          const name = members.find((m) => m.id === id)?.name || id;
          const colorIdx = memberColorMap?.[id] ?? 0;
          const color = COLORS[colorIdx]?.hex || "#5f5e5e";
          return (
            <span
              key={id}
              style={{
                background: color,
                color: "#fff",
                padding: "1px 8px",
                fontSize: 10,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {name}
              {isEditable && (
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: 0,
                    lineHeight: 1,
                  }}
                  onClick={() => {
                    const next = contributorIds.filter((x) => x !== id);
                    onUpdate({
                      contributorIds: next,
                      contributorId: next[0] || "",
                      contributor: members.find((m) => m.id === next[0])?.name || "",
                    });
                  }}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        <select
          className="intel-card-contributor-select"
          value=""
          style={{
            fontSize: 10,
            color: "#888",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
          onChange={(e) => {
            const id = e.target.value;
            if (!id || contributorIds.includes(id)) return;
            const next = [...contributorIds, id];
            onUpdate({
              contributorIds: next,
              contributorId: next[0] || "",
              contributor: members.find((m) => m.id === next[0])?.name || "",
            });
          }}
        >
          <option value="">
            {contributorIds.length ? t("report.addContributor") : t("report.selectContributor")}
          </option>
          {members
            .filter((m) => !contributorIds.includes(m.id))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        {editLabel && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#bbb" }}>{editLabel}</span>
        )}
      </div>
      {contributorText && (
        <div className="intel-card-section intel-card-meta print-only">
          <span className="intel-card-label">{t("report.contributorLabel")}</span>
          <span className="intel-card-static-value">{contributorText}</span>
        </div>
      )}
    </div>
  );
}
