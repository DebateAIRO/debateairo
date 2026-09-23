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
 * on anything. (Its two other blocks are real specs on the embedded test Postgres —
 * no Docker — and passed on 2026-09-23; this one is not a spec at all.) So nothing anywhere confirms the whole run, and the source pins
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
 * repository (the one whole-run spec runs on the embedded Postgres, and its
 * spend-stop block is an unwired `describe.skip`). So this is a SOURCE pin, of the same kind and
 * with the same honest limits as the DL4-F3 and V-28 pins in
 * `tests/unit/provider-gateway-backoff.test.ts`.
 *
 * WHAT IT HOLDS. Each catch is located by a unique ANCHOR LINE that is not the
 * assignment being checked, so a pin cannot drift onto the wrong site. The
 * block is sliced by INDENTATION rather than by counting braces over raw text,
 * and the slice is then CHECKED — the decider call must be inside it and its
 * length is bounded — so a mis-slice fails loudly instead of quietly swallowing
 * a neighbour. Inside the block, the GUARD and the ASSIGNMENT are each required
 * to appear exactly once AS STATEMENTS — counted at the start of a line, after
 * indentation only — and the file-wide totals are counted the same way. It
 * therefore fails on deletion, on inversion of the pinned guard, and on
 * commenting the assignment out; the last row proves each of those by running
 * the whole assertion against the real source with the mutation applied IN
 * MEMORY (no product file is written).
 *
 * WHAT IT DOES NOT HOLD. It is text, not behaviour. A comment or a string
 * carrying the same statement text on its own line would satisfy it, a rewrite
 * that expresses the same guard differently would fail it while being correct,
 * and NOTHING here proves that a real run body, against a real Pool, ever
 * reaches these catches — that stays for the numbered contract in
 * `tests/integration/v28-model-spend.test.ts` once its harness is wired. What this block buys
 * is that the wiring cannot be deleted, inverted or commented out in silence,
 * which is the failure mode three review rounds did not catch.
 */
interface RunBodyStopSite {
  /** What the catch wraps, for the failure message. */
  readonly site: string;
  /** A unique anchor LINE inside the try — never the assignment it checks. */
  readonly anchor: string;
  /** The decision the catch is required to consult. */
  readonly decides: string;
  /**
   * The condition on which the refusal may still travel. Pinned because a
   * `throw error;` count alone cannot see an INVERTED guard: flipping
   * `=== null` to `!== null` makes every spend stop travel and every real
   * failure stop, and left the first version of this pin green.
   */
  readonly guard: string;
  /** The assignment that makes the refusal a STOP instead of a failure. */
  readonly assignment: string;
}

/** The four author catches share one guard; the review catch has its own. */
const PHASE_GUARD = "if (stop === null) throw error;";
const REVIEW_GUARD = "if (outcome.kind === \"RETHROW\") throw error;";

const RUN_BODY_STOP_SITES: readonly RunBodyStopSite[] = Object.freeze([
  {
    site: "the secondary root author",
    anchor: "callSiteKey: \"JUDGE:root:secondary\"",
    decides: "expansionPhaseStop(error)",
    guard: PHASE_GUARD,
    assignment: "runBodyBudgetStop = stop;"
  },
  {
    site: "each additional root author",
    anchor: "callSiteKey: `JUDGE:root:${makerIndex}`",
    decides: "expansionPhaseStop(error)",
    guard: PHASE_GUARD,
    assignment: "runBodyBudgetStop = stop;"
  },
  {
    site: "the cross-maker review",
    anchor: "const reviewAttempt = await cooldownAttempt({",
    decides: "reviewFailureOutcome(error)",
    guard: REVIEW_GUARD,
    assignment: "runBodyBudgetStop = outcome.stop;"
  },
  {
    site: "the expansion leg author",
    anchor: "callSiteKey: `JUDGE:${role}:root${leg.rootIndex}:r${leg.round}:p${leg.parentIndex}`",
    decides: "expansionPhaseStop(error)",
    guard: PHASE_GUARD,
    assignment: "runBodyBudgetStop = stop;"
  },
  {
    site: "the cross-root response author",
    anchor: "callSiteKey: `JUDGE:cross-root:${exchange.authorRootIndex}->${exchange.targetRootIndex}`",
    decides: "expansionPhaseStop(error)",
    guard: PHASE_GUARD,
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
 * How many times `statement` appears AS A STATEMENT: at the start of a line,
 * after indentation and nothing else.
 *
 * A plain substring count cannot tell code from a comment, so commenting an
 * assignment out — `// runBodyBudgetStop = stop;` — left both the per-site and
 * the file-wide counts unchanged, and the first version of this pin green. The
 * lookahead is anchored to the newline and the indentation, so a `//`, a `*` or
 * any other prefix on that line takes the occurrence out of the count.
 *
 * It does NOT tell code from a string or from a comment on its OWN line that
 * happens to start with the same text; nothing lexical can, and the docblock
 * above says so rather than claiming otherwise.
 */
function statementOccurrences(text: string, statement: string): number {
  const escaped = statement.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return text.split(new RegExp(`\\n[ ]+(?=${escaped})`, "u")).length - 1;
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
  expect(statementOccurrences(source, STOP_DECLARATION), STOP_DECLARATION).toBe(1);
  expect(declaredAt, "declared before the first phase catch")
    .toBeLessThan(source.indexOf(RUN_BODY_STOP_SITES[0]!.anchor));

  for (const site of RUN_BODY_STOP_SITES) {
    const block = catchBlockAfter(source, site.anchor);
    // The slice really is this phase's catch, and it is a catch and not a file.
    expect(block, `${site.site}: consults the decision`).toContain(site.decides);
    expect(block.length, `${site.site}: the slice is a catch block`).toBeLessThan(1_200);
    // The refusal becomes a STOP, exactly once, in code and not in a comment.
    expect(statementOccurrences(block, site.assignment), `${site.site}: ${site.assignment}`).toBe(1);
    // And it travels from here on ONE condition only, WITH ITS SENSE PINNED:
    // inverting the guard makes every spend stop travel and every real failure
    // stop, and a count of `throw error;` alone cannot see that.
    expect(statementOccurrences(block, site.guard), `${site.site}: ${site.guard}`).toBe(1);
    // A second `throw error;` anywhere in the block — the reviewer's original
    // mutation — even if the guard above is intact. A substring count, on
    // purpose: the guard's own `throw error;` is not at the start of its line.
    expect(block.split("throw error;"), `${site.site}: one rethrow, the guarded one`).toHaveLength(2);
  }

  // Every assignment in the file belongs to one of the five sites above.
  expect(statementOccurrences(source, "runBodyBudgetStop = stop;"), "four `= stop`").toBe(4);
  expect(statementOccurrences(source, "runBodyBudgetStop = outcome.stop;"), "one `= outcome.stop`").toBe(1);

  // Read once to force the envelope question, once to keep the work.
  expect(statementOccurrences(source, INITIAL_DECISION), INITIAL_DECISION).toBe(1);
  expect(statementOccurrences(source, FORCED_TERMINAL), FORCED_TERMINAL).toBe(1);
  // The forced terminal is taken on the HARD_STOP branch of that same decision.
  expect(source).toContain("if (initialEnvelopeDecision.kind === \"HARD_STOP\") {");
}

describe("FW-F / C1 — the run body's spend stop is recorded at five catches and read at the envelope", () => {
  it("holds on the tree", async () => {
    assertRunBodyMoneyStopWiring(await readFile(RUNNER, "utf8"));
  });

  /**
   * Each entry is a real defect written as a one-line edit of the tracked
   * source. `String.prototype.replace` takes the FIRST occurrence, which for
   * every `stop`-shaped mutation below is the secondary-root catch — the site
   * where the money refusal discarded a paid-for root 0.
   *
   * The last three were added after the fix-wave review measured them passing:
   * the pin counted `throw error;` and the assignment as substrings, so an
   * INVERTED guard and a COMMENTED-OUT assignment both left it green.
   */
  const MUTATIONS: ReadonlyArray<readonly [string, string, string]> = Object.freeze([
    // The refusal travels again: the whole defect, reintroduced (Important 1).
    ["the stop is thrown instead of recorded", "runBodyBudgetStop = stop;", "throw error;"],
    // The stop reaches the serve chain but no terminal is built from it, so the
    // run crashes instead of ending in its own components-only state (I3).
    ["the forced envelope terminal is deleted", FORCED_TERMINAL, "throw new Error(\"no terminal\");"],
    // The review catch, whose assignment has its own shape.
    ["the review stop is thrown instead of recorded", "runBodyBudgetStop = outcome.stop;", "throw error;"],
    // Sense inverted: every spend stop travels, every real failure stops.
    ["the phase guard is inverted", PHASE_GUARD, "if (stop !== null) throw error;"],
    ["the review guard is inverted", REVIEW_GUARD, "if (outcome.kind !== \"RETHROW\") throw error;"],
    // Present in the text, absent from the program.
    ["the stop is commented out", "runBodyBudgetStop = stop;", "// runBodyBudgetStop = stop;"]
  ]);

  it("fails when any one of six mutations is applied to that same source", async () => {
    const source = await readFile(RUNNER, "utf8");

    for (const [name, from, to] of MUTATIONS) {
      const mutated = source.replace(from, to);
      expect(mutated, `${name}: the mutation changed the source`).not.toBe(source);
      expect(() => assertRunBodyMoneyStopWiring(mutated), name).toThrow();
    }
  });
});
