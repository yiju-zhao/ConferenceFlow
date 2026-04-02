import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request, { params }) {
  try {
    const { confId } = await params;
    await requireConfAdmin(request, confId);
    const body = await request.json();
    const { code, title, date, start, end, room, speakers, format, recording, sessionType, mainTopic, url, keyThemes } = body;
    if (!title || !date || !start || !end) {
      return NextResponse.json({ error: "title, date, start, and end are required" }, { status: 400 });
    }
    const sessionRef = db.collection("conferences").doc(confId).collection("sessions").doc();
    const sessionData = {
      code: code || "", title, date, start, end,
      room: room || "", speakers: speakers || [], format: format || "",
      recording: recording || "", sessionType: sessionType || "",
      mainTopic: mainTopic || "", url: url || "", keyThemes: keyThemes || [],
      attendees: [],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    await sessionRef.set(sessionData);
    return NextResponse.json({ id: sessionRef.id, ...sessionData }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const { confId } = await params;
    const snap = await db.collection("conferences").doc(confId).collection("sessions").get();
    const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json(sessions);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
