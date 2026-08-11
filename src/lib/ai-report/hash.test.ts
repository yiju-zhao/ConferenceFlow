import { describe, expect, it } from "vitest";
import { canonicalFieldValue, hashFieldMap, hashFieldValue, hashText } from "./hash";

describe("AI report hashes", () => {
  it("is stable for the same raw field value", async () => {
    expect(await hashFieldValue(["A", "B"])).toBe(await hashFieldValue(["A", "B"]));
  });

  it("keys the returned hashes by field id", async () => {
    await expect(hashFieldMap({ summaryPoints: ["A"], rumors: "B" })).resolves.toEqual({
      summaryPoints: await hashFieldValue(["A"]),
      rumors: await hashFieldValue("B"),
    });
  });

  it("matches the SHA-256 known vector and canonicalizes nullish values", async () => {
    expect(await hashText("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(canonicalFieldValue(undefined)).toBe("null");
    expect(await hashFieldValue(undefined)).toBe(await hashText("null"));
  });
});
