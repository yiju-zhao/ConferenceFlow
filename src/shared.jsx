import { useState, useEffect, useRef, useCallback } from "react";
import catalogData from "../data/gtc-2026-sessions-detailed.json";

// ── Session catalog ─────────────────────────────────────────────────────────
export const SESSION_CATALOG = new Map(catalogData.map((s) => [s.session_id, s]));

// ── Report version helpers ──────────────────────────────────────────────────
export function parseReportId(reportId) {
  const m = reportId.match(/^(.+)-v(\d+)$/);
  return m
    ? { date: m[1], version: parseInt(m[2]), isLegacy: false }
    : { date: reportId, version: 1, isLegacy: true };
}

export function latestOrNewVersionId(date, allDocs) {
  if (allDocs.some(r => r.id === date)) return date;
  const vDocs = allDocs.filter(r => parseReportId(r.id).date === date);
  if (vDocs.length > 0) {
    const maxV = vDocs.reduce((max, r) => Math.max(max, parseReportId(r.id).version), 0);
    return `${date}-v${maxV}`;
  }
  return date;
}

// ── Summary ID generator ─────────────────────────────────────────────────────
export function generateSummaryId(existingDocs) {
  const summaryDocs = existingDocs
    .filter(d => d.id.startsWith("summary-GTC2026"))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (summaryDocs.length === 0) return "summary-GTC2026";
  const versions = summaryDocs.map(d => {
    const m = d.id.match(/-v(\d+)$/);
    return m ? parseInt(m[1]) : 1;
  });
  return `summary-GTC2026-v${Math.max(...versions) + 1}`;
}

// ── Member color palette (light-theme tuned) ────────────────────────────────
export const COLORS = [
  { hex: "#CF0A2C", bg: "rgba(207,10,44,0.08)",  glow: "rgba(207,10,44,0.20)" },
  { hex: "#2980B9", bg: "rgba(41,128,185,0.10)",  glow: "rgba(41,128,185,0.25)" },
  { hex: "#E67E22", bg: "rgba(230,126,34,0.10)",  glow: "rgba(230,126,34,0.25)" },
  { hex: "#8E44AD", bg: "rgba(142,68,173,0.10)",  glow: "rgba(142,68,173,0.25)" },
  { hex: "#27AE60", bg: "rgba(39,174,96,0.10)",   glow: "rgba(39,174,96,0.25)" },
  { hex: "#2C3E50", bg: "rgba(44,62,80,0.08)",    glow: "rgba(44,62,80,0.20)" },
];

// ── Color presets for rich text formatting ───────────────────────────────────
export const COLOR_PRESETS = ["#333333", "#CF0A2C", "#E67E22", "#27AE60", "#2980B9", "#8E44AD"];

// ── Chinese day names ───────────────────────────────────────────────────────
export const DAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// ── Debounce helper ──────────────────────────────────────────────────────────
export function useDebouncedSave(delay = 600) {
  const timers = useRef({});
  const pending = useRef(0);
  const savedTimer = useRef(null);
  const [saveState, setSaveState] = useState("idle");
  const debouncedSave = useCallback((key, fn) => {
    if (!timers.current[key]) pending.current += 1;
    else clearTimeout(timers.current[key]);
    setSaveState("saving");
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      pending.current -= 1;
      Promise.resolve(fn()).finally(() => {
        if (pending.current === 0) {
          setSaveState("saved");
          clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        }
      });
    }, delay);
  }, [delay]);
  return { debouncedSave, saveState };
}

// ── EditableField ────────────────────────────────────────────────────────────
export function EditableField({ value, onSave, placeholder, minHeight = 60, readOnly = false }) {
  const ref = useRef(null);
  const focused = useRef(false);
  useEffect(() => {
    if (ref.current && !focused.current && value !== undefined) {
      if (ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
    }
  }, [value]);

  if (readOnly) {
    return (
      <div
        className="report-editable report-editable--readonly"
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: value || "" }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className="report-editable"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      style={{ minHeight }}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; }}
      onInput={() => { if (ref.current) onSave(ref.current.innerHTML); }}
    />
  );
}

// ── InlineAddButton ───────────────────────────────────────────────────────────
export function InlineAddButton({ field, afterId, openKey, onOpen, onInsert }) {
  const isOpen = openKey === `${field}::${afterId}`;
  return (
    <div className="inline-add-zone no-print">
      <button
        className="inline-add-btn"
        onClick={() => isOpen ? onOpen(null) : onOpen(`${field}::${afterId}`)}
        title="插入 block"
      >+</button>
      {isOpen && (
        <div className="inline-add-popover">
          <button className="inline-add-popover-item" onClick={() => { onInsert(field, 'heading', afterId); onOpen(null); }}>小标题</button>
          <button className="inline-add-popover-item" onClick={() => { onInsert(field, 'body', afterId); onOpen(null); }}>正文</button>
        </div>
      )}
    </div>
  );
}

// ── SectionInlineAdd ─────────────────────────────────────────────────────────
export function SectionInlineAdd({ sectionName, afterId, openKey, onOpen, onInsert, blockTypes }) {
  const isOpen = openKey === `${sectionName}::${afterId}`;
  return (
    <div className="inline-add-zone no-print">
      <button
        className="inline-add-btn"
        onClick={() => isOpen ? onOpen(null) : onOpen(`${sectionName}::${afterId}`)}
        title="插入 block"
      >+</button>
      {isOpen && (
        <div className="inline-add-popover">
          {blockTypes.map(({ type, label, extraFields }) => (
            <button key={type} className="inline-add-popover-item" onClick={() => {
              onInsert(sectionName, type, afterId, extraFields);
              onOpen(null);
            }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── BulletEditor ──────────────────────────────────────────────────────────────
export function BulletEditor({ points, onSave, placeholder = "请输入要点...", readOnly = false }) {
  const [local, setLocal] = useState(points || []);
  const focused = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!focused.current) setLocal(points || []);
  }, [points]);

  // Resize all textareas whenever content changes (handles initial load)
  useEffect(() => {
    if (!readOnly) {
      containerRef.current?.querySelectorAll(".bullet-input").forEach(el => {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      });
    }
  }, [local, readOnly]);

  if (readOnly) {
    const items = (points || []).filter(Boolean);
    if (items.length === 0) return null;
    return (
      <div className="bullet-editor">
        <ul className="bullet-editor-list">
          {items.map((point, idx) => (
            <li key={idx} className="bullet-editor-item">
              <span className="bullet-dot" aria-hidden="true">•</span>
              <span className="bullet-readonly-text">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const commit = (next) => { setLocal(next); onSave(next); };

  const handleChange = (idx, value) =>
    commit(local.map((p, i) => (i === idx ? value : p)));

  const handleAdd = () => commit([...local, ""]);

  const handleRemove = (idx) => commit(local.filter((_, i) => i !== idx));

  const handleKeyDown = (e, idx) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...local.slice(0, idx + 1), "", ...local.slice(idx + 1)];
      commit(next);
      setTimeout(() => {
        const inputs = e.target.closest(".bullet-editor-list")
          ?.querySelectorAll(".bullet-input");
        if (inputs?.[idx + 1]) inputs[idx + 1].focus();
      }, 0);
    }
    if (e.key === "Backspace" && local[idx] === "" && local.length > 1) {
      e.preventDefault();
      const next = local.filter((_, i) => i !== idx);
      commit(next);
      setTimeout(() => {
        const inputs = e.target.closest(".bullet-editor-list")
          ?.querySelectorAll(".bullet-input");
        if (inputs?.[Math.max(0, idx - 1)]) inputs[Math.max(0, idx - 1)].focus();
      }, 0);
    }
  };

  return (
    <div
      ref={containerRef}
      className="bullet-editor"
      onFocus={() => { focused.current = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) focused.current = false; }}
    >
      <ul className="bullet-editor-list">
        {local.map((point, idx) => (
          <li key={idx} className="bullet-editor-item">
            <span className="bullet-dot" aria-hidden="true">•</span>
            <textarea
              className="bullet-input"
              value={point}
              placeholder={placeholder}
              rows={1}
              onChange={(e) => {
                handleChange(idx, e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  handleKeyDown(e, idx);
                } else if (e.key === "Backspace") {
                  handleKeyDown(e, idx);
                }
              }}
            />
            <button
              className="bullet-remove-btn no-print"
              onClick={() => handleRemove(idx)}
              title="删除此要点"
              tabIndex={-1}
            >−</button>
          </li>
        ))}
      </ul>
      {local.length === 0 && (
        <p className="bullet-editor-empty no-print">{placeholder}</p>
      )}
      <button className="bullet-add-btn no-print" onClick={handleAdd}>
        + 添加要点
      </button>
    </div>
  );
}
