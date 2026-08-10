import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, SegmentedControl, Tag } from "@blueprintjs/core";
import { apiFetch } from "../../lib/api";
import { useTranslation } from "react-i18next";
import { useConferenceMembers } from "../../hooks/useConferenceMembers";

export default function AdminApplications() {
  const { confId } = useParams();
  const { t } = useTranslation();
  const { members, memberNames } = useConferenceMembers(confId);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("pending");

  const handleApprove = async (userId: string) => {
    setProcessing(userId);
    try {
      await apiFetch(`/api/conferences/${confId}/members/approve`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId: string) => {
    setProcessing(userId);
    try {
      await apiFetch(`/api/conferences/${confId}/members/reject`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = members.filter((m) => (filter === "all" ? true : m.status === filter));
  const pendingCount = members.filter((m) => m.status === "pending").length;

  const statusIntent = (status: string) =>
    status === "approved" ? ("success" as const) : status === "pending" ? ("warning" as const) : ("none" as const);

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
          {t("admin.memberApplications")}
        </h2>
        {pendingCount > 0 && (
          <Tag round intent="warning">
            {pendingCount} {t("admin.filterPending").toLowerCase()}
          </Tag>
        )}
      </div>
      <div style={{ marginBottom: 16 }}>
        <SegmentedControl
          small
          options={[
            { label: t("admin.filterPending"), value: "pending" },
            { label: t("admin.filterApproved"), value: "approved" },
            { label: t("admin.filterAll"), value: "all" },
          ]}
          value={filter}
          onValueChange={(v) => setFilter(v as string)}
        />
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: 14,
            }}
          >
            {filter === "pending" ? t("admin.noPendingApplications") : t("admin.noApplications")}
          </div>
        )}
        {filtered.map((m, index) => (
          <div
            key={m.id}
            style={{
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: index > 0 ? "1px solid var(--border)" : undefined,
            }}
          >
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 14 }}>
                {memberNames[m.id] || m.id}
              </div>
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  marginTop: 4,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span>{m.attendanceMode || "onsite"}</span>
                <span>
                  {t("admin.role")}: {m.role}
                </span>
                <Tag minimal intent={statusIntent(m.status)}>
                  {m.status}
                </Tag>
              </div>
            </div>
            {m.status === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  small
                  intent="success"
                  onClick={() => handleApprove(m.id)}
                  disabled={processing === m.id}
                  text={t("admin.approve")}
                />
                <Button
                  small
                  intent="danger"
                  outlined
                  onClick={() => handleReject(m.id)}
                  disabled={processing === m.id}
                  text={t("admin.reject")}
                />
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
