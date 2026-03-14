import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ── Debounce helper ─────────────────────────────────────────────────────────
function useDebouncedSave(delay = 800) {
  const timers = useRef({});
  return useCallback((key, fn) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, delay);
  }, [delay]);
}

// ── Color presets for toolbar ───────────────────────────────────────────────
const COLOR_PRESETS = [
  "#333333", "#CF0A2C", "#E67E22", "#27AE60", "#2980B9", "#8E44AD",
];

export default function DailyReport() {
  const { date } = useParams();
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const reportRef = useRef(null);
  const focusedField = useRef(null);
  const debouncedSave = useDebouncedSave(600);
  const initDone = useRef(false);

  // Auth
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // Members realtime
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "members"), (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push(d.data()));
      arr.sort((a, b) => Number(a.id) - Number(b.id));
      setMembers(arr);
    });
  }, [user]);

  // Sessions realtime (filtered by date)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "sessions"), (snap) => {
      const arr = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.date === date) {
          arr.push({ ...data, attendees: new Set(data.attendees || []) });
        }
      });
      arr.sort((a, b) => a.start.localeCompare(b.start));
      setSessions(arr);
    });
  }, [user, date]);

  // Report data realtime
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, "dailyReports", date);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setReportData(snap.data());
      } else {
        setReportData(null);
      }
      setLoading(false);
    });
  }, [user, date]);

  // Auto-init report document when sessions are loaded but no report exists
  useEffect(() => {
    if (!user || loading || reportData || initDone.current || sessions.length === 0) return;
    initDone.current = true;
    const sessionMap = {};
    sessions.forEach((s) => {
      sessionMap[s.code] = {
        speaker: "",
        company: "",
        takeaways: "",
        insights: "",
      };
    });
    setDoc(doc(db, "dailyReports", date), {
      date,
      summary: "",
      onsiteInfo: "",
      reflections: "",
      rumors: "",
      sessions: sessionMap,
    }).catch(console.error);
  }, [user, loading, reportData, sessions, date]);

  // Resolve member names
  const memberMap = useMemo(() => {
    const map = {};
    members.forEach((m) => { map[m.id] = m.name; });
    return map;
  }, [members]);

  // Save a top-level field
  const saveField = useCallback((field, html) => {
    if (!user) return;
    debouncedSave(field, () => {
      setDoc(doc(db, "dailyReports", date), { [field]: html }, { merge: true })
        .catch(console.error);
    });
  }, [user, date, debouncedSave]);

  // Save a session-level field
  const saveSessionField = useCallback((code, field, value) => {
    if (!user) return;
    const key = `${code}.${field}`;
    debouncedSave(key, () => {
      setDoc(doc(db, "dailyReports", date), {
        sessions: { [code]: { [field]: value } }
      }, { merge: true }).catch(console.error);
    });
  }, [user, date, debouncedSave]);

  // Toolbar actions
  const execBold = () => document.execCommand("bold");
  const execColor = (color) => {
    document.execCommand("foreColor", false, color);
    setShowColorPicker(false);
  };

  // PDF export
  const exportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = reportRef.current;
      element.classList.add("exporting-pdf");
      await html2pdf().set({
        margin: [15, 15, 15, 15],
        filename: `GTC2026_日报_${date}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      }).from(element).save();
      element.classList.remove("exporting-pdf");
    } catch (err) {
      console.error("PDF export error:", err);
      alert("PDF 导出失败：" + err.message);
    }
    setExporting(false);
  };

  // Editable field component
  const EditableField = ({ value, onSave, placeholder, minHeight = 60, multiline = true }) => {
    const ref = useRef(null);
    const localFocused = useRef(false);

    useEffect(() => {
      if (ref.current && !localFocused.current && value !== undefined) {
        if (ref.current.innerHTML !== (value || "")) {
          ref.current.innerHTML = value || "";
        }
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
        onFocus={() => {
          localFocused.current = true;
          focusedField.current = ref.current;
        }}
        onBlur={() => {
          localFocused.current = false;
          focusedField.current = null;
        }}
        onInput={() => {
          if (ref.current) onSave(ref.current.innerHTML);
        }}
      />
    );
  };

  // Inline editable (single line, for speaker/company)
  const InlineEditable = ({ value, onSave, placeholder }) => {
    const ref = useRef(null);
    const localFocused = useRef(false);

    useEffect(() => {
      if (ref.current && !localFocused.current && value !== undefined) {
        if (ref.current.textContent !== (value || "")) {
          ref.current.textContent = value || "";
        }
      }
    }, [value]);

    return (
      <span
        ref={ref}
        className="report-inline-editable"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => {
          localFocused.current = true;
          focusedField.current = ref.current;
        }}
        onBlur={() => {
          localFocused.current = false;
          focusedField.current = null;
        }}
        onInput={() => {
          if (ref.current) onSave(ref.current.textContent);
        }}
      />
    );
  };

  if (loading) {
    return (
      <div className="report-page">
        <div className="report-container" style={{ textAlign: "center", padding: "80px 20px" }}>
          <p style={{ color: "#999" }}>加载中...</p>
        </div>
      </div>
    );
  }

  const sessionData = reportData?.sessions || {};

  return (
    <div className="report-page">
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="report-toolbar no-print">
        <div className="report-toolbar-inner">
          <Link to="/" className="report-back-btn">
            ← 返回日程
          </Link>
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
            <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 8px" }} />
            <button
              className="report-export-btn"
              onClick={exportPDF}
              disabled={exporting}
            >
              {exporting ? "导出中..." : "导出 PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Report Content ───────────────────────────────────────── */}
      <div className="report-container" ref={reportRef}>
        {/* Title bar */}
        <div className="report-title-bar">
          <h1>GTC 2026 日报 —【{date}】</h1>
        </div>

        {/* Header: TOC + Summary */}
        <div className="report-header">
          <div className="report-toc">
            <h2 className="report-section-title">目录</h2>
            <ol className="report-toc-list">
              {sessions.map((s, i) => (
                <li key={s.code}>
                  <a href={`#session-${s.code}`} className="report-toc-link">
                    <span className="report-toc-time">{s.start}</span>
                    <span className="report-toc-title">{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
          <div className="report-summary">
            <h2 className="report-section-title">核心要点</h2>
            <EditableField
              value={reportData?.summary}
              onSave={(html) => saveField("summary", html)}
              placeholder="请输入今日核心要点摘要..."
              minHeight={100}
            />
          </div>
        </div>

        {/* Session Reports */}
        <div className="report-sessions">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>会议纪要</h2>
          {sessions.map((session) => {
            const sd = sessionData[session.code] || {};
            const contributors = Array.from(session.attendees)
              .map((id) => memberMap[id])
              .filter(Boolean)
              .join("、");

            return (
              <div key={session.code} id={`session-${session.code}`} className="report-session">
                <div className="report-session-header">
                  <div className="report-session-code">{session.code}</div>
                  <h3 className="report-session-title">{session.title}</h3>
                  <div className="report-session-time">
                    {session.start}–{session.end} {session.room && `| ${session.room}`}
                  </div>
                </div>

                <div className="report-session-meta">
                  <div className="report-meta-row">
                    <span className="report-field-label">演讲者：</span>
                    <InlineEditable
                      value={sd.speaker}
                      onSave={(val) => saveSessionField(session.code, "speaker", val)}
                      placeholder="输入演讲者姓名"
                    />
                  </div>
                  <div className="report-meta-row">
                    <span className="report-field-label">公司：</span>
                    <InlineEditable
                      value={sd.company}
                      onSave={(val) => saveSessionField(session.code, "company", val)}
                      placeholder="输入公司名称"
                    />
                  </div>
                  {contributors && (
                    <div className="report-meta-row">
                      <span className="report-field-label">负责人：</span>
                      <span className="report-contributors">{contributors}</span>
                    </div>
                  )}
                </div>

                <div className="report-session-body">
                  <div className="report-field-block">
                    <h4 className="report-field-heading">关键收获</h4>
                    <EditableField
                      value={sd.takeaways}
                      onSave={(html) => saveSessionField(session.code, "takeaways", html)}
                      placeholder="记录本场会议的关键收获..."
                    />
                  </div>
                  <div className="report-field-block">
                    <h4 className="report-field-heading">深度见解</h4>
                    <EditableField
                      value={sd.insights}
                      onSave={(html) => saveSessionField(session.code, "insights", html)}
                      placeholder="记录深度见解与分析..."
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Onsite Section */}
        <div className="report-onsite">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>现场花絮</h2>
          <EditableField
            value={reportData?.onsiteInfo}
            onSave={(html) => saveField("onsiteInfo", html)}
            placeholder="记录现场见闻、展台亮点、互动环节等..."
            minHeight={80}
          />

          <h2 className="report-section-title" style={{ marginTop: 24 }}>心得感悟</h2>
          <EditableField
            value={reportData?.reflections}
            onSave={(html) => saveField("reflections", html)}
            placeholder="记录个人感悟与思考..."
            minHeight={80}
          />

          <h2 className="report-section-title" style={{ marginTop: 24 }}>小道消息</h2>
          <EditableField
            value={reportData?.rumors}
            onSave={(html) => saveField("rumors", html)}
            placeholder="记录业界传闻与非公开信息..."
            minHeight={80}
          />
        </div>

        {/* Footer */}
        <div className="report-footer">
          <p>GTC 2026 日报 · {date} · 团队协作生成</p>
        </div>
      </div>
    </div>
  );
}
