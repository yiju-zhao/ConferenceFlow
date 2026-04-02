import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";

export default function AdminApplications() {
  const { confId } = useParams();
  const [members, setMembers] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [processing, setProcessing] = useState(null);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    return onSnapshot(collection(db, "conferences", confId, "members"), async (snap) => {
      const arr = snap.docs.map((d) => ({ userId: d.id, ...d.data() }));
      setMembers(arr);
      const names = {};
      for (const m of arr) {
        if (m.legacyName) { names[m.userId] = m.legacyName + " (legacy)"; }
        else {
          try {
            const userSnap = await getDoc(doc(db, "users", m.userId));
            names[m.userId] = userSnap.exists() ? userSnap.data().displayName || userSnap.data().email : m.userId;
          } catch { names[m.userId] = m.userId; }
        }
      }
      setUserNames(names);
    });
  }, [confId]);

  const handleApprove = async (userId) => {
    setProcessing(userId);
    try { await apiFetch(`/api/conferences/${confId}/members/approve`, { method: "POST", body: JSON.stringify({ userId }) }); }
    catch (err) { alert(`Error: ${err.message}`); }
    finally { setProcessing(null); }
  };

  const handleReject = async (userId) => {
    setProcessing(userId);
    try { await apiFetch(`/api/conferences/${confId}/members/reject`, { method: "POST", body: JSON.stringify({ userId }) }); }
    catch (err) { alert(`Error: ${err.message}`); }
    finally { setProcessing(null); }
  };

  const filtered = members.filter((m) => filter === "all" ? true : m.status === filter);
  const pendingCount = members.filter((m) => m.status === "pending").length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">Member Applications</h2>
        {pendingCount > 0 && <span className="bg-[#E67E22]/10 text-[#E67E22] text-xs px-2 py-0.5 uppercase tracking-wider">{pendingCount} pending</span>}
      </div>
      <div className="flex gap-1 mb-4">
        {[{ key: "pending", label: "Pending" }, { key: "approved", label: "Approved" }, { key: "all", label: "All" }].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-xs font-headline uppercase tracking-wider transition-colors duration-50 ${filter === f.key ? "bg-primary text-on-primary" : "bg-surface-container text-secondary hover:text-on-surface"}`}>{f.label}</button>
        ))}
      </div>
      <div className="bg-surface-container-lowest">
        {filtered.length === 0 && <div className="p-6 text-center text-secondary text-sm">{filter === "pending" ? "No pending applications" : "No members found"}</div>}
        {filtered.map((m) => (
          <div key={m.userId} className="p-4 border-b border-surface-dim flex justify-between items-center">
            <div>
              <div className="text-on-surface font-bold text-sm">{userNames[m.userId] || m.userId}</div>
              <div className="text-secondary text-xs mt-1 flex gap-3">
                <span>{m.attendanceMode || "onsite"}</span>
                <span>Role: {m.role}</span>
                <span className={`uppercase tracking-wider ${m.status === "approved" ? "text-[#27AE60]" : m.status === "pending" ? "text-[#E67E22]" : "text-primary"}`}>{m.status}</span>
              </div>
            </div>
            {m.status === "pending" && (
              <div className="flex gap-2">
                <button onClick={() => handleApprove(m.userId)} disabled={processing === m.userId}
                  className="bg-[#27AE60] text-white px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:opacity-80 transition-opacity disabled:opacity-50">Approve</button>
                <button onClick={() => handleReject(m.userId)} disabled={processing === m.userId}
                  className="bg-surface-container text-secondary px-4 py-1.5 text-xs font-headline uppercase tracking-wider hover:text-primary transition-colors disabled:opacity-50">Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
