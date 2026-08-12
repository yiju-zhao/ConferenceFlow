// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rules = readFileSync(new URL("./storage.rules", import.meta.url), "utf8");

function transcriptAuthorizationFunction(): string {
  const match = rules.match(
    /function canAccessConferenceTranscript\(confId\) \{([\s\S]*?)\n    \}/,
  );
  if (!match) throw new Error("missing transcript authorization function");
  return match[1];
}

describe("transcript Storage policy", () => {
  it("allows the Firebase super-admin custom claim", () => {
    expect(transcriptAuthorizationFunction()).toContain(
      'request.auth.token.globalRole == "super_admin"',
    );
  });

  it("preserves the approved conference-member branch", () => {
    const authorization = transcriptAuthorizationFunction();
    expect(authorization).toContain("request.auth != null");
    expect(authorization).toContain("members/$(request.auth.uid)");
    expect(authorization).toContain('.data.status == "approved"');
    expect(rules).toMatch(
      /match \/conference-transcripts\/\{confId\}\/\{reportId\}\/\{sessionId\}\/\{fileName\}[\s\S]*allow read, write: if canAccessConferenceTranscript\(confId\);/,
    );
  });

  it("protects nested Block Transcript objects with conference membership", () => {
    expect(rules).toMatch(
      /match \/conference-transcripts\/\{confId\}\/\{reportId\}\/blocks\/\{targetFieldId\}\/\{blockId\}\/\{fileName\}[\s\S]*allow read, write: if canAccessConferenceTranscript\(confId\);/,
    );
  });

  it("has no root catch-all that could bypass transcript authorization", () => {
    expect(rules).not.toMatch(/match\s+\/\{[^}]+=\*\*\}\s*\{/);
  });
});
