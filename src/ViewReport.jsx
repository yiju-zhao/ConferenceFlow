import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const BUCKET = "gtc-2026-session-daal.firebasestorage.app";

export default function ViewReport() {
  const { date, fileId } = useParams();
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
        // Inject read-only CSS safeguard
        const readOnlyCss = `<style>.report-editable,.report-inline-editable{pointer-events:none!important;border-color:transparent!important;background:transparent!important;cursor:default!important}button,input,textarea,select{display:none!important}.report-toc-link{pointer-events:auto!important;cursor:pointer!important}</style>`;
        cleaned = cleaned.replace("</head>", readOnlyCss + "</head>");
        // Replace current document — makes the page fully printable
        document.open();
        document.write(cleaned);
        document.close();
      })
      .catch(e => setError(e.message));
  }, [date, fileId]);

  if (error) return (
    <div style={{ padding: 40, fontFamily: "sans-serif", color: "#555" }}>
      <h2>报告不存在</h2><p>{error}</p>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#888" }}>
      加载中…
    </div>
  );
}
