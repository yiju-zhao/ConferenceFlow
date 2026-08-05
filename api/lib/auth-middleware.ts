import type { VercelRequest } from "@vercel/node";
import type { DecodedIdToken } from "firebase-admin/auth";
import { auth, db } from "./firebase-admin";

interface DecodedToken extends DecodedIdToken {
  globalRole?: string;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function verifyAuth(req: VercelRequest): Promise<DecodedToken> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    return (await auth.verifyIdToken(token)) as DecodedToken;
  } catch {
    throw new AuthError("Invalid or expired token", 401);
  }
}

export async function requireSuperAdmin(req: VercelRequest): Promise<DecodedToken> {
  const decoded = await verifyAuth(req);
  if (decoded.globalRole !== "super_admin") {
    throw new AuthError("Super admin access required", 403);
  }
  return decoded;
}

export async function requireConfAdmin(req: VercelRequest, confId: string): Promise<DecodedToken> {
  const decoded = await verifyAuth(req);
  if (decoded.globalRole === "super_admin") return decoded;
  const snap = await db.collection("conferences").doc(confId).collection("members").doc(decoded.uid).get();
  if (!snap.exists) throw new AuthError("Not a member of this conference", 403);
  const member = snap.data() as { status?: string; role?: string };
  if (member.status !== "approved" || member.role !== "admin") {
    throw new AuthError("Conference admin access required", 403);
  }
  return decoded;
}

export async function requireMember(req: VercelRequest, confId: string): Promise<DecodedToken> {
  const decoded = await verifyAuth(req);
  if (decoded.globalRole === "super_admin") return decoded;
  const snap = await db.collection("conferences").doc(confId).collection("members").doc(decoded.uid).get();
  if (!snap.exists || (snap.data() as { status?: string }).status !== "approved") {
    throw new AuthError("Approved membership required", 403);
  }
  return decoded;
}
