/**
 * V4 start step, Task 8 Step 1: every v1 receipt the release mints today, pinned byte for byte BEFORE receipt v2 exists,
 * so nothing added for v2 can move an R22 debate's shape or web receipt. Every plan x makers {2, 4, 5} x depth {1, 2}
 * x backup {0, 1}, at the standard settings, with a START web part (5 paths, Quick) on the paid plans, plus two v1 web
 * receipts (a debate's start and a dig). `DEBATEAI_WRITE_RECEIPT_GOLDEN=1` writes the fixture; without it the test compares.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { debateShapeSettingsOf } from "@debateai/contract";
import {
  DEBATE_SHAPE_PLAN_KEYS, computeStructuralCeilingBasis, debateShapePolicyStartValues, normaliseDepthParamsForShape,
  resolveDebateShape, webReceipt, webSitesOf
} from "@debateai/register";

const FIXTURE = new URL("../fixtures/receipts/v1-receipts.json", import.meta.url);
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const ASKED = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);
const START_WEB = webSitesOf({ kind: "START", depth: "QUICK", paths: 5 });

function minted(): Readonly<Record<string, unknown>> {
  const receipts: Record<string, unknown> = {};
  for (const plan of DEBATE_SHAPE_PLAN_KEYS) {
    for (const makers of [2, 4, 5]) {
      for (const depth of [1, 2]) {
        for (const backup of [0, 1] as const) {
          const depthParams = normaliseDepthParamsForShape({ depth, ...ASKED }, POLICY, plan);
          const shape = resolveDebateShape({ policy: POLICY, plan, makers, settings: debateShapeSettingsOf(depthParams) });
          receipts[`${plan}/makers-${makers}/depth-${depth}/backup-${backup}`] = computeStructuralCeilingBasis({
            ...TERMS, panelSize: makers, depth, backupSequencesProvisioned: backup,
            ...(shape === null ? {} : { shape }), ...(plan === "free" ? {} : { web: START_WEB })
          });
        }
      }
    }
  }
  receipts["web/start-quick-5"] = webReceipt(START_WEB, 3);
  receipts["web/dig-thorough-3"] = webReceipt(webSitesOf({ kind: "DIG", depth: "THOROUGH", digPicks: 3 }), 3);
  return receipts;
}

describe("the v1 receipts stay byte for byte", () => {
  it("mints every v1 shape and web receipt exactly as pinned", () => {
    const text = `${JSON.stringify(minted(), null, 2)}\n`;
    if (process.env.DEBATEAI_WRITE_RECEIPT_GOLDEN === "1") writeFileSync(FIXTURE, text);
    expect(text).toBe(readFileSync(FIXTURE, "utf8"));
  });
});
