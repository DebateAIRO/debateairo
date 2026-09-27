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
 *
 * ENGINE MONEY RULE, TASK M2: the whole run is now driven for the stops the
 * rule changed — `tests/integration/database.test.ts` ("Engine money rule M2
 * …") runs the real runner on the embedded Postgres through a money stop on
 * root 1, a usage stop, an attempt stop in review, a stop on the first root's
 * panel and one on its author's own call. That suite is not in the CI gate, so
 * the source pins below still stand guard in the gate.
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
 * INSTEAD OF THROWING IT.
 *
 * C1 is a five-site invariant: a spend refusal raised while authoring the
 * secondary root, an additional root, an expansion leg or a cross-root
 * response, or while reviewing, must STOP the phase by writing
 * `runBodyBudgetStop` — never by letting the refusal travel. Travelling is the
 * exact defect rounds 2 to 4 fixed three times: a money refusal on root 1
 * discards a root 0 that was already minted, panelled and PAID FOR, and the run
 * serves nothing.
 *
 * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — WHAT THE RECORDED STOP NOW DOES.
 * V-28 used to read the stop twice at the head of the serve chain: once to
 * FORCE the envelope decision to a hard stop, once to choose the components-only
 * terminal — so a run stopped while arguing never reached the answer-writer.
 * The owner's rule ("no debate ends without a final verdict unless there is a
 * technical problem; money is never the reason") amends that. The stop now ends
 * the ARGUING only:
 *
 *  · it is still recorded at every catch, and now also on the first root's
 *    panel (`PANEL:root`), which keeps the voices it heard, hands the stop back
 *    instead of letting it escape the work item, and is recorded by its call
 *    site — so the stop is declared before root 0;
 *  · a stop on the first root's panel stops everything after it: the secondary
 *    root is not authored;
 *  · the serve gate NEVER forces a hard stop from it — the envelope question is
 *    asked on the attempt count alone, and the only terminal taken there is the
 *    attempt-overspend one;
 *  · nothing after the gate reads it either — not the serve chain, not the
 *    persist — except the one call that puts it on the answer, so no later
 *    statement can fail the run on it (M2 review polish);
 *  · it rides the answer as the envelope record that names it
 *    (`runBodyStopDisclosure`), so the honesty drawer still says the debate was
 *    cut short;
 *  · the one stop that still ends a run without an answer — the author's own
 *    first call refused by a ceiling — fails typed, as
 *    `RUN_CEILING_BELOW_FIRST_CALL` (`firstCallCeilingFailure`).
 *
 * The gate suites drive the pure deciders (`expansionPhaseStop`,
 * `reviewFailureOutcome`, `panelSpendStop`, `firstCallCeilingFailure`,
 * `runBodyStopDisclosure`, `decideMakerPositionServe`) and prove they answer
 * correctly; none of them proves a catch calls one, or does what the answer
 * says. Replacing `runBodyBudgetStop = stop;` in the first catch with
 * `throw error;` — the whole defect, reintroduced — left `pnpm run test:ci-gate`
 * green before this block existed.
 *
 * A DRIVEN pin is not available in the gate: the run body is the middle of
 * `WalkingSkeletonRunner.execute`, which is built from a `Pool` and eleven
 * repositories over it, and no pool-free harness for it exists. The whole run
 * IS driven, on the embedded Postgres, by `tests/integration/database.test.ts`
 * ("Engine money rule M2 …"), which the CI gate does not run. So this is a
 * SOURCE pin, of the same kind and with the same honest limits as the DL4-F3
 * and V-28 pins in `tests/unit/provider-gateway-backoff.test.ts`.
 *
 * WHAT IT HOLDS. Each catch is located by a unique ANCHOR LINE that is not the
 * assignment being checked, so a pin cannot drift onto the wrong site. The
 * block is sliced by INDENTATION rather than by counting braces over raw text,
 * and the slice is then CHECKED — the decider call must be inside it and its
 * length is bounded — so a mis-slice fails loudly instead of quietly swallowing
 * a neighbour. Inside the block, the GUARD and the ASSIGNMENT are each required
 * to appear exactly once AS STATEMENTS — counted at the start of a line, after
 * indentation only — and the file-wide totals are counted the same way. The
 * serve gate is pinned by what it must NOT contain: the recorded stop, anywhere
 * between the envelope question's definition and the answer-writer's band. It
 * therefore fails on deletion, on inversion of a pinned guard, on commenting an
 * assignment out, and on any route by which the gate could force the hard stop
 * again; the last row proves each of those by running the whole assertion
 * against the real source with the mutation applied IN MEMORY (no product file
 * is written).
 *
 * WHAT IT DOES NOT HOLD. It is text, not behaviour. A comment or a string
 * carrying the same statement text on its own line would satisfy it, and a
 * rewrite that expresses the same guard differently would fail it while being
 * correct. What this block buys is that the wiring cannot be deleted, inverted,
 * commented out or turned back into a forced terminal in silence.
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

/** Declared BEFORE root 0 (Task M2), so the first root's panel can record it. */
const STOP_DECLARATION = "let runBodyBudgetStop: EnvelopeStopKind | null = null;";
/** The author's own first call — the anchor the declaration must precede. */
const ROOT_0_AUTHOR = "const primaryAttempt = await cooldownAttempt({";
/** Task M2: a ceiling below the first call fails typed; anything else travels as itself. */
const FIRST_CALL_FAILURE = "throw firstCallCeilingFailure(error) ?? error;";
/**
 * Task M2: the first root's panel keeps the voices it heard (the author alone
 * only when no member had answered) instead of escaping the work item. The
 * rule's name, AUTHOR_ONLY, is older than keeping the heard voices; it now
 * means "this panel may not end the work item", not "the author only".
 */
const ROOT_PANEL_CALL = "callSiteKey: \"PANEL:root\",";
const ROOT_PANEL_RULE = "onSpendStop: \"AUTHOR_ONLY\"";
const CHILD_PANEL_CALL = "callSiteKey: `PANEL:${input.callSiteKey}`,";
const CHILD_PANEL_RULE = "onSpendStop: \"TRAVEL\"";
const ROOT_PANEL_RECORD = "if (selection.spendStop !== null) runBodyBudgetStop = selection.spendStop;";
/**
 * Task M2 polish: the node panel no longer catches the stop. The first root's
 * panel asks `runJudgePanel` to RETURN the voices it heard with the stop; every
 * other panel lets it rethrow. The returned stop is decided by `panelSpendStop`,
 * and a panel cut short is disclosed as PANEL-PARTIAL when any voice was heard.
 */
const PANEL_STOP_MAPPING = "onRunLevelSpendStop: input.onSpendStop === \"AUTHOR_ONLY\" ? \"RETURN_HEARD\" : \"RETHROW\"";
const PANEL_STOP_DECISION = "? panelSpendStop(panel.stoppedBy, input.onSpendStop)";
const PANEL_STOP_GUARD = "if (Object.hasOwn(panel, \"stoppedBy\") && spendStop === null) throw panel.stoppedBy;";
const PANEL_PARTIAL_RULE = "else if (memberFailures.length > 0 || spendStop !== null) marks.push(PANEL_PARTIAL_MARK);";
/** Task M2: nothing more is argued after a stop on the first root's panel. */
const SECONDARY_GUARD = "if (effectiveMakerCount > 1 && runBodyBudgetStop === null) {";
/** The serve gate: the envelope question, asked on the attempt count alone. */
const EVALUATE_DEFINITION = "const evaluateEnvelope = (";
const EVALUATE_DEFAULT = "forceHardStop = false\n    ): Promise<BudgetPressureDecision> =>";
const INITIAL_DECISION = "const initialEnvelopeDecision = await evaluateEnvelope();";
/** The only terminal the gate may take: attempts overspent, never the recorded stop. */
const ATTEMPT_TERMINAL = "result = await makeEnvelopeTerminal(initialEnvelopeDecision);";
/** Where the serve gate ends: the answer-writer's band is asked for. */
const GATE_END = "const candidateConfidenceBand = await servedCandidateConfidenceBand();";
/** Task M2: the stop rides the answer as the envelope record that names it. */
const DISCLOSURE_CALL = "const runBodyStopRecord = runBodyStopDisclosure({";
const DISCLOSURE_APPEND = "conditionMarkRecords = Object.freeze([...conditionMarkRecords, runBodyStopRecord]);";
const FINAL_DECISION = "const finalEnvelopeDecision = await evaluateEnvelope();";
const LABEL_DECISION = "const answerCarriesLabel =";
/**
 * Task M3 (spec §14.4.5): the stop is ALSO kept on the owner-side disclosure
 * row, for every answer — a DEFECT answer included, which carries no envelope
 * record. The row is written after the persist, far past the gate, so the stop
 * is captured once where the body ends (beside the serve decision that reads
 * it) and only that capture travels. Pin 8 keeps the capture from becoming a
 * way around pin 7.
 */
const BODY_FACTS = "const serveDisclosureBody = serveDisclosureBodyFacts({ runBodyBudgetStop, decision: makerPositionServe });";
const SERVE_DECISION = "const makerPositionServe = decideMakerPositionServe({";
const BODY_FACTS_READ = "body: serveDisclosureBody";
const DISCLOSURE_ROW_WRITE = "await this.#recordServeDisclosure(";

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

/** The text of one call's argument object: from `anchor` to the first `});` after it. */
function callArgumentsAt(source: string, anchor: string): string {
  const at = source.indexOf(anchor);
  expect(at, `call is present: ${anchor}`).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(anchor, at + 1), `call is unique: ${anchor}`).toBe(-1);
  const closes = source.indexOf("});", at);
  expect(closes, `call closes: ${anchor}`).toBeGreaterThan(at);
  const text = source.slice(at, closes);
  expect(text.length, `the slice is one call: ${anchor}`).toBeLessThan(800);
  return text;
}

/**
 * The whole invariant, as a function of the source text, so the row below can
 * run it against a MUTATED copy and prove it fails.
 */
function assertRunBodyStopWiring(source: string): void {
  // 1. The stop is declared before the first call that can reach it. Round 2
  //    declared it after the root loops (a refusal on root 1 discarded root 0);
  //    Task M2 declares it before root 0 itself, whose panel now records it.
  expect(statementOccurrences(source, STOP_DECLARATION), STOP_DECLARATION).toBe(1);
  expect(source.indexOf(STOP_DECLARATION), "declared before the first root is authored")
    .toBeLessThan(source.indexOf(ROOT_0_AUTHOR));

  // 2. Every catch records the stop instead of letting it travel.
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

  // Every assignment in the file belongs to one of the sites above, or to the
  // first root's panel record below.
  expect(statementOccurrences(source, "runBodyBudgetStop = stop;"), "four `= stop`").toBe(4);
  expect(statementOccurrences(source, "runBodyBudgetStop = outcome.stop;"), "one `= outcome.stop`").toBe(1);

  // 3. The first root's panel: the voices heard are kept, the stop is recorded,
  //    and nothing more is argued. Every other node's panel lets the stop travel
  //    to the phase catch that authored it.
  expect(source.split(PANEL_STOP_MAPPING), "the panel keeps heard voices on AUTHOR_ONLY only").toHaveLength(2);
  const panelCallAt = source.indexOf("const panel = await runJudgePanel({");
  expect(panelCallAt, "the node panel call").toBeGreaterThanOrEqual(0);
  expect(source.indexOf(PANEL_STOP_MAPPING), "the mapping is the panel call's")
    .toBeGreaterThan(panelCallAt);
  expect(source.split(PANEL_STOP_DECISION), "the returned stop is decided once").toHaveLength(2);
  expect(statementOccurrences(source, PANEL_STOP_GUARD), PANEL_STOP_GUARD).toBe(1);
  expect(source.indexOf(PANEL_STOP_DECISION), "decided after the panel returns")
    .toBeGreaterThan(source.indexOf(PANEL_STOP_MAPPING));
  expect(statementOccurrences(source, PANEL_PARTIAL_RULE), PANEL_PARTIAL_RULE).toBe(1);
  expect(callArgumentsAt(source, ROOT_PANEL_CALL), "the first root's panel").toContain(ROOT_PANEL_RULE);
  expect(callArgumentsAt(source, CHILD_PANEL_CALL), "every other node's panel").toContain(CHILD_PANEL_RULE);
  expect(source.split(ROOT_PANEL_RULE), "AUTHOR_ONLY is the first root's alone").toHaveLength(2);
  expect(statementOccurrences(source, ROOT_PANEL_RECORD), ROOT_PANEL_RECORD).toBe(1);
  expect(source.indexOf(ROOT_PANEL_RECORD), "recorded after the first root's panel")
    .toBeGreaterThan(source.indexOf(ROOT_PANEL_CALL));
  expect(statementOccurrences(source, SECONDARY_GUARD), SECONDARY_GUARD).toBe(1);
  expect(source.indexOf(ROOT_PANEL_RECORD), "recorded before the secondary root is considered")
    .toBeLessThan(source.indexOf(SECONDARY_GUARD));
  expect(source.indexOf(SECONDARY_GUARD), "the guard stands in front of the secondary root")
    .toBeLessThan(source.indexOf(RUN_BODY_STOP_SITES[0]!.anchor));

  // 4. The author's own first call: a ceiling below it is the typed
  //    configuration failure, on the root-0 author call and nowhere else.
  expect(statementOccurrences(source, FIRST_CALL_FAILURE), FIRST_CALL_FAILURE).toBe(1);
  const firstCallAt = source.indexOf(FIRST_CALL_FAILURE);
  expect(firstCallAt, "on the author's first call").toBeGreaterThan(source.indexOf(ROOT_0_AUTHOR));
  expect(firstCallAt, "before root 0 is judged").toBeLessThan(source.indexOf("const judged = primaryAttempt.value;"));

  // 5. THE SERVE GATE NEVER FORCES A HARD STOP FROM A STOP WHILE ARGUING. The
  //    gate — from the envelope question's definition to the answer-writer's
  //    band — does not mention the recorded stop at all, in code or in prose,
  //    so no argument, default or terminal choice can read it.
  const gateFrom = source.indexOf(EVALUATE_DEFINITION);
  const gateTo = source.indexOf(GATE_END);
  expect(gateFrom, "the gate begins").toBeGreaterThanOrEqual(0);
  expect(gateTo, "the gate ends after it begins").toBeGreaterThan(gateFrom);
  expect(source.indexOf(EVALUATE_DEFINITION, gateFrom + 1), "one envelope question").toBe(-1);
  expect(source.indexOf(GATE_END, gateTo + 1), "one gate end").toBe(-1);
  expect(source.slice(gateFrom, gateTo), "the serve gate reads no stop while arguing")
    .not.toContain("runBodyBudgetStop");
  // Its hard-stop parameter defaults to false, and only the serve chain's own
  // catch — a refused ANSWER-WRITING call, Task M3's to change — ever passes it.
  expect(source).toContain(EVALUATE_DEFAULT);
  const evaluateCalls = [...source.matchAll(/evaluateEnvelope\(([^)]*)\)/gu)].map((match) => match[1]!).sort();
  expect(evaluateCalls, "the three envelope questions").toEqual(
    ["", "", "asked.pendingModelAttempts, asked.forceHardStop"]
  );
  expect(statementOccurrences(source, INITIAL_DECISION), INITIAL_DECISION).toBe(1);
  expect(statementOccurrences(source, ATTEMPT_TERMINAL), ATTEMPT_TERMINAL).toBe(1);
  expect(source).toContain("if (initialEnvelopeDecision.kind === \"HARD_STOP\") {");
  expect(source).not.toMatch(/makeEnvelopeTerminal\([^;]*runBodyBudgetStop/u);

  // 6. The stop rides the answer it no longer prevents: after the serve chain
  //    and its own envelope check, before the label is decided.
  expect(statementOccurrences(source, DISCLOSURE_CALL), DISCLOSURE_CALL).toBe(1);
  expect(statementOccurrences(source, DISCLOSURE_APPEND), DISCLOSURE_APPEND).toBe(1);
  const disclosureArgs = callArgumentsAt(source, DISCLOSURE_CALL);
  expect(disclosureArgs).toContain("runBodyBudgetStop,");
  expect(disclosureArgs).toContain("resultConditionMarks: result.conditionMarks,");
  const disclosedAt = source.indexOf(DISCLOSURE_CALL);
  expect(disclosedAt, "after the serve chain's own envelope check").toBeGreaterThan(source.indexOf(FINAL_DECISION));
  expect(disclosedAt, "before the label is decided").toBeLessThan(source.indexOf(LABEL_DECISION));
  expect(source.indexOf(DISCLOSURE_APPEND), "appended where it is minted")
    .toBeGreaterThan(disclosedAt);

  // 7. M2 review polish — NOTHING AFTER THE GATE READS THE STOP BUT THE
  //    DISCLOSURE. Pin 5 keeps the gate from forcing a hard stop; this keeps any
  //    later statement from doing the same thing by other means — a
  //    `if (runBodyBudgetStop !== null) throw …` in the serve chain, around the
  //    persist or before the settle would end the run without its answer again,
  //    and only the integration suites (not in this gate) would see it. From the
  //    gate's end to the disclosure the stop is not mentioned; after the
  //    disclosure's own argument list it is never mentioned again in the file.
  const afterGate = source.slice(source.indexOf(GATE_END), disclosedAt);
  expect(afterGate, "the serve chain reads no stop while arguing").not.toContain("runBodyBudgetStop");
  const afterDisclosure = source.slice(disclosedAt + disclosureArgs.length);
  expect(afterDisclosure, "nothing after the disclosure reads the stop").not.toContain("runBodyBudgetStop");

  // 8. Task M3 — THE DISCLOSURE ROW'S COPY OF THE STOP IS A RECORD, NEVER A
  //    DECISION. It is taken once, right after the serve decision and before
  //    the gate; from the gate's end it is read exactly once, as the `body` of
  //    the row the runner writes after the persist — so no statement between
  //    the gate and the settle can end the run on it.
  expect(statementOccurrences(source, BODY_FACTS), BODY_FACTS).toBe(1);
  expect(source.indexOf(BODY_FACTS), "captured after the serve decision").toBeGreaterThan(source.indexOf(SERVE_DECISION));
  expect(source.indexOf(BODY_FACTS), "captured before the gate").toBeLessThan(source.indexOf(EVALUATE_DEFINITION));
  const afterGateAll = source.slice(source.indexOf(GATE_END));
  expect(afterGateAll.split("serveDisclosureBody"), "read once after the gate").toHaveLength(2);
  expect(afterGateAll.split(BODY_FACTS_READ), "as the row's body").toHaveLength(2);
  const rowWrittenAt = source.indexOf(DISCLOSURE_ROW_WRITE);
  expect(statementOccurrences(source, DISCLOSURE_ROW_WRITE), DISCLOSURE_ROW_WRITE).toBe(1);
  expect(source.indexOf(BODY_FACTS_READ), "inside the row write").toBeGreaterThan(rowWrittenAt);
  expect(rowWrittenAt, "the row is written after the persist")
    .toBeGreaterThan(source.indexOf("const persisted = await runnerStage(\"ANSWER_PERSIST_FAILED\""));
}

describe("Task M2 / FW-F / C1 — the stop while arguing is recorded at every catch and on the first root's panel, and the serve gate never forces a hard stop from it", () => {
  it("holds on the tree", async () => {
    assertRunBodyStopWiring(await readFile(RUNNER, "utf8"));
  });

  /**
   * Each entry is a real defect written as a one-line edit of the tracked
   * source. `String.prototype.replace` takes the FIRST occurrence: for the
   * `= stop` mutations and the phase guard that is the secondary-root catch,
   * the site where the money refusal discarded a paid-for root 0.
   *
   * The first six are V-28's (three added after the fix-wave review measured
   * them passing: the pin counted `throw error;` and the assignment as
   * substrings, so an INVERTED guard and a COMMENTED-OUT assignment both left
   * it green). The rest are Task M2's: every way back to "a stop while arguing
   * ends without an answer", and every way the first root's panel could fail
   * the run again.
   */
  const MUTATIONS: ReadonlyArray<readonly [string, string, string]> = Object.freeze([
    // The refusal travels again: the whole defect, reintroduced (Important 1).
    ["the stop is thrown instead of recorded", "runBodyBudgetStop = stop;", "throw error;"],
    // The gate's attempt-overspend terminal is gone, so an overspent run crashes.
    ["the gate's attempt terminal is deleted", ATTEMPT_TERMINAL, "throw new Error(\"no terminal\");"],
    // The review catch, whose assignment has its own shape.
    ["the review stop is thrown instead of recorded", "runBodyBudgetStop = outcome.stop;", "throw error;"],
    // Sense inverted: every spend stop travels, every real failure stops.
    ["the phase guard is inverted", PHASE_GUARD, "if (stop !== null) throw error;"],
    ["the review guard is inverted", REVIEW_GUARD, "if (outcome.kind !== \"RETHROW\") throw error;"],
    // Present in the text, absent from the program.
    ["the stop is commented out", "runBodyBudgetStop = stop;", "// runBodyBudgetStop = stop;"],
    // Task M2 — V-28's old wiring, back: the gate forces the hard stop...
    ["the gate forces a hard stop from the stop again", INITIAL_DECISION,
      "const initialEnvelopeDecision = await evaluateEnvelope(0, runBodyBudgetStop !== null);"],
    // ...or names it on the terminal it takes...
    ["the gate's terminal reads the stop again", ATTEMPT_TERMINAL,
      "result = await makeEnvelopeTerminal(initialEnvelopeDecision, runBodyBudgetStop ?? \"ATTEMPTS\");"],
    // ...or reads it through the question's default, with no call site changed.
    ["the gate reads the stop through a default", EVALUATE_DEFAULT,
      "forceHardStop = runBodyBudgetStop !== null\n    ): Promise<BudgetPressureDecision> =>"],
    // The first root's panel lets the stop escape the work item again.
    ["the first root's panel lets the stop travel", ROOT_PANEL_RULE, CHILD_PANEL_RULE],
    // ...or keeps the author's judgement but forgets the stop.
    ["the first root's panel stop is not recorded", ROOT_PANEL_RECORD, `// ${ROOT_PANEL_RECORD}`],
    // ...or goes on arguing after it.
    ["the secondary root is authored after a stop on the first root's panel", SECONDARY_GUARD,
      "if (effectiveMakerCount > 1) {"],
    // A ceiling below the first call is an untyped failure again.
    ["the first-call failure is no longer typed", FIRST_CALL_FAILURE, "throw error;"],
    // The answer stops saying the debate was cut short.
    ["the stop no longer rides the answer", DISCLOSURE_APPEND, ""],
    // M2 review polish: the run fails on the stop AFTER the gate — inside the
    // serve leg, before the stop is disclosed...
    ["the run fails on the stop after the gate", DISCLOSURE_CALL,
      `if (runBodyBudgetStop !== null) throw new TypedDomainError("RUN_BODY_STOPPED", "stopped");\n    ${DISCLOSURE_CALL}`],
    // ...or after it is disclosed, before the answer is persisted.
    ["the run fails on the stop after the disclosure", LABEL_DECISION,
      `if (runBodyBudgetStop !== null) throw new TypedDomainError("RUN_BODY_STOPPED", "stopped");\n    ${LABEL_DECISION}`],
    // M2 polish round 2: the first root's panel throws away the voices it heard...
    ["the panel never keeps the voices it heard", PANEL_STOP_MAPPING,
      "onRunLevelSpendStop: \"RETHROW\""],
    // ...or keeps them but discloses nothing partial about a panel cut short...
    ["a panel cut short is not disclosed as partial", PANEL_PARTIAL_RULE,
      "else if (memberFailures.length > 0) marks.push(PANEL_PARTIAL_MARK);"],
    // ...or swallows a returned stop it cannot classify.
    ["an unclassified returned stop is swallowed", PANEL_STOP_GUARD, ""],
    // Task M3: the disclosure row's copy of the stop becomes a way to fail the
    // run after the gate...
    ["the run fails on the row's copy of the stop", LABEL_DECISION,
      `if (serveDisclosureBody.bodyStop !== null) throw new TypedDomainError("RUN_BODY_STOPPED", "stopped");\n    ${LABEL_DECISION}`],
    // ...or the row stops receiving it...
    ["the row no longer records the stop", BODY_FACTS_READ, "body: { bodyStop: null, pointsWithoutReview: null }"]
  ]);

  it("fails when any one of twenty-one mutations is applied to that same source", async () => {
    const source = await readFile(RUNNER, "utf8");

    for (const [name, from, to] of MUTATIONS) {
      const mutated = source.replace(from, to);
      expect(mutated, `${name}: the mutation changed the source`).not.toBe(source);
      expect(() => assertRunBodyStopWiring(mutated), name).toThrow();
    }
  });

  it("fails when the disclosure row's capture of the stop moves past the gate (Task M3)", async () => {
    const source = await readFile(RUNNER, "utf8");
    const moved = source
      .replace(BODY_FACTS, "")
      .replace(GATE_END, `${GATE_END}\n      ${BODY_FACTS}`);
    expect(moved).not.toBe(source);
    expect(() => assertRunBodyStopWiring(moved)).toThrow();
  });
});
