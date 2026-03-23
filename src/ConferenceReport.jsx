import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, storage } from "./firebase";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import {
  SESSION_CATALOG,
  COLOR_PRESETS,
  useDebouncedSave,
  EditableField,
  InlineAddButton,
  BulletEditor,
} from "./shared";

const SECTION_ORDER = ["现场声音", "趋势总结", "推演分析", "关键启示"];

export default function ConferenceReport() {
  const { reportId } = useParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);

  // UI state
  const [openInlineMenu, setOpenInlineMenu] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Refs
  const reportDataRef = useRef(null);
  const reportContainerRef = useRef(null);
  const { debouncedSave, saveState } = useDebouncedSave(600);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // ── Close export dropdown on outside click / Escape ─────────────────────────
  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e) => {
      if (!e.target.closest(".export-dropdown-wrapper")) setShowExportMenu(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setShowExportMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showExportMenu]);

  // ── Close inline-add menu on outside click / Escape ─────────────────────────
  useEffect(() => {
    if (!openInlineMenu) return;
    const close = (e) => {
      if (!e.target.closest(".inline-add-zone")) setOpenInlineMenu(null);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setOpenInlineMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openInlineMenu]);

  // ── Members listener ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "members"), (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push(d.data()));
      arr.sort((a, b) => Number(a.id) - Number(b.id));
      setMembers(arr);
    });
  }, [user]);

  // ── Report data listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "dailyReports", reportId), (snap) => {
      setReportData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [user, reportId]);

  // Keep ref in sync
  reportDataRef.current = reportData;

  // ── Save helpers ────────────────────────────────────────────────────────────
  const saveField = useCallback(
    (field, value) => {
      if (!user) return;
      debouncedSave(field, () => {
        setDoc(doc(db, "dailyReports", reportId), { [field]: value }, { merge: true }).catch(
          console.error
        );
      });
    },
    [user, reportId, debouncedSave]
  );

  // ── Section block operations ────────────────────────────────────────────────
  const saveSectionBlocks = useCallback(
    (sectionName, blocks) => {
      if (!user) return;
      debouncedSave(`section-${sectionName}`, () => {
        setDoc(
          doc(db, "dailyReports", reportId),
          {
            sections: {
              [sectionName]: {
                ...reportDataRef.current?.sections?.[sectionName],
                blocks,
              },
            },
          },
          { merge: true }
        ).catch(console.error);
      });
    },
    [user, reportId, debouncedSave]
  );

  const addSectionBlock = useCallback(
    (sectionName, type, afterId) => {
      const section = reportDataRef.current?.sections?.[sectionName] || { blocks: [] };
      const newBlock = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        type,
        content: "",
        citations: [],
      };
      const blocks = [...(section.blocks || [])];
      if (afterId) {
        const idx = blocks.findIndex((b) => b.id === afterId);
        blocks.splice(idx + 1, 0, newBlock);
      } else {
        blocks.push(newBlock);
      }
      saveSectionBlocks(sectionName, blocks);
    },
    [saveSectionBlocks]
  );

  const updateSectionBlock = useCallback(
    (sectionName, blockId, fields) => {
      const section = reportDataRef.current?.sections?.[sectionName] || { blocks: [] };
      saveSectionBlocks(
        sectionName,
        (section.blocks || []).map((b) => (b.id === blockId ? { ...b, ...fields } : b))
      );
    },
    [saveSectionBlocks]
  );

  const removeSectionBlock = useCallback(
    (sectionName, blockId) => {
      const section = reportDataRef.current?.sections?.[sectionName] || { blocks: [] };
      saveSectionBlocks(
        sectionName,
        (section.blocks || []).filter((b) => b.id !== blockId)
      );
    },
    [saveSectionBlocks]
  );

  // ── Formatting ──────────────────────────────────────────────────────────────
  const execCmd = (cmd, val) =>
    /** @type {any} */ (document).execCommand(cmd, false, val ?? undefined);
  const execBold = () => execCmd("bold");
  const execColor = (color) => {
    execCmd("foreColor", color);
    setShowColorPicker(false);
  };

  // ── Computed ────────────────────────────────────────────────────────────────
  const citations = reportData?.citations || [];

  const sitePhotos = reportData?.sitePhotos || [];

  // Group photos by date (using the source field or fallback to index)
  const photosByDate = useMemo(() => {
    if (!sitePhotos.length) return [];
    const groups = {};
    sitePhotos.forEach((photo, idx) => {
      const dateKey = photo.source || "未分类";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push({ ...photo, originalIdx: idx });
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [sitePhotos]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="report-page">
        <div className="report-container" style={{ textAlign: "center", padding: "80px 20px" }}>
          <p style={{ color: "var(--text-muted)" }}>加载中...</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="report-page">
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link to="/" className="report-back-btn">
              ← 返回日程
            </Link>
            <div style={{ width: 1, height: 20, background: "var(--border)" }} />
            <Link to="/reports" className="report-tool-btn" style={{ textDecoration: "none" }}>
              日报列表
            </Link>
          </div>
          <div className="report-toolbar-actions">
            {saveState === "saving" && (
              <span className="report-status-msg" style={{ color: "var(--text-dim)" }}>
                ● 保存中...
              </span>
            )}
            {saveState === "saved" && (
              <span className="report-status-msg" style={{ color: "var(--success)" }}>
                ✓ 已保存
              </span>
            )}
            <div className="report-toolbar-divider" />
            {/* Formatting buttons */}
            <button className="report-icon-btn" onClick={execBold} title="加粗">
              <strong>B</strong>
            </button>
            <button className="report-icon-btn" onClick={() => execCmd("italic")} title="斜体">
              <em style={{ fontStyle: "italic" }}>I</em>
            </button>
            <button
              className="report-icon-btn"
              onClick={() => execCmd("underline")}
              title="下划线"
            >
              <span style={{ textDecoration: "underline" }}>U</span>
            </button>
            <div style={{ position: "relative" }}>
              <button
                className="report-icon-btn"
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="字体颜色"
              >
                <span style={{ borderBottom: "3px solid var(--brand)", paddingBottom: 1 }}>A</span>
              </button>
              {showColorPicker && (
                <div className="report-color-picker">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      className="report-color-swatch"
                      style={{ background: c }}
                      onClick={() => execColor(c)}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </div>
            <div
              style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }}
            />
            {/* Export dropdown — placeholder for Task 6 */}
            <div className="export-dropdown-wrapper" style={{ position: "relative" }}>
              <button
                className="report-export-btn"
                onClick={() => !exporting && setShowExportMenu((v) => !v)}
                disabled={exporting}
                aria-haspopup="true"
                aria-expanded={showExportMenu}
              >
                {exporting ? "生成中..." : "导出 ▾"}
              </button>
              {showExportMenu && (
                <div className="export-dropdown-menu">
                  <button
                    className="export-menu-item"
                    onClick={() => setShowExportMenu(false)}
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span className="export-menu-label">导出功能即将上线</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Share Modal ──────────────────────────────────────────── */}
      {shareUrl && (
        <div
          className="share-modal-overlay"
          onClick={() => {
            setShareUrl(null);
            setUrlCopied(false);
          }}
        >
          <div className="share-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="share-modal-header">
              <span className="share-modal-title">可分享的公开链接</span>
              <button
                className="share-modal-close"
                onClick={() => {
                  setShareUrl(null);
                  setUrlCopied(false);
                }}
              >
                ×
              </button>
            </div>
            <div className="share-modal-url-row">
              <span className="share-modal-url">{shareUrl}</span>
              <button
                className={`share-modal-copy-btn${urlCopied ? " share-modal-copy-btn--copied" : ""}`}
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setUrlCopied(true);
                  setTimeout(() => setUrlCopied(false), 2000);
                }}
              >
                {urlCopied ? "✓ 已复制" : "复制链接"}
              </button>
            </div>
            <p className="share-modal-hint">链接可公开访问，任何人均可查看。</p>
          </div>
        </div>
      )}

      {/* ── Report Content ───────────────────────────────────────── */}
      <div className="report-container" ref={reportContainerRef}>
        {/* Title bar */}
        <div className="report-title-bar">
          <div className="report-title-eyebrow">GTC 2026 · 总结稿</div>
          <h1>
            <EditableField
              value={reportData?.title || ""}
              onSave={(html) => saveField("title", html)}
              placeholder="输入总结稿标题..."
              minHeight={32}
            />
          </h1>
        </div>

        {/* Table of Contents */}
        <div className="report-toc" id="report-toc">
          <h2 className="report-section-title">目录</h2>
          <ul className="report-toc-list">
            {SECTION_ORDER.map((name) => (
              <li key={name} className="report-toc-section-item">
                <a href={`#section-${name}`} className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">{name}</span>
                </a>
              </li>
            ))}
            <li className="report-toc-section-item">
              <a
                href="#section-附录1"
                className="report-toc-link report-toc-section-link"
              >
                <span className="report-toc-title">附录1: 会议照片</span>
              </a>
            </li>
            <li className="report-toc-section-item">
              <a
                href="#section-附录2"
                className="report-toc-link report-toc-section-link"
              >
                <span className="report-toc-title">附录2: 参考信息</span>
              </a>
            </li>
          </ul>
        </div>

        {/* ── Sections ─────────────────────────────────────────────── */}
        {SECTION_ORDER.map((sectionName) => {
          const section = reportData?.sections?.[sectionName] || { blocks: [] };
          const blocks = section.blocks || [];

          return (
            <div key={sectionName} className="conference-section" style={{ marginBottom: 40 }}>
              <h2
                className="report-section-heading"
                id={`section-${sectionName}`}
              >
                {sectionName}
              </h2>

              {blocks.length === 0 && (
                <div
                  className="conference-section-empty no-print"
                  style={{
                    padding: "24px 0",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <button
                    className="report-tool-btn"
                    onClick={() => addSectionBlock(sectionName, "heading")}
                    style={{ fontSize: 13 }}
                  >
                    + 小标题
                  </button>
                  <button
                    className="report-tool-btn"
                    onClick={() => addSectionBlock(sectionName, "body")}
                    style={{ fontSize: 13 }}
                  >
                    + 正文
                  </button>
                </div>
              )}

              {blocks.map((block) => (
                <div key={block.id}>
                  {block.type === "heading" ? (
                    <div className="onsite-block-heading" style={{ position: "relative" }}>
                      <EditableField
                        value={block.content}
                        onSave={(html) =>
                          updateSectionBlock(sectionName, block.id, { content: html })
                        }
                        placeholder="输入小标题..."
                        minHeight={28}
                      />
                      <button
                        className="onsite-block-body-remove no-print"
                        onClick={() => removeSectionBlock(sectionName, block.id)}
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="conference-body-block" style={{ position: "relative" }}>
                      <button
                        className="onsite-block-body-remove no-print"
                        onClick={() => removeSectionBlock(sectionName, block.id)}
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 0,
                        }}
                      >
                        ×
                      </button>
                      <EditableField
                        value={block.content}
                        onSave={(html) =>
                          updateSectionBlock(sectionName, block.id, { content: html })
                        }
                        placeholder="输入正文内容..."
                        minHeight={60}
                      />
                      {/* Citation badges */}
                      {(block.citations || []).length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            flexWrap: "wrap",
                            marginTop: 8,
                          }}
                        >
                          {(block.citations || []).map((citIdx, i) => (
                            <span key={i} className="citation-badge">
                              [{citIdx}]
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Citation add — placeholder for Task 5 */}
                      <button
                        className="citation-add-btn no-print"
                        onClick={() => {
                          /* Task 5: open citation picker */
                        }}
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: "var(--text-muted)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        + 添加引用
                      </button>
                    </div>
                  )}

                  <InlineAddButton
                    field={sectionName}
                    afterId={block.id}
                    openKey={openInlineMenu}
                    onOpen={setOpenInlineMenu}
                    onInsert={(field, type, afterId) => addSectionBlock(field, type, afterId)}
                  />
                </div>
              ))}
            </div>
          );
        })}

        {/* ── 附录1: 会议照片 ─────────────────────────────────────── */}
        <div className="conference-section" style={{ marginBottom: 40 }}>
          <h2 className="report-section-heading" id="section-附录1">
            附录1: 会议照片
          </h2>
          {photosByDate.length === 0 ? (
            <p style={{ color: "var(--text-muted)", padding: "16px 0" }}>
              暂无照片。照片将从关联的日报中汇总。
            </p>
          ) : (
            photosByDate.map(([dateKey, photos]) => (
              <div key={dateKey} style={{ marginBottom: 24 }}>
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 12,
                  }}
                >
                  {dateKey}
                </h3>
                <div
                  className="photo-wall-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 12,
                  }}
                >
                  {photos.map((photo) => (
                    <div
                      key={photo.originalIdx}
                      style={{
                        borderRadius: 8,
                        overflow: "hidden",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <img
                        src={photo.image}
                        alt={photo.caption || `照片 ${photo.originalIdx + 1}`}
                        style={{
                          width: "100%",
                          display: "block",
                        }}
                      />
                      {photo.caption && (
                        <p
                          style={{
                            padding: "8px 10px",
                            margin: 0,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            lineHeight: 1.5,
                          }}
                        >
                          {photo.caption}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── 附录2: 参考信息 ─────────────────────────────────────── */}
        <div className="conference-section" style={{ marginBottom: 40 }}>
          <h2 className="report-section-heading" id="section-附录2">
            附录2: 参考信息
          </h2>
          {citations.length === 0 ? (
            <p style={{ color: "var(--text-muted)", padding: "16px 0" }}>
              暂无引用。引用将在编辑内容时通过「添加引用」按钮添加。
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {citations.map((cite, idx) => {
                const sessionInfo = cite.sessionId
                  ? SESSION_CATALOG.get(cite.sessionId)
                  : null;
                return (
                  <div key={idx} className="citation-ref-item">
                    <span className="citation-ref-number">[{idx + 1}]</span>
                    <div style={{ flex: 1 }}>
                      {/* Session info */}
                      {sessionInfo && (
                        <div style={{ marginBottom: 4 }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: 12,
                              color: "var(--text-muted)",
                              marginRight: 6,
                            }}
                          >
                            {cite.sessionId}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              color: "var(--text-secondary)",
                              fontWeight: 500,
                            }}
                          >
                            {sessionInfo.title}
                          </span>
                        </div>
                      )}
                      {/* Link */}
                      {cite.link && (
                        <a
                          href={cite.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="citation-ref-link"
                          style={{
                            fontSize: 12,
                            color: "var(--info)",
                            textDecoration: "underline",
                            wordBreak: "break-all",
                          }}
                        >
                          {cite.link}
                        </a>
                      )}
                      {/* Text content */}
                      {cite.text && (
                        <p
                          className="citation-ref-text"
                          style={{
                            margin: "4px 0 0",
                            fontSize: 13,
                            color: "var(--text-secondary)",
                            lineHeight: 1.6,
                          }}
                        >
                          {cite.text}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="report-footer">
          <div className="report-footer-inner">
            <p>GTC 2026 · 总结稿 · 团队协作生成</p>
          </div>
        </div>
      </div>
    </div>
  );
}
