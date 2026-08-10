import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Callout,
  Card,
  Classes,
  Dialog,
  FormGroup,
  InputGroup,
} from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { apiFetch } from "../../lib/api";
import { useConferenceSessions } from "../../hooks/useConferenceSessions";
import type { ChangeEvent, CSSProperties } from "react";

interface SessionForm {
  id?: string;
  code?: string;
  title: string;
  date: string;
  start: string;
  end: string;
  room?: string;
  format?: string;
  mainTopic?: string;
  url?: string;
}

interface SessionEditModal {
  mode: "add" | "edit";
  session: SessionForm;
}

interface SessionUploadResult {
  error?: string;
  message?: string;
  errors?: { index: number; error: string; session: string }[];
}

interface SessionFieldProps {
  label: string;
  field: string;
  type?: string;
  value: string | undefined;
  onChange: (field: string, value: string) => void;
}

const FORMAT_GUIDE_MD = `# Session Upload JSON Format Guide

## Required Fields
| Field | Format | Example |
|-------|--------|---------|
| title | string | "Keynote: Future of AI" |
| date | YYYY-MM-DD | "2026-03-18" |
| start | HH:MM (24h) | "09:00" |
| end | HH:MM (24h) | "10:30" |

## Optional Fields
| Field | Description | Alias |
|-------|-------------|-------|
| session_id | Unique code (used as doc ID) | code |
| room | Room or venue name | location |
| speakers | Array of {name, title, company} | — |
| format | "In-Person", "Virtual", "Both" | — |
| recording | "Yes" or "No" | — |
| session_type | "Talk", "Panel", "Keynote", etc. | sessionType |
| topic | Primary topic/category | mainTopic |
| url | Link to official session page | — |
| key_themes | Array of topic tags | keyThemes |

## Speaker Object
\`\`\`json
{ "name": "Dr. Jane Smith", "title": "Chief Scientist", "company": "NVIDIA" }
\`\`\`

## Complete Example
\`\`\`json
[
  {
    "session_id": "S62911",
    "title": "NVIDIA AI Factory Architecture Deep Dive",
    "date": "2026-03-18",
    "start": "09:00",
    "end": "10:30",
    "room": "Hall A",
    "speakers": [{ "name": "Jensen Huang", "title": "CEO", "company": "NVIDIA" }],
    "format": "In-Person",
    "recording": "Yes",
    "session_type": "Keynote",
    "topic": "AI Infrastructure",
    "url": "https://example.com/session/S62911",
    "key_themes": ["AI", "Infrastructure", "Data Center"]
  }
]
\`\`\`

## Minimal Example
\`\`\`json
[
  { "title": "Morning Keynote", "date": "2026-03-18", "start": "09:00", "end": "10:00" },
  { "title": "Lunch Workshop", "date": "2026-03-18", "start": "12:00", "end": "13:00" }
]
\`\`\`

## Notes
- Maximum 1000 sessions per upload
- Sessions missing required fields are skipped
- If session_id matches an existing session, it will be overwritten
`;

const thStyle: CSSProperties = {
  padding: 12,
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
  color: "var(--text-secondary)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: 600,
};
const tdStyle: CSSProperties = {
  padding: 12,
  borderTop: "1px solid var(--border)",
  fontSize: 14,
};

const guideHeadingStyle: CSSProperties = {
  color: "var(--accent-admin)",
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 8px",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const guidePreStyle: CSSProperties = {
  background: "var(--surface-warm)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 12,
  fontSize: 12,
  fontFamily: "monospace",
  overflowX: "auto",
  color: "var(--text-primary)",
  margin: 0,
};

function SessionField({ label, field, type = "text", value, onChange }: SessionFieldProps) {
  return (
    <FormGroup label={label}>
      <InputGroup
        type={type}
        value={value || ""}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </FormGroup>
  );
}

export default function AdminSessions() {
  const { t } = useTranslation();
  const { confId } = useParams();
  const { sessions } = useConferenceSessions(confId);
  const [search, setSearch] = useState("");
  const [editModal, setEditModal] = useState<SessionEditModal | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<SessionUploadResult | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [mdCopied, setMdCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.code?.toLowerCase().includes(q) ||
      s.mainTopic?.toLowerCase().includes(q)
    );
  });

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const sessionsArr = Array.isArray(json) ? json : json.sessions || [json];
      const result = await apiFetch<SessionUploadResult>(
        `/api/conferences/${confId}/sessions/bulk`,
        { method: "POST", body: JSON.stringify({ sessions: sessionsArr }) },
      );
      setUploadResult(result);
    } catch (err) {
      setUploadResult({
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveSession = async () => {
    if (!editModal) return;
    const { mode, session } = editModal;
    try {
      if (mode === "add") {
        await apiFetch(`/api/conferences/${confId}/sessions`, {
          method: "POST",
          body: JSON.stringify(session),
        });
      } else {
        await apiFetch(`/api/conferences/${confId}/sessions/${session.id}`, {
          method: "PUT",
          body: JSON.stringify(session),
        });
      }
      setEditModal(null);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (sessionId: string) => {
    setDeleting(sessionId);
    try {
      await apiFetch(`/api/conferences/${confId}/sessions/${sessionId}`, {
        method: "DELETE",
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setEditModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        session: { ...prev.session, [field]: value },
      };
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <div style={{ width: 4, height: 24, borderRadius: 9999, background: "var(--accent)" }} />
        <h2
          style={{
            fontFamily: "'Work Sans', sans-serif",
            color: "var(--text-primary)",
            fontSize: 18,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          {t("admin.sessionManagement")}
        </h2>
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <InputGroup
          leftIcon={IconNames.SEARCH}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("calendar.searchSessions")}
          style={{ width: 256 }}
        />
        <Button
          intent="primary"
          icon={IconNames.PLUS}
          text={t("admin.addSession")}
          onClick={() =>
            setEditModal({
              mode: "add",
              session: {
                code: "",
                title: "",
                date: "",
                start: "",
                end: "",
                room: "",
                format: "",
                mainTopic: "",
                url: "",
              },
            })
          }
        />
        <Button
          outlined
          icon={IconNames.UPLOAD}
          text={uploading ? t("admin.uploadingJson") : t("admin.uploadJson")}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleBulkUpload}
          style={{ display: "none" }}
        />
        <Button
          minimal
          icon={IconNames.HELP}
          text={t("admin.formatGuide")}
          onClick={() => setShowFormatGuide(true)}
        />
        <span style={{ color: "var(--text-secondary)", fontSize: 12, marginLeft: "auto" }}>
          {sessions.length} {t("admin.sessionsTotal")}
        </span>
      </div>
      {uploadResult && (
        <Callout
          intent={uploadResult.error ? "danger" : "success"}
          style={{ marginBottom: 16 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>
              {uploadResult.error
                ? `${t("admin.uploadFailed")}${uploadResult.error}`
                : `${uploadResult.message}${uploadResult.errors?.length ? ` (${uploadResult.errors.length} errors)` : ""}`}
            </span>
            <Button minimal small icon={IconNames.CROSS} onClick={() => setUploadResult(null)} />
          </div>
        </Callout>
      )}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-warm)" }}>
              <th style={thStyle}>{t("admin.code")}</th>
              <th style={thStyle}>{t("admin.title")}</th>
              <th style={thStyle}>{t("admin.date")}</th>
              <th style={thStyle}>{t("admin.time")}</th>
              <th style={thStyle}>{t("admin.room")}</th>
              <th style={{ ...thStyle, width: 128 }}>{t("admin.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td
                  style={{
                    ...tdStyle,
                    color: "var(--accent-admin)",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {s.code}
                </td>
                <td style={{ ...tdStyle, color: "var(--text-primary)" }}>{s.title}</td>
                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{s.date}</td>
                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                  {s.start}–{s.end}
                </td>
                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{s.room}</td>
                <td style={tdStyle}>
                  <Button
                    minimal
                    small
                    icon={IconNames.EDIT}
                    text={t("admin.edit")}
                    onClick={() => setEditModal({ mode: "edit", session: { ...s } })}
                  />
                  <Button
                    minimal
                    small
                    intent="danger"
                    icon={IconNames.TRASH}
                    text={deleting === s.id ? "..." : t("common.delete")}
                    onClick={() => handleDelete(s.id)}
                    disabled={deleting === s.id}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                  }}
                >
                  {search ? t("admin.noSessionsMatchSearch") : t("admin.noSessionsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        title={editModal?.mode === "add" ? t("admin.addSession") : t("admin.editSession")}
        icon={editModal?.mode === "add" ? IconNames.PLUS : IconNames.EDIT}
        style={{ width: 520 }}
      >
        {editModal && (
          <>
            <div className={Classes.DIALOG_BODY}>
              <SessionField
                label={t("admin.sessionCode")}
                field="code"
                value={editModal.session.code}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.title")}
                field="title"
                value={editModal.session.title}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.date")}
                field="date"
                type="date"
                value={editModal.session.date}
                onChange={handleFieldChange}
              />
              <div style={{ display: "flex", gap: 12 }}>
                <FormGroup label={t("admin.startTime")} style={{ flex: 1 }}>
                  <InputGroup
                    type="time"
                    value={editModal.session.start || ""}
                    onChange={(e) => handleFieldChange("start", e.target.value)}
                  />
                </FormGroup>
                <FormGroup label={t("admin.endTime")} style={{ flex: 1 }}>
                  <InputGroup
                    type="time"
                    value={editModal.session.end || ""}
                    onChange={(e) => handleFieldChange("end", e.target.value)}
                  />
                </FormGroup>
              </div>
              <SessionField
                label={t("admin.room")}
                field="room"
                value={editModal.session.room}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.format")}
                field="format"
                value={editModal.session.format}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.topic")}
                field="mainTopic"
                value={editModal.session.mainTopic}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.url")}
                field="url"
                value={editModal.session.url}
                onChange={handleFieldChange}
              />
            </div>
            <div className={Classes.DIALOG_FOOTER}>
              <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                <Button onClick={() => setEditModal(null)} text={t("common.cancel")} />
                <Button
                  intent="primary"
                  onClick={handleSaveSession}
                  text={editModal.mode === "add" ? t("admin.create") : t("common.save")}
                />
              </div>
            </div>
          </>
        )}
      </Dialog>

      {/* Format Guide Dialog */}
      <Dialog
        isOpen={showFormatGuide}
        onClose={() => setShowFormatGuide(false)}
        title={t("admin.jsonFormatGuide")}
        icon={IconNames.HELP}
        style={{ width: 720 }}
      >
        <div className={Classes.DIALOG_BODY} style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
            {t("admin.formatGuideDesc")}
          </p>

          <div style={{ marginBottom: 20 }}>
            <h4 style={guideHeadingStyle}>
              <span
                style={{
                  width: 4,
                  height: 16,
                  borderRadius: 9999,
                  background: "var(--accent-admin)",
                  display: "inline-block",
                }}
              />
              {t("admin.requiredFields")}
            </h4>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-warm)" }}>
                    <th style={thStyle}>Field</th>
                    <th style={thStyle}>Format</th>
                    <th style={thStyle}>Example</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--accent-admin)" }}>
                      title
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-primary)" }}>string</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                      "Keynote: Future of AI"
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--accent-admin)" }}>
                      date
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-primary)" }}>YYYY-MM-DD</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>"2026-03-18"</td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--accent-admin)" }}>
                      start
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-primary)" }}>HH:MM (24h)</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>"09:00"</td>
                  </tr>
                  <tr>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--accent-admin)" }}>
                      end
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-primary)" }}>HH:MM (24h)</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>"10:30"</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h4 style={guideHeadingStyle}>
              <span
                style={{
                  width: 4,
                  height: 16,
                  borderRadius: 9999,
                  background: "var(--accent-admin)",
                  display: "inline-block",
                }}
              />
              {t("admin.optionalFields")}
            </h4>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-warm)" }}>
                    <th style={thStyle}>Field</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Alias</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["session_id", 'Unique code (e.g. "S62911"). Used as document ID.', "code"],
                    ["room", "Room or venue name", "location"],
                    ["speakers", "Array of speaker objects", "—"],
                    ["format", '"In-Person", "Virtual", "Both"', "—"],
                    ["recording", '"Yes" or "No"', "—"],
                    ["session_type", '"Talk", "Panel", "Keynote", "Workshop"', "sessionType"],
                    ["topic", "Primary topic/category", "mainTopic"],
                    ["url", "Link to official session page", "—"],
                    ["key_themes", "Array of topic tags for filtering", "keyThemes"],
                  ].map(([field, desc, alias]) => (
                    <tr key={field}>
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: "monospace",
                          color: "var(--accent-admin)",
                        }}
                      >
                        {field}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--text-primary)" }}>{desc}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: "var(--text-secondary)",
                          fontFamily: "monospace",
                        }}
                      >
                        {alias}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h4 style={guideHeadingStyle}>
              <span
                style={{
                  width: 4,
                  height: 16,
                  borderRadius: 9999,
                  background: "var(--accent-admin)",
                  display: "inline-block",
                }}
              />
              {t("admin.speakerObject")}
            </h4>
            <pre style={guidePreStyle}>{`{ "name": "Dr. Jane Smith", "title": "Chief Scientist", "company": "NVIDIA" }`}</pre>
          </div>

          <div style={{ marginBottom: 20 }}>
            <h4 style={guideHeadingStyle}>
              <span
                style={{
                  width: 4,
                  height: 16,
                  borderRadius: 9999,
                  background: "var(--accent-admin)",
                  display: "inline-block",
                }}
              />
              {t("admin.completeExample")}
            </h4>
            <pre style={{ ...guidePreStyle, whiteSpace: "pre-wrap" }}>{`[
  {
    "session_id": "S62911",
    "title": "NVIDIA AI Factory Architecture Deep Dive",
    "date": "2026-03-18",
    "start": "09:00",
    "end": "10:30",
    "room": "Hall A",
    "speakers": [
      { "name": "Jensen Huang", "title": "CEO", "company": "NVIDIA" }
    ],
    "format": "In-Person",
    "recording": "Yes",
    "session_type": "Keynote",
    "topic": "AI Infrastructure",
    "url": "https://example.com/session/S62911",
    "key_themes": ["AI", "Infrastructure", "Data Center"]
  }
]`}</pre>
          </div>

          <div style={{ marginBottom: 8 }}>
            <h4 style={guideHeadingStyle}>
              <span
                style={{
                  width: 4,
                  height: 16,
                  borderRadius: 9999,
                  background: "var(--accent-admin)",
                  display: "inline-block",
                }}
              />
              {t("admin.minimalExample")}
            </h4>
            <pre style={{ ...guidePreStyle, whiteSpace: "pre-wrap" }}>{`[
  { "title": "Morning Keynote", "date": "2026-03-18", "start": "09:00", "end": "10:00" },
  { "title": "Lunch Workshop", "date": "2026-03-18", "start": "12:00", "end": "13:00" }
]`}</pre>
          </div>

          <Callout style={{ marginTop: 16 }}>
            <strong>{t("admin.note")}:</strong> {t("admin.formatGuideNote")}
          </Callout>
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button
              icon={IconNames.CLIPBOARD}
              text={mdCopied ? t("admin.copied") : t("admin.copyAsMarkdown")}
              onClick={() => {
                navigator.clipboard.writeText(FORMAT_GUIDE_MD);
                setMdCopied(true);
                setTimeout(() => setMdCopied(false), 2000);
              }}
            />
            <Button
              intent="primary"
              text={t("common.close")}
              onClick={() => setShowFormatGuide(false)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
