const { db, FieldValue } = require("../lib/firebase-admin");
const { requireSuperAdmin, AuthError } = require("../lib/auth-middleware");

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const decoded = await requireSuperAdmin(req);
    const { name, description, startDate, endDate, visibility } = req.body;
    if (!name || !startDate || !endDate) return res.status(400).json({ error: "name, startDate, and endDate are required" });

    const confRef = db.collection("conferences").doc();
    const confData = {
      name, description: description || "", startDate, endDate,
      visibility: visibility || "public",
      joinCode: visibility === "private" ? generateJoinCode() : "",
      createdBy: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await confRef.set(confData);
    res.status(201).json({ id: confRef.id, ...confData });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
};
