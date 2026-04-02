const { db, FieldValue } = require("../../../lib/firebase-admin");
const { requireConfAdmin, AuthError } = require("../../../lib/auth-middleware");

module.exports = async (req, res) => {
  const { confId, sessionId } = req.query;
  try {
    if (req.method === "PUT") {
      await requireConfAdmin(req, confId);
      const ref = db.collection("conferences").doc(confId).collection("sessions").doc(sessionId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Session not found" });
      const allowedFields = ["code", "title", "date", "start", "end", "room", "speakers", "format", "recording", "sessionType", "mainTopic", "url", "keyThemes"];
      const updates = {};
      for (const f of allowedFields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
      updates.updatedAt = FieldValue.serverTimestamp();
      await ref.update(updates);
      return res.json({ id: sessionId, ...updates });
    }
    if (req.method === "DELETE") {
      await requireConfAdmin(req, confId);
      const ref = db.collection("conferences").doc(confId).collection("sessions").doc(sessionId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Session not found" });
      await ref.delete();
      return res.json({ id: sessionId, deleted: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
