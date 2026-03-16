import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import catalogData from "../data/gtc-2026-sessions-detailed.json";
const SESSION_CATALOG = new Map(catalogData.map((s) => [s.session_id, s]));

// ── Debounce helper ──────────────────────────────────────────────────────────
function useDebouncedSave(delay = 600) {
  const timers = useRef({});
  const pending = useRef(0);
  const savedTimer = useRef(null);
  const [saveState, setSaveState] = useState("idle");
  const debouncedSave = useCallback((key, fn) => {
    if (!timers.current[key]) pending.current += 1;
    else clearTimeout(timers.current[key]);
    setSaveState("saving");
    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      pending.current -= 1;
      Promise.resolve(fn()).finally(() => {
        if (pending.current === 0) {
          setSaveState("saved");
          clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        }
      });
    }, delay);
  }, [delay]);
  return { debouncedSave, saveState };
}

// ── Version helpers ──────────────────────────────────────────────────────────
function parseReportId(reportId) {
  const m = reportId.match(/^(.+)-v(\d+)$/);
  return m
    ? { date: m[1], version: parseInt(m[2]), isLegacy: false }
    : { date: reportId, version: 1, isLegacy: true };
}

function nextVersionId(selectedDate, allDocs) {
  const maxV = allDocs
    .filter(r => parseReportId(r.id || r.date).date === selectedDate)
    .reduce((max, r) => Math.max(max, parseReportId(r.id || r.date).version), 0);
  return `${selectedDate}-v${maxV + 1}`;
}

// ── Color presets ────────────────────────────────────────────────────────────
const COLOR_PRESETS = ["#333333", "#CF0A2C", "#E67E22", "#27AE60", "#2980B9", "#8E44AD"];

// ── EditableField ────────────────────────────────────────────────────────────
function EditableField({ value, onSave, placeholder, minHeight = 60 }) {
  const ref = useRef(null);
  const focused = useRef(false);
  useEffect(() => {
    if (ref.current && !focused.current && value !== undefined) {
      if (ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
    }
  }, [value]);
  return (
    <div
      ref={ref}
      className="report-editable"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      style={{ minHeight }}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; }}
      onInput={() => { if (ref.current) onSave(ref.current.innerHTML); }}
    />
  );
}

// ── SpeakersEditor ───────────────────────────────────────────────────────────
function SpeakersEditor({ speakers, onUpdate, onAdd, onRemove }) {
  return (
    <div>
      {speakers.map((spk, idx) => (
        <div key={idx} className="speaker-block">
          <div className="speaker-fields">
            <SpeakerInput
              value={spk.name}
              placeholder="演讲者姓名"
              onChange={v => {
                const updated = speakers.map((s, i) => i === idx ? { ...s, name: v } : s);
                onUpdate(updated);
              }}
            />
            <SpeakerInput
              value={spk.position}
              placeholder="职位"
              onChange={v => {
                const updated = speakers.map((s, i) => i === idx ? { ...s, position: v } : s);
                onUpdate(updated);
              }}
            />
            <SpeakerInput
              value={spk.company}
              placeholder="公司"
              onChange={v => {
                const updated = speakers.map((s, i) => i === idx ? { ...s, company: v } : s);
                onUpdate(updated);
              }}
            />
            {speakers.length > 1 && (
              <button
                className="no-print"
                onClick={() => onRemove(idx)}
                title="删除此演讲者"
                style={{
                  background: "none", border: "none", color: "#CF0A2C",
                  cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
          {/* Print view: plain text */}
          <div className="print-only" style={{ fontSize: 13, color: "#333", paddingTop: 2 }}>
            {[spk.name, spk.position, spk.company].filter(Boolean).join(" · ")}
          </div>
        </div>
      ))}
      <button
        className="no-print"
        onClick={onAdd}
        style={{
          background: "none", border: "1px dashed #CF0A2C", color: "#CF0A2C",
          cursor: "pointer", fontSize: 11, padding: "3px 12px",
          borderRadius: 4, marginTop: 4,
        }}
      >
        + 添加演讲者
      </button>
    </div>
  );
}

// ── SpeakerInput ─────────────────────────────────────────────────────────────
function SpeakerInput({ value, placeholder, onChange }) {
  const [local, setLocal] = useState(value || "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value || "");
  }, [value]);
  return (
    <input
      className="speaker-field-input"
      value={local}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; }}
      onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
    />
  );
}

// ── BulletEditor ──────────────────────────────────────────────────────────────
function BulletEditor({ points, onSave, placeholder = "请输入要点..." }) {
  const [local, setLocal] = useState(points || []);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(points || []);
  }, [points]);

  const commit = (next) => { setLocal(next); onSave(next); };

  const handleChange = (idx, value) =>
    commit(local.map((p, i) => (i === idx ? value : p)));

  const handleAdd = () => commit([...local, ""]);

  const handleRemove = (idx) => commit(local.filter((_, i) => i !== idx));

  const handleKeyDown = (e, idx) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...local.slice(0, idx + 1), "", ...local.slice(idx + 1)];
      commit(next);
      setTimeout(() => {
        const inputs = e.target.closest(".bullet-editor-list")
          ?.querySelectorAll(".bullet-input");
        if (inputs?.[idx + 1]) inputs[idx + 1].focus();
      }, 0);
    }
    if (e.key === "Backspace" && local[idx] === "" && local.length > 1) {
      e.preventDefault();
      const next = local.filter((_, i) => i !== idx);
      commit(next);
      setTimeout(() => {
        const inputs = e.target.closest(".bullet-editor-list")
          ?.querySelectorAll(".bullet-input");
        if (inputs?.[Math.max(0, idx - 1)]) inputs[Math.max(0, idx - 1)].focus();
      }, 0);
    }
  };

  return (
    <div
      className="bullet-editor"
      onFocus={() => { focused.current = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) focused.current = false; }}
    >
      <ul className="bullet-editor-list">
        {local.map((point, idx) => (
          <li key={idx} className="bullet-editor-item">
            <span className="bullet-dot" aria-hidden="true">•</span>
            <input
              className="bullet-input"
              type="text"
              value={point}
              placeholder={placeholder}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            />
            <button
              className="bullet-remove-btn no-print"
              onClick={() => handleRemove(idx)}
              title="删除此要点"
              tabIndex={-1}
            >−</button>
          </li>
        ))}
      </ul>
      {local.length === 0 && (
        <p className="bullet-editor-empty no-print">{placeholder}</p>
      )}
      <button className="bullet-add-btn no-print" onClick={handleAdd}>
        + 添加要点
      </button>
    </div>
  );
}

// ── DailyReport ──────────────────────────────────────────────────────────────
export default function DailyReport() {
  const { reportId } = useParams();
  const { date, version } = parseReportId(reportId);
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [dragTopic, setDragTopic] = useState(null);
  const [dragOverTopic, setDragOverTopic] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showNewReport, setShowNewReport] = useState(false);
  const [newReportDate, setNewReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collapsedSessions, setCollapsedSessions] = useState(new Set());
  const [allReportDocs, setAllReportDocs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const illustInputRefs = useRef({});
  const sessionDataRef = useRef({});
  const reportDataRef = useRef(null);
  const sitePhotoInputRef = useRef(null);
  const reportContainerRef = useRef(null);
  const initDone = useRef(false);
  const collapsedInit = useRef(false);
  const { debouncedSave, saveState } = useDebouncedSave(600);

  // Auth
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // All report docs (for version computation)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "dailyReports"), snap => {
      setAllReportDocs(snap.docs.map(d => ({ id: d.id })));
    });
  }, [user]);

  // Members
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "members"), (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push(d.data()));
      arr.sort((a, b) => Number(a.id) - Number(b.id));
      setMembers(arr);
    });
  }, [user]);

  // Sessions (filtered by date)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "sessions"), (snap) => {
      const arr = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.date === date) arr.push({ ...data, attendees: new Set(data.attendees || []) });
      });
      arr.sort((a, b) => a.start.localeCompare(b.start));
      setSessions(arr);
    });
  }, [user, date]);

  // Report data
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "dailyReports", reportId), (snap) => {
      setReportData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [user, reportId]);

  // Auto-init report
  useEffect(() => {
    if (!user || loading || reportData || initDone.current || sessions.length === 0) return;
    initDone.current = true;
    const sessionMap = {};
    sessions.forEach((s) => {
      sessionMap[s.code] = {
        speakers: s.speakers?.length > 0
          ? s.speakers.map(sp => ({ name: sp.name || "", position: sp.title || "", company: sp.company || "" }))
          : [{ name: "", position: "", company: "" }],
        takeaways: "",
        insights: "",
        illustration: "",
      };
    });
    setDoc(doc(db, "dailyReports", reportId), {
      date, title: "", summaryPoints: [], onsiteInfo: "", reflections: "", rumors: "", sitePhotos: [],
      sessions: sessionMap, topicOrder: [], status: "draft", version,
    }).catch(console.error);
  }, [user, loading, reportData, sessions, reportId, date, version]);

  // Keep sessionDataRef and reportDataRef in sync
  const sessionData = reportData?.sessions || {};
  sessionDataRef.current = sessionData;
  reportDataRef.current = reportData;

  // ── Computed ────────────────────────────────────────────────────────────────
  const memberMap = useMemo(() => {
    const map = {};
    members.forEach((m) => { map[m.id] = m.name; });
    return map;
  }, [members]);

  const topicsMap = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      const topic = s.mainTopic?.trim() || "未分类";
      if (!map[topic]) map[topic] = [];
      map[topic].push(s);
    });
    Object.values(map).forEach(arr =>
      arr.sort((a, b) => {
        const tc = a.start.localeCompare(b.start);
        return tc !== 0 ? tc : a.title.localeCompare(b.title);
      })
    );
    return map;
  }, [sessions]);

  const orderedTopics = useMemo(() => {
    const allTopics = Object.keys(topicsMap);
    const saved = reportData?.topicOrder || [];
    const result = saved.filter(t => allTopics.includes(t));
    allTopics.forEach(t => { if (!result.includes(t)) result.push(t); });
    return result;
  }, [topicsMap, reportData]);

  // ── Save helpers ────────────────────────────────────────────────────────────
  const saveField = useCallback((field, html) => {
    if (!user) return;
    debouncedSave(field, () => {
      setDoc(doc(db, "dailyReports", reportId), { [field]: html }, { merge: true }).catch(console.error);
    });
  }, [user, reportId, debouncedSave]);

  const saveSessionField = useCallback((code, field, value) => {
    if (!user) return;
    debouncedSave(`${code}.${field}`, () => {
      setDoc(doc(db, "dailyReports", reportId), {
        sessions: { [code]: { [field]: value } }
      }, { merge: true }).catch(console.error);
    });
  }, [user, reportId, debouncedSave]);

  // Speakers: save whole array debounced
  const saveSpeakers = useCallback((code, speakers) => {
    if (!user) return;
    debouncedSave(`${code}.speakers`, () => {
      setDoc(doc(db, "dailyReports", reportId), {
        sessions: { [code]: { speakers } }
      }, { merge: true }).catch(console.error);
    });
  }, [user, reportId, debouncedSave]);

  const addSpeaker = useCallback((code) => {
    if (!user) return;
    const sd = sessionDataRef.current[code] || {};
    const speakers = [...(sd.speakers || []), { name: "", position: "", company: "" }];
    setDoc(doc(db, "dailyReports", reportId), {
      sessions: { [code]: { speakers } }
    }, { merge: true }).catch(console.error);
  }, [user, reportId]);

  const removeSpeaker = useCallback((code, idx) => {
    if (!user) return;
    const sd = sessionDataRef.current[code] || {};
    const speakers = (sd.speakers || []).filter((_, i) => i !== idx);
    setDoc(doc(db, "dailyReports", reportId), {
      sessions: { [code]: { speakers: speakers.length ? speakers : [{ name: "", position: "", company: "" }] } }
    }, { merge: true }).catch(console.error);
  }, [user, reportId]);

  const handleIllustration = useCallback((code, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("图片过大（超过5MB），请压缩后再上传。");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => saveSessionField(code, "illustration", ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [saveSessionField]);

  // ── Site Photos handlers ─────────────────────────────────────────────────
  const handleSitePhotoAdd = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("图片过大（超过5MB）"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const photos = [...(reportDataRef.current?.sitePhotos || []), { image: ev.target.result, caption: "" }];
      setDoc(doc(db, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [reportId]);

  const handleSitePhotoDelete = useCallback((idx) => {
    const photos = (reportDataRef.current?.sitePhotos || []).filter((_, i) => i !== idx);
    setDoc(doc(db, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
  }, [reportId]);

  const saveSitePhotoCaption = useCallback((idx, caption) => {
    debouncedSave(`sitePhoto-caption-${idx}`, () => {
      const photos = [...(reportDataRef.current?.sitePhotos || [])];
      if (photos[idx]) photos[idx] = { ...photos[idx], caption };
      return setDoc(doc(db, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
    });
  }, [reportId, debouncedSave]);

  // Export report as self-contained HTML for offline PDF conversion
  const handleExportPDF = async () => {
    setExporting(true);

    // Expand all collapsed sessions so content is visible in the export
    const prevCollapsed = new Set(collapsedSessions);
    setCollapsedSessions(new Set());
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      const container = reportContainerRef.current;
      if (!container) throw new Error("Report container not found");

      // Clone report DOM and strip interactive / UI-only elements
      const clone = container.cloneNode(true);
      clone.querySelectorAll(".no-print, .report-toolbar, .report-nav-bar, .session-collapse-btn").forEach(el => el.remove());
      clone.querySelectorAll(".print-only").forEach(el => { el.style.display = "block"; });

      // Collect stylesheets from the page (link tags + style tags)
      const styleTagsHtml = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
        .map(el => {
          if (el.tagName === "LINK") {
            const href = new URL(el.getAttribute("href"), window.location.href).href;
            return `<link rel="stylesheet" href="${href}">`;
          }
          return el.outerHTML;
        })
        .join("\n");

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTC2026 日报 ${date}</title>
${styleTagsHtml}
<style>
  body { background: #fff; color: #111; }
  .report-container { max-width: 900px; margin: 0 auto; padding: 24px; }
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `GTC2026_日报_${date}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("[Export] Failed:", err.message);
      alert(`导出失败：${err.message}`);
    } finally {
      setCollapsedSessions(prevCollapsed);
      setExporting(false);
    }
  };

  // Topic drag-and-drop
  const handleTopicDragStart = (e, topic) => {
    setDragTopic(topic);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleTopicDragOver = (e, topic) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTopic !== topic) setDragOverTopic(topic);
  };
  const handleTopicDrop = useCallback((e, targetTopic) => {
    e.preventDefault();
    if (!dragTopic || dragTopic === targetTopic) {
      setDragTopic(null); setDragOverTopic(null); return;
    }
    const newOrder = [...orderedTopics];
    const fromIdx = newOrder.indexOf(dragTopic);
    const toIdx = newOrder.indexOf(targetTopic);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragTopic);
    setDragTopic(null); setDragOverTopic(null);
    if (user) {
      setDoc(doc(db, "dailyReports", reportId), { topicOrder: newOrder }, { merge: true }).catch(console.error);
    }
  }, [dragTopic, orderedTopics, user, reportId]);
  const handleTopicDragEnd = () => { setDragTopic(null); setDragOverTopic(null); };

  // Collapse init: sessions with content start collapsed
  useEffect(() => {
    if (!reportData || collapsedInit.current) return;
    collapsedInit.current = true;
    const initial = new Set(
      sessions.filter(s => {
        const sd = reportData.sessions?.[s.code];
        return sd?.takeaways && sd.takeaways !== "";
      }).map(s => s.code)
    );
    setCollapsedSessions(initial);
  }, [reportData, sessions]);

  const toggleCollapse = useCallback((code) => {
    setCollapsedSessions(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }, []);

  const handleToggleStatus = () => {
    if (!user) return;
    const newStatus = reportData?.status === "done" ? "draft" : "done";
    setDoc(doc(db, "dailyReports", reportId), { status: newStatus }, { merge: true }).catch(console.error);
  };

  const handleSyncFromCatalog = async () => {
    if (!user || syncing) return;
    setSyncing(true);
    setSyncMsg("");
    try {
      const updatedMap = {};
      let syncedCount = 0;
      sessions.forEach((s) => {
        const existing = sessionDataRef.current[s.code] || {};
        const info = SESSION_CATALOG.get(s.code);
        if (info?.speakers?.length > 0) {
          updatedMap[s.code] = {
            ...existing,
            speakers: info.speakers.map(sp => ({
              name:     sp.name    || "",
              position: sp.title   || "",
              company:  sp.company || "",
            })),
          };
          syncedCount++;
        }
      });
      if (syncedCount === 0) {
        setSyncMsg("未找到匹配的 catalog 数据");
      } else {
        await setDoc(doc(db, "dailyReports", reportId), { sessions: updatedMap }, { merge: true });
        setSyncMsg(`已同步 ${syncedCount} 个 session`);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncMsg("同步失败，请重试");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 3000);
    }
  };

  // Toolbar
  const execBold = () => document.execCommand("bold");
  const execColor = (color) => { document.execCommand("foreColor", false, color); setShowColorPicker(false); };

  // New report navigation
  const handleCreateReport = () => {
    if (!newReportDate) return;
    const newId = nextVersionId(newReportDate, allReportDocs);
    navigate(`/report/${newId}`);
    setShowNewReport(false);
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="report-page">
        <div className="report-container" style={{ textAlign: "center", padding: "80px 20px" }}>
          <p style={{ color: "#999" }}>加载中...</p>
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
            <Link to="/" className="report-back-btn">← 返回日程</Link>
            <div style={{ width: 1, height: 20, background: "#E8E8E8" }} />
            <Link to="/reports" className="report-tool-btn" style={{ textDecoration: "none" }}>
              日报列表
            </Link>
            <button
              className="report-tool-btn"
              onClick={() => setShowNewReport(v => !v)}
            >
              + 新建日报
            </button>
          </div>
          <div className="report-toolbar-actions">
            {saveState === "saving" && (
              <span style={{ fontSize: 11, color: "#AAAAAA", marginRight: 4 }}>● 保存中...</span>
            )}
            {saveState === "saved" && (
              <span style={{ fontSize: 11, color: "#27AE60", marginRight: 4 }}>✓ 已保存</span>
            )}
            <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 4px" }} />
            <button
              className="report-tool-btn"
              onClick={handleToggleStatus}
              style={reportData?.status === "done" ? {
                background: "rgba(39,174,96,0.08)", color: "#27AE60",
                border: "1px solid rgba(39,174,96,0.3)",
              } : undefined}
            >
              {reportData?.status === "done" ? "✓ 已完成" : "标记完成"}
            </button>
            {/* ── Sync from catalog ── */}
            <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 4px" }} />
            {syncMsg && (
              <span style={{ fontSize: 11, color: "#2980B9", marginRight: 4 }}>
                {syncMsg}
              </span>
            )}
            <button
              className="report-tool-btn"
              onClick={handleSyncFromCatalog}
              disabled={syncing || !user}
              title="从 JSON catalog 同步所有 session 的演讲者信息"
              style={syncing ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
            >
              {syncing ? "同步中..." : "同步外源信息"}
            </button>
            <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 8px" }} />
            <button className="report-icon-btn" onClick={execBold} title="加粗">
              <strong>B</strong>
            </button>
            <button className="report-icon-btn" onClick={() => document.execCommand("italic")} title="斜体">
              <em style={{ fontStyle: "italic" }}>I</em>
            </button>
            <button className="report-icon-btn" onClick={() => document.execCommand("underline")} title="下划线">
              <span style={{ textDecoration: "underline" }}>U</span>
            </button>
            <div style={{ position: "relative" }}>
              <button
                className="report-icon-btn"
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="字体颜色"
              >
                <span style={{ borderBottom: "3px solid #CF0A2C", paddingBottom: 1 }}>A</span>
              </button>
              {showColorPicker && (
                <div className="report-color-picker">
                  {COLOR_PRESETS.map((c) => (
                    <button key={c} className="report-color-swatch" style={{ background: c }}
                      onClick={() => execColor(c)} title={c} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 8px" }} />
            <button className="report-export-btn" onClick={handleExportPDF} disabled={exporting}>
              {exporting ? "生成中..." : "导出 HTML"}
            </button>
          </div>
        </div>

        {/* New report form */}
        {showNewReport && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 24px", borderTop: "1px solid #E8E8E8" }}>
            <span style={{ fontSize: 13, color: "#3D3D3D" }}>选择日期：</span>
            <input
              type="date"
              value={newReportDate}
              onChange={e => setNewReportDate(e.target.value)}
              style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #DDDDDD", fontFamily: "inherit" }}
            />
            <button
              onClick={handleCreateReport}
              style={{ fontSize: 13, padding: "4px 14px", borderRadius: 6, background: "#CF0A2C", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              生成
            </button>
          </div>
        )}
      </div>

      {/* ── Report Content ───────────────────────────────────────── */}
      {/* data-pdf-ready is read by the Puppeteer server to know data is loaded */}
      <div className="report-container" ref={reportContainerRef} data-pdf-ready={!loading || undefined}>

        {/* Title bar */}
        <div className="report-title-bar">
          <div className="report-title-eyebrow">GTC 2026 · DAILY BRIEFING</div>
          <h1>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={e => saveField("title", e.currentTarget.textContent.trim() || "")}
            >{reportData?.title || `【${date}】日报`}</span>
            {version > 1 && (
              <span className="report-version-badge">v{version}</span>
            )}
          </h1>
        </div>

        {/* Header: TOC + Summary */}
        <div className="report-header">

          {/* TOC – organized by topic, drag-to-reorder */}
          <div className="report-toc">
            <h2 className="report-section-title">目录</h2>
            <p className="no-print report-toc-hint">⠿ 拖拽主题调整顺序</p>
            {orderedTopics.map(topic => (
              <div
                key={topic}
                className={`toc-topic-group${dragOverTopic === topic && dragTopic !== topic ? " drag-over" : ""}`}
                draggable
                onDragStart={e => handleTopicDragStart(e, topic)}
                onDragOver={e => handleTopicDragOver(e, topic)}
                onDrop={e => handleTopicDrop(e, topic)}
                onDragEnd={handleTopicDragEnd}
              >
                <div className="toc-topic-label">
                  <span className="toc-drag-handle">⠿</span>
                  {topic}
                </div>
                <ol className="report-toc-list" style={{ marginLeft: 14 }}>
                  {(topicsMap[topic] || []).map(s => (
                    <li key={s.code}>
                      <a href={`#session-${s.code}`} className="report-toc-link">
                        <span className="report-toc-title">
                          {SESSION_CATALOG.get(s.code)?.title || s.title}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="report-summary">
            <h2 className="report-section-title">核心要点</h2>
            <BulletEditor
              points={reportData?.summaryPoints}
              onSave={pts => saveField("summaryPoints", pts)}
              placeholder="请输入今日核心要点..."
            />
          </div>
        </div>

        {/* Session Reports – organized by topic */}
        <div className="report-sessions">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>会议纪要</h2>

          {orderedTopics.map(topic => (
            <div key={topic}>
              {/* Topic section header */}
              <div className="report-topic-divider">
                <span className="report-topic-bar" />
                <span className="report-topic-name">{topic}</span>
                <span className="report-topic-line" />
              </div>

              {(topicsMap[topic] || []).map(session => {
                const sd = sessionData[session.code] || {};
                // Graceful migration: old single-speaker format → new array format
                const speakers = sd.speakers
                  || (sd.speaker
                    ? [{ name: sd.speaker, position: "", company: sd.company || "" }]
                    : [{ name: "", position: "", company: "" }]);
                const contributors = Array.from(session.attendees)
                  .map(id => memberMap[id]).filter(Boolean).join("、");

                const isCollapsed = collapsedSessions.has(session.code);
                return (
                  <div key={session.code} id={`session-${session.code}`} className="report-session">

                    {/* Session Header: clickable to collapse */}
                    <div className="report-session-header" onClick={() => toggleCollapse(session.code)}
                      style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: isCollapsed ? 0 : 6 }}>
                          <span className="report-session-code" style={{ marginBottom: 0, flexShrink: 0 }}>
                            {session.code}
                          </span>
                          <h3 className="report-session-title" style={{ margin: 0 }}>
                            {SESSION_CATALOG.get(session.code)?.url
                              ? <a href={SESSION_CATALOG.get(session.code).url} target="_blank" rel="noopener noreferrer"
                                   style={{ color: "inherit", textDecoration: "none" }}
                                   onClick={e => e.stopPropagation()}
                                   onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                                   onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                                  {SESSION_CATALOG.get(session.code)?.title || session.title}
                                </a>
                              : SESSION_CATALOG.get(session.code)?.title || session.title
                            }
                          </h3>
                        </div>
                        {!isCollapsed && (
                          <div className="report-session-time">
                            {session.start}–{session.end}{session.room && ` | ${session.room}`}
                          </div>
                        )}
                      </div>
                      <span className="session-collapse-btn">{isCollapsed ? "▶" : "▼"}</span>
                    </div>

                    {!isCollapsed && <>
                    {/* Speakers */}
                    <div className="report-session-meta">
                      <span className="report-field-label" style={{ display: "block", marginBottom: 5 }}>演讲者</span>
                      <SpeakersEditor
                        code={session.code}
                        speakers={speakers}
                        onUpdate={newSpeakers => saveSpeakers(session.code, newSpeakers)}
                        onAdd={() => addSpeaker(session.code)}
                        onRemove={idx => removeSpeaker(session.code, idx)}
                      />
                    </div>

                    {/* Illustration */}
                    <div style={{ padding: "6px 20px 0" }}>
                      {sd.illustration ? (
                        <div>
                          <img src={sd.illustration} className="session-illustration" alt="插图" />
                          <button
                            className="no-print"
                            onClick={() => saveSessionField(session.code, "illustration", "")}
                            style={{
                              display: "block", marginTop: 4, fontSize: 11,
                              color: "#CF0A2C", background: "none", border: "none",
                              cursor: "pointer", padding: 0,
                            }}
                          >
                            删除插图
                          </button>
                        </div>
                      ) : (
                        <button
                          className="no-print"
                          onClick={() => illustInputRefs.current[session.code]?.click()}
                          style={{
                            fontSize: 11, color: "#BBBBBB", border: "1px dashed #DDDDDD",
                            background: "none", cursor: "pointer", padding: "5px 0",
                            borderRadius: 4, display: "block", textAlign: "center", width: "100%",
                          }}
                        >
                          + 添加插图
                        </button>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        ref={el => { illustInputRefs.current[session.code] = el; }}
                        onChange={e => handleIllustration(session.code, e)}
                      />
                    </div>

                    {/* Body: takeaways & insights */}
                    <div className="report-session-body">
                      <div className="report-field-block">
                        <h4 className="report-field-heading">关键收获</h4>
                        <EditableField
                          value={sd.takeaways}
                          onSave={html => saveSessionField(session.code, "takeaways", html)}
                          placeholder="记录本场会议的关键收获..."
                        />
                      </div>
                      <div className="report-field-block">
                        <h4 className="report-field-heading">启示</h4>
                        <EditableField
                          value={sd.insights}
                          onSave={html => saveSessionField(session.code, "insights", html)}
                          placeholder="记录启示与分析..."
                        />
                      </div>

                      {/* 贡献人 at the end */}
                      {contributors && (
                        <div className="report-contributors-row">
                          <span className="report-contributors-label">贡献人</span>
                          <span className="report-contributors-names">{contributors}</span>
                        </div>
                      )}
                    </div>
                    </>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Onsite Section */}
        <div className="report-onsite">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>现场花絮</h2>
          <EditableField
            value={reportData?.onsiteInfo}
            onSave={html => saveField("onsiteInfo", html)}
            placeholder="记录现场见闻、展台亮点、互动环节等..."
            minHeight={80}
          />
          <h2 className="report-section-title" style={{ marginTop: 24 }}>心得感悟</h2>
          <EditableField
            value={reportData?.reflections}
            onSave={html => saveField("reflections", html)}
            placeholder="记录个人感悟与思考..."
            minHeight={80}
          />
          <h2 className="report-section-title" style={{ marginTop: 24 }}>小道消息</h2>
          <EditableField
            value={reportData?.rumors}
            onSave={html => saveField("rumors", html)}
            placeholder="记录业界传闻与非公开信息..."
            minHeight={80}
          />
        </div>

        {/* Site Photos Section */}
        <div className="report-site-photos">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>现场记录</h2>
          <div className="site-photos-grid">
            {(reportData?.sitePhotos || []).map((photo, idx) => (
              <div key={idx} className="site-photo-card">
                <div className="site-photo-img-wrapper">
                  <img src={photo.image} alt={`现场记录 ${idx + 1}`} className="site-photo-img" />
                  <button
                    className="site-photo-delete-btn no-print"
                    onClick={() => handleSitePhotoDelete(idx)}
                    title="删除图片"
                  >×</button>
                </div>
                <textarea
                  className="site-photo-caption"
                  placeholder="添加图片说明..."
                  defaultValue={photo.caption}
                  onBlur={e => saveSitePhotoCaption(idx, e.target.value)}
                  rows={2}
                />
              </div>
            ))}
            <div className="site-photo-add-card no-print" onClick={() => sitePhotoInputRef.current?.click()}>
              <div className="site-photo-add-inner">
                <span className="site-photo-add-icon">+</span>
                <span className="site-photo-add-label">添加图片</span>
              </div>
            </div>
          </div>
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            ref={sitePhotoInputRef}
            onChange={handleSitePhotoAdd}
          />
        </div>

        {/* Footer */}
        <div className="report-footer">
          <div className="report-footer-inner">
            <p>GTC 2026 · {date} · 团队协作生成</p>
          </div>
        </div>

      </div>
    </div>
  );
}
