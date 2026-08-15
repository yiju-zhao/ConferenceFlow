import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
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
  runTransaction,
} from "firebase/firestore";
import { db, storage } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useMembership } from "../../hooks/useMembership";
import { ref, uploadString, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { COLORS, COLOR_PRESETS } from "../../constants";
import { SESSION_CATALOG } from "../../sessionCatalog";
import { parseReportId, generateId } from "../../lib/reportUtils";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";
import { EditableField, BulletEditor } from "./SharedEditors";
import { usePresence } from "./usePresence";
import PresenceBar from "./PresenceBar";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../../i18n/dateUtils";
import huaweiLogo from "../../assets/huawei_logo.png";
import { topicSlug } from "./IntelCard";
import ReportBlockSection from "./ReportBlockSection";
import SpeakersEditor from "./SpeakersEditor";
import AddReportSessionDialog from "./AddReportSessionDialog";
import AiFocusDialog from "./ai/AiFocusDialog";
import AiFieldAction from "./ai/AiFieldAction";
import BlockAiSection from "./ai/BlockAiSection";
import SessionAiSection from "./ai/SessionAiSection";
import ReportSessionCollapseButton from "./editor/ReportSessionCollapseButton";
import SnapshotViewer from "./SnapshotViewer";
import { useBoundReportTemplate } from "../../hooks/useBoundReportTemplate";
import { useDefaultReportTemplateBinding } from "../../hooks/useDefaultReportTemplateBinding";
import {
  readdReportSession,
  reportSessionSpeakers,
  selectedReportSessions,
  sessionKey,
} from "../../lib/ai-report/sessionSelection";
import { requireAuthenticatedUserId } from "../../lib/ai-report/memberFocus";
import {
  blocksWithoutTranscripts,
  insertReportBlock,
  removeReportBlock,
  replaceReportBlock,
} from "../../lib/ai-report/reportBlocks";
import { INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING } from "../../lib/ai-report/templates/industryConferenceDailyReport";
import type {
  BlockField,
  AiBlockField,
  Member,
  Report,
  ReportBlock,
  ReportBlockType,
  ReportIllustration,
  ReportSessionData,
  ReportSnapshot,
  ReportSnapshotData,
  ReportSpeaker,
  Session,
  SitePhoto,
  TemplateFieldValue,
} from "../../types";
import DailyReportEditorShell from "./editor/DailyReportEditorShell";
import DailyReportToolbar from "./editor/DailyReportToolbar";
import type { DailyReportOutlineItem } from "./editor/DailyReportOutline";
import DailyReportSkeleton from "./editor/DailyReportSkeleton";
import ReportShareDialog from "./editor/ReportShareDialog";
import { unwrapReportSectionHeadingRows } from "./reportDom";

// A conference session scoped to a single day's report. `attendees` is
// normalized to a Set for membership lookups (source Session.attendees is an
// array); `code` is required — the report subsystem keys everything on it.
type DailySession = Omit<Session, "attendees" | "code"> & {
  attendees: Set<string>;
  code: string;
};

// A member doc with its display name resolved (members effect always sets
// `name` to a non-empty string).
type ResolvedMember = Member & { name: string };

type SnapshotType = "auto" | "manual";
const EMPTY_REPORT_BLOCKS: ReportBlock[] = [];

interface DailyReportProps {
  viewMode?: boolean;
}

// ── DailyReport ──────────────────────────────────────────────────────────────
export default function DailyReport({ viewMode: viewModeProp = false }: DailyReportProps) {
  const { t, i18n } = useTranslation();
  const { confId, reportId } = useParams() as {
    confId: string;
    reportId: string;
  };
  const { date } = parseReportId(reportId);
  const viewMode =
    viewModeProp || new URLSearchParams(window.location.search).get("preview") === "1";
  const { user } = useAuth();
  const { membership, isAdmin: isConfAdmin } = useMembership(confId);
  const [confName, setConfName] = useState("");
  const [allConferenceSessions, setAllConferenceSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<ResolvedMember[]>([]);
  const [reportData, setReportData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [floatingToolbar, setFloatingToolbar] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState<ReportSnapshot | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<ReportSnapshot | null>(null);
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    code: string | null;
    contributorNames: string[];
    nameInput: string;
    error: boolean;
  }>({
    code: null,
    contributorNames: [],
    nameInput: "",
    error: false,
  });
  const [showDeleteSelect, setShowDeleteSelect] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [showAiFocus, setShowAiFocus] = useState(false);

  const [tocVisible, setTocVisible] = useState(true);
  const [openInlineMenu, setOpenInlineMenu] = useState<string | null>(null);

  useDefaultReportTemplateBinding({
    confId,
    reportId,
    report: reportData,
    enabled: Boolean(user) && !viewMode,
  });

  useEffect(() => {
    const el = document.getElementById("report-toc");
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setTocVisible(entry.isIntersecting), {
      threshold: 0,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const illustInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const sessionDataRef = useRef<Record<string, ReportSessionData>>({});
  const reportDataRef = useRef<Report | null>(null);
  const createSnapshotRef = useRef<((type: SnapshotType) => Promise<void>) | null>(null);
  const lastSnapshotHashRef = useRef<string | null>(null);
  const sitePhotoInputRef = useRef<HTMLInputElement>(null);
  const reportContainerRef = useRef<HTMLDivElement>(null);
  const initDone = useRef(false);
  const collapsedInit = useRef(false);
  const { debouncedSave, flushPending, saveState } = useDebouncedSave(600);

  const saveAiFocus = useCallback(
    async (nextFocus: string) => {
      const userId = requireAuthenticatedUserId(user);
      await setDoc(
        doc(db, "conferences", confId, "members", userId),
        { aiFocus: nextFocus },
        { merge: true },
      );
    },
    [confId, user],
  );

  // Lock body scroll when history panel is open
  useEffect(() => {
    if (!showHistory) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showHistory]);

  // Close inline add menu on outside click or Escape
  useEffect(() => {
    if (!openInlineMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".inline-add-zone")) setOpenInlineMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenInlineMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openInlineMenu]);

  // Snapshots subscription
  useEffect(() => {
    if (!user || !reportId) return;
    const q = query(
      collection(db, "conferences", confId, "dailyReports", reportId, "snapshots"),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setSnapshots(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportSnapshot, "id">) })),
      );
    });
  }, [user, reportId]);

  // 5-minute auto snapshot
  useEffect(() => {
    if (!user || viewMode) return;
    const timer = setInterval(
      () => {
        createSnapshotRef.current?.("auto");
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, [user, viewMode]);

  // Save snapshot on page leave
  useEffect(() => {
    if (!user || viewMode) return;
    const handleBeforeUnload = () => {
      createSnapshotRef.current?.("auto");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user, viewMode]);

  // Conference name
  useEffect(() => {
    if (!confId) return;
    return onSnapshot(doc(db, "conferences", confId), (snap) => {
      setConfName(snap.exists() ? snap.data().name || confId : confId);
    });
  }, [confId]);

  // Members — load with doc ID and resolve display names in parallel
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences", confId, "members"), async (snap) => {
      const { getDoc: gd, doc: dc } = await import("firebase/firestore");
      const arr = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data() as Omit<Member, "id">;
          let name: string | null = data.legacyName || data.displayName || null;
          if (!name && !data.managedByAdmin) {
            try {
              const userSnap = await gd(dc(db, "users", d.id));
              const ud = userSnap.data() as { displayName?: string; email?: string };
              name = userSnap.exists() ? ud.displayName || ud.email || null : d.id;
            } catch {
              name = d.id;
            }
          }
          return { ...data, id: d.id, name: name || d.id };
        }),
      );
      setMembers(arr);
    });
  }, [user, confId]);

  // Conference calendar Sessions
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences", confId, "sessions"), (snap) => {
      const all: Session[] = [];
      snap.forEach((d) => {
        const data = d.data() as Session;
        all.push({ ...data, id: d.id });
      });
      setAllConferenceSessions(all);
    });
  }, [user, confId]);

  // Report data
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "conferences", confId, "dailyReports", reportId), (snap) => {
      setReportData(snap.exists() ? (snap.data() as Report) : null);
      setLoading(false);
    });
  }, [user, reportId]);

  // Auto-init report
  useEffect(() => {
    if (!user || loading || reportData || initDone.current) return;
    initDone.current = true;
    setDoc(doc(db, "conferences", confId, "dailyReports", reportId), {
      date,
      title: "",
      summaryPoints: [],
      onsiteInfo: "",
      reflections: "",
      rumors: "",
      rumorsBlocks: [],
      sitePhotos: [],
      sessions: {},
      topicOrder: [],
      status: "draft",
      ...INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING,
    }).catch(console.error);
  }, [user, loading, reportData, reportId, date, confId]);

  // Keep sessionDataRef and reportDataRef in sync
  const sessionData = reportData?.sessions || {};
  sessionDataRef.current = sessionData;
  reportDataRef.current = reportData;
  const { template, error: templateError } = useBoundReportTemplate(reportData);
  const fieldById = useMemo(
    () => new Map(template?.fields.map((field) => [field.id, field]) ?? []),
    [template],
  );
  const titleField = fieldById.get("title");
  const summaryPointsField = fieldById.get("summaryPoints");
  const onsiteInfoBlocksField = fieldById.get("onsiteInfoBlocks");
  const reflectionsBlocksField = fieldById.get("reflectionsBlocks");
  const rumorsBlocksField = fieldById.get("rumorsBlocks");
  const sessionAiFields =
    template?.fields.filter(
      (field) =>
        field.scope === "session" &&
        field.ai.enabled &&
        field.type !== "fixed" &&
        field.type !== "image",
    ) ?? [];

  // ── Computed ────────────────────────────────────────────────────────────────
  const memberMap = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [members]);

  const memberColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach((m) => {
      map[m.id || m.userId || ""] = m.colorIndex ?? 0;
    });
    return map;
  }, [members]);

  const { activeUsers } = usePresence(confId, reportId);

  const activeSessions = useMemo(
    () =>
      selectedReportSessions(
        allConferenceSessions,
        reportData?.sessions ?? {},
        reportData?.deletedSessions ?? [],
      ).map(
        (session) =>
          ({
            ...session,
            code: sessionKey(session),
            attendees: new Set(session.attendees || []),
          }) as DailySession,
      ),
    [allConferenceSessions, reportData?.sessions, reportData?.deletedSessions],
  );

  const topicsMap = useMemo(() => {
    const map: Record<string, DailySession[]> = {};
    activeSessions.forEach((s) => {
      const cat = SESSION_CATALOG.get(s.code);
      const rawTopic = cat?.topic ? cat.topic.split(" - ").at(-1)?.trim() : null;
      const topic = s.mainTopic?.trim() || cat?.key_themes?.[0] || rawTopic;
      if (!topic) return;
      if (!map[topic]) map[topic] = [];
      map[topic].push(s);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => {
        const tc = a.start.localeCompare(b.start);
        return tc !== 0 ? tc : a.title.localeCompare(b.title);
      }),
    );
    return map;
  }, [activeSessions]);

  const noTopicSessions = useMemo(() => {
    return activeSessions
      .filter((s) => {
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
    const result = saved.filter((t) => allTopics.includes(t));
    allTopics.forEach((t) => {
      if (!result.includes(t)) result.push(t);
    });
    return result;
  }, [topicsMap, reportData]);

  const onsiteInfoBlocks = reportData?.onsiteInfoBlocks ?? EMPTY_REPORT_BLOCKS;
  const reflectionsBlocks = reportData?.reflectionsBlocks ?? EMPTY_REPORT_BLOCKS;
  const rumorsBlocks = reportData?.rumorsBlocks ?? EMPTY_REPORT_BLOCKS;
  const outlineLabel = t("report.toc");
  const relatedTopicsLabel = t("report.relatedTopics");
  const onsiteInfoLabel = t("report.onsiteInfo");
  const reflectionsLabel = t("report.reflections");
  const rumorsLabel = t("report.rumors");
  const siteRecordsLabel = t("report.siteRecords");
  const outlineItems = useMemo<DailyReportOutlineItem[]>(
    () => [
      {
        href: "#section-related",
        label: relatedTopicsLabel,
        children: [
          ...noTopicSessions.map((session) => ({
            href: `#session-${session.code}`,
            label: `${session.code} · ${SESSION_CATALOG.get(session.code)?.title || session.title}`,
          })),
          ...orderedTopics.map((topic) => ({
            href: `#topic-${topicSlug(topic)}`,
            label: topic,
            accent: true,
            children: (topicsMap[topic] || []).map((session) => ({
              href: `#session-${session.code}`,
              label: `${session.code} · ${SESSION_CATALOG.get(session.code)?.title || session.title}`,
            })),
          })),
        ],
      },
      {
        href: "#section-onsite-info",
        label: onsiteInfoLabel,
        children: onsiteInfoBlocks
          .filter((block) => block.type === "heading" && block.content.trim())
          .map((block) => ({ href: `#block-${block.id}`, label: block.content })),
      },
      {
        href: "#section-reflections",
        label: reflectionsLabel,
        children: reflectionsBlocks
          .filter((block) => block.type === "heading" && block.content.trim())
          .map((block) => ({ href: `#block-${block.id}`, label: block.content })),
      },
      {
        href: "#section-rumors",
        label: rumorsLabel,
        children: rumorsBlocks
          .filter((block) => block.type === "heading" && block.content.trim())
          .map((block) => ({ href: `#block-${block.id}`, label: block.content })),
      },
      { href: "#section-site-photos", label: siteRecordsLabel },
    ],
    [
      noTopicSessions,
      orderedTopics,
      topicsMap,
      onsiteInfoBlocks,
      reflectionsBlocks,
      rumorsBlocks,
      relatedTopicsLabel,
      onsiteInfoLabel,
      reflectionsLabel,
      rumorsLabel,
      siteRecordsLabel,
    ],
  );

  // ── Save helpers ────────────────────────────────────────────────────────────
  const saveField = useCallback(
    (field: string, value: unknown) => {
      if (!user || viewMode) return;
      debouncedSave(field, () => {
        return setDoc(
          doc(db, "conferences", confId, "dailyReports", reportId),
          { [field]: value },
          { merge: true },
        ).catch((error: unknown) => {
          console.error(error);
          throw error;
        });
      });
    },
    [user, reportId, debouncedSave, viewMode, confId],
  );

  const addReportSession = useCallback(
    async (key: string) => {
      if (!user || viewMode) return;
      const session = allConferenceSessions.find((item) => sessionKey(item) === key);
      if (!session) throw new Error("calendar Session not found");
      const update = readdReportSession(
        reportDataRef.current?.sessions ?? {},
        reportDataRef.current?.deletedSessions ?? [],
        session,
      );
      await setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        {
          sessions: { [update.key]: update.draft },
          deletedSessions: update.deletedSessions,
        },
        { merge: true },
      );
    },
    [allConferenceSessions, confId, reportId, user, viewMode],
  );

  // ── Block helpers ─────────────────────────────────────────────────────────────
  const persistBlockMutation = useCallback(
    async (field: AiBlockField, mutate: (blocks: ReportBlock[]) => ReportBlock[]) => {
      if (!user || viewMode) throw new Error("report is read-only");
      const reportRef = doc(db, "conferences", confId, "dailyReports", reportId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reportRef);
        if (!snapshot.exists()) throw new Error("report not found");
        const latest = snapshot.data() as Report;
        const blocks = Array.isArray(latest[field]) ? latest[field] : [];
        const next = mutate(blocks);
        transaction.set(reportRef, { [field]: next }, { merge: true });
      });
    },
    [confId, reportId, user, viewMode],
  );

  const persistBlockPatch = useCallback(
    (field: AiBlockField, blockId: string, patch: Partial<ReportBlock>, expectedContent?: string) =>
      persistBlockMutation(field, (blocks) =>
        replaceReportBlock(blocks, blockId, patch, expectedContent),
      ),
    [persistBlockMutation],
  );

  const removeBlock = useCallback(
    (field: BlockField, id: string) => {
      void persistBlockMutation(field, (blocks) => removeReportBlock(blocks, id)).catch(
        () => undefined,
      );
    },
    [persistBlockMutation],
  );
  const insertBlock = useCallback(
    (field: BlockField, type: ReportBlockType, afterId: string | null) => {
      const newBlock: ReportBlock = {
        id: generateId(),
        type,
        content: "",
        ownerId: user?.uid || "",
        contributorIds: user?.uid ? [user.uid] : [],
        lastEditedBy: user?.uid || "",
        lastEditedAt: Date.now(),
      };
      void persistBlockMutation(field, (blocks) =>
        insertReportBlock(blocks, newBlock, afterId),
      ).catch(() => undefined);
    },
    [persistBlockMutation, user],
  );
  const updateBlockFields = useCallback(
    (field: BlockField, id: string, fields: Partial<ReportBlock>) => {
      if (!user || viewMode) return;
      const patchKey = Object.keys(fields).sort().join(",");
      debouncedSave(`block.${field}.${id}.${patchKey}`, () =>
        persistBlockPatch(field, id, {
          ...fields,
          lastEditedBy: user.uid,
          lastEditedAt: Date.now(),
        }),
      );
    },
    [debouncedSave, persistBlockPatch, user, viewMode],
  );

  // ── Snapshot helpers ─────────────────────────────────────────────────────────
  const pruneSnapshots = useCallback(async () => {
    const q = query(
      collection(db, "conferences", confId, "dailyReports", reportId, "snapshots"),
      orderBy("createdAt", "desc"),
      limit(51),
    );
    const snap = await getDocs(q);
    if (snap.docs.length > 50) {
      await deleteDoc(snap.docs[50].ref);
    }
  }, [reportId]);

  const createSnapshot = useCallback(
    async (type: SnapshotType) => {
      if (!user || !reportDataRef.current) return;
      const rd = reportDataRef.current;
      const data: ReportSnapshotData = {
        title: rd.title || "",
        summaryPoints: rd.summaryPoints || [],
        sessions: Object.fromEntries(
          Object.entries(sessionDataRef.current || {}).map(([sessionId, value]) => {
            const { transcriptRef: _transcriptRef, ...snapshotSession } = value;
            return [sessionId, snapshotSession];
          }),
        ),
        topicOrder: rd.topicOrder || [],
        deletedSessions: rd.deletedSessions || [],
        onsiteInfo: rd.onsiteInfo || "",
        reflections: rd.reflections || "",
        rumors: rd.rumors || "",
        onsiteInfoBlocks: blocksWithoutTranscripts(rd.onsiteInfoBlocks || []),
        reflectionsBlocks: blocksWithoutTranscripts(rd.reflectionsBlocks || []),
        rumorsBlocks: blocksWithoutTranscripts(rd.rumorsBlocks || []),
      };
      const hash = JSON.stringify(data);
      // Skip auto snapshots when content hasn't changed since last snapshot
      if (type === "auto" && hash === lastSnapshotHashRef.current) return;
      try {
        await addDoc(collection(db, "conferences", confId, "dailyReports", reportId, "snapshots"), {
          type,
          label: type === "auto" ? t("report.autoSave") : t("report.manualSave"),
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          data,
        });
        lastSnapshotHashRef.current = hash;
        await pruneSnapshots();
      } catch (err) {
        console.error(
          "[Snapshot] Failed to save snapshot:",
          (err as { code?: string }).code,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
    [user, reportId, pruneSnapshots],
  );

  // Keep createSnapshotRef up to date (used by 5-min timer)
  createSnapshotRef.current = createSnapshot;

  const handleSave = async () => {
    await createSnapshot("manual");
  };

  const handleRestore = (snapshot: ReportSnapshot) => {
    setRestoreConfirm(snapshot);
  };

  const confirmRestore = async () => {
    if (!restoreConfirm) return;
    const snapshot = restoreConfirm;
    setRestoreConfirm(null);
    await createSnapshot("manual");
    await setDoc(doc(db, "conferences", confId, "dailyReports", reportId), snapshot.data!, {
      merge: true,
    });
    setShowHistory(false);
    setViewingSnapshot(null);
  };

  const saveSessionField = useCallback(
    (code: string, field: string, value: unknown) => {
      if (!user || viewMode) return;
      debouncedSave(`${code}.${field}`, () => {
        return setDoc(
          doc(db, "conferences", confId, "dailyReports", reportId),
          {
            sessions: {
              [code]: {
                [field]: value,
                lastEditedBy: user.uid,
                lastEditedAt: Date.now(),
              },
            },
          },
          { merge: true },
        ).catch((error: unknown) => {
          console.error(error);
          throw error;
        });
      });
    },
    [user, reportId, debouncedSave, confId, viewMode],
  );

  const saveAiDailyField = useCallback(
    async (fieldId: string, value: TemplateFieldValue) => {
      if (!user || viewMode) throw new Error("report is read-only");
      await setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        { [fieldId]: value },
        { merge: true },
      );
    },
    [confId, reportId, user, viewMode],
  );

  const saveAiSessionFields = useCallback(
    async (sessionId: string, values: Record<string, TemplateFieldValue>) => {
      if (!user || viewMode) throw new Error("report is read-only");
      await setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        {
          sessions: {
            [sessionId]: {
              ...values,
              lastEditedBy: user.uid,
              lastEditedAt: Date.now(),
            },
          },
        },
        { merge: true },
      );
    },
    [confId, reportId, user, viewMode],
  );

  // Speakers: save whole array debounced
  const saveSpeakers = useCallback(
    (code: string, speakers: ReportSpeaker[]) => {
      if (!user) return;
      debouncedSave(`${code}.speakers`, () => {
        setDoc(
          doc(db, "conferences", confId, "dailyReports", reportId),
          {
            sessions: { [code]: { speakers } },
          },
          { merge: true },
        ).catch(console.error);
      });
    },
    [user, reportId, debouncedSave],
  );

  const addSpeaker = useCallback(
    (code: string) => {
      if (!user) return;
      const sd = sessionDataRef.current[code] || {};
      const speakers: ReportSpeaker[] = [
        ...(sd.speakers || []),
        { name: "", position: "", company: "" },
      ];
      setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        {
          sessions: { [code]: { speakers } },
        },
        { merge: true },
      ).catch(console.error);
    },
    [user, reportId],
  );

  const removeSpeaker = useCallback(
    (code: string, idx: number) => {
      if (!user) return;
      const sd = sessionDataRef.current[code] || {};
      const speakers = (sd.speakers || []).filter((_, i) => i !== idx);
      setDoc(
        doc(db, "conferences", confId, "dailyReports", reportId),
        {
          sessions: {
            [code]: {
              speakers: speakers.length ? speakers : [{ name: "", position: "", company: "" }],
            },
          },
        },
        { merge: true },
      ).catch(console.error);
    },
    [user, reportId],
  );

  const openDeleteConfirm = useCallback((code: string, contributorNames: string[]) => {
    setShowDeleteSelect(false);
    setDeleteConfirm({ code, contributorNames, nameInput: "", error: false });
  }, []);

  const confirmDeleteSession = useCallback(() => {
    const { code, contributorNames, nameInput } = deleteConfirm;
    const trimmed = nameInput.trim();
    const valid =
      contributorNames.length === 0
        ? trimmed.length > 0
        : contributorNames.some((n) => n === trimmed);
    if (!valid) {
      setDeleteConfirm((prev) => ({ ...prev, error: true }));
      return;
    }
    const currentDeleted = reportDataRef.current?.deletedSessions || [];
    setDoc(
      doc(db, "conferences", confId, "dailyReports", reportId),
      {
        deletedSessions: [...currentDeleted, code],
      },
      { merge: true },
    ).catch(console.error);
    setDeleteConfirm({
      code: null,
      contributorNames: [],
      nameInput: "",
      error: false,
    });
  }, [deleteConfirm, reportId]);

  const compressImage = useCallback((file: File, maxPx = 1200, quality = 0.75): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = url;
    });
  }, []);

  const uploadToStorage = useCallback(
    async (base64DataUrl: string, path: string): Promise<string> => {
      const storageRef = ref(storage, path);
      await uploadString(storageRef, base64DataUrl, "data_url");
      return getDownloadURL(storageRef);
    },
    [],
  );

  // Normalize illustrations: supports old single string + new array format
  const getIllustrations = useCallback(
    (sd: ReportSessionData & { _code?: string }): ReportIllustration[] => {
      if (Array.isArray(sd.illustrations)) return sd.illustrations;
      if (sd.illustration)
        return [
          {
            url: sd.illustration,
            storagePath: `illustrations/${reportId}/${sd._code}`,
          },
        ];
      return [];
    },
    [reportId],
  );

  const handleIllustration = useCallback(
    (code: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const storagePath = `illustrations/${reportId}/${code}_${Date.now()}`;
      compressImage(file)
        .then((compressed) => uploadToStorage(compressed, storagePath))
        .then((url) => {
          const current = sessionDataRef.current[code] || {};
          const existing: ReportIllustration[] = Array.isArray(current.illustrations)
            ? current.illustrations
            : current.illustration
              ? [
                  {
                    url: current.illustration,
                    storagePath: `illustrations/${reportId}/${code}`,
                  },
                ]
              : [];
          saveSessionField(code, "illustrations", [...existing, { url, storagePath }]);
        });
    },
    [compressImage, uploadToStorage, reportId, saveSessionField],
  );

  const handleIllustrationDelete = useCallback(
    (code: string, idx: number) => {
      const current = sessionDataRef.current[code] || {};
      const existing: ReportIllustration[] = Array.isArray(current.illustrations)
        ? current.illustrations
        : current.illustration
          ? [
              {
                url: current.illustration,
                storagePath: `illustrations/${reportId}/${code}`,
              },
            ]
          : [];
      const item = existing[idx];
      if (item?.storagePath) deleteObject(ref(storage, item.storagePath)).catch(() => {});
      const next = existing.filter((_, i) => i !== idx);
      saveSessionField(code, "illustrations", next);
      // Clear legacy field if present
      if (current.illustration) saveSessionField(code, "illustration", "");
    },
    [reportId, saveSessionField],
  );

  // ── Site Photos handlers ─────────────────────────────────────────────────
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
        deleteObject(ref(storage, photo.storagePath)).catch(() => {});
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
        const photos: SitePhoto[] = [...(reportDataRef.current?.sitePhotos || [])];
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
        const photos: SitePhoto[] = [...(reportDataRef.current?.sitePhotos || [])];
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

  // Extract all CSS text via CSSOM — skips cross-origin sheets silently
  // Export handler for markdown format
  const handleExport = async (format: string) => {
    setExporting(true);

    const prevCollapsed = new Set(collapsedSessions);
    setCollapsedSessions(new Set());
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const container = reportContainerRef.current;
      if (!container) throw new Error("Report container not found");

      // Clone report DOM and strip interactive / UI-only elements
      const clone = container.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll(".no-print, .report-toolbar, .report-nav-bar, .session-collapse-btn")
        .forEach((el) => el.remove());
      unwrapReportSectionHeadingRows(clone);
      clone.querySelectorAll<HTMLElement>(".print-only").forEach((el) => {
        el.style.display = "block";
      });

      let blob: Blob | undefined, filename: string | undefined;

      if (format === "markdown") {
        const { default: TurndownService } = await import("turndown");
        const { gfm } = await import("turndown-plugin-gfm");

        // ── DOM pre-processing ──────────────────────────────────────────
        // 1. Remove empty 关键收获/启示 blocks (heading + empty content)
        clone.querySelectorAll(".report-field-block").forEach((block) => {
          const heading = block.querySelector(".report-field-heading");
          if (!heading) return;
          const bodyText = block.textContent.replace(heading.textContent, "").trim();
          if (!bodyText) block.remove();
        });
        // 1a. Remove entire session cards where all field blocks were empty
        clone.querySelectorAll(".report-session").forEach((session) => {
          if (session.querySelectorAll(".report-field-block").length === 0) {
            session.remove();
          }
        });

        // 1b. Add ids to topic dividers so TOC #topic-* links have targets
        clone.querySelectorAll(".report-topic-divider").forEach((el) => {
          const name = el.querySelector(".report-topic-name")?.textContent.trim() || "";
          if (name)
            el.id =
              "topic-" +
              name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
        });

        // 2. Inject <a id="..."> for all TOC anchor targets
        clone.querySelectorAll("[id]").forEach((el) => {
          const anchor = document.createElement("a");
          anchor.id = el.id;
          el.removeAttribute("id");
          el.insertBefore(anchor, el.firstChild);
        });

        const td = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
          bulletListMarker: "-",
        });
        td.use(gfm);

        // Preserve <a id="..."> anchor tags as raw HTML
        td.addRule("session-anchor", {
          filter: (node) =>
            node.nodeName === "A" && !!node.getAttribute("id") && !node.getAttribute("href"),
          replacement: (_content, node) => `<a id="${node.getAttribute("id")}"></a>`,
        });

        // Session title: merge code + title into one heading (### S82322 — Title)
        td.addRule("session-title", {
          filter: (node) =>
            node.nodeName === "H3" && node.classList.contains("report-session-title"),
          replacement: (content, node) => {
            const codeEl = node
              .closest(".report-session-header")
              ?.querySelector(".report-session-code");
            const code = codeEl ? codeEl.textContent.trim() : "";
            return `\n\n### ${code ? code + " — " : ""}${content.trim()}\n\n`;
          },
        });

        // Suppress standalone session code span (merged into heading above)
        td.addRule("session-code", {
          filter: (node) =>
            node.nodeName === "SPAN" && node.classList.contains("report-session-code"),
          replacement: () => "",
        });

        // Field headings (关键收获 / 启示): render in red
        td.addRule("field-heading", {
          filter: (node) =>
            node.nodeName === "H4" && node.classList.contains("report-field-heading"),
          replacement: (content) =>
            `\n\n<span style="color:#CF0A2C">**${content.trim()}**</span>\n\n`,
        });

        // Topic divider: render as ## heading for visual hierarchy above ### sessions
        td.addRule("topic-divider", {
          filter: (node) => node.classList?.contains("report-topic-divider"),
          replacement: (_content, node) => {
            const name = node.querySelector(".report-topic-name")?.textContent.trim() || "";
            return name ? `\n\n---\n\n## ${name}\n\n` : "";
          },
        });

        // Contributors row: "贡献人: Name1、Name2"
        td.addRule("contributors-row", {
          filter: (node) => node.classList?.contains("report-contributors-row"),
          replacement: (_content, node) => {
            const label =
              node.querySelector(".report-contributors-label")?.textContent.trim() ||
              t("report.contributorLabel");
            const names =
              node.querySelector(".report-contributors-names")?.textContent.trim() || "";
            return names ? `\n\n${label}: ${names}\n\n` : "";
          },
        });

        // Intel card meta rows (来源 / 贡献人 inside onsite/reflections intel cards)
        td.addRule("intel-card-meta-row", {
          filter: (node) =>
            node.nodeName === "DIV" &&
            node.classList.contains("intel-card-section") &&
            !!node.querySelector(".intel-card-label"),
          replacement: (_content, node) => {
            const label = node.querySelector(".intel-card-label")?.textContent?.trim();
            if (!label) return _content;
            // _content contains label text + Turndown-processed value (with markdown links)
            const valueMarkdown = _content.replace(label, "").trim();
            return valueMarkdown ? `\n\n*${label}:* ${valueMarkdown}\n\n` : "";
          },
        });

        const frontmatter = `---\ntitle: ${confName || "Conference"} ${t("report.dailyReportTitle", { date })}\ndate: ${date}\n---\n\n`;
        const md = frontmatter + td.turndown(clone.outerHTML);
        blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        filename = `GTC2026_report_${date}.md`;
      }

      if (!blob || !filename) throw new Error(`Unsupported export format: ${format}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("[Export] Failed:", err);
      alert(
        t("report.exportFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setCollapsedSessions(prevCollapsed);
      setExporting(false);
    }
  };

  // Collapse init: populated Sessions start collapsed only in the editor.
  useEffect(() => {
    if (!reportData || collapsedInit.current) return;
    collapsedInit.current = true;
    const initial = viewMode
      ? new Set<string>()
      : new Set(
          activeSessions
            .filter((s) => {
              const sd = reportData.sessions?.[s.code];
              return sd?.takeaways && sd.takeaways !== "";
            })
            .map((s) => s.code),
        );
    setCollapsedSessions(initial);
  }, [activeSessions, reportData, viewMode]);

  const toggleCollapse = useCallback((code: string) => {
    setCollapsedSessions((prev) => {
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
      const updatedMap: Record<string, ReportSessionData> = {};
      let syncedCount = 0;
      activeSessions.forEach((s) => {
        const existing = sessionDataRef.current[s.code] || {};
        const info = SESSION_CATALOG.get(s.code);
        if (info && info.speakers && info.speakers.length > 0) {
          updatedMap[s.code] = {
            ...existing,
            speakers: info.speakers.map((sp) => ({
              name: sp.name || "",
              position: sp.title || "",
              company: sp.company || "",
            })),
          };
          syncedCount++;
        }
      });
      if (syncedCount === 0) {
        setSyncMsg(t("report.noMatchingCatalog"));
      } else {
        await setDoc(
          doc(db, "conferences", confId, "dailyReports", reportId),
          { sessions: updatedMap },
          { merge: true },
        );
        setSyncMsg(t("report.syncedSessions", { count: syncedCount }));
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncMsg(t("report.syncFailed"));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 3000);
    }
  };

  // Publish: generate full HTML, upload to Firebase Storage, return share URL
  const handlePublish = async ({ silent = false }: { silent?: boolean } = {}): Promise<
    string | undefined
  > => {
    setPublishing(true);

    const prevCollapsed = new Set(collapsedSessions);
    setCollapsedSessions(new Set());
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const container = reportContainerRef.current;
      if (!container) throw new Error("Report container not found");

      const clone = container.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll(
          ".no-print, .report-toolbar, .report-nav-bar, .session-collapse-btn, .subtitle-toggle-btn",
        )
        .forEach((el) => el.remove());
      unwrapReportSectionHeadingRows(clone);
      clone.querySelectorAll<HTMLElement>(".print-only").forEach((el) => {
        el.classList.remove("print-only");
        // Use flex for meta rows (label + value inline), block for everything else
        el.style.display = el.classList.contains("intel-card-meta") ? "flex" : "block";
      });
      clone.querySelectorAll("[contenteditable]").forEach((el) => {
        el.removeAttribute("contenteditable");
      });
      // Strip inline styles from category title spans (can accumulate from rich-text paste)
      clone.querySelectorAll(".onsite-category-title").forEach((el) => {
        el.textContent = el.textContent;
      });
      // Remove empty field blocks (关键收获 / 启示) from published HTML
      clone.querySelectorAll(".report-field-block").forEach((block) => {
        const heading = block.querySelector(".report-field-heading");
        if (!heading) return;
        const bodyText = (block.textContent ?? "").replace(heading.textContent ?? "", "").trim();
        if (!bodyText) block.remove();
      });
      // Remove entire session cards where all field blocks were empty
      clone.querySelectorAll(".report-session").forEach((session) => {
        if (session.querySelectorAll(".report-field-block").length === 0) {
          session.remove();
        }
      });
      // Convert form fields to static text (before removing interactive elements)
      const origCaptions = container.querySelectorAll<HTMLTextAreaElement>(".site-photo-caption");
      const clonedCaptions = clone.querySelectorAll<HTMLTextAreaElement>(".site-photo-caption");
      origCaptions.forEach((orig, i) => {
        const cloned = clonedCaptions[i];
        if (!cloned) return;
        const p = document.createElement("p");
        p.className = cloned.className;
        p.textContent = orig.value;
        cloned.parentNode!.replaceChild(p, cloned);
      });

      const origSources = container.querySelectorAll<HTMLInputElement>(".site-photo-source");
      const clonedSources = clone.querySelectorAll<HTMLInputElement>(".site-photo-source");
      origSources.forEach((orig, i) => {
        const cloned = clonedSources[i];
        if (!cloned) return;
        const p = document.createElement("p");
        p.className = cloned.className;
        p.textContent = orig.value;
        cloned.parentNode!.replaceChild(p, cloned);
      });

      // Convert bullet-editor textareas to static text
      const origBullets = container.querySelectorAll<HTMLTextAreaElement>(".bullet-input");
      const clonedBullets = clone.querySelectorAll<HTMLTextAreaElement>(".bullet-input");
      origBullets.forEach((orig, i) => {
        const cloned = clonedBullets[i];
        if (!cloned) return;
        const span = document.createElement("span");
        span.className = cloned.className;
        span.textContent = orig.value;
        cloned.parentNode!.replaceChild(span, cloned);
      });

      // Remove any remaining interactive elements
      clone.querySelectorAll("button, input, textarea, select").forEach((el) => el.remove());

      const styleTagsHtml = (
        await Promise.all(
          Array.from(
            document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
              'link[rel="stylesheet"], style',
            ),
          ).map(async (el) => {
            if (el.tagName === "LINK") {
              try {
                const href = new URL(el.getAttribute("href") || "", window.location.href).href;
                const css = await fetch(href).then((r) => r.text());
                return `<style>${css}</style>`;
              } catch {
                return "";
              }
            }
            return el.outerHTML;
          }),
        )
      ).join("\n");

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTC2026 Report ${date}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
${styleTagsHtml}
<style>
  body { background: #fff; color: #111; }
  .report-container { max-width: 900px; margin: 0 auto; padding: 24px; }
  .report-page, .report-container, body {
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "微软雅黑", sans-serif !important;
  }
  /* Read-only overrides for published view */
  .report-editable { pointer-events: none; border-color: transparent !important; background: transparent !important; }
  .report-editable:hover, .report-editable:focus { border-color: transparent !important; background: transparent !important; }
  .report-inline-editable { pointer-events: none; border-bottom-color: transparent !important; }
  /* Keep TOC links clickable */
  .report-toc-link { pointer-events: auto !important; cursor: pointer !important; }
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`;

      const fileId = String(Date.now());
      const storageRef = ref(storage, `published-reports/${date}/${fileId}.html`);
      await uploadString(storageRef, html, "raw", {
        contentType: "text/html; charset=utf-8",
      });

      // Prune: keep only the latest 100 published reports for this date
      const dirRef = ref(storage, `published-reports/${date}`);
      const { items } = await listAll(dirRef);
      if (items.length > 100) {
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
        const toDelete = sorted.slice(0, items.length - 100);
        await Promise.all(toDelete.map((item) => deleteObject(item)));
      }

      const url = `${window.location.origin}/view/${date}/${fileId}`;
      setShareUrl(url);
      if (silent) return url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Publish] Failed:", msg);
      alert(t("report.publishFailed", { error: msg }));
    } finally {
      setCollapsedSessions(prevCollapsed);
      setPublishing(false);
    }
  };

  function escapeHtml(str: string | null | undefined): string {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const handleEmailExport = async () => {
    let url: string | undefined = shareUrl ?? undefined;
    if (!url) {
      url = await handlePublish({ silent: true });
      if (!url) return;
    }

    const title = reportData?.title || t("report.dailyReportTitle", { date });
    const points = (reportData?.summaryPoints || []).filter(Boolean);
    const pointsHtml = points.length
      ? points
          .map(
            (p) =>
              `<li style="margin:0 0 8px; color:#333; font-size:15px; line-height:1.6;">${escapeHtml(p)}</li>`,
          )
          .join("")
      : `<li style="color:#888; font-size:15px;">${escapeHtml(t("report.noKeyPoints"))}</li>`;

    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  @media only screen and (max-width:620px){
    .email-wrapper{width:100%!important;}
    .email-card{border-radius:0!important;}
    .email-btn{display:block!important;width:auto!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f6;font-family:Arial,'Noto Sans SC',sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">GTC2026 ${escapeHtml(title)} — ${escapeHtml(t("report.emailSubjectPreview"))}</span>
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:24px 16px;">
  <table class="email-card" width="600" cellpadding="0" cellspacing="0" border="0"
    style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <!-- Header bar -->
    <tr><td style="background:#C41E3A;padding:14px 28px;">
      <p style="margin:0;color:#fff;font-size:11px;letter-spacing:3px;font-weight:bold;">${escapeHtml(confName || "Conference")} · DAILY BRIEFING</p>
    </td></tr>
    <!-- Title + date -->
    <tr><td style="padding:28px 28px 12px;">
      <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#1a1a1a;">${escapeHtml(title)}</h1>
      <p style="margin:0;font-size:13px;color:#999;">${escapeHtml(date)}</p>
    </td></tr>
    <!-- Divider -->
    <tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #eee;margin:0;"></td></tr>
    <!-- 核心要点 -->
    <tr><td style="padding:20px 28px 8px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#C41E3A;">${escapeHtml(t("report.emailCorePoints"))}</p>
      <ul style="margin:0;padding:0 0 0 18px;">${pointsHtml}</ul>
    </td></tr>
    <!-- CTA button -->
    <tr><td align="center" style="padding:28px;">
      <a class="email-btn" href="${url}"
        style="display:inline-block;background:#C41E3A;color:#ffffff;font-size:15px;font-weight:bold;
               text-decoration:none;padding:14px 36px;border-radius:5px;letter-spacing:0.5px;">
        ${escapeHtml(t("report.viewFullReport"))}
      </a>
    </td></tr>
    <!-- Footer -->
    <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#bbb;">${escapeHtml(confName || "Conference")} Daily Report · ${escapeHtml(date)}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html; charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `GTC2026_report_email_${date}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Toolbar — execCommand has no modern replacement for contenteditable rich-text
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const execCmd = (cmd: string, val?: string) => document.execCommand(cmd, false, val);
  const execBold = () => execCmd("bold");
  const execColor = (color: string) => {
    execCmd("foreColor", color);
  };

  // Floating formatting toolbar on text selection
  useEffect(() => {
    if (viewMode) return;
    const handleSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setFloatingToolbar(null);
        return;
      }
      // Only show if selection is inside an editable element
      const range = sel.getRangeAt(0);
      const container = reportContainerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setFloatingToolbar(null);
        return;
      }
      // Check if selection is within a contenteditable element
      let node: Node | null = range.commonAncestorContainer;
      let inEditable = false;
      while (node && node !== container) {
        if (node.nodeType === 1 && (node as Element).getAttribute("contenteditable") === "true") {
          inEditable = true;
          break;
        }
        node = node.parentNode;
      }
      if (!inEditable) {
        setFloatingToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setFloatingToolbar({
        top: rect.top + window.scrollY - 44,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    };
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, [viewMode]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return <DailyReportSkeleton viewMode={viewMode} />;

  // ── Render ──────────────────────────────────────────────────────────────────
  const toolbar = (
    <DailyReportToolbar
      backTo={`/conference/${confId}/reports`}
      title={reportData?.title || t("report.dailyReportTitle", { date })}
      status={reportData?.status === "published" ? "published" : "draft"}
      saveState={saveState}
      presence={
        <PresenceBar
          activeUsers={activeUsers}
          memberColorMap={memberColorMap}
          currentUid={user?.uid}
        />
      }
      focusHint={membership?.aiFocus || t("report.ai.noAiFocus")}
      exporting={exporting}
      publishing={publishing}
      syncing={syncing}
      syncMessage={syncMsg}
      onSave={() => void handleSave()}
      onOpenFocus={() => setShowAiFocus(true)}
      onPreview={() => window.open(`/conference/${confId}/report/${reportId}?preview=1`, "_blank")}
      onPublish={() => void handlePublish()}
      onExportMarkdown={() => void handleExport("markdown")}
      onExportEmail={handleEmailExport}
      onOpenHistory={() => setShowHistory(true)}
      onSync={() => void handleSyncFromCatalog()}
      onDeleteSession={() => setShowDeleteSelect(true)}
    />
  );
  const status = templateError ? (
    <p className="no-print ai-report-error" role="status">
      {t("report.ai.templateError")}
    </p>
  ) : null;
  const leadingOverlays = (
    <>
      {/* ── Floating formatting toolbar (appears on text selection) ── */}
      {!viewMode && floatingToolbar && (
        <div
          className="no-print report-format-toolbar"
          style={{
            top: floatingToolbar.top,
            left: floatingToolbar.left,
          }}
          onMouseDown={(e) => e.preventDefault()} /* prevent losing selection */
        >
          <button
            className="report-format-action report-format-action--bold"
            onMouseDown={(e) => {
              e.preventDefault();
              execBold();
            }}
            title={t("report.bold")}
          >
            B
          </button>
          <button
            className="report-format-action report-format-action--italic"
            onMouseDown={(e) => {
              e.preventDefault();
              execCmd("italic");
            }}
            title={t("report.italic")}
          >
            I
          </button>
          <button
            className="report-format-action report-format-action--underline"
            onMouseDown={(e) => {
              e.preventDefault();
              execCmd("underline");
            }}
            title={t("report.underline")}
          >
            U
          </button>
          <div className="report-format-divider" />
          {COLOR_PRESETS.map((c, index) => (
            <button
              key={c}
              className={`report-format-action report-format-color report-format-color--${index}`}
              onMouseDown={(e) => {
                e.preventDefault();
                execColor(c);
              }}
              title={c}
            />
          ))}
        </div>
      )}

      <AiFocusDialog
        open={showAiFocus}
        value={membership?.aiFocus ?? ""}
        onSave={saveAiFocus}
        onClose={() => setShowAiFocus(false)}
      />

      {/* ── Share Modal ──────────────────────────────────────────── */}
      {!viewMode && shareUrl && (
        <ReportShareDialog
          url={shareUrl}
          copied={urlCopied}
          onClose={() => {
            setShareUrl(null);
            setUrlCopied(false);
          }}
          onCopy={() => {
            navigator.clipboard.writeText(shareUrl);
            setUrlCopied(true);
            setTimeout(() => setUrlCopied(false), 2000);
          }}
        />
      )}
    </>
  );

  const reportDocument = (
    <div className="report-container" ref={reportContainerRef}>
      {/* Title bar */}
      <div
        className="report-title-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="report-title-eyebrow">{confName || "CONFERENCE"} · DAILY BRIEFING</div>
          <h1>
            {viewMode ? (
              <span>{reportData?.title || t("report.dailyReportTitle", { date })}</span>
            ) : (
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => saveField("title", e.currentTarget.textContent.trim() || "")}
              >
                {reportData?.title || t("report.dailyReportTitle", { date })}
              </span>
            )}
          </h1>
          {!viewMode && template && titleField && user ? (
            <div className="report-title-ai no-print">
              <AiFieldAction
                confId={confId}
                reportId={reportId}
                templateHash={template.templateHash}
                field={titleField}
                focus={membership?.aiFocus ?? ""}
                getCurrentValue={() => reportDataRef.current?.title}
                flushPending={flushPending}
                onSave={(value) => saveAiDailyField("title", value)}
              />
            </div>
          ) : null}
        </div>
        <img
          src={huaweiLogo}
          alt="Huawei"
          style={{
            height: 28,
            opacity: 0.9,
            flexShrink: 0,
            filter: "brightness(0) invert(1)",
          }}
        />
      </div>

      {/* Header: TOC + Summary */}
      <div className="report-header">
        {/* TOC – organized by topic, drag-to-reorder */}
        <div className="report-toc" id="report-toc">
          <h2 className="report-section-title">{t("report.toc")}</h2>
          <ul className="report-toc-list">
            <li className="report-toc-section-item">
              <a href="#section-related" className="report-toc-link report-toc-section-link">
                <span className="report-toc-title">{t("report.relatedTopics")}</span>
              </a>
              {orderedTopics.length > 0 && (
                <ul className="report-toc-sublist">
                  {orderedTopics.map((topic) => (
                    <li key={topic}>
                      <a
                        href={`#topic-${topicSlug(topic)}`}
                        className="report-toc-link report-toc-cat-link"
                      >
                        <span className="report-toc-title" style={{ color: "var(--brand)" }}>
                          {topic}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
            <li className="report-toc-section-item">
              <a href="#section-onsite-info" className="report-toc-link report-toc-section-link">
                <span className="report-toc-title">{t("report.onsiteInfo")}</span>
              </a>
              {(reportData?.onsiteInfoBlocks || []).filter((b) => b.type === "heading" && b.content)
                .length > 0 && (
                <ul className="report-toc-sublist">
                  {(reportData?.onsiteInfoBlocks || [])
                    .filter((b) => b.type === "heading" && b.content)
                    .map((block) => (
                      <li key={block.id}>
                        <a
                          href={`#block-${block.id}`}
                          className="report-toc-link report-toc-cat-link"
                        >
                          <span className="report-toc-title" style={{ color: "var(--brand)" }}>
                            {block.content}
                          </span>
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </li>
            <li className="report-toc-section-item">
              <a href="#section-reflections" className="report-toc-link report-toc-section-link">
                <span className="report-toc-title">{t("report.reflections")}</span>
              </a>
              {(reportData?.reflectionsBlocks || []).filter(
                (b) => b.type === "heading" && b.content,
              ).length > 0 && (
                <ul className="report-toc-sublist">
                  {(reportData?.reflectionsBlocks || [])
                    .filter((b) => b.type === "heading" && b.content)
                    .map((block) => (
                      <li key={block.id}>
                        <a
                          href={`#block-${block.id}`}
                          className="report-toc-link report-toc-cat-link"
                        >
                          <span className="report-toc-title" style={{ color: "var(--brand)" }}>
                            {block.content}
                          </span>
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </li>
            <li className="report-toc-section-item">
              <a href="#section-rumors" className="report-toc-link report-toc-section-link">
                <span className="report-toc-title">{t("report.rumors")}</span>
              </a>
            </li>
            <li className="report-toc-section-item">
              <a href="#section-site-photos" className="report-toc-link report-toc-section-link">
                <span className="report-toc-title">{t("report.siteRecords")}</span>
              </a>
            </li>
          </ul>
        </div>

        {/* Summary */}
        <div className="report-summary">
          {viewMode ? (
            <h2 className="report-section-title">{t("report.corePoints")}</h2>
          ) : (
            <div className="report-section-heading-row">
              <h2 className="report-section-title">{t("report.corePoints")}</h2>
              {template && summaryPointsField && user ? (
                <AiFieldAction
                  confId={confId}
                  reportId={reportId}
                  templateHash={template.templateHash}
                  field={summaryPointsField}
                  focus={membership?.aiFocus ?? ""}
                  getCurrentValue={() => reportDataRef.current?.summaryPoints}
                  flushPending={flushPending}
                  onSave={(value) => saveAiDailyField("summaryPoints", value)}
                />
              ) : null}
            </div>
          )}
          <BulletEditor
            points={reportData?.summaryPoints}
            onSave={(pts) => saveField("summaryPoints", pts)}
            placeholder={t("report.coreKeyPoints")}
            readOnly={viewMode}
          />
        </div>
      </div>

      {/* Session Reports – organized by topic */}
      <div id="section-related" className="report-sessions">
        {viewMode ? (
          <h2 className="report-section-title" style={{ marginTop: 32 }}>
            {t("report.relatedTopics")}
          </h2>
        ) : (
          <div className="report-section-heading-row" style={{ marginTop: 32 }}>
            <h2 className="report-section-title">{t("report.relatedTopics")}</h2>
            <button
              className="no-print btn-ghost report-section-add-action"
              onClick={() => setShowAddSession(true)}
            >
              {t("report.addSession")}
            </button>
          </div>
        )}

        {noTopicSessions.map((session) => {
          const sd = sessionData[session.code] || {};
          // In preview/viewMode, skip sessions with no content
          if (
            viewMode &&
            !sd.takeaways?.replace(/<[^>]*>/g, "").trim() &&
            !sd.insights?.replace(/<[^>]*>/g, "").trim()
          )
            return null;
          const speakers = reportSessionSpeakers(session, sd, Boolean(reportData?.templateId));
          const isCollapsed = !viewMode && collapsedSessions.has(session.code);
          return (
            <div key={session.code} id={`session-${session.code}`} className="report-session">
              <div
                className="report-session-header"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      marginBottom: isCollapsed ? 0 : 6,
                    }}
                  >
                    <span
                      className="report-session-code"
                      style={{ marginBottom: 0, flexShrink: 0 }}
                    >
                      {session.code}
                    </span>
                    <h3 className="report-session-title" style={{ margin: 0 }}>
                      {SESSION_CATALOG.get(session.code)?.url ? (
                        <a
                          href={SESSION_CATALOG.get(session.code)?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "inherit", textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                        >
                          {SESSION_CATALOG.get(session.code)?.title || session.title}
                        </a>
                      ) : (
                        SESSION_CATALOG.get(session.code)?.title || session.title
                      )}
                    </h3>
                  </div>
                  {!isCollapsed && (
                    <div className="report-session-time">
                      {session.start}–{session.end}
                      {session.room && ` | ${session.room}`}
                    </div>
                  )}
                </div>
                {!viewMode ? (
                  <ReportSessionCollapseButton
                    collapsed={isCollapsed}
                    sessionLabel={`${session.code} · ${SESSION_CATALOG.get(session.code)?.title || session.title}`}
                    onToggle={() => toggleCollapse(session.code)}
                  />
                ) : null}
              </div>
              {!isCollapsed && (
                <>
                  <div className="report-session-meta">
                    <SpeakersEditor
                      code={session.code}
                      speakers={speakers}
                      onUpdate={(newSpeakers) => saveSpeakers(session.code, newSpeakers)}
                      onAdd={() => addSpeaker(session.code)}
                      onRemove={(idx) => removeSpeaker(session.code, idx)}
                      readOnly={viewMode || Boolean(reportData?.templateId)}
                    />
                  </div>
                  <div style={{ padding: "6px 20px 0" }}>
                    {(() => {
                      const illus = getIllustrations({
                        ...sd,
                        _code: session.code,
                      });
                      return (
                        <>
                          {illus.length > 0 && (
                            <div className="session-illustrations-grid">
                              {illus.map((item, i) => (
                                <div key={i} className="session-illustration-item">
                                  <img
                                    src={item.url}
                                    className="session-illustration"
                                    alt={t("report.illustrationAlt", {
                                      index: i + 1,
                                    })}
                                  />
                                  <button
                                    className="no-print session-illustration-del"
                                    onClick={() => handleIllustrationDelete(session.code, i)}
                                  >
                                    {t("report.deleteBtn")}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            className="no-print"
                            onClick={() => illustInputRefs.current[session.code]?.click()}
                            style={{
                              fontSize: 11,
                              color: "var(--text-placeholder)",
                              border: "1px dashed #DDDDDD",
                              background: "none",
                              cursor: "pointer",
                              padding: "5px 0",
                              borderRadius: 4,
                              display: "block",
                              textAlign: "center",
                              width: "100%",
                              marginTop: illus.length > 0 ? 6 : 0,
                            }}
                          >
                            {t("report.addIllustration")}
                          </button>
                        </>
                      );
                    })()}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      ref={(el) => {
                        illustInputRefs.current[session.code] = el;
                      }}
                      onChange={(e) => handleIllustration(session.code, e)}
                    />
                  </div>
                  <div className="report-session-body">
                    {template && user && (
                      <SessionAiSection
                        confId={confId}
                        reportId={reportId}
                        sessionId={session.code}
                        templateHash={template.templateHash}
                        fields={sessionAiFields}
                        focus={membership?.aiFocus ?? ""}
                        uid={user.uid}
                        transcriptRef={sd.transcriptRef}
                        flushPending={flushPending}
                        getLatestValues={() =>
                          (reportDataRef.current?.sessions?.[session.code] ?? {}) as Record<
                            string,
                            unknown
                          >
                        }
                        onSaveFields={saveAiSessionFields}
                        readOnly={viewMode}
                      />
                    )}
                    <div className="report-field-block">
                      <h4 className="report-field-heading report-field-heading--highlight">
                        {t("report.keyTakeaways")}
                      </h4>
                      <EditableField
                        value={sd.takeaways}
                        onSave={(html) => saveSessionField(session.code, "takeaways", html)}
                        placeholder={t("report.recordKeyTakeaways")}
                        readOnly={viewMode}
                      />
                    </div>
                    <div className="report-field-block">
                      <h4 className="report-field-heading report-field-heading--highlight">
                        {t("report.insightsLabel")}
                      </h4>
                      <EditableField
                        value={sd.insights}
                        onSave={(html) => saveSessionField(session.code, "insights", html)}
                        placeholder={t("report.recordInsights")}
                        readOnly={viewMode}
                      />
                    </div>
                    <div
                      className="report-contributors-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingTop: 8,
                        borderTop: "1px solid #eee",
                        marginTop: 8,
                      }}
                    >
                      <span style={{ fontSize: 10, color: "#5f5e5e" }}>
                        {t("report.contributorLabel")}
                      </span>
                      {Array.from(session.attendees || []).map((id) => {
                        const name = memberMap[id];
                        if (!name) return null;
                        const colorIdx = memberColorMap[id] ?? 0;
                        const color = COLORS[colorIdx]?.hex || "#5f5e5e";
                        return (
                          <span
                            key={id}
                            style={{
                              background: color,
                              color: "#fff",
                              padding: "1px 8px",
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          >
                            {name}
                          </span>
                        );
                      })}
                      {sd.lastEditedBy &&
                        (() => {
                          const editorName = memberMap[sd.lastEditedBy] || "";
                          const ago = sd.lastEditedAt
                            ? Math.round((Date.now() - sd.lastEditedAt) / 60000)
                            : null;
                          if (!editorName) return null;
                          return (
                            <span
                              style={{
                                marginLeft: "auto",
                                fontSize: 10,
                                color: "#bbb",
                              }}
                            >
                              edited {ago !== null && ago < 60 ? `${ago}m ago` : ""} by {editorName}
                            </span>
                          );
                        })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {orderedTopics.map((topic) => (
          <div key={topic}>
            {/* Topic section header */}
            <div className="report-topic-divider" id={`topic-${topicSlug(topic)}`}>
              <span className="report-topic-bar" />
              <span className="report-topic-name">{topic}</span>
              <span className="report-topic-line" />
            </div>

            {(topicsMap[topic] || []).map((session) => {
              const sd = sessionData[session.code] || {};
              const speakers = reportSessionSpeakers(session, sd, Boolean(reportData?.templateId));
              const contributorNames = Array.from(session.attendees)
                .map((id) => memberMap[id])
                .filter(Boolean);
              const contributors = contributorNames.join("、");

              const isCollapsed = !viewMode && collapsedSessions.has(session.code);
              return (
                <div key={session.code} id={`session-${session.code}`} className="report-session">
                  {/* Session Header */}
                  <div
                    className="report-session-header"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 10,
                          marginBottom: isCollapsed ? 0 : 6,
                        }}
                      >
                        <span
                          className="report-session-code"
                          style={{ marginBottom: 0, flexShrink: 0 }}
                        >
                          {session.code}
                        </span>
                        <h3 className="report-session-title" style={{ margin: 0 }}>
                          {SESSION_CATALOG.get(session.code)?.url ? (
                            <a
                              href={SESSION_CATALOG.get(session.code)?.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: "inherit",
                                textDecoration: "none",
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.textDecoration = "underline")
                              }
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                            >
                              {SESSION_CATALOG.get(session.code)?.title || session.title}
                            </a>
                          ) : (
                            SESSION_CATALOG.get(session.code)?.title || session.title
                          )}
                        </h3>
                      </div>
                      {!isCollapsed && (
                        <div className="report-session-time">
                          {session.start}–{session.end}
                          {session.room && ` | ${session.room}`}
                        </div>
                      )}
                    </div>
                    {!viewMode ? (
                      <ReportSessionCollapseButton
                        collapsed={isCollapsed}
                        sessionLabel={`${session.code} · ${SESSION_CATALOG.get(session.code)?.title || session.title}`}
                        onToggle={() => toggleCollapse(session.code)}
                      />
                    ) : null}
                  </div>

                  {!isCollapsed && (
                    <>
                      {/* Speakers */}
                      <div className="report-session-meta">
                        <SpeakersEditor
                          code={session.code}
                          speakers={speakers}
                          onUpdate={(newSpeakers) => saveSpeakers(session.code, newSpeakers)}
                          onAdd={() => addSpeaker(session.code)}
                          onRemove={(idx) => removeSpeaker(session.code, idx)}
                          readOnly={viewMode || Boolean(reportData?.templateId)}
                        />
                      </div>

                      {/* Illustration */}
                      <div style={{ padding: "6px 20px 0" }}>
                        {(() => {
                          const illus = getIllustrations({
                            ...sd,
                            _code: session.code,
                          });
                          return (
                            <>
                              {illus.length > 0 && (
                                <div className="session-illustrations-grid">
                                  {illus.map((item, i) => (
                                    <div key={i} className="session-illustration-item">
                                      <img
                                        src={item.url}
                                        className="session-illustration"
                                        alt={t("report.illustrationAlt", {
                                          index: i + 1,
                                        })}
                                      />
                                      <button
                                        className="no-print session-illustration-del"
                                        onClick={() => handleIllustrationDelete(session.code, i)}
                                      >
                                        {t("report.deleteBtn")}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button
                                className="no-print"
                                onClick={() => illustInputRefs.current[session.code]?.click()}
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-placeholder)",
                                  border: "1px dashed #DDDDDD",
                                  background: "none",
                                  cursor: "pointer",
                                  padding: "5px 0",
                                  borderRadius: 4,
                                  display: "block",
                                  textAlign: "center",
                                  width: "100%",
                                  marginTop: illus.length > 0 ? 6 : 0,
                                }}
                              >
                                {t("report.addIllustration")}
                              </button>
                            </>
                          );
                        })()}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          ref={(el) => {
                            illustInputRefs.current[session.code] = el;
                          }}
                          onChange={(e) => handleIllustration(session.code, e)}
                        />
                      </div>

                      {/* Body: takeaways & insights */}
                      <div className="report-session-body">
                        {template && user && (
                          <SessionAiSection
                            confId={confId}
                            reportId={reportId}
                            sessionId={session.code}
                            templateHash={template.templateHash}
                            fields={sessionAiFields}
                            focus={membership?.aiFocus ?? ""}
                            uid={user.uid}
                            transcriptRef={sd.transcriptRef}
                            flushPending={flushPending}
                            getLatestValues={() =>
                              (reportDataRef.current?.sessions?.[session.code] ?? {}) as Record<
                                string,
                                unknown
                              >
                            }
                            onSaveFields={saveAiSessionFields}
                            readOnly={viewMode}
                          />
                        )}
                        <div className="report-field-block">
                          <h4 className="report-field-heading report-field-heading--highlight">
                            {t("report.keyTakeaways")}
                          </h4>
                          <EditableField
                            value={sd.takeaways}
                            onSave={(html) => saveSessionField(session.code, "takeaways", html)}
                            placeholder={t("report.recordKeyTakeaways")}
                            readOnly={viewMode}
                          />
                        </div>
                        <div className="report-field-block">
                          <h4 className="report-field-heading report-field-heading--highlight">
                            {t("report.insightsLabel")}
                          </h4>
                          <EditableField
                            value={sd.insights}
                            onSave={(html) => saveSessionField(session.code, "insights", html)}
                            placeholder={t("report.recordInsights")}
                            readOnly={viewMode}
                          />
                        </div>

                        {/* 贡献人 at the end */}
                        {contributors && (
                          <div className="report-contributors-row">
                            <span className="report-contributors-label">
                              {t("report.contributorLabel")}
                            </span>
                            <span className="report-contributors-names">{contributors}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Onsite Section */}
      <div className="report-onsite">
        <ReportBlockSection
          sectionId="section-onsite-info"
          title={t("report.onsiteInfo")}
          titleStyle={{ marginTop: 32 }}
          field="onsiteInfoBlocks"
          blocks={reportData?.onsiteInfoBlocks || []}
          members={members}
          currentUid={user?.uid}
          isAdmin={isConfAdmin}
          readOnly={viewMode}
          memberColorMap={memberColorMap}
          conferenceSessions={allConferenceSessions}
          openInlineMenu={openInlineMenu}
          onOpenInlineMenu={setOpenInlineMenu}
          onInsert={insertBlock}
          onUpdate={updateBlockFields}
          onRemove={removeBlock}
          renderAiControls={(block, blockReadOnly) =>
            template && onsiteInfoBlocksField && user ? (
              <BlockAiSection
                confId={confId}
                reportId={reportId}
                targetFieldId="onsiteInfoBlocks"
                templateHash={template.templateHash}
                field={onsiteInfoBlocksField}
                block={block}
                focus={membership?.aiFocus ?? ""}
                uid={user.uid}
                flushPending={flushPending}
                getLatestBlock={() =>
                  reportDataRef.current?.onsiteInfoBlocks?.find(
                    (candidate) => candidate.id === block.id,
                  )
                }
                commitTranscript={async (next) => {
                  await flushPending();
                  await persistBlockPatch("onsiteInfoBlocks", block.id, {
                    transcriptRef: next,
                  });
                }}
                onSaveContent={async (content) => {
                  await flushPending();
                  await persistBlockPatch(
                    "onsiteInfoBlocks",
                    block.id,
                    {
                      content,
                      lastEditedBy: user.uid,
                      lastEditedAt: Date.now(),
                    },
                    block.content,
                  );
                }}
                readOnly={blockReadOnly}
              />
            ) : null
          }
        />

        <ReportBlockSection
          sectionId="section-reflections"
          title={t("report.reflections")}
          titleStyle={{ marginTop: 24 }}
          field="reflectionsBlocks"
          blocks={reportData?.reflectionsBlocks || []}
          members={members}
          currentUid={user?.uid}
          isAdmin={isConfAdmin}
          readOnly={viewMode}
          memberColorMap={memberColorMap}
          conferenceSessions={allConferenceSessions}
          bodyPlaceholder={t("report.recordVoices")}
          openInlineMenu={openInlineMenu}
          onOpenInlineMenu={setOpenInlineMenu}
          onInsert={insertBlock}
          onUpdate={updateBlockFields}
          onRemove={removeBlock}
          renderAiControls={(block, blockReadOnly) =>
            template && reflectionsBlocksField && user ? (
              <BlockAiSection
                confId={confId}
                reportId={reportId}
                targetFieldId="reflectionsBlocks"
                templateHash={template.templateHash}
                field={reflectionsBlocksField}
                block={block}
                focus={membership?.aiFocus ?? ""}
                uid={user.uid}
                flushPending={flushPending}
                getLatestBlock={() =>
                  reportDataRef.current?.reflectionsBlocks?.find(
                    (candidate) => candidate.id === block.id,
                  )
                }
                commitTranscript={async (next) => {
                  await flushPending();
                  await persistBlockPatch("reflectionsBlocks", block.id, {
                    transcriptRef: next,
                  });
                }}
                onSaveContent={async (content) => {
                  await flushPending();
                  await persistBlockPatch(
                    "reflectionsBlocks",
                    block.id,
                    {
                      content,
                      lastEditedBy: user.uid,
                      lastEditedAt: Date.now(),
                    },
                    block.content,
                  );
                }}
                readOnly={blockReadOnly}
              />
            ) : null
          }
        />

        <ReportBlockSection
          sectionId="section-rumors"
          title={t("report.rumors")}
          titleStyle={{ marginTop: 24 }}
          field="rumorsBlocks"
          blocks={reportData?.rumorsBlocks || []}
          members={members}
          currentUid={user?.uid}
          isAdmin={isConfAdmin}
          readOnly={viewMode}
          memberColorMap={memberColorMap}
          conferenceSessions={allConferenceSessions}
          bodyPlaceholder={t("report.deepAnalysis")}
          openInlineMenu={openInlineMenu}
          onOpenInlineMenu={setOpenInlineMenu}
          onInsert={insertBlock}
          onUpdate={updateBlockFields}
          onRemove={removeBlock}
          renderAiControls={(block, blockReadOnly) =>
            template && rumorsBlocksField && user ? (
              <BlockAiSection
                confId={confId}
                reportId={reportId}
                targetFieldId="rumorsBlocks"
                templateHash={template.templateHash}
                field={rumorsBlocksField}
                block={block}
                focus={membership?.aiFocus ?? ""}
                uid={user.uid}
                flushPending={flushPending}
                getLatestBlock={() =>
                  reportDataRef.current?.rumorsBlocks?.find(
                    (candidate) => candidate.id === block.id,
                  )
                }
                commitTranscript={async (next) => {
                  await flushPending();
                  await persistBlockPatch("rumorsBlocks", block.id, { transcriptRef: next });
                }}
                onSaveContent={async (content) => {
                  await flushPending();
                  await persistBlockPatch(
                    "rumorsBlocks",
                    block.id,
                    {
                      content,
                      lastEditedBy: user.uid,
                      lastEditedAt: Date.now(),
                    },
                    block.content,
                  );
                }}
                readOnly={blockReadOnly}
              />
            ) : null
          }
        />
      </div>

      {/* Site Photos Section */}
      <div id="section-site-photos" className="report-site-photos">
        <h2 className="report-section-title" style={{ marginTop: 32 }}>
          {t("report.siteRecords")}
        </h2>
        <div className="site-photos-grid">
          {(() => {
            const rawPhotos = reportData?.sitePhotos || [];
            const sortedPhotos = rawPhotos
              .map((photo, originalIdx) => ({ ...photo, originalIdx }))
              .sort((a, b) => (a.source || "").localeCompare(b.source || ""));
            const cols: (SitePhoto & { originalIdx: number })[][] = [[], []];
            const colH = [0, 0];
            for (const photo of sortedPhotos) {
              const col = colH[0] <= colH[1] ? 0 : 1;
              cols[col].push(photo);
              // Height proxy: image aspect ratio + caption length (CJK ≈ 2 units)
              const imgRatio = photo.h && photo.w ? photo.h / photo.w : 0.75;
              const captionLen = [...(photo.caption || "")].reduce(
                (s, c) => s + (c.charCodeAt(0) > 0x2e7f ? 2 : 1),
                0,
              );
              colH[col] += imgRatio + captionLen / 50;
            }
            const addCol = colH[0] <= colH[1] ? 0 : 1;
            const renderCard = (photo: SitePhoto & { originalIdx: number }) => (
              <div key={photo.originalIdx} className="site-photo-card">
                <div className="site-photo-img-wrapper">
                  <img
                    src={photo.image}
                    alt={t("report.sitePhotoAlt", {
                      index: photo.originalIdx + 1,
                    })}
                    className="site-photo-img"
                  />
                  {!viewMode && (
                    <button
                      className="site-photo-delete-btn no-print"
                      onClick={() => handleSitePhotoDelete(photo.originalIdx)}
                      title={t("report.deleteImage")}
                    >
                      ×
                    </button>
                  )}
                </div>
                {viewMode ? (
                  <>
                    {photo.caption && (
                      <p className="site-photo-caption" style={{ whiteSpace: "pre-wrap" }}>
                        {photo.caption}
                      </p>
                    )}
                    {photo.source && (
                      <p
                        className="site-photo-source"
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "var(--report-fs-caption)",
                        }}
                      >
                        {photo.source}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <textarea
                      className="site-photo-caption"
                      placeholder={t("report.imageCaption")}
                      defaultValue={photo.caption}
                      onBlur={(e) => saveSitePhotoCaption(photo.originalIdx, e.target.value)}
                      onInput={(e) => {
                        const t = e.currentTarget;
                        t.style.height = "auto";
                        t.style.height = t.scrollHeight + "px";
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
                      onBlur={(e) => saveSitePhotoSource(photo.originalIdx, e.target.value)}
                    />
                  </>
                )}
              </div>
            );
            const addButton = (
              <div
                key="add"
                className="site-photo-add-card no-print"
                onClick={() => sitePhotoInputRef.current?.click()}
              >
                <div className="site-photo-add-inner">
                  <span className="site-photo-add-icon">+</span>
                  <span className="site-photo-add-label">{t("report.addImage")}</span>
                </div>
              </div>
            );
            return [0, 1].map((col) => (
              <div key={col} className="site-photos-col">
                {cols[col].map(renderCard)}
                {!viewMode && addCol === col && addButton}
              </div>
            ));
          })()}
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
          <p>
            {confName || "Conference"} · {date} · {t("report.teamGenerated")}
          </p>
        </div>
      </div>
    </div>
  );

  const overlays = (
    <>
      {leadingOverlays}

      {/* Floating back-to-TOC button — only when TOC is scrolled out of view */}
      {!tocVisible && (
        <a href="#report-toc" className="toc-float-btn no-print">
          {t("report.backToToc")}
        </a>
      )}

      <AddReportSessionDialog
        open={!viewMode && showAddSession}
        sessions={allConferenceSessions}
        selectedIds={new Set(activeSessions.map((session) => session.code))}
        currentUid={user?.uid || ""}
        onAdd={(key) => {
          addReportSession(key)
            .then(() => setShowAddSession(false))
            .catch(console.error);
        }}
        onClose={() => setShowAddSession(false)}
      />

      {/* Delete session — select session modal */}
      {!viewMode && showDeleteSelect && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteSelect(false)}>
          <div
            className="delete-confirm-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480, width: "90%" }}
          >
            <h3 className="delete-confirm-title">{t("report.selectDeleteSession")}</h3>
            <div style={{ maxHeight: 360, overflowY: "auto", margin: "8px 0" }}>
              {activeSessions.map((s) => {
                const names = Array.from(s.attendees)
                  .map((id) => memberMap[id])
                  .filter(Boolean);
                return (
                  <button
                    key={s.code}
                    className="report-editor-touch-target"
                    onClick={() => openDeleteConfirm(s.code, names)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      background: "none",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      borderBottom: "1px solid #F0F0F0",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF5F5")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span
                      className="text-caption"
                      style={{
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        fontFamily: "monospace",
                      }}
                    >
                      {s.code}
                    </span>
                    <span
                      className="text-caption"
                      style={{
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                      }}
                    >
                      {SESSION_CATALOG.get(s.code)?.title || s.title}
                    </span>
                    {names.length > 0 && (
                      <span className="text-label" style={{ color: "var(--text-muted)" }}>
                        {t("report.contributors", {
                          names: names.join(i18n.language.startsWith("zh") ? "、" : ", "),
                        })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel report-editor-touch-target"
                onClick={() => setShowDeleteSelect(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Panel ────────────────────────────────────────── */}
      {!viewMode &&
        showHistory &&
        (() => {
          // Relative time helper
          const relativeTime = (date: Date | null | undefined) => {
            if (!date) return "";
            const now = Date.now();
            const diff = now - date.getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return t("report.justNow");
            if (mins < 60) return t("report.minutesAgo", { count: mins });
            const hours = Math.floor(mins / 60);
            if (hours < 24) return t("report.hoursAgo", { count: hours });
            const days = Math.floor(hours / 24);
            if (days < 7) return t("report.daysAgo", { count: days });
            return formatDateTime(date);
          };

          // No grouping — flat list, all versions equal

          return (
            <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.4)",
                }}
                onClick={() => {
                  setShowHistory(false);
                  setViewingSnapshot(null);
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: viewingSnapshot ? "min(80%, 960px)" : "380px",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
                }}
              >
                {/* Panel header */}
                <div
                  style={{
                    padding: "16px 20px",
                    background: "#222",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  {viewingSnapshot && (
                    <button
                      className="report-editor-touch-target"
                      onClick={() => setViewingSnapshot(null)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#888",
                        fontSize: 12,
                      }}
                    >
                      {t("common.back")}
                    </button>
                  )}
                  <h2
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      flex: 1,
                      fontSize: 14,
                      fontFamily: "'Work Sans', sans-serif",
                      letterSpacing: 0.5,
                    }}
                  >
                    {viewingSnapshot ? t("report.versionDetails") : t("report.versionHistory")}
                  </h2>
                  <span style={{ fontSize: 10, color: "#666" }}>
                    {t("report.versions", { count: snapshots.length })}
                  </span>
                  <button
                    className="report-editor-touch-target"
                    onClick={() => {
                      setShowHistory(false);
                      setViewingSnapshot(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 18,
                      color: "#666",
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>

                {!viewingSnapshot ? (
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {/* Current version indicator */}
                    <div
                      style={{
                        padding: "14px 20px",
                        borderBottom: "1px solid #eee",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          background: "#27AE60",
                          borderRadius: "50%",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#1a1c1c",
                          }}
                        >
                          {t("report.currentVersion")}
                        </div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                          {t("report.editing")}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          background: "#27AE60",
                          color: "#fff",
                          fontWeight: 600,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          fontFamily: "'Work Sans', sans-serif",
                        }}
                      >
                        Current
                      </span>
                    </div>

                    {/* Timeline */}
                    {snapshots.length === 0 ? (
                      <div style={{ padding: "40px 20px", textAlign: "center" }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#888",
                            marginBottom: 8,
                          }}
                        >
                          {t("report.noHistoryVersions")}
                        </div>
                        <div style={{ fontSize: 11, color: "#bbb" }}>
                          {t("report.autoSaveHint")}
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "0 20px" }}>
                        {snapshots.map((snap, i) => {
                          const date = snap.createdAt?.toDate?.();
                          const isManual = snap.type === "manual";
                          const shortId = snap.id.slice(-6).toUpperCase();
                          return (
                            <div
                              key={snap.id}
                              style={{
                                display: "flex",
                                gap: 12,
                                paddingTop: 14,
                                paddingBottom: 14,
                                borderBottom: "1px solid #f3f3f3",
                              }}
                            >
                              {/* Timeline dot */}
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  width: 20,
                                  flexShrink: 0,
                                  paddingTop: 2,
                                }}
                              >
                                <div
                                  style={{
                                    width: 10,
                                    height: 10,
                                    background: "#a20513",
                                    borderRadius: "50%",
                                  }}
                                />
                                {i < snapshots.length - 1 && (
                                  <div
                                    style={{
                                      flex: 1,
                                      width: 1,
                                      background: "#eee",
                                      marginTop: 4,
                                    }}
                                  />
                                )}
                              </div>
                              {/* Content */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    marginBottom: 4,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#888",
                                      fontFamily: "monospace",
                                    }}
                                  >
                                    #{shortId}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 9,
                                      padding: "1px 6px",
                                      fontWeight: 700,
                                      letterSpacing: 0.5,
                                      textTransform: "uppercase",
                                      fontFamily: "'Work Sans', sans-serif",
                                      background: isManual
                                        ? "rgba(162,5,19,0.08)"
                                        : "rgba(41,128,185,0.08)",
                                      color: isManual ? "#a20513" : "#2980B9",
                                    }}
                                  >
                                    {isManual ? "Manual" : "Auto"}
                                  </span>
                                  {snap.createdBy && memberMap[snap.createdBy] && (
                                    <span style={{ fontSize: 10, color: "#888" }}>
                                      by {memberMap[snap.createdBy]}
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#1a1c1c",
                                    fontWeight: 600,
                                  }}
                                >
                                  {date ? relativeTime(date) : t("report.unknownTime")}
                                </div>
                                {date && (
                                  <div
                                    style={{
                                      fontSize: 10,
                                      color: "#bbb",
                                      marginTop: 2,
                                    }}
                                  >
                                    {formatDateTime(date)}
                                  </div>
                                )}
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    marginTop: 8,
                                  }}
                                >
                                  <button
                                    className="report-editor-touch-target"
                                    onClick={() => setViewingSnapshot(snap)}
                                    style={{
                                      fontSize: 11,
                                      padding: "4px 14px",
                                      background: "#f3f3f3",
                                      border: "none",
                                      cursor: "pointer",
                                      color: "#555",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {t("report.viewChanges")}
                                  </button>
                                  <button
                                    className="report-editor-touch-target"
                                    onClick={() => handleRestore(snap)}
                                    style={{
                                      fontSize: 11,
                                      padding: "4px 14px",
                                      background: "none",
                                      border: "1px solid rgba(162,5,19,0.2)",
                                      cursor: "pointer",
                                      color: "#a20513",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {t("report.restore")}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Snapshot viewer with diff */
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      minHeight: 0,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 20px",
                        borderBottom: "1px solid #eee",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          fontFamily: "monospace",
                        }}
                      >
                        #{viewingSnapshot.id.slice(-6).toUpperCase()}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          fontFamily: "'Work Sans', sans-serif",
                          background:
                            viewingSnapshot.type === "manual"
                              ? "rgba(162,5,19,0.08)"
                              : "rgba(41,128,185,0.08)",
                          color: viewingSnapshot.type === "manual" ? "#a20513" : "#2980B9",
                        }}
                      >
                        {viewingSnapshot.type === "manual" ? "Manual" : "Auto"}
                      </span>
                      <span style={{ fontSize: 11, color: "#888" }}>
                        {viewingSnapshot.createdAt?.toDate
                          ? relativeTime(viewingSnapshot.createdAt.toDate())
                          : ""}
                      </span>
                      {viewingSnapshot.createdBy && memberMap[viewingSnapshot.createdBy] && (
                        <span style={{ fontSize: 11, color: "#888" }}>
                          · {memberMap[viewingSnapshot.createdBy]}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <button
                        className="report-editor-touch-target"
                        onClick={() => handleRestore(viewingSnapshot)}
                        style={{
                          fontSize: 11,
                          padding: "4px 14px",
                          background: "none",
                          border: "1px solid rgba(162,5,19,0.2)",
                          cursor: "pointer",
                          color: "#a20513",
                          fontWeight: 600,
                        }}
                      >
                        {t("report.restoreThisVersion")}
                      </button>
                    </div>
                    <SnapshotViewer
                      snapshot={viewingSnapshot}
                      currentData={reportDataRef.current}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Restore confirm modal */}
      {restoreConfirm && (
        <div className="delete-confirm-overlay" onClick={() => setRestoreConfirm(null)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="delete-confirm-title">{t("report.confirmRestore")}</h3>
            <p className="delete-confirm-desc">{t("report.restoreDesc")}</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel report-editor-touch-target"
                onClick={() => setRestoreConfirm(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="delete-confirm-submit report-editor-touch-target"
                onClick={confirmRestore}
              >
                {t("report.confirmRestoreBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete session confirmation modal */}
      {!viewMode && deleteConfirm.code && (
        <div
          className="delete-confirm-overlay"
          onClick={() =>
            setDeleteConfirm({
              code: null,
              contributorNames: [],
              nameInput: "",
              error: false,
            })
          }
        >
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="delete-confirm-title">{t("report.removeSessionFromReport")}</h3>
            <p className="delete-confirm-desc">
              {deleteConfirm.contributorNames.length > 0
                ? t("report.deleteSessionConfirmWithContributors", {
                    names: deleteConfirm.contributorNames.join(
                      i18n.language.startsWith("zh") ? "、" : ", ",
                    ),
                  })
                : t("report.deleteSessionConfirmNoContributors")}
            </p>
            <input
              className={`delete-confirm-input${deleteConfirm.error ? " delete-confirm-input--error" : ""}`}
              type="text"
              placeholder={t("report.enterName")}
              value={deleteConfirm.nameInput}
              autoFocus
              onChange={(e) =>
                setDeleteConfirm((prev) => ({
                  ...prev,
                  nameInput: e.target.value,
                  error: false,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmDeleteSession();
                if (e.key === "Escape")
                  setDeleteConfirm({
                    code: null,
                    contributorNames: [],
                    nameInput: "",
                    error: false,
                  });
              }}
            />
            {deleteConfirm.error && (
              <p className="delete-confirm-error">{t("report.nameNotMatch")}</p>
            )}
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel report-editor-touch-target"
                onClick={() =>
                  setDeleteConfirm({
                    code: null,
                    contributorNames: [],
                    nameInput: "",
                    error: false,
                  })
                }
              >
                {t("common.cancel")}
              </button>
              <button
                className="delete-confirm-submit report-editor-touch-target"
                onClick={confirmDeleteSession}
              >
                {t("report.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <DailyReportEditorShell
      viewMode={viewMode}
      toolbar={toolbar}
      outlineLabel={outlineLabel}
      outlineItems={outlineItems}
      status={status}
      overlays={overlays}
    >
      {reportDocument}
    </DailyReportEditorShell>
  );
}
