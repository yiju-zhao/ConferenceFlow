import { NavLink, Outlet, useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";
import UserAvatar from "../UserAvatar";

export default function AdminLayout() {
  const { confId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { isAdmin, loading } = useMembership(confId);

  const tabs = [
    { path: "settings", label: t("admin.settings") },
    { path: "sessions", label: t("admin.sessions") },
    { path: "applications", label: t("admin.applications") },
    { path: "attendance", label: t("admin.attendance") },
    { path: "reports", label: t("admin.reports") },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-secondary text-sm uppercase tracking-wider">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-center">
          <p className="text-admin-teal font-headline text-lg font-bold uppercase">
            {t("admin.accessDenied")}
          </p>
          <p className="text-secondary text-sm mt-2">
            {t("admin.needAdminAccess")}
          </p>
          <Link
            to={`/conference/${confId}`}
            className="text-admin-teal text-sm mt-4 inline-block hover:underline"
          >
            {t("admin.backToConference")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <div className="bg-gradient-to-r from-admin-teal-deep to-admin-teal px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1
            className="font-headline text-white text-lg font-bold"
            style={{ letterSpacing: "0.3px" }}
          >
            {t("admin.conferenceAdmin")}
          </h1>
          <div className="flex items-center gap-2.5">
            <Link
              to={`/conference/${confId}`}
              className="font-headline text-white text-xs font-semibold uppercase px-4 py-1.5 rounded transition-colors"
              style={{
                background: "rgba(255,255,255,0.18)",
                letterSpacing: "0.8px",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.3)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.18)")
              }
            >
              {t("calendar.schedule")}
            </Link>
            {isSuperAdmin && (
              <Link
                to="/super-admin"
                className="font-headline text-white text-xs font-semibold uppercase px-4 py-1.5 rounded transition-colors"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  letterSpacing: "0.8px",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.3)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.18)")
                }
              >
                {t("admin.adminPanel")}
              </Link>
            )}
            <UserAvatar size={28} onSignOut={() => navigate("/login")} />
          </div>
        </div>
      </div>
      <div className="bg-white border-b border-[#E8E4DF]">
        <div className="max-w-6xl mx-auto flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={`/conference/${confId}/admin/${tab.path}`}
              className={({ isActive }) =>
                `px-6 h-11 flex items-center text-sm font-headline uppercase tracking-wider transition-colors duration-50 ${isActive ? "text-admin-teal border-b-[3px] border-admin-teal bg-admin-teal/5" : "text-secondary hover:text-on-surface border-b-[3px] border-transparent"}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto p-8">
        <Outlet />
      </div>
    </div>
  );
}
