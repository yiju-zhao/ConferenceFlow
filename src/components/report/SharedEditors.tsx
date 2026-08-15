/**
 * Shared UI components for report editing.
 * For constants, utils, and hooks, import directly from their source modules:
 *   - src/constants.js
 *   - src/lib/reportUtils.js
 *   - src/hooks/useDebouncedSave.js
 *   - src/sessionCatalog.js
 */
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { BlockField, ReportBlockType } from "../../types";

// ── EditableField ────────────────────────────────────────────────────────────
interface EditableFieldProps {
  value?: string;
  onSave: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}

export function EditableField({
  value,
  onSave,
  placeholder,
  minHeight = 60,
  readOnly = false,
}: EditableFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
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
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onInput={() => {
        if (ref.current) onSave(ref.current.innerHTML);
      }}
    />
  );
}

// ── InlineAddButton ───────────────────────────────────────────────────────────
interface InlineAddButtonProps {
  field: BlockField;
  afterId: string | null;
  openKey: string | null;
  variant?: "insertion" | "section";
  onOpen: (key: string | null) => void;
  onInsert: (field: BlockField, type: ReportBlockType, afterId: string | null) => void;
}

export function InlineAddButton({
  field,
  afterId,
  openKey,
  variant = "insertion",
  onOpen,
  onInsert,
}: InlineAddButtonProps) {
  const { t } = useTranslation();
  const isOpen = openKey === `${field}::${afterId}`;
  return (
    <div className={`inline-add-zone inline-add-zone--${variant} no-print`}>
      <button
        className="inline-add-btn"
        onClick={() => (isOpen ? onOpen(null) : onOpen(`${field}::${afterId}`))}
        title={t("report.insertBlock")}
      >
        {t("report.addBlock")}
      </button>
      {isOpen && (
        <div className="inline-add-popover">
          <button
            className="inline-add-popover-item"
            onClick={() => {
              onInsert(field, "heading", afterId);
              onOpen(null);
            }}
          >
            {t("report.subtitle")}
          </button>
          <button
            className="inline-add-popover-item"
            onClick={() => {
              onInsert(field, "body", afterId);
              onOpen(null);
            }}
          >
            {t("report.bodyText")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── BulletEditor ──────────────────────────────────────────────────────────────
interface BulletEditorProps {
  points?: string[];
  onSave: (points: string[]) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function BulletEditor({ points, onSave, placeholder, readOnly = false }: BulletEditorProps) {
  const { t } = useTranslation();
  const ph = placeholder || t("report.enterKeyPoints");
  const [local, setLocal] = useState<string[]>(points || []);
  const focused = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused.current) setLocal(points || []);
  }, [points]);

  useEffect(() => {
    if (!readOnly) {
      containerRef.current?.querySelectorAll<HTMLTextAreaElement>(".bullet-input").forEach((el) => {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      });
    }
  }, [local.length, readOnly]);

  if (readOnly) {
    const items = (points || []).filter(Boolean);
    if (items.length === 0) return null;
    return (
      <div className="bullet-editor">
        <ul className="bullet-editor-list">
          {items.map((point, idx) => (
            <li key={idx} className="bullet-editor-item">
              <span className="bullet-dot" aria-hidden="true">
                •
              </span>
              <span className="bullet-readonly-text">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const commit = (next: string[]) => {
    setLocal(next);
    onSave(next);
  };

  const handleChange = (idx: number, value: string) =>
    commit(local.map((p, i) => (i === idx ? value : p)));

  const handleAdd = () => commit([...local, ""]);

  const handleRemove = (idx: number) => commit(local.filter((_, i) => i !== idx));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...local.slice(0, idx + 1), "", ...local.slice(idx + 1)];
      commit(next);
      setTimeout(() => {
        const inputs = (e.target as HTMLElement)
          .closest(".bullet-editor-list")
          ?.querySelectorAll<HTMLTextAreaElement>(".bullet-input");
        if (inputs?.[idx + 1]) inputs[idx + 1].focus();
      }, 0);
    }
    if (e.key === "Backspace" && local[idx] === "" && local.length > 1) {
      e.preventDefault();
      const next = local.filter((_, i) => i !== idx);
      commit(next);
      setTimeout(() => {
        const inputs = (e.target as HTMLElement)
          .closest(".bullet-editor-list")
          ?.querySelectorAll<HTMLTextAreaElement>(".bullet-input");
        if (inputs?.[Math.max(0, idx - 1)]) inputs[Math.max(0, idx - 1)].focus();
      }, 0);
    }
  };

  return (
    <div
      ref={containerRef}
      className="bullet-editor"
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) focused.current = false;
      }}
    >
      <ul className="bullet-editor-list">
        {local.map((point, idx) => (
          <li key={idx} className="bullet-editor-item">
            <span className="bullet-dot" aria-hidden="true">
              •
            </span>
            <textarea
              className="bullet-input"
              value={point}
              placeholder={ph}
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
              title={t("report.deletePoint")}
              tabIndex={-1}
            >
              −
            </button>
          </li>
        ))}
      </ul>
      {local.length === 0 && <p className="bullet-editor-empty no-print">{ph}</p>}
      <button className="bullet-add-btn no-print" onClick={handleAdd}>
        {t("report.addPoint")}
      </button>
    </div>
  );
}
