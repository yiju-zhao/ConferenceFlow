import { db, FieldValue } from "../../lib/firebase-admin.js";
import { requireConfAdmin, requireSuperAdmin, AuthError } from "../../lib/auth-middleware.js";

export default async function handler(req, res) {
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
      for (const f of allowedFields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
      updates.updatedAt = FieldValue.serverTimestamp();
      const ref = db.collection("conferences").doc(confId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Conference not found" });
      await ref.update(updates);
      return res.json({ id: confId, ...updates });
    }
    if (req.method === "DELETE") {
      await requireSuperAdmin(req);
      const ref = db.collection("conferences").doc(confId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Conference not found" });
      for (const sub of ["members", "sessions", "dailyReports"]) {
        const subSnap = await ref.collection(sub).get();
        const batch = db.batch();
        subSnap.docs.forEach((d) => batch.delete(d.ref));
        if (subSnap.size > 0) await batch.commit();
      }
      await ref.delete();
      return res.json({ id: confId, deleted: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
}
