import type { ReportBlock } from "../../types";
import { htmlToPlainText } from "../../../server/ai-report/field-policy";

export function hasVisibleBlockContent(block: ReportBlock): boolean {
  return htmlToPlainText(block.content).trim().length > 0;
}

export function blocksWithoutTranscripts(blocks: ReportBlock[]): ReportBlock[] {
  return blocks.map(({ transcriptRef: _transcriptRef, ...block }) => block);
}

export function replaceReportBlock(
  blocks: ReportBlock[],
  blockId: string,
  patch: Partial<ReportBlock>,
): ReportBlock[] {
  const matchingBlocks = blocks.filter((block) => block.id === blockId);
  if (matchingBlocks.length !== 1) throw new Error("report Block not found");

  return blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block));
}
