import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db, storage } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import {
  ref as sRef,
  uploadString,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";
import { useTranslation } from "react-i18next";
import type { Report, SitePhoto } from "../../types";

export default function ConferenceReport() {
  const { confId, reportId } = useParams() as {
    confId: string;
    reportId: string;
  };
  const { user } = useAuth();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [reportData, setReportData] = useState<Report | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reportDataRef = useRef<Report | null>(null);
  const savedHtmlRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sitePhotoInputRef = useRef<HTMLInputElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);
  const { debouncedSave } = useDebouncedSave();

  // ── Real-time Firestore listener ────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "conferences", confId, "dailyReports", reportId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Report;
          setReportData(data);
          reportDataRef.current = data;
          if (data.publishedUrl) {
            setShareUrl(data.publishedUrl);
            setPreviewUrl(data.publishedUrl);
          }
        }
        setLoadingExisting(false);
      },
      () => {
        setLoadingExisting(false);
      },
    );
    return unsub;
  }, [user, reportId]);

  // ── Fetch HTML when previewUrl changes (skip during editing) ──────────
  useEffect(() => {
    if (!previewUrl || editing) return;
    let cancelled = false;
    fetch(previewUrl)
      .then((r) => r.text())
      .then((html) => {
        if (!cancelled) {
          setHtmlContent(html);
          savedHtmlRef.current = html;
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [previewUrl, editing]);

  // ── Toggle designMode when editing state changes ──────────────────────
  useEffect(() => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;
    iframeDoc.designMode = editing ? "on" : "off";
  }, [editing]);

  // ── viewMode: redirect to published URL ───────────────────────────────────
  const isViewMode = window.location.pathname.startsWith("/view/");
  useEffect(() => {
    if (!isViewMode || loadingExisting) return;
    if (shareUrl) {
      window.location.href = shareUrl;
    }
  }, [isViewMode, shareUrl, loadingExisting]);

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !file.name.endsWith(".html")) {
        setError(t("report.selectHtmlFile"));
        return;
      }
      setError(null);
      setUploading(true);

      try {
        const html = await file.text();
        setHtmlContent(html);
        savedHtmlRef.current = html;

        const fileRef = sRef(storage, `public/summary-${reportId}.html`);
        await uploadString(fileRef, html, "raw", {
          contentType: "text/html; charset=utf-8",
        });
        const url = await getDownloadURL(fileRef);

        await setDoc(
          doc(db, "conferences", confId, "dailyReports", reportId),
          { publishedUrl: url, publishedAt: serverTimestamp() },
          { merge: true },
        );
      } catch (err) {
        console.error("[Upload] Failed:", err);
        setError(
          t("report.uploadFailed", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        setUploading(false);
      }
    },
    [reportId],
  );

  // ── Save edited HTML back to Storage ──────────────────────────────────
  const handleSaveEdit = useCallback(async () => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;
    setSaving(true);
    try {
      const edited = "<!DOCTYPE html>\n" + iframeDoc.documentElement.outerHTML;
      setHtmlContent(edited);
      savedHtmlRef.current = edited;
      setEditing(false);

      const fileRef = sRef(storage, `public/summary-${reportId}.html`);
      await uploadString(fileRef, edited, "raw", {
        contentType: "text/html; charset=utf-8",
      });
      const url = await getDownloadURL(fileRef);
      await setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        { publishedUrl: url, publishedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      console.error("[Save] Failed:", err);
      setError(
        t("report.saveFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSaving(false);
    }
  }, [reportId]);

  // ── Cancel editing ────────────────────────────────────────────────────
  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setHtmlContent(savedHtmlRef.current);
  }, []);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const copyUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  // ── Image compression & upload ──────────────────────────────────────────
  const compressImage = useCallback(
    (file: File, maxPx = 1200, quality = 0.75): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas
            .getContext("2d")!
            .drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = url;
      });
    },
    [],
  );

  const uploadToStorage = useCallback(
    async (base64DataUrl: string, path: string): Promise<string> => {
      const fileRef = sRef(storage, path);
      await uploadString(fileRef, base64DataUrl, "data_url");
      return getDownloadURL(fileRef);
    },
    [],
  );

  // ── Site Photo handlers ─────────────────────────────────────────────────
  const handleSitePhotoAdd = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const objUrl = URL.createObjectURL(file);
      const imgEl = new window.Image();
      imgEl.onload = () => {
        const w = imgEl.naturalWidth;
        const h = imgEl.naturalHeight;
        URL.revokeObjectURL(objUrl);
        const storagePath = `sitePhotos/${reportId}/${Date.now()}`;
        compressImage(file)
          .then((compressed) => uploadToStorage(compressed, storagePath))
          .then((url) => {
            const photos: SitePhoto[] = [
              ...(reportDataRef.current?.sitePhotos || []),
              { image: url, storagePath, caption: "", source: "", w, h },
            ];
            setDoc(
              doc(db, "conferences", confId, "dailyReports", reportId),
              { sitePhotos: photos },
              { merge: true },
            ).catch(console.error);
          });
      };
      imgEl.src = objUrl;
    },
    [compressImage, uploadToStorage, reportId],
  );

  const handleSitePhotoDelete = useCallback(
    (idx: number) => {
      const photos: SitePhoto[] = reportDataRef.current?.sitePhotos || [];
      const photo = photos[idx];
      if (photo?.storagePath) {
        deleteObject(sRef(storage, photo.storagePath)).catch(() => {});
      }
      const updated = photos.filter((_, i) => i !== idx);
      setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        { sitePhotos: updated },
        { merge: true },
      ).catch(console.error);
    },
    [reportId],
  );

  const saveSitePhotoCaption = useCallback(
    (idx: number, caption: string) => {
      debouncedSave(`sitePhoto-caption-${idx}`, async () => {
        const photos: SitePhoto[] = [
          ...(reportDataRef.current?.sitePhotos || []),
        ];
        if (photos[idx]) photos[idx] = { ...photos[idx], caption };
        await setDoc(
          doc(db, "conferences", confId, "dailyReports", reportId),
          { sitePhotos: photos },
          { merge: true },
        ).catch(console.error);
      });
    },
    [reportId, debouncedSave],
  );

  const saveSitePhotoSource = useCallback(
    (idx: number, source: string) => {
      debouncedSave(`sitePhoto-source-${idx}`, async () => {
        const photos: SitePhoto[] = [
          ...(reportDataRef.current?.sitePhotos || []),
        ];
        if (photos[idx]) photos[idx] = { ...photos[idx], source };
        await setDoc(
          doc(db, "conferences", confId, "dailyReports", reportId),
          { sitePhotos: photos },
          { merge: true },
        ).catch(console.error);
      });
    },
    [debouncedSave, reportId],
  );

  // ── View mode ───────────────────────────────────────────────────────────
  if (isViewMode) {
    return (
      <div className="report-page">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            color: "#888",
          }}
        >
          {loadingExisting
            ? t("common.loading")
            : shareUrl
              ? t("report.redirecting")
              : t("report.notUploadedYet")}
        </div>
      </div>
    );
  }

  const sitePhotos = reportData?.sitePhotos || [];

  const toolbarBtnStyle = {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 700,
    background: "#fff",
    color: "#333",
    border: "1px solid #ddd",
    borderRadius: 4,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  };

  return (
    <div className="report-page">
      {/* ── Hidden file inputs ─────────────────────────────────── */}
      <input
        ref={htmlFileInputRef}
        type="file"
        accept=".html"
        style={{ display: "none" }}
        onChange={onFileSelect}
      />
      <input
        ref={sitePhotoInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleSitePhotoAdd}
      />

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <Link
            to={`/conference/${confId}/reports`}
            className="report-back-btn"
          >
            {t("report.backToReportList")}
          </Link>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!editing && (
              <button
                onClick={() => htmlFileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  background: "#991b1b",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: uploading ? "wait" : "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                  opacity: uploading ? 0.6 : 1,
                }}
              >
                {uploading ? t("report.uploading") : t("report.uploadHtml")}
              </button>
            )}
            {htmlContent && !editing && (
              <button onClick={() => setEditing(true)} style={toolbarBtnStyle}>
                {t("admin.edit")}
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: "#991b1b",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    cursor: saving ? "wait" : "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
                <button onClick={handleCancelEdit} style={toolbarBtnStyle}>
                  {t("common.cancel")}
                </button>
              </>
            )}
            {shareUrl && !editing && (
              <button
                onClick={copyUrl}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  background: urlCopied ? "#16a34a" : "#fff",
                  color: urlCopied ? "#fff" : "#333",
                  border: urlCopied ? "none" : "1px solid #ddd",
                  borderRadius: 4,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                {urlCopied ? t("report.linkCopied") : t("report.copyLink")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────── */}
      {loadingExisting ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            color: "#888",
          }}
        >
          {t("report.checkingExisting")}
        </div>
      ) : !previewUrl && !htmlContent ? (
        /* ── No report yet: Upload zone ────────────────────── */
        <div
          className="report-container"
          style={{
            marginTop: 24,
            maxWidth: 720,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div style={{ marginBottom: 32 }}>
            <div className="report-title-eyebrow" style={{ marginBottom: 4 }}>
              {t("report.conferenceReport")}
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              {t("report.summaryReport")}
              <span
                style={{
                  fontWeight: 400,
                  fontSize: 14,
                  color: "#888",
                  marginLeft: 12,
                }}
              >
                {reportId}
              </span>
            </h2>
          </div>

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
            onClick={() => htmlFileInputRef.current?.click()}
          >
            {uploading ? (
              <div style={{ color: "#991b1b", fontWeight: 600 }}>
                {t("report.uploading")}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>
                  📄
                </div>
                <div style={{ fontSize: 14, color: "#555", fontWeight: 500 }}>
                  {t("report.dragDropHtml")}
                </div>
                <div style={{ fontSize: 12, color: "#aaa", marginTop: 8 }}>
                  {t("report.uploadReplacesExisting")}
                </div>
              </>
            )}
          </div>

          {error && (
            <div
              style={{
                color: "#dc2626",
                fontSize: 13,
                marginBottom: 16,
                padding: "8px 12px",
                background: "#fef2f2",
                borderRadius: 4,
              }}
            >
              {error}
            </div>
          )}
        </div>
      ) : (
        /* ── Report exists: Iframe + Photo section ─────────── */
        <>
          {error && (
            <div
              style={{
                maxWidth: 1100,
                margin: "8px auto",
                padding: "8px 12px",
                color: "#dc2626",
                fontSize: 13,
                background: "#fef2f2",
                borderRadius: 4,
              }}
            >
              {error}
            </div>
          )}

          {/* Seamless iframe with srcdoc for same-origin editing */}
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            {htmlContent ? (
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                title="Conference Report"
                onLoad={() => {
                  const iframeDoc = iframeRef.current?.contentDocument;
                  if (iframeDoc && editing) iframeDoc.designMode = "on";
                }}
                style={{
                  width: "100%",
                  height: "calc(100vh - 120px)",
                  border: editing ? "2px solid #991b1b" : "none",
                  display: "block",
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "calc(100vh - 120px)",
                  color: "#888",
                }}
              >
                {t("report.loadingContent")}
              </div>
            )}
          </div>

          {/* ── 展会近距离 Photo Section ────────────────────── */}
          <div
            className="report-container"
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "32px 40px 48px",
            }}
          >
            <h2 className="report-section-title" style={{ marginTop: 0 }}>
              {t("report.sitePhotos")}
            </h2>
            <div className="conference-photos-grid">
              {sitePhotos.map((photo, idx) => (
                <div key={idx} className="site-photo-card">
                  <div className="site-photo-img-wrapper">
                    <img
                      src={photo.image}
                      alt={t("report.sitePhotoAlt", { index: idx + 1 })}
                      className="site-photo-img"
                    />
                    <button
                      className="site-photo-delete-btn no-print"
                      onClick={() => handleSitePhotoDelete(idx)}
                      title={t("report.deleteImage")}
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    className="site-photo-caption"
                    placeholder={t("report.imageCaption")}
                    defaultValue={photo.caption}
                    onBlur={(e) => saveSitePhotoCaption(idx, e.target.value)}
                    onChange={(e) => {
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    ref={(el) => {
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = el.scrollHeight + "px";
                      }
                    }}
                  />
                  <input
                    className="site-photo-source"
                    type="text"
                    placeholder={t("report.sourcePlaceholder")}
                    defaultValue={photo.source || ""}
                    onBlur={(e) => saveSitePhotoSource(idx, e.target.value)}
                  />
                </div>
              ))}
              <div
                className="site-photo-add-card"
                onClick={() => sitePhotoInputRef.current?.click()}
              >
                <div className="site-photo-add-inner">
                  <span className="site-photo-add-icon">+</span>
                  <span className="site-photo-add-label">
                    {t("report.addImage")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
