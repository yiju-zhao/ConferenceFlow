import { useTranslation } from 'react-i18next';
import { EditableField, SectionInlineAdd } from "../shared";
import CitationBadges from "../components/CitationBadges";

const INSIGHT_BG_CYCLE = ["bg-primary", "bg-on-background", "bg-secondary"];

export default function InsightsSection({
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
    { type: "heading", label: t('sections.heading') },
    { type: "body", label: t('sections.body') },
  ];

  // Track body-only index for numbering and color cycling
  let bodyIdx = 0;

  return (
    <div className="grid grid-cols-1 gap-4">
      {blocks.map((block) => {
        if (block.type === "heading") {
          return (
            <div key={block.id}>
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

        // ── Body block (numbered insight card) ────────────────────────────
        const currentBodyIdx = bodyIdx;
        bodyIdx++;
        const bgClass = INSIGHT_BG_CYCLE[currentBodyIdx % INSIGHT_BG_CYCLE.length];
        const num = String(currentBodyIdx + 1).padStart(2, "0");

        return (
          <div key={block.id}>
            <div className={`flex items-center ${bgClass} text-white p-6 relative group`}>
              <button
                className="absolute top-2 right-2 text-white/60 hover:text-white text-sm no-print opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemoveBlock(block.id)}
              >
                ×
              </button>
              <div className="flex-shrink-0 w-16 text-4xl font-black opacity-30 font-headline">
                {num}
              </div>
              <div className="ml-6 flex-1">
                <EditableField
                  value={block.content}
                  onSave={(html) => onUpdateBlock(block.id, { content: html })}
                  placeholder={t('sections.enterKeyInsights')}
                  minHeight={40}
                />
              </div>
              <CitationBadges
                block={block}
                onUpdateBlock={onUpdateBlock}
                getCitationPreview={getCitationPreview}
                badgeClassName="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-white/20 text-white"
              />
              <button
                className="citation-add-btn no-print ml-3 text-xs text-white/60 hover:text-white bg-transparent border-none cursor-pointer whitespace-nowrap"
                onClick={() => onOpenCitationPicker(sectionName, block.id)}
              >
                {t('sections.addCitationFull')}
              </button>
            </div>
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
      })}
    </div>
  );
}
