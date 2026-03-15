/**
 * GTC 2026 – PDF Export Server
 *
 * Uses Playwright (Chromium) to render the report page and return a
 * true vector PDF (text is selectable / not rasterised to an image).
 *
 * Start alongside the Vite dev server:
 *   npm run dev        (runs both via concurrently)
 *   npm run server     (just this server)
 */

import { chromium } from "playwright";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

// ── PDF endpoint ─────────────────────────────────────────────────────────────
app.get("/api/pdf", async (req, res) => {
  const { url, filename = "GTC2026_report.pdf" } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    console.log(`[PDF] Navigating to: ${decodeURIComponent(url)}`);
    await page.goto(decodeURIComponent(url), {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait until Firebase has loaded all data and the report is rendered
    console.log("[PDF] Waiting for report content...");
    await page.waitForSelector("[data-pdf-ready]", { timeout: 20000 });

    // Small buffer for last renders (illustrations, fonts)
    await page.waitForTimeout(800);

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
  console.log(`\n PDF server running → http://localhost:${PORT}/api/pdf\n`);
});
