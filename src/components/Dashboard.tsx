import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import {
  Tag,
  Button,
  InputGroup,
  Icon,
  Callout,
  Dialog,
  RadioGroup,
  Radio,
  Classes,
} from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { FirstTimeNameSetup } from "./UserAvatar";
import AppNavbar from "./shell/AppNavbar";
import { SectionAccentProvider } from "./shell/SectionAccent";
import type { AttendanceMode, Conference, Member, WithId } from "../types";

const ACCENT = {
  dash: "#4A7FB5",
  pending: "#E67E22",
  sand: "#C9A882",
  muted: "#A9A9A9",
};

interface ApplyModal {
  confId: string;
  confName: string;
}

function SectionHeader({
  bar,
  children,
  right,
}: {
  bar: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: "'Work Sans', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--text-primary)",
        }}
      >
        <span style={{ width: 3, height: 14, background: bar, borderRadius: 2, display: "inline-block" }} />
        {children}
      </h2>
      {right}
    </div>
  );
}

function ConfCard({
  conf,
  membership,
  accent,
  showApply,
  onApply,
}: {
  conf: WithId<Conference>;
  membership?: Member | null;
  accent: string;
  showApply?: boolean;
  onApply?: (m: ApplyModal) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const approved = membership?.status === "approved";
  const isPending = membership?.status === "pending";
  const isAdmin = membership?.role === "admin";

  return (
    <div
      style={{
        borderLeft: `4px solid ${accent}`,
        borderRadius: "4px 3px 3px 4px",
        background: "var(--surface)",
        boxShadow: "0 1px 2px rgba(95,107,124,.12), 0 0 0 1px rgba(95,107,124,.10)",
        marginBottom: 14,
      }}
    >
      <div
        onClick={approved ? () => navigate(`/conference/${conf.id}`) : undefined}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", cursor: approved ? "pointer" : "default" }}
      >
        <Icon icon={IconNames.CALENDAR} size={28} style={{ color: accent, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontFamily: "'Work Sans', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {conf.name}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--text-muted)" }}>
            {conf.startDate} — {conf.endDate}
          </span>
        </div>
        {approved && (
          <Tag minimal intent={membership?.attendanceMode === "onsite" ? "success" : "primary"}>
            {t(`dashboard.${membership?.attendanceMode}`)}
          </Tag>
        )}
        {isPending && (
          <Tag minimal intent="warning">
            {t("dashboard.pendingApproval")}
          </Tag>
        )}
        {isAdmin && <Tag intent="primary">{t("dashboard.admin")}</Tag>}
        {approved && <Icon icon={IconNames.CHEVRON_RIGHT} size={16} style={{ color: "var(--text-muted)" }} />}
      </div>
      {showApply && !membership && (
        <div style={{ padding: "0 18px 16px", display: "flex", justifyContent: "flex-end" }}>
          <Button
            intent="primary"
            outlined
            small
            onClick={() => onApply?.({ confId: conf.id, confName: conf.name })}
          >
            {t("dashboard.applyToJoin")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, isSuperAdmin } = useAuth();
  const { t } = useTranslation();
  const [conferences, setConferences] = useState<WithId<Conference>[] | null>(null);
  const [myMemberships, setMyMemberships] = useState<Record<string, Member | null>>({});
  const [membershipsReady, setMembershipsReady] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [applyModal, setApplyModal] = useState<ApplyModal | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>("onsite");
  const [applying, setApplying] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conference, "id">) }));
      setConferences(list);
      if (list.length === 0) setMembershipsReady(true);
    });
  }, [user]);

  const pendingMemberships = useRef<Record<string, Member | null>>({});
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!user || !conferences || conferences.length === 0) return;
    setMembershipsReady(false);
    initialLoadDone.current = false;
    pendingMemberships.current = {};
    const unsubscribes: Array<() => void> = [];
    let loaded = 0;
    const total = conferences.length;

    conferences.forEach((conf) => {
      const memberRef = doc(db, "conferences", conf.id, "members", user.uid);
      const unsub = onSnapshot(memberRef, (snap) => {
        const data: Member | null = snap.exists() ? (snap.data() as Member) : null;
        if (!initialLoadDone.current) {
          pendingMemberships.current[conf.id] = data;
          loaded++;
          if (loaded >= total) {
            initialLoadDone.current = true;
            setMyMemberships({ ...pendingMemberships.current });
            setMembershipsReady(true);
          }
        } else {
          setMyMemberships((prev) => ({ ...prev, [conf.id]: data }));
        }
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach((u) => u());
  }, [user, conferences]);

  const { upcoming, past, pending, discover } = useMemo(() => {
    if (!conferences || !membershipsReady) {
      return { upcoming: [], past: [], pending: [], discover: [] };
    }

    const upcoming: WithId<Conference>[] = [];
    const past: WithId<Conference>[] = [];
    const pending: WithId<Conference>[] = [];
    const discover: WithId<Conference>[] = [];

    conferences.forEach((conf) => {
      const membership = myMemberships[conf.id];
      const isPast = conf.endDate < today;

      if (membership?.status === "pending") {
        pending.push(conf);
      } else if (membership?.status === "approved") {
        if (isPast) past.push(conf);
        else upcoming.push(conf);
      } else if (!membership && (conf.visibility === "public" || isSuperAdmin)) {
        discover.push(conf);
      }
    });

    upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
    past.sort((a, b) => b.endDate.localeCompare(a.endDate));
    discover.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return { upcoming, past, pending, discover };
  }, [conferences, myMemberships, today, isSuperAdmin, membershipsReady]);

  const handleApply = async () => {
    if (!applyModal || !user) return;
    setApplying(true);
    try {
      const nextColorIndex = Object.keys(myMemberships).length % 6;
      await setDoc(doc(db, "conferences", applyModal.confId, "members", user.uid), {
        role: "member",
        status: "pending",
        attendanceMode,
        colorIndex: nextColorIndex,
        appliedAt: serverTimestamp(),
      });
      setApplyModal(null);
      setAttendanceMode("onsite");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!conferences) return;
    setJoinError("");
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    const match = conferences.find((c) => c.visibility === "private" && c.joinCode === code);
    if (!match) {
      setJoinError(t("dashboard.invalidJoinCode"));
      return;
    }

    setApplyModal({ confId: match.id, confName: match.name });
    setJoinCode("");
  };

  return (
    <SectionAccentProvider accent="dash">
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <FirstTimeNameSetup />
        <AppNavbar />
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 56px", display: "flex", flexDirection: "column", gap: 26 }}>
          {!membershipsReady ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
              <Icon icon={IconNames.CALENDAR} size={28} style={{ color: ACCENT.dash, opacity: 0.4 }} />
            </div>
          ) : (
            <>
              {/* Status row + join by code */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div
                  style={{
                    fontFamily: "'Work Sans', sans-serif",
                    fontWeight: 600,
                    fontSize: 12,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  {t("dashboard.active")} · {upcoming.length} {t("dashboard.conferences")}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <InputGroup
                    leftIcon={IconNames.KEY}
                    placeholder={t("dashboard.enterJoinCode")}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                    style={{ width: 180 }}
                  />
                  <Button intent="primary" onClick={handleJoinByCode}>
                    {t("common.join")}
                  </Button>
                </div>
              </div>
              {joinError && (
                <Callout intent="danger" style={{ marginBottom: 0 }}>
                  {joinError}
                </Callout>
              )}

              {/* My conferences */}
              <div>
                {upcoming.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14, padding: "32px 0" }}>
                    {t("dashboard.noUpcoming")}
                  </div>
                )}
                {upcoming.map((conf) => (
                  <ConfCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} accent={ACCENT.dash} />
                ))}
              </div>

              {/* Pending applications */}
              {pending.length > 0 && (
                <div>
                  <SectionHeader bar={ACCENT.pending}>{t("dashboard.pendingApplications")}</SectionHeader>
                  {pending.map((conf) => (
                    <Callout
                      key={conf.id}
                      intent="warning"
                      icon={IconNames.TIME}
                      title={conf.name}
                      style={{ marginBottom: 14 }}
                    >
                      {t("dashboard.pendingApproval")} · {conf.startDate} — {conf.endDate}
                    </Callout>
                  ))}
                </div>
              )}

              {/* Past conferences */}
              {past.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowPast(!showPast)}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: "'Work Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: 12,
                      padding: 0,
                    }}
                  >
                    <span style={{ width: 3, height: 14, background: ACCENT.muted, borderRadius: 2, display: "inline-block" }} />
                    {t("dashboard.pastConferences")} ({past.length})
                    <Icon icon={showPast ? IconNames.CHEVRON_DOWN : IconNames.CHEVRON_RIGHT} size={14} />
                  </button>
                  {showPast &&
                    past.map((conf) => (
                      <ConfCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} accent={ACCENT.muted} />
                    ))}
                </div>
              )}

              {/* Discover */}
              {discover.length > 0 && (
                <div>
                  <SectionHeader
                    bar={ACCENT.sand}
                    right={
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {discover.length} {t("dashboard.available")}
                      </span>
                    }
                  >
                    {t("dashboard.discover")}
                  </SectionHeader>
                  {discover.map((conf) => (
                    <ConfCard
                      key={conf.id}
                      conf={conf}
                      membership={myMemberships[conf.id]}
                      accent={ACCENT.sand}
                      showApply
                      onApply={setApplyModal}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Apply dialog */}
        <Dialog
          isOpen={!!applyModal}
          onClose={() => setApplyModal(null)}
          title={t("dashboard.applyToJoin")}
          icon={IconNames.ADD}
        >
          <div className={Classes.DIALOG_BODY}>
            <p style={{ color: "var(--text-secondary)", marginBottom: 18 }}>{applyModal?.confName}</p>
            <div
              style={{
                fontFamily: "'Work Sans', sans-serif",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: 8,
              }}
            >
              {t("dashboard.attendanceMode")}
            </div>
            <RadioGroup
              inline
              selectedValue={attendanceMode}
              onChange={(e) => setAttendanceMode(e.currentTarget.value as AttendanceMode)}
            >
              <Radio label={t("dashboard.onsite")} value="onsite" />
              <Radio label={t("dashboard.online")} value="online" />
            </RadioGroup>
          </div>
          <div className={Classes.DIALOG_FOOTER}>
            <div className={Classes.DIALOG_FOOTER_ACTIONS}>
              <Button onClick={() => setApplyModal(null)}>{t("common.cancel")}</Button>
              <Button intent="primary" onClick={handleApply} loading={applying}>
                {t("common.apply")}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </SectionAccentProvider>
  );
}
