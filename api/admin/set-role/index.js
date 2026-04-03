const { auth, db, FieldValue } = require("../../lib/firebase-admin");
const { requireSuperAdmin, AuthError } = require("../../lib/auth-middleware");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await requireSuperAdmin(req);
    const { userId, globalRole, confId, confRole } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    if (globalRole) {
      if (!["super_admin", "user"].includes(globalRole)) return res.status(400).json({ error: "Invalid globalRole" });
      await db.collection("users").doc(userId).update({ globalRole });
      await auth.setCustomUserClaims(userId, { globalRole });
    }
    if (confId && confRole) {
      if (!["admin", "member"].includes(confRole)) return res.status(400).json({ error: "Invalid confRole" });
      const memberRef = db.collection("conferences").doc(confId).collection("members").doc(userId);
      const snap = await memberRef.get();
      if (snap.exists) {
        await memberRef.update({ role: confRole });
      } else {
        await memberRef.set({
          role: confRole, status: "approved", attendanceMode: "onsite", colorIndex: 0,
          appliedAt: FieldValue.serverTimestamp(), approvedAt: FieldValue.serverTimestamp(), approvedBy: "super_admin",
        });
      }
    }
    res.json({ userId, globalRole, confId, confRole });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
