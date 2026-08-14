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
  expectedContent?: string,
): ReportBlock[] {
  const matchingBlocks = blocks.filter((block) => block.id === blockId);
  if (matchingBlocks.length !== 1) throw new Error("report Block not found");
  if (expectedContent !== undefined && matchingBlocks[0].content !== expectedContent) {
    throw new Error("report Block content changed");
  }

  return blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block));
}

export function insertReportBlock(
  blocks: ReportBlock[],
  block: ReportBlock,
  afterId: string | null,
): ReportBlock[] {
  if (blocks.some((candidate) => candidate.id === block.id)) {
    throw new Error("report Block already exists");
  }
  if (afterId === null) return [block, ...blocks];

  const anchors = blocks.filter((candidate) => candidate.id === afterId);
  if (anchors.length !== 1) throw new Error("report Block anchor not found");
  const anchorIndex = blocks.indexOf(anchors[0]);
  return [...blocks.slice(0, anchorIndex + 1), block, ...blocks.slice(anchorIndex + 1)];
}

export function removeReportBlock(blocks: ReportBlock[], blockId: string): ReportBlock[] {
  const matchingBlocks = blocks.filter((block) => block.id === blockId);
  if (matchingBlocks.length !== 1) throw new Error("report Block not found");
  return blocks.filter((block) => block.id !== blockId);
}
