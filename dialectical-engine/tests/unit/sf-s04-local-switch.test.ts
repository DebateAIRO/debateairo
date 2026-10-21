import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("S04 question check local switch composition", () => {
  it("reads the question-check flag on each check and disables it for hosted mode", () => {
    expect(existsSync("apps/api/src/question-check/compose.ts")).toBe(true);
    const source = readFileSync("apps/api/src/question-check/compose.ts", "utf8");
    expect(source).toContain('localOffFlagPath(input.apiPort, "question-check")');
    expect(source).toContain('input.mode === "hosted" ? null');
    expect(source).toContain("port: switcher.current");
  });
});
