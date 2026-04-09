import { useTranslation } from "react-i18next";
import { EditableField, SectionInlineAdd } from "../shared";
import CitationBadges from "../components/CitationBadges";

/**
 * Group blocks into structured segments:
 * - statCards: blocks with type "stat-card"
 * - treeRoot: first block with type "tree-root"
 * - branches: array of { branch, evidence[] } groups
 * - treeConclusion: first block with type "tree-conclusion"
 * - legacyBlocks: blocks with type "heading" or "body"
 */
function groupBlocks(blocks) {
  const statCards = blocks.filter((b) => b.type === "stat-card");
  const treeRoot = blocks.find((b) => b.type === "tree-root") || null;
  const treeConclusion =
    blocks.find((b) => b.type === "tree-conclusion") || null;
  const legacyBlocks = blocks.filter(
    (b) => b.type === "heading" || b.type === "body",
  );

  // Build branch groups: tree-branch starts a new group, subsequent tree-evidence go into it
  const branches = [];
  let currentBranch = null;
  for (const block of blocks) {
    if (block.type === "tree-branch") {
      currentBranch = { branch: block, evidence: [] };
      branches.push(currentBranch);
    } else if (block.type === "tree-evidence" && currentBranch) {
      currentBranch.evidence.push(block);
    }
  }

  return { statCards, treeRoot, branches, treeConclusion, legacyBlocks };
}

export default function AnalysisSection({
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
    {
      type: "stat-card",
      label: t("sections.statCard"),
      extraFields: { label: "", value: "", description: "" },
    },
    {
      type: "tree-root",
      label: t("sections.treeRoot"),
      extraFields: { title: "", content: "" },
    },
    {
      type: "tree-branch",
      label: t("sections.treeBranch"),
      extraFields: { title: "", content: "" },
    },
    {
      type: "tree-evidence",
      label: t("sections.treeEvidence"),
      extraFields: { content: "", source: "" },
    },
    {
      type: "tree-conclusion",
      label: t("sections.treeConclusion"),
      extraFields: { content: "" },
    },
    { type: "heading", label: t("sections.heading") },
    { type: "body", label: t("sections.body") },
  ];

  const { statCards, treeRoot, branches, treeConclusion, legacyBlocks } =
    groupBlocks(blocks);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (blocks.length === 0) {
    return (
      <div className="py-6 flex flex-wrap gap-2 no-print">
        {blockTypes.map(({ type, label, extraFields }) => (
          <button
            key={type}
            className="px-4 py-2 text-xs font-bold uppercase bg-surface-container-low text-secondary hover:text-primary hover:border-primary border border-transparent transition-colors"
            onClick={() => onAddBlock(sectionName, type, null, extraFields)}
          >
            + {label}
          </button>
        ))}
      </div>
    );
  }

  // ── Inline add helper ─────────────────────────────────────────────────────
  const renderInlineAdd = (afterId) => (
    <SectionInlineAdd
      sectionName={sectionName}
      afterId={afterId}
      openKey={openInlineMenu}
      onOpen={onOpenInlineMenu}
      onInsert={onAddBlock}
      blockTypes={blockTypes}
    />
  );

  // ── Remove button (hover-visible) ─────────────────────────────────────────
  const removeBtn = (blockId, extraClass = "") => (
    <button
      className={`absolute top-1 right-1 text-secondary hover:text-primary text-xs no-print opacity-0 group-hover:opacity-100 transition-opacity ${extraClass}`}
      onClick={() => onRemoveBlock(blockId)}
      title={t("common.delete")}
    >
      ×
    </button>
  );

  const renderCitationBadges = (block) => (
    <CitationBadges
      block={block}
      onUpdateBlock={onUpdateBlock}
      getCitationPreview={getCitationPreview}
      badgeClassName="text-[9px] font-bold text-primary-fixed-dim bg-white/10 px-1.5 py-0.5 inline-flex items-center gap-1"
    />
  );

  return (
    <div className="bg-surface-dim p-1 px-1">
      <div className="bg-white p-6 md:p-10 space-y-6">
        {/* ── Stat Cards Grid ──────────────────────────────────────────── */}
        {statCards.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {statCards.map((card) => (
              <div key={card.id}>
                <div className="bg-surface-container-low p-3 relative group">
                  {removeBtn(card.id)}
                  <div className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1">
                    <EditableField
                      value={card.label}
                      onSave={(html) => onUpdateBlock(card.id, { label: html })}
                      placeholder={t("sections.metricName")}
                      minHeight={14}
                    />
                  </div>
                  <div className="text-xl font-black text-on-surface">
                    <EditableField
                      value={card.value}
                      onSave={(html) => onUpdateBlock(card.id, { value: html })}
                      placeholder={t("sections.metricValue")}
                      minHeight={24}
                    />
                  </div>
                  <div className="text-[10px] text-secondary">
                    <EditableField
                      value={card.description}
                      onSave={(html) =>
                        onUpdateBlock(card.id, { description: html })
                      }
                      placeholder={t("sections.metricDesc")}
                      minHeight={14}
                    />
                  </div>
                </div>
                {renderInlineAdd(card.id)}
              </div>
            ))}
          </div>
        )}

        {/* ── Tree Root ────────────────────────────────────────────────── */}
        {treeRoot && (
          <div>
            <div className="bg-primary text-on-primary p-4 relative group">
              {removeBtn(
                treeRoot.id,
                "text-on-primary/60 hover:text-on-primary",
              )}
              <h4 className="text-sm font-black uppercase tracking-tight">
                <EditableField
                  value={treeRoot.title}
                  onSave={(html) => onUpdateBlock(treeRoot.id, { title: html })}
                  placeholder={t("sections.inferenceTheme")}
                  minHeight={18}
                />
              </h4>
              <div className="text-xs mt-1 opacity-90">
                <EditableField
                  value={treeRoot.content}
                  onSave={(html) =>
                    onUpdateBlock(treeRoot.id, { content: html })
                  }
                  placeholder={t("sections.coreInference")}
                  minHeight={18}
                />
              </div>
            </div>
            {renderInlineAdd(treeRoot.id)}
          </div>
        )}

        {/* ── Tree Branches + Evidence ─────────────────────────────────── */}
        {branches.length > 0 && (
          <div className="border-l-4 border-primary ml-6">
            {branches.map(({ branch, evidence }) => (
              <div key={branch.id} className="relative mt-0">
                {/* Horizontal connector */}
                <div className="border-t-4 border-primary w-6 absolute left-0 top-6" />
                <div className="ml-8 mt-2">
                  {/* Branch node */}
                  <div className="bg-on-background text-white p-4 relative group">
                    {removeBtn(branch.id, "text-white/60 hover:text-white")}
                    <h5 className="text-xs font-black uppercase tracking-tight">
                      <EditableField
                        value={branch.title}
                        onSave={(html) =>
                          onUpdateBlock(branch.id, { title: html })
                        }
                        placeholder={t("sections.branchTitle")}
                        minHeight={16}
                      />
                    </h5>
                    <div className="text-[11px] mt-1 opacity-80">
                      <EditableField
                        value={branch.content}
                        onSave={(html) =>
                          onUpdateBlock(branch.id, { content: html })
                        }
                        placeholder={t("sections.branchDesc")}
                        minHeight={16}
                      />
                    </div>
                    {/* Citation badges */}
                    {renderCitationBadges(branch)}
                    {/* Add citation button */}
                    <button
                      className="no-print mt-2 text-[10px] text-primary-fixed-dim hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 transition-colors"
                      onClick={() =>
                        onOpenCitationPicker(sectionName, branch.id)
                      }
                    >
                      {t("sections.addCitation")}
                    </button>
                  </div>
                  {renderInlineAdd(branch.id)}

                  {/* Evidence nodes */}
                  {evidence.length > 0 && (
                    <div className="border-l-2 border-secondary ml-4">
                      {evidence.map((ev) => (
                        <div key={ev.id}>
                          <div className="relative mt-0 group">
                            {/* Horizontal connector */}
                            <div className="border-t-2 border-secondary w-4 absolute left-0 top-4" />
                            <div className="ml-6 mt-1 py-2 relative">
                              {removeBtn(ev.id)}
                              <div className="text-[11px] leading-snug text-on-surface">
                                <EditableField
                                  value={ev.content}
                                  onSave={(html) =>
                                    onUpdateBlock(ev.id, { content: html })
                                  }
                                  placeholder={t("sections.evidenceContent")}
                                  minHeight={16}
                                />
                              </div>
                              {ev.source !== undefined && (
                                <div className="text-[9px] text-secondary mt-0.5">
                                  <span>— </span>
                                  <EditableField
                                    value={ev.source}
                                    onSave={(html) =>
                                      onUpdateBlock(ev.id, { source: html })
                                    }
                                    placeholder={t(
                                      "sections.sourcePlaceholder",
                                    )}
                                    minHeight={12}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          {renderInlineAdd(ev.id)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tree Conclusion ──────────────────────────────────────────── */}
        {treeConclusion && (
          <div>
            <div className="bg-primary/10 p-4 mt-4 border-l-4 border-primary relative group">
              {removeBtn(treeConclusion.id)}
              <div className="text-xs font-bold text-on-surface leading-relaxed">
                <EditableField
                  value={treeConclusion.content}
                  onSave={(html) =>
                    onUpdateBlock(treeConclusion.id, { content: html })
                  }
                  placeholder={t("sections.conclusion")}
                  minHeight={20}
                />
              </div>
            </div>
            {renderInlineAdd(treeConclusion.id)}
          </div>
        )}

        {/* ── Legacy blocks (heading / body) ──────────────────────────── */}
        {legacyBlocks.map((block) => (
          <div key={block.id}>
            {block.type === "heading" ? (
              <div className="p-6 bg-surface-container-low text-center relative group">
                {removeBtn(block.id)}
                <div className="text-3xl font-black text-primary mb-2 font-headline">
                  <EditableField
                    value={block.content}
                    onSave={(html) =>
                      onUpdateBlock(block.id, { content: html })
                    }
                    placeholder={t("report.dataMetrics")}
                    minHeight={28}
                  />
                </div>
              </div>
            ) : (
              <div className="relative group">
                {removeBtn(block.id)}
                <div className="text-lg leading-relaxed font-medium text-on-surface">
                  <EditableField
                    value={block.content}
                    onSave={(html) =>
                      onUpdateBlock(block.id, { content: html })
                    }
                    placeholder={t("sections.analysisContent")}
                    minHeight={60}
                  />
                </div>
              </div>
            )}
            {renderInlineAdd(block.id)}
          </div>
        ))}
      </div>
    </div>
  );
}
