/**
 * Shared citation badges component used across report sections.
 * Displays citation references with removable badges.
 *
 * @param {object} block - The block containing citations array
 * @param {function} onUpdateBlock - Callback to update block data
 * @param {function} getCitationPreview - Returns preview text for a citation ID
 * @param {string} badgeClassName - CSS classes for badge styling (varies by section theme)
 */
export default function CitationBadges({
  block,
  onUpdateBlock,
  getCitationPreview,
  badgeClassName = "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-primary/10 text-primary",
}) {
  const citations = block.citations || [];
  if (citations.length === 0) return null;

  return (
    <div className="flex gap-1 flex-wrap mt-2">
      {citations.map((cId) => (
        <span
          key={cId}
          className={badgeClassName}
          title={getCitationPreview?.(cId) || ""}
        >
          [{cId}]
          <button
            className="no-print hover:opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateBlock(block.id, {
                citations: citations.filter((id) => id !== cId),
              });
            }}
          >
            x
          </button>
        </span>
      ))}
    </div>
  );
}
