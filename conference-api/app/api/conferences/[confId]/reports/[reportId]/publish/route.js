import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request, { params }) {
  try {
    const { confId, reportId } = await params;
    await requireConfAdmin(request, confId);
    const reportRef = db.collection("conferences").doc(confId).collection("dailyReports").doc(reportId);
    const snap = await reportRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    await reportRef.update({ status: "published", publishedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ reportId, status: "published" });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { confId, reportId } = await params;
    await requireConfAdmin(request, confId);
    const reportRef = db.collection("conferences").doc(confId).collection("dailyReports").doc(reportId);
    const snap = await reportRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    await reportRef.update({ status: "draft", publishedAt: null });
    return NextResponse.json({ reportId, status: "draft" });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
