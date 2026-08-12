import { describe, expect, it } from "vitest";
import { blockContentHashKey } from "./blockTarget";

describe("blockContentHashKey", () => {
  it("uses a collision-safe key for one Block content hash", () => {
    expect(blockContentHashKey("rumorsBlocks", "block/1")).toBe(
      "block:rumorsBlocks:block%2F1:content",
    );
  });
});
