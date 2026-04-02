const { db, FieldValue } = require("../../../lib/firebase-admin");
const { requireConfAdmin, AuthError } = require("../../../lib/auth-middleware");

module.exports = async (req, res) => {
  const { confId, path } = req.query;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const col = db.collection("conferences").doc(confId).collection("sessions");

  try {
    // GET /api/conferences/{confId}/sessions — list all
    if (req.method === "GET" && segments.length === 0) {
      const snap = await col.get();
      return res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    // POST /api/conferences/{confId}/sessions — create one
    if (req.method === "POST" && segments.length === 0) {
      await requireConfAdmin(req, confId);
      const { code, title, date, start, end, room, speakers, format, recording, sessionType, mainTopic, url, keyThemes } = req.body;
      if (!title || !date || !start || !end) return res.status(400).json({ error: "title, date, start, and end are required" });
      const ref = col.doc();
      const data = {
        code: code || "", title, date, start, end, room: room || "",
        speakers: speakers || [], format: format || "", recording: recording || "",
        sessionType: sessionType || "", mainTopic: mainTopic || "", url: url || "",
        keyThemes: keyThemes || [], attendees: [],
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      };
      await ref.set(data);
      return res.status(201).json({ id: ref.id, ...data });
    }

    // POST /api/conferences/{confId}/sessions/bulk — bulk upload
    if (req.method === "POST" && segments[0] === "bulk") {
      await requireConfAdmin(req, confId);
      const { sessions } = req.body;
      if (!Array.isArray(sessions) || sessions.length === 0) return res.status(400).json({ error: "sessions array is required" });
      if (sessions.length > 1000) return res.status(400).json({ error: "Maximum 1000 sessions per upload" });
      const results = { created: 0, errors: [] };
      for (let i = 0; i < sessions.length; i += 500) {
        const chunk = sessions.slice(i, i + 500);
        const batch = db.batch();
        for (const s of chunk) {
          if (!s.title || !s.date || !s.start || !s.end) {
            results.errors.push({ index: i + chunk.indexOf(s), error: "Missing required fields", session: s.title || "(no title)" });
            continue;
          }
          const ref = s.session_id ? col.doc(s.session_id) : col.doc();
          batch.set(ref, {
            code: s.session_id || s.code || "", title: s.title,
            date: s.date, start: s.start || s.time?.split(" - ")[0] || "", end: s.end || s.time?.split(" - ")[1] || "",
            room: s.location || s.room || "", speakers: Array.isArray(s.speakers) ? s.speakers : [],
            format: s.format || "", recording: s.recording || "",
            sessionType: s.session_type || s.sessionType || "", mainTopic: s.topic || s.mainTopic || "",
            url: s.url || "", keyThemes: Array.isArray(s.key_themes) ? s.key_themes : [],
            attendees: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          });
          results.created++;
        }
        await batch.commit();
      }
      return res.json({ message: `Uploaded ${results.created} sessions`, created: results.created, errors: results.errors });
    }

    // PUT/DELETE /api/conferences/{confId}/sessions/{sessionId}
    if (segments.length === 1 && segments[0] !== "bulk") {
      const sessionId = segments[0];
      await requireConfAdmin(req, confId);
      const ref = col.doc(sessionId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Session not found" });

      if (req.method === "PUT") {
        const allowedFields = ["code", "title", "date", "start", "end", "room", "speakers", "format", "recording", "sessionType", "mainTopic", "url", "keyThemes"];
        const updates = {};
        for (const f of allowedFields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
        updates.updatedAt = FieldValue.serverTimestamp();
        await ref.update(updates);
        return res.json({ id: sessionId, ...updates });
      }
      if (req.method === "DELETE") {
        await ref.delete();
        return res.json({ id: sessionId, deleted: true });
      }
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
