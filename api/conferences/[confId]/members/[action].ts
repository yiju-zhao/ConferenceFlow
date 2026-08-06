import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, FieldValue } from "../../../lib/firebase-admin";
import { requireConfAdmin, AuthError } from "../../../lib/auth-middleware";
import type { MemberActionBody, MemberActionResponse } from "@/types/api";
import type { Member } from "@/types/firestore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const confId = req.query.confId as string;
  const action = req.query.action as string;
  if (!["approve", "reject"].includes(action)) return res.status(404).json({ error: "Not found" });
  try {
    const decoded = await requireConfAdmin(req, confId);
    const { userId } = req.body as MemberActionBody;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const memberRef = db.collection("conferences").doc(confId).collection("members").doc(userId);
    const snap = await memberRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Member not found" });
    const member = snap.data() as Pick<Member, "status">;
    if (member.status !== "pending")
      return res.status(400).json({ error: "Member is not in pending status" });
    if (action === "approve") {
      await memberRef.update({
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: decoded.uid,
      });
    } else {
      await memberRef.update({ status: "rejected" });
    }
    res.json({
      userId,
      status: action === "approve" ? "approved" : "rejected",
    } satisfies MemberActionResponse);
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
