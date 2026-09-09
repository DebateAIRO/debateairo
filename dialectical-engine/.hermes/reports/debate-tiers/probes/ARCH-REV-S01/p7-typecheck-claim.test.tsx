// ARCH-REV-S01 probe 6 — does `pnpm exec vitest run` TYPECHECK?
// PLAN.md:299-301 and §8's S01-13/C2 rows claim a REQUIRED type member would
// take tests/render/ux01-new-debate-form.test.tsx "from 1/8 to 0/8" and that the
// C2 command therefore detects that mutant. That is only true if vitest typechecks.
import { describe, expect, it } from "vitest";
import { buildNewDebateAskConfig } from "../../apps/ui/app/new/defaults.js";

type RequiredTier = { readonly mustBeThere: string };

describe("does vitest typecheck?", () => {
  it("runs a file carrying a hard TS type error", () => {
    // @ts-expect-error-NOT-USED: this is a real diagnostic, deliberately unsuppressed
    const broken: RequiredTier = { wrongKey: 1 };
    const n: number = "definitely not a number";
    expect(typeof broken).toBe("object");
    expect(typeof n).toBe("string");
  });

  it("calls buildNewDebateAskConfig with a spread that omits members — the ux01:217/:219 shape", () => {
    const defaults = { riskTier: "standard", budgetTier: "low", decisionScope: "personal",
      asOf: "2026-01-01T00:00", depth: 2, asOfWasEdited: false } as never;
    const config = buildNewDebateAskConfig(defaults, new Date("2026-01-01T00:00:00Z"));
    expect(config.as_of).toBe("2026-01-01T00:00:00.000Z");
    expect((config as Record<string, unknown>).plan_tier).toBeUndefined();
  });
});
