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

it("preserves Related Topics top spacing when unwrapping its editor heading row", () => {
  const report = document.createElement("section");
  report.innerHTML = `
    <div id="section-related" class="report-sessions">
      <div class="report-section-heading-row" style="margin-top: 32px;">
        <h2 class="report-section-title">Related topics</h2>
        <button class="no-print btn-ghost report-section-add-action">Add Session</button>
      </div>
    </div>
  `;
  const editorHeadingRow = report.querySelector<HTMLElement>(".report-section-heading-row")!;
  expect(editorHeadingRow.style.marginTop).toBe("32px");
  report.querySelector(".no-print")?.remove();

  unwrapReportSectionHeadingRows(report);

  const relatedTopics = report.querySelector<HTMLElement>(".report-section-title")!;
  expect(report.querySelector(".report-section-heading-row")).toBeNull();
  expect(relatedTopics.parentElement).toBe(report.querySelector("#section-related"));
  expect(relatedTopics.style.marginTop).toBe("32px");
});
