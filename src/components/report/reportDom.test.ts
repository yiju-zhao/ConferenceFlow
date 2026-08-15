import { expect, it } from "vitest";
import { unwrapReportSectionHeadingRows } from "./reportDom";

it("unwraps editor heading rows while preserving their report heading child", () => {
  const report = document.createElement("section");
  report.innerHTML = `
    <div class="report-section-heading-row">
      <h2 id="section-related" class="report-section-title">Related topics</h2>
      <button class="no-print">Add Session</button>
    </div>
    <p>Report content</p>
  `;
  report.querySelector(".no-print")?.remove();

  unwrapReportSectionHeadingRows(report);

  const heading = report.querySelector("#section-related");
  expect(report.querySelector(".report-section-heading-row")).toBeNull();
  expect(report.firstElementChild).toBe(heading);
  expect(heading).toHaveTextContent("Related topics");
  expect(report.lastElementChild).toHaveTextContent("Report content");
});
