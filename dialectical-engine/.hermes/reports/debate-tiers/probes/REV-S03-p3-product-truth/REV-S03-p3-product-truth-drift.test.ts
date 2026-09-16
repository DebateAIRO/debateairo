// REV-S03-p3-product-truth — the lens's OWN fixture, pass 3, written against 3f488b3f.
//
// THE TWO ROSTERS. /new's cards and a run's admission do not read the same source:
//   * DISPLAY  — GET /v1/plan-tiers -> the PUBLISHED REGISTER ROW, rebuilt from
//     config/models.yaml every `pnpm dev:auth:up` (apps/api/src/index.ts:1536-1547,
//     apps/runner/src/dev-deployment-register.ts:343-350).
//   * EXECUTION — admission -> PLAN_TIER_ROSTERS, the COMMITTED GENERATED constant
//     packages/contract/generated/plan-tier-rosters.ts, refreshed only by
//     `pnpm generate:contract` (package.json:22) (apps/api/src/index.ts:1272,1279).
//
// `dev:auth:up` (package.json:36 -> apps/runner/src/dev-auth-stack-cli.ts) does not run
// the generator. SPEC-v3 §2 steps 6 and 10 tell V to edit the file and run ONLY
// `dev:auth:up`. This fixture records whether the two sources can then disagree, and what
// V is shown when they do. No prediction is asserted about which is "right" — it records.

import { describe, expect, it } from "vitest";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { loadModelConfig } from "@debateai/model-config";
import { developmentPlanTierRosters } from "../../apps/runner/src/dev-deployment-register.js";

describe("REV-S03-p3-product-truth — the card's roster vs the run's roster at 3f488b3f", () => {
  it("D1 with the file as committed, the two sources agree (the control)", () => {
    const fromFile = developmentPlanTierRosters(loadModelConfig(process.cwd()));
    console.log(`[PROBE p3 drift] DISPLAY   (register row, from config/models.yaml) free=${JSON.stringify([...fromFile.free])} premium=${JSON.stringify([...fromFile.premium])}`);
    console.log(`[PROBE p3 drift] EXECUTION (generated constant, admission)         free=${JSON.stringify([...PLAN_TIER_ROSTERS.free])} premium=${JSON.stringify([...PLAN_TIER_ROSTERS.premium])}`);
    expect([...fromFile.free]).toEqual([...PLAN_TIER_ROSTERS.free]);
    expect([...fromFile.premium]).toEqual([...PLAN_TIER_ROSTERS.premium]);
  });

  it("D2 the generated constant is a COMMITTED artefact, not derived at boot", async () => {
    const { readFileSync } = await import("node:fs");
    const generated = readFileSync("packages/contract/generated/plan-tier-rosters.ts", "utf8");
    console.log(`[PROBE p3 drift] generated file head = ${generated.split("\n").slice(0, 3).join(" | ")}`);
    expect(generated).toContain("GENERATED_PLAN_TIER_ROSTERS");
    // It names the ids literally: nothing reads config/models.yaml at admission time.
    for (const id of PLAN_TIER_ROSTERS.free) expect(generated).toContain(id);
  });

  it("D3 `dev:auth:up` does not run `generate:contract` (so an edit moves only the card)", async () => {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const authUp = pkg.scripts["dev:auth:up"];
    console.log(`[PROBE p3 drift] dev:auth:up = ${authUp}`);
    expect(authUp).not.toContain("generate:contract");
    expect(authUp).not.toContain("generate-plan-tier-rosters");

    const stackCli = readFileSync("apps/runner/src/dev-auth-stack-cli.ts", "utf8");
    const stack = readFileSync("apps/runner/src/dev-auth-stack.ts", "utf8");
    const mentionsGenerator = /generate:contract|generate-plan-tier-rosters|generatePlanTierRosters/u;
    console.log(`[PROBE p3 drift] stack cli mentions the generator? ${mentionsGenerator.test(stackCli)}`);
    console.log(`[PROBE p3 drift] stack     mentions the generator? ${mentionsGenerator.test(stack)}`);
    expect(mentionsGenerator.test(stackCli)).toBe(false);
    expect(mentionsGenerator.test(stack)).toBe(false);
  });
});
