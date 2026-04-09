import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import UserAvatar, { FirstTimeNameSetup } from "./UserAvatar";

export default function Dashboard() {
  const { user, userProfile, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [conferences, setConferences] = useState(null); // null = not loaded yet
  const [myMemberships, setMyMemberships] = useState({});
  const [membershipsReady, setMembershipsReady] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [applyModal, setApplyModal] = useState(null);
  const [attendanceMode, setAttendanceMode] = useState("onsite");
  const [applying, setApplying] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "conferences"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setConferences(list);
      if (list.length === 0) setMembershipsReady(true);
    });
  }, [user]);

  const pendingMemberships = useRef({});
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!user || !conferences || conferences.length === 0) return;
    setMembershipsReady(false);
    initialLoadDone.current = false;
    pendingMemberships.current = {};
    const unsubscribes = [];
    let loaded = 0;
    const total = conferences.length;

    conferences.forEach((conf) => {
      const memberRef = doc(db, "conferences", conf.id, "members", user.uid);
      const unsub = onSnapshot(memberRef, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        if (!initialLoadDone.current) {
          // Batch initial loads — collect in ref, flush once all done
          pendingMemberships.current[conf.id] = data;
          loaded++;
          if (loaded >= total) {
            initialLoadDone.current = true;
            setMyMemberships({ ...pendingMemberships.current });
            setMembershipsReady(true);
          }
        } else {
          // After initial load, update individually (real-time changes)
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

    const upcoming = [];
    const past = [];
    const pending = [];
    const discover = [];

    conferences.forEach((conf) => {
      const membership = myMemberships[conf.id];
      const isPast = conf.endDate < today;

      if (membership?.status === "pending") {
        pending.push(conf);
      } else if (membership?.status === "approved") {
        if (isPast) past.push(conf);
        else upcoming.push(conf);
      } else if (
        !membership &&
        (conf.visibility === "public" || isSuperAdmin)
      ) {
        // Super admins can see all conferences in discover (including private)
        discover.push(conf);
      }
    });

    upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
    past.sort((a, b) => b.endDate.localeCompare(a.endDate));
    discover.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return { upcoming, past, pending, discover };
  }, [conferences, myMemberships, today, isSuperAdmin, membershipsReady]);

  const handleApply = async () => {
    if (!applyModal) return;
    setApplying(true);
    try {
      const nextColorIndex = Object.keys(myMemberships).length % 6;
      await setDoc(
        doc(db, "conferences", applyModal.confId, "members", user.uid),
        {
          role: "member",
          status: "pending",
          attendanceMode,
          colorIndex: nextColorIndex,
          appliedAt: serverTimestamp(),
        },
      );
      setApplyModal(null);
      setAttendanceMode("onsite");
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const handleJoinByCode = async () => {
    setJoinError("");
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    const match = conferences.find(
      (c) => c.visibility === "private" && c.joinCode === code,
    );
    if (!match) {
      setJoinError(t("dashboard.invalidJoinCode"));
      return;
    }

    setApplyModal({ confId: match.id, confName: match.name });
    setJoinCode("");
  };

  const CalendarIcon = () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 text-secondary/60"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  const ConferenceCard = ({
    conf,
    membership,
    showApply = false,
    accentColor = "bg-dash-blue",
  }) => {
    return (
      <div className="bg-white border border-[#E8E4DF] rounded-lg overflow-hidden hover:shadow-md transition-all duration-200 mb-3">
        <div className="flex items-stretch">
          {/* Left accent bar */}
          <div className={`w-1.5 ${accentColor} flex-shrink-0`}></div>
          <div className="flex-1 p-5">
            <div className="flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <h3 className="font-headline text-on-surface font-bold text-base leading-snug">
                  {membership?.status === "approved" ? (
                    <Link
                      to={`/conference/${conf.id}`}
                      className="text-on-surface hover:text-dash-blue transition-colors"
                    >
                      {conf.name}
                    </Link>
                  ) : (
                    conf.name
                  )}
                </h3>
                <p className="text-secondary text-sm mt-1.5 flex items-center gap-2">
                  <CalendarIcon />
                  {conf.startDate} — {conf.endDate}
                </p>
                {conf.description && (
                  <p className="text-secondary/80 text-sm mt-2 line-clamp-2 leading-relaxed">
                    {conf.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 ml-4">
                {membership?.status === "approved" && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#27AE60]/10 text-[#27AE60] font-medium uppercase tracking-wider">
                    {membership.attendanceMode}
                  </span>
                )}
                {membership?.status === "pending" && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#E67E22]/10 text-[#E67E22] font-medium uppercase tracking-wider">
                    {t("dashboard.pendingApproval")}
                  </span>
                )}
                {membership?.role === "admin" && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-dash-blue/10 text-dash-blue font-medium uppercase tracking-wider">
                    {t("dashboard.admin")}
                  </span>
                )}
              </div>
            </div>
            {showApply && !membership && (
              <div className="mt-4 pt-4 border-t border-[#E8E4DF]">
                <button
                  onClick={() =>
                    setApplyModal({ confId: conf.id, confName: conf.name })
                  }
                  className="bg-dash-blue/10 text-dash-blue px-5 py-2.5 text-xs font-headline
                  uppercase tracking-wider rounded-md hover:bg-dash-blue hover:text-white transition-all duration-200"
                >
                  {t("dashboard.applyToJoin")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <FirstTimeNameSetup />
      <div className="bg-gradient-to-r from-dash-blue-deep to-dash-blue px-6 py-3.5 flex justify-between items-center">
        <h1
          className="font-headline text-white text-lg font-bold"
          style={{ letterSpacing: "0.3px" }}
        >
          ConferenceFlow
        </h1>
        <div className="flex items-center gap-2.5">
          {isSuperAdmin && (
            <Link
              to="/super-admin"
              className="font-headline text-white text-xs font-semibold uppercase px-4 py-1.5 rounded transition-colors"
              style={{
                background: "rgba(255,255,255,0.18)",
                letterSpacing: "0.8px",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.3)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.18)")
              }
            >
              {t("dashboard.adminPanel")}
            </Link>
          )}
          <UserAvatar size={28} onSignOut={() => navigate("/login")} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-8 pt-10">
        {!membershipsReady ? (
          /* Skeleton loading state */
          <div className="animate-pulse">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-6 bg-surface-dim rounded-full"></div>
              <div className="h-5 w-48 bg-surface-container rounded"></div>
            </div>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-white border border-[#E8E4DF] rounded-lg overflow-hidden mb-3"
              >
                <div className="flex items-stretch">
                  <div className="w-1 bg-surface-dim flex-shrink-0"></div>
                  <div className="flex-1 p-5">
                    <div className="h-4 w-64 bg-surface-container rounded mb-3"></div>
                    <div className="h-3 w-40 bg-surface-dim rounded"></div>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 mb-5 mt-10">
              <div className="w-1 h-6 bg-surface-dim rounded-full"></div>
              <div className="h-5 w-32 bg-surface-container rounded"></div>
            </div>
            {[1].map((i) => (
              <div
                key={i}
                className="bg-white border border-[#E8E4DF] rounded-lg overflow-hidden mb-3"
              >
                <div className="flex items-stretch">
                  <div className="w-1 bg-surface-dim flex-shrink-0"></div>
                  <div className="flex-1 p-5">
                    <div className="h-4 w-56 bg-surface-container rounded mb-3"></div>
                    <div className="h-3 w-36 bg-surface-dim rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <section className="mb-10">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 rounded-full bg-dash-blue"></div>
                  <h2 className="font-headline text-on-surface text-lg font-bold tracking-wide uppercase">
                    {t("dashboard.myConferences")}
                  </h2>
                </div>
                <span className="text-xs font-headline text-secondary tracking-wider">
                  {upcoming.length}{" "}
                  {t(
                    upcoming.length === 1
                      ? "dashboard.conference"
                      : "dashboard.conferences",
                  )}
                </span>
              </div>
              {upcoming.length === 0 && (
                <p className="text-secondary text-base text-center py-8">
                  {t("dashboard.noUpcoming")}
                </p>
              )}
              {upcoming.map((conf) => (
                <ConferenceCard
                  key={conf.id}
                  conf={conf}
                  membership={myMemberships[conf.id]}
                  accentColor="bg-dash-blue"
                />
              ))}
            </section>

            {pending.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full bg-[#E67E22]"></div>
                    <h2 className="font-headline text-on-surface text-lg font-bold tracking-wide uppercase">
                      {t("dashboard.pendingApplications")}
                    </h2>
                  </div>
                  <span className="text-xs font-headline text-secondary tracking-wider">
                    {pending.length} {t("dashboard.pending")}
                  </span>
                </div>
                {pending.map((conf) => (
                  <ConferenceCard
                    key={conf.id}
                    conf={conf}
                    membership={myMemberships[conf.id]}
                    accentColor="bg-[#E67E22]"
                  />
                ))}
              </section>
            )}

            <section className="mb-10">
              <button
                onClick={() => setShowPast(!showPast)}
                className="flex items-center gap-3 text-secondary hover:text-on-surface transition-colors group"
              >
                <div className="w-1 h-6 rounded-full bg-secondary/30"></div>
                <span className="text-sm font-headline uppercase tracking-wider">
                  {t("dashboard.pastConferences")}
                </span>
                <span className="text-xs text-secondary/60">
                  ({past.length})
                </span>
                <span className="text-xs transition-transform group-hover:translate-x-0.5">
                  {showPast ? "\u25BC" : "\u25B6"}
                </span>
              </button>
              {showPast && past.length > 0 && (
                <div className="mt-4">
                  {past.map((conf) => (
                    <ConferenceCard
                      key={conf.id}
                      conf={conf}
                      membership={myMemberships[conf.id]}
                      accentColor="bg-secondary/40"
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="mb-10">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 rounded-full bg-dash-sand"></div>
                  <h2 className="font-headline text-on-surface text-lg font-bold tracking-wide uppercase">
                    {t("dashboard.discover")}
                  </h2>
                </div>
                <span className="text-xs font-headline text-secondary tracking-wider">
                  {discover.length} {t("dashboard.available")}
                </span>
              </div>

              <div className="bg-white border border-[#E8E4DF] rounded-lg p-5 mb-5">
                <label className="block text-[11px] font-headline text-secondary uppercase tracking-widest mb-2">
                  {t("dashboard.joinPrivate")}
                </label>
                <div className="flex gap-3 items-end">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder={t("dashboard.enterJoinCode")}
                    className="flex-1 bg-[#F7F5F2] border border-[#E8E4DF] rounded-md px-3 py-2.5 text-on-surface text-sm
                  focus:border-dash-blue focus:outline-none focus:ring-1 focus:ring-dash-blue/20 transition-all"
                  />
                  <button
                    onClick={handleJoinByCode}
                    className="bg-dash-blue/10 text-dash-blue px-5 py-2.5 text-xs font-headline
                  uppercase tracking-wider rounded-md hover:bg-dash-blue hover:text-white transition-all duration-200"
                  >
                    {t("common.join")}
                  </button>
                </div>
              </div>
              {joinError && (
                <div className="bg-red-500/10 text-red-600 text-sm p-3 mb-4 rounded-md border border-red-200">
                  {joinError}
                </div>
              )}

              {discover.length === 0 && (
                <p className="text-secondary text-base text-center py-8">
                  {t("dashboard.noPublicConferences")}
                </p>
              )}
              {discover.map((conf) => (
                <ConferenceCard
                  key={conf.id}
                  conf={conf}
                  showApply
                  accentColor="bg-dash-sand"
                />
              ))}
            </section>
          </>
        )}
      </div>

      {applyModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setApplyModal(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Colored top bar */}
            <div className="h-[3px] bg-dash-blue"></div>
            <div className="p-6">
              <h3 className="font-headline text-on-surface font-bold text-lg mb-1">
                {t("dashboard.applyToJoin")}
              </h3>
              <p className="text-secondary text-sm mb-6">
                {applyModal.confName}
              </p>

              <div className="mb-6">
                <label className="block text-[11px] font-headline text-secondary uppercase tracking-widest mb-3">
                  {t("dashboard.attendanceMode")}
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAttendanceMode("onsite")}
                    className={`flex-1 p-3 text-sm font-headline uppercase tracking-wider rounded-lg transition-all duration-200
                      ${
                        attendanceMode === "onsite"
                          ? "bg-dash-blue text-white shadow-sm"
                          : "bg-white text-secondary border border-[#E8E4DF] hover:border-dash-blue hover:text-on-surface"
                      }`}
                  >
                    {t("dashboard.onsite")}
                  </button>
                  <button
                    onClick={() => setAttendanceMode("online")}
                    className={`flex-1 p-3 text-sm font-headline uppercase tracking-wider rounded-lg transition-all duration-200
                      ${
                        attendanceMode === "online"
                          ? "bg-dash-blue text-white shadow-sm"
                          : "bg-white text-secondary border border-[#E8E4DF] hover:border-dash-blue hover:text-on-surface"
                      }`}
                  >
                    {t("dashboard.online")}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setApplyModal(null)}
                  className="flex-1 bg-white border border-[#E8E4DF] p-2.5 text-secondary text-sm
                    uppercase tracking-wider hover:text-on-surface hover:border-on-surface/30 rounded-lg transition-all duration-200"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="flex-1 bg-dash-blue text-white p-2.5 text-sm font-headline
                    uppercase tracking-wider hover:bg-dash-blue-deep rounded-lg transition-colors duration-200
                    disabled:opacity-50"
                >
                  {applying ? t("dashboard.applying") : t("common.apply")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
