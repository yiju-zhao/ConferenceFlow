const { db, FieldValue } = require("../../../../lib/firebase-admin");
const { requireConfAdmin, AuthError } = require("../../../../lib/auth-middleware");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { confId } = req.query;
    const decoded = await requireConfAdmin(req, confId);
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const memberRef = db.collection("conferences").doc(confId).collection("members").doc(userId);
    const snap = await memberRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Member not found" });
    if (snap.data().status !== "pending") return res.status(400).json({ error: "Member is not in pending status" });
    await memberRef.update({ status: "approved", approvedAt: FieldValue.serverTimestamp(), approvedBy: decoded.uid });
    res.json({ userId, status: "approved" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
