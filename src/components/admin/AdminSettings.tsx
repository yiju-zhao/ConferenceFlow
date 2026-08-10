import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Button,
  Callout,
  Card,
  FormGroup,
  InputGroup,
  SegmentedControl,
  TextArea,
} from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/api";
import { useTranslation } from "react-i18next";
import type { Conference, ConferenceVisibility } from "../../types";

interface ConferenceSettingsForm {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  visibility?: ConferenceVisibility;
  joinCode?: string;
}

export default function AdminSettings() {
  const { confId } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  const [conf, setConf] = useState<Conference | null>(null);
  const [form, setForm] = useState<ConferenceSettingsForm>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!confId) return;
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Conference;
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
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!conf)
    return <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{t("common.loading")}</div>;

  const handleFieldChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
          {t("admin.conferenceSettings")}
        </h2>
      </div>
      <Card style={{ maxWidth: 672 }}>
        <FormGroup label={t("admin.conferenceName")}>
          <InputGroup
            value={form.name || ""}
            placeholder={t("admin.conferenceName")}
            onChange={(e) => handleFieldChange("name", e.target.value)}
          />
        </FormGroup>
        <FormGroup label={t("admin.description")}>
          <TextArea
            fill
            rows={3}
            value={form.description || ""}
            placeholder={t("admin.description")}
            style={{ resize: "none" }}
            onChange={(e) => handleFieldChange("description", e.target.value)}
          />
        </FormGroup>
        <div style={{ display: "flex", gap: 12 }}>
          <FormGroup label={t("admin.startDate")} style={{ flex: 1 }}>
            <InputGroup
              type="date"
              value={form.startDate || ""}
              onChange={(e) => handleFieldChange("startDate", e.target.value)}
            />
          </FormGroup>
          <FormGroup label={t("admin.endDate")} style={{ flex: 1 }}>
            <InputGroup
              type="date"
              value={form.endDate || ""}
              onChange={(e) => handleFieldChange("endDate", e.target.value)}
            />
          </FormGroup>
        </div>
        <FormGroup label={t("admin.visibility")}>
          <div>
            <SegmentedControl
              small
              options={[
                { label: t("admin.public"), value: "public" },
                { label: t("admin.private"), value: "private" },
              ]}
              value={form.visibility || "public"}
              onValueChange={(v) =>
                setForm({ ...form, visibility: v as ConferenceVisibility })
              }
            />
          </div>
        </FormGroup>
        {form.visibility === "private" && (
          <FormGroup label={t("admin.joinCode")}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <InputGroup
                value={form.joinCode || ""}
                onChange={(e) => setForm({ ...form, joinCode: e.target.value.toUpperCase() })}
                style={{ width: 192, fontFamily: "'DM Mono', monospace" }}
              />
              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {t("admin.shareCodeHint")}
              </span>
            </div>
          </FormGroup>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
          <Button
            intent="primary"
            icon={IconNames.FLOPPY_DISK}
            loading={saving}
            onClick={handleSave}
            text={saving ? t("common.saving") : t("admin.saveChanges")}
          />
          {message && (
            <span
              style={{
                fontSize: 14,
                color: message.startsWith("Error") ? "var(--error)" : "var(--success)",
              }}
            >
              {message}
            </span>
          )}
        </div>
      </Card>

      {/* Danger Zone — super admin only */}
      {isSuperAdmin && (
        <Callout
          intent="danger"
          icon={IconNames.TRASH}
          title={t("admin.dangerZone")}
          style={{ maxWidth: 672, marginTop: 40 }}
        >
          <p style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>
            {t("admin.deleteConference")}
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: 12, margin: "0 0 16px" }}>
            {t("admin.deleteConfirm")}
          </p>
          {deleteConfirm ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "var(--error)", fontSize: 14, fontWeight: 700 }}>
                {t("admin.areYouSure")}
              </span>
              <Button
                intent="danger"
                loading={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await apiFetch(`/api/conferences/${confId}`, {
                      method: "DELETE",
                    });
                    navigate("/dashboard");
                  } catch (err) {
                    setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
                    setDeleting(false);
                    setDeleteConfirm(false);
                  }
                }}
                text={deleting ? t("admin.deleting") : t("admin.yesDeleteConference")}
              />
              <Button onClick={() => setDeleteConfirm(false)} text={t("common.cancel")} />
            </div>
          ) : (
            <Button
              intent="danger"
              outlined
              onClick={() => setDeleteConfirm(true)}
              text={t("admin.deleteConference")}
            />
          )}
        </Callout>
      )}
    </div>
  );
}
