export default async function handler(req, res) {
  const { id } = req.query;
  const bucket = "gtc-2026-session-daal.firebasestorage.app";
  const path = encodeURIComponent(`published-reports/${id}.html`);
  const storageUrl = `https://storage.googleapis.com/${bucket}/${path}`;

  const response = await fetch(storageUrl);
  if (!response.ok) {
    return res.status(404).send("Report not found");
  }
  const html = await response.text();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}
