import { describe, expect, it } from "vitest";
import { hashFieldMap, hashFieldValue } from "./hash";

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
});
