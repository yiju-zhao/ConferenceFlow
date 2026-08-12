import { describe, expect, it, vi } from "vitest";

vi.mock("./transcript-parser", () => {
  throw new Error("daily generation must not load transcript-parser");
});

import { generateDailyCandidate } from "./generate-daily";

describe("daily generation source boundary", () => {
  it("loads without the transcript parser runtime module", () => {
    expect(generateDailyCandidate).toBeTypeOf("function");
  });
});
