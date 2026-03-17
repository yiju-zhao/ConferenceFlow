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
import catalogData from "../data/gtc-2026-sessions-detailed.json";
const SESSION_CATALOG = new Map(catalogData.map((s) => [s.session_id, s]));
const topicSlug = (t) =>
  t.replace(/[^\w\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

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
          <div className="speaker-fields no-print">
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
  const containerRef = useRef(null);

  useEffect(() => {
    if (!focused.current) setLocal(points || []);
  }, [points]);

  // Resize all textareas whenever content changes (handles initial load)
  useEffect(() => {
    containerRef.current?.querySelectorAll(".bullet-input").forEach(el => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    });
  }, [local]);

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
      ref={containerRef}
      className="bullet-editor"
      onFocus={() => { focused.current = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) focused.current = false; }}
    >
      <ul className="bullet-editor-list">
        {local.map((point, idx) => (
          <li key={idx} className="bullet-editor-item">
            <span className="bullet-dot" aria-hidden="true">•</span>
            <textarea
              className="bullet-input"
              value={point}
              placeholder={placeholder}
              rows={1}
              onChange={(e) => {
                handleChange(idx, e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  handleKeyDown(e, idx);
                } else if (e.key === "Backspace") {
                  handleKeyDown(e, idx);
                }
              }}
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

// ── Snapshot diff helpers ─────────────────────────────────────────────────────
function diffArrays(oldArr, newArr) {
  const m = oldArr.length, n = newArr.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldArr[i-1] === newArr[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i-1] === newArr[j-1]) {
      result.unshift({ text: oldArr[i-1], type: "equal" }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ text: newArr[j-1], type: "insert" }); j--;
    } else {
      result.unshift({ text: oldArr[i-1], type: "delete" }); i--;
    }
  }
  return result;
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function getTextLines(html) {
  return stripHtml(html).split(/\n/).map(s => s.trim()).filter(Boolean);
}

function DiffList({ oldItems, newItems }) {
  const diff = diffArrays((oldItems || []).map(String), (newItems || []).map(String));
  if (diff.length === 0) return <p style={{ color: "#999", fontSize: 13 }}>（无内容）</p>;
  return (
    <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
      {diff.map((item, i) => (
        <li key={i} style={{
          fontSize: 13, padding: "2px 6px", borderRadius: 3, marginBottom: 3,
          background: item.type === "insert" ? "rgba(39,174,96,0.1)" : item.type === "delete" ? "rgba(207,10,44,0.1)" : "transparent",
          textDecoration: item.type === "delete" ? "line-through" : "none",
          color: item.type === "insert" ? "#27AE60" : item.type === "delete" ? "#CF0A2C" : "inherit",
        }}>
          {item.type === "insert" ? "+ " : item.type === "delete" ? "− " : ""}{item.text}
        </li>
      ))}
    </ul>
  );
}

function DiffText({ oldText, newText }) {
  const diff = diffArrays(getTextLines(oldText), getTextLines(newText));
  if (diff.length === 0) return <p style={{ color: "#999", fontSize: 13 }}>（无内容）</p>;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      {diff.map((item, i) => (
        <div key={i} style={{
          padding: "2px 8px", marginBottom: 2, borderRadius: 3,
          background: item.type === "insert" ? "rgba(39,174,96,0.1)" : item.type === "delete" ? "rgba(207,10,44,0.1)" : "transparent",
          textDecoration: item.type === "delete" ? "line-through" : "none",
          color: item.type === "insert" ? "#27AE60" : item.type === "delete" ? "#CF0A2C" : "inherit",
        }}>
          {item.type !== "equal" && (item.type === "insert" ? "+ " : "− ")}{item.text}
        </div>
      ))}
    </div>
  );
}

function SnapshotViewer({ snapshot, currentData }) {
  const { data } = snapshot;
  const ts = snapshot.createdAt?.toDate
    ? snapshot.createdAt.toDate().toLocaleString("zh-CN")
    : "未知时间";
  const FIELD_LABELS = { onsiteInfo: "现场情报", reflections: "圈内声音", rumors: "深度研判" };
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: "#888" }}>
        快照时间：{ts}　·　绿色 = 快照中新增，红色删除线 = 当前版本中已改动
      </p>
      <section style={{ marginBottom: 24 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#3D3D3D" }}>核心要点</h4>
        <DiffList oldItems={currentData?.summaryPoints || []} newItems={data?.summaryPoints || []} />
      </section>
      {Object.keys(data?.sessions || {}).map(code => {
        const oldSd = currentData?.sessions?.[code] || {};
        const newSd = data?.sessions?.[code] || {};
        const hasTakeawaysDiff = stripHtml(oldSd.takeaways) !== stripHtml(newSd.takeaways);
        const hasInsightsDiff = stripHtml(oldSd.insights) !== stripHtml(newSd.insights);
        if (!hasTakeawaysDiff && !hasInsightsDiff) return null;
        return (
          <section key={code} style={{ marginBottom: 24, paddingLeft: 12, borderLeft: "3px solid #E8E8E8" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#888", fontFamily: "monospace" }}>{code}</h4>
            {hasTakeawaysDiff && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#AAAAAA", marginBottom: 4 }}>关键收获</div>
                <DiffText oldText={oldSd.takeaways} newText={newSd.takeaways} />
              </div>
            )}
            {hasInsightsDiff && (
              <div>
                <div style={{ fontSize: 11, color: "#AAAAAA", marginBottom: 4 }}>启示</div>
                <DiffText oldText={oldSd.insights} newText={newSd.insights} />
              </div>
            )}
          </section>
        );
      })}
      {["onsiteInfo", "reflections", "rumors"].map(field => {
        const oldVal = currentData?.[field];
        const newVal = data?.[field];
        if (stripHtml(oldVal) === stripHtml(newVal)) return null;
        return (
          <section key={field} style={{ marginBottom: 24 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#3D3D3D" }}>{FIELD_LABELS[field]}</h4>
            <DiffText oldText={oldVal} newText={newVal} />
          </section>
        );
      })}
    </div>
  );
}

// ── DailyReport ──────────────────────────────────────────────────────────────
export default function DailyReport() {
  const { reportId } = useParams();
  const { date } = parseReportId(reportId);
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [members, setMembers] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [dragTopic, setDragTopic] = useState(null);
  const [dragOverTopic, setDragOverTopic] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(null);
  const [collapsedSessions, setCollapsedSessions] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState({ code: null, contributorNames: [], nameInput: "", error: false });
  const [showDeleteSelect, setShowDeleteSelect] = useState(false);

  const illustInputRefs = useRef({});
  const sessionDataRef = useRef({});
  const reportDataRef = useRef(null);
  const createSnapshotRef = useRef(null);
  const lastSnapshotHashRef = useRef(null);
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

  // Close export dropdown on outside click or Escape
  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e) => {
      if (!e.target.closest('.export-dropdown-wrapper')) setShowExportMenu(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setShowExportMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [showExportMenu]);

  // Snapshots subscription
  useEffect(() => {
    if (!user || !reportId) return;
    const q = query(
      collection(db, "dailyReports", reportId, "snapshots"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, snap => {
      setSnapshots(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user, reportId]);

  // 5-minute auto snapshot
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => { createSnapshotRef.current?.("auto"); }, 5 * 60 * 1000);
    return () => clearInterval(timer);
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
      sessions: sessionMap, topicOrder: [], status: "draft",
    }).catch(console.error);
  }, [user, loading, reportData, sessions, reportId, date]);

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

  const deletedSessionCodes = useMemo(() =>
    new Set(reportData?.deletedSessions || [])
  , [reportData]);

  const activeSessions = useMemo(() =>
    sessions.filter(s => !deletedSessionCodes.has(s.code))
  , [sessions, deletedSessionCodes]);

  const topicsMap = useMemo(() => {
    const map = {};
    activeSessions.forEach((s) => {
      const cat = SESSION_CATALOG.get(s.code);
      const rawTopic = cat?.topic ? cat.topic.split(" - ").at(-1)?.trim() : null;
      const topic = s.mainTopic?.trim() || cat?.key_themes?.[0] || rawTopic;
      if (!topic) return;
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
  }, [activeSessions]);

  const noTopicSessions = useMemo(() => {
    return activeSessions
      .filter(s => {
        const cat = SESSION_CATALOG.get(s.code);
        return !(s.mainTopic?.trim() || cat?.key_themes?.[0] || cat?.topic);
      })
      .sort((a, b) => {
        const tc = a.start.localeCompare(b.start);
        return tc !== 0 ? tc : a.title.localeCompare(b.title);
      });
  }, [activeSessions]);

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

  // ── Snapshot helpers ─────────────────────────────────────────────────────────
  const pruneSnapshots = useCallback(async () => {
    const q = query(
      collection(db, "dailyReports", reportId, "snapshots"),
      orderBy("createdAt", "desc"),
      limit(51)
    );
    const snap = await getDocs(q);
    if (snap.docs.length > 50) {
      await deleteDoc(snap.docs[50].ref);
    }
  }, [reportId]);

  const createSnapshot = useCallback(async (type) => {
    if (!user || !reportDataRef.current) return;
    const rd = reportDataRef.current;
    const data = {
      title: rd.title || "",
      summaryPoints: rd.summaryPoints || [],
      sessions: sessionDataRef.current || {},
      topicOrder: rd.topicOrder || [],
      deletedSessions: rd.deletedSessions || [],
      onsiteInfo: rd.onsiteInfo || "",
      reflections: rd.reflections || "",
      rumors: rd.rumors || "",
    };
    const hash = JSON.stringify(data);
    // Skip auto snapshots when content hasn't changed since last snapshot
    if (type === "auto" && hash === lastSnapshotHashRef.current) return;
    try {
      await addDoc(collection(db, "dailyReports", reportId, "snapshots"), {
        type,
        label: type === "auto" ? "自动保存" : "手动保存",
        createdAt: serverTimestamp(),
        data,
      });
      lastSnapshotHashRef.current = hash;
      await pruneSnapshots();
    } catch (err) {
      console.error("[Snapshot] Failed to save snapshot:", err.code, err.message);
    }
  }, [user, reportId, pruneSnapshots]);

  // Keep createSnapshotRef up to date (used by 5-min timer)
  createSnapshotRef.current = createSnapshot;

  const handleSave = async () => {
    await createSnapshot("manual");
  };

  const handleRestore = (snapshot) => {
    setRestoreConfirm(snapshot);
  };

  const confirmRestore = async () => {
    if (!restoreConfirm) return;
    const snapshot = restoreConfirm;
    setRestoreConfirm(null);
    await createSnapshot("manual");
    await setDoc(doc(db, "dailyReports", reportId), snapshot.data, { merge: true });
    setShowHistory(false);
    setViewingSnapshot(null);
  };

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

  const openDeleteConfirm = useCallback((code, contributorNames) => {
    setShowDeleteSelect(false);
    setDeleteConfirm({ code, contributorNames, nameInput: "", error: false });
  }, []);

  const confirmDeleteSession = useCallback(() => {
    const { code, contributorNames, nameInput } = deleteConfirm;
    const trimmed = nameInput.trim();
    const valid = contributorNames.length === 0
      ? trimmed.length > 0
      : contributorNames.some(n => n === trimmed);
    if (!valid) {
      setDeleteConfirm(prev => ({ ...prev, error: true }));
      return;
    }
    const currentDeleted = reportDataRef.current?.deletedSessions || [];
    setDoc(doc(db, "dailyReports", reportId), {
      deletedSessions: [...currentDeleted, code]
    }, { merge: true }).catch(console.error);
    setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false });
  }, [deleteConfirm, reportId]);

  const compressImage = useCallback((file, maxPx = 1200, quality = 0.75) => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = url;
    });
  }, []);

  const uploadToStorage = useCallback(async (base64DataUrl, path) => {
    const storageRef = ref(storage, path);
    await uploadString(storageRef, base64DataUrl, "data_url");
    return getDownloadURL(storageRef);
  }, []);

  // Normalize illustrations: supports old single string + new array format
  const getIllustrations = useCallback((sd) => {
    if (Array.isArray(sd.illustrations)) return sd.illustrations;
    if (sd.illustration) return [{ url: sd.illustration, storagePath: `illustrations/${reportId}/${sd._code}` }];
    return [];
  }, [reportId]);

  const handleIllustration = useCallback((code, e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const storagePath = `illustrations/${reportId}/${code}_${Date.now()}`;
    compressImage(file)
      .then(compressed => uploadToStorage(compressed, storagePath))
      .then(url => {
        const current = sessionDataRef.current[code] || {};
        const existing = Array.isArray(current.illustrations) ? current.illustrations
          : current.illustration ? [{ url: current.illustration, storagePath: `illustrations/${reportId}/${code}` }]
          : [];
        saveSessionField(code, "illustrations", [...existing, { url, storagePath }]);
      });
  }, [compressImage, uploadToStorage, reportId, saveSessionField]);

  const handleIllustrationDelete = useCallback((code, idx) => {
    const current = sessionDataRef.current[code] || {};
    const existing = Array.isArray(current.illustrations) ? current.illustrations
      : current.illustration ? [{ url: current.illustration, storagePath: `illustrations/${reportId}/${code}` }]
      : [];
    const item = existing[idx];
    if (item?.storagePath) deleteObject(ref(storage, item.storagePath)).catch(() => {});
    const next = existing.filter((_, i) => i !== idx);
    saveSessionField(code, "illustrations", next);
    // Clear legacy field if present
    if (current.illustration) saveSessionField(code, "illustration", "");
  }, [reportId, saveSessionField]);

  // ── Site Photos handlers ─────────────────────────────────────────────────
  const handleSitePhotoAdd = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    const storagePath = `sitePhotos/${reportId}/${Date.now()}`;
    compressImage(file)
      .then(compressed => uploadToStorage(compressed, storagePath))
      .then(url => {
        const photos = [...(reportDataRef.current?.sitePhotos || []), { image: url, storagePath, caption: "" }];
        setDoc(doc(db, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
      });
  }, [compressImage, uploadToStorage, reportId]);

  const handleSitePhotoDelete = useCallback((idx) => {
    const photos = reportDataRef.current?.sitePhotos || [];
    const photo = photos[idx];
    if (photo?.storagePath) {
      deleteObject(ref(storage, photo.storagePath)).catch(() => {});
    }
    const updated = photos.filter((_, i) => i !== idx);
    setDoc(doc(db, "dailyReports", reportId), { sitePhotos: updated }, { merge: true }).catch(console.error);
  }, [reportId]);

  const saveSitePhotoCaption = useCallback((idx, caption) => {
    debouncedSave(`sitePhoto-caption-${idx}`, () => {
      const photos = [...(reportDataRef.current?.sitePhotos || [])];
      if (photos[idx]) photos[idx] = { ...photos[idx], caption };
      return setDoc(doc(db, "dailyReports", reportId), { sitePhotos: photos }, { merge: true }).catch(console.error);
    });
  }, [reportId, debouncedSave]);

  // Extract all CSS text via CSSOM — skips cross-origin sheets silently
  const extractAllCSS = (skipPrint = false) => {
    const parts = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (skipPrint && rule.type === CSSRule.MEDIA_RULE &&
              rule.conditionText?.includes('print')) continue;
          parts.push(rule.cssText);
        }
      } catch (_e) {
        // Cross-origin stylesheet — skip silently
      }
    }
    return parts.join('\n');
  };

  // Unified export handler for all three formats
  const handleExport = async (format) => {
    setExporting(true);
    setShowExportMenu(false);

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

      let blob, filename;

      if (format === 'html') {
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
  @media print {
    .report-session { break-before: page; page-break-before: always; }
    .report-session:first-of-type { break-before: auto; page-break-before: auto; }
  }
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`;
        blob = new Blob([html], { type: "text/html;charset=utf-8" });
        filename = `GTC2026_日报_${date}.html`;

      } else if (format === 'email') {
        const { default: juice } = await import('juice');

        // Fix speaker visibility: remove print-only class so juice won't re-apply
        // display:none !important (which would override the display:block we set above)
        clone.querySelectorAll(".print-only").forEach(el => {
          el.style.display = "block";
          el.classList.remove("print-only");
        });

        const cssText = extractAllCSS(true); // skip @media print for email

        // Email-specific overrides: larger fonts + remove decorative gray borders
        const emailOverrides = `
          body { font-size: 15px; }
          .report-session {
            border: none !important;
            border-left: 3px solid #CF0A2C !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin-bottom: 20px !important;
          }
          .report-session-header { border-bottom: none !important; }
          .report-session-meta   { border-bottom: none !important; }
          .report-contributors-row { border-top: none !important; }
          .report-session-title  { font-size: 16px !important; }
          .report-session-code   { font-size: 12px !important; }
          .report-session-time   { font-size: 13px !important; }
          .report-contributors   { font-size: 14px !important; }
          .report-contributors-label { font-size: 13px !important; }
          .report-contributors-names { font-size: 13px !important; }
          .report-section-title  { font-size: 14px !important; }
          .report-field-label    { font-size: 13px !important; }
        `;

        // juice.inlineContent returns a full document (<html><head><body>…</body></html>).
        // Extract only the <body> content to avoid double-nesting, which breaks
        // fragment (#anchor) navigation in the exported file.
        const juicedDoc = juice.inlineContent(clone.outerHTML, cssText + emailOverrides, {
          preserveMediaQueries: false,
        });
        const bodyMatch = juicedDoc.match(/<body[^>]*>([\s\S]*?)<\/body>/is);
        const inlinedBody = bodyMatch ? bodyMatch[1].trim() : juicedDoc;

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTC2026 日报 ${date}</title>
</head>
<body>
<div style="width:100%;max-width:800px;margin:0 auto;font-family:sans-serif;font-size:15px;">
${inlinedBody}
</div>
</body>
</html>`;
        blob = new Blob([html], { type: "text/html;charset=utf-8" });
        filename = `GTC2026_日报_${date}_email.html`;

      } else if (format === 'markdown') {
        const { default: TurndownService } = await import('turndown');
        const { gfm } = await import('turndown-plugin-gfm');

        // Inject <a id="..."> before each session so TOC links have a target.
        // turndown drops id attributes on divs; raw HTML anchors are preserved
        // and work in Obsidian, GitHub Markdown, and most Markdown viewers.
        clone.querySelectorAll("[id^='session-']").forEach(el => {
          const anchor = document.createElement('a');
          anchor.id = el.id;
          el.insertBefore(anchor, el.firstChild);
        });

        const td = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
        });
        td.use(gfm);

        // Preserve <a id="..."> anchor tags as raw HTML (turndown drops them by default)
        td.addRule('session-anchor', {
          filter: (node) =>
            node.nodeName === 'A' &&
            !!node.getAttribute('id') &&
            !node.getAttribute('href'),
          replacement: (_content, node) =>
            `<a id="${node.getAttribute('id')}"></a>`,
        });

        const frontmatter = `---\ntitle: GTC 2026 日报 ${date}\ndate: ${date}\n---\n\n`;
        const md = frontmatter + td.turndown(clone.outerHTML);
        blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        filename = `GTC2026_日报_${date}.md`;
      }

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
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
              onClick={handleSave}
              title="立即保存并创建快照"
            >
              保存
            </button>
            <button
              className="report-tool-btn"
              onClick={() => setShowHistory(true)}
              title="查看历史版本快照"
            >
              历史版本
            </button>
            {/* ── Delete session ── */}
            <div style={{ width: 1, height: 20, background: "#E8E8E8", margin: "0 4px" }} />
            <button
              className="report-tool-btn"
              onClick={() => setShowDeleteSelect(true)}
              title="从日报移除一个 session"
              style={{ color: "#CF0A2C" }}
            >
              删除 Session
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
            <div className="export-dropdown-wrapper" style={{ position: "relative" }}>
              <button
                className="report-export-btn"
                onClick={() => !exporting && setShowExportMenu(v => !v)}
                disabled={exporting}
                aria-haspopup="true"
                aria-expanded={showExportMenu}
              >
                {exporting ? "生成中..." : "导出文件 ▾"}
              </button>
              {showExportMenu && (
                <div className="dropdown-panel export-dropdown-menu">
                  <button className="export-menu-item" onClick={() => handleExport('html')}>
                    HTML — 离线查看
                  </button>
                  <button className="export-menu-item" onClick={() => handleExport('email')}>
                    HTML Email — 邮件发送
                  </button>
                  <button className="export-menu-item" onClick={() => handleExport('markdown')}>
                    Markdown — Notion/文档
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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
          </h1>
        </div>

        {/* Header: TOC + Summary */}
        <div className="report-header">

          {/* TOC – hierarchical section links */}
          <div className="report-toc">
            <h2 className="report-section-title">目录</h2>
            <ul className="report-toc-list">
              <li className="report-toc-section-item">
                <a href="#section-related" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">相关议题</span>
                </a>
                {orderedTopics.length > 0 && (
                  <ul className="report-toc-sublist">
                    {orderedTopics.map(topic => (
                      <li key={topic}>
                        <a href={`#topic-${topicSlug(topic)}`} className="report-toc-link">
                          <span className="report-toc-title">{topic}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              <li className="report-toc-section-item">
                <a href="#section-onsite-info" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">现场情报</span>
                </a>
              </li>
              <li className="report-toc-section-item">
                <a href="#section-reflections" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">圈内声音</span>
                </a>
              </li>
              <li className="report-toc-section-item">
                <a href="#section-rumors" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">深度研判</span>
                </a>
              </li>
              <li className="report-toc-section-item">
                <a href="#section-site-photos" className="report-toc-link report-toc-section-link">
                  <span className="report-toc-title">现场记录</span>
                </a>
              </li>
            </ul>
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
        <div id="section-related" className="report-sessions">
          <h2 className="report-section-title" style={{ marginTop: 32 }}>相关议题</h2>

          {noTopicSessions.map(session => {
            const sd = sessionData[session.code] || {};
            const speakers = sd.speakers
              || (sd.speaker
                ? [{ name: sd.speaker, position: "", company: sd.company || "" }]
                : [{ name: "", position: "", company: "" }]);
            const contributorNames = Array.from(session.attendees).map(id => memberMap[id]).filter(Boolean);
            const contributors = contributorNames.join("、");
            const isCollapsed = collapsedSessions.has(session.code);
            return (
              <div key={session.code} id={`session-${session.code}`} className="report-session">
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
                <div style={{ padding: "6px 20px 0" }}>
                  {(() => {
                    const illus = getIllustrations({ ...sd, _code: session.code });
                    return (<>
                      {illus.length > 0 && (
                        <div className="session-illustrations-grid">
                          {illus.map((item, i) => (
                            <div key={i} className="session-illustration-item">
                              <img src={item.url} className="session-illustration" alt={`插图${i + 1}`} />
                              <button
                                className="no-print session-illustration-del"
                                onClick={() => handleIllustrationDelete(session.code, i)}
                              >删除</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="no-print"
                        onClick={() => illustInputRefs.current[session.code]?.click()}
                        style={{
                          fontSize: 11, color: "#BBBBBB", border: "1px dashed #DDDDDD",
                          background: "none", cursor: "pointer", padding: "5px 0",
                          borderRadius: 4, display: "block", textAlign: "center", width: "100%",
                          marginTop: illus.length > 0 ? 6 : 0,
                        }}
                      >
                        + 添加插图
                      </button>
                    </>);
                  })()}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    ref={el => { illustInputRefs.current[session.code] = el; }}
                    onChange={e => handleIllustration(session.code, e)}
                  />
                </div>
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

          {orderedTopics.map(topic => (
            <div key={topic}>
              {/* Topic section header */}
              <div className="report-topic-divider" id={`topic-${topicSlug(topic)}`}>
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
                const contributorNames = Array.from(session.attendees).map(id => memberMap[id]).filter(Boolean);
                const contributors = contributorNames.join("、");

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
                      {(() => {
                        const illus = getIllustrations({ ...sd, _code: session.code });
                        return (<>
                          {illus.length > 0 && (
                            <div className="session-illustrations-grid">
                              {illus.map((item, i) => (
                                <div key={i} className="session-illustration-item">
                                  <img src={item.url} className="session-illustration" alt={`插图${i + 1}`} />
                                  <button
                                    className="no-print session-illustration-del"
                                    onClick={() => handleIllustrationDelete(session.code, i)}
                                  >删除</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            className="no-print"
                            onClick={() => illustInputRefs.current[session.code]?.click()}
                            style={{
                              fontSize: 11, color: "#BBBBBB", border: "1px dashed #DDDDDD",
                              background: "none", cursor: "pointer", padding: "5px 0",
                              borderRadius: 4, display: "block", textAlign: "center", width: "100%",
                              marginTop: illus.length > 0 ? 6 : 0,
                            }}
                          >
                            + 添加插图
                          </button>
                        </>);
                      })()}
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
          <h2 id="section-onsite-info" className="report-section-title" style={{ marginTop: 32 }}>现场情报</h2>
          <EditableField
            value={reportData?.onsiteInfo}
            onSave={html => saveField("onsiteInfo", html)}
            placeholder="记录现场见闻、展台亮点、互动环节等..."
            minHeight={80}
          />
          <h2 id="section-reflections" className="report-section-title" style={{ marginTop: 24 }}>圈内声音</h2>
          <EditableField
            value={reportData?.reflections}
            onSave={html => saveField("reflections", html)}
            placeholder="记录个人感悟与思考..."
            minHeight={80}
          />
          <h2 id="section-rumors" className="report-section-title" style={{ marginTop: 24 }}>深度研判</h2>
          <EditableField
            value={reportData?.rumors}
            onSave={html => saveField("rumors", html)}
            placeholder="记录业界传闻与非公开信息..."
            minHeight={80}
          />
        </div>

        {/* Site Photos Section */}
        <div id="section-site-photos" className="report-site-photos">
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

      {/* Delete session — select session modal */}
      {showDeleteSelect && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteSelect(false)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: "90%" }}>
            <h3 className="delete-confirm-title">选择要删除的 Session</h3>
            <div style={{ maxHeight: 360, overflowY: "auto", margin: "8px 0" }}>
              {activeSessions.map(s => {
                const names = Array.from(s.attendees).map(id => memberMap[id]).filter(Boolean);
                return (
                  <button
                    key={s.code}
                    onClick={() => openDeleteConfirm(s.code, names)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 2,
                      width: "100%", textAlign: "left", padding: "8px 10px",
                      background: "none", border: "none", borderRadius: 6,
                      cursor: "pointer", borderBottom: "1px solid #F0F0F0",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#FFF5F5"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#3D3D3D", fontFamily: "monospace" }}>
                      {s.code}
                    </span>
                    <span style={{ fontSize: 12, color: "#3D3D3D", lineHeight: 1.4 }}>
                      {SESSION_CATALOG.get(s.code)?.title || s.title}
                    </span>
                    {names.length > 0 && (
                      <span style={{ fontSize: 11, color: "#888" }}>贡献人：{names.join("、")}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setShowDeleteSelect(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Panel ────────────────────────────────────────── */}
      {showHistory && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
            onClick={() => { setShowHistory(false); setViewingSnapshot(null); }}
          />
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0,
            width: viewingSnapshot ? "min(80%, 960px)" : "360px",
            background: "#fff", display: "flex", flexDirection: "column",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          }}>
            {/* Panel header */}
            <div style={{
              padding: "14px 20px", borderBottom: "1px solid #E8E8E8",
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}>
              {viewingSnapshot && (
                <button
                  onClick={() => setViewingSnapshot(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#2980B9", padding: "0 8px 0 0" }}
                >
                  ← 返回列表
                </button>
              )}
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, flex: 1 }}>
                {viewingSnapshot ? `快照 · ${viewingSnapshot.label}` : "历史版本"}
              </h2>
              <button
                onClick={() => { setShowHistory(false); setViewingSnapshot(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {!viewingSnapshot ? (
              /* Snapshot list */
              <div style={{ flex: 1, overflowY: "auto" }}>
                {snapshots.length === 0 ? (
                  <p style={{ padding: "32px 20px", color: "#999", textAlign: "center", fontSize: 13 }}>
                    暂无历史快照<br />
                    <span style={{ fontSize: 12 }}>点击「保存」按钮或等待 5 分钟自动生成</span>
                  </p>
                ) : snapshots.map(snap => {
                  const ts = snap.createdAt?.toDate
                    ? snap.createdAt.toDate().toLocaleString("zh-CN")
                    : "时间未知";
                  return (
                    <div key={snap.id} style={{ padding: "12px 20px", borderBottom: "1px solid #F5F5F5" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 15 }}>{snap.type === "manual" ? "📌" : "🕐"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: snap.type === "manual" ? 600 : 400, color: "#3D3D3D" }}>
                            {snap.label}
                          </div>
                          <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>{ts}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setViewingSnapshot(snap)}
                          style={{
                            fontSize: 12, padding: "4px 12px", borderRadius: 5,
                            background: "#F5F5F5", border: "1px solid #E0E0E0", cursor: "pointer", color: "#3D3D3D",
                          }}
                        >
                          查看
                        </button>
                        <button
                          onClick={() => handleRestore(snap)}
                          style={{
                            fontSize: 12, padding: "4px 12px", borderRadius: 5,
                            background: "rgba(207,10,44,0.05)", border: "1px solid rgba(207,10,44,0.2)",
                            cursor: "pointer", color: "#CF0A2C",
                          }}
                        >
                          恢复此版本
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Snapshot viewer with diff */
              <SnapshotViewer snapshot={viewingSnapshot} currentData={reportDataRef.current} />
            )}
          </div>
        </div>
      )}

      {/* Restore confirm modal */}
      {restoreConfirm && (
        <div className="delete-confirm-overlay" onClick={() => setRestoreConfirm(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="delete-confirm-title">确认恢复此版本？</h3>
            <p className="delete-confirm-desc">
              当前内容将被覆盖。恢复前会自动保存当前内容为快照，可随时在历史版本中找回。
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setRestoreConfirm(null)}>取消</button>
              <button className="delete-confirm-submit" onClick={confirmRestore}>确认恢复</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete session confirmation modal */}
      {deleteConfirm.code && (
        <div className="delete-confirm-overlay" onClick={() => setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false })}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="delete-confirm-title">从日报移除此 Session</h3>
            <p className="delete-confirm-desc">
              {deleteConfirm.contributorNames.length > 0
                ? <>请输入该 session 的贡献人姓名（{deleteConfirm.contributorNames.join("、")}）以确认删除。</>
                : <>该 session 无贡献人，请输入任意内容确认删除。</>
              }
            </p>
            <input
              className={`delete-confirm-input${deleteConfirm.error ? " delete-confirm-input--error" : ""}`}
              type="text"
              placeholder="输入姓名..."
              value={deleteConfirm.nameInput}
              autoFocus
              onChange={e => setDeleteConfirm(prev => ({ ...prev, nameInput: e.target.value, error: false }))}
              onKeyDown={e => { if (e.key === "Enter") confirmDeleteSession(); if (e.key === "Escape") setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false }); }}
            />
            {deleteConfirm.error && (
              <p className="delete-confirm-error">姓名不匹配，无法删除</p>
            )}
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setDeleteConfirm({ code: null, contributorNames: [], nameInput: "", error: false })}>取消</button>
              <button className="delete-confirm-submit" onClick={confirmDeleteSession}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
