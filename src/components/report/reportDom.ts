export function unwrapReportSectionHeadingRows(root: ParentNode): void {
  root.querySelectorAll(".report-section-heading-row").forEach((row) => {
    if (row instanceof HTMLElement && row.style.marginTop) {
      const heading = Array.from(row.children).find((child) =>
        child.classList.contains("report-section-title"),
      );
      if (heading instanceof HTMLElement && !heading.style.marginTop) {
        heading.style.marginTop = row.style.marginTop;
      }
    }
    row.replaceWith(...Array.from(row.childNodes));
  });
}
