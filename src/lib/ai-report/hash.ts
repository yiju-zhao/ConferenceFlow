function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

export function canonicalFieldValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function hashFieldValue(value: unknown): Promise<string> {
  return hashText(canonicalFieldValue(value));
}

export async function hashFieldMap(
  values: Record<string, unknown>,
): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(values).map(async ([id, value]) => [id, await hashFieldValue(value)]),
    ),
  );
}
