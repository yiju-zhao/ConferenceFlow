import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/api";

export default function SuperAdminPanel() {
  const { isSuperAdmin } = useAuth();
  const [conferences, setConferences] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", startDate: "", endDate: "", visibility: "public" });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "conferences"), (snap) => {
      setConferences(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const handleCreate = async () => {
    setCreating(true); setMessage("");
    try {
      const result = await apiFetch("/api/conferences", { method: "POST", body: JSON.stringify(createForm) });
      setMessage(`Created: ${result.name} (ID: ${result.id})`);
      setShowCreate(false);
      setCreateForm({ name: "", description: "", startDate: "", endDate: "", visibility: "public" });
    } catch (err) { setMessage(`Error: ${err.message}`); }
    finally { setCreating(false); }
  };


  if (!isSuperAdmin) {
    return <div className="min-h-screen bg-surface flex items-center justify-center"><p className="text-primary font-headline uppercase">Super Admin access required</p></div>;
  }

  const Field = ({ label, value, onChange, type = "text", placeholder = "" }) => (
    <div className="mb-3">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-surface-container-high p-2 text-on-surface text-sm border-0 border-b-2 border-transparent focus:border-primary focus:outline-none" />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-primary p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="font-headline text-on-primary text-lg font-bold tracking-tight uppercase">Super Admin</h1>
          <Link to="/dashboard" className="text-on-primary/70 text-xs uppercase tracking-wider hover:text-on-primary">← Dashboard</Link>
        </div>
      </div>
      <div className="max-w-4xl mx-auto p-6">
        {message && (
          <div className={`p-3 mb-4 text-sm ${message.startsWith("Error") ? "bg-primary/10 text-primary" : "bg-[#27AE60]/10 text-[#27AE60]"}`}>
            {message}<button onClick={() => setMessage("")} className="ml-3 opacity-50 hover:opacity-100">×</button>
          </div>
        )}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-1 h-5 bg-primary inline-block"></span>
              <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">All Conferences ({conferences.length})</h2>
            </div>
            <button onClick={() => setShowCreate(!showCreate)}
              className="bg-primary text-on-primary px-4 py-2 text-xs font-headline uppercase tracking-wider hover:bg-primary-container transition-colors duration-50">+ Create Conference</button>
          </div>
          {showCreate && (
            <div className="bg-surface-container-lowest p-6 mb-4">
              <h3 className="font-headline text-on-surface font-bold text-sm mb-3 uppercase">New Conference</h3>
              <Field label="Name" value={createForm.name} onChange={(v) => setCreateForm({ ...createForm, name: v })} placeholder="Conference name" />
              <Field label="Description" value={createForm.description} onChange={(v) => setCreateForm({ ...createForm, description: v })} placeholder="Description" />
              <div className="flex gap-3">
                <div className="flex-1"><Field label="Start Date" value={createForm.startDate} onChange={(v) => setCreateForm({ ...createForm, startDate: v })} type="date" /></div>
                <div className="flex-1"><Field label="End Date" value={createForm.endDate} onChange={(v) => setCreateForm({ ...createForm, endDate: v })} type="date" /></div>
              </div>
              <div className="mb-3">
                <label className="block text-secondary text-xs uppercase tracking-wider mb-2">Visibility</label>
                <div className="flex gap-3">
                  {["public", "private"].map((v) => (
                    <button key={v} onClick={() => setCreateForm({ ...createForm, visibility: v })}
                      className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${createForm.visibility === v ? "bg-primary text-on-primary" : "bg-surface-container text-secondary"}`}>{v}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleCreate} disabled={creating || !createForm.name || !createForm.startDate || !createForm.endDate}
                className="bg-primary text-on-primary px-6 py-2 text-sm font-headline uppercase tracking-wider hover:bg-primary-container disabled:opacity-50">
                {creating ? "Creating..." : "Create"}</button>
            </div>
          )}
          {conferences.map((conf) => (
            <div key={conf.id} className="bg-surface-container-lowest p-4 mb-2 flex justify-between items-center">
              <div>
                <div className="text-on-surface font-bold text-sm">{conf.name}</div>
                <div className="text-secondary text-xs mt-1">{conf.startDate} — {conf.endDate} · {conf.visibility}{conf.joinCode && ` · Code: ${conf.joinCode}`}</div>
              </div>
              <Link to={`/conference/${conf.id}/admin/settings`} className="text-primary text-xs uppercase tracking-wider hover:underline">Manage</Link>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
