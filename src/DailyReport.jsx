import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, storage } from "./firebase";
import { useAuth } from "./contexts/AuthContext";
import { useMembership } from "./hooks/useMembership";
import { ref, uploadString, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { COLORS, COLOR_PRESETS } from "./constants";
import { SESSION_CATALOG } from "./sessionCatalog";
import { parseReportId, generateId } from "./lib/reportUtils";
import { useDebouncedSave } from "./hooks/useDebouncedSave";
import { EditableField, InlineAddButton, BulletEditor } from "./shared";
import { usePresence } from "./components/report/usePresence";
import PresenceBar from "./components/report/PresenceBar";
const topicSlug = (t) =>
  t.replace(/[^\w\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

function formatOneSource(s) {
  if (s?.manual) return s.manual.trim();
  if (!s?.id) return "";
  const title = SESSION_CATALOG.get(s.id)?.title?.trim();
  return title ? `${s.id} · ${title}` : s.id;
}

function normaliseSources(block) {
  if (Array.isArray(block.sourceSessions) && block.sourceSessions.length) return block.sourceSessions;
  if (block.sourceSession?.id || block.sourceSession?.manual) return [block.sourceSession];
  return [];
}

// ── SessionPicker ─────────────────────────────────────────────────────────────
function SessionPicker({ value, onChange, conferenceSessions = [] }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  // Look up title from conference sessions first, then fall back to SESSION_CATALOG
  const findSession = (id) => conferenceSessions.find(s => s.code === id || s.id === id) || SESSION_CATALOG.get(id);
  const selectedTitle = value?.id ? (findSession(value.id)?.title || value.id) : null;

  const results = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    const source = conferenceSessions.length > 0
      ? conferenceSessions.map(s => ({ session_id: s.code || s.id, title: s.title }))
      : [...SESSION_CATALOG.values()];
    return source
      .filter(s =>
        (s.session_id || "").toLowerCase().includes(ql) ||
        (s.title || "").toLowerCase().includes(ql)
      )
      .slice(0, 20);
  }, [debouncedQuery, conferenceSessions]);

  const handleSelect = (s) => {
    onChange({ id: s.session_id, manual: '' });
    setQuery('');
    setShowDropdown(false);
  };

  const handleClear = () => {
    onChange({ id: null, manual: '' });
    setQuery('');
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
          {value.id && <span className="session-picker-id-badge">{value.id}</span>}
          {selectedTitle}
        </span>
        <button className="session-picker-clear" onClick={handleClear} title="清除">×</button>
      </div>
    );
  }

  return (
    <div className="session-picker">
      <input
        className="session-picker-input"
        type="text"
        placeholder={value?.manual || "搜索 session 或输入自定义文字..."}
        value={query}
        onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        onBlur={handleBlur}
      />
      {value?.manual && !query && (
        <button className="session-picker-clear" onClick={handleClear} title="清除">×</button>
      )}
      {showDropdown && results.length > 0 && (
        <div className="session-picker-dropdown">
          {results.map(s => (
            <div key={s.session_id} className="session-picker-result" onMouseDown={() => handleSelect(s)}>
              <span className="session-picker-result-id">{s.session_id}</span>
              <span className="session-picker-result-title">{s.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── IntelCard ─────────────────────────────────────────────────────────────────
function IntelCard({ block, onUpdate, onRemove, members = [], placeholder = "记录内容...", readOnly = false, currentUid, memberColorMap, isAdmin = false, conferenceSessions = [] }) {
  const sources = normaliseSources(block);
  // Normalise legacy single contributorId → contributorIds array
  const contributorIds = block.contributorIds?.length
    ? block.contributorIds
    : block.contributorId ? [block.contributorId] : [];
  const contributorNames = contributorIds.map(id => members.find(m => m.id === id)?.name).filter(Boolean);
  const contributorText = contributorNames.join("、") || (block.contributor || "").trim();

  const ownerColorIdx = memberColorMap?.[block.ownerId] ?? null;
  const ownerColor = ownerColorIdx !== null ? (COLORS[ownerColorIdx]?.hex || "#5f5e5e") : null;
  const isOwner = currentUid && block.ownerId === currentUid;
  // Admins can edit any block, members can only edit their own
  const isEditable = !readOnly && (!block.ownerId || isOwner || isAdmin);
  // Admins can delete any block, members can only delete their own
  const canDelete = !readOnly && (!block.ownerId || isOwner || isAdmin);

  const lastEditor = block.lastEditedBy ? members.find(m => m.id === block.lastEditedBy)?.name : null;
  const editedAgo = block.lastEditedAt ? Math.round((Date.now() - block.lastEditedAt) / 60000) : null;
  const editLabel = lastEditor
    ? (editedAgo !== null && editedAgo < 60 ? `${lastEditor} · ${editedAgo}m ago` : lastEditor)
    : null;

  const updateSource = (idx, v) => {
    const next = [...sources];
    next[idx] = v;
    onUpdate({ sourceSessions: next, sourceSession: next[0] || null });
  };
  const removeSource = (idx) => {
    const next = sources.filter((_, i) => i !== idx);
    onUpdate({ sourceSessions: next, sourceSession: next[0] || null });
  };
  const addSource = () => {
    const next = [...sources, { id: null, manual: '' }];
    onUpdate({ sourceSessions: next, sourceSession: next[0] || null });
  };

  return (
    <div className="intel-card" style={ownerColor ? { borderLeft: `3px solid ${ownerColor}` } : undefined}>
      {canDelete && <button className="onsite-block-body-remove no-print" onClick={onRemove}>×</button>}
      <div className="intel-card-section intel-card-content">
        <EditableField
          value={block.content}
          onSave={html => onUpdate({ content: html })}
          placeholder={placeholder}
          minHeight={60}
          readOnly={!isEditable}
        />
      </div>
      {sources.map((src, i) => (
        <div key={i} className="intel-card-section intel-card-meta no-print">
          <span className="intel-card-label">来源{sources.length > 1 ? ` ${i + 1}` : ''}</span>
          <SessionPicker value={src} onChange={v => updateSource(i, v)} conferenceSessions={conferenceSessions} />
          {sources.length > 1 && (
            <button className="intel-card-source-remove" onClick={() => removeSource(i)} title="移除此来源">×</button>
          )}
        </div>
      ))}
      {sources.length === 0 && (
        <div className="intel-card-section intel-card-meta no-print">
          <span className="intel-card-label">来源</span>
          <SessionPicker value={{ id: null, manual: '' }} onChange={v => onUpdate({ sourceSessions: [v], sourceSession: v })} conferenceSessions={conferenceSessions} />
        </div>
      )}
      <div className="intel-card-section intel-card-meta no-print">
        <button className="intel-card-add-source" onClick={addSource}>+ 添加来源</button>
      </div>
      {sources.filter(s => formatOneSource(s)).length > 0 && (
        <div className="intel-card-section intel-card-meta print-only">
          <span className="intel-card-label">来源</span>
          <span className="intel-card-static-value">
            {sources.map((s, i) => {
              const text = formatOneSource(s);
              if (!text) return null;
              const url = s?.id ? SESSION_CATALOG.get(s.id)?.url : null;
              const inner = (
                <>
                  {i > 0 && <span style={{ margin: "0 4px", color: "var(--text-dim)" }}>｜</span>}
                  {s?.id && <span className="session-picker-id-badge">{s.id}</span>}
                  {s?.id ? ` ${SESSION_CATALOG.get(s.id)?.title?.trim() || ''}` : text}
                </>
              );
              return url
                ? <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{inner}</a>
                : <span key={i}>{inner}</span>;
            })}
          </span>
        </div>
      )}
      <div className="intel-card-section intel-card-meta no-print" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="intel-card-label">贡献人</span>
        {contributorIds.map(id => {
          const name = members.find(m => m.id === id)?.name || id;
          const colorIdx = memberColorMap?.[id] ?? 0;
          const color = COLORS[colorIdx]?.hex || "#5f5e5e";
          return (
            <span key={id} style={{ background: color, color: "#fff", padding: "1px 8px", fontSize: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
              {name}
              {isEditable && (
                <button style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}
                  onClick={() => {
                    const next = contributorIds.filter(x => x !== id);
                    onUpdate({ contributorIds: next, contributorId: next[0] || "", contributor: members.find(m => m.id === next[0])?.name || "" });
                  }}>×</button>
              )}
            </span>
          );
        })}
        <select
          className="intel-card-contributor-select"
          value=""
          style={{ fontSize: 10, color: "#888", background: "none", border: "none", cursor: "pointer" }}
          onChange={e => {
            const id = e.target.value;
            if (!id || contributorIds.includes(id)) return;
            const next = [...contributorIds, id];
            onUpdate({ contributorIds: next, contributorId: next[0] || "", contributor: members.find(m => m.id === next[0])?.name || "" });
          }}
        >
          <option value="">{contributorIds.length ? "添加..." : "选择贡献人..."}</option>
          {members.filter(m => !contributorIds.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {editLabel && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#bbb" }}>{editLabel}</span>
        )}
      </div>
      {contributorText && (
        <div className="intel-card-section intel-card-meta print-only">
          <span className="intel-card-label">贡献人</span>
          <span className="intel-card-static-value">{contributorText}</span>
        </div>
      )}
    </div>
  );
}

// ── SpeakersEditor ───────────────────────────────────────────────────────────
function SpeakersEditor({ speakers, onUpdate, onAdd, onRemove, readOnly = false }) {
  if (readOnly) {
    return (
      <div>
        {speakers.map((spk, idx) => (
          <div key={idx} className="speaker-block">
            <div className="speaker-print-text" style={{ display: "block" }}>
              {[spk.name, spk.position, spk.company].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {speakers.map((spk, idx) => (
        <div key={idx} className="speaker-block">
          <div className="speaker-fields no-print">
            <SpeakerInput
              value={spk.name}
              placeholder="演讲者姓名"
              onChange={v => {
                const updated = speakers.map((s, i) => i === idx ? { ...s, name: v } : s);
                onUpdate(updated);
              }}
            />
            <SpeakerInput
              value={spk.position}
              placeholder="职位"
              onChange={v => {
                const updated = speakers.map((s, i) => i === idx ? { ...s, position: v } : s);
                onUpdate(updated);
              }}
            />
            <SpeakerInput
              value={spk.company}
              placeholder="公司"
              onChange={v => {
                const updated = speakers.map((s, i) => i === idx ? { ...s, company: v } : s);
                onUpdate(updated);
              }}
            />
            {speakers.length > 1 && (
              <button
                className="no-print"
                onClick={() => onRemove(idx)}
                title="删除此演讲者"
                style={{
                  background: "none", border: "none", color: "var(--brand)",
                  cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
          {/* Print view: plain text */}
          <div className="speaker-print-text print-only">
            {[spk.name, spk.position, spk.company].filter(Boolean).join(" · ")}
          </div>
        </div>
      ))}
      <button
        className="no-print"
        onClick={onAdd}
        style={{
          background: "none", border: "1px dashed var(--brand)", color: "var(--brand)",
          cursor: "pointer", fontSize: 12.5, padding: "3px 12px",
          borderRadius: 4, marginTop: 4,
        }}
      >
        + 添加演讲者
      </button>
    </div>
  );
}

// ── SpeakerInput ─────────────────────────────────────────────────────────────
function SpeakerInput({ value, placeholder, onChange }) {
  const [local, setLocal] = useState(value || "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value || "");
  }, [value]);
  return (
    <input
      className="speaker-field-input"
      value={local}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; }}
      onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
    />
  );
}

// ── Snapshot diff helpers ─────────────────────────────────────────────────────
function diffArrays(oldArr, newArr) {
  const m = oldArr.length, n = newArr.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldArr[i-1] === newArr[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i-1] === newArr[j-1]) {
      result.unshift({ text: oldArr[i-1], type: "equal" }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ text: newArr[j-1], type: "insert" }); j--;
    } else {
      result.unshift({ text: oldArr[i-1], type: "delete" }); i--;
    }
  }
  return result;
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function getTextLines(html) {
  return stripHtml(html).split(/\n/).map(s => s.trim()).filter(Boolean);
}

function DiffList({ oldItems, newItems }) {
  const diff = diffArrays((oldItems || []).map(String), (newItems || []).map(String));
  if (diff.length === 0) return <p className="text-body" style={{ color: "var(--text-muted)" }}>（无内容）</p>;
  return (
    <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
      {diff.map((item, i) => (
        <li key={i} style={{
          fontSize: "var(--report-fs-caption)", padding: "2px 6px", borderRadius: 3, marginBottom: 3,
          background: item.type === "insert" ? "rgba(39,174,96,0.1)" : item.type === "delete" ? "rgba(207,10,44,0.1)" : "transparent",
          textDecoration: item.type === "delete" ? "line-through" : "none",
          color: item.type === "insert" ? "var(--success)" : item.type === "delete" ? "var(--brand)" : "inherit",
        }}>
          {item.type === "insert" ? "+ " : item.type === "delete" ? "− " : ""}{item.text}
        </li>
      ))}
    </ul>
  );
}

function DiffText({ oldText, newText }) {
  const diff = diffArrays(getTextLines(oldText), getTextLines(newText));
  if (diff.length === 0) return <p className="text-body" style={{ color: "var(--text-muted)" }}>（无内容）</p>;
  return (
    <div className="text-caption" style={{ lineHeight: 1.6 }}>
      {diff.map((item, i) => (
        <div key={i} style={{
          padding: "2px 8px", marginBottom: 2, borderRadius: 3,
          background: item.type === "insert" ? "rgba(39,174,96,0.1)" : item.type === "delete" ? "rgba(207,10,44,0.1)" : "transparent",
          textDecoration: item.type === "delete" ? "line-through" : "none",
          color: item.type === "insert" ? "var(--success)" : item.type === "delete" ? "var(--brand)" : "inherit",
        }}>
          {item.type !== "equal" && (item.type === "insert" ? "+ " : "− ")}{item.text}
        </div>
      ))}
    </div>
  );
}

function SnapshotViewer({ snapshot, currentData }) {
  const { data } = snapshot;
  const ts = snapshot.createdAt?.toDate
    ? snapshot.createdAt.toDate().toLocaleString("zh-CN")
    : "未知时间";
  const FIELD_LABELS = { onsiteInfo: "现场情报", reflections: "圈内声音", rumors: "深度研判" };
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      <p className="text-caption" style={{ margin: "0 0 20px", color: "var(--text-muted)" }}>
        快照时间：{ts}　·　绿色 = 快照中新增，红色删除线 = 当前版本中已改动
      </p>
      <section style={{ marginBottom: 24 }}>
        <h4 className="text-body" style={{ margin: "0 0 8px", fontWeight: 700, color: "var(--text-secondary)" }}>核心要点</h4>
        <DiffList oldItems={currentData?.summaryPoints || []} newItems={data?.summaryPoints || []} />
      </section>
      {Object.keys(data?.sessions || {}).map(code => {
        const oldSd = currentData?.sessions?.[code] || {};
        const newSd = data?.sessions?.[code] || {};
        const hasTakeawaysDiff = stripHtml(oldSd.takeaways) !== stripHtml(newSd.takeaways);
        const hasInsightsDiff = stripHtml(oldSd.insights) !== stripHtml(newSd.insights);
        if (!hasTakeawaysDiff && !hasInsightsDiff) return null;
        return (
          <section key={code} style={{ marginBottom: 24, paddingLeft: 12, borderLeft: "3px solid var(--border)" }}>
            <h4 className="text-caption" style={{ margin: "0 0 8px", fontWeight: 700, color: "var(--text-muted)", fontFamily: "monospace" }}>{code}</h4>
            {hasTakeawaysDiff && (
              <div style={{ marginBottom: 8 }}>
                <div className="text-label" style={{ color: "var(--text-dim)", marginBottom: 4 }}>关键收获</div>
                <DiffText oldText={oldSd.takeaways} newText={newSd.takeaways} />
              </div>
            )}
            {hasInsightsDiff && (
              <div>
                <div className="text-label" style={{ color: "var(--text-dim)", marginBottom: 4 }}>启示</div>
                <DiffText oldText={oldSd.insights} newText={newSd.insights} />
              </div>
            )}
          </section>
        );
      })}
      {["onsiteInfo", "reflections", "rumors"].map(field => {
        const oldVal = currentData?.[field];
        const newVal = data?.[field];
        if (stripHtml(oldVal) === stripHtml(newVal)) return null;
        return (
          <section key={field} style={{ marginBottom: 24 }}>
            <h4 className="text-caption" style={{ margin: "0 0 8px", fontWeight: 700, color: "var(--text-secondary)" }}>{FIELD_LABELS[field]}</h4>
            <DiffText oldText={oldVal} newText={newVal} />
          </section>
        );
      })}

      {/* Block-based section diffs */}
      {[
        { field: "onsiteInfoBlocks", label: "现场情报 (Blocks)" },
        { field: "reflectionsBlocks", label: "圈内声音 (Blocks)" },
      ].map(({ field, label }) => {
        const oldBlocks = currentData?.[field] || [];
        const newBlocks = data?.[field] || [];
        if (JSON.stringify(oldBlocks) === JSON.stringify(newBlocks)) return null;

        // Build maps for comparison
        const oldMap = new Map(oldBlocks.map(b => [b.id, b]));
        const newMap = new Map(newBlocks.map(b => [b.id, b]));
        const allIds = [...new Set([...oldBlocks.map(b => b.id), ...newBlocks.map(b => b.id)])];

        return (
          <section key={field} style={{ marginBottom: 24 }}>
            <h4 className="text-body" style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--text-secondary)" }}>{label}</h4>
            {allIds.map(id => {
              const oldB = oldMap.get(id);
              const newB = newMap.get(id);
              const oldContent = stripHtml(oldB?.content);
              const newContent = stripHtml(newB?.content);

              if (!newB && oldB) {
                // Block removed in snapshot (exists in current, not in snapshot)
                return (
                  <div key={id} style={{ padding: "8px 12px", marginBottom: 6, background: "rgba(207,10,44,0.06)", borderLeft: "3px solid #CF0A2C" }}>
                    <div style={{ fontSize: 10, color: "#CF0A2C", fontWeight: 600, marginBottom: 4 }}>删除</div>
                    <div style={{ fontSize: 12, color: "#888", textDecoration: "line-through" }}>{oldContent || "(空)"}</div>
                  </div>
                );
              }
              if (!oldB && newB) {
                // Block added in snapshot (not in current, exists in snapshot)
                return (
                  <div key={id} style={{ padding: "8px 12px", marginBottom: 6, background: "rgba(39,174,96,0.06)", borderLeft: "3px solid #27AE60" }}>
                    <div style={{ fontSize: 10, color: "#27AE60", fontWeight: 600, marginBottom: 4 }}>新增</div>
                    <div style={{ fontSize: 12, color: "#333" }}>{newContent || "(空)"}</div>
                  </div>
                );
              }
              if (oldContent !== newContent) {
                // Block content changed
                return (
                  <div key={id} style={{ padding: "8px 12px", marginBottom: 6, background: "rgba(41,128,185,0.06)", borderLeft: "3px solid #2980B9" }}>
                    <div style={{ fontSize: 10, color: "#2980B9", fontWeight: 600, marginBottom: 4 }}>已修改</div>
                    <div style={{ fontSize: 12, color: "#888", textDecoration: "line-through", marginBottom: 4 }}>{oldContent || "(空)"}</div>
                    <div style={{ fontSize: 12, color: "#333" }}>{newContent || "(空)"}</div>
                  </div>
                );
              }
              return null; // No change
            })}
          </section>
        );
      })}
    </div>
  );
}

// ── DailyReport ──────────────────────────────────────────────────────────────
export default function DailyReport({ viewMode: viewModeProp = false }) {
  const { confId, reportId } = useParams();
  const { date } = parseReportId(reportId);
  const viewMode = viewModeProp || new URLSearchParams(window.location.search).get('preview') === '1';
  const { user } = useAuth();
  const { isAdmin: isConfAdmin } = useMembership(confId);
  const [confName, setConfName] = useState("");
  const [sessions, setSessions] = useState([]);
  const [allConferenceSessions, setAllConferenceSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [floatingToolbar, setFloatingToolbar] = useState(null); // { top, left } or null
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(null);
  const [collapsedSessions, setCollapsedSessions] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState({ code: null, contributorNames: [], nameInput: "", error: false });
  const [showDeleteSelect, setShowDeleteSelect] = useState(false);

  const [tocVisible, setTocVisible] = useState(true);
  const [openInlineMenu, setOpenInlineMenu] = useState(null); // { field, afterId } | null

  useEffect(() => {
    const el = document.getElementById('report-toc');
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setTocVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const illustInputRefs = useRef({});
  const sessionDataRef = useRef({});
  const reportDataRef = useRef(null);
  const createSnapshotRef = useRef(null);
  const lastSnapshotHashRef = useRef(null);
  const sitePhotoInputRef = useRef(null);
  const reportContainerRef = useRef(null);
  const initDone = useRef(false);
  const collapsedInit = useRef(false);
  const { debouncedSave, saveState } = useDebouncedSave(600);

// Close export dropdown on outside click or Escape
  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e) => {
      if (!e.target.closest('.export-dropdown-wrapper')) setShowExportMenu(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setShowExportMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [showExportMenu]);

  // Close inline add menu on outside click or Escape
  useEffect(() => {
    if (!openInlineMenu) return;
    const close = (e) => {
      if (!e.target.closest('.inline-add-zone')) setOpenInlineMenu(null);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpenInlineMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openInlineMenu]);

  // Snapshots subscription
  useEffect(() => {
    if (!user || !reportId) return;
    const q = query(
      collection(db, "conferences", confId, "dailyReports", reportId, "snapshots"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, snap => {
      setSnapshots(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user, reportId]);

  // 5-minute auto snapshot
  useEffect(() => {
    if (!user || viewMode) return;
    const timer = setInterval(() => { createSnapshotRef.current?.("auto"); }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user, viewMode]);

  // Save snapshot on page leave
  useEffect(() => {
    if (!user || viewMode) return;
    const handleBeforeUnload = () => { createSnapshotRef.current?.("auto"); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user, viewMode]);

  // Conference name
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConfName(snap.exists() ? snap.data().name || confId : confId);
    });
  }, [confId]);

  // Members — load with doc ID and resolve display names in parallel
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences", confId, "members"), async (snap) => {
      const { getDoc: gd, doc: dc } = await import("firebase/firestore");
      const arr = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        let name = data.legacyName || data.displayName || null;
        if (!name && !data.managedByAdmin) {
          try {
            const userSnap = await gd(dc(db, "users", d.id));
            name = userSnap.exists() ? userSnap.data().displayName || userSnap.data().email : d.id;
          } catch { name = d.id; }
        }
        return { ...data, id: d.id, name: name || d.id };
      }));
      setMembers(arr);
    });
  }, [user, confId]);

  // Sessions (filtered by date + all for session picker)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      const all = [];
      const filtered = [];
      snap.forEach((d) => {
        const data = d.data();
        all.push({ ...data, id: d.id });
        if (data.date === date) filtered.push({ ...data, attendees: new Set(data.attendees || []) });
      });
      filtered.sort((a, b) => a.start.localeCompare(b.start));
      setSessions(filtered);
      setAllConferenceSessions(all);
    });
  }, [user, date, confId]);

  // Report data
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "conferences", confId, "dailyReports", reportId), (snap) => {
      setReportData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [user, reportId]);

  // Auto-init report
  useEffect(() => {
    if (!user || loading || reportData || initDone.current || sessions.length === 0) return;
    initDone.current = true;
    const sessionMap = {};
    sessions.forEach((s) => {
      sessionMap[s.code] = {
        speakers: s.speakers?.length > 0
          ? s.speakers.map(sp => ({ name: sp.name || "", position: sp.title || "", company: sp.company || "" }))
          : [{ name: "", position: "", company: "" }],
        takeaways: "",
        insights: "",
        illustration: "",
      };
    });
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
      date, title: "", summaryPoints: [], onsiteInfo: "", reflections: "", rumors: "", sitePhotos: [],
      sessions: sessionMap, topicOrder: [], status: "draft",
    }).catch(console.error);
  }, [user, loading, reportData, sessions, reportId, date]);

  // Keep sessionDataRef and reportDataRef in sync
  const sessionData = reportData?.sessions || {};
  sessionDataRef.current = sessionData;
  reportDataRef.current = reportData;

  // ── Computed ────────────────────────────────────────────────────────────────
  const memberMap = useMemo(() => {
    const map = {};
    members.forEach((m) => { map[m.id] = m.name; });
    return map;
  }, [members]);

  const memberColorMap = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      map[m.id || m.userId] = m.colorIndex ?? 0;
    });
    return map;
  }, [members]);

  const { activeUsers } = usePresence(confId, reportId);

  const deletedSessionCodes = useMemo(() =>
    new Set(reportData?.deletedSessions || [])
  , [reportData]);

  const activeSessions = useMemo(() =>
    sessions.filter(s => !deletedSessionCodes.has(s.code))
  , [sessions, deletedSessionCodes]);

  const topicsMap = useMemo(() => {
    const map = {};
    activeSessions.forEach((s) => {
      const cat = SESSION_CATALOG.get(s.code);
      const rawTopic = cat?.topic ? cat.topic.split(" - ").at(-1)?.trim() : null;
      const topic = s.mainTopic?.trim() || cat?.key_themes?.[0] || rawTopic;
      if (!topic) return;
      if (!map[topic]) map[topic] = [];
      map[topic].push(s);
    });
    Object.values(map).forEach(arr =>
      arr.sort((a, b) => {
        const tc = a.start.localeCompare(b.start);
        return tc !== 0 ? tc : a.title.localeCompare(b.title);
      })
    );
    return map;
  }, [activeSessions]);

  const noTopicSessions = useMemo(() => {
    return activeSessions
      .filter(s => {
        const cat = SESSION_CATALOG.get(s.code);
        return !(s.mainTopic?.trim() || cat?.key_themes?.[0] || cat?.topic);
      })
      .sort((a, b) => {
        const tc = a.start.localeCompare(b.start);
        return tc !== 0 ? tc : a.title.localeCompare(b.title);
      });
  }, [activeSessions]);

  const orderedTopics = useMemo(() => {
    const allTopics = Object.keys(topicsMap);
    const saved = reportData?.topicOrder || [];
    const result = saved.filter(t => allTopics.includes(t));
    allTopics.forEach(t => { if (!result.includes(t)) result.push(t); });
    return result;
  }, [topicsMap, reportData]);

  // ── Save helpers ────────────────────────────────────────────────────────────
  const saveField = useCallback((field, html) => {
    if (!user || viewMode) return;
    debouncedSave(field, () => {
      setDoc(doc(db, "conferences", confId, "dailyReports", reportId), { [field]: html }, { merge: true }).catch(console.error);
    });
  }, [user, reportId, debouncedSave, viewMode]);

  // ── Block helpers ─────────────────────────────────────────────────────────────
  const addBlock = useCallback((field, type) => {
    const newBlock = {
      id: generateId(),
      type, content: "",
      ownerId: user?.uid || "",
      contributorIds: user?.uid ? [user.uid] : [],
      lastEditedBy: user?.uid || "",
      lastEditedAt: Date.now(),
    };
    saveField(field, [...(reportDataRef.current?.[field] || []), newBlock]);
  }, [saveField, user]);
  const updateBlock = useCallback((field, id, content) => {
    saveField(field, (reportDataRef.current?.[field] || []).map(b => b.id === id ? { ...b, content } : b));
  }, [saveField]);
  const removeBlock = useCallback((field, id) => {
    saveField(field, (reportDataRef.current?.[field] || []).filter(b => b.id !== id));
  }, [saveField]);
  const insertBlock = useCallback((field, type, afterId) => {
    const newBlock = {
      id: generateId(),
      type, content: "",
      ownerId: user?.uid || "",
      contributorIds: user?.uid ? [user.uid] : [],
      lastEditedBy: user?.uid || "",
      lastEditedAt: Date.now(),
    };
    const blocks = reportDataRef.current?.[field] || [];
    const idx = afterId ? blocks.findIndex(b => b.id === afterId) : -1;
    const next = [...blocks];
    next.splice(idx + 1, 0, newBlock);
    saveField(field, next);
  }, [saveField, user]);
  const updateBlockFields = useCallback((field, id, fields) => {
    saveField(field, (reportDataRef.current?.[field] || []).map(b => {
      if (b.id !== id) return b;
      return { ...b, ...fields, lastEditedBy: user?.uid || b.lastEditedBy, lastEditedAt: Date.now() };
    }));
  }, [saveField, user]);

  // ── Snapshot helpers ─────────────────────────────────────────────────────────
  const pruneSnapshots = useCallback(async () => {
    const q = query(
      collection(db, "conferences", confId, "dailyReports", reportId, "snapshots"),
      orderBy("createdAt", "desc"),
      limit(51)
    );
    const snap = await getDocs(q);
    if (snap.docs.length > 50) {
      await deleteDoc(snap.docs[50].ref);
    }
  }, [reportId]);

  const createSnapshot = useCallback(async (type) => {
    if (!user || !reportDataRef.current) return;
    const rd = reportDataRef.current;
    const data = {
      title: rd.title || "",
      summaryPoints: rd.summaryPoints || [],
      sessions: sessionDataRef.current || {},
      topicOrder: rd.topicOrder || [],
      deletedSessions: rd.deletedSessions || [],
      onsiteInfo: rd.onsiteInfo || "",
      reflections: rd.reflections || "",
      rumors: rd.rumors || "",
      onsiteInfoBlocks: rd.onsiteInfoBlocks || [],
      reflectionsBlocks: rd.reflectionsBlocks || [],
    };
    const hash = JSON.stringify(data);
    // Skip auto snapshots when content hasn't changed since last snapshot
    if (type === "auto" && hash === lastSnapshotHashRef.current) return;
    try {
      await addDoc(collection(db, "conferences", confId, "dailyReports", reportId, "snapshots"), {
        type,
        label: type === "auto" ? "自动保存" : "手动保存",
        createdAt: serverTimestamp(),
        data,
      });
      lastSnapshotHashRef.current = hash;
      await pruneSnapshots();
    } catch (err) {
      console.error("[Snapshot] Failed to save snapshot:", err.code, err.message);
    }
  }, [user, reportId, pruneSnapshots]);

  // Keep createSnapshotRef up to date (used by 5-min timer)
  createSnapshotRef.current = createSnapshot;

  const handleSave = async () => {
    await createSnapshot("manual");
  };

  const handleRestore = (snapshot) => {
    setRestoreConfirm(snapshot);
  };

  const confirmRestore = async () => {
    if (!restoreConfirm) return;
    const snapshot = restoreConfirm;
    setRestoreConfirm(null);
    await createSnapshot("manual");
    await setDoc(doc(db, "conferences", confId, "dailyReports", reportId), snapshot.data, { merge: true });
    setShowHistory(false);
    setViewingSnapshot(null);
  };

  const saveSessionField = useCallback((code, field, value) => {
    if (!user) return;
    debouncedSave(`${code}.${field}`, () => {
      setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
        sessions: { [code]: { [field]: value, lastEditedBy: user.uid, lastEditedAt: Date.now() } }
      }, { merge: true }).catch(console.error);
    });
  }, [user, reportId, debouncedSave, confId]);

  // Speakers: save whole array debounced
  const saveSpeakers = useCallback((code, speakers) => {
    if (!user) return;
    debouncedSave(`${code}.speakers`, () => {
      setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
        sessions: { [code]: { speakers } }
      }, { merge: true }).catch(console.error);
    });
  }, [user, reportId, debouncedSave]);

  const addSpeaker = useCallback((code) => {
    if (!user) return;
    const sd = sessionDataRef.current[code] || {};
    const speakers = [...(sd.speakers || []), { name: "", position: "", company: "" }];
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
      sessions: { [code]: { speakers } }
    }, { merge: true }).catch(console.error);
  }, [user, reportId]);

  const removeSpeaker = useCallback((code, idx) => {
    if (!user) return;
    const sd = sessionDataRef.current[code] || {};
    const speakers = (sd.speakers || []).filter((_, i) => i !== idx);
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
      sessions: { [code]: { speakers: speakers.length ? speakers : [{ name: "", position: "", company: "" }] } }
    }, { merge: true }).catch(console.error);
  }, [user, reportId]);

  const openDeleteConfirm = useCallback((code, contributorNames) => {
    setShowDeleteSelect(false);
    setDeleteConfirm({ code, contributorNames, nameInput: "", error: false });
  }, []);

  const confirmDeleteSession = useCallback(() => {
    const { code, contributorNames, nameInput } = deleteConfirm;
    const trimmed = nameInput.trim();
    const valid = contributorNames.length === 0
      ? trimmed.length > 0
      : contributorNames.some(n => n === trimmed);
    if (!valid) {
      setDeleteConfirm(prev => ({ ...prev, error: true }));
      return;
    }
    const currentDeleted = reportDataRef.current?.deletedSessions || [];
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
      deletedSessions: [...currentDeleted, code]
    }, { merge: true }).catch(console.error);
    setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false });
  }, [deleteConfirm, reportId]);

  const compressImage = useCallback((file, maxPx = 1200, quality = 0.75) => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = url;
    });
  }, []);

  const uploadToStorage = useCallback(async (base64DataUrl, path) => {
    const storageRef = ref(storage, path);
    await uploadString(storageRef, base64DataUrl, "data_url");
    return getDownloadURL(storageRef);
  }, []);

  // Normalize illustrations: supports old single string + new array format
  const getIllustrations = useCallback((sd) => {
    if (Array.isArray(sd.illustrations)) return sd.illustrations;
    if (sd.illustration) return [{ url: sd.illustration, storagePath: `illustrations/${reportId}/${sd._code}` }];
    return [];
  }, [reportId]);

  const handleIllustration = useCallback((code, e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const storagePath = `illustrations/${reportId}/${code}_${Date.now()}`;
    compressImage(file)
      .then(compressed => uploadToStorage(compressed, storagePath))
      .then(url => {
        const current = sessionDataRef.current[code] || {};
        const existing = Array.isArray(current.illustrations) ? current.illustrations
          : current.illustration ? [{ url: current.illustration, storagePath: `illustrations/${reportId}/${code}` }]
          : [];
        saveSessionField(code, "illustrations", [...existing, { url, storagePath }]);
      });
  }, [compressImage, uploadToStorage, reportId, saveSessionField]);

  const handleIllustrationDelete = useCallback((code, idx) => {
    const current = sessionDataRef.current[code] || {};
    const existing = Array.isArray(current.illustrations) ? current.illustrations
      : current.illustration ? [{ url: current.illustration, storagePath: `illustrations/${reportId}/${code}` }]
      : [];
    const item = existing[idx];
    if (item?.storagePath) deleteObject(ref(storage, item.storagePath)).catch(() => {});
    const next = existing.filter((_, i) => i !== idx);
    saveSessionField(code, "illustrations", next);
    // Clear legacy field if present
    if (current.illustration) saveSessionField(code, "illustration", "");
  }, [reportId, saveSessionField]);

  // ── Site Photos handlers ─────────────────────────────────────────────────
  const handleSitePhotoAdd = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const objUrl = URL.createObjectURL(file);
    const imgEl = new window.Image();
    imgEl.onload = () => {
      const w = imgEl.naturalWidth;
      const h = imgEl.naturalHeight;
      URL.revokeObjectURL(objUrl);
      const storagePath = `sitePhotos/${reportId}/${Date.now()}`;
      compressImage(file)
        .then(compressed => uploadToStorage(compressed, storagePath))
        .then(url => {
          const photos = [...(reportDataRef.current?.sitePhotos || []),
            { image: url, storagePath, caption: "", source: "", w, h }];
          setDoc(doc(db, "conferences", confId, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
        });
    };
    imgEl.src = objUrl;
  }, [compressImage, uploadToStorage, reportId]);

  const handleSitePhotoDelete = useCallback((idx) => {
    const photos = reportDataRef.current?.sitePhotos || [];
    const photo = photos[idx];
    if (photo?.storagePath) {
      deleteObject(ref(storage, photo.storagePath)).catch(() => {});
    }
    const updated = photos.filter((_, i) => i !== idx);
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), { sitePhotos: updated }, { merge: true }).catch(console.error);
  }, [reportId]);

  const saveSitePhotoCaption = useCallback((idx, caption) => {
    debouncedSave(`sitePhoto-caption-${idx}`, async () => {
      const photos = [...(reportDataRef.current?.sitePhotos || [])];
      if (photos[idx]) photos[idx] = { ...photos[idx], caption };
      await setDoc(doc(db, "conferences", confId, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
    });
  }, [reportId, debouncedSave]);

  const saveSitePhotoSource = useCallback((idx, source) => {
    debouncedSave(`sitePhoto-source-${idx}`, async () => {
      const photos = [...(reportDataRef.current?.sitePhotos || [])];
      if (photos[idx]) photos[idx] = { ...photos[idx], source };
      await setDoc(doc(db, "conferences", confId, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
    });
  }, [debouncedSave, reportId]);

  // Extract all CSS text via CSSOM — skips cross-origin sheets silently
  // Export handler for markdown format
  const handleExport = async (format) => {
    setExporting(true);
    setShowExportMenu(false);

    const prevCollapsed = new Set(collapsedSessions);
    setCollapsedSessions(new Set());
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      const container = reportContainerRef.current;
      if (!container) throw new Error("Report container not found");

      // Clone report DOM and strip interactive / UI-only elements
      const clone = container.cloneNode(true);
      clone.querySelectorAll(".no-print, .report-toolbar, .report-nav-bar, .session-collapse-btn").forEach(el => el.remove());
      clone.querySelectorAll(".print-only").forEach(el => { el.style.display = "block"; });

      let blob, filename;

      if (format === 'markdown') {
        const { default: TurndownService } = await import('turndown');
        const { gfm } = await import('turndown-plugin-gfm');

        // ── DOM pre-processing ──────────────────────────────────────────
        // 1. Remove empty 关键收获/启示 blocks (heading + empty content)
        clone.querySelectorAll('.report-field-block').forEach(block => {
          const heading = block.querySelector('.report-field-heading');
          if (!heading) return;
          const bodyText = block.textContent.replace(heading.textContent, '').trim();
          if (!bodyText) block.remove();
        });

        // 1b. Add ids to topic dividers so TOC #topic-* links have targets
        clone.querySelectorAll('.report-topic-divider').forEach(el => {
          const name = el.querySelector('.report-topic-name')?.textContent.trim() || '';
          if (name) el.id = 'topic-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        });

        // 2. Inject <a id="..."> for all TOC anchor targets
        clone.querySelectorAll("[id]").forEach(el => {
          const anchor = document.createElement('a');
          anchor.id = el.id;
          el.removeAttribute('id');
          el.insertBefore(anchor, el.firstChild);
        });

        const td = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
        });
        td.use(gfm);

        // Preserve <a id="..."> anchor tags as raw HTML
        td.addRule('session-anchor', {
          filter: (node) =>
            node.nodeName === 'A' && !!node.getAttribute('id') && !node.getAttribute('href'),
          replacement: (_content, node) => `<a id="${node.getAttribute('id')}"></a>`,
        });

        // Session title: merge code + title into one heading (### S82322 — Title)
        td.addRule('session-title', {
          filter: (node) => node.nodeName === 'H3' && node.classList.contains('report-session-title'),
          replacement: (content, node) => {
            const codeEl = node.closest('.report-session-header')
              ?.querySelector('.report-session-code');
            const code = codeEl ? codeEl.textContent.trim() : '';
            return `\n\n### ${code ? code + ' — ' : ''}${content.trim()}\n\n`;
          },
        });

        // Suppress standalone session code span (merged into heading above)
        td.addRule('session-code', {
          filter: (node) => node.nodeName === 'SPAN' && node.classList.contains('report-session-code'),
          replacement: () => '',
        });

        // Field headings (关键收获 / 启示): render in red
        td.addRule('field-heading', {
          filter: (node) => node.nodeName === 'H4' && node.classList.contains('report-field-heading'),
          replacement: (content) =>
            `\n\n<span style="color:#CF0A2C">**${content.trim()}**</span>\n\n`,
        });

        // Topic divider: render as ## heading for visual hierarchy above ### sessions
        td.addRule('topic-divider', {
          filter: (node) => node.classList?.contains('report-topic-divider'),
          replacement: (_content, node) => {
            const name = node.querySelector('.report-topic-name')?.textContent.trim() || '';
            return name ? `\n\n---\n\n## ${name}\n\n` : '';
          },
        });

        // Contributors row: "贡献人: Name1、Name2"
        td.addRule('contributors-row', {
          filter: (node) => node.classList?.contains('report-contributors-row'),
          replacement: (_content, node) => {
            const label = node.querySelector('.report-contributors-label')?.textContent.trim() || '贡献人';
            const names = node.querySelector('.report-contributors-names')?.textContent.trim() || '';
            return names ? `\n\n${label}: ${names}\n\n` : '';
          },
        });

        // Intel card meta rows (来源 / 贡献人 inside onsite/reflections intel cards)
        td.addRule('intel-card-meta-row', {
          filter: (node) =>
            node.nodeName === 'DIV' &&
            node.classList?.contains('intel-card-section') &&
            node.querySelector?.('.intel-card-label'),
          replacement: (_content, node) => {
            const label = node.querySelector('.intel-card-label')?.textContent.trim();
            if (!label) return _content;
            // _content contains label text + Turndown-processed value (with markdown links)
            const valueMarkdown = _content.replace(label, '').trim();
            return valueMarkdown ? `\n\n*${label}:* ${valueMarkdown}\n\n` : '';
          },
        });

        const frontmatter = `---\ntitle: ${confName || "Conference"} 日报 ${date}\ndate: ${date}\n---\n\n`;
        const md = frontmatter + td.turndown(clone.outerHTML);
        blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        filename = `GTC2026_日报_${date}.md`;
      }

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("[Export] Failed:", err.message);
      alert(`导出失败：${err.message}`);
    } finally {
      setCollapsedSessions(prevCollapsed);
      setExporting(false);
    }
  };


  // Collapse init: sessions with content start collapsed
  useEffect(() => {
    if (!reportData || collapsedInit.current) return;
    collapsedInit.current = true;
    const initial = new Set(
      sessions.filter(s => {
        const sd = reportData.sessions?.[s.code];
        return sd?.takeaways && sd.takeaways !== "";
      }).map(s => s.code)
    );
    setCollapsedSessions(initial);
  }, [reportData, sessions]);

  const toggleCollapse = useCallback((code) => {
    setCollapsedSessions(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }, []);

  const handleSyncFromCatalog = async () => {
    if (!user || syncing) return;
    setSyncing(true);
    setSyncMsg("");
    try {
      const updatedMap = {};
      let syncedCount = 0;
      sessions.forEach((s) => {
        const existing = sessionDataRef.current[s.code] || {};
        const info = SESSION_CATALOG.get(s.code);
        if (info?.speakers?.length > 0) {
          updatedMap[s.code] = {
            ...existing,
            speakers: info.speakers.map(sp => ({
              name:     sp.name    || "",
              position: sp.title   || "",
              company:  sp.company || "",
            })),
          };
          syncedCount++;
        }
      });
      if (syncedCount === 0) {
        setSyncMsg("未找到匹配的 catalog 数据");
      } else {
        await setDoc(doc(db, "conferences", confId, "dailyReports", reportId), { sessions: updatedMap }, { merge: true });
        setSyncMsg(`已同步 ${syncedCount} 个 session`);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncMsg("同步失败，请重试");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 3000);
    }
  };

  // Publish: generate full HTML, upload to Firebase Storage, return share URL
  const handlePublish = async ({ silent = false } = {}) => {
    setPublishing(true);
    setShowExportMenu(false);

    const prevCollapsed = new Set(collapsedSessions);
    setCollapsedSessions(new Set());
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      const container = reportContainerRef.current;
      if (!container) throw new Error("Report container not found");

      const clone = container.cloneNode(true);
      clone.querySelectorAll(".no-print, .report-toolbar, .report-nav-bar, .session-collapse-btn, .subtitle-toggle-btn").forEach(el => el.remove());
      clone.querySelectorAll(".print-only").forEach(el => {
        el.classList.remove("print-only");
        // Use flex for meta rows (label + value inline), block for everything else
        el.style.display = el.classList.contains("intel-card-meta") ? "flex" : "block";
      });
      clone.querySelectorAll("[contenteditable]").forEach(el => {
        el.removeAttribute("contenteditable");
      });
      // Strip inline styles from category title spans (can accumulate from rich-text paste)
      clone.querySelectorAll(".onsite-category-title").forEach(el => {
        el.textContent = el.textContent;
      });
      // Remove empty field blocks (关键收获 / 启示) from published HTML
      clone.querySelectorAll('.report-field-block').forEach(block => {
        const heading = block.querySelector('.report-field-heading');
        if (!heading) return;
        const bodyText = block.textContent.replace(heading.textContent, '').trim();
        if (!bodyText) block.remove();
      });
      // Convert form fields to static text (before removing interactive elements)
      const origCaptions = container.querySelectorAll('.site-photo-caption');
      const clonedCaptions = clone.querySelectorAll('.site-photo-caption');
      origCaptions.forEach((orig, i) => {
        const cloned = clonedCaptions[i];
        if (!cloned) return;
        const p = document.createElement('p');
        p.className = cloned.className;
        p.textContent = orig.value;
        cloned.parentNode.replaceChild(p, cloned);
      });

      const origSources = container.querySelectorAll('.site-photo-source');
      const clonedSources = clone.querySelectorAll('.site-photo-source');
      origSources.forEach((orig, i) => {
        const cloned = clonedSources[i];
        if (!cloned) return;
        const p = document.createElement('p');
        p.className = cloned.className;
        p.textContent = orig.value;
        cloned.parentNode.replaceChild(p, cloned);
      });

      // Convert bullet-editor textareas to static text
      const origBullets = container.querySelectorAll('.bullet-input');
      const clonedBullets = clone.querySelectorAll('.bullet-input');
      origBullets.forEach((orig, i) => {
        const cloned = clonedBullets[i];
        if (!cloned) return;
        const span = document.createElement('span');
        span.className = cloned.className;
        span.textContent = orig.value;
        cloned.parentNode.replaceChild(span, cloned);
      });

      // Remove any remaining interactive elements
      clone.querySelectorAll("button, input, textarea, select").forEach(el => el.remove());

      const styleTagsHtml = (await Promise.all(
        Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
          .map(async el => {
            if (el.tagName === "LINK") {
              try {
                const href = new URL(el.getAttribute("href"), window.location.href).href;
                const css = await fetch(href).then(r => r.text());
                return `<style>${css}</style>`;
              } catch { return ""; }
            }
            return el.outerHTML;
          })
      )).join("\n");

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTC2026 日报 ${date}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
${styleTagsHtml}
<style>
  body { background: #fff; color: #111; }
  .report-container { max-width: 900px; margin: 0 auto; padding: 24px; }
  .report-page, .report-container, body {
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "微软雅黑", sans-serif !important;
  }
  /* Read-only overrides for published view */
  .report-editable { pointer-events: none; border-color: transparent !important; background: transparent !important; }
  .report-editable:hover, .report-editable:focus { border-color: transparent !important; background: transparent !important; }
  .report-inline-editable { pointer-events: none; border-bottom-color: transparent !important; }
  /* Keep TOC links clickable */
  .report-toc-link { pointer-events: auto !important; cursor: pointer !important; }
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`;

      const fileId = String(Date.now());
      const storageRef = ref(storage, `published-reports/${date}/${fileId}.html`);
      await uploadString(storageRef, html, 'raw', { contentType: 'text/html; charset=utf-8' });

      // Prune: keep only the latest 100 published reports for this date
      const dirRef = ref(storage, `published-reports/${date}`);
      const { items } = await listAll(dirRef);
      if (items.length > 100) {
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
        const toDelete = sorted.slice(0, items.length - 100);
        await Promise.all(toDelete.map(item => deleteObject(item)));
      }

      const url = `${window.location.origin}/view/${date}/${fileId}`;
      setShareUrl(url);
      if (silent) return url;
    } catch (err) {
      console.error("[Publish] Failed:", err.message);
      alert(`发布失败：${err.message}`);
    } finally {
      setCollapsedSessions(prevCollapsed);
      setPublishing(false);
    }
  };

  function escapeHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const handleEmailExport = async () => {
    setShowExportMenu(false);

    let url = shareUrl;
    if (!url) {
      url = await handlePublish({ silent: true });
      if (!url) return;
    }

    const title = reportData?.title || `【${date}】日报`;
    const points = (reportData?.summaryPoints || []).filter(Boolean);
    const pointsHtml = points.length
      ? points.map(p => `<li style="margin:0 0 8px; color:#333; font-size:15px; line-height:1.6;">${escapeHtml(p)}</li>`).join('')
      : '<li style="color:#888; font-size:15px;">暂无核心要点</li>';

    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  @media only screen and (max-width:620px){
    .email-wrapper{width:100%!important;}
    .email-card{border-radius:0!important;}
    .email-btn{display:block!important;width:auto!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f6;font-family:Arial,'Noto Sans SC',sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">GTC2026 ${escapeHtml(title)} — 今日核心要点速览</span>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:24px 16px;">
  <table class="email-card" width="600" cellpadding="0" cellspacing="0" border="0"
    style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <!-- Header bar -->
    <tr><td style="background:#C41E3A;padding:14px 28px;">
      <p style="margin:0;color:#fff;font-size:11px;letter-spacing:3px;font-weight:bold;">${escapeHtml(confName || "Conference")} · DAILY BRIEFING</p>
    </td></tr>
    <!-- Title + date -->
    <tr><td style="padding:28px 28px 12px;">
      <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#1a1a1a;">${escapeHtml(title)}</h1>
      <p style="margin:0;font-size:13px;color:#999;">${escapeHtml(date)}</p>
    </td></tr>
    <!-- Divider -->
    <tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #eee;margin:0;"></td></tr>
    <!-- 核心要点 -->
    <tr><td style="padding:20px 28px 8px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#C41E3A;">核心要点</p>
      <ul style="margin:0;padding:0 0 0 18px;">${pointsHtml}</ul>
    </td></tr>
    <!-- CTA button -->
    <tr><td align="center" style="padding:28px;">
      <a class="email-btn" href="${url}"
        style="display:inline-block;background:#C41E3A;color:#ffffff;font-size:15px;font-weight:bold;
               text-decoration:none;padding:14px 36px;border-radius:5px;letter-spacing:0.5px;">
        查看完整日报 →
      </a>
    </td></tr>
    <!-- Footer -->
    <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#bbb;">${escapeHtml(confName || "Conference")} Daily Report · ${escapeHtml(date)}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GTC2026_日报邮件_${date}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Toolbar — execCommand has no modern replacement for contenteditable rich-text
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const execCmd = (cmd, val) => /** @type {any} */ (document).execCommand(cmd, false, val ?? undefined);
  const execBold = () => execCmd("bold");
  const execColor = (color) => { execCmd("foreColor", color); setShowColorPicker(false); };

  // Floating formatting toolbar on text selection
  useEffect(() => {
    if (viewMode) return;
    const handleSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setFloatingToolbar(null);
        setShowColorPicker(false);
        return;
      }
      // Only show if selection is inside an editable element
      const range = sel.getRangeAt(0);
      const container = reportContainerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setFloatingToolbar(null);
        return;
      }
      // Check if selection is within a contenteditable element
      let node = range.commonAncestorContainer;
      let inEditable = false;
      while (node && node !== container) {
        if (node.nodeType === 1 && node.getAttribute("contenteditable") === "true") {
          inEditable = true;
          break;
        }
        node = node.parentNode;
      }
      if (!inEditable) {
        setFloatingToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setFloatingToolbar({
        top: rect.top + window.scrollY - 44,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    };
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, [viewMode]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="report-page">
        <div className="report-container" style={{ textAlign: "center", padding: "80px 20px" }}>
          <p style={{ color: "var(--text-muted)" }}>加载中...</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`report-page${viewMode ? " report-view-mode" : ""}`}>

      {/* ── Toolbar (redesigned) ────────────────────────────────── */}
      {!viewMode && <div className="no-print" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#222", borderBottom: "1px solid #333",
        padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Left: nav + title + status badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to={`/conference/${confId}/reports`} style={{ color: "#888", fontSize: 12, textDecoration: "none" }}>
            ← 返回报告列表
          </Link>
          <span style={{ color: "#555" }}>|</span>
          <span style={{ color: "#eee", fontSize: 14, fontWeight: 700, fontFamily: "'Work Sans', sans-serif" }}>
            {reportData?.title || `【${date}】日报`}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
            padding: "2px 8px", background: "rgba(255,255,255,0.1)", color: "#888",
            fontFamily: "'Work Sans', sans-serif",
          }}>
            {reportData?.status === "published" ? "PUBLISHED" : "DRAFT"}
          </span>
        </div>

        {/* Right: presence + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PresenceBar
            activeUsers={activeUsers}
            memberColorMap={memberColorMap}
            currentUid={user?.uid}
          />
          {saveState === "saving" && (
            <span style={{ fontSize: 11, color: "#666" }}>● 保存中...</span>
          )}
          {saveState === "saved" && (
            <span style={{ fontSize: 11, color: "#27AE60" }}>✓ 已保存</span>
          )}
          <button onClick={handleSave} title="保存"
            style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: "#333", color: "#ccc", border: "none", cursor: "pointer", fontFamily: "'Work Sans', sans-serif" }}>
            保存
          </button>
          <button onClick={() => setShowHistory(true)} title="历史版本"
            style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: "#333", color: "#ccc", border: "none", cursor: "pointer", fontFamily: "'Work Sans', sans-serif" }}>
            历史版本
          </button>
          {/* Export dropdown */}
          <div style={{ position: "relative" }}>
            <button
                onClick={() => !exporting && setShowExportMenu(v => !v)}
                disabled={exporting}
                style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
                  background: "#333", color: "#ccc", border: "none", cursor: "pointer", fontFamily: "'Work Sans', sans-serif" }}
              >
                {exporting ? "生成中..." : "导出 ▾"}
              </button>
              {showExportMenu && (
                <div className="export-dropdown-menu">
                  <button className="export-menu-item" onClick={() => handleExport('markdown')}>
                    <span className="export-menu-icon">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 10V6l2 2 2-2v4M11 10V8.5M11 6.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    <span className="export-menu-label">导出 Markdown</span>
                  </button>
                  <div className="export-menu-divider" />
                  <button className="export-menu-item export-menu-item--publish" onClick={handlePublish}>
                    <span className="export-menu-icon">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="4" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6 7l4-2M6 9l4 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </span>
                    <span className="export-menu-label">{publishing ? "分享中..." : "分享日报"}</span>
                  </button>
                  <div className="export-menu-divider" />
                  <button className="export-menu-item" onClick={handleEmailExport}>
                    <span className="export-menu-icon">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M1.5 5.5l6.5 4 6.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span className="export-menu-label">导出邮件 HTML</span>
                  </button>
                </div>
              )}
          </div>
          <div style={{ width: 1, height: 20, background: "#444", margin: "0 2px" }} />
          <button onClick={() => setShowDeleteSelect(true)} title="删除 Session"
            style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: "transparent", color: "#a20513", border: "none", cursor: "pointer", fontFamily: "'Work Sans', sans-serif" }}>
            删除 Session
          </button>
          <button onClick={handleSyncFromCatalog} disabled={syncing} title="更新 Session 信息"
            style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: "transparent", color: "#888", border: "none", cursor: "pointer", fontFamily: "'Work Sans', sans-serif", opacity: syncing ? 0.5 : 1 }}>
            {syncing ? "更新中..." : "更新 Session 信息"}
          </button>
          {syncMsg && <span style={{ fontSize: 11, color: "#2980B9", marginRight: 4 }}>{syncMsg}</span>}
          <div style={{ width: 1, height: 20, background: "#444", margin: "0 2px" }} />
          {/* Preview button */}
          <button
            onClick={() => window.open(`/conference/${confId}/report/${reportId}?preview=1`, '_blank')}
            style={{
              padding: "5px 18px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
              background: "#333", color: "#ccc", border: "none", cursor: "pointer",
              fontFamily: "'Work Sans', sans-serif",
            }}
          >
            预览
          </button>
        </div>
      </div>}

      {/* ── Floating formatting toolbar (appears on text selection) ── */}
      {!viewMode && floatingToolbar && (
        <div className="no-print" style={{
          position: "absolute", top: floatingToolbar.top, left: floatingToolbar.left,
          transform: "translateX(-50%)", zIndex: 200,
          background: "#222", padding: "4px 6px", display: "flex", alignItems: "center", gap: 3,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}
          onMouseDown={(e) => e.preventDefault()} /* prevent losing selection */
        >
          <button onMouseDown={(e) => { e.preventDefault(); execBold(); }} title="加粗"
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            B
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }} title="斜体"
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, fontStyle: "italic" }}>
            I
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }} title="下划线"
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>
            U
          </button>
          <div style={{ width: 1, height: 18, background: "#444" }} />
          {COLOR_PRESETS.map((c) => (
            <button key={c} onMouseDown={(e) => { e.preventDefault(); execColor(c); }} title={c}
              style={{ width: 18, height: 18, background: c, border: "none", cursor: "pointer", flexShrink: 0 }} />
          ))}
        </div>
      )}

      {/* ── Share Modal ──────────────────────────────────────────── */}
      {!viewMode && shareUrl && (
        <div className="share-modal-overlay" onClick={() => { setShareUrl(null); setUrlCopied(false); }}>
          <div className="share-modal-card" onClick={e => e.stopPropagation()}>
            <div className="share-modal-header">
              <span className="share-modal-title">可分享的公开链接</span>
              <button className="share-modal-close" onClick={() => { setShareUrl(null); setUrlCopied(false); }}>×</button>
            </div>
            <div className="share-modal-url-row">
              <span className="share-modal-url">{shareUrl}</span>
              <button
                className={`share-modal-copy-btn${urlCopied ? " share-modal-copy-btn--copied" : ""}`}
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setUrlCopied(true);
                  setTimeout(() => setUrlCopied(false), 2000);
                }}
              >
                {urlCopied ? "✓ 已复制" : "复制链接"}
              </button>
            </div>
            <p className="share-modal-hint">链接可公开访问，任何人均可查看。</p>
          </div>
        </div>
      )}

      {/* ── Report Content ───────────────────────────────────────── */}
      <div className="report-container" ref={reportContainerRef}>

        {/* Title bar */}
        <div className="report-title-bar">
          <div className="report-title-eyebrow">{confName || "CONFERENCE"} · DAILY BRIEFING</div>
          <h1>
            {viewMode ? (
              <span>{reportData?.title || `【${date}】日报`}</span>
            ) : (
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={e => saveField("title", e.currentTarget.textContent.trim() || "")}
              >{reportData?.title || `【${date}】日报`}</span>
            )}
          </h1>
        </div>

        {/* Header: TOC + Summary */}
        <div className="report-header">

          {/* TOC – organized by topic, drag-to-reorder */}
          <div className="report-toc" id="report-toc">
            <h2 className="report-section-title">目录</h2>
            <ul className="report-toc-list">
              <li className="report-toc-section-item">
                <a href="#section-related" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">相关议题</span>
                </a>
                {orderedTopics.length > 0 && (
                  <ul className="report-toc-sublist">
                    {orderedTopics.map(topic => (
                      <li key={topic}>
                        <a href={`#topic-${topicSlug(topic)}`} className="report-toc-link report-toc-cat-link">
                          <span className="report-toc-title" style={{ color: "var(--brand)" }}>{topic}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              <li className="report-toc-section-item">
                <a href="#section-onsite-info" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">现场情报</span>
                </a>
                {(reportData?.onsiteInfoBlocks || []).filter(b => b.type === 'heading' && b.content).length > 0 && (
                  <ul className="report-toc-sublist">
                    {(reportData?.onsiteInfoBlocks || []).filter(b => b.type === 'heading' && b.content).map(block => (
                      <li key={block.id}>
                        <a href={`#block-${block.id}`} className="report-toc-link report-toc-cat-link">
                          <span className="report-toc-title" style={{ color: "var(--brand)" }}>{block.content}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              <li className="report-toc-section-item">
                <a href="#section-reflections" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">圈内声音</span>
                </a>
                {(reportData?.reflectionsBlocks || []).filter(b => b.type === 'heading' && b.content).length > 0 && (
                  <ul className="report-toc-sublist">
                    {(reportData?.reflectionsBlocks || []).filter(b => b.type === 'heading' && b.content).map(block => (
                      <li key={block.id}>
                        <a href={`#block-${block.id}`} className="report-toc-link report-toc-cat-link">
                          <span className="report-toc-title" style={{ color: "var(--brand)" }}>{block.content}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              <li className="report-toc-section-item">
                <a href="#section-rumors" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">深度研判</span>
                </a>
              </li>
              <li className="report-toc-section-item">
                <a href="#section-site-photos" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">现场记录</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Summary */}
          <div className="report-summary">
            <h2 className="report-section-title">核心要点</h2>
            <BulletEditor
              points={reportData?.summaryPoints}
              onSave={pts => saveField("summaryPoints", pts)}
              placeholder="请输入今日核心要点..."
              readOnly={viewMode}
            />
          </div>
        </div>

        {/* Session Reports – organized by topic */}
        <div id="section-related" className="report-sessions">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>相关议题</h2>

          {noTopicSessions.map(session => {
            const sd = sessionData[session.code] || {};
            const speakers = sd.speakers
              || (sd.speaker
                ? [{ name: sd.speaker, position: "", company: sd.company || "" }]
                : [{ name: "", position: "", company: "" }]);
            const contributorNames = Array.from(session.attendees).map(id => memberMap[id]).filter(Boolean);
            const contributors = contributorNames.join("、");
            const isCollapsed = collapsedSessions.has(session.code);
            return (
              <div key={session.code} id={`session-${session.code}`} className="report-session">
                <div className="report-session-header" onClick={() => toggleCollapse(session.code)}
                  style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: isCollapsed ? 0 : 6 }}>
                      <span className="report-session-code" style={{ marginBottom: 0, flexShrink: 0 }}>
                        {session.code}
                      </span>
                      <h3 className="report-session-title" style={{ margin: 0 }}>
                        {SESSION_CATALOG.get(session.code)?.url
                          ? <a href={SESSION_CATALOG.get(session.code).url} target="_blank" rel="noopener noreferrer"
                               style={{ color: "inherit", textDecoration: "none" }}
                               onClick={e => e.stopPropagation()}
                               onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                               onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                              {SESSION_CATALOG.get(session.code)?.title || session.title}
                            </a>
                          : SESSION_CATALOG.get(session.code)?.title || session.title
                        }
                      </h3>
                    </div>
                    {!isCollapsed && (
                      <div className="report-session-time">
                        {session.start}–{session.end}{session.room && ` | ${session.room}`}
                      </div>
                    )}
                  </div>
                  <span className="session-collapse-btn">{isCollapsed ? "▶" : "▼"}</span>
                </div>
                {!isCollapsed && <>
                <div className="report-session-meta">
                  <SpeakersEditor
                    code={session.code}
                    speakers={speakers}
                    onUpdate={newSpeakers => saveSpeakers(session.code, newSpeakers)}
                    onAdd={() => addSpeaker(session.code)}
                    onRemove={idx => removeSpeaker(session.code, idx)}
                    readOnly={viewMode}
                  />
                </div>
                <div style={{ padding: "6px 20px 0" }}>
                  {(() => {
                    const illus = getIllustrations({ ...sd, _code: session.code });
                    return (<>
                      {illus.length > 0 && (
                        <div className="session-illustrations-grid">
                          {illus.map((item, i) => (
                            <div key={i} className="session-illustration-item">
                              <img src={item.url} className="session-illustration" alt={`插图${i + 1}`} />
                              <button
                                className="no-print session-illustration-del"
                                onClick={() => handleIllustrationDelete(session.code, i)}
                              >删除</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="no-print"
                        onClick={() => illustInputRefs.current[session.code]?.click()}
                        style={{
                          fontSize: 11, color: "var(--text-placeholder)", border: "1px dashed #DDDDDD",
                          background: "none", cursor: "pointer", padding: "5px 0",
                          borderRadius: 4, display: "block", textAlign: "center", width: "100%",
                          marginTop: illus.length > 0 ? 6 : 0,
                        }}
                      >
                        + 添加插图
                      </button>
                    </>);
                  })()}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    ref={el => { illustInputRefs.current[session.code] = el; }}
                    onChange={e => handleIllustration(session.code, e)}
                  />
                </div>
                <div className="report-session-body">
                  <div className="report-field-block">
                    <h4 className="report-field-heading report-field-heading--highlight">关键收获</h4>
                    <EditableField
                      value={sd.takeaways}
                      onSave={html => saveSessionField(session.code, "takeaways", html)}
                      placeholder="记录本场会议的关键收获..."
                      readOnly={viewMode}
                    />
                  </div>
                  <div className="report-field-block">
                    <h4 className="report-field-heading report-field-heading--highlight">启示</h4>
                    <EditableField
                      value={sd.insights}
                      onSave={html => saveSessionField(session.code, "insights", html)}
                      placeholder="记录启示与分析..."
                      readOnly={viewMode}
                    />
                  </div>
                  <div className="report-contributors-row" style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid #eee", marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: "#5f5e5e" }}>贡献人</span>
                    {Array.from(session.attendees || []).map(id => {
                      const name = memberMap[id];
                      if (!name) return null;
                      const colorIdx = memberColorMap[id] ?? 0;
                      const color = COLORS[colorIdx]?.hex || "#5f5e5e";
                      return (
                        <span key={id} style={{ background: color, color: "#fff", padding: "1px 8px", fontSize: 10, fontWeight: 600 }}>
                          {name}
                        </span>
                      );
                    })}
                    {sd.lastEditedBy && (() => {
                      const editorName = memberMap[sd.lastEditedBy] || "";
                      const ago = sd.lastEditedAt ? Math.round((Date.now() - sd.lastEditedAt) / 60000) : null;
                      if (!editorName) return null;
                      return (
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "#bbb" }}>
                          edited {ago !== null && ago < 60 ? `${ago}m ago` : ""} by {editorName}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                </>}
              </div>
            );
          })}

          {orderedTopics.map(topic => (
            <div key={topic}>
              {/* Topic section header */}
              <div className="report-topic-divider" id={`topic-${topicSlug(topic)}`}>
                <span className="report-topic-bar" />
                <span className="report-topic-name">{topic}</span>
                <span className="report-topic-line" />
              </div>

              {(topicsMap[topic] || []).map(session => {
                const sd = sessionData[session.code] || {};
                // Graceful migration: old single-speaker format → new array format
                const speakers = sd.speakers
                  || (sd.speaker
                    ? [{ name: sd.speaker, position: "", company: sd.company || "" }]
                    : [{ name: "", position: "", company: "" }]);
                const contributorNames = Array.from(session.attendees).map(id => memberMap[id]).filter(Boolean);
                const contributors = contributorNames.join("、");

                const isCollapsed = collapsedSessions.has(session.code);
                return (
                  <div key={session.code} id={`session-${session.code}`} className="report-session">

                    {/* Session Header: clickable to collapse */}
                    <div className="report-session-header" onClick={() => toggleCollapse(session.code)}
                      style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: isCollapsed ? 0 : 6 }}>
                          <span className="report-session-code" style={{ marginBottom: 0, flexShrink: 0 }}>
                            {session.code}
                          </span>
                          <h3 className="report-session-title" style={{ margin: 0 }}>
                            {SESSION_CATALOG.get(session.code)?.url
                              ? <a href={SESSION_CATALOG.get(session.code).url} target="_blank" rel="noopener noreferrer"
                                   style={{ color: "inherit", textDecoration: "none" }}
                                   onClick={e => e.stopPropagation()}
                                   onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                                   onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                                  {SESSION_CATALOG.get(session.code)?.title || session.title}
                                </a>
                              : SESSION_CATALOG.get(session.code)?.title || session.title
                            }
                          </h3>
                        </div>
                        {!isCollapsed && (
                          <div className="report-session-time">
                            {session.start}–{session.end}{session.room && ` | ${session.room}`}
                          </div>
                        )}
                      </div>
                      <span className="session-collapse-btn">{isCollapsed ? "▶" : "▼"}</span>
                    </div>

                    {!isCollapsed && <>
                    {/* Speakers */}
                    <div className="report-session-meta">
                      <SpeakersEditor
                        code={session.code}
                        speakers={speakers}
                        onUpdate={newSpeakers => saveSpeakers(session.code, newSpeakers)}
                        onAdd={() => addSpeaker(session.code)}
                        onRemove={idx => removeSpeaker(session.code, idx)}
                      />
                    </div>

                    {/* Illustration */}
                    <div style={{ padding: "6px 20px 0" }}>
                      {(() => {
                        const illus = getIllustrations({ ...sd, _code: session.code });
                        return (<>
                          {illus.length > 0 && (
                            <div className="session-illustrations-grid">
                              {illus.map((item, i) => (
                                <div key={i} className="session-illustration-item">
                                  <img src={item.url} className="session-illustration" alt={`插图${i + 1}`} />
                                  <button
                                    className="no-print session-illustration-del"
                                    onClick={() => handleIllustrationDelete(session.code, i)}
                                  >删除</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            className="no-print"
                            onClick={() => illustInputRefs.current[session.code]?.click()}
                            style={{
                              fontSize: 11, color: "var(--text-placeholder)", border: "1px dashed #DDDDDD",
                              background: "none", cursor: "pointer", padding: "5px 0",
                              borderRadius: 4, display: "block", textAlign: "center", width: "100%",
                              marginTop: illus.length > 0 ? 6 : 0,
                            }}
                          >
                            + 添加插图
                          </button>
                        </>);
                      })()}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        ref={el => { illustInputRefs.current[session.code] = el; }}
                        onChange={e => handleIllustration(session.code, e)}
                      />
                    </div>

                    {/* Body: takeaways & insights */}
                    <div className="report-session-body">
                      <div className="report-field-block">
                        <h4 className="report-field-heading report-field-heading--highlight">关键收获</h4>
                        <EditableField
                          value={sd.takeaways}
                          onSave={html => saveSessionField(session.code, "takeaways", html)}
                          placeholder="记录本场会议的关键收获..."
                          readOnly={viewMode}
                        />
                      </div>
                      <div className="report-field-block">
                        <h4 className="report-field-heading report-field-heading--highlight">启示</h4>
                        <EditableField
                          value={sd.insights}
                          onSave={html => saveSessionField(session.code, "insights", html)}
                          placeholder="记录启示与分析..."
                          readOnly={viewMode}
                        />
                      </div>

                      {/* 贡献人 at the end */}
                      {contributors && (
                        <div className="report-contributors-row">
                          <span className="report-contributors-label">贡献人</span>
                          <span className="report-contributors-names">{contributors}</span>
                        </div>
                      )}
                    </div>
                    </>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Onsite Section */}
        <div className="report-onsite">
          {/* 现场情报 */}
          <h2 id="section-onsite-info" className="report-section-title" style={{ marginTop: 32 }}>现场情报</h2>
          {(() => {
            const blocks = reportData?.onsiteInfoBlocks || [];
            const els = [
              <InlineAddButton key="add-start" field="onsiteInfoBlocks" afterId={null}
                openKey={openInlineMenu} onOpen={setOpenInlineMenu} onInsert={insertBlock} />,
            ];
            blocks.forEach(block => {
              if (block.type === 'heading') {
                els.push(
                  <div key={block.id} id={`block-${block.id}`} className="onsite-category-header" style={{ marginTop: 8 }}>
                    {viewMode ? (
                      <span className="onsite-category-title">{block.content}</span>
                    ) : (
                      <span contentEditable suppressContentEditableWarning className="onsite-category-title"
                        onBlur={e => updateBlock("onsiteInfoBlocks", block.id, e.currentTarget.textContent.trim())}
                        onPaste={e => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
                      >{block.content}</span>
                    )}
                    <button className="onsite-category-remove no-print" onClick={() => removeBlock("onsiteInfoBlocks", block.id)}>×</button>
                  </div>
                );
              } else {
                els.push(
                  <IntelCard key={block.id} block={block}
                    members={members}
                    onUpdate={fields => updateBlockFields("onsiteInfoBlocks", block.id, fields)}
                    onRemove={() => removeBlock("onsiteInfoBlocks", block.id)}
                    readOnly={viewMode}
                    currentUid={user?.uid}
                    memberColorMap={memberColorMap}
                    isAdmin={isConfAdmin}
                    conferenceSessions={allConferenceSessions}
                  />
                );
              }
              els.push(
                <InlineAddButton key={`add-${block.id}`} field="onsiteInfoBlocks" afterId={block.id}
                  openKey={openInlineMenu} onOpen={setOpenInlineMenu} onInsert={insertBlock} />
              );
            });
            return els;
          })()}

          {/* 圈内声音 */}
          <h2 id="section-reflections" className="report-section-title" style={{ marginTop: 24 }}>圈内声音</h2>
          {(() => {
            const blocks = reportData?.reflectionsBlocks || [];
            const els = [
              <InlineAddButton key="add-start" field="reflectionsBlocks" afterId={null}
                openKey={openInlineMenu} onOpen={setOpenInlineMenu} onInsert={insertBlock} />,
            ];
            blocks.forEach(block => {
              if (block.type === 'heading') {
                els.push(
                  <div key={block.id} id={`block-${block.id}`} className="onsite-category-header" style={{ marginTop: 8 }}>
                    {viewMode ? (
                      <span className="onsite-category-title">{block.content}</span>
                    ) : (
                      <span contentEditable suppressContentEditableWarning className="onsite-category-title"
                        onBlur={e => updateBlock("reflectionsBlocks", block.id, e.currentTarget.textContent.trim())}
                        onPaste={e => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
                      >{block.content}</span>
                    )}
                    <button className="onsite-category-remove no-print" onClick={() => removeBlock("reflectionsBlocks", block.id)}>×</button>
                  </div>
                );
              } else {
                els.push(
                  <IntelCard key={block.id} block={block}
                    members={members}
                    placeholder="记录圈内声音..."
                    onUpdate={fields => updateBlockFields("reflectionsBlocks", block.id, fields)}
                    onRemove={() => removeBlock("reflectionsBlocks", block.id)}
                    readOnly={viewMode}
                    currentUid={user?.uid}
                    memberColorMap={memberColorMap}
                    isAdmin={isConfAdmin}
                    conferenceSessions={allConferenceSessions}
                  />
                );
              }
              els.push(
                <InlineAddButton key={`add-${block.id}`} field="reflectionsBlocks" afterId={block.id}
                  openKey={openInlineMenu} onOpen={setOpenInlineMenu} onInsert={insertBlock} />
              );
            });
            return els;
          })()}

          {/* 深度研判 */}
          <h2 id="section-rumors" className="report-section-title" style={{ marginTop: 24 }}>深度研判</h2>
          <EditableField
            value={reportData?.rumors || ""}
            onSave={html => saveField("rumors", html)}
            placeholder="深度研判..."
            minHeight={120}
            readOnly={viewMode}
          />
        </div>

        {/* Site Photos Section */}
        <div id="section-site-photos" className="report-site-photos">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>现场记录</h2>
          <div className="site-photos-grid">
            {(() => {
              const rawPhotos = reportData?.sitePhotos || [];
              const sortedPhotos = rawPhotos
                .map((photo, originalIdx) => ({ ...photo, originalIdx }))
                .sort((a, b) => (a.source || "").localeCompare(b.source || ""));
              const cols = [[], []];
              const colH = [0, 0];
              for (const photo of sortedPhotos) {
                const col = colH[0] <= colH[1] ? 0 : 1;
                cols[col].push(photo);
                // Height proxy: image aspect ratio + caption length (CJK ≈ 2 units)
                const imgRatio = (photo.h && photo.w) ? photo.h / photo.w : 0.75;
                const captionLen = [...(photo.caption || '')].reduce((s, c) => s + (c.charCodeAt(0) > 0x2E7F ? 2 : 1), 0);
                colH[col] += imgRatio + captionLen / 50;
              }
              const addCol = colH[0] <= colH[1] ? 0 : 1;
              const renderCard = (photo) => (
                <div key={photo.originalIdx} className="site-photo-card">
                  <div className="site-photo-img-wrapper">
                    <img src={photo.image} alt={`现场记录 ${photo.originalIdx + 1}`} className="site-photo-img" />
                    {!viewMode && <button
                      className="site-photo-delete-btn no-print"
                      onClick={() => handleSitePhotoDelete(photo.originalIdx)}
                      title="删除图片"
                    >×</button>}
                  </div>
                  {viewMode ? (
                    <>
                      {photo.caption && <p className="site-photo-caption" style={{ whiteSpace: "pre-wrap" }}>{photo.caption}</p>}
                      {photo.source && <p className="site-photo-source" style={{ color: "var(--text-muted)", fontSize: "var(--report-fs-caption)" }}>{photo.source}</p>}
                    </>
                  ) : (
                    <>
                      <textarea
                        className="site-photo-caption"
                        placeholder="添加图片说明..."
                        defaultValue={photo.caption}
                        onBlur={e => saveSitePhotoCaption(photo.originalIdx, e.target.value)}
                        onInput={e => { const t = e.target; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                        ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                      />
                      <input
                        className="site-photo-source"
                        type="text"
                        placeholder="来源..."
                        defaultValue={photo.source || ""}
                        onBlur={e => saveSitePhotoSource(photo.originalIdx, e.target.value)}
                      />
                    </>
                  )}
                </div>
              );
              const addButton = (
                <div key="add" className="site-photo-add-card no-print" onClick={() => sitePhotoInputRef.current?.click()}>
                  <div className="site-photo-add-inner">
                    <span className="site-photo-add-icon">+</span>
                    <span className="site-photo-add-label">添加图片</span>
                  </div>
                </div>
              );
              return [0, 1].map(col => (
                <div key={col} className="site-photos-col">
                  {cols[col].map(renderCard)}
                  {!viewMode && addCol === col && addButton}
                </div>
              ));
            })()}
          </div>
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            ref={sitePhotoInputRef}
            onChange={handleSitePhotoAdd}
          />
        </div>

        {/* Footer */}
        <div className="report-footer">
          <div className="report-footer-inner">
            <p>{confName || "Conference"} · {date} · 团队协作生成</p>
          </div>
        </div>

      </div>

      {/* Floating back-to-TOC button — only when TOC is scrolled out of view */}
      {!tocVisible && (
        <a href="#report-toc" className="toc-float-btn no-print">↑ 目录</a>
      )}

      {/* Delete session — select session modal */}
      {!viewMode && showDeleteSelect && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteSelect(false)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: "90%" }}>
            <h3 className="delete-confirm-title">选择要删除的 Session</h3>
            <div style={{ maxHeight: 360, overflowY: "auto", margin: "8px 0" }}>
              {activeSessions.map(s => {
                const names = Array.from(s.attendees).map(id => memberMap[id]).filter(Boolean);
                return (
                  <button
                    key={s.code}
                    onClick={() => openDeleteConfirm(s.code, names)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 2,
                      width: "100%", textAlign: "left", padding: "8px 10px",
                      background: "none", border: "none", borderRadius: 6,
                      cursor: "pointer", borderBottom: "1px solid #F0F0F0",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#FFF5F5"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <span className="text-caption" style={{ fontWeight: 600, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                      {s.code}
                    </span>
                    <span className="text-caption" style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {SESSION_CATALOG.get(s.code)?.title || s.title}
                    </span>
                    {names.length > 0 && (
                      <span className="text-label" style={{ color: "var(--text-muted)" }}>贡献人：{names.join("、")}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setShowDeleteSelect(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Panel ────────────────────────────────────────── */}
      {!viewMode && showHistory && (() => {
        // Relative time helper
        const relativeTime = (date) => {
          if (!date) return "";
          const now = Date.now();
          const diff = now - date.getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 1) return "刚刚";
          if (mins < 60) return `${mins} 分钟前`;
          const hours = Math.floor(mins / 60);
          if (hours < 24) return `${hours} 小时前`;
          const days = Math.floor(hours / 24);
          if (days < 7) return `${days} 天前`;
          return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        };

        // No grouping — flat list, all versions equal

        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
            onClick={() => { setShowHistory(false); setViewingSnapshot(null); }} />
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0,
            width: viewingSnapshot ? "min(80%, 960px)" : "380px",
            background: "#fff", display: "flex", flexDirection: "column",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          }}>
            {/* Panel header */}
            <div style={{
              padding: "16px 20px", background: "#222", color: "#fff",
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}>
              {viewingSnapshot && (
                <button onClick={() => setViewingSnapshot(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 12 }}>
                  ← 返回
                </button>
              )}
              <h2 style={{ margin: 0, fontWeight: 700, flex: 1, fontSize: 14, fontFamily: "'Work Sans', sans-serif", letterSpacing: 0.5 }}>
                {viewingSnapshot ? "版本详情" : "版本历史"}
              </h2>
              <span style={{ fontSize: 10, color: "#666" }}>{snapshots.length} 个版本</span>
              <button onClick={() => { setShowHistory(false); setViewingSnapshot(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#666", lineHeight: 1 }}>✕</button>
            </div>

            {!viewingSnapshot ? (
              <div style={{ flex: 1, overflowY: "auto" }}>
                {/* Current version indicator */}
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, background: "#27AE60", borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1c1c" }}>当前版本</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>正在编辑中</div>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 8px", background: "#27AE60", color: "#fff", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "'Work Sans', sans-serif" }}>
                    Current
                  </span>
                </div>

                {/* Timeline */}
                {snapshots.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>暂无历史版本</div>
                    <div style={{ fontSize: 11, color: "#bbb" }}>每 5 分钟自动保存，或点击「手动保存」创建</div>
                  </div>
                ) : (
                  <div style={{ padding: "0 20px" }}>
                    {snapshots.map((snap, i) => {
                      const date = snap.createdAt?.toDate?.();
                      const isManual = snap.type === "manual";
                      const shortId = snap.id.slice(-6).toUpperCase();
                      return (
                        <div key={snap.id} style={{ display: "flex", gap: 12, paddingTop: 14, paddingBottom: 14, borderBottom: "1px solid #f3f3f3" }}>
                          {/* Timeline dot */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0, paddingTop: 2 }}>
                            <div style={{ width: 10, height: 10, background: "#a20513", borderRadius: "50%" }} />
                            {i < snapshots.length - 1 && <div style={{ flex: 1, width: 1, background: "#eee", marginTop: 4 }} />}
                          </div>
                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#888", fontFamily: "monospace" }}>#{shortId}</span>
                              <span style={{
                                fontSize: 9, padding: "1px 6px", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                                fontFamily: "'Work Sans', sans-serif",
                                background: isManual ? "rgba(162,5,19,0.08)" : "rgba(41,128,185,0.08)",
                                color: isManual ? "#a20513" : "#2980B9",
                              }}>
                                {isManual ? "Manual" : "Auto"}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "#1a1c1c", fontWeight: 600 }}>{date ? relativeTime(date) : "未知时间"}</div>
                            {date && <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>{date.toLocaleString("zh-CN")}</div>}
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <button onClick={() => setViewingSnapshot(snap)}
                                style={{ fontSize: 11, padding: "4px 14px", background: "#f3f3f3", border: "none", cursor: "pointer", color: "#555", fontWeight: 600 }}>
                                查看变更
                              </button>
                              <button onClick={() => handleRestore(snap)}
                                style={{ fontSize: 11, padding: "4px 14px", background: "none", border: "1px solid rgba(162,5,19,0.2)", cursor: "pointer", color: "#a20513", fontWeight: 600 }}>
                                恢复
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Snapshot viewer with diff */
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#888", fontFamily: "monospace" }}>
                    #{viewingSnapshot.id.slice(-6).toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: 9, padding: "1px 6px", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                    fontFamily: "'Work Sans', sans-serif",
                    background: viewingSnapshot.type === "manual" ? "rgba(162,5,19,0.08)" : "rgba(41,128,185,0.08)",
                    color: viewingSnapshot.type === "manual" ? "#a20513" : "#2980B9",
                  }}>
                    {viewingSnapshot.type === "manual" ? "Manual" : "Auto"}
                  </span>
                  <span style={{ fontSize: 11, color: "#888" }}>
                    {viewingSnapshot.createdAt?.toDate ? relativeTime(viewingSnapshot.createdAt.toDate()) : ""}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => handleRestore(viewingSnapshot)}
                    style={{ fontSize: 11, padding: "4px 14px", background: "none", border: "1px solid rgba(162,5,19,0.2)", cursor: "pointer", color: "#a20513", fontWeight: 600 }}>
                    恢复此版本
                  </button>
                </div>
                <SnapshotViewer snapshot={viewingSnapshot} currentData={reportDataRef.current} />
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Restore confirm modal */}
      {restoreConfirm && (
        <div className="delete-confirm-overlay" onClick={() => setRestoreConfirm(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="delete-confirm-title">确认恢复此版本？</h3>
            <p className="delete-confirm-desc">
              当前内容将被覆盖。恢复前会自动保存当前内容为快照，可随时在历史版本中找回。
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setRestoreConfirm(null)}>取消</button>
              <button className="delete-confirm-submit" onClick={confirmRestore}>确认恢复</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete session confirmation modal */}
      {!viewMode && deleteConfirm.code && (
        <div className="delete-confirm-overlay" onClick={() => setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false })}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="delete-confirm-title">从日报移除此 Session</h3>
            <p className="delete-confirm-desc">
              {deleteConfirm.contributorNames.length > 0
                ? <>请输入该 session 的贡献人姓名（{deleteConfirm.contributorNames.join("、")}）以确认删除。</>
                : <>该 session 无贡献人，请输入任意内容确认删除。</>
              }
            </p>
            <input
              className={`delete-confirm-input${deleteConfirm.error ? " delete-confirm-input--error" : ""}`}
              type="text"
              placeholder="输入姓名..."
              value={deleteConfirm.nameInput}
              autoFocus
              onChange={e => setDeleteConfirm(prev => ({ ...prev, nameInput: e.target.value, error: false }))}
              onKeyDown={e => { if (e.key === "Enter") confirmDeleteSession(); if (e.key === "Escape") setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false }); }}
            />
            {deleteConfirm.error && (
              <p className="delete-confirm-error">姓名不匹配，无法删除</p>
            )}
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false })}>取消</button>
              <button className="delete-confirm-submit" onClick={confirmDeleteSession}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
