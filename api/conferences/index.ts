import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, FieldValue } from "../lib/firebase-admin.js";
import { requireSuperAdmin, AuthError } from "../lib/auth-middleware.js";
import type {
  CreateConferenceBody,
  CreateConferenceResponse,
  ConferenceWriteData,
} from "@/types/api";

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const decoded = await requireSuperAdmin(req);
    const { name, description, startDate, endDate, visibility, type } = req.body as CreateConferenceBody;
    if (!name || !startDate || !endDate)
      return res.status(400).json({ error: "name, startDate, and endDate are required" });
    if (type !== undefined && type !== "industry" && type !== "academic")
      return res.status(400).json({ error: "invalid conference type" });
    const confRef = db.collection("conferences").doc();
    const confData: ConferenceWriteData = {
      name,
      description: description || "",
      startDate,
      endDate,
      visibility: visibility || "public",
      type: type ?? "industry",
      joinCode: visibility === "private" ? generateJoinCode() : "",
      createdBy: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await confRef.set(confData);
    res.status(201).json({ id: confRef.id, ...confData } satisfies CreateConferenceResponse);
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
