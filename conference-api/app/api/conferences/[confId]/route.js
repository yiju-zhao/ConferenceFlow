import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, requireSuperAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function PUT(request, { params }) {
  try {
    const { confId } = await params;
    await requireConfAdmin(request, confId);
    const body = await request.json();

    const allowedFields = ["name", "description", "startDate", "endDate", "visibility", "joinCode"];
    const updates = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }
    updates.updatedAt = FieldValue.serverTimestamp();

    const confRef = db.collection("conferences").doc(confId);
    const snap = await confRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }

    await confRef.update(updates);
    return NextResponse.json({ id: confId, ...updates });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { confId } = await params;
    await requireSuperAdmin(request);

    const confRef = db.collection("conferences").doc(confId);
    const snap = await confRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }

    // Delete subcollections: members, sessions, dailyReports
    const subcollections = ["members", "sessions", "dailyReports"];
    for (const sub of subcollections) {
      const subSnap = await confRef.collection(sub).get();
      const batch = db.batch();
      subSnap.docs.forEach((d) => batch.delete(d.ref));
      if (subSnap.size > 0) await batch.commit();
    }

    await confRef.delete();
    return NextResponse.json({ id: confId, deleted: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const { confId } = await params;
    const confRef = db.collection("conferences").doc(confId);
    const snap = await confRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }
    return NextResponse.json({ id: confId, ...snap.data() });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
