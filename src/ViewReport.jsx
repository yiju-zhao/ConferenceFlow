import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const BUCKET = "gtc-2026-session-daal.firebasestorage.app";

export default function ViewReport() {
  const { date, fileId } = useParams();
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const path = encodeURIComponent(`published-reports/${date}/${fileId}.html`);
    fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${path}?alt=media`)
      .then(r => {
        if (!r.ok) throw new Error(`Report not found (${r.status})`);
        return r.text();
      })
      .then(text => {
        // Strip any leftover contenteditable attributes
        let cleaned = text.replace(/\s*contenteditable(=["'][^"']*["'])?/gi, "");
        // Inject read-only CSS as final safeguard before closing </head>
        const readOnlyCss = `<style>.report-editable,.report-inline-editable{pointer-events:none!important;border-color:transparent!important;background:transparent!important;cursor:default!important}button,input,textarea,select{display:none!important}</style>`;
        cleaned = cleaned.replace("</head>", readOnlyCss + "</head>");
        setHtml(cleaned);
      })
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
