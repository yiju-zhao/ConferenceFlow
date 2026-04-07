import { useTranslation } from 'react-i18next';
import { EditableField, SectionInlineAdd } from "../shared";

/**
 * Group blocks into trend groups and standalone legacy blocks.
 * A trend group starts at a `trend-title` and collects subsequent
 * `trend-summary` and `evidence-bullet` blocks until the next
 * `trend-title` or a legacy block type.
 */
function groupBlocks(blocks) {
  const groups = []; // { kind: "trend", title, summary, bullets: [], allBlocks: [] } | { kind: "legacy", block }
  let current = null;

  for (const block of blocks) {
    if (block.type === "trend-title") {
      // Start a new trend group
      current = { kind: "trend", title: block, summary: null, bullets: [], allBlocks: [block] };
      groups.push(current);
    } else if (block.type === "trend-summary" && current && current.kind === "trend") {
      current.summary = block;
      current.allBlocks.push(block);
    } else if (block.type === "evidence-bullet" && current && current.kind === "trend") {
      current.bullets.push(block);
      current.allBlocks.push(block);
    } else {
      // Legacy heading / body — standalone
      current = null;
      groups.push({ kind: "legacy", block });
    }
  }

  return groups;
}

export default function TrendsSection({
  sectionName,
  blocks,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onOpenCitationPicker,
  getCitationPreview,
  openInlineMenu,
  onOpenInlineMenu,
}) {
  const { t } = useTranslation();

  const blockTypes = [
    { type: "trend-title", label: t('sections.trendTitle') },
    { type: "trend-summary", label: t('sections.trendSummary') },
    { type: "evidence-bullet", label: t('sections.evidenceBullet') },
    { type: "heading", label: t('sections.heading') },
    { type: "body", label: t('sections.body') },
  ];

  const groups = groupBlocks(blocks);

  return (
    <>
      {groups.map((group) => {
        if (group.kind === "legacy") {
          const block = group.block;
          return (
            <div key={block.id}>
              {block.type === "heading" ? (
                <div className="relative group mb-2">
                  <button
                    className="absolute top-0 right-0 text-secondary hover:text-primary text-sm no-print opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onRemoveBlock(block.id)}
                  >
                    ×
                  </button>
                  <div className="text-xl font-bold text-on-background font-headline">
                    <EditableField
                      value={block.content}
                      onSave={(html) => onUpdateBlock(block.id, { content: html })}
                      placeholder={t('sections.enterSubtitle')}
                      minHeight={28}
                    />
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <button
                    className="absolute top-0 right-0 text-secondary hover:text-primary text-sm no-print opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onRemoveBlock(block.id)}
                  >
                    ×
                  </button>
                  <div className="text-on-surface leading-relaxed">
                    <EditableField
                      value={block.content}
                      onSave={(html) => onUpdateBlock(block.id, { content: html })}
                      placeholder={t('sections.enterBody')}
                      minHeight={40}
                    />
                  </div>
                </div>
              )}
              <SectionInlineAdd
                sectionName={sectionName}
                afterId={block.id}
                openKey={openInlineMenu}
                onOpen={onOpenInlineMenu}
                onInsert={onAddBlock}
                blockTypes={blockTypes}
              />
            </div>
          );
        }

        // ── Trend group ──────────────────────────────────────────────
        const { title, summary, bullets, allBlocks } = group;

        // Aggregate unique citation IDs from all evidence-bullets in this group
        const aggregatedCitations = [];
        const seen = new Set();
        for (const bullet of bullets) {
          for (const cId of bullet.citations || []) {
            if (!seen.has(cId)) {
              seen.add(cId);
              aggregatedCitations.push(cId);
            }
          }
        }

        // Last block in group determines where to place SectionInlineAdd for the group
        const lastBlock = allBlocks[allBlocks.length - 1];

        return (
          <div key={title.id}>
            <div className="group bg-surface-container-low p-8 border-b-2 border-transparent hover:border-primary transition-all duration-50">
              {/* trend-title */}
              <div className="relative group/title">
                <button
                  className="absolute top-0 right-0 text-secondary hover:text-primary text-sm no-print opacity-0 group-hover/title:opacity-100 transition-opacity"
                  onClick={() => onRemoveBlock(title.id)}
                >
                  ×
                </button>
                <h3 className="text-sm font-bold text-primary uppercase mb-2">
                  <EditableField
                    value={title.content}
                    onSave={(html) => onUpdateBlock(title.id, { content: html })}
                    placeholder={t('sections.trendTitlePlaceholder')}
                    minHeight={20}
                  />
                </h3>
              </div>

              {/* trend-summary */}
              {summary && (
                <div className="relative group/summary">
                  <button
                    className="absolute top-0 right-0 text-secondary hover:text-primary text-sm no-print opacity-0 group-hover/summary:opacity-100 transition-opacity"
                    onClick={() => onRemoveBlock(summary.id)}
                  >
                    ×
                  </button>
                  <p className="text-xl font-bold mb-4">
                    <EditableField
                      value={summary.content}
                      onSave={(html) => onUpdateBlock(summary.id, { content: html })}
                      placeholder={t('sections.trendSummaryPlaceholder')}
                      minHeight={28}
                    />
                  </p>
                </div>
              )}

              {/* evidence-bullets */}
              {bullets.length > 0 && (
                <ul className="space-y-3">
                  {bullets.map((bullet) => (
                    <li key={bullet.id} className="flex items-start gap-3 text-sm leading-relaxed relative group/bullet">
                      <span className="text-primary font-bold mt-1">—</span>
                      <span className="flex-1">
                        <EditableField
                          value={bullet.content}
                          onSave={(html) => onUpdateBlock(bullet.id, { content: html })}
                          placeholder={t('sections.evidenceBulletPlaceholder')}
                          minHeight={20}
                        />
                      </span>
                      <div className="flex items-center gap-1 no-print opacity-0 group-hover/bullet:opacity-100 transition-opacity">
                        <button
                          className="text-xs text-secondary hover:text-primary bg-transparent border-none cursor-pointer whitespace-nowrap"
                          onClick={() => onOpenCitationPicker(sectionName, bullet.id)}
                        >
                          {t('sections.addCitationFull')}
                        </button>
                        <button
                          className="text-secondary hover:text-primary text-sm"
                          onClick={() => onRemoveBlock(bullet.id)}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Aggregated citation badges */}
              {aggregatedCitations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-surface-container-high">
                  {aggregatedCitations.map((cId) => {
                    const preview = getCitationPreview(cId);
                    const badgeText = preview.split(" — ")[0];
                    return (
                      <span
                        key={cId}
                        className="text-[9px] font-bold text-primary bg-primary/5 px-2 py-0.5 tracking-wider font-label"
                        title={preview}
                      >
                        {badgeText}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SectionInlineAdd after the entire trend group */}
            <SectionInlineAdd
              sectionName={sectionName}
              afterId={lastBlock.id}
              openKey={openInlineMenu}
              onOpen={onOpenInlineMenu}
              onInsert={onAddBlock}
              blockTypes={blockTypes}
            />
          </div>
        );
      })}
    </>
  );
}
