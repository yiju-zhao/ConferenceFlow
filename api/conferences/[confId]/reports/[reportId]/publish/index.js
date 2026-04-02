const { db, FieldValue } = require("../../../../../lib/firebase-admin");
const { requireConfAdmin, AuthError } = require("../../../../../lib/auth-middleware");

module.exports = async (req, res) => {
  const { confId, reportId } = req.query;
  try {
    const reportRef = db.collection("conferences").doc(confId).collection("dailyReports").doc(reportId);
    const snap = await reportRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Report not found" });

    if (req.method === "POST") {
      await requireConfAdmin(req, confId);
      await reportRef.update({ status: "published", publishedAt: FieldValue.serverTimestamp() });
      return res.json({ reportId, status: "published" });
    }
    if (req.method === "DELETE") {
      await requireConfAdmin(req, confId);
      await reportRef.update({ status: "draft", publishedAt: null });
      return res.json({ reportId, status: "draft" });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
