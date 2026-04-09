import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";

export default function AuthGuard({ children, requireSuperAdmin = false }) {
  const { t } = useTranslation();
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-secondary text-sm uppercase tracking-wider">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && userProfile?.globalRole !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
