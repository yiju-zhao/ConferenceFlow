import { auth } from "@/lib/firebase-admin";

export async function verifyAuth(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch (error) {
    throw new AuthError("Invalid or expired token", 401);
  }
}

export async function requireSuperAdmin(request) {
  const decoded = await verifyAuth(request);
  if (decoded.globalRole !== "super_admin") {
    throw new AuthError("Super admin access required", 403);
  }
  return decoded;
}

export async function requireConfAdmin(request, confId) {
  const decoded = await verifyAuth(request);
  if (decoded.globalRole === "super_admin") return decoded;

  const { db } = await import("@/lib/firebase-admin");
  const memberSnap = await db
    .collection("conferences")
    .doc(confId)
    .collection("members")
    .doc(decoded.uid)
    .get();

  if (!memberSnap.exists) {
    throw new AuthError("Not a member of this conference", 403);
  }

  const member = memberSnap.data();
  if (member.status !== "approved" || member.role !== "admin") {
    throw new AuthError("Conference admin access required", 403);
  }

  return decoded;
}

export async function requireMember(request, confId) {
  const decoded = await verifyAuth(request);
  if (decoded.globalRole === "super_admin") return decoded;

  const { db } = await import("@/lib/firebase-admin");
  const memberSnap = await db
    .collection("conferences")
    .doc(confId)
    .collection("members")
    .doc(decoded.uid)
    .get();

  if (!memberSnap.exists || memberSnap.data().status !== "approved") {
    throw new AuthError("Approved membership required", 403);
  }

  return decoded;
}

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}
