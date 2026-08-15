export function unwrapReportSectionHeadingRows(root: ParentNode): void {
  root.querySelectorAll(".report-section-heading-row").forEach((row) => {
    row.replaceWith(...Array.from(row.childNodes));
  });
}
