import { useParams } from "react-router-dom";

export default function ConferenceReport() {
  const { reportId } = useParams();
  return (
    <div className="report-page">
      <div className="report-container" style={{ marginTop: 24, padding: 40 }}>
        <h1>总结稿: {reportId}</h1>
        <p>Coming soon...</p>
      </div>
    </div>
  );
}
