import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const BUCKET = "gtc-2026-session-daal.firebasestorage.app";

export default function ViewReport() {
  const { date, fileId } = useParams();
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const path = encodeURIComponent(`published-reports/${date}/${fileId}.html`);
    fetch(`https://storage.googleapis.com/${BUCKET}/${path}`)
      .then(r => {
        if (!r.ok) throw new Error(`Report not found (${r.status})`);
        return r.text();
      })
      .then(setHtml)
      .catch(e => setError(e.message));
  }, [date, fileId]);

  if (error) return (
    <div style={{ padding: 40, fontFamily: "sans-serif", color: "#555" }}>
      <h2>报告不存在</h2><p>{error}</p>
    </div>
  );

  if (!html) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#888" }}>
      加载中…
    </div>
  );

  return (
    <iframe
      srcDoc={html}
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      title="GTC2026 日报"
    />
  );
}
