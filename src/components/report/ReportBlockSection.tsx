import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { AiBlockField, Member, ReportBlock, ReportBlockType, Session } from "../../types";
import IntelCard from "./IntelCard";
import { InlineAddButton } from "./SharedEditors";

interface ReportBlockSectionProps {
  sectionId: string;
  title: string;
  titleStyle?: CSSProperties;
  field: AiBlockField;
  blocks: ReportBlock[];
  members: Member[];
  currentUid?: string;
  isAdmin: boolean;
  readOnly: boolean;
  memberColorMap: Record<string, number>;
  conferenceSessions: Session[];
  bodyPlaceholder?: string;
  openInlineMenu: string | null;
  onOpenInlineMenu: (value: string | null) => void;
  onInsert: (field: AiBlockField, type: ReportBlockType, afterId: string | null) => void;
  onUpdate: (field: AiBlockField, blockId: string, patch: Partial<ReportBlock>) => void;
  onRemove: (field: AiBlockField, blockId: string) => void;
  renderAiControls: (block: ReportBlock, blockReadOnly: boolean) => ReactNode;
}

export default function ReportBlockSection({
  sectionId,
  title,
  titleStyle,
  field,
  blocks,
  members,
  currentUid,
  isAdmin,
  readOnly,
  memberColorMap,
  conferenceSessions,
  bodyPlaceholder,
  openInlineMenu,
  onOpenInlineMenu,
  onInsert,
  onUpdate,
  onRemove,
  renderAiControls,
}: ReportBlockSectionProps) {
  return (
    <>
      <h2 id={sectionId} className="report-section-title" style={titleStyle}>
        {title}
      </h2>
      {!readOnly && (
        <InlineAddButton
          field={field}
          afterId={null}
          openKey={openInlineMenu}
          onOpen={onOpenInlineMenu}
          onInsert={onInsert}
        />
      )}
      {blocks.map((block) => {
        const blockReadOnly =
          readOnly || Boolean(block.ownerId && block.ownerId !== currentUid && !isAdmin);
        const aiControls = renderAiControls(block, blockReadOnly);

        return (
          <Fragment key={block.id}>
            {block.type === "heading" ? (
              <div
                id={`block-${block.id}`}
                className="onsite-category-header"
                style={{ marginTop: 8 }}
              >
                {blockReadOnly ? (
                  <span className="onsite-category-title">{block.content}</span>
                ) : (
                  <span
                    className="onsite-category-title"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(event) =>
                      onUpdate(field, block.id, {
                        content: event.currentTarget.textContent?.trim() || "",
                      })
                    }
                    onPaste={(event) => {
                      event.preventDefault();
                      document.execCommand(
                        "insertText",
                        false,
                        event.clipboardData.getData("text/plain"),
                      );
                    }}
                  >
                    {block.content}
                  </span>
                )}
                {!blockReadOnly && (
                  <button
                    className="onsite-category-remove no-print"
                    onClick={() => onRemove(field, block.id)}
                  >
                    ×
                  </button>
                )}
                {!blockReadOnly && aiControls && (
                  <div className="report-block-heading-ai no-print">{aiControls}</div>
                )}
              </div>
            ) : (
              <IntelCard
                block={block}
                onUpdate={(patch) => {
                  if (!blockReadOnly) onUpdate(field, block.id, patch);
                }}
                onRemove={() => {
                  if (!blockReadOnly) onRemove(field, block.id);
                }}
                members={members}
                placeholder={bodyPlaceholder}
                readOnly={blockReadOnly}
                currentUid={currentUid}
                memberColorMap={memberColorMap}
                isAdmin={isAdmin}
                conferenceSessions={conferenceSessions}
                aiControls={!blockReadOnly ? aiControls : undefined}
              />
            )}
            {!readOnly && (
              <InlineAddButton
                field={field}
                afterId={block.id}
                openKey={openInlineMenu}
                onOpen={onOpenInlineMenu}
                onInsert={onInsert}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}
