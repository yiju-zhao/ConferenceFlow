import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot } from "firebase/firestore";
import {
  Button,
  Callout,
  Card,
  Classes,
  Dialog,
  FormGroup,
  InputGroup,
  SegmentedControl,
  Tag,
} from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/api";
import AppNavbar from "../shell/AppNavbar";
import { SectionAccentProvider } from "../shell/SectionAccent";
import type { Conference, ConferenceVisibility } from "../../types";

interface ConferenceCreateForm {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  visibility: ConferenceVisibility;
}

export default function SuperAdminPanel() {
  const { t } = useTranslation();
  const { isSuperAdmin } = useAuth();
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ConferenceCreateForm>({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    visibility: "public",
  });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "conferences"), (snap) => {
      setConferences(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conference, "id">) })));
    });
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setMessage("");
    try {
      const result = await apiFetch<Conference>("/api/conferences", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      setMessage(`Created: ${result.name} (ID: ${result.id})`);
      setShowCreate(false);
      setCreateForm({
        name: "",
        description: "",
        startDate: "",
        endDate: "",
        visibility: "public",
      });
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            color: "var(--accent-admin)",
            fontFamily: "'Work Sans', sans-serif",
            textTransform: "uppercase",
          }}
        >
          {t("admin.superAdminRequired")}
        </p>
      </div>
    );
  }

  return (
    <SectionAccentProvider accent="admin">
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <AppNavbar />
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: 32 }}>
          {message && (
            <Callout
              intent={message.startsWith("Error") ? "danger" : "success"}
              style={{ marginBottom: 16 }}
            >
              {message}
              <Button
                minimal
                small
                icon={IconNames.CROSS}
                onClick={() => setMessage("")}
                style={{ marginLeft: 12, verticalAlign: "middle" }}
              />
            </Callout>
          )}
          <section>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{ width: 4, height: 24, borderRadius: 9999, background: "var(--accent)" }}
                />
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
                  {t("admin.allConferences")} ({conferences.length})
                </h2>
              </div>
              <Button
                intent="primary"
                icon={IconNames.PLUS}
                onClick={() => setShowCreate(true)}
                text={t("admin.createConference")}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {conferences.map((conf) => (
                <Card
                  key={conf.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 16px",
                    borderLeft: "3px solid var(--accent)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 700,
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {conf.name}
                      <Tag minimal intent={conf.visibility === "public" ? "success" : "warning"}>
                        {conf.visibility}
                      </Tag>
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>
                      {conf.startDate} — {conf.endDate}
                      {conf.joinCode && ` · Code: ${conf.joinCode}`}
                    </div>
                  </div>
                  <Link
                    to={`/conference/${conf.id}/admin/settings`}
                    style={{
                      color: "var(--accent)",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      textDecoration: "none",
                    }}
                  >
                    {t("admin.manage")}
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <Dialog
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          title={t("admin.newConference")}
          icon={IconNames.PLUS}
          style={{ width: 480 }}
        >
          <div className={Classes.DIALOG_BODY}>
            <FormGroup label={t("admin.conferenceName")}>
              <InputGroup
                value={createForm.name}
                placeholder={t("admin.conferenceName")}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </FormGroup>
            <FormGroup label={t("admin.description")}>
              <InputGroup
                value={createForm.description}
                placeholder={t("admin.description")}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </FormGroup>
            <div style={{ display: "flex", gap: 12 }}>
              <FormGroup label={t("admin.startDate")} style={{ flex: 1 }}>
                <InputGroup
                  type="date"
                  value={createForm.startDate}
                  onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                />
              </FormGroup>
              <FormGroup label={t("admin.endDate")} style={{ flex: 1 }}>
                <InputGroup
                  type="date"
                  value={createForm.endDate}
                  onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
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
                  value={createForm.visibility}
                  onValueChange={(v) =>
                    setCreateForm({ ...createForm, visibility: v as ConferenceVisibility })
                  }
                />
              </div>
            </FormGroup>
          </div>
          <div className={Classes.DIALOG_FOOTER}>
            <div className={Classes.DIALOG_FOOTER_ACTIONS}>
              <Button onClick={() => setShowCreate(false)} text={t("common.cancel")} />
              <Button
                intent="primary"
                loading={creating}
                disabled={
                  creating || !createForm.name || !createForm.startDate || !createForm.endDate
                }
                onClick={handleCreate}
                text={creating ? t("admin.creating") : t("common.confirm")}
              />
            </div>
          </div>
        </Dialog>
      </div>
    </SectionAccentProvider>
  );
}
