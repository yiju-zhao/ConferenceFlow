import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireSuperAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request) {
  try {
    const decoded = await requireSuperAdmin(request);
    const body = await request.json();

    const { name, description, startDate, endDate, visibility } = body;

    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: "name, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    const confRef = db.collection("conferences").doc();
    const confData = {
      name,
      description: description || "",
      startDate,
      endDate,
      visibility: visibility || "public",
      joinCode: visibility === "private" ? generateJoinCode() : "",
      createdBy: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await confRef.set(confData);

    return NextResponse.json({ id: confRef.id, ...confData }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
