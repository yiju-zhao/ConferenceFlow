import { hashText } from "./hash";

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

export function canonicalTemplateDefinition(template: {
  templateId: string;
  version: number;
  fields: unknown[];
}): string {
  return JSON.stringify(
    canonicalize({
      templateId: template.templateId,
      version: template.version,
      fields: template.fields,
    }),
  );
}

export function hashTemplateDefinition(template: {
  templateId: string;
  version: number;
  fields: unknown[];
}): Promise<string> {
  return hashText(canonicalTemplateDefinition(template));
}
