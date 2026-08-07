import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, FieldValue } from "../../../lib/firebase-admin.js";
import { requireConfAdmin, AuthError } from "../../../lib/auth-middleware.js";
import type { ReportActionResponse } from "@/types/api";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const confId = req.query.confId as string;
  const reportId = req.query.reportId as string;
  try {
    await requireConfAdmin(req, confId);
    const ref = db.collection("conferences").doc(confId).collection("dailyReports").doc(reportId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Report not found" });
    if (req.method === "POST") {
      await ref.update({ status: "published", publishedAt: FieldValue.serverTimestamp() });
      return res.json({ reportId, status: "published" } satisfies ReportActionResponse);
    }
    if (req.method === "DELETE") {
      await ref.update({ status: "draft", publishedAt: null });
      return res.json({ reportId, status: "draft" } satisfies ReportActionResponse);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
