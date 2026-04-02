const { db, FieldValue } = require("../../../../lib/firebase-admin");
const { requireConfAdmin, AuthError } = require("../../../../lib/auth-middleware");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { confId } = req.query;
    await requireConfAdmin(req, confId);
    const { sessions } = req.body;
    if (!Array.isArray(sessions) || sessions.length === 0) return res.status(400).json({ error: "sessions array is required" });
    if (sessions.length > 1000) return res.status(400).json({ error: "Maximum 1000 sessions per upload" });

    const col = db.collection("conferences").doc(confId).collection("sessions");
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
    res.json({ message: `Uploaded ${results.created} sessions`, created: results.created, errors: results.errors });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
