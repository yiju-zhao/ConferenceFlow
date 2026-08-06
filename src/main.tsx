import "./i18n";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";
import { inject } from "@vercel/analytics";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import AuthGuard from "./components/AuthGuard";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import Dashboard from "./components/Dashboard";

// Lazy-loaded route components (heavy pages loaded on demand)
const CalendarPage = lazy(() => import("./components/calendar/CalendarPage"));
const DailyReport = lazy(() => import("./components/report/DailyReport"));
const ConferenceReport = lazy(() => import("./components/report/ConferenceReport"));
const ReportList = lazy(() => import("./components/report/ReportList"));
const ViewReport = lazy(() => import("./components/report/ViewReport"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminSettings = lazy(() => import("./components/admin/AdminSettings"));
const AdminSessions = lazy(() => import("./components/admin/AdminSessions"));
const AdminApplications = lazy(() => import("./components/admin/AdminApplications"));
const AdminReports = lazy(() => import("./components/admin/AdminReports"));
const AdminAttendance = lazy(() => import("./components/admin/AdminAttendance"));
const SuperAdminPanel = lazy(() => import("./components/admin/SuperAdminPanel"));

inject();

function LoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}
    >
      <span className="font-mono" style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Loading...
      </span>
    </div>
  );
}

interface ReportRouterProps {
  viewMode?: boolean;
}

function ReportRouter({ viewMode = false }: ReportRouterProps) {
  const { reportId } = useParams() as { reportId: string };
  if (reportId.startsWith("summary-")) {
    return <ConferenceReport />;
  }
  return <DailyReport viewMode={viewMode} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/view/:date/:fileId" element={<ViewReport />} />
              <Route path="/view/report/:reportId" element={<ReportRouter viewMode />} />

              {/* Authenticated routes */}
              <Route
                path="/dashboard"
                element={
                  <AuthGuard>
                    <Dashboard />
                  </AuthGuard>
                }
              />

              {/* Conference-scoped routes */}
              <Route
                path="/conference/:confId"
                element={
                  <AuthGuard>
                    <CalendarPage />
                  </AuthGuard>
                }
              />
              <Route
                path="/conference/:confId/reports"
                element={
                  <AuthGuard>
                    <ReportList />
                  </AuthGuard>
                }
              />
              <Route
                path="/conference/:confId/report/:reportId"
                element={
                  <AuthGuard>
                    <ReportRouter />
                  </AuthGuard>
                }
              />

              {/* Admin routes */}
              <Route
                path="/conference/:confId/admin"
                element={
                  <AuthGuard>
                    <AdminLayout />
                  </AuthGuard>
                }
              >
                <Route index element={<AdminSettings />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="sessions" element={<AdminSessions />} />
                <Route path="applications" element={<AdminApplications />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="attendance" element={<AdminAttendance />} />
              </Route>

              <Route
                path="/super-admin"
                element={
                  <AuthGuard requireSuperAdmin>
                    <SuperAdminPanel />
                  </AuthGuard>
                }
              />

              {/* Legacy routes redirect to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
              <Route path="/report/:reportId" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
