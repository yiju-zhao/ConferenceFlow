import { useState, useEffect, useRef, useCallback } from "react";

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

import { useParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";

function SessionField({ label, field, type = "text", value, onChange }) {
  return (
    <div className="mb-3">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value || ""}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full bg-surface-container-high p-2 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-primary focus:outline-none" />
    </div>
  );
}

export default function AdminSessions() {
  const { confId } = useParams();
  const [sessions, setSessions] = useState([]);
  const [search, setSearch] = useState("");
  const [editModal, setEditModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [mdCopied, setMdCopied] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      setSessions(arr);
    });
  }, [confId]);

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.title?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.mainTopic?.toLowerCase().includes(q);
  });

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return; e.target.value = "";
    setUploading(true); setUploadResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const sessionsArr = Array.isArray(json) ? json : json.sessions || [json];
      const result = await apiFetch(`/api/conferences/${confId}/sessions/bulk`, { method: "POST", body: JSON.stringify({ sessions: sessionsArr }) });
      setUploadResult(result);
    } catch (err) { setUploadResult({ error: err.message }); }
    finally { setUploading(false); }
  };

  const handleSaveSession = async () => {
    if (!editModal) return;
    const { mode, session } = editModal;
    try {
      if (mode === "add") {
        await apiFetch(`/api/conferences/${confId}/sessions`, { method: "POST", body: JSON.stringify(session) });
      } else {
        await apiFetch(`/api/conferences/${confId}/sessions/${session.id}`, { method: "PUT", body: JSON.stringify(session) });
      }
      setEditModal(null);
    } catch (err) { alert(`Error: ${err.message}`); }
  };

  const handleDelete = async (sessionId) => {
    setDeleting(sessionId);
    try { await apiFetch(`/api/conferences/${confId}/sessions/${sessionId}`, { method: "DELETE" }); }
    catch (err) { alert(`Error: ${err.message}`); }
    finally { setDeleting(null); }
  };

  const handleFieldChange = (field, value) => {
    setEditModal((prev) => ({ ...prev, session: { ...prev.session, [field]: value } }));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">Session Management</h2>
      </div>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sessions..."
          className="bg-surface-container-high p-2 text-on-surface text-sm w-64 border-0 border-b-2 border-transparent focus:border-primary focus:outline-none" />
        <button onClick={() => setEditModal({ mode: "add", session: { code: "", title: "", date: "", start: "", end: "", room: "", format: "", mainTopic: "", url: "" } })}
          className="bg-primary text-on-primary px-4 py-2 text-xs font-headline uppercase tracking-wider hover:bg-primary-container transition-colors duration-50">+ Add Session</button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="bg-surface-container text-secondary px-4 py-2 text-xs font-headline uppercase tracking-wider hover:text-on-surface transition-colors disabled:opacity-50">
          {uploading ? "Uploading..." : "Upload JSON"}</button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleBulkUpload} className="hidden" />
        <button onClick={() => setShowFormatGuide(true)}
          className="text-secondary text-xs hover:text-primary transition-colors underline">
          Format Guide</button>
        <span className="text-secondary text-xs">{sessions.length} sessions total</span>
      </div>
      {uploadResult && (
        <div className={`p-3 mb-4 text-sm ${uploadResult.error ? "bg-primary/10 text-primary" : "bg-[#27AE60]/10 text-[#27AE60]"}`}>
          {uploadResult.error ? `Upload failed: ${uploadResult.error}` : `${uploadResult.message}${uploadResult.errors?.length ? ` (${uploadResult.errors.length} errors)` : ""}`}
          <button onClick={() => setUploadResult(null)} className="ml-3 opacity-50 hover:opacity-100">×</button>
        </div>
      )}
      <div className="bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-secondary text-xs uppercase tracking-wider">
            <th className="p-3">Code</th><th className="p-3">Title</th><th className="p-3">Date</th><th className="p-3">Time</th><th className="p-3">Room</th><th className="p-3 w-32">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-surface-dim hover:bg-surface-container-low">
                <td className="p-3 text-primary font-mono text-xs">{s.code}</td>
                <td className="p-3 text-on-surface">{s.title}</td>
                <td className="p-3 text-secondary">{s.date}</td>
                <td className="p-3 text-secondary">{s.start}–{s.end}</td>
                <td className="p-3 text-secondary">{s.room}</td>
                <td className="p-3">
                  <button onClick={() => setEditModal({ mode: "edit", session: { ...s } })} className="text-primary text-xs uppercase tracking-wider mr-3 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className="text-secondary text-xs uppercase tracking-wider hover:text-primary disabled:opacity-50">{deleting === s.id ? "..." : "Delete"}</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-secondary text-sm">{search ? "No sessions match your search" : "No sessions yet. Add one or upload a JSON file."}</td></tr>}
          </tbody>
        </table>
      </div>
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditModal(null)}>
          <div className="bg-surface-container-lowest p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline text-on-surface font-bold text-base mb-4 uppercase">{editModal.mode === "add" ? "Add Session" : "Edit Session"}</h3>
            <SessionField label="Session Code" field="code" value={editModal?.session?.code} onChange={handleFieldChange} />
            <SessionField label="Title" field="title" value={editModal?.session?.title} onChange={handleFieldChange} />
            <SessionField label="Date" field="date" type="date" value={editModal?.session?.date} onChange={handleFieldChange} />
            <div className="flex gap-3"><div className="flex-1"><SessionField label="Start Time" field="start" type="time" value={editModal?.session?.start} onChange={handleFieldChange} /></div><div className="flex-1"><SessionField label="End Time" field="end" type="time" value={editModal?.session?.end} onChange={handleFieldChange} /></div></div>
            <SessionField label="Room" field="room" value={editModal?.session?.room} onChange={handleFieldChange} />
            <SessionField label="Format" field="format" value={editModal?.session?.format} onChange={handleFieldChange} />
            <SessionField label="Topic" field="mainTopic" value={editModal?.session?.mainTopic} onChange={handleFieldChange} />
            <SessionField label="URL" field="url" value={editModal?.session?.url} onChange={handleFieldChange} />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditModal(null)} className="flex-1 bg-surface-container p-2 text-secondary text-sm uppercase tracking-wider hover:text-on-surface">Cancel</button>
              <button onClick={handleSaveSession} className="flex-1 bg-primary text-on-primary p-2 text-sm font-headline uppercase tracking-wider hover:bg-primary-container">{editModal.mode === "add" ? "Create" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Format Guide Modal */}
      {showFormatGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFormatGuide(false)}>
          <div className="bg-surface-container-lowest w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-primary px-6 py-4 flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-on-primary font-headline font-bold text-base uppercase tracking-wider">JSON Upload Format Guide</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { navigator.clipboard.writeText(FORMAT_GUIDE_MD); setMdCopied(true); setTimeout(() => setMdCopied(false), 2000); }}
                  className="text-on-primary/70 hover:text-on-primary text-xs font-headline uppercase tracking-wider"
                  style={{ background: "rgba(255,255,255,0.15)", padding: "4px 12px", border: "none", cursor: "pointer" }}
                >
                  {mdCopied ? "✓ Copied" : "Copy as Markdown"}
                </button>
                <button onClick={() => setShowFormatGuide(false)} className="text-on-primary/60 hover:text-on-primary text-lg">×</button>
              </div>
            </div>
            <div className="px-6 py-5" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.7, color: "#1a1c1c" }}>

              <p className="text-secondary text-sm mb-4">Upload a <code className="bg-surface-container-high px-1.5 py-0.5 text-xs">.json</code> file containing an array of session objects. Maximum 1000 sessions per upload.</p>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary inline-block"></span> Required Fields
                </h4>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-container">
                      <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline">Field</th>
                      <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline">Format</th>
                      <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline">Example</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">title</td><td className="p-2">string</td><td className="p-2 text-secondary">"Keynote: Future of AI"</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">date</td><td className="p-2">YYYY-MM-DD</td><td className="p-2 text-secondary">"2026-03-18"</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">start</td><td className="p-2">HH:MM (24h)</td><td className="p-2 text-secondary">"09:00"</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">end</td><td className="p-2">HH:MM (24h)</td><td className="p-2 text-secondary">"10:30"</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary inline-block"></span> Optional Fields
                </h4>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-container">
                      <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline">Field</th>
                      <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline">Description</th>
                      <th className="text-left p-2 text-secondary uppercase tracking-wider font-headline">Alias</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">session_id</td><td className="p-2">Unique code (e.g. "S62911"). Used as document ID.</td><td className="p-2 text-secondary font-mono">code</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">room</td><td className="p-2">Room or venue name</td><td className="p-2 text-secondary font-mono">location</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">speakers</td><td className="p-2">Array of speaker objects</td><td className="p-2">—</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">format</td><td className="p-2">"In-Person", "Virtual", "Both"</td><td className="p-2">—</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">recording</td><td className="p-2">"Yes" or "No"</td><td className="p-2">—</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">session_type</td><td className="p-2">"Talk", "Panel", "Keynote", "Workshop"</td><td className="p-2 text-secondary font-mono">sessionType</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">topic</td><td className="p-2">Primary topic/category</td><td className="p-2 text-secondary font-mono">mainTopic</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">url</td><td className="p-2">Link to official session page</td><td className="p-2">—</td></tr>
                    <tr className="border-t border-surface-dim"><td className="p-2 font-mono text-primary">key_themes</td><td className="p-2">Array of topic tags for filtering</td><td className="p-2 text-secondary font-mono">keyThemes</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary inline-block"></span> Speaker Object
                </h4>
                <pre className="bg-surface-container-high p-3 text-xs font-mono overflow-x-auto">{`{ "name": "Dr. Jane Smith", "title": "Chief Scientist", "company": "NVIDIA" }`}</pre>
              </div>

              <div className="mb-5">
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary inline-block"></span> Complete Example
                </h4>
                <pre className="bg-surface-container-high p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{`[
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
                <h4 className="font-headline font-bold text-sm uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary inline-block"></span> Minimal Example
                </h4>
                <pre className="bg-surface-container-high p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{`[
  { "title": "Morning Keynote", "date": "2026-03-18", "start": "09:00", "end": "10:00" },
  { "title": "Lunch Workshop", "date": "2026-03-18", "start": "12:00", "end": "13:00" }
]`}</pre>
              </div>

              <div className="mt-4 p-3 bg-surface-container text-secondary text-xs">
                <strong>Note:</strong> Sessions missing required fields are skipped. If <code className="font-mono">session_id</code> matches an existing session, it will be overwritten.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
