import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, FieldValue } from "../../lib/firebase-admin";
import { requireConfAdmin, requireSuperAdmin, AuthError } from "../../lib/auth-middleware";
import type { UpdateConferenceBody } from "@/types/api";
import type { Conference } from "@/types/firestore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const confId = req.query.confId as string;
  try {
    if (req.method === "GET") {
      const snap = await db.collection("conferences").doc(confId).get();
      if (!snap.exists) return res.status(404).json({ error: "Conference not found" });
      const data = snap.data() as Omit<Conference, "id">;
      return res.json({ id: confId, ...data });
    }
    if (req.method === "PUT") {
      await requireConfAdmin(req, confId);
      const allowedFields = [
        "name",
        "description",
        "startDate",
        "endDate",
        "visibility",
        "joinCode",
      ] as const;
      const body = req.body as UpdateConferenceBody;
      const updates: Record<string, unknown> = {};
      for (const f of allowedFields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
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
      await Promise.all(
        ["members", "sessions", "dailyReports"].map(async (sub) => {
          const subSnap = await ref.collection(sub).get();
          if (subSnap.size === 0) return;
          const batch = db.batch();
          subSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }),
      );
      await ref.delete();
      return res.json({ id: confId, deleted: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
