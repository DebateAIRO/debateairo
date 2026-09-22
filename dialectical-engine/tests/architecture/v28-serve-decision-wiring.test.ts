import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * ROUND 4 (V-28, rulings R-A / R-B) — THE RUNNER TAKES THE SERVE DECISION ONCE,
 * AND READS IT AT BOTH SITES.
 *
 * `decideMakerPositionServe` is driven at full strength by
 * `tests/unit/v28-spend-stopped-serve-decision.test.ts`. That proves the
 * decision, not the wiring: the round-3 suite proved `buildMakerPositionDisclosure`
 * in the same way, and its five cases would have stayed green had the function
 * been wired nowhere — which, on the path that mattered, it effectively was
 * (the run threw one statement earlier). No pool-free harness for
 * `WalkingSkeletonRunner.execute` exists, so the wiring is pinned on the SOURCE:
 * a weak pin, but one that fails on deletion, and deletion is the failure mode
 * three rounds did not catch. The whole-run confirmation stays in the numbered
 * Docker spec in `tests/integration/v28-model-spend.test.ts`.
 */
const RUNNER = new URL("../../apps/runner/src/index.ts", import.meta.url);

/** The body of one top-level exported function: from its `export` to the next. */
function exportedFunctionBody(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}`);
  expect(start, `export function ${name}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("V-28 round 4 — the post-authoring serve decision is one function, called by the runner", () => {
  it("is a pure function that projects, propagates, selects and discloses in one place", async () => {
    const source = await readFile(RUNNER, "utf8");
    const body = exportedFunctionBody(source, "decideMakerPositionServe");

    expect(body).toContain("projectJudgedStanding(");
    expect(body).toContain("evaluate(");
    expect(body).toContain("selectServedRootByStrength(");
    expect(body).toContain("buildMakerPositionDisclosure(");
    expect(body).toContain("NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW");
    // A decision, not a repository call: nothing here may touch the pool.
    expect(body).not.toContain("await ");
    expect(body).not.toContain("this.");
  });

  it("the run body calls it with the spend stop as an input, at the projection site", async () => {
    const source = await readFile(RUNNER, "utf8");

    expect(source).toMatch(
      /const makerPositionServe = decideMakerPositionServe\(\{[\s\S]*?effectiveMakerCount,[\s\S]*?runBodyBudgetStop,[\s\S]*?authoredMakerPositions,[\s\S]*?\}\);/u
    );
    // The projection and the propagation are READ from the decision, never
    // recomputed beside it from the planned panel size.
    expect(source).toContain("snapshot = makerPositionServe.standing.snapshot;");
    expect(source).toContain("const propagation = makerPositionServe.propagation;");
    expect(source).toContain("const servedRoot = makerPositionServe.servedRoot;");
    // The statement that keyed the reviewed seed on the PLANNED panel size —
    // the one that hid a paid-for root — is gone.
    expect(source).not.toMatch(/const reviewedNodeIds = effectiveMakerCount <= 1/u);
  });

  it("the fact bundle and the condition-mark records both read the decision's disclosure", async () => {
    const source = await readFile(RUNNER, "utf8");

    expect(source).toMatch(
      /buildFactBundle\(\{[\s\S]*?conditionMarks: Object\.freeze\(\[\.\.\.new Set\(\[\s*\.\.\.makerPositionServe\.disclosure\.conditionMarks,/u
    );
    expect(source).toContain(
      "let conditionMarkRecords: readonly ConditionMarkRecord[] = makerPositionServe.disclosure.records;"
    );
    // The disclosure is minted by the decision and by nothing else: exactly one
    // call site, and it is inside `decideMakerPositionServe`.
    const calls = source.split("buildMakerPositionDisclosure(").length - 1;
    const declarations = source.split("export function buildMakerPositionDisclosure(").length - 1;
    expect(declarations).toBe(1);
    expect(calls - declarations).toBe(1);
    expect(exportedFunctionBody(source, "decideMakerPositionServe")).toContain("buildMakerPositionDisclosure(");
  });

  it("does not re-open review calls for a stopped run (R-A)", async () => {
    const source = await readFile(RUNNER, "utf8");
    const guard = source.indexOf("const reviewPendingAuthoredNodes = async (): Promise<void> => {");
    expect(guard).toBeGreaterThanOrEqual(0);
    const head = source.slice(guard, guard + 600);

    expect(head).toContain("if (effectiveMakerCount <= 1) return;");
    expect(head).toContain("if (runBodyBudgetStop !== null) return;");
  });
});
