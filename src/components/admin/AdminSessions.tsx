import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api";
import { useConferenceSessions } from "../../hooks/useConferenceSessions";
import type { ChangeEvent } from "react";

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

function SessionField({ label, field, type = "text", value, onChange }: SessionFieldProps) {
  return (
    <div className="mb-3">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full bg-[#F7F5F2] border border-[#E8E4DF] rounded-md px-3 py-2.5 text-on-surface text-sm focus:border-admin-teal focus:ring-1 focus:ring-admin-teal/20 focus:outline-none transition-colors"
      />
    </div>
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
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1 h-6 rounded-full bg-admin-teal"></div>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          {t("admin.sessionManagement")}
        </h2>
      </div>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("calendar.searchSessions")}
          className="bg-[#F7F5F2] border border-[#E8E4DF] rounded-md px-3 py-2.5 text-on-surface text-sm w-64 focus:border-admin-teal focus:ring-1 focus:ring-admin-teal/20 focus:outline-none transition-colors"
        />
        <button
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
          className="bg-admin-teal text-white px-4 py-2.5 text-xs font-headline uppercase tracking-wider hover:bg-admin-teal-deep transition-all duration-150 rounded-lg shadow-sm hover:shadow"
        >
          {t("admin.addSession")}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-white border border-[#E8E4DF] text-secondary px-4 py-2.5 text-xs font-headline uppercase tracking-wider hover:border-admin-teal/30 hover:text-on-surface transition-all duration-150 disabled:opacity-50 rounded-lg"
        >
          {uploading ? t("admin.uploadingJson") : t("admin.uploadJson")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleBulkUpload}
          className="hidden"
        />
        <button
          onClick={() => setShowFormatGuide(true)}
          className="text-secondary text-xs hover:text-admin-teal transition-colors underline"
        >
          {t("admin.formatGuide")}
        </button>
        <span className="text-secondary text-xs">
          {sessions.length} {t("admin.sessionsTotal")}
        </span>
      </div>
      {uploadResult && (
        <div
          className={`p-3 mb-4 text-sm rounded-lg ${uploadResult.error ? "bg-red-500/10 text-red-600 border border-red-200" : "bg-[#27AE60]/10 text-[#27AE60] border border-[#27AE60]/20"}`}
        >
          {uploadResult.error
            ? `${t("admin.uploadFailed")}${uploadResult.error}`
            : `${uploadResult.message}${uploadResult.errors?.length ? ` (${uploadResult.errors.length} errors)` : ""}`}
          <button
            onClick={() => setUploadResult(null)}
            className="ml-3 opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
      <div className="bg-white border border-[#E8E4DF] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-secondary text-xs uppercase tracking-wider bg-[#F7F5F2]">
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.code")}</th>
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.title")}</th>
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.date")}</th>
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.time")}</th>
              <th className="p-3 border-b border-[#E8E4DF]">{t("admin.room")}</th>
              <th className="p-3 w-32 border-b border-[#E8E4DF]">{t("admin.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className="border-t border-[#E8E4DF] hover:bg-[#FAFAF8] transition-colors"
              >
                <td className="p-3 text-admin-teal font-mono text-xs">{s.code}</td>
                <td className="p-3 text-on-surface">{s.title}</td>
                <td className="p-3 text-secondary">{s.date}</td>
                <td className="p-3 text-secondary">
                  {s.start}–{s.end}
                </td>
                <td className="p-3 text-secondary">{s.room}</td>
                <td className="p-3">
                  <button
                    onClick={() => setEditModal({ mode: "edit", session: { ...s } })}
                    className="text-admin-teal text-xs uppercase tracking-wider mr-3 hover:underline"
                  >
                    {t("admin.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={deleting === s.id}
                    className="text-secondary text-xs uppercase tracking-wider hover:text-red-600 disabled:opacity-50"
                  >
                    {deleting === s.id ? "..." : t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-secondary text-sm">
                  {search ? t("admin.noSessionsMatchSearch") : t("admin.noSessionsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setEditModal(null)}
        >
          <div
            className="bg-white w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-admin-teal h-1 rounded-t-xl"></div>
            <div className="p-6">
              <h3 className="font-headline text-on-surface font-bold text-base mb-4 uppercase">
                {editModal.mode === "add" ? t("admin.addSession") : t("admin.editSession")}
              </h3>
              <SessionField
                label={t("admin.sessionCode")}
                field="code"
                value={editModal?.session?.code}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.title")}
                field="title"
                value={editModal?.session?.title}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.date")}
                field="date"
                type="date"
                value={editModal?.session?.date}
                onChange={handleFieldChange}
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <SessionField
                    label={t("admin.startTime")}
                    field="start"
                    type="time"
                    value={editModal?.session?.start}
                    onChange={handleFieldChange}
                  />
                </div>
                <div className="flex-1">
                  <SessionField
                    label={t("admin.endTime")}
                    field="end"
                    type="time"
                    value={editModal?.session?.end}
                    onChange={handleFieldChange}
                  />
                </div>
              </div>
              <SessionField
                label={t("admin.room")}
                field="room"
                value={editModal?.session?.room}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.format")}
                field="format"
                value={editModal?.session?.format}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.topic")}
                field="mainTopic"
                value={editModal?.session?.mainTopic}
                onChange={handleFieldChange}
              />
              <SessionField
                label={t("admin.url")}
                field="url"
                value={editModal?.session?.url}
                onChange={handleFieldChange}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setEditModal(null)}
                  className="flex-1 bg-white border border-[#E8E4DF] p-2.5 text-secondary text-sm uppercase tracking-wider hover:text-on-surface hover:border-admin-teal/30 rounded-lg transition-all"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSaveSession}
                  className="flex-1 bg-admin-teal text-white p-2.5 text-sm font-headline uppercase tracking-wider hover:bg-admin-teal-deep rounded-lg shadow-sm hover:shadow transition-all"
                >
                  {editModal.mode === "add" ? t("admin.create") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Format Guide Modal */}
      {showFormatGuide && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowFormatGuide(false)}
        >
          <div
            className="bg-white w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-admin-teal h-1 rounded-t-xl"></div>
            <div className="bg-admin-teal px-6 py-4 flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-on-primary font-headline font-bold text-base uppercase tracking-wider">
                {t("admin.jsonFormatGuide")}
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(FORMAT_GUIDE_MD);
                    setMdCopied(true);
                    setTimeout(() => setMdCopied(false), 2000);
                  }}
                  className="text-on-primary/70 hover:text-on-primary text-xs font-headline uppercase tracking-wider bg-white/15 px-3 py-1 rounded-md transition-colors"
                >
                  {mdCopied ? t("admin.copied") : t("admin.copyAsMarkdown")}
                </button>
                <button
                  onClick={() => setShowFormatGuide(false)}
                  className="text-on-primary/60 hover:text-on-primary text-lg"
                >
                  ×
                </button>
              </div>
            </div>
            <div
              className="px-6 py-5"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                lineHeight: 1.7,
                color: "#1a1c1c",
              }}
            >
              <p className="text-secondary text-sm mb-4">{t("admin.formatGuideDesc")}</p>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-admin-teal mb-2 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-admin-teal"></div>{" "}
                  {t("admin.requiredFields")}
                </h4>
                <div className="border border-[#E8E4DF] rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F7F5F2]">
                        <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline border-b border-[#E8E4DF]">
                          Field
                        </th>
                        <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline border-b border-[#E8E4DF]">
                          Format
                        </th>
                        <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline border-b border-[#E8E4DF]">
                          Example
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">title</td>
                        <td className="p-2">string</td>
                        <td className="p-2 text-secondary">"Keynote: Future of AI"</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">date</td>
                        <td className="p-2">YYYY-MM-DD</td>
                        <td className="p-2 text-secondary">"2026-03-18"</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">start</td>
                        <td className="p-2">HH:MM (24h)</td>
                        <td className="p-2 text-secondary">"09:00"</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">end</td>
                        <td className="p-2">HH:MM (24h)</td>
                        <td className="p-2 text-secondary">"10:30"</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-admin-teal mb-2 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-admin-teal"></div>{" "}
                  {t("admin.optionalFields")}
                </h4>
                <div className="border border-[#E8E4DF] rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F7F5F2]">
                        <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline border-b border-[#E8E4DF]">
                          Field
                        </th>
                        <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline border-b border-[#E8E4DF]">
                          Description
                        </th>
                        <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline border-b border-[#E8E4DF]">
                          Alias
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">session_id</td>
                        <td className="p-2">Unique code (e.g. "S62911"). Used as document ID.</td>
                        <td className="p-2 text-secondary font-mono">code</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">room</td>
                        <td className="p-2">Room or venue name</td>
                        <td className="p-2 text-secondary font-mono">location</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">speakers</td>
                        <td className="p-2">Array of speaker objects</td>
                        <td className="p-2">—</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">format</td>
                        <td className="p-2">"In-Person", "Virtual", "Both"</td>
                        <td className="p-2">—</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">recording</td>
                        <td className="p-2">"Yes" or "No"</td>
                        <td className="p-2">—</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">session_type</td>
                        <td className="p-2">"Talk", "Panel", "Keynote", "Workshop"</td>
                        <td className="p-2 text-secondary font-mono">sessionType</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">topic</td>
                        <td className="p-2">Primary topic/category</td>
                        <td className="p-2 text-secondary font-mono">mainTopic</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">url</td>
                        <td className="p-2">Link to official session page</td>
                        <td className="p-2">—</td>
                      </tr>
                      <tr className="border-t border-[#E8E4DF]">
                        <td className="p-2 font-mono text-admin-teal">key_themes</td>
                        <td className="p-2">Array of topic tags for filtering</td>
                        <td className="p-2 text-secondary font-mono">keyThemes</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-admin-teal mb-2 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-admin-teal"></div>{" "}
                  {t("admin.speakerObject")}
                </h4>
                <pre className="bg-[#F7F5F2] border border-[#E8E4DF] rounded-lg p-3 text-xs font-mono overflow-x-auto">{`{ "name": "Dr. Jane Smith", "title": "Chief Scientist", "company": "NVIDIA" }`}</pre>
              </div>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-admin-teal mb-2 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-admin-teal"></div>{" "}
                  {t("admin.completeExample")}
                </h4>
                <pre className="bg-[#F7F5F2] border border-[#E8E4DF] rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{`[
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

              <div className="mb-2">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-admin-teal mb-2 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-admin-teal"></div>{" "}
                  {t("admin.minimalExample")}
                </h4>
                <pre className="bg-[#F7F5F2] border border-[#E8E4DF] rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{`[
  { "title": "Morning Keynote", "date": "2026-03-18", "start": "09:00", "end": "10:00" },
  { "title": "Lunch Workshop", "date": "2026-03-18", "start": "12:00", "end": "13:00" }
]`}</pre>
              </div>

              <div className="mt-4 p-3 bg-[#F7F5F2] border border-[#E8E4DF] rounded-lg text-secondary text-xs">
                <strong>{t("admin.note")}:</strong> {t("admin.formatGuideNote")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
