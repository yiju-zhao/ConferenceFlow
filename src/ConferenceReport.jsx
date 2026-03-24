import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, storage } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

export default function ConferenceReport() {
  const { reportId } = useParams();

  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  // ── Check for existing upload on mount ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        // Try Firestore doc first
        const snap = await getDoc(doc(db, "dailyReports", reportId));
        if (!cancelled && snap.exists() && snap.data().publishedUrl) {
          setShareUrl(snap.data().publishedUrl);
          setPreviewUrl(snap.data().publishedUrl);
          setLoadingExisting(false);
          return;
        }

        // Fallback: try storage directly
        const storageRef = ref(storage, `public/summary-${reportId}.html`);
        const url = await getDownloadURL(storageRef);
        if (!cancelled) {
          setShareUrl(url);
          setPreviewUrl(url);
        }
      } catch {
        // No existing upload — that's fine
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, reportId]);

  // ── viewMode: redirect to published URL ───────────────────────────────────
  // If accessed via /view/report/summary-*, redirect to the published HTML
  const isViewMode = window.location.pathname.startsWith("/view/");
  useEffect(() => {
    if (!isViewMode || loadingExisting) return;
    if (shareUrl) {
      window.location.href = shareUrl;
    }
  }, [isViewMode, shareUrl, loadingExisting]);

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file || !file.name.endsWith(".html")) {
      setError("请选择 .html 文件");
      return;
    }
    setError(null);
    setUploading(true);

    try {
      const html = await file.text();
      const storageRef = ref(storage, `public/summary-${reportId}.html`);
      await uploadString(storageRef, html, "raw", {
        contentType: "text/html; charset=utf-8",
      });
      const url = await getDownloadURL(storageRef);

      // Save URL to Firestore
      await setDoc(
        doc(db, "dailyReports", reportId),
        { publishedUrl: url, publishedAt: serverTimestamp() },
        { merge: true }
      );

      setShareUrl(url);
      setPreviewUrl(url);
      setFileName(file.name);
    } catch (err) {
      console.error("[Upload] Failed:", err);
      setError(`上传失败：${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [reportId]);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const onFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  const copyUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  // If viewMode and still loading, show a brief loader
  if (isViewMode) {
    return (
      <div className="report-page">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#888" }}>
          {loadingExisting ? "加载中..." : shareUrl ? "跳转中..." : "该总结稿尚未上传"}
        </div>
      </div>
    );
  }

  return (
    <div className="report-page">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <Link to="/reports" className="report-back-btn">&larr; 返回日程</Link>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="report-container" style={{ marginTop: 24, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div className="report-title-eyebrow" style={{ marginBottom: 4 }}>GTC 2026 · CONFERENCE REPORT</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A1A" }}>
            总结稿
            <span style={{ fontWeight: 400, fontSize: 14, color: "#888", marginLeft: 12 }}>{reportId}</span>
          </h2>
        </div>

        {/* ── Upload Zone ──────────────────────────────────────── */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? "#991b1b" : "#ddd"}`,
            borderRadius: 8,
            padding: "48px 24px",
            textAlign: "center",
            background: dragOver ? "#fef2f2" : "#fafafa",
            cursor: "pointer",
            transition: "all 0.15s",
            marginBottom: 24,
          }}
          onClick={() => document.getElementById("html-file-input").click()}
        >
          <input
            id="html-file-input"
            type="file"
            accept=".html"
            style={{ display: "none" }}
            onChange={onFileSelect}
          />
          {uploading ? (
            <div style={{ color: "#991b1b", fontWeight: 600 }}>上传中...</div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>📄</div>
              <div style={{ fontSize: 14, color: "#555", fontWeight: 500 }}>
                拖拽 .html 文件到此处，或点击选择文件
              </div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 8 }}>
                上传后将替换已有版本
              </div>
            </>
          )}
        </div>

        {error && (
          <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 16, padding: "8px 12px", background: "#fef2f2", borderRadius: 4 }}>
            {error}
          </div>
        )}

        {/* ── Status ───────────────────────────────────────────── */}
        {loadingExisting ? (
          <div style={{ color: "#888", fontSize: 13, padding: "16px 0" }}>检查已有上传...</div>
        ) : shareUrl ? (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#166534" }}>
                ✓ 已上传{fileName ? ` — ${fileName}` : ""}
              </span>
              <button
                onClick={copyUrl}
                style={{
                  padding: "6px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  background: urlCopied ? "#16a34a" : "#991b1b",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                {urlCopied ? "✓ 已复制" : "复制链接"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#555", wordBreak: "break-all", lineHeight: 1.5 }}>
              {shareUrl}
            </div>
          </div>
        ) : (
          <div style={{ color: "#aaa", fontSize: 13, padding: "16px 0", textAlign: "center" }}>
            未上传 — 请选择 HTML 文件上传
          </div>
        )}

        {/* ── Preview ──────────────────────────────────────────── */}
        {previewUrl && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Preview
            </div>
            <iframe
              src={previewUrl}
              title="Report Preview"
              style={{
                width: "100%",
                height: "70vh",
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                background: "#fff",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
