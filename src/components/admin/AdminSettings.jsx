import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/api";
import { useTranslation } from "react-i18next";

function SettingsField({
  label,
  field,
  type = "text",
  placeholder = "",
  value,
  onChange,
}) {
  return (
    <div className="mb-4">
      <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-[#F7F5F2] border border-[#E8E4DF] rounded-md px-3 py-2.5 text-on-surface text-sm focus:border-admin-teal focus:ring-1 focus:ring-admin-teal/20 focus:outline-none resize-none transition-colors"
        />
      ) : (
        <input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#F7F5F2] border border-[#E8E4DF] rounded-md px-3 py-2.5 text-on-surface text-sm focus:border-admin-teal focus:ring-1 focus:ring-admin-teal/20 focus:outline-none transition-colors"
        />
      )}
    </div>
  );
}

export default function AdminSettings() {
  const { confId } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  const [conf, setConf] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConf(data);
        setForm({
          name: data.name || "",
          description: data.description || "",
          startDate: data.startDate || "",
          endDate: data.endDate || "",
          visibility: data.visibility || "public",
          joinCode: data.joinCode || "",
        });
      }
    });
  }, [confId]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(`/api/conferences/${confId}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setMessage(t("admin.saved"));
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!conf)
    return <div className="text-secondary text-sm">{t("common.loading")}</div>;

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1 h-6 rounded-full bg-admin-teal"></div>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          {t("admin.conferenceSettings")}
        </h2>
      </div>
      <div className="bg-white border border-[#E8E4DF] rounded-lg p-6 max-w-2xl">
        <SettingsField
          label={t("admin.conferenceName")}
          field="name"
          placeholder={t("admin.conferenceName")}
          value={form.name}
          onChange={handleFieldChange}
        />
        <SettingsField
          label={t("admin.description")}
          field="description"
          type="textarea"
          placeholder={t("admin.description")}
          value={form.description}
          onChange={handleFieldChange}
        />
        <SettingsField
          label={t("admin.startDate")}
          field="startDate"
          type="date"
          value={form.startDate}
          onChange={handleFieldChange}
        />
        <SettingsField
          label={t("admin.endDate")}
          field="endDate"
          type="date"
          value={form.endDate}
          onChange={handleFieldChange}
        />
        <div className="mb-4">
          <label className="block text-secondary text-xs uppercase tracking-wider mb-2">
            {t("admin.visibility")}
          </label>
          <div className="flex gap-3">
            {["public", "private"].map((v) => (
              <button
                key={v}
                onClick={() => setForm({ ...form, visibility: v })}
                className={`px-4 py-2 text-sm font-headline uppercase tracking-wider transition-all duration-150 rounded-lg ${form.visibility === v ? "bg-admin-teal text-white" : "bg-white border border-[#E8E4DF] text-secondary hover:border-admin-teal/30"}`}
              >
                {t(`admin.${v}`)}
              </button>
            ))}
          </div>
        </div>
        {form.visibility === "private" && (
          <div className="mb-4">
            <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
              {t("admin.joinCode")}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={form.joinCode || ""}
                onChange={(e) =>
                  setForm({ ...form, joinCode: e.target.value.toUpperCase() })
                }
                className="bg-[#F7F5F2] border border-[#E8E4DF] rounded-md px-3 py-2.5 text-on-surface text-sm font-mono focus:border-admin-teal focus:ring-1 focus:ring-admin-teal/20 focus:outline-none w-48 transition-colors"
              />
              <span className="text-secondary text-xs">
                {t("admin.shareCodeHint")}
              </span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-admin-teal text-white px-6 py-2.5 text-sm font-headline uppercase tracking-wider hover:bg-admin-teal-deep transition-all duration-150 disabled:opacity-50 rounded-lg shadow-sm hover:shadow"
          >
            {saving ? t("common.saving") : t("admin.saveChanges")}
          </button>
          {message && (
            <span
              className={`text-sm ${message.startsWith("Error") ? "text-red-600" : "text-[#27AE60]"}`}
            >
              {message}
            </span>
          )}
        </div>
      </div>

      {/* Danger Zone — super admin only */}
      {isSuperAdmin && (
        <div className="mt-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 rounded-full bg-red-600"></div>
            <h2 className="font-headline text-red-600 text-lg font-bold uppercase tracking-wider">
              {t("admin.dangerZone")}
            </h2>
          </div>
          <div className="bg-white border border-[#E8E4DF] border-l-[3px] border-l-red-600 rounded-lg p-6">
            <p className="text-on-surface text-sm mb-1 font-bold">
              {t("admin.deleteConference")}
            </p>
            <p className="text-secondary text-xs mb-4">
              {t("admin.deleteConfirm")}
            </p>
            {deleteConfirm ? (
              <div className="flex items-center gap-3">
                <span className="text-red-600 text-sm font-bold">
                  {t("admin.areYouSure")}
                </span>
                <button
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await apiFetch(`/api/conferences/${confId}`, {
                        method: "DELETE",
                      });
                      navigate("/dashboard");
                    } catch (err) {
                      setMessage(`Error: ${err.message}`);
                      setDeleting(false);
                      setDeleteConfirm(false);
                    }
                  }}
                  disabled={deleting}
                  className="bg-red-600 text-white px-4 py-2 text-xs font-headline uppercase tracking-wider hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {deleting
                    ? t("admin.deleting")
                    : t("admin.yesDeleteConference")}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="bg-white border border-[#E8E4DF] text-secondary px-4 py-2 text-xs font-headline uppercase tracking-wider hover:text-on-surface rounded-lg transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="bg-white border border-[#E8E4DF] text-red-600 px-4 py-2 text-xs font-headline uppercase tracking-wider hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors rounded-lg"
              >
                {t("admin.deleteConference")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
