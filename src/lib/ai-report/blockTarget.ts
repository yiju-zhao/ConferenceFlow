import type { AiBlockField } from "../../types";

export function blockContentHashKey(targetFieldId: AiBlockField, blockId: string): string {
  return `block:${targetFieldId}:${encodeURIComponent(blockId)}:content`;
}
