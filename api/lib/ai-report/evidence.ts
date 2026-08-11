import type { TranscriptSegment } from "./transcript-parser";
import { normalizeEvidenceText } from "./transcript-parser";

export interface RawFact {
  claim: string;
  kind: "explicit" | "synthesis";
  fieldHints?: string[];
  supports: Array<{ segmentId: string; quote: string }>;
}

export interface ValidatedFact {
  claim: string;
  kind: "explicit" | "synthesis";
  fieldHints: string[];
  supports: Array<{ evidenceId: string; segmentId: string; quote: string }>;
  factId: string;
}

export interface SourceSupport {
  sourceId: string;
  quote: string;
}

export interface ValidatedSourceSupport extends SourceSupport {
  evidenceId: string;
}

interface EvidenceSource {
  sourceId: string;
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalized(value: string): string {
  return normalizeEvidenceText(value);
}

/**
 * Extract grounding-sensitive tokens. Numbers include percentages and years;
 * capitalized Latin words cover names such as DeepSeek and GPT-4. The tokens
 * are deliberately checked in the model's supplied quotes, never generated
 * from the source text.
 */
function groundingTokens(claim: string): string[] {
  const tokens = new Set<string>();
  for (const match of claim.matchAll(
    /\d+(?:\.\d+)?%?|\b[A-Z][A-Za-z0-9]*(?:[-'’._][A-Za-z0-9]+)*/g,
  )) {
    tokens.add(match[0]);
  }
  return [...tokens];
}

function validSupportShape(value: unknown): value is SourceSupport {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    value.sourceId.trim() !== "" &&
    typeof value.quote === "string" &&
    value.quote.trim() !== ""
  );
}

function quoteMatches(quote: string, sourceText: string): boolean {
  const candidate = normalized(quote);
  return candidate.length > 0 && normalized(sourceText).includes(candidate);
}

/**
 * Match a grounded token as a token, rather than as an arbitrary substring.
 * ASCII alphanumerics and underscores always continue a token. Hyphens,
 * apostrophes, and dots continue a Latin token when followed by an ASCII
 * alphanumeric (e.g. `DeepSeek-2` or `GPT-4.1`), while a standalone dot or
 * dash remains ordinary adjacent punctuation. Chinese text and whitespace
 * remain valid adjacent context.
 */
function containsGroundedToken(text: string, token: string): boolean {
  const numeric = /^\d/.test(token);
  const isAsciiAlphanumeric = (value: string): boolean => /[A-Za-z0-9]/.test(value);
  const continuesAt = (index: number, direction: -1 | 1): boolean => {
    if (index < 0 || index >= text.length) return false;
    const value = text[index];
    if (isAsciiAlphanumeric(value) || value === "_") return true;
    if (numeric && value === "%") return true;
    if (value !== "." && value !== "-" && value !== "'" && value !== "’") return false;
    const adjacent = text[index + direction];
    return adjacent !== undefined && isAsciiAlphanumeric(adjacent);
  };
  let fromIndex = 0;
  while (fromIndex <= text.length - token.length) {
    const index = text.indexOf(token, fromIndex);
    if (index < 0) return false;
    const afterIndex = index + token.length;
    if (!continuesAt(index - 1, -1) && !continuesAt(afterIndex, 1)) return true;
    fromIndex = index + 1;
  }
  return false;
}

function supportsAllGroundingTokens(claim: string, quotes: string[]): boolean {
  const joined = normalized(quotes.join(" "));
  return groundingTokens(claim).every((token) => containsGroundedToken(joined, token));
}

/**
 * Keep only facts whose complete support list is grounded in known segments.
 * IDs are assigned after filtering, making output deterministic across calls.
 */
export function validateTranscriptFacts(
  rawFacts: unknown,
  segments: TranscriptSegment[],
): ValidatedFact[] {
  if (!Array.isArray(rawFacts)) return [];
  const byId = new Map(segments.map((segment) => [segment.segmentId, segment]));
  const accepted: ValidatedFact[] = [];

  for (const raw of rawFacts) {
    if (!isRecord(raw)) continue;
    const claim = raw.claim;
    const kind = raw.kind;
    const supports = raw.supports;
    const fieldHints = raw.fieldHints;
    if (
      typeof claim !== "string" ||
      claim.trim() === "" ||
      (kind !== "explicit" && kind !== "synthesis") ||
      !Array.isArray(supports) ||
      supports.length === 0 ||
      (fieldHints !== undefined &&
        (!Array.isArray(fieldHints) || fieldHints.some((item) => typeof item !== "string")))
    ) {
      continue;
    }

    const checkedSupports: ValidatedFact["supports"] = [];
    let valid = true;
    for (const support of supports) {
      if (
        !isRecord(support) ||
        typeof support.segmentId !== "string" ||
        typeof support.quote !== "string" ||
        support.segmentId.trim() === "" ||
        support.quote.trim() === ""
      ) {
        valid = false;
        break;
      }
      const segment = byId.get(support.segmentId);
      if (!segment || !quoteMatches(support.quote, segment.normalizedText || segment.text)) {
        valid = false;
        break;
      }
      checkedSupports.push({ evidenceId: "", segmentId: support.segmentId, quote: support.quote });
    }
    if (
      !valid ||
      !supportsAllGroundingTokens(
        claim,
        checkedSupports.map((support) => support.quote),
      )
    )
      continue;

    const factId = `fact_${String(accepted.length + 1).padStart(4, "0")}`;
    accepted.push({
      factId,
      claim,
      kind,
      fieldHints: fieldHints ? [...fieldHints] : [],
      supports: checkedSupports,
    });
  }

  let evidenceIndex = 0;
  return accepted.map((fact) => ({
    ...fact,
    supports: fact.supports.map((support) => ({
      ...support,
      evidenceId: `ev_${String(++evidenceIndex).padStart(4, "0")}`,
    })),
  }));
}

/** Validate model-provided source excerpts against labeled source blocks. */
export function validateSourceSupports(
  rawSupports: unknown,
  sourceBlocks: EvidenceSource[],
): ValidatedSourceSupport[] {
  if (!Array.isArray(rawSupports)) return [];
  const byId = new Map(sourceBlocks.map((block) => [block.sourceId, block]));
  const accepted: ValidatedSourceSupport[] = [];
  for (const raw of rawSupports) {
    if (!validSupportShape(raw)) continue;
    const block = byId.get(raw.sourceId);
    if (!block || !quoteMatches(raw.quote, block.text)) continue;
    accepted.push({ evidenceId: "", sourceId: raw.sourceId, quote: raw.quote });
  }
  return accepted.map((support, index) => ({
    ...support,
    evidenceId: `ev_${String(index + 1).padStart(4, "0")}`,
  }));
}
