import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import UserAvatar from "../UserAvatar";
import { useSectionAccent } from "./SectionAccent";

export default function AppNavbar({ showConfTabs = false }: { showConfTabs?: boolean }) {
  const { t } = useTranslation();
  const { hex } = useSectionAccent();
  const { confId } = useParams();
  const { pathname } = useLocation();

  const tabs = [
    { key: "cal", label: t("nav.calendar"), to: `/conference/${confId}` },
    { key: "reports", label: t("nav.reports"), to: `/conference/${confId}/reports` },
    { key: "admin", label: t("nav.admin"), to: `/conference/${confId}/admin` },
  ];
  const isActive = (to: string) =>
    to === `/conference/${confId}` ? pathname === to : pathname.startsWith(to);

  return (
    <nav
      className="bp6-navbar"
      style={{
        minHeight: 50,
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderBottom: "1px solid var(--border, #e8e8e8)",
      }}
    >
      <Link
        to="/dashboard"
        style={{
          textDecoration: "none",
          fontFamily: "'Work Sans', sans-serif",
          fontSize: 20,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "baseline",
          gap: 1,
        }}
      >
        <span
          style={{
            fontWeight: 800,
            letterSpacing: "-0.035em",
            color: "var(--text-primary, #1a1c1c)",
          }}
        >
          Conference
        </span>
        <span style={{ fontWeight: 400, letterSpacing: "0.01em", color: "#4A7FB5" }}>Flow</span>
      </Link>

      {showConfTabs && confId && (
        <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {tabs.map((tb) => {
            const active = isActive(tb.to);
            return (
              <Link
                key={tb.key}
                to={tb.to}
                className={`bp6-button bp6-minimal bp6-small ${active ? "bp6-active" : ""}`}
                style={active ? { color: hex, boxShadow: `inset 0 -2px 0 ${hex}` } : undefined}
              >
                {tb.label}
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ marginLeft: "auto" }}>
        <UserAvatar size={30} />
      </div>
    </nav>
  );
}
