import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request, { params }) {
  try {
    const { confId } = await params;
    const decoded = await requireConfAdmin(request, confId);
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const memberRef = db
      .collection("conferences")
      .doc(confId)
      .collection("members")
      .doc(userId);

    const snap = await memberRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (snap.data().status !== "pending") {
      return NextResponse.json({ error: "Member is not in pending status" }, { status: 400 });
    }

    await memberRef.update({
      status: "approved",
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: decoded.uid,
    });

    return NextResponse.json({ userId, status: "approved" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
