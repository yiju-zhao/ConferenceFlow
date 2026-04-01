import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";

export default function AdminSettings() {
  const { confId } = useParams();
  const [conf, setConf] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConf(data);
        setForm({ name: data.name || "", description: data.description || "", startDate: data.startDate || "", endDate: data.endDate || "", visibility: data.visibility || "public", joinCode: data.joinCode || "" });
      }
    });
  }, [confId]);

  const handleSave = async () => {
    setSaving(true); setMessage("");
    try {
      await apiFetch(`/api/conferences/${confId}`, { method: "PUT", body: JSON.stringify(form) });
      setMessage("Settings saved"); setTimeout(() => setMessage(""), 3000);
    } catch (err) { setMessage(`Error: ${err.message}`); }
    finally { setSaving(false); }
  };

  if (!conf) return <div className="text-secondary text-sm">Loading settings...</div>;

  const Field = ({ label, field, type = "text", placeholder = "" }) => (
    <div className="mb-4">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      {type === "textarea" ? (
        <textarea value={form[field] || ""} onChange={(e) => setForm({ ...form, [field]: e.target.value })} placeholder={placeholder} rows={3}
          className="w-full bg-surface-container-high p-3 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-primary focus:outline-none resize-none" />
      ) : (
        <input type={type} value={form[field] || ""} onChange={(e) => setForm({ ...form, [field]: e.target.value })} placeholder={placeholder}
          className="w-full bg-surface-container-high p-3 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-primary focus:outline-none" />
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">Conference Settings</h2>
      </div>
      <div className="bg-surface-container-lowest p-6 max-w-2xl">
        <Field label="Name" field="name" placeholder="Conference name" />
        <Field label="Description" field="description" type="textarea" placeholder="Conference description" />
        <Field label="Start Date" field="startDate" type="date" />
        <Field label="End Date" field="endDate" type="date" />
        <div className="mb-4">
          <label className="block text-secondary text-xs uppercase tracking-wider mb-2">Visibility</label>
          <div className="flex gap-3">
            {["public", "private"].map((v) => (
              <button key={v} onClick={() => setForm({ ...form, visibility: v })}
                className={`px-4 py-2 text-sm font-headline uppercase tracking-wider transition-colors duration-50 ${form.visibility === v ? "bg-primary text-on-primary" : "bg-surface-container text-secondary hover:text-on-surface"}`}>{v}</button>
            ))}
          </div>
        </div>
        {form.visibility === "private" && (
          <div className="mb-4">
            <label className="block text-secondary text-xs uppercase tracking-wider mb-1">Join Code</label>
            <div className="flex gap-2 items-center">
              <input type="text" value={form.joinCode || ""} onChange={(e) => setForm({ ...form, joinCode: e.target.value.toUpperCase() })}
                className="bg-surface-container-high p-3 text-on-surface text-sm font-mono border-0 border-b-2 border-transparent focus:border-primary focus:outline-none w-48" />
              <span className="text-secondary text-xs">Share this code with invitees</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="bg-primary text-on-primary px-6 py-2 text-sm font-headline uppercase tracking-wider hover:bg-primary-container transition-colors duration-50 disabled:opacity-50">
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {message && <span className={`text-sm ${message.startsWith("Error") ? "text-primary" : "text-[#27AE60]"}`}>{message}</span>}
        </div>
      </div>
    </div>
  );
}
