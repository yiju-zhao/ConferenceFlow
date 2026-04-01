import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireConfAdmin, AuthError } from "@/lib/auth-middleware";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request, { params }) {
  try {
    const { confId } = await params;
    await requireConfAdmin(request, confId);
    const body = await request.json();
    const { sessions } = body;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({ error: "sessions array is required" }, { status: 400 });
    }
    if (sessions.length > 1000) {
      return NextResponse.json({ error: "Maximum 1000 sessions per upload" }, { status: 400 });
    }
    const sessionsCol = db.collection("conferences").doc(confId).collection("sessions");
    const results = { created: 0, errors: [] };
    const batchSize = 500;
    for (let i = 0; i < sessions.length; i += batchSize) {
      const chunk = sessions.slice(i, i + batchSize);
      const batch = db.batch();
      for (const session of chunk) {
        if (!session.title || !session.date || !session.start || !session.end) {
          results.errors.push({
            index: i + chunk.indexOf(session),
            error: "Missing required fields: title, date, start, end",
            session: session.title || "(no title)",
          });
          continue;
        }
        const ref = session.session_id ? sessionsCol.doc(session.session_id) : sessionsCol.doc();
        batch.set(ref, {
          code: session.session_id || session.code || "",
          title: session.title,
          date: session.date,
          start: session.start || session.time?.split(" - ")[0] || "",
          end: session.end || session.time?.split(" - ")[1] || "",
          room: session.location || session.room || "",
          speakers: Array.isArray(session.speakers) ? session.speakers : [],
          format: session.format || "",
          recording: session.recording || "",
          sessionType: session.session_type || session.sessionType || "",
          mainTopic: session.topic || session.mainTopic || "",
          url: session.url || "",
          keyThemes: Array.isArray(session.key_themes) ? session.key_themes : [],
          attendees: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.created++;
      }
      await batch.commit();
    }
    return NextResponse.json({ message: `Uploaded ${results.created} sessions`, created: results.created, errors: results.errors });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
