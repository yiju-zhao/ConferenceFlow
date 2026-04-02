/**
 * Barrel re-export file — maintains backward compatibility.
 * Prefer importing directly from the source modules:
 *   - constants: src/constants.js
 *   - report utils: src/lib/reportUtils.js
 *   - hooks: src/hooks/useDebouncedSave.js
 *   - components: this file (EditableField, BulletEditor, InlineAddButton, SectionInlineAdd)
 */

// Re-export constants
export { COLORS, COLOR_PRESETS, DAY_CN } from "./constants";
export { SESSION_CATALOG } from "./sessionCatalog";

// Re-export report utilities
export { parseReportId, latestOrNewVersionId, generateSummaryId, getInitials, generateId } from "./lib/reportUtils";

// Re-export hooks
export { useDebouncedSave } from "./hooks/useDebouncedSave";

// ── Components remain here ──────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";

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
      >添加 block</button>
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
      >添加 block</button>
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
