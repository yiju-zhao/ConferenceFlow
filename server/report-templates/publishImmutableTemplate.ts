import { assertTemplateVersion } from "../../src/lib/ai-report/templateContract";
import { hashTemplateDefinition } from "../../src/lib/ai-report/templateHash";
import type { ReportTemplateVersion } from "../../src/types";

export interface ImmutableTemplateStore {
  read(): Promise<unknown | null>;
  create(template: ReportTemplateVersion): Promise<void>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalPublishedTemplate(value: unknown): string {
  return JSON.stringify(canonicalize(assertTemplateVersion(value)));
}

export async function publishImmutableTemplate(
  rawTemplate: unknown,
  store: ImmutableTemplateStore,
): Promise<"created" | "unchanged"> {
  const template = assertTemplateVersion(rawTemplate);
  if ((await hashTemplateDefinition(template)) !== template.templateHash) {
    throw new Error("templateHash does not match canonical template definition");
  }

  const existing = await store.read();
  if (existing === null) {
    await store.create(template);
    return "created";
  }
  if (canonicalPublishedTemplate(existing) === canonicalPublishedTemplate(template)) {
    return "unchanged";
  }
  throw new Error("immutable template version already exists with different content");
}
