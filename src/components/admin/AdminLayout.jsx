import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";

const tabs = [
  { path: "settings", label: "Settings" },
  { path: "sessions", label: "Sessions" },
  { path: "applications", label: "Applications" },
  { path: "attendance", label: "Attendance" },
  { path: "reports", label: "Reports" },
];

export default function AdminLayout() {
  const { confId } = useParams();
  const { user } = useAuth();
  const { isAdmin, loading } = useMembership(confId);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-secondary text-sm uppercase tracking-wider">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-center">
          <p className="text-admin-teal font-headline text-lg font-bold uppercase">Access Denied</p>
          <p className="text-secondary text-sm mt-2">You need admin access for this conference.</p>
          <Link to={`/conference/${confId}`} className="text-admin-teal text-sm mt-4 inline-block hover:underline">
            ← Back to conference
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <div className="bg-gradient-to-r from-admin-teal-deep to-admin-teal px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            <Link to={`/conference/${confId}`}
              className="font-headline text-white text-xs font-semibold uppercase px-4 py-1.5 rounded transition-colors"
              style={{ background: "rgba(255,255,255,0.18)", letterSpacing: "0.8px" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}>
              ← Back
            </Link>
            <h1 className="font-headline text-white text-lg font-bold" style={{ letterSpacing: "0.3px" }}>Conference Admin</h1>
          </div>
          <Link to="/dashboard"
            className="font-headline text-white text-xs font-semibold uppercase px-4 py-1.5 rounded transition-colors"
            style={{ background: "rgba(255,255,255,0.18)", letterSpacing: "0.8px" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}>
            Dashboard
          </Link>
        </div>
      </div>
      <div className="bg-white border-t border-white/10 border-b border-[#E8E4DF]">
        <div className="max-w-6xl mx-auto flex">
          {tabs.map((tab) => (
            <NavLink key={tab.path} to={`/conference/${confId}/admin/${tab.path}`}
              className={({ isActive }) => `px-6 py-3 text-sm font-headline uppercase tracking-wider transition-colors duration-50 ${isActive ? "text-admin-teal border-b-[3px] border-admin-teal bg-admin-teal/5" : "text-secondary hover:text-on-surface"}`}>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto p-8"><Outlet /></div>
    </div>
  );
}
