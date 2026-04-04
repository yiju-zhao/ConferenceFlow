import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";
import UserAvatar from "../UserAvatar";

export default function CalendarHeader({ confName }) {
  const { confId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useMembership(confId);

  return (
    <div className="cal-header">
      <div className="cal-header-left">
        <Link to="/dashboard" className="cal-header-btn" style={{ padding: "6px 12px", fontSize: 12 }}>
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
        <UserAvatar size={28} onSignOut={() => navigate("/login")} />
      </div>
    </div>
  );
}
