import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
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
  return useCallback((key, fn) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, delay);
  }, [delay]);
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

// ── InlineEditable ───────────────────────────────────────────────────────────
function InlineEditable({ value, onSave, placeholder }) {
  const ref = useRef(null);
  const focused = useRef(false);
  useEffect(() => {
    if (ref.current && !focused.current && value !== undefined) {
      if (ref.current.textContent !== (value || "")) ref.current.textContent = value || "";
    }
  }, [value]);
  return (
    <span
      ref={ref}
      className="report-inline-editable"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; }}
      onInput={() => { if (ref.current) onSave(ref.current.textContent); }}
    />
  );
}

// ── SpeakersEditor ───────────────────────────────────────────────────────────
function SpeakersEditor({ code, speakers, onUpdate, onAdd, onRemove }) {
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
  const { date } = useParams();
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [dragTopic, setDragTopic] = useState(null);
  const [dragOverTopic, setDragOverTopic] = useState(null);
  const [exporting, setExporting] = useState(false);

  const illustInputRefs = useRef({});
  const sessionDataRef = useRef({});
  const initDone = useRef(false);
  const debouncedSave = useDebouncedSave(600);

  // Auth
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

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
    return onSnapshot(doc(db, "dailyReports", date), (snap) => {
      setReportData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });
  }, [user, date]);

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
    setDoc(doc(db, "dailyReports", date), {
      date, summaryPoints: [], onsiteInfo: "", reflections: "", rumors: "",
      sessions: sessionMap, topicOrder: [],
    }).catch(console.error);
  }, [user, loading, reportData, sessions, date]);

  // Keep sessionDataRef in sync
  const sessionData = reportData?.sessions || {};
  sessionDataRef.current = sessionData;

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
      setDoc(doc(db, "dailyReports", date), { [field]: html }, { merge: true }).catch(console.error);
    });
  }, [user, date, debouncedSave]);

  const saveSessionField = useCallback((code, field, value) => {
    if (!user) return;
    debouncedSave(`${code}.${field}`, () => {
      setDoc(doc(db, "dailyReports", date), {
        sessions: { [code]: { [field]: value } }
      }, { merge: true }).catch(console.error);
    });
  }, [user, date, debouncedSave]);

  // Speakers: save whole array debounced
  const saveSpeakers = useCallback((code, speakers) => {
    if (!user) return;
    debouncedSave(`${code}.speakers`, () => {
      setDoc(doc(db, "dailyReports", date), {
        sessions: { [code]: { speakers } }
      }, { merge: true }).catch(console.error);
    });
  }, [user, date, debouncedSave]);

  const addSpeaker = useCallback((code) => {
    if (!user) return;
    const sd = sessionDataRef.current[code] || {};
    const speakers = [...(sd.speakers || []), { name: "", position: "", company: "" }];
    setDoc(doc(db, "dailyReports", date), {
      sessions: { [code]: { speakers } }
    }, { merge: true }).catch(console.error);
  }, [user, date]);

  const removeSpeaker = useCallback((code, idx) => {
    if (!user) return;
    const sd = sessionDataRef.current[code] || {};
    const speakers = (sd.speakers || []).filter((_, i) => i !== idx);
    setDoc(doc(db, "dailyReports", date), {
      sessions: { [code]: { speakers: speakers.length ? speakers : [{ name: "", position: "", company: "" }] } }
    }, { merge: true }).catch(console.error);
  }, [user, date]);

  const handleIllustration = useCallback((code, e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 600 * 1024) {
      alert("图片过大（超过600KB），请压缩后再上传。");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => saveSessionField(code, "illustration", ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [saveSessionField]);

  // Export PDF: try Puppeteer server first, fall back to window.print()
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const filename = `GTC2026_日报_${date}.pdf`;
      const pageUrl = window.location.href;
      const apiUrl =
        `http://localhost:3001/api/pdf` +
        `?url=${encodeURIComponent(pageUrl)}` +
        `&filename=${encodeURIComponent(filename)}`;

      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      // Server not running or unreachable → fall back to browser print
      console.info("PDF server unavailable, falling back to window.print():", err.message);
      window.print();
    } finally {
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
      setDoc(doc(db, "dailyReports", date), { topicOrder: newOrder }, { merge: true }).catch(console.error);
    }
  }, [dragTopic, orderedTopics, user, date]);
  const handleTopicDragEnd = () => { setDragTopic(null); setDragOverTopic(null); };

  // Toolbar
  const execBold = () => document.execCommand("bold");
  const execColor = (color) => { document.execCommand("foreColor", false, color); setShowColorPicker(false); };

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
          <Link to="/" className="report-back-btn">← 返回日程</Link>
          <div className="report-toolbar-actions">
            <button className="report-tool-btn" onClick={execBold} title="加粗">
              <strong>B</strong>
            </button>
            <div style={{ position: "relative" }}>
              <button
                className="report-tool-btn"
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
              {exporting ? "生成中..." : "导出 PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Report Content ───────────────────────────────────────── */}
      {/* data-pdf-ready is read by the Puppeteer server to know data is loaded */}
      <div className="report-container" data-pdf-ready={!loading || undefined}>

        {/* Title bar */}
        <div className="report-title-bar">
          <div className="report-title-eyebrow">GTC 2026 · DAILY BRIEFING</div>
          <h1>【{date}】日报</h1>
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

                return (
                  <div key={session.code} id={`session-${session.code}`} className="report-session">

                    {/* Session Header: code + title on same line */}
                    <div className="report-session-header">
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                        <span className="report-session-code" style={{ marginBottom: 0, flexShrink: 0 }}>
                          {session.code}
                        </span>
                        <h3 className="report-session-title" style={{ margin: 0 }}>
                          {SESSION_CATALOG.get(session.code)?.url
                            ? <a href={SESSION_CATALOG.get(session.code).url} target="_blank" rel="noopener noreferrer"
                                 style={{ color: "inherit", textDecoration: "none" }}
                                 onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                                 onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                                {SESSION_CATALOG.get(session.code)?.title || session.title}
                              </a>
                            : SESSION_CATALOG.get(session.code)?.title || session.title
                          }
                        </h3>
                      </div>
                      <div className="report-session-time">
                        {session.start}–{session.end}{session.room && ` | ${session.room}`}
                      </div>
                    </div>

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
                        <h4 className="report-field-heading">深度见解</h4>
                        <EditableField
                          value={sd.insights}
                          onSave={html => saveSessionField(session.code, "insights", html)}
                          placeholder="记录深度见解与分析..."
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
