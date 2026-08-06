import { useState } from "react";
import { useParams } from "react-router-dom";
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

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1 h-6 rounded-full bg-admin-teal"></div>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
          {t("admin.memberApplications")}
        </h2>
        {pendingCount > 0 && (
          <span className="bg-[#E67E22]/10 text-[#E67E22] text-xs px-2.5 py-0.5 uppercase tracking-wider rounded-full">
            {pendingCount} {t("admin.filterPending").toLowerCase()}
          </span>
        )}
      </div>
      <div className="flex gap-2 mb-4">
        {[
          { key: "pending", label: t("admin.filterPending") },
          { key: "approved", label: t("admin.filterApproved") },
          { key: "all", label: t("admin.filterAll") },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 text-xs font-headline uppercase tracking-wider transition-all duration-150 rounded-full ${filter === f.key ? "bg-admin-teal text-white" : "bg-white border border-[#E8E4DF] text-secondary hover:border-admin-teal/30"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="bg-white border border-[#E8E4DF] rounded-lg overflow-hidden">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-secondary text-sm">
            {filter === "pending" ? t("admin.noPendingApplications") : t("admin.noApplications")}
          </div>
        )}
        {filtered.map((m, index) => (
          <div
            key={m.id}
            className={`p-4 flex justify-between items-center hover:bg-[#FAFAF8] transition-colors ${index > 0 ? "border-t border-[#E8E4DF]" : ""}`}
          >
            <div>
              <div className="text-on-surface font-bold text-sm">{memberNames[m.id] || m.id}</div>
              <div className="text-secondary text-xs mt-1 flex gap-3">
                <span>{m.attendanceMode || "onsite"}</span>
                <span>
                  {t("admin.role")}: {m.role}
                </span>
                <span
                  className={`uppercase tracking-wider ${m.status === "approved" ? "text-[#27AE60]" : m.status === "pending" ? "text-[#E67E22]" : "text-admin-teal"}`}
                >
                  {m.status}
                </span>
              </div>
            </div>
            {m.status === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(m.id)}
                  disabled={processing === m.id}
                  className="bg-[#27AE60] text-white px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50 rounded-lg"
                >
                  {t("admin.approve")}
                </button>
                <button
                  onClick={() => handleReject(m.id)}
                  disabled={processing === m.id}
                  className="bg-white border border-[#E8E4DF] text-secondary px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-50 rounded-lg"
                >
                  {t("admin.reject")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
