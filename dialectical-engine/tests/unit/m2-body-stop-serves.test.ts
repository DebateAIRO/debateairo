import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { EvaluationSnapshot } from "@debateai/propagation";
import {
  assertRequiredConditionMarkRecords,
  buildFactBundle,
  type ConditionMarkRecord
} from "@debateai/serve";
import {
  ENVELOPE_STOP_CODES,
  ENVELOPE_STOP_REASONS,
  decideMakerPositionServe,
  firstCallCeilingFailure,
  panelSpendStop,
  runBodyStopDisclosure,
  runnerTerminalFailureReason,
  type EnvelopeStopKind
} from "../../apps/runner/src/index.js";
import { serveCutShortRun } from "../support/servedChainDouble.js";

/**
 * ENGINE MONEY RULE (spec §14.4.1), TASK M2 — A STOP WHILE ARGUING NEVER SKIPS
 * THE ANSWER.
 *
 * The owner's rule: "No debate ends without a final verdict unless there is a
 * technical problem; money is never the reason." Before M2 a stop while the
 * debate was argued — money, the attempt ceiling, or a vendor that reports no
 * usage — was carried to the serve gate as `runBodyBudgetStop`, which forced
 * the components-only envelope terminal: the answer-writer was never called.
 * Now the stop ends the ARGUING only. The run goes on to the answer with the
 * tree it has, and the stop stays on the record so the honesty drawer still
 * says the debate was cut short.
 *
 * What only a run through the real pool can show — that the runner is wired to
 * these decisions — is in `tests/integration/database.test.ts` ("Engine money
 * rule M2 …"); the source wiring is pinned in
 * `tests/architecture/v28-serve-decision-wiring.test.ts`.
 */
const STOP_CODES = Object.freeze(Object.keys(ENVELOPE_STOP_CODES)) as readonly (keyof typeof ENVELOPE_STOP_CODES)[];
/** The two terminals that carry a label and the answer-writer's prose. */
const SERVED_TERMINALS: readonly string[] = Object.freeze(["SERVED", "DOWNGRADED"]);

/*
 * The phase half — every stop kind, the attempt ceiling included, stops the
 * arguing at the five author/review catches — is pinned where it always was,
 * in `tests/unit/v28-run-body-budget-stop.test.ts`.
 */
describe("M2 — the first root's panel falls back to its author's own judgement", () => {
  it("hands every stop kind back on the first root's panel", () => {
    for (const code of STOP_CODES) {
      expect(panelSpendStop(new TypedDomainError(code, "x"), "AUTHOR_ONLY"), code)
        .toBe(ENVELOPE_STOP_CODES[code]);
    }
  });

  it("lets a stop travel from every other node's panel, exactly as before", () => {
    // A child node's own authoring call is caught one level up, by the phase
    // that authored it, which records the stop and mints no node.
    for (const code of STOP_CODES) {
      expect(panelSpendStop(new TypedDomainError(code, "x"), "TRAVEL"), code).toBeNull();
    }
  });

  it("lets a real failure travel from the first root's panel too", () => {
    expect(panelSpendStop(new TypedDomainError("PROVIDER_CALL_FAILED", "x"), "AUTHOR_ONLY")).toBeNull();
    expect(panelSpendStop(new TypeError("boom"), "AUTHOR_ONLY")).toBeNull();
  });
});

describe("M2 — a ceiling below the first call is the one typed configuration failure", () => {
  it("turns a money or attempt refusal of the author's first call into RUN_CEILING_BELOW_FIRST_CALL", () => {
    for (const code of ["RUN_COST_ENVELOPE_MONEY_REACHED", "RUN_COST_ENVELOPE_EXHAUSTED"] as const) {
      const failure = firstCallCeilingFailure(new TypedDomainError(code, "x"));
      expect(failure, code).toBeInstanceOf(TypedDomainError);
      expect(failure?.code, code).toBe("RUN_CEILING_BELOW_FIRST_CALL");
      // The message names which ceiling spoke; the code is what is persisted.
      expect(failure?.message, code).toContain(code);
    }
  });

  it("is persisted under its own code, never as an unrecognised one", () => {
    const failure = firstCallCeilingFailure(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x"));
    expect(runnerTerminalFailureReason(failure)).toBe("RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL");
  });

  it("leaves a vendor fault and a spent day under their own names", () => {
    // Neither is a ceiling below one call. Each already fails typed, and each
    // lift is different (ruling R-C): an operator told "raise the ceiling"
    // about a vendor that reports no usage would raise the wrong thing.
    expect(firstCallCeilingFailure(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "x"))).toBeNull();
    expect(firstCallCeilingFailure(new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "x"))).toBeNull();
    expect(firstCallCeilingFailure(new TypedDomainError("PROVIDER_CALL_FAILED", "x"))).toBeNull();
    expect(firstCallCeilingFailure(new TypeError("boom"))).toBeNull();
  });
});

describe("M2 — the stop stays on the record of the answer it no longer prevents", () => {
  const disclose = (stop: EnvelopeStopKind | null, marks: readonly string[] = []) => runBodyStopDisclosure({
    runBodyBudgetStop: stop,
    resultConditionMarks: marks,
    runId: "run:m2",
    servedRootNodeId: "node:root-0"
  });

  it("says nothing for a run that was never stopped", () => {
    expect(disclose(null)).toBeNull();
  });

  it("keeps today's envelope record, naming the stop that cut the debate short", () => {
    for (const stop of ["ATTEMPTS", "MONEY", "USAGE", "DAILY"] as const) {
      expect(disclose(stop), stop).toEqual({
        mark: "ENVELOPE_EXHAUSTED",
        scope: "answer",
        subjectRef: "run:m2",
        reason: ENVELOPE_STOP_REASONS[stop],
        liftPath: null,
        servedRootRule: null,
        affectedNodeIds: ["node:root-0"]
      });
    }
  });

  it("adds nothing when the answer already carries the envelope mark", () => {
    // The serve leg's own refusal took the envelope terminal, which minted its
    // own record naming its own stop.
    expect(disclose("MONEY", ["ENVELOPE_EXHAUSTED"])).toBeNull();
  });

  it("never puts the envelope mark beside DEFECT", () => {
    // Serve's own rule: DEFECT and ENVELOPE_EXHAUSTED are independent terminals.
    expect(disclose("MONEY", ["DEFECT"])).toBeNull();
  });
});

/**
 * THE PATH, from the state a stop leaves to a served answer. M = 2, the second
 * root's first call refused, or the first root's panel refused: in both cases
 * root 0 is the only position and no review ran.
 */
describe("M2 — a run cut short while arguing is served through the real chain", () => {
  const ROOT_0 = Object.freeze({ nodeId: "node:root-0", maker: "maker-a" });
  const ROOT_0_ONLY: EvaluationSnapshot = {
    nodes: [{ nodeId: ROOT_0.nodeId, baseStrength: 0.7, parentNodeId: null }],
    arrows: [],
    arrowOrder: [],
    operatorResolutions: [],
    clusterRecords: []
  };

  const serveAfter = async (stop: EnvelopeStopKind, nodeMarks: readonly ConditionMarkRecord[] = []) => {
    const decision = decideMakerPositionServe({
      effectiveMakerCount: 2,
      runBodyBudgetStop: stop,
      authoredMakerPositions: [ROOT_0],
      snapshot: ROOT_0_ONLY,
      materialisedNodeIds: [ROOT_0.nodeId],
      reviewedNodeIds: [],
      unjudgedReviewNodeIds: [],
      monoMakerConditionMarks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"],
      monoMakerRecords: () => []
    });
    const factBundle = buildFactBundle({
      facts: Object.freeze(["root 0's statement"]),
      residualObjections: Object.freeze([]),
      badges: Object.freeze([]),
      conditionMarks: Object.freeze([...new Set([
        ...decision.disclosure.conditionMarks,
        ...nodeMarks.map((record) => record.mark)
      ])]),
      reversalPoint: "A contrary measurement would reverse this.",
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    });
    const chained = await serveCutShortRun({
      factBundle,
      servedRootNodeId: decision.servedRoot.nodeId,
      servedStatement: "root 0's statement",
      materialisedNodeIds: [ROOT_0.nodeId]
    });
    const bodyStop = runBodyStopDisclosure({
      runBodyBudgetStop: stop,
      resultConditionMarks: chained.conditionMarks,
      runId: "run:m2",
      servedRootNodeId: decision.servedRoot.nodeId
    });
    const records = [...decision.disclosure.records, ...nodeMarks, ...(bodyStop === null ? [] : [bodyStop])];
    const marks = bodyStop === null ? chained.conditionMarks : [...chained.conditionMarks, bodyStop.mark];
    return { decision, chained, records, marks };
  };

  it("serves root 0 with an answer, not the components-only terminal", async () => {
    for (const stop of ["MONEY", "ATTEMPTS", "USAGE"] as const) {
      const { chained } = await serveAfter(stop);
      // A SERVED answer: SERVED, or DOWNGRADED when (as here) every cited node
      // rests on reasoning alone — both carry the label and the prose.
      expect(SERVED_TERMINALS, stop).toContain(chained.terminal);
      expect(chained.crashClass, stop).toBeNull();
      expect(chained.answerForm, stop).not.toBeNull();
    }
  });

  it("says it rests on one lineage and was cut short, and every mark has its record", async () => {
    for (const stop of ["MONEY", "ATTEMPTS", "USAGE"] as const) {
      const { records, marks } = await serveAfter(stop);
      expect(marks, stop).toEqual(expect.arrayContaining(["SINGLE-LINEAGE", "ENVELOPE_EXHAUSTED"]));
      expect(marks, stop).not.toContain("UNSERVED-MAKER-POSITION");
      expect(records.filter((record) => record.reason === ENVELOPE_STOP_REASONS[stop]).map((record) => record.mark), stop)
        .toEqual(["SINGLE-LINEAGE", "ENVELOPE_EXHAUSTED"]);
      // The persistence contract the runner meets at `ServeRepository.persist`.
      expect(() => assertRequiredConditionMarkRecords(marks, records), stop).not.toThrow();
    }
  });

  it("carries the first root's single-voice panel disclosure onto the served answer", async () => {
    const singleVoice: ConditionMarkRecord = Object.freeze({
      mark: "PANEL-DEGRADED-SINGLE-VOICE",
      scope: "node",
      subjectRef: ROOT_0.nodeId,
      reason: ENVELOPE_STOP_REASONS.MONEY,
      liftPath: "Re-ask when another healthy maker can assess this node",
      servedRootRule: null,
      affectedNodeIds: Object.freeze([ROOT_0.nodeId])
    });
    const { chained, records, marks } = await serveAfter("MONEY", [singleVoice]);

    expect(SERVED_TERMINALS).toContain(chained.terminal);
    expect(marks).toEqual(expect.arrayContaining(["PANEL-DEGRADED-SINGLE-VOICE", "SINGLE-LINEAGE", "ENVELOPE_EXHAUSTED"]));
    expect(() => assertRequiredConditionMarkRecords(marks, records)).not.toThrow();
  });
});
