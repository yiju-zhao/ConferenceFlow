export type GenerationMode = "rewrite" | "append";
export const AI_BLOCK_FIELDS = ["onsiteInfoBlocks", "reflectionsBlocks", "rumorsBlocks"] as const;
export type AiBlockField = (typeof AI_BLOCK_FIELDS)[number];
export type GenerationScope = "session" | "daily" | "block";
export type TemplateFieldType = "rich_text" | "bullet_list" | "short_text" | "image" | "fixed";
export type AiSource =
  "transcript" | "current_draft" | "calendar" | "user_focus" | "report_content";
export type TranscriptFormat = "txt" | "md" | "srt" | "vtt";
export type TemplateFieldValue = string | string[];

export interface TemplateField {
  id: string;
  label: string;
  description: string;
  type: TemplateFieldType;
  scope: GenerationScope;
  ai: {
    enabled: boolean;
    instruction?: string;
    allowedSources: AiSource[];
    evidenceRequired: boolean;
    allowedModes: GenerationMode[];
    minItems?: number;
    maxItems?: number;
    maxLength?: number;
  };
}

export interface ReportTemplateVersion {
  templateId: string;
  version: number;
  templateHash: string;
  fields: TemplateField[];
}

export interface TranscriptRef {
  storagePath: string;
  fileName: string;
  format: TranscriptFormat;
  contentHash: string;
  uploadedBy: string;
  uploadedAt: number;
}

export type GenerateRequest =
  | { scope: "session"; sessionId: string; mode: GenerationMode; instruction?: string }
  | { scope: "daily"; targetFieldId: string; mode: GenerationMode; instruction?: string }
  | {
      scope: "block";
      targetFieldId: AiBlockField;
      blockId: string;
      mode: GenerationMode;
      instruction?: string;
    };

export interface CandidateField {
  fieldId: string;
  value: TemplateFieldValue;
  evidenceIds: string[];
}

export interface CandidateEvidence {
  id: string;
  sourceType: "transcript" | "report_field" | "current_draft";
  sourceId: string;
  quote: string;
  startMs?: number;
  endMs?: number;
}

export interface GenerateResponse {
  candidate: CandidateField[];
  insufficientFieldIds: string[];
  evidence: CandidateEvidence[];
  context: {
    templateHash: string;
    transcriptHash?: string;
    baseFieldHashes: Record<string, string>;
    focusUsed: string;
    blockTarget?: { targetFieldId: AiBlockField; blockId: string };
  };
}
