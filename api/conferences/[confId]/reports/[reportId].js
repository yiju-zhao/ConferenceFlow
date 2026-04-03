import { db, FieldValue } from "../../../lib/firebase-admin.js";
import { requireConfAdmin, AuthError } from "../../../lib/auth-middleware.js";

export default async function handler(req, res) {
  const { confId, reportId } = req.query;
  try {
    await requireConfAdmin(req, confId);
    const ref = db.collection("conferences").doc(confId).collection("dailyReports").doc(reportId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Report not found" });
    if (req.method === "POST") { await ref.update({ status: "published", publishedAt: FieldValue.serverTimestamp() }); return res.json({ reportId, status: "published" }); }
    if (req.method === "DELETE") { await ref.update({ status: "draft", publishedAt: null }); return res.json({ reportId, status: "draft" }); }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
}
