import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";

const tabs = [
  { path: "settings", label: "Settings" },
  { path: "sessions", label: "Sessions" },
  { path: "applications", label: "Applications" },
  { path: "reports", label: "Reports" },
];

export default function AdminLayout() {
  const { confId } = useParams();
  const { user } = useAuth();
  const { isAdmin, loading } = useMembership(confId);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-secondary text-sm uppercase tracking-wider">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-primary font-headline text-lg font-bold uppercase">Access Denied</p>
          <p className="text-secondary text-sm mt-2">You need admin access for this conference.</p>
          <Link to={`/conference/${confId}`} className="text-primary text-sm mt-4 inline-block hover:underline">
            ← Back to conference
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-primary p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to={`/conference/${confId}`} className="text-on-primary/70 text-xs hover:text-on-primary">← Back</Link>
            <h1 className="font-headline text-on-primary text-lg font-bold tracking-tight uppercase">Conference Admin</h1>
          </div>
          <Link to="/dashboard" className="text-on-primary/70 text-xs uppercase tracking-wider hover:text-on-primary">Dashboard</Link>
        </div>
      </div>
      <div className="bg-surface-container-lowest border-b border-surface-dim">
        <div className="max-w-6xl mx-auto flex">
          {tabs.map((tab) => (
            <NavLink key={tab.path} to={`/conference/${confId}/admin/${tab.path}`}
              className={({ isActive }) => `px-6 py-3 text-sm font-headline uppercase tracking-wider transition-colors duration-50 ${isActive ? "text-primary border-b-2 border-primary" : "text-secondary hover:text-on-surface"}`}>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto p-6"><Outlet /></div>
    </div>
  );
}
