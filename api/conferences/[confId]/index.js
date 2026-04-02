const { db, FieldValue } = require("../../lib/firebase-admin");
const { requireConfAdmin, requireSuperAdmin, AuthError } = require("../../lib/auth-middleware");

module.exports = async (req, res) => {
  const { confId } = req.query;
  try {
    if (req.method === "GET") {
      const snap = await db.collection("conferences").doc(confId).get();
      if (!snap.exists) return res.status(404).json({ error: "Conference not found" });
      return res.json({ id: confId, ...snap.data() });
    }
    if (req.method === "PUT") {
      await requireConfAdmin(req, confId);
      const allowedFields = ["name", "description", "startDate", "endDate", "visibility", "joinCode"];
      const updates = {};
      for (const field of allowedFields) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
      updates.updatedAt = FieldValue.serverTimestamp();
      const confRef = db.collection("conferences").doc(confId);
      const snap = await confRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Conference not found" });
      await confRef.update(updates);
      return res.json({ id: confId, ...updates });
    }
    if (req.method === "DELETE") {
      await requireSuperAdmin(req);
      const confRef = db.collection("conferences").doc(confId);
      const snap = await confRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Conference not found" });
      for (const sub of ["members", "sessions", "dailyReports"]) {
        const subSnap = await confRef.collection(sub).get();
        const batch = db.batch();
        subSnap.docs.forEach((d) => batch.delete(d.ref));
        if (subSnap.size > 0) await batch.commit();
      }
      await confRef.delete();
      return res.json({ id: confId, deleted: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
