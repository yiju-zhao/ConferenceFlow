import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string;
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
