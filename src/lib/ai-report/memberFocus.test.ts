import { expect, it } from "vitest";
import { requireAuthenticatedUserId } from "./memberFocus";

it("rejects a focus save when authentication is unavailable", () => {
  expect(() => requireAuthenticatedUserId(null)).toThrow("Not authenticated");
});
