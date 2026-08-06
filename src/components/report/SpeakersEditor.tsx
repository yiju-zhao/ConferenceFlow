import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ReportSpeaker } from "../../types";

interface SpeakerInputProps {
  value?: string;
  placeholder?: string;
  onChange: (v: string) => void;
}

export function SpeakerInput({ value, placeholder, onChange }: SpeakerInputProps) {
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
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

interface SpeakersEditorProps {
  code?: string; // accepted for caller compatibility; not read
  speakers: ReportSpeaker[];
  onUpdate: (speakers: ReportSpeaker[]) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  readOnly?: boolean;
}

export default function SpeakersEditor({
  speakers,
  onUpdate,
  onAdd,
  onRemove,
  readOnly = false,
}: SpeakersEditorProps) {
  const { t } = useTranslation();
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
              placeholder={t("report.speakerName")}
              onChange={(v) => {
                const updated = speakers.map((s, i) => (i === idx ? { ...s, name: v } : s));
                onUpdate(updated);
              }}
            />
            <SpeakerInput
              value={spk.position}
              placeholder={t("report.speakerTitle")}
              onChange={(v) => {
                const updated = speakers.map((s, i) => (i === idx ? { ...s, position: v } : s));
                onUpdate(updated);
              }}
            />
            <SpeakerInput
              value={spk.company}
              placeholder={t("report.speakerCompany")}
              onChange={(v) => {
                const updated = speakers.map((s, i) => (i === idx ? { ...s, company: v } : s));
                onUpdate(updated);
              }}
            />
            {speakers.length > 1 && (
              <button
                className="no-print"
                onClick={() => onRemove(idx)}
                title={t("report.deleteSpeaker")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--brand)",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "0 4px",
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
          background: "none",
          border: "1px dashed var(--brand)",
          color: "var(--brand)",
          cursor: "pointer",
          fontSize: 12.5,
          padding: "3px 12px",
          borderRadius: 4,
          marginTop: 4,
        }}
      >
        {t("report.addSpeaker")}
      </button>
    </div>
  );
}
