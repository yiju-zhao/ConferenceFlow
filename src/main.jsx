import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App";
import DailyReport from "./DailyReport";
import ReportList from "./ReportList";
import ViewReport from "./ViewReport";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/reports" element={<ReportList />} />
        <Route path="/report/:reportId" element={<DailyReport />} />
        <Route path="/view/:date/:fileId" element={<ViewReport />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
