const { db, FieldValue } = require("../../../lib/firebase-admin");
const { requireConfAdmin, AuthError } = require("../../../lib/auth-middleware");

module.exports = async (req, res) => {
  const { confId } = req.query;
  try {
    if (req.method === "GET") {
      const snap = await db.collection("conferences").doc(confId).collection("sessions").get();
      return res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    if (req.method === "POST") {
      await requireConfAdmin(req, confId);
      const { code, title, date, start, end, room, speakers, format, recording, sessionType, mainTopic, url, keyThemes } = req.body;
      if (!title || !date || !start || !end) return res.status(400).json({ error: "title, date, start, and end are required" });
      const ref = db.collection("conferences").doc(confId).collection("sessions").doc();
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
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
