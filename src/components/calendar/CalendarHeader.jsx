import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";

export default function CalendarHeader({ confName }) {
  const { confId } = useParams();
  const { userProfile, signOut } = useAuth();
  const { isAdmin } = useMembership(confId);

  return (
    <div className="cal-header">
      <div className="cal-header-left">
        <Link to="/dashboard" className="cal-header-btn" style={{ padding: "4px 10px", fontSize: 10 }}>
          ← Dashboard
        </Link>
        <span className="cal-header-title">{confName || "Conference"}</span>
        <span className="cal-header-sep">|</span>
        <span className="cal-header-label">Schedule</span>
      </div>
      <div className="cal-header-actions">
        {isAdmin && (
          <Link to={`/conference/${confId}/admin/settings`} className="cal-header-btn">
            Admin
          </Link>
        )}
        <Link to={`/conference/${confId}/reports`} className="cal-header-btn">
          Reports
        </Link>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
          {userProfile?.displayName}
        </span>
      </div>
    </div>
  );
}
