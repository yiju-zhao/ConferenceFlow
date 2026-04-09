import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/api";

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div className="mb-3">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#F7F5F2] border border-[#E8E4DF] rounded-md px-3 py-2.5 text-on-surface text-sm focus:border-admin-teal focus:ring-1 focus:ring-admin-teal/20 focus:outline-none transition-colors" />
    </div>
  );
}

export default function SuperAdminPanel() {
  const { t } = useTranslation();
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
    return <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center"><p className="text-admin-teal font-headline uppercase">{t('admin.superAdminRequired')}</p></div>;
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <div className="bg-gradient-to-r from-admin-teal-deep to-admin-teal px-6 py-3.5">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="font-headline text-white text-lg font-bold" style={{ letterSpacing: "0.3px" }}>{t('admin.adminPanel')}</h1>
          <Link to="/dashboard"
            className="font-headline text-white text-xs font-semibold uppercase px-4 py-1.5 rounded transition-colors"
            style={{ background: "rgba(255,255,255,0.18)", letterSpacing: "0.8px" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}>
            {t('dashboard.dashboard')}
          </Link>
        </div>
      </div>
      <div className="max-w-4xl mx-auto p-6">
        {message && (
          <div className={`p-3 mb-4 text-sm rounded-lg ${message.startsWith("Error") ? "bg-red-500/10 text-red-600 border border-red-200" : "bg-[#27AE60]/10 text-[#27AE60] border border-[#27AE60]/20"}`}>
            {message}<button onClick={() => setMessage("")} className="ml-3 opacity-50 hover:opacity-100">×</button>
          </div>
        )}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 rounded-full bg-admin-teal"></div>
              <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">{t('admin.allConferences')} ({conferences.length})</h2>
            </div>
            <button onClick={() => setShowCreate(!showCreate)}
              className="bg-admin-teal text-white px-4 py-2.5 text-xs font-headline uppercase tracking-wider hover:bg-admin-teal-deep rounded-lg transition-all duration-150 shadow-sm hover:shadow">{t('admin.createConference')}</button>
          </div>
          {showCreate && (
            <div className="bg-white border border-[#E8E4DF] rounded-lg p-6 mb-4">
              <h3 className="font-headline text-on-surface font-bold text-sm mb-3 uppercase">{t('admin.newConference')}</h3>
              <Field label={t('admin.conferenceName')} value={createForm.name} onChange={(v) => setCreateForm({ ...createForm, name: v })} placeholder={t('admin.conferenceName')} />
              <Field label={t('admin.description')} value={createForm.description} onChange={(v) => setCreateForm({ ...createForm, description: v })} placeholder={t('admin.description')} />
              <div className="flex gap-3">
                <div className="flex-1"><Field label={t('admin.startDate')} value={createForm.startDate} onChange={(v) => setCreateForm({ ...createForm, startDate: v })} type="date" /></div>
                <div className="flex-1"><Field label={t('admin.endDate')} value={createForm.endDate} onChange={(v) => setCreateForm({ ...createForm, endDate: v })} type="date" /></div>
              </div>
              <div className="mb-3">
                <label className="block text-secondary text-xs uppercase tracking-wider mb-2">{t('admin.visibility')}</label>
                <div className="flex gap-3">
                  {["public", "private"].map((v) => (
                    <button key={v} onClick={() => setCreateForm({ ...createForm, visibility: v })}
                      className={`px-4 py-1.5 text-xs font-headline uppercase tracking-wider transition-all duration-150 rounded-full ${createForm.visibility === v ? "bg-admin-teal text-white" : "bg-white border border-[#E8E4DF] text-secondary hover:border-admin-teal/30"}`}>{v === "public" ? t('admin.public') : t('admin.private')}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleCreate} disabled={creating || !createForm.name || !createForm.startDate || !createForm.endDate}
                className="bg-admin-teal text-white px-6 py-2.5 text-sm font-headline uppercase tracking-wider hover:bg-admin-teal-deep rounded-lg disabled:opacity-50 shadow-sm hover:shadow transition-all">
                {creating ? t('admin.creating') : t('common.confirm')}</button>
            </div>
          )}
          {conferences.map((conf) => (
            <div key={conf.id} className="bg-white border border-[#E8E4DF] rounded-lg overflow-hidden mb-3 hover:shadow-sm transition-all duration-200">
              <div className="flex items-stretch">
                <div className="w-1 bg-admin-teal flex-shrink-0"></div>
                <div className="flex-1 p-4 flex justify-between items-center">
                  <div>
                    <div className="text-on-surface font-bold text-sm">{conf.name}</div>
                    <div className="text-secondary text-xs mt-1">{conf.startDate} — {conf.endDate} · {conf.visibility}{conf.joinCode && ` · Code: ${conf.joinCode}`}</div>
                  </div>
                  <Link to={`/conference/${conf.id}/admin/settings`} className="text-admin-teal text-xs uppercase tracking-wider hover:underline">{t('admin.manage')}</Link>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
