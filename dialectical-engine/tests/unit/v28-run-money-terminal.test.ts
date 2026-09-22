import { describe, expect, it } from "vitest";
import { decideBudgetPressure, parseCostEnvelopeBasis } from "@debateai/budget";
import { SERVE_CRASH_CLASSES } from "@debateai/serve";
import { envelopeStopKind } from "../../apps/runner/src/index.js";
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

  it("ends in the run's own terminal state, never as a crash", () => {
    // The same terminal the attempt stop reaches — a state of the run, resolved
    // and readable, not a thrown failure the work item records as terminal.
    expect(SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal).toBeTruthy();
    expect(typeof SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal).toBe("string");
  });
});
