import { Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@blueprintjs/core";
import { useMembership } from "../../hooks/useMembership";
import AppNavbar from "../shell/AppNavbar";
import { SectionAccentProvider } from "../shell/SectionAccent";

export default function AdminLayout() {
  const { confId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, loading } = useMembership(confId);

  const tabs = [
    { path: "settings", label: t("admin.settings") },
    { path: "sessions", label: t("admin.sessions") },
    { path: "applications", label: t("admin.applications") },
    { path: "attendance", label: t("admin.attendance") },
    { path: "reports", label: t("admin.reports") },
  ];

  const activeTab =
    tabs.find((tb) => location.pathname.includes(`/admin/${tb.path}`))?.path ?? "settings";

  if (loading) {
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
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: "'Work Sans', sans-serif",
          }}
        >
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <SectionAccentProvider accent="admin">
        <div
          style={{
            minHeight: "100vh",
            background: "var(--bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                color: "var(--accent-admin)",
                fontFamily: "'Work Sans', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              {t("admin.accessDenied")}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 8 }}>
              {t("admin.needAdminAccess")}
            </p>
            <button
              onClick={() => navigate(`/conference/${confId}`)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--accent-admin)",
                fontSize: 13,
                marginTop: 16,
                textDecoration: "underline",
              }}
            >
              {t("admin.backToConference")}
            </button>
          </div>
        </div>
      </SectionAccentProvider>
    );
  }

  return (
    <SectionAccentProvider accent="admin">
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <AppNavbar showConfTabs />
        <div
          style={{
            maxWidth: 1152,
            margin: "0 auto",
            padding: "24px 20px 56px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <SegmentedControl
            options={tabs.map((tb) => ({ label: tb.label, value: tb.path }))}
            value={activeTab}
            onValueChange={(v) => navigate(`/conference/${confId}/admin/${v}`)}
          />
          <Outlet />
        </div>
      </div>
    </SectionAccentProvider>
  );
}
