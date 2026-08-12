// @vitest-environment node

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HOBBY_FUNCTION_LIMIT = 12;

describe("Vercel deployment layout", () => {
  it("keeps API TypeScript entries within the Hobby Serverless Function limit", async () => {
    const apiDirectory = fileURLToPath(new URL("../../api/", import.meta.url));
    const entries = await readdir(apiDirectory, { recursive: true });
    const functionCandidates = entries.filter((entry) => entry.endsWith(".ts"));

    expect(functionCandidates.length).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });
});
