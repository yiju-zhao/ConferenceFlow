import { EditableField, SectionInlineAdd } from "../shared";
import CitationBadges from "../components/CitationBadges";

// ── Block type definitions for the inline-add popover ────────────────────────
const BLOCK_TYPES = [
  {
    type: "category-header",
    label: "分类标题",
    extraFields: { icon: "memory", label: "", count: "" },
  },
  {
    type: "session-card",
    label: "Session 卡片",
    extraFields: { sessionCode: "", title: "", speakers: "", quote: "", citations: [] },
  },
  { type: "heading", label: "小标题" },
  { type: "body", label: "正文" },
];

// ── Border color by category index (1-based): odd = primary-container, even = secondary
function borderColorForCategory(categoryIndex) {
  return categoryIndex % 2 === 1
    ? "border-primary-container"
    : "border-secondary";
}

// ── Group blocks into categories ─────────────────────────────────────────────
// Returns an array of { header: block|null, cards: block[] }
function groupBlocks(blocks) {
  const groups = [];
  let current = null;

  for (const block of blocks) {
    if (block.type === "category-header") {
      current = { header: block, cards: [] };
      groups.push(current);
    } else if (block.type === "session-card") {
      if (!current) {
        // Orphan card before any header — create an implicit group
        current = { header: null, cards: [] };
        groups.push(current);
      }
      current.cards.push(block);
    } else {
      // Legacy heading/body — push as standalone entry
      groups.push({ header: null, cards: [], legacy: block });
    }
  }

  return groups;
}

// ── Remove button (appears on hover) ─────────────────────────────────────────
function RemoveButton({ onClick }) {
  return (
    <button
      className="absolute top-2 right-2 text-secondary hover:text-primary text-sm no-print opacity-0 group-hover:opacity-100 transition-opacity"
      onClick={onClick}
    >
      ×
    </button>
  );
}

// ── Category Header block ────────────────────────────────────────────────────
function CategoryHeaderBlock({ block, onUpdateBlock, onRemoveBlock }) {
  return (
    <div className="flex items-center gap-3 mb-5 relative group">
      <RemoveButton onClick={() => onRemoveBlock(block.id)} />
      <span className="material-symbols-outlined text-primary text-lg">
        {block.icon || "memory"}
      </span>
      {/* Editable icon name (small inline field) */}
      <input
        type="text"
        className="no-print w-20 text-[10px] font-mono text-secondary bg-transparent border-b border-dashed border-secondary/30 focus:border-primary focus:outline-none px-1 py-0"
        value={block.icon || ""}
        placeholder="icon"
        onChange={(e) => onUpdateBlock(block.id, { icon: e.target.value })}
        title="Material icon name"
      />
      <h3 className="text-sm font-black uppercase tracking-[0.15em] text-primary flex-1">
        <EditableField
          value={block.label || ""}
          onSave={(html) => onUpdateBlock(block.id, { label: html })}
          placeholder="分类标题..."
          minHeight={20}
        />
      </h3>
      <span className="text-[10px] font-bold text-secondary uppercase tracking-widest ml-auto shrink-0">
        <EditableField
          value={block.count || ""}
          onSave={(html) => onUpdateBlock(block.id, { count: html })}
          placeholder="N Sessions"
          minHeight={16}
        />
      </span>
    </div>
  );
}

// ── Session Card block ───────────────────────────────────────────────────────
function SessionCardBlock({
  block,
  borderClass,
  onUpdateBlock,
  onRemoveBlock,
  onOpenCitationPicker,
  sectionName,
  getCitationPreview,
}) {
  return (
    <div
      className={`bg-surface-container-lowest p-5 border-l-4 ${borderClass} relative group`}
    >
      <RemoveButton onClick={() => onRemoveBlock(block.id)} />

      {/* Session code badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 tracking-wider font-label">
          <EditableField
            value={block.sessionCode || ""}
            onSave={(html) => onUpdateBlock(block.id, { sessionCode: html })}
            placeholder="SESSION CODE"
            minHeight={16}
          />
        </span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-bold leading-snug mb-2 text-on-surface">
        <EditableField
          value={block.title || ""}
          onSave={(html) => onUpdateBlock(block.id, { title: html })}
          placeholder="Session 标题..."
          minHeight={20}
        />
      </h4>

      {/* Speakers */}
      <div className="flex flex-wrap gap-1 mb-3">
        <span className="text-[10px] font-bold text-secondary bg-surface-container-high px-2 py-0.5">
          <EditableField
            value={block.speakers || ""}
            onSave={(html) => onUpdateBlock(block.id, { speakers: html })}
            placeholder="讲者..."
            minHeight={14}
          />
        </span>
      </div>

      {/* Quote */}
      <p
        className="text-xs italic leading-relaxed"
        style={{ color: "#5b403d" }}
      >
        <EditableField
          value={block.quote || ""}
          onSave={(html) => onUpdateBlock(block.id, { quote: html })}
          placeholder="引用内容..."
          minHeight={20}
        />
      </p>

      {/* Citations */}
      <CitationBadges
        block={block}
        onUpdateBlock={onUpdateBlock}
        getCitationPreview={getCitationPreview}
      />
      <button
        className="citation-add-btn no-print mt-2 text-xs text-secondary hover:text-primary bg-transparent border-none cursor-pointer"
        onClick={() => onOpenCitationPicker(sectionName, block.id)}
      >
        + 添加引用
      </button>
    </div>
  );
}

// ── Legacy block (heading / body) ────────────────────────────────────────────
function LegacyBlock({ block, onUpdateBlock, onRemoveBlock }) {
  if (block.type === "heading") {
    return (
      <div className="relative group mb-2">
        <RemoveButton onClick={() => onRemoveBlock(block.id)} />
        <div className="text-xl font-bold text-on-background font-headline">
          <EditableField
            value={block.content || ""}
            onSave={(html) => onUpdateBlock(block.id, { content: html })}
            placeholder="输入小标题..."
            minHeight={28}
          />
        </div>
      </div>
    );
  }

  // body
  return (
    <div className="relative group">
      <RemoveButton onClick={() => onRemoveBlock(block.id)} />
      <div className="text-on-surface leading-relaxed">
        <EditableField
          value={block.content || ""}
          onSave={(html) => onUpdateBlock(block.id, { content: html })}
          placeholder="输入正文..."
          minHeight={40}
        />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function VoicesSection({
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
  const groups = groupBlocks(blocks);

  // Category index tracks which category-header we're on (1-based)
  let categoryIndex = 0;

  return (
    <div className="space-y-8">
      {groups.map((group, gi) => {
        // Legacy standalone block
        if (group.legacy) {
          const block = group.legacy;
          return (
            <div key={block.id}>
              <LegacyBlock
                block={block}
                onUpdateBlock={onUpdateBlock}
                onRemoveBlock={onRemoveBlock}
              />
              <SectionInlineAdd
                sectionName={sectionName}
                afterId={block.id}
                openKey={openInlineMenu}
                onOpen={onOpenInlineMenu}
                onInsert={onAddBlock}
                blockTypes={BLOCK_TYPES}
              />
            </div>
          );
        }

        // Category group (header + cards)
        if (group.header) categoryIndex++;
        const currentCategoryIndex = categoryIndex;
        const borderClass = borderColorForCategory(currentCategoryIndex);

        return (
          <div key={group.header?.id || `group-${gi}`}>
            {/* Category header */}
            {group.header && (
              <div>
                <CategoryHeaderBlock
                  block={group.header}
                  onUpdateBlock={onUpdateBlock}
                  onRemoveBlock={onRemoveBlock}
                />
                <SectionInlineAdd
                  sectionName={sectionName}
                  afterId={group.header.id}
                  openKey={openInlineMenu}
                  onOpen={onOpenInlineMenu}
                  onInsert={onAddBlock}
                  blockTypes={BLOCK_TYPES}
                />
              </div>
            )}

            {/* Session cards in 2-col grid */}
            {group.cards.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {group.cards.map((card) => (
                  <div key={card.id}>
                    <SessionCardBlock
                      block={card}
                      borderClass={borderClass}
                      onUpdateBlock={onUpdateBlock}
                      onRemoveBlock={onRemoveBlock}
                      onOpenCitationPicker={onOpenCitationPicker}
                      sectionName={sectionName}
                      getCitationPreview={getCitationPreview}
                    />
                    <SectionInlineAdd
                      sectionName={sectionName}
                      afterId={card.id}
                      openKey={openInlineMenu}
                      onOpen={onOpenInlineMenu}
                      onInsert={onAddBlock}
                      blockTypes={BLOCK_TYPES}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
