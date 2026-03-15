/**
 * GTC 2026 – PDF Export Server
 *
 * Uses Puppeteer to render the report page in a real Chromium browser and
 * return a true vector PDF (text is selectable / not rasterised to image).
 *
 * Start alongside the Vite dev server:
 *   npm run dev        (runs both via concurrently)
 *   npm run server     (just this server)
 *
 * Chrome / Chromium must be installed on the host machine.
 * Set the CHROME_PATH env variable if it's not in a standard location.
 *
 *   Linux:   /usr/bin/google-chrome  or  /usr/bin/chromium-browser
 *   macOS:   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 *   Windows: C:\Program Files\Google\Chrome\Application\chrome.exe
 */

import puppeteer from "puppeteer-core";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

// ── Resolve Chrome executable ────────────────────────────────────────────────
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Windows (puppeteer resolves these via process.env on win32)
  ];
  for (const p of candidates) {
    try {
      const { existsSync } = await import("fs");
      if (existsSync(p)) return p;
    } catch {}
  }
  return null;
}

// ── PDF endpoint ─────────────────────────────────────────────────────────────
app.get("/api/pdf", async (req, res) => {
  const { url, filename = "GTC2026_report.pdf" } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  const executablePath = process.env.CHROME_PATH
    || "/usr/bin/google-chrome"
    || "/usr/bin/chromium-browser"
    || "/usr/bin/chromium";

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    console.log(`[PDF] Navigating to: ${url}`);
    await page.goto(decodeURIComponent(url), {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait until Firebase has loaded all data and the report is rendered
    console.log("[PDF] Waiting for report content...");
    await page.waitForSelector("[data-pdf-ready]", { timeout: 20000 });

    // Small buffer for last renders (illustrations, fonts)
    await new Promise((r) => setTimeout(r, 800));

    // Hide interactive elements that should not appear in the PDF
    await page.addStyleTag({
      content: `
        .report-nav-bar,
        .report-toolbar,
        .no-print { display: none !important; }
        .report-editable { border: none !important; outline: none !important; }
      `,
    });

    console.log("[PDF] Generating PDF...");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });

    const safeFilename = encodeURIComponent(filename);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${safeFilename}`
    );
    res.send(Buffer.from(pdf));
    console.log(`[PDF] Done → ${filename}`);
  } catch (err) {
    console.error("[PDF] Error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await browser?.close();
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PDF_PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n PDF server running → http://localhost:${PORT}/api/pdf`);
  console.log(
    ` Chrome path: ${process.env.CHROME_PATH || "(auto-detect from standard locations)"}\n`
  );
});
