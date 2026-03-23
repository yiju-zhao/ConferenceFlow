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
        // Inject Noto Sans SC for proper CJK rendering in PDF print
        const fontLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"><style>.report-page,.report-container,body{font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","微软雅黑",sans-serif!important}</style>`;
        // Inject read-only CSS safeguard
        const readOnlyCss = `<style>.report-editable,.report-inline-editable{pointer-events:none!important;border-color:transparent!important;background:transparent!important;cursor:default!important}button:not(#dl-fab button),input,textarea,select{display:none!important}.report-toc-link{pointer-events:auto!important;cursor:pointer!important}</style>`;
        cleaned = cleaned.replace("</head>", fontLink + readOnlyCss + "</head>");

        // Inject a floating download + print button (hidden from print)
        const fab = `
<script>window.__reportHtml=${JSON.stringify(cleaned)};</script>
<style>@media print{#dl-fab{display:none!important}}</style>
<div id="dl-fab" style="position:fixed;top:16px;right:16px;z-index:9999;display:flex;gap:8px">
  <button onclick="(function(){var b=new Blob([window.__reportHtml],{type:'text/html;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='GTC2026_日报_${date}.html';a.click();URL.revokeObjectURL(a.href)})()"
    style="padding:8px 16px;background:#C41E3A;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:inherit">下载 HTML</button>
  <button onclick="window.print()"
    style="padding:8px 16px;background:#fff;color:#333;border:1px solid #ddd;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:inherit">打印</button>
</div>`;
        const withFab = cleaned.replace("</body>", fab + "</body>");

        // Replace current document — makes the page fully printable
        document.open();
        document.write(withFab);
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
