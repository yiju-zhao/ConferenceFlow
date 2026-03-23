import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import "./index.css";
import App from "./App";
import DailyReport from "./DailyReport";
import ConferenceReport from "./ConferenceReport";
import ReportList from "./ReportList";
import ViewReport from "./ViewReport";

function ReportRouter() {
  const { reportId } = useParams();
  if (reportId.startsWith("summary-")) {
    return <ConferenceReport />;
  }
  return <DailyReport />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/reports" element={<ReportList />} />
        <Route path="/report/:reportId" element={<ReportRouter />} />
        <Route path="/view/:date/:fileId" element={<ViewReport />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
