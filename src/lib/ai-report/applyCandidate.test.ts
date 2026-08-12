import { describe, expect, it } from "vitest";
import { applyCandidateValue, candidateIsCurrent } from "./applyCandidate";

describe("candidate adoption", () => {
  it("appends list items without replacing existing points", () => {
    expect(applyCandidateValue(["现有"], ["现有", "新增"], "bullet_list", "append")).toEqual([
      "现有",
      "新增",
    ]);
  });

  it("escapes model HTML before storing rich text", () => {
    expect(applyCandidateValue("", "<script>x</script>\n\n结论", "rich_text", "rewrite")).toBe(
      "<p>&lt;script&gt;x&lt;/script&gt;</p><p>结论</p>",
    );
  });

  it("rejects a field or transcript hash mismatch", () => {
    expect(candidateIsCurrent({ a: "1" }, { a: "2" })).toBe(false);
    expect(candidateIsCurrent({ a: "1" }, { a: "1" }, "old", "new")).toBe(false);
  });
});
