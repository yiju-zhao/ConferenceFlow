import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import UserAvatar, { FirstTimeNameSetup } from "./UserAvatar";

export default function Dashboard() {
  const { user, userProfile, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
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
      } else if (!membership && (conf.visibility === "public" || isSuperAdmin)) {
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
        }
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
      (c) => c.visibility === "private" && c.joinCode === code
    );
    if (!match) {
      setJoinError("Invalid join code");
      return;
    }

    setApplyModal({ confId: match.id, confName: match.name });
    setJoinCode("");
  };

  const ConferenceCard = ({ conf, membership, showApply = false }) => {
    return (
    <div className="bg-surface-container-lowest p-4 mb-2">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-headline text-on-surface font-bold text-base">
            {membership?.status === "approved" ? (
              <Link
                to={`/conference/${conf.id}`}
                className="text-on-surface hover:text-primary transition-colors"
              >
                {conf.name}
              </Link>
            ) : (
              conf.name
            )}
          </h3>
          <p className="text-secondary text-xs mt-1">
            {conf.startDate} — {conf.endDate}
          </p>
          {conf.description && (
            <p className="text-secondary text-sm mt-2 line-clamp-2">{conf.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {membership?.status === "approved" && (
            <span className="text-xs px-2 py-0.5 bg-[#27AE60]/10 text-[#27AE60] uppercase tracking-wider">
              {membership.attendanceMode}
            </span>
          )}
          {membership?.status === "pending" && (
            <span className="text-xs px-2 py-0.5 bg-[#E67E22]/10 text-[#E67E22] uppercase tracking-wider">
              Pending Approval
            </span>
          )}
          {membership?.role === "admin" && (
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary uppercase tracking-wider">
              Admin
            </span>
          )}
        </div>
      </div>
      {showApply && !membership && (
        <button
          onClick={() => setApplyModal({ confId: conf.id, confName: conf.name })}
          className="mt-3 bg-primary text-on-primary px-4 py-2 text-xs font-headline
            uppercase tracking-wider hover:bg-primary-container transition-colors duration-50"
        >
          Apply to Join
        </button>
      )}
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      <FirstTimeNameSetup />
      <div className="bg-primary p-4 flex justify-between items-center">
        <h1 className="font-headline text-on-primary text-xl font-bold tracking-tight">
          CONFERENCEFLOW
        </h1>
        <div className="flex items-center gap-4">
          {isSuperAdmin && (
            <Link
              to="/super-admin"
              className="text-on-primary/70 text-xs uppercase tracking-wider hover:text-on-primary"
            >
              Admin Panel
            </Link>
          )}
          <UserAvatar size={32} onSignOut={() => navigate("/login")} />
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {!membershipsReady ? (
          /* Skeleton loading state */
          <div className="animate-pulse">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 bg-surface-dim inline-block"></span>
              <div className="h-5 w-48 bg-surface-container"></div>
            </div>
            {[1, 2].map((i) => (
              <div key={i} className="bg-surface-container-lowest p-4 mb-2">
                <div className="h-4 w-64 bg-surface-container mb-2"></div>
                <div className="h-3 w-40 bg-surface-dim"></div>
              </div>
            ))}
            <div className="flex items-center gap-2 mb-4 mt-8">
              <span className="w-1 h-5 bg-surface-dim inline-block"></span>
              <div className="h-5 w-32 bg-surface-container"></div>
            </div>
            {[1].map((i) => (
              <div key={i} className="bg-surface-container-lowest p-4 mb-2">
                <div className="h-4 w-56 bg-surface-container mb-2"></div>
                <div className="h-3 w-36 bg-surface-dim"></div>
              </div>
            ))}
          </div>
        ) : (<>
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-5 bg-primary inline-block"></span>
            <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
              My Conferences
            </h2>
          </div>
          {upcoming.length === 0 && (
            <p className="text-secondary text-sm">No upcoming conferences. Browse the discover section below to join one.</p>
          )}
          {upcoming.map((conf) => (
            <ConferenceCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} />
          ))}
        </section>

        {pending.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1 h-5 bg-[#E67E22] inline-block"></span>
              <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
                Pending Applications
              </h2>
            </div>
            {pending.map((conf) => (
              <ConferenceCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} />
            ))}
          </section>
        )}

        <section className="mb-8">
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-2 text-secondary text-sm hover:text-on-surface transition-colors"
          >
            <span>{showPast ? "▼" : "▶"}</span>
            <span className="uppercase tracking-wider">Past Conferences ({past.length})</span>
          </button>
          {showPast && past.length > 0 && (
            <div className="mt-3">
              {past.map((conf) => (
                <ConferenceCard key={conf.id} conf={conf} membership={myMemberships[conf.id]} />
              ))}
            </div>
          )}
        </section>

        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-5 bg-primary inline-block"></span>
            <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">
              Discover
            </h2>
          </div>

          <div className="bg-surface-container-lowest p-4 mb-4 flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-1">
                Join Private Conference
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Enter join code"
                className="w-full bg-surface-container-high p-2 text-on-surface text-sm
                  border-0 border-b-2 border-transparent focus:border-primary focus:outline-none"
              />
            </div>
            <button
              onClick={handleJoinByCode}
              className="bg-surface-container px-4 py-2 text-secondary text-xs
                uppercase tracking-wider hover:text-on-surface transition-colors"
            >
              Join
            </button>
          </div>
          {joinError && (
            <div className="bg-primary/10 text-primary text-sm p-2 mb-3">{joinError}</div>
          )}

          {discover.length === 0 && (
            <p className="text-secondary text-sm">No public conferences available to join.</p>
          )}
          {discover.map((conf) => (
            <ConferenceCard key={conf.id} conf={conf} showApply />
          ))}
        </section>
        </>)}
      </div>

      {applyModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setApplyModal(null)}
        >
          <div
            className="bg-surface-container-lowest p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline text-on-surface font-bold text-base mb-1">
              Apply to Join
            </h3>
            <p className="text-secondary text-sm mb-4">{applyModal.confName}</p>

            <div className="mb-4">
              <label className="block text-secondary text-xs uppercase tracking-wider mb-2">
                Attendance Mode
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setAttendanceMode("onsite")}
                  className={`flex-1 p-3 text-sm font-headline uppercase tracking-wider
                    ${attendanceMode === "onsite"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-secondary hover:text-on-surface"
                    } transition-colors duration-50`}
                >
                  Onsite
                </button>
                <button
                  onClick={() => setAttendanceMode("online")}
                  className={`flex-1 p-3 text-sm font-headline uppercase tracking-wider
                    ${attendanceMode === "online"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container text-secondary hover:text-on-surface"
                    } transition-colors duration-50`}
                >
                  Online
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setApplyModal(null)}
                className="flex-1 bg-surface-container p-2 text-secondary text-sm
                  uppercase tracking-wider hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex-1 bg-primary text-on-primary p-2 text-sm font-headline
                  uppercase tracking-wider hover:bg-primary-container transition-colors duration-50
                  disabled:opacity-50"
              >
                {applying ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
