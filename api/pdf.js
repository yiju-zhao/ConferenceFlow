import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const { url, filename = "GTC2026_report.pdf" } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  let browser;
  try {
    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(decodeURIComponent(url), { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector("[data-pdf-ready]", { timeout: 20000 });
    await page.waitForTimeout(800);

    await page.addStyleTag({
      content: `
        .report-nav-bar, .report-toolbar, .no-print { display: none !important; }
        .report-editable { border: none !important; outline: none !important; }
        .report-inline-editable { border-bottom: none !important; }
      `,
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });

    const safeFilename = encodeURIComponent(filename);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeFilename}`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error("[PDF] Error:", err.message);
    const isTimeout = err.name === "TimeoutError" || err.message.includes("timeout");
    res.status(isTimeout ? 504 : 500).json({ error: err.message });
  } finally {
    await browser?.close();
  }
}
