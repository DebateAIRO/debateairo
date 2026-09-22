import { describe, expect, it } from "vitest";
import { decideBudgetPressure, parseCostEnvelopeBasis } from "@debateai/budget";
import {
  buildFactBundle,
  createEnvelopeExhaustedResult,
  type CompositionBudgetResolution
} from "@debateai/serve";
import { ENVELOPE_STOP_REASONS, envelopeStopKind } from "../../apps/runner/src/index.js";
import { TypedDomainError } from "@debateai/kernel";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";

/**
 * V-28 — THE RUN ENDS CLEANLY, IN A TERMINAL STATE OF ITS OWN, AND KEEPS WHAT
 * IT PRODUCED.
 *
 * The ruling is explicit that a run which reaches its money ceiling is not a
 * crash: "the run ends cleanly with a typed budget-reached outcome (not a crash)
 * and keeps what it produced". The engine already had exactly that shape for the
 * ATTEMPT ceiling — `decideBudgetPressure` -> HARD_STOP -> the components-only
 * envelope terminal, which serves the nodes already verified and discloses the
 * stop as a condition mark. The money stop joins that path rather than growing a
 * second one, so it inherits every guarantee the attempt stop has: the verified
 * components are served, a served statement is never retracted, and DEFECT and
 * ENVELOPE_EXHAUSTED stay independent terminals.
 *
 * What distinguishes the two is WHY, and that is carried where a reader can see
 * it: the typed refusal code and the condition-mark record's reason.
 */
/**
 * Fifty permitted attempts against three spent: this basis has attempts to
 * spare, so nothing below can be reached by the attempt ceiling and every
 * HARD_STOP here is the money envelope's doing.
 */
const basis = parseCostEnvelopeBasis(fixtureStructuralCeiling(50));

describe("V-28 a money stop is a HARD_STOP even with attempts to spare", () => {
  it("is WITHIN on attempts alone when the money envelope has not been reached", () => {
    expect(decideBudgetPressure({
      basis,
      consumedModelAttempts: 3,
      pendingRows: [{ batteryRowId: "Q27", affectedNodeIds: ["node:test:q27"] }],
      verifiedNodeIds: ["node:test:verified"]
    }).kind).toBe("WITHIN_ENVELOPE");
  });

  it("hard-stops the same run when the money envelope IS reached", () => {
    const decision = decideBudgetPressure({
      basis,
      consumedModelAttempts: 3,
      forceHardStop: true,
      pendingRows: [{ batteryRowId: "Q27", affectedNodeIds: ["node:test:q27"] }],
      verifiedNodeIds: ["node:test:verified"]
    });
    expect(decision.kind).toBe("HARD_STOP");
    if (decision.kind !== "HARD_STOP") return;
    // It KEEPS what it produced: the already-verified components are what the
    // terminal serves, and the enrichment rows it will not reach are disclosed.
    expect(decision.terminal).toEqual({
      conditionMark: "ENVELOPE_EXHAUSTED",
      servedNodeIds: ["node:test:verified"]
    });
    expect(decision.enrichmentSkips.map((row) => row.batteryRowId)).toEqual(["Q27"]);
    // The attempt count is reported as it stands — the run did not overspend
    // attempts, it ran out of money — so a reader is not told a falsehood.
    expect(decision.consumedModelAttempts).toBe(3);
  });

  it("still refuses to end a run with nothing to serve", () => {
    expect(() => decideBudgetPressure({
      basis,
      consumedModelAttempts: 3,
      forceHardStop: true,
      pendingRows: [],
      verifiedNodeIds: []
    })).toThrowError(
      expect.objectContaining({ code: "ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS" })
    );
  });
});

/**
 * The runner's catch around the serve leg has to tell three things apart: the
 * attempt ceiling refusing one more attempt, the money envelope refusing the
 * next call, and everything else — which is a real failure and must keep
 * travelling. That decision is its own named function so it can be pinned here
 * rather than inferred from the shape of a source file.
 */
describe("V-28 the runner tells a money stop from an attempt stop from a failure", () => {
  it("names the attempt ceiling", () => {
    expect(envelopeStopKind(new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "x")))
      .toBe("ATTEMPTS");
  });

  it("names the money envelope", () => {
    expect(envelopeStopKind(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x")))
      .toBe("MONEY");
  });

  it("lets every other failure travel untouched", () => {
    // `PROVIDER_USAGE_UNREPORTED` was in this list in round 1 and is NOT any
    // more: ruling R2 made an unbillable vendor end the run cleanly, because it
    // is a vendor or configuration fault and discarding the work would charge
    // the asker for nothing. It keeps its own stop kind, so the condition-mark
    // record still names the real cause — see `v28-run-body-budget-stop.test.ts`.
    expect(envelopeStopKind(new TypedDomainError("PROVIDER_CALL_FAILED", "x"))).toBeNull();
    expect(envelopeStopKind(new TypeError("boom"))).toBeNull();
    expect(envelopeStopKind(undefined)).toBeNull();
  });

  /**
   * FW-F (final review, Minor) — A CODE THIS ENGINE DOES NOT KNOW IS NOT A STOP,
   * WHATEVER `Object.prototype` HAPPENS TO CARRY UNDER THAT NAME.
   *
   * `TypedDomainError.code` is a plain `string`, and the stop table is a plain
   * object, so looking the code up with `table[code]` answers for every key
   * `Object.prototype` defines: `constructor` came back as the `Object`
   * function, `__proto__` as the prototype itself. Both are truthy, so the
   * `?? null` miss never fired and the caller was told the run had hit a spend
   * bound. At the serve-chain catch that becomes a forced hard stop whose
   * condition-mark record carries `reason: undefined` — a terminal naming a
   * ceiling nobody reached. No such code is raised anywhere in the tree today
   * (every `new TypedDomainError(` takes a literal or a literal-fed parameter),
   * so this is closing the lookup, not repairing a live failure.
   */
  it("answers null for a code that is only a prototype member", () => {
    for (const inherited of ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"]) {
      expect(envelopeStopKind(new TypedDomainError(inherited, "x")), inherited).toBeNull();
    }
  });

});

/**
 * FW-F (final review, Important 3) — THIS ROW USED TO CHECK THAT A CONSTANT WAS
 * A NON-EMPTY STRING.
 *
 * It was titled "ends in the run's own terminal state, never as a crash" and
 * its whole body was `expect(SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal)
 * .toBeTruthy()` plus a `typeof` check. Nothing about a run reached it. The
 * reviewer's mutation — delete the runner's `makeEnvelopeTerminal` call and let
 * the money stop rethrow, so the run DOES crash — left the row green, and so
 * would renaming `COMPONENTS_ONLY` to anything else non-empty.
 *
 * The property has two halves, and both are checked now. The VALUE half is
 * driven here, from the money hard stop through the constructor the runner
 * calls, and asserted against literals rather than against the constant it is
 * testing: a resolved result, in the run's own components-only terminal, with
 * no answer form, carrying the work the run had already paid for, and NOT a
 * DEFECT. The WIRING half — that the runner takes this terminal on the run-body
 * money stop instead of rethrowing — cannot be driven without a pool, and is
 * pinned on the source by `tests/architecture/v28-serve-decision-wiring.test.ts`
 * ("FW-F / C1 …"), whose last row proves itself against that same mutation.
 */
describe("V-28 a money stop ends in the run's own terminal state, never as a crash", () => {
  const COMPOSITION_BUDGET: CompositionBudgetResolution = Object.freeze({
    tier: "low",
    bound: 100_000,
    registerRowKey: "compositionBundleBudget.low",
    registerVersion: 91,
    sourceRef: "test-layer:V-28"
  });

  it("carries the money hard stop into a resolved components-only result", () => {
    const decision = decideBudgetPressure({
      basis,
      consumedModelAttempts: 3,
      forceHardStop: true,
      pendingRows: [{ batteryRowId: "Q27", affectedNodeIds: ["node:test:q27"] }],
      verifiedNodeIds: ["node:test:verified"]
    });
    expect(decision.kind).toBe("HARD_STOP");
    if (decision.kind !== "HARD_STOP") return;

    // The runner's `makeEnvelopeTerminal` calls exactly this, with exactly
    // these members read off the decision (apps/runner/src/index.ts).
    const result = createEnvelopeExhaustedResult({
      factBundle: buildFactBundle({
        facts: Object.freeze(["the statement the run had already paid for"]),
        residualObjections: Object.freeze([]),
        badges: Object.freeze([]),
        conditionMarks: Object.freeze([]),
        reversalPoint: "No reversal point was reached before the envelope stopped the run",
        buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }),
      compositionBudget: COMPOSITION_BUDGET,
      verifiedNodeIds: decision.terminal.servedNodeIds,
      skippedEnrichmentRows: decision.enrichmentSkips.map((row) => row.batteryRowId),
      protectedCoreRestatement: "PASS",
      servedStatementExists: false
    });

    // A STATE OF THE RUN, named by its literal value. `toBeTruthy` on the
    // constant could not tell this from a crash class, and that is the whole
    // point of the row.
    expect(result.terminal).toBe("COMPONENTS_ONLY");
    expect(result.crashClass).toBe("ENVELOPE_EXHAUSTED");
    expect(result.answerForm).toBeNull();
    // Reached WITHOUT throwing: the value above exists, so the run has a
    // terminal to persist rather than a failure the work item records.
    expect(Object.isFrozen(result)).toBe(true);
    // It KEEPS what it produced, and says what it could not reach.
    expect(result.conditionMarks).toContain("ENVELOPE_EXHAUSTED");
    expect(result.conditionMarks).toContain("SKIPPED-BY-BUDGET");
    expect(result.factBundle.facts).toEqual(["the statement the run had already paid for"]);
    // ENVELOPE_EXHAUSTED and DEFECT are independent terminals: a run that ran
    // out of money is not a broken run, and the reader must not be told it is.
    // The distinction is the crash class and the mark, asserted above — NOT the
    // terminal, which `TRANSPORT_DEATH` shares (both are `COMPONENTS_ONLY`).
    expect(result.conditionMarks).not.toContain("DEFECT");
  });

  it("names the money ceiling on the record, not the attempt ceiling", () => {
    // The terminal is the same for both stops; WHICH bound was reached is the
    // record's reason, because the operator's lift differs.
    expect(ENVELOPE_STOP_REASONS.MONEY).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(ENVELOPE_STOP_REASONS.MONEY).not.toBe(ENVELOPE_STOP_REASONS.ATTEMPTS);
  });
});
