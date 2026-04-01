import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function PUT(request, { params }) {
  try {
    const { confId, sessionId } = await params;
    await requireConfAdmin(request, confId);
    const body = await request.json();
    const sessionRef = db.collection("conferences").doc(confId).collection("sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const allowedFields = ["code", "title", "date", "start", "end", "room", "speakers", "format", "recording", "sessionType", "mainTopic", "url", "keyThemes"];
    const updates = {};
    for (const field of allowedFields) { if (body[field] !== undefined) updates[field] = body[field]; }
    updates.updatedAt = FieldValue.serverTimestamp();
    await sessionRef.update(updates);
    return NextResponse.json({ id: sessionId, ...updates });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { confId, sessionId } = await params;
    await requireConfAdmin(request, confId);
    const sessionRef = db.collection("conferences").doc(confId).collection("sessions").doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    await sessionRef.delete();
    return NextResponse.json({ id: sessionId, deleted: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
