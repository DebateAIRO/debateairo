import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S05 support composition", () => {
  it("passes the register no-source deadline into the answer service", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/api/src/main.ts"), "utf8");
    expect(source).toMatch(/readSupportNoSourceCheckPolicy\(pool,\s*environment\.REGISTER_VERSION\)/u);
    expect(source).toMatch(/\?\? supportNoSourceCheckPolicyStartValues\(\)/u);
    expect(source).toMatch(/createSupportAnswerService\(\{[\s\S]*?noSourceCheck:\s*\{\s*timeoutMs:\s*supportNoSourceCheckPolicy\.timeoutMs\s*\}/u);
  });

  it("runs crisis recognition after admission and before the first fixed refusal", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/api/src/support/index.ts"), "utf8");
    const admission = source.indexOf('persistentAdmission === "LOCKED"');
    const recogniser = source.search(/\brecognisedSupportCrisis\s*\(/u);
    const refusal = source.indexOf('publicGuideBoundary.kind === "PRIVATE_RECORD_REQUEST"');
    expect(admission).toBeGreaterThan(-1);
    expect(recogniser).toBeGreaterThan(admission);
    expect(refusal).toBeGreaterThan(recogniser);
  });
});
