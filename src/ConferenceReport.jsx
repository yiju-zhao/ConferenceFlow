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
import { ref, uploadString, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import {
  SESSION_CATALOG,
  COLOR_PRESETS,
  DAY_CN,
  parseReportId,
  useDebouncedSave,
  EditableField,
} from "./shared";
import VoicesSection from "./sections/VoicesSection";
import TrendsSection from "./sections/TrendsSection";
import AnalysisSection from "./sections/AnalysisSection";
import InsightsSection from "./sections/InsightsSection";

const SECTION_ORDER = ["现场声音", "趋势总结", "推演分析", "关键启示"];
const SECTION_NAV = { "现场声音": "Voices", "趋势总结": "Trends", "推演分析": "Analysis", "关键启示": "Insights" };
const SECTION_COMPONENTS = {
  "现场声音": VoicesSection,
  "趋势总结": TrendsSection,
  "推演分析": AnalysisSection,
  "关键启示": InsightsSection,
};

const SECTION_EMPTY_BLOCK_TYPES = {
  "现场声音": [
    { type: "category-header", label: "分类标题", extraFields: { icon: "memory", label: "", count: "" } },
    { type: "session-card", label: "Session 卡片", extraFields: { sessionCode: "", title: "", speakers: "", quote: "" } },
  ],
  "趋势总结": [
    { type: "trend-title", label: "趋势标题" },
    { type: "trend-summary", label: "趋势概要" },
    { type: "evidence-bullet", label: "证据要点" },
  ],
  "推演分析": [
    { type: "stat-card", label: "数据卡片", extraFields: { label: "", value: "", description: "" } },
    { type: "tree-root", label: "推演根节点", extraFields: { title: "", content: "" } },
    { type: "tree-branch", label: "推演分支", extraFields: { title: "", content: "" } },
    { type: "tree-evidence", label: "证据节点", extraFields: { content: "", source: "" } },
    { type: "tree-conclusion", label: "结论" },
  ],
  "关键启示": [
    { type: "heading", label: "小标题" },
    { type: "body", label: "正文" },
  ],
};

export default function ConferenceReport() {
  const { reportId } = useParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);

  // UI state
  const [openInlineMenu, setOpenInlineMenu] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Citation picker state
  const [citationPicker, setCitationPicker] = useState(null);
  const [citationTab, setCitationTab] = useState("session");
  const [citationQuery, setCitationQuery] = useState("");
  const [citationLinkUrl, setCitationLinkUrl] = useState("");
  const [citationLinkLabel, setCitationLinkLabel] = useState("");
  const [citationText, setCitationText] = useState("");

  // Snapshot state
  const [snapshots, setSnapshots] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(null);

  // Refs
  const reportDataRef = useRef(null);
  const reportContainerRef = useRef(null);
  const createSnapshotRef = useRef(null);
  const lastSnapshotHashRef = useRef(null);
  const snapshotsColRef = collection(db, "dailyReports", reportId, "snapshots");
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

  // ── Daily reports listener (for sidebar) ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "dailyReports"), (snap) => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => !d.id.startsWith("summary-"))
        .sort((a, b) => a.id.localeCompare(b.id));
      setDailyReports(docs);
    });
  }, [user]);

  // ── Snapshot subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !reportId) return;
    const q = query(collection(db, "dailyReports", reportId, "snapshots"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setSnapshots(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user, reportId]);

  // ── 5-minute auto-snapshot timer ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => { createSnapshotRef.current?.("auto"); }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);

  // ── Report data listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "dailyReports", reportId), (snap) => {
      setReportData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [user, reportId]);

  reportDataRef.current = reportData;

  // ── Save helpers ────────────────────────────────────────────────────────────
  const saveField = useCallback(
    (field, value) => {
      if (!user) return;
      debouncedSave(field, () => {
        setDoc(doc(db, "dailyReports", reportId), { [field]: value }, { merge: true }).catch(console.error);
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
          { sections: { [sectionName]: { ...reportDataRef.current?.sections?.[sectionName], blocks } } },
          { merge: true }
        ).catch(console.error);
      });
    },
    [user, reportId, debouncedSave]
  );

  const addSectionBlock = useCallback(
    (sectionName, type, afterId, extraFields = {}) => {
      const section = reportDataRef.current?.sections?.[sectionName] || { blocks: [] };
      const newBlock = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        type, content: "", citations: [],
        ...extraFields,
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
      saveSectionBlocks(sectionName, (section.blocks || []).map((b) => (b.id === blockId ? { ...b, ...fields } : b)));
    },
    [saveSectionBlocks]
  );

  const removeSectionBlock = useCallback(
    (sectionName, blockId) => {
      const section = reportDataRef.current?.sections?.[sectionName] || { blocks: [] };
      saveSectionBlocks(sectionName, (section.blocks || []).filter((b) => b.id !== blockId));
    },
    [saveSectionBlocks]
  );

  // ── Snapshot helpers ─────────────────────────────────────────────────────────
  const pruneSnapshots = useCallback(async () => {
    const q = query(collection(db, "dailyReports", reportId, "snapshots"), orderBy("createdAt", "desc"), limit(51));
    const snap = await getDocs(q);
    if (snap.docs.length > 50) await deleteDoc(snap.docs[50].ref);
  }, [reportId]);

  const createSnapshot = useCallback(async (type) => {
    if (!user || !reportDataRef.current) return;
    const rd = reportDataRef.current;
    const data = { title: rd.title || "", sections: rd.sections || {}, citations: rd.citations || [], sitePhotos: rd.sitePhotos || [] };
    const hash = JSON.stringify(data);
    if (type === "auto" && hash === lastSnapshotHashRef.current) return;
    try {
      await addDoc(collection(db, "dailyReports", reportId, "snapshots"), { type, label: type === "auto" ? "自动保存" : "手动保存", createdAt: serverTimestamp(), data });
      lastSnapshotHashRef.current = hash;
      await pruneSnapshots();
    } catch (err) {
      console.error("[Snapshot] Failed:", err.code, err.message);
    }
  }, [user, reportId, pruneSnapshots]);

  createSnapshotRef.current = createSnapshot;

  const handleSave = async () => { await createSnapshot("manual"); };

  const handleRestore = (snapshot) => { setRestoreConfirm(snapshot); };

  const confirmRestore = async () => {
    if (!restoreConfirm) return;
    const snapshot = restoreConfirm;
    setRestoreConfirm(null);
    await createSnapshot("manual");
    await setDoc(doc(db, "dailyReports", reportId), snapshot.data, { merge: true });
    setShowHistory(false);
    setViewingSnapshot(null);
  };

  // ── Export / Publish handlers ────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    setShowExportMenu(false);
    try {
      const container = reportContainerRef.current;
      if (!container) throw new Error("Report container not found");
      const clone = container.cloneNode(true);
      clone.querySelectorAll(".no-print, .dispatch-toolbar").forEach(el => el.remove());
      clone.querySelectorAll(".print-only").forEach(el => { el.style.display = "block"; });
      const { default: TurndownService } = await import('turndown');
      const { gfm } = await import('turndown-plugin-gfm');
      const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
      td.use(gfm);
      const frontmatter = `---\ntitle: GTC 2026 总结稿\ndate: ${new Date().toISOString().slice(0, 10)}\n---\n\n`;
      const md = frontmatter + td.turndown(clone.outerHTML);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `GTC2026_总结稿.md`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) { alert(`导出失败：${err.message}`); }
    finally { setExporting(false); }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setShowExportMenu(false);
    try {
      const container = reportContainerRef.current;
      if (!container) throw new Error("Report container not found");
      const clone = container.cloneNode(true);
      clone.querySelectorAll(".no-print, .dispatch-toolbar").forEach(el => el.remove());
      clone.querySelectorAll(".print-only").forEach(el => { el.style.display = "block"; });
      clone.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
      clone.querySelectorAll("button, input, textarea, select").forEach(el => el.remove());

      // Add margin-top to account for fixed header
      clone.style.marginTop = "80px";

      const styleTagsHtml = (await Promise.all(
        Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
          .map(async el => {
            if (el.tagName === "LINK") {
              try {
                const href = new URL(el.getAttribute("href"), window.location.href).href;
                const css = await fetch(href).then(r => r.text());
                return `<style>${css}</style>`;
              } catch { return ""; }
            }
            return el.outerHTML;
          })
      )).join("\n");

      const navLinkStyle = "font-family:'Work Sans',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:-0.05em;font-size:13px;text-decoration:none;";
      const headerHtml = `
<header style="position:fixed;top:0;left:0;width:100%;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:0 32px;height:80px;background:#991b1b;color:#fff;border:none;">
  <div style="display:flex;align-items:center;gap:32px;">
    <div style="font-family:'Work Sans',sans-serif;font-size:1.5rem;font-weight:900;text-transform:uppercase;letter-spacing:-0.05em;">Architectural Dispatch</div>
    <nav style="display:flex;gap:24px;">
      <a href="#section-现场声音" style="${navLinkStyle}color:#fecaca;transition:color 0.05s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#fecaca'">Voices</a>
      <a href="#section-趋势总结" style="${navLinkStyle}color:#fecaca;transition:color 0.05s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#fecaca'">Trends</a>
      <a href="#section-推演分析" style="${navLinkStyle}color:#fecaca;transition:color 0.05s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#fecaca'">Analysis</a>
      <a href="#section-关键启示" style="${navLinkStyle}color:#fecaca;transition:color 0.05s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#fecaca'">Insights</a>
    </nav>
  </div>
</header>`;

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTC 2026 总结稿</title>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
${styleTagsHtml}
<style>
  body { background: #f9f9f9; color: #1a1c1c; font-family: 'Inter', sans-serif; }
  .dispatch-toolbar { display: none !important; }
  .no-print { display: none !important; }
  [contenteditable] { pointer-events: none; }
  @media print { header { display: none !important; } main { margin-top: 0 !important; } }
</style>
</head>
<body>
${headerHtml}
${clone.outerHTML}
</body>
</html>`;

      const storageRef = ref(storage, `public/summary-${reportId}.html`);
      await uploadString(storageRef, html, 'raw', { contentType: 'text/html; charset=utf-8' });
      const url = await getDownloadURL(storageRef);
      setShareUrl(url);
    } catch (err) {
      console.error("[Publish] Failed:", err.message);
      alert(`发布失败：${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  // ── Citation helpers ───────────────────────────────────────────────────────
  const citations = reportData?.citations || [];

  const getNextCitationId = useCallback(() => {
    if (citations.length === 0) return 1;
    return Math.max(...citations.map((c) => c.id)) + 1;
  }, [citations]);

  const getCitationPreview = useCallback((id) => {
    const cite = citations.find((c) => c.id === id);
    if (!cite) return `[${id}]`;
    if (cite.type === "session") return `${cite.sessionCode} — ${cite.title}`;
    if (cite.type === "link") return cite.label || cite.url;
    return cite.content?.slice(0, 50) + "...";
  }, [citations]);

  const openCitationPicker = useCallback((sectionName, blockId) => {
    setCitationPicker({ sectionName, blockId });
    setCitationTab("session");
    setCitationQuery("");
    setCitationLinkUrl("");
    setCitationLinkLabel("");
    setCitationText("");
  }, []);

  const addCitation = useCallback((newCite) => {
    const id = getNextCitationId();
    const cite = { ...newCite, id };
    setDoc(doc(db, "dailyReports", reportId), { citations: [...citations, cite] }, { merge: true }).catch(console.error);
    if (citationPicker) {
      const { sectionName, blockId } = citationPicker;
      const section = reportDataRef.current?.sections?.[sectionName] || { blocks: [] };
      const updatedBlocks = section.blocks.map((b) => b.id === blockId ? { ...b, citations: [...(b.citations || []), id] } : b);
      saveSectionBlocks(sectionName, updatedBlocks);
    }
    setCitationPicker(null);
  }, [citations, citationPicker, reportId, saveSectionBlocks, getNextCitationId]);

  const addExistingCitation = useCallback((citeId) => {
    if (!citationPicker) return;
    const { sectionName, blockId } = citationPicker;
    const section = reportDataRef.current?.sections?.[sectionName] || { blocks: [] };
    const updatedBlocks = section.blocks.map((b) =>
      b.id === blockId ? { ...b, citations: [...new Set([...(b.citations || []), citeId])] } : b
    );
    saveSectionBlocks(sectionName, updatedBlocks);
    setCitationPicker(null);
  }, [citationPicker, saveSectionBlocks]);

  const sessionSearchResults = useMemo(() => {
    if (!citationQuery.trim()) return [];
    const q = citationQuery.trim().toLowerCase();
    const results = [];
    for (const [, s] of SESSION_CATALOG) {
      if (results.length >= 15) break;
      if (s.session_id.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)) results.push(s);
    }
    return results;
  }, [citationQuery]);

  // ── Formatting ──────────────────────────────────────────────────────────────
  const execCmd = (cmd, val) => document.execCommand(cmd, false, val ?? undefined);
  const execBold = () => execCmd("bold");
  const execColor = (color) => { execCmd("foreColor", color); setShowColorPicker(false); };

  // ── Computed ────────────────────────────────────────────────────────────────
  const sitePhotos = reportData?.sitePhotos || [];
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

  const dateRangeStr = useMemo(() => {
    const ds = reportData?.dateStart;
    const de = reportData?.dateEnd;
    if (!ds || !de) return "";
    const fmt = (d) => {
      const dt = new Date(d + "T00:00");
      return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
    };
    const startDt = new Date(ds + "T00:00");
    const endDt = new Date(de + "T00:00");
    // Same month: "MARCH 17–20, 2026"
    if (startDt.getMonth() === endDt.getMonth() && startDt.getFullYear() === endDt.getFullYear()) {
      const month = startDt.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
      return `${month} ${startDt.getDate()}\u2013${endDt.getDate()}, ${startDt.getFullYear()}`;
    }
    return `${fmt(ds)} \u2013 ${fmt(de)}`;
  }, [reportData?.dateStart, reportData?.dateEnd]);

  const filteredDailyReports = useMemo(() => {
    const ds = reportData?.dateStart;
    const de = reportData?.dateEnd;
    if (!ds || !de) return dailyReports;
    return dailyReports.filter(r => {
      const d = parseReportId(r.id).date;
      return d >= ds && d <= de;
    });
  }, [dailyReports, reportData?.dateStart, reportData?.dateEnd]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-secondary font-body">加载中...</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface font-body text-on-background">
      {/* ── Toolbar (DailyReport style) ──────────────────────────────── */}
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link to="/" className="report-back-btn">← 返回日程</Link>
            <div style={{ width: 1, height: 20, background: "var(--border)" }} />
            <Link to="/reports" className="report-tool-btn" style={{ textDecoration: "none" }}>
              日报列表
            </Link>
          </div>
          <div className="report-toolbar-actions">
            {saveState === "saving" && (
              <span className="report-status-msg" style={{ color: "var(--text-dim)" }}>● 保存中...</span>
            )}
            {saveState === "saved" && (
              <span className="report-status-msg" style={{ color: "var(--success)" }}>✓ 已保存</span>
            )}
            <div className="report-toolbar-divider" />
            <button className="report-tool-btn" onClick={handleSave} title="立即保存并创建快照">
              保存
            </button>
            <button className="report-tool-btn" onClick={() => setShowHistory(v => !v)} title="查看历史版本快照">
              历史版本
            </button>
            <div className="report-toolbar-divider" />
            <button className="report-icon-btn" onClick={execBold} title="加粗">
              <strong>B</strong>
            </button>
            <button className="report-icon-btn" onClick={() => execCmd("italic")} title="斜体">
              <em style={{ fontStyle: "italic" }}>I</em>
            </button>
            <button className="report-icon-btn" onClick={() => execCmd("underline")} title="下划线">
              <span style={{ textDecoration: "underline" }}>U</span>
            </button>
            <div style={{ position: "relative" }}>
              <button className="report-icon-btn" onClick={() => setShowColorPicker(!showColorPicker)} title="字体颜色">
                <span style={{ borderBottom: "3px solid var(--brand)", paddingBottom: 1 }}>A</span>
              </button>
              {showColorPicker && (
                <div className="report-color-picker">
                  {COLOR_PRESETS.map((c) => (
                    <button key={c} className="report-color-swatch" style={{ background: c }} onClick={() => execColor(c)} title={c} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }} />
            <div className="export-dropdown-wrapper" style={{ position: "relative" }}>
              <button
                className="report-export-btn"
                onClick={() => !(exporting || publishing) && setShowExportMenu((v) => !v)}
                disabled={exporting || publishing}
              >
                {exporting ? "导出中..." : publishing ? "发布中..." : "导出总结稿 ▾"}
              </button>
              {showExportMenu && (
                <div className="export-dropdown-menu">
                  <button className="export-menu-item" onClick={handleExport}>
                    <span className="export-menu-label">↓ 导出 Markdown</span>
                  </button>
                  <div className="export-menu-divider" />
                  <button className="export-menu-item export-menu-item--publish" onClick={handlePublish}>
                    <span className="export-menu-label">{publishing ? "分享中..." : "🔗 分享总结稿"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Share Modal ──────────────────────────────────────────── */}
      {shareUrl && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => { setShareUrl(null); setUrlCopied(false); }}>
          <div className="bg-white p-8 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-headline font-bold text-lg uppercase">分享链接</span>
              <button className="text-secondary hover:text-primary text-xl" onClick={() => { setShareUrl(null); setUrlCopied(false); }}>×</button>
            </div>
            <div className="flex gap-2 items-center bg-surface-container-low p-3">
              <span className="text-sm text-secondary flex-1 truncate">{shareUrl}</span>
              <button className={`px-4 py-2 text-xs font-bold uppercase ${urlCopied ? "bg-green-600 text-white" : "bg-primary text-white hover:bg-primary-container"}`} onClick={() => { navigator.clipboard.writeText(shareUrl); setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000); }}>
                {urlCopied ? "✓ 已复制" : "复制"}
              </button>
            </div>
            <p className="text-xs text-secondary mt-3">链接可公开访问，任何人均可查看。</p>
          </div>
        </div>
      )}

      {/* ── History Panel ───────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed top-0 right-0 w-[420px] h-screen bg-white z-[200] flex flex-col" style={{ borderLeft: "1px solid #e8e8e8", boxShadow: "-4px 0 16px rgba(0,0,0,0.12)" }}>
          <div className="flex items-center justify-between p-4 border-b border-surface-container-high">
            <span className="font-headline font-bold text-sm uppercase">历史记录</span>
            <button className="text-secondary hover:text-primary" onClick={() => { setShowHistory(false); setViewingSnapshot(null); }}>×</button>
          </div>
          <div className="flex flex-1 overflow-hidden">
            <div className="w-40 border-r border-surface-container-high overflow-y-auto flex-shrink-0">
              {snapshots.length === 0 && <p className="p-3 text-xs text-secondary">暂无记录</p>}
              {snapshots.map(snap => {
                const ts = snap.createdAt?.toDate?.();
                const label = ts ? ts.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
                return (
                  <div key={snap.id} onClick={() => setViewingSnapshot(snap)} className={`p-3 text-xs cursor-pointer border-b border-surface-container-high ${viewingSnapshot?.id === snap.id ? "bg-surface-container-low" : "hover:bg-surface-container-low"}`}>
                    <div className={`font-bold ${snap.type === "manual" ? "text-primary" : "text-secondary"}`}>{snap.label}</div>
                    <div className="text-secondary mt-0.5">{label}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!viewingSnapshot ? (
                <p className="text-sm text-secondary">选择左侧记录预览</p>
              ) : (
                <div>
                  <div className="font-bold text-sm mb-2">{viewingSnapshot.data?.title || "(无标题)"}</div>
                  {Object.entries(viewingSnapshot.data?.sections || {}).map(([name, sec]) => (
                    <div key={name} className="mb-3">
                      <div className="text-xs font-bold text-primary mb-1">{name}</div>
                      <div className="text-xs text-secondary">{(sec.blocks || []).length} 个内容块</div>
                    </div>
                  ))}
                  <div className="text-xs text-secondary mb-4">引用 {(viewingSnapshot.data?.citations || []).length} 条 · 照片 {(viewingSnapshot.data?.sitePhotos || []).length} 张</div>
                  <button className="w-full bg-primary text-white font-bold uppercase text-xs py-3 hover:bg-primary-container transition-colors" onClick={() => handleRestore(viewingSnapshot)}>恢复此版本</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Restore Confirm Modal ────────────────────────────────── */}
      {restoreConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setRestoreConfirm(null)}>
          <div className="bg-white p-8 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-headline font-bold uppercase">确认恢复</span>
              <button className="text-secondary hover:text-primary text-xl" onClick={() => setRestoreConfirm(null)}>×</button>
            </div>
            <p className="text-sm text-secondary mb-4">当前内容将先保存快照，然后恢复到所选版本。此操作不可撤销。</p>
            <div className="flex gap-2 justify-end">
              <button className="px-4 py-2 text-xs font-bold uppercase text-secondary hover:text-on-background" onClick={() => setRestoreConfirm(null)}>取消</button>
              <button className="px-4 py-2 bg-primary text-white text-xs font-bold uppercase hover:bg-primary-container" onClick={confirmRestore}>确认恢复</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Citation Picker Modal ───────────────────────────────── */}
      {citationPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setCitationPicker(null)}>
          <div className="bg-white p-6 max-w-lg w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-headline font-bold uppercase">添加引用</span>
              <button className="text-secondary hover:text-primary text-xl" onClick={() => setCitationPicker(null)}>×</button>
            </div>
            <div className="flex border-b border-surface-container-high mb-3">
              {[{ key: "session", label: "Session" }, { key: "link", label: "链接" }, { key: "text", label: "文字" }].map((tab) => (
                <button key={tab.key} onClick={() => setCitationTab(tab.key)} className={`px-4 py-2 text-sm ${citationTab === tab.key ? "font-bold text-primary border-b-2 border-primary" : "text-secondary"}`} style={{ marginBottom: -1 }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {citationTab === "session" && (
              <div>
                <input type="text" value={citationQuery} onChange={(e) => setCitationQuery(e.target.value)} placeholder="搜索 Session ID 或标题..." className="w-full p-2 text-sm border border-surface-container-high bg-surface-container-low mb-2" />
                <div className="max-h-60 overflow-y-auto">
                  {sessionSearchResults.length === 0 && citationQuery.trim() && <p className="text-secondary text-sm py-2">未找到匹配的 Session</p>}
                  {sessionSearchResults.map((s) => (
                    <div key={s.session_id} onClick={() => addCitation({ type: "session", sessionCode: s.session_id, title: s.title, url: s.url || "" })} className="p-2 cursor-pointer hover:bg-surface-container-low text-sm flex gap-2">
                      <span className="font-mono font-bold text-xs text-primary whitespace-nowrap mt-0.5">{s.session_id}</span>
                      <span className="text-secondary">{s.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {citationTab === "link" && (
              <div className="flex flex-col gap-2">
                <input type="url" value={citationLinkUrl} onChange={(e) => setCitationLinkUrl(e.target.value)} placeholder="URL" className="w-full p-2 text-sm border border-surface-container-high bg-surface-container-low" />
                <input type="text" value={citationLinkLabel} onChange={(e) => setCitationLinkLabel(e.target.value)} placeholder="标签（可选）" className="w-full p-2 text-sm border border-surface-container-high bg-surface-container-low" />
                <button className="self-end px-4 py-2 bg-primary text-white text-xs font-bold uppercase" disabled={!citationLinkUrl.trim()} onClick={() => addCitation({ type: "link", url: citationLinkUrl.trim(), label: citationLinkLabel.trim() })}>添加</button>
              </div>
            )}

            {citationTab === "text" && (
              <div className="flex flex-col gap-2">
                <textarea value={citationText} onChange={(e) => setCitationText(e.target.value)} placeholder="输入来源描述..." rows={3} className="w-full p-2 text-sm border border-surface-container-high bg-surface-container-low resize-y" />
                <button className="self-end px-4 py-2 bg-primary text-white text-xs font-bold uppercase" disabled={!citationText.trim()} onClick={() => addCitation({ type: "text", content: citationText.trim() })}>添加</button>
              </div>
            )}

            {citations.length > 0 && (
              <div className="mt-4 border-t border-surface-container-high pt-3">
                <span className="text-xs font-bold text-secondary">已有引用：</span>
                <div className="max-h-40 overflow-y-auto mt-2">
                  {citations.map((c) => (
                    <div key={c.id} onClick={() => addExistingCitation(c.id)} className="p-2 cursor-pointer hover:bg-surface-container-low text-sm flex gap-2 items-center">
                      <span className="font-bold text-primary text-xs">[{c.id}]</span>
                      <span className="text-secondary">{getCitationPreview(c.id)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────────── */}
      <main className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto" ref={reportContainerRef}>
        {/* ── Report Header (Architectural Dispatch nav) ────────── */}
        <header className="sticky top-0 z-40 flex justify-between items-center px-8 h-20 bg-red-800 text-white -mx-6 md:-mx-12 -mt-6 md:-mt-12 mb-8">
          <div className="flex items-center gap-8">
            <div className="text-2xl font-black font-headline uppercase tracking-tighter">Architectural Dispatch</div>
            <nav className="hidden md:flex gap-6">
              {SECTION_ORDER.map((name) => (
                <a key={name} href={`#section-${name}`} className="font-headline font-bold uppercase tracking-tighter text-red-200 hover:text-white transition-colors duration-50 text-sm" style={{ textDecoration: "none" }}>{SECTION_NAV[name]}</a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="export-dropdown-wrapper no-print" style={{ position: "relative" }}>
              <button
                className="px-4 py-2 bg-white text-red-800 font-bold uppercase text-xs hover:bg-red-50 active:scale-95 duration-50 transition-all"
                onClick={() => !(exporting || publishing) && setShowExportMenu((v) => !v)}
                disabled={exporting || publishing}
              >
                {exporting ? "Exporting..." : publishing ? "Publishing..." : "Download Markdown"}
              </button>
            </div>
          </div>
        </header>

        {/* ── Briefing Header ──────────────────────────────────── */}
        <section className="briefing-header relative bg-primary text-on-primary p-8 md:p-12 mb-16 overflow-hidden">
          <div className="absolute inset-0 hatching-overlay opacity-20 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <span className="text-sm font-bold tracking-[0.2em] uppercase bg-white/10 px-3 py-1 font-headline">INTERNAL INTELLIGENCE REPORT</span>
              {dateRangeStr && <span className="text-sm font-medium">{dateRangeStr}</span>}
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none mb-4 font-headline">
              <EditableField value={reportData?.title || ""} onSave={(html) => saveField("title", html)} placeholder="输入总结稿标题..." minHeight={48} />
            </h1>
            <div className="text-lg md:text-xl max-w-2xl opacity-90 leading-relaxed font-light">
              <EditableField value={reportData?.subtitle || ""} onSave={(html) => saveField("subtitle", html)} placeholder="输入副标题/描述..." minHeight={28} />
            </div>
          </div>
        </section>

        {/* ── Two-column layout ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* ── Left Column: Primary Content ──────────────────────── */}
          <div className="lg:col-span-8 space-y-16">
            {SECTION_ORDER.map((sectionName) => {
              const section = reportData?.sections?.[sectionName] || { blocks: [] };
              const blocks = section.blocks || [];
              const SectionComponent = SECTION_COMPONENTS[sectionName];

              return (
                <section key={sectionName} id={`section-${sectionName}`}>
                  {/* Section header with red vertical anchor */}
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1 h-8 bg-primary" />
                    <h2 className="text-2xl font-black uppercase tracking-tight font-headline">{sectionName}</h2>
                  </div>

                  {/* Empty state */}
                  {blocks.length === 0 && (
                    <div className="py-6 flex gap-2 flex-wrap no-print">
                      {(SECTION_EMPTY_BLOCK_TYPES[sectionName] || [{ type: "heading", label: "小标题" }, { type: "body", label: "正文" }]).map(({ type, label, extraFields }) => (
                        <button key={type} className="px-4 py-2 text-xs font-bold uppercase bg-surface-container-low text-secondary hover:text-primary hover:border-primary border border-transparent transition-colors" onClick={() => addSectionBlock(sectionName, type, null, extraFields)}>+ {label}</button>
                      ))}
                    </div>
                  )}

                  {/* Section content */}
                  {blocks.length > 0 && SectionComponent && (
                    <SectionComponent
                      sectionName={sectionName}
                      blocks={blocks}
                      onAddBlock={addSectionBlock}
                      onUpdateBlock={(blockId, fields) => updateSectionBlock(sectionName, blockId, fields)}
                      onRemoveBlock={(blockId) => removeSectionBlock(sectionName, blockId)}
                      onOpenCitationPicker={openCitationPicker}
                      getCitationPreview={getCitationPreview}
                      openInlineMenu={openInlineMenu}
                      onOpenInlineMenu={setOpenInlineMenu}
                    />
                  )}
                </section>
              );
            })}

            {/* ── References Section ─────────────────────────────────── */}
            <section id="section-references" className="mt-16">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-1 h-8 bg-primary" />
                <h2 className="text-2xl font-black uppercase tracking-tight font-headline">参考资料</h2>
              </div>
              {citations.length === 0 ? (
                <p className="text-secondary text-sm py-4">暂无引用。引用将在编辑内容时通过「添加引用」按钮添加。</p>
              ) : (
                <div className="bg-surface-container-low p-8 border-l-4 border-primary">
                  <ul className="space-y-4 font-body text-sm font-medium">
                    {citations.map((cite) => (
                      <li key={cite.id} className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary text-sm mt-0.5">
                          {cite.type === "session" ? "description" : cite.type === "link" ? "link" : "text_snippet"}
                        </span>
                        <div className="flex-1">
                          <span className="text-xs font-bold text-primary mr-2">[{cite.id}]</span>
                          {cite.type === "session" && (
                            <span>
                              <span className="font-mono text-xs text-secondary mr-1">{cite.sessionCode}</span>
                              <span className="text-on-surface">{cite.title}</span>
                              {cite.url && <a href={cite.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-600 underline mt-1 break-all">{cite.url}</a>}
                            </span>
                          )}
                          {cite.type === "link" && (
                            <span>
                              {cite.label && <span className="text-on-surface mr-2">{cite.label}</span>}
                              <a href={cite.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline break-all">{cite.url}</a>
                            </span>
                          )}
                          {cite.type === "text" && <span className="text-on-surface">{cite.content}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          {/* ── Right Column: Sidebar ──────────────────────────────── */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32 space-y-12">
              {/* Event List (editable) */}
              <div className="border-t-4 border-primary pt-6">
                <h4 className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] mb-4 font-label">线下活动列表</h4>
                <ul className="space-y-6 font-headline">
                  {(reportData?.onsiteEvents || []).map((evt, idx) => (
                    <li key={evt.id} className="border-b border-outline-variant pb-4 relative group">
                      <button className="absolute top-0 right-0 text-secondary hover:text-primary text-sm no-print opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                        const events = [...(reportData?.onsiteEvents || [])];
                        events.splice(idx, 1);
                        saveField("onsiteEvents", events);
                      }}>×</button>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold uppercase tracking-tight text-primary" style={{ flex: 1 }}>
                          <EditableField value={evt.title} onSave={(html) => {
                            const events = [...(reportData?.onsiteEvents || [])];
                            events[idx] = { ...events[idx], title: html };
                            saveField("onsiteEvents", events);
                          }} placeholder="活动名称..." minHeight={16} />
                        </span>
                        <span className="text-[10px] font-bold text-secondary ml-2" style={{ minWidth: 100 }}>
                          <EditableField value={evt.dateLocation} onSave={(html) => {
                            const events = [...(reportData?.onsiteEvents || [])];
                            events[idx] = { ...events[idx], dateLocation: html };
                            saveField("onsiteEvents", events);
                          }} placeholder="日期 / 地点" minHeight={14} />
                        </span>
                      </div>
                      <div className="text-[11px] leading-snug text-on-surface font-medium">
                        <EditableField value={evt.description} onSave={(html) => {
                          const events = [...(reportData?.onsiteEvents || [])];
                          events[idx] = { ...events[idx], description: html };
                          saveField("onsiteEvents", events);
                        }} placeholder="活动描述..." minHeight={16} />
                      </div>
                    </li>
                  ))}
                </ul>
                {(reportData?.onsiteEvents || []).length === 0 && (
                  <p className="text-xs text-secondary py-2 no-print">暂无活动</p>
                )}
                <button className="mt-3 text-xs font-bold text-secondary hover:text-primary no-print" onClick={() => {
                  const events = [...(reportData?.onsiteEvents || [])];
                  events.push({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
                    title: "", dateLocation: "", description: "",
                  });
                  saveField("onsiteEvents", events);
                }}>+ 添加活动</button>
              </div>

              {/* Daily Dispatches */}
              <div className="bg-surface-container p-8">
                <h4 className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] mb-6 font-label">每日日报 (DAILY DISPATCHES)</h4>
                <div className="space-y-6">
                  {filteredDailyReports.length === 0 && <p className="text-xs text-secondary">暂无日报</p>}
                  {filteredDailyReports.map((report, i) => {
                    const date = parseReportId(report.id).date;
                    const weekday = DAY_CN[new Date(date + "T00:00").getDay()];
                    return (
                      <div key={report.id} className="flex justify-between items-end group">
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] text-secondary-fixed-dim uppercase mb-1">{date}</label>
                          <div className="text-sm font-bold text-on-background flex items-baseline gap-1">
                            <span className="flex-shrink-0">Day {String(i + 1).padStart(2, "0")}:</span>
                            <div className="flex-1 min-w-0">
                              <EditableField
                                value={report.title || `${weekday}日报`}
                                onSave={(html) => {
                                  setDoc(doc(db, "dailyReports", report.id), { title: html }, { merge: true }).catch(console.error);
                                }}
                                placeholder={`${weekday}日报`}
                                minHeight={20}
                              />
                            </div>
                          </div>
                        </div>
                        <Link to={`/view/report/${report.id}`} className="flex-shrink-0 ml-2" style={{ textDecoration: "none" }}>
                          <span className="material-symbols-outlined text-primary text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Site Photos */}
              {sitePhotos.length > 0 && (
                <div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-1 h-6 bg-primary" />
                    <h2 className="text-lg font-black uppercase tracking-tight font-headline">现场照片</h2>
                  </div>
                  {sitePhotos.slice(0, 1).map((photo, idx) => (
                    <div key={idx} className="relative group aspect-square overflow-hidden">
                      <img alt={photo.caption || "现场照片"} className="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-all duration-300" src={photo.image} />
                      <div className="absolute inset-0 bg-primary/20 group-hover:bg-transparent transition-all" />
                      {photo.caption && (
                        <div className="absolute bottom-4 left-4 text-white text-[10px] font-bold uppercase tracking-widest bg-primary px-2 py-1">{photo.caption}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="mt-24 w-full py-12 border-t border-gray-200 bg-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 px-8">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-black text-gray-900 uppercase font-headline">GTC 2026 Dispatch</div>
            <div className="font-body text-[10px] tracking-widest uppercase text-gray-500">© 2026 GTC Intelligence Briefing. Internal Use Only.</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
