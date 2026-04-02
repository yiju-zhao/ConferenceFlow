import { NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase-admin";
import { requireSuperAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request) {
  try {
    await requireSuperAdmin(request);
    const body = await request.json();
    const { userId, globalRole, confId, confRole } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (globalRole) {
      if (!["super_admin", "user"].includes(globalRole)) {
        return NextResponse.json({ error: "Invalid globalRole" }, { status: 400 });
      }
      await db.collection("users").doc(userId).update({ globalRole });
      await auth.setCustomUserClaims(userId, { globalRole });
    }

    if (confId && confRole) {
      if (!["admin", "member"].includes(confRole)) {
        return NextResponse.json({ error: "Invalid confRole" }, { status: 400 });
      }

      const memberRef = db
        .collection("conferences")
        .doc(confId)
        .collection("members")
        .doc(userId);

      const snap = await memberRef.get();
      if (snap.exists) {
        await memberRef.update({ role: confRole });
      } else {
        await memberRef.set({
          role: confRole,
          status: "approved",
          attendanceMode: "onsite",
          colorIndex: 0,
          appliedAt: FieldValue.serverTimestamp(),
          approvedAt: FieldValue.serverTimestamp(),
          approvedBy: "super_admin",
        });
      }
    }

    return NextResponse.json({ userId, globalRole, confId, confRole });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
