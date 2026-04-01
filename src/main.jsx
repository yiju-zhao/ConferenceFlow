import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";
import { inject } from "@vercel/analytics";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import AuthGuard from "./components/AuthGuard";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import Dashboard from "./components/Dashboard";
import App from "./App";
import DailyReport from "./DailyReport";
import ConferenceReport from "./ConferenceReport";
import ReportList from "./ReportList";
import ViewReport from "./ViewReport";

inject();

function ReportRouter({ viewMode = false }) {
  const { reportId } = useParams();
  if (reportId.startsWith("summary-")) {
    return <ConferenceReport />;
  }
  return <DailyReport viewMode={viewMode} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/view/:date/:fileId" element={<ViewReport />} />
          <Route path="/view/report/:reportId" element={<ReportRouter viewMode />} />

          {/* Authenticated routes */}
          <Route path="/dashboard" element={
            <AuthGuard><Dashboard /></AuthGuard>
          } />

          {/* Conference-scoped routes */}
          <Route path="/conference/:confId" element={
            <AuthGuard><App /></AuthGuard>
          } />
          <Route path="/conference/:confId/reports" element={
            <AuthGuard><ReportList /></AuthGuard>
          } />
          <Route path="/conference/:confId/report/:reportId" element={
            <AuthGuard><ReportRouter /></AuthGuard>
          } />

          {/* Legacy routes redirect to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
          <Route path="/report/:reportId" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
