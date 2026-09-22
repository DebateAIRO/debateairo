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
 * three rounds did not catch.
 *
 * FW-F (final review, Important 1) — THE RECORD THIS DOCBLOCK USED TO CARRY WAS
 * FALSE. It said "the whole-run confirmation stays in the numbered Docker spec
 * in `tests/integration/v28-model-spend.test.ts`". That file's whole-run block
 * (:279-282) is a `describe.skip` whose single body is `expect.unreachable` — a
 * NUMBERED CONTRACT for a harness nobody has wired, not a confirmation waiting
 * on Docker. (Its two other blocks are real Docker specs; this one is not a
 * spec at all.) So nothing anywhere confirms the whole run, and the source pins
 * in this file are the only thing standing between the run-body money stop and
 * a silent deletion. They are written to say so.
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

/**
 * FW-F (final review, Important 1 and 3) — THE RUN BODY RECORDS THE SPEND STOP
 * INSTEAD OF THROWING IT, AND THE ENVELOPE EVALUATION READS WHAT IT RECORDED.
 *
 * C1 is a five-site invariant: a spend refusal raised while authoring the
 * secondary root, an additional root, an expansion leg or a cross-root
 * response, or while reviewing, must STOP the phase by writing
 * `runBodyBudgetStop` — never by letting the refusal travel. Travelling is the
 * exact defect rounds 2 to 4 fixed three times: a money refusal on root 1
 * discards a root 0 that was already minted, panelled and PAID FOR, and the run
 * serves nothing. The stop is then read twice at the head of the serve chain:
 * once to force the envelope decision, once to choose the terminal that keeps
 * the work.
 *
 * Until this block, NOTHING that CI runs held any of it. The gate suites drive
 * the pure deciders (`expansionPhaseStop`, `reviewFailureOutcome`,
 * `decideMakerPositionServe`) and prove they answer correctly; none of them
 * proves a catch calls one, or does what the answer says. Replacing
 * `runBodyBudgetStop = stop;` in the first catch with `throw error;` — the
 * whole defect, reintroduced — left `pnpm run test:ci-gate` green.
 *
 * A DRIVEN pin is not available: the run body is the middle of
 * `WalkingSkeletonRunner.execute`, which is built from a `Pool` and eleven
 * repositories over it, and no pool-free harness for it exists anywhere in the
 * repository (the one whole-run spec is Docker-bound, and its spend-stop block
 * is an unwired `describe.skip`). So this is a SOURCE pin, and it is built to
 * be the kind that cannot go vacuous:
 *
 *   - each catch is located by an anchor that is NOT the assignment it checks
 *     (the call-site key of the call the catch wraps), and each anchor is
 *     required to be unique, so a pin can never drift onto the wrong site;
 *   - the block is sliced by INDENTATION rather than by counting braces over
 *     raw text, and the slice is then CHECKED — the decider call and the
 *     guarded rethrow must both be inside it, and its length is bounded — so a
 *     mis-slice fails loudly instead of quietly swallowing a neighbour;
 *   - the counts are exact (`toHaveLength(2)` on a split), so a second
 *     assignment or a sixth site is as loud as a deleted one;
 *   - and the last row PROVES THE PIN FAILS, by running it against the real
 *     source with each of the reviewer's two mutations applied IN MEMORY. No
 *     product file is written; the tracked tree is read once and mutated in a
 *     string.
 */
interface RunBodyStopSite {
  /** What the catch wraps, for the failure message. */
  readonly site: string;
  /** Unique, and never the assignment: the call-site key of the wrapped call. */
  readonly anchor: string;
  /** The decision the catch is required to consult. */
  readonly decides: string;
  /** The assignment that makes the refusal a STOP instead of a failure. */
  readonly assignment: string;
}

const RUN_BODY_STOP_SITES: readonly RunBodyStopSite[] = Object.freeze([
  {
    site: "the secondary root author",
    anchor: "callSiteKey: \"JUDGE:root:secondary\"",
    decides: "expansionPhaseStop(error)",
    assignment: "runBodyBudgetStop = stop;"
  },
  {
    site: "each additional root author",
    anchor: "callSiteKey: `JUDGE:root:${makerIndex}`",
    decides: "expansionPhaseStop(error)",
    assignment: "runBodyBudgetStop = stop;"
  },
  {
    site: "the cross-maker review",
    anchor: "const reviewAttempt = await cooldownAttempt({",
    decides: "reviewFailureOutcome(error)",
    assignment: "runBodyBudgetStop = outcome.stop;"
  },
  {
    site: "the expansion leg author",
    anchor: "callSiteKey: `JUDGE:${role}:root${leg.rootIndex}:r${leg.round}:p${leg.parentIndex}`",
    decides: "expansionPhaseStop(error)",
    assignment: "runBodyBudgetStop = stop;"
  },
  {
    site: "the cross-root response author",
    anchor: "callSiteKey: `JUDGE:cross-root:${exchange.authorRootIndex}->${exchange.targetRootIndex}`",
    decides: "expansionPhaseStop(error)",
    assignment: "runBodyBudgetStop = stop;"
  }
]);

/** Declared BEFORE the first phase, which is what round 2 got wrong. */
const STOP_DECLARATION = "let runBodyBudgetStop: EnvelopeStopKind | null = null;";
/** The forced envelope question at the head of the serve chain. */
const INITIAL_DECISION =
  "const initialEnvelopeDecision = await evaluateEnvelope(0, runBodyBudgetStop !== null);";
/** The terminal that KEEPS what the stopped run produced (Important 3). */
const FORCED_TERMINAL =
  "result = await makeEnvelopeTerminal(initialEnvelopeDecision, runBodyBudgetStop ?? \"ATTEMPTS\");";

/**
 * The catch block that follows `anchor`, sliced by the indentation of the line
 * that opens it. Text is not syntax and every lexical approximation of syntax
 * has an input that defeats it, so the slice is never trusted: the caller
 * asserts what the block must contain and how long it may be, and a run-away or
 * truncated slice fails one of those rather than passing quietly.
 */
function catchBlockAfter(source: string, anchor: string): string {
  const anchorAt = source.indexOf(anchor);
  expect(anchorAt, `anchor is present: ${anchor}`).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(anchor, anchorAt + 1), `anchor is unique: ${anchor}`).toBe(-1);
  const opensAt = source.indexOf("catch (error) {", anchorAt);
  expect(opensAt, `a catch follows: ${anchor}`).toBeGreaterThan(anchorAt);
  const lineStart = source.lastIndexOf("\n", opensAt) + 1;
  const indent = /^[ ]*/u.exec(source.slice(lineStart, opensAt))?.[0] ?? "";
  expect(indent.length, `the catch after ${anchor} is indented`).toBeGreaterThan(0);
  const closesAt = source.indexOf(`\n${indent}}`, opensAt);
  expect(closesAt, `the catch after ${anchor} closes at its own indentation`).toBeGreaterThan(opensAt);
  return source.slice(opensAt, closesAt);
}

/**
 * The whole invariant, as a function of the source text, so the row below can
 * run it against a MUTATED copy and prove it fails.
 */
function assertRunBodyMoneyStopWiring(source: string): void {
  // The stop is declared before the first phase that can reach it. Round 2
  // declared it after the root loops, and a refusal while authoring root 1 or 2
  // threw `MAKER_POSITION_UNAVAILABLE` and discarded root 0.
  const declaredAt = source.indexOf(STOP_DECLARATION);
  expect(declaredAt, STOP_DECLARATION).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(STOP_DECLARATION, declaredAt + 1), "declared once").toBe(-1);
  expect(declaredAt, "declared before the first phase catch")
    .toBeLessThan(source.indexOf(RUN_BODY_STOP_SITES[0]!.anchor));

  for (const site of RUN_BODY_STOP_SITES) {
    const block = catchBlockAfter(source, site.anchor);
    // The slice really is this phase's catch, and it is a catch and not a file.
    expect(block, `${site.site}: consults the decision`).toContain(site.decides);
    expect(block.length, `${site.site}: the slice is a catch block`).toBeLessThan(1_200);
    // The refusal becomes a STOP, exactly once.
    expect(block.split(site.assignment), `${site.site}: ${site.assignment}`).toHaveLength(2);
    // And it travels from here on ONE condition only — the guarded rethrow for
    // a refusal that is not a spend stop. A second `throw error;` is the
    // mutation this pin exists to catch.
    expect(block.split("throw error;"), `${site.site}: one guarded rethrow`).toHaveLength(2);
  }

  // Every assignment in the file belongs to one of the five sites above.
  expect(source.split("runBodyBudgetStop = stop;"), "four `= stop` assignments").toHaveLength(5);
  expect(source.split("runBodyBudgetStop = outcome.stop;"), "one `= outcome.stop`").toHaveLength(2);

  // Read once to force the envelope question, once to keep the work.
  expect(source.split(INITIAL_DECISION), INITIAL_DECISION).toHaveLength(2);
  expect(source.split(FORCED_TERMINAL), FORCED_TERMINAL).toHaveLength(2);
  // The forced terminal is taken on the HARD_STOP branch of that same decision.
  expect(source).toContain("if (initialEnvelopeDecision.kind === \"HARD_STOP\") {");
}

describe("FW-F / C1 — the run body's spend stop is recorded at five catches and read at the envelope", () => {
  it("holds on the tree", async () => {
    assertRunBodyMoneyStopWiring(await readFile(RUNNER, "utf8"));
  });

  it("fails when either of the reviewer's mutations is applied to that same source", async () => {
    const source = await readFile(RUNNER, "utf8");

    // Important 1's mutation, at the first catch (the secondary root author):
    // the refusal travels again, and a paid-for root 0 is discarded.
    const travels = source.replace("runBodyBudgetStop = stop;", "throw error;");
    expect(travels, "the mutation changed the source").not.toBe(source);
    expect(() => assertRunBodyMoneyStopWiring(travels)).toThrow();

    // Important 3's mutation: the stop reaches the serve chain but no terminal
    // is built from it, so the run crashes instead of ending in its own
    // components-only state.
    const noTerminal = source.replace(FORCED_TERMINAL, "throw new Error(\"no terminal\");");
    expect(noTerminal, "the mutation changed the source").not.toBe(source);
    expect(() => assertRunBodyMoneyStopWiring(noTerminal)).toThrow();

    // And the review catch, whose assignment has its own shape.
    const reviewTravels = source.replace("runBodyBudgetStop = outcome.stop;", "throw error;");
    expect(reviewTravels, "the mutation changed the source").not.toBe(source);
    expect(() => assertRunBodyMoneyStopWiring(reviewTravels)).toThrow();
  });
});
