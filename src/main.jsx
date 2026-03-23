import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { inject } from "@vercel/analytics";
import "./index.css";
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
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/reports" element={<ReportList />} />
        <Route path="/report/:reportId" element={<ReportRouter />} />
        <Route path="/view/report/:reportId" element={<ReportRouter viewMode />} />
        <Route path="/view/:date/:fileId" element={<ViewReport />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
