import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { apiFetch } from "../../lib/api";
import { parseReportId } from "../../shared";

export default function AdminReports() {
  const { confId } = useParams();
  const [reports, setReports] = useState([]);
  const [publishing, setPublishing] = useState(null);

  useEffect(() => {
    return onSnapshot(collection(db, "conferences", confId, "dailyReports"), (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort((a, b) => b.id.localeCompare(a.id));
      setReports(arr);
    });
  }, [confId]);

  const handlePublish = async (reportId) => {
    setPublishing(reportId);
    try { await apiFetch(`/api/conferences/${confId}/reports/${reportId}`, { method: "POST" }); }
    catch (err) { alert(`Error: ${err.message}`); }
    finally { setPublishing(null); }
  };

  const handleUnpublish = async (reportId) => {
    setPublishing(reportId);
    try { await apiFetch(`/api/conferences/${confId}/reports/${reportId}`, { method: "DELETE" }); }
    catch (err) { alert(`Error: ${err.message}`); }
    finally { setPublishing(null); }
  };

  const statusColor = (status) => {
    switch (status) { case "published": return "text-[#27AE60]"; case "archived": return "text-secondary"; default: return "text-[#E67E22]"; }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-5 bg-primary inline-block"></span>
        <h2 className="font-headline text-on-surface text-lg font-bold uppercase tracking-wider">Report Management</h2>
      </div>
      <div className="bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-secondary text-xs uppercase tracking-wider">
            <th className="p-3">Report</th><th className="p-3">Status</th><th className="p-3">Published</th><th className="p-3 w-48">Actions</th>
          </tr></thead>
          <tbody>
            {reports.map((r) => {
              const { date } = parseReportId(r.id);
              const isSummary = r.id.startsWith("summary-");
              return (
                <tr key={r.id} className="border-t border-surface-dim hover:bg-surface-container-low">
                  <td className="p-3">
                    <Link to={`/conference/${confId}/report/${r.id}`} className="text-on-surface hover:text-primary">{r.title || r.id}</Link>
                    <div className="text-secondary text-xs mt-0.5">{isSummary ? "Summary Report" : `Daily · ${date}`}</div>
                  </td>
                  <td className="p-3"><span className={`text-xs uppercase tracking-wider ${statusColor(r.status)}`}>{r.status || "draft"}</span></td>
                  <td className="p-3 text-secondary text-xs">{r.publishedAt ? new Date(r.publishedAt.seconds * 1000).toLocaleString() : "—"}</td>
                  <td className="p-3">
                    {r.status === "published" ? (
                      <button onClick={() => handleUnpublish(r.id)} disabled={publishing === r.id}
                        className="text-secondary text-xs uppercase tracking-wider hover:text-primary disabled:opacity-50">{publishing === r.id ? "..." : "Unpublish"}</button>
                    ) : (
                      <button onClick={() => handlePublish(r.id)} disabled={publishing === r.id}
                        className="text-primary text-xs uppercase tracking-wider hover:underline disabled:opacity-50">{publishing === r.id ? "..." : "Publish"}</button>
                    )}
                    {r.publishedUrl && <a href={r.publishedUrl} target="_blank" rel="noopener noreferrer"
                      className="text-secondary text-xs uppercase tracking-wider ml-3 hover:text-on-surface">View</a>}
                  </td>
                </tr>
              );
            })}
            {reports.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-secondary text-sm">No reports yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
