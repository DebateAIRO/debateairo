import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard,
  costEnvelopeDay,
  type ModelSpendEntry,
  type ModelSpendStore
} from "@debateai/budget";
import { Judge, runJudgePanel } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import type { ProviderGateway } from "@debateai/providers";
import type { EvaluationSnapshot } from "@debateai/propagation";
import { costEnvelopePolicyFromValue, COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW } from "@debateai/register";
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
/** One panel member's call, as `runNodePanel` makes it (see tests/unit/t03-judge-panel.test.ts). */
const PANEL_CALL = Object.freeze({
  runId: "run:panel",
  subjectItemId: "work:panel",
  callSiteKey: "PANEL:root:provider:b",
  questionLine: "Should the proposal stand?",
  statement: "The proposal should stand.",
  authorMaker: "house-a",
  providerRef: "provider:b",
  contractHash: "b".repeat(64),
  bound: Object.freeze({ maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 })
});

/** A panel member whose provider refuses with `code`, through the real `Judge.assess`. */
function refusingMember(memberRole: string, code: string, reached: string[]) {
  const refusing: ProviderGateway = {
    call: async () => {
      reached.push("refused member");
      throw new TypedDomainError(code, "test-layer: refused before sending");
    }
  };
  return {
    memberRole, actorRef: `actor:${memberRole}`, contractHash: `c:${memberRole}`,
    judge: async () => {
      const assessed = await new Judge(refusing).assess(PANEL_CALL);
      return { judgementRef: assessed.judgementRef, assessment: assessed.assessment };
    }
  };
}

/** A provider whose member answers with a valid assessment (as in t03-judge-panel). */
function answering(): ProviderGateway {
  return {
    call: async () => ({
      rawArtifactRef: "artifact:panel-member",
      ledgerEntryRef: "ledger:panel-member",
      content: JSON.stringify({
        steelman: { summary: "The strongest reading of the node.", fidelity: 0.6 },
        critic: { summary: "A plausible counter.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.55, relevance: 0.65 },
        context: { fit: 0.7, ambiguityFlags: [] },
        fallacy: { severity: 0.2, fatalFlags: [] }
      }),
      provider: "test",
      model: "model-b",
      maker: "house-b",
      modelVersion: "model-b"
    })
  } as unknown as ProviderGateway;
}

/*
 * The phase half — every stop kind, the attempt ceiling included, stops the
 * arguing at the five author/review catches — is pinned where it always was,
 * in `tests/unit/v28-run-body-budget-stop.test.ts`.
 */
describe("M2 — the first root's panel keeps what it heard, and falls back to its author when it heard nothing", () => {
  /**
   * THE REAL PATH, not a hand-made error (M2 review polish). A panel member's
   * call goes through `Judge.assess`, which rewrites every error it does not
   * know into a `PanelMemberFailure`, and `runJudgePanel`, which notes a member
   * failure and asks the next member. Only what leaves BOTH reaches the runner.
   * Before the kernel's `RUN_LEVEL_SPEND_STOP_CODES` listed the attempt
   * ceiling, an attempt refusal never left them: it became a PROVIDER_ERROR
   * note, so this row's first version asserted ATTEMPTS through a path the
   * runtime could not take. It drives the member call itself, in the mode the
   * runner asks for on the first root's panel (`RETURN_HEARD`, round 2).
   */
  it("hands every stop kind back on the first root's panel, through the real member call", async () => {
    for (const code of STOP_CODES) {
      const reached: string[] = [];
      const panel = await runJudgePanel({
        artifactProducerRef: "actor:author",
        primary: { judgementRef: "j0", assessment: {} as never, memberRole: "author" },
        members: [
          refusingMember("member-1", code, reached),
          {
            memberRole: "member-2", actorRef: "actor:two", contractHash: "c2",
            judge: async () => { reached.push("next member"); return { judgementRef: "j2", assessment: {} as never }; }
          }
        ],
        // What the runner asks for on the first root's panel only.
        onRunLevelSpendStop: "RETURN_HEARD"
      });

      // It left the member call as itself — not a PROVIDER_ERROR note — and the
      // panel asked nobody after it. With no member heard, the author is alone.
      expect(panel.stoppedBy, code).toBeInstanceOf(TypedDomainError);
      expect((panel.stoppedBy as TypedDomainError).code, code).toBe(code);
      expect(panel.notes, code).toEqual([]);
      expect(panel.judgements.map((entry) => entry.judgementRef), code).toEqual(["j0"]);
      expect(reached, code).toEqual(["refused member"]);
      expect(panelSpendStop(panel.stoppedBy, "AUTHOR_ONLY"), code).toBe(ENVELOPE_STOP_CODES[code]);
    }
  });

  /**
   * M2 review polish, round 2 — THE VOICES ALREADY HEARD ARE KEPT. A stop that
   * arrives after a member has answered used to throw that paid-for judgement
   * away with the panel, and the node fell to the single-voice disclosure and
   * its step-down. The first root's panel now returns what it heard: the
   * runner selects over the author and those voices, with PANEL-PARTIAL.
   */
  it("keeps a member voice heard before the stop, with every note, and asks nobody after it", async () => {
    for (const code of ["RUN_COST_ENVELOPE_MONEY_REACHED", "RUN_COST_ENVELOPE_EXHAUSTED"] as const) {
      const reached: string[] = [];
      const panel = await runJudgePanel({
        artifactProducerRef: "actor:author",
        primary: { judgementRef: "j0", assessment: {} as never, memberRole: "author" },
        members: [
          // The author's own seat: the FX-HR-H6 bulkhead note, before anyone speaks.
          {
            memberRole: "author", actorRef: "actor:author", contractHash: "c0",
            judge: async () => { reached.push("author seat"); return { judgementRef: "never", assessment: {} as never }; }
          },
          {
            memberRole: "member-1", actorRef: "actor:one", contractHash: "c1",
            judge: async () => {
              reached.push("member-1");
              const assessed = await new Judge(answering()).assess(PANEL_CALL);
              return { judgementRef: assessed.judgementRef, assessment: assessed.assessment };
            }
          },
          refusingMember("member-2", code, reached),
          {
            memberRole: "member-3", actorRef: "actor:three", contractHash: "c3",
            judge: async () => { reached.push("member-3"); return { judgementRef: "j3", assessment: {} as never }; }
          }
        ],
        onRunLevelSpendStop: "RETURN_HEARD"
      });

      expect((panel.stoppedBy as TypedDomainError).code, code).toBe(code);
      expect(panel.judgements.map((entry) => entry.memberRole), code).toEqual(["author", "member-1"]);
      expect(panel.judgements[1]!.judgementRef, code).toBe("artifact:panel-member");
      expect(panel.notes.map((note) => note.kind), code).toEqual(["PRODUCER_GRADING_FORBIDDEN"]);
      expect(reached, code).toEqual(["member-1", "refused member"]);
    }
  });

  it("still rethrows by default, taking the heard voices with it, for every other panel", async () => {
    const reached: string[] = [];
    await expect(runJudgePanel({
      artifactProducerRef: "actor:author",
      primary: { judgementRef: "j0", assessment: {} as never, memberRole: "author" },
      members: [refusingMember("member-1", "RUN_COST_ENVELOPE_EXHAUSTED", reached)]
    })).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_EXHAUSTED" });
    expect(reached).toEqual(["refused member"]);
  });

  it("lets a stop travel from every other node's panel", () => {
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
  /**
   * M2 review polish — A RE-CLAIM CARRIES THE EARLIER CLAIM'S SPEND OVER.
   *
   * After a crash, a re-claim of the same run starts with the spend (and the
   * attempts) the earlier claim already used. A ceiling that fits one call can
   * therefore refuse the re-claim's FIRST call. The code stays
   * `RUN_CEILING_BELOW_FIRST_CALL`, but the message must not assert that
   * reading as fact: it names both, and carries the seam's own numbers, which
   * are what tell a crash-and-re-claim from a ceiling set too low.
   */
  it("keeps the refusal's own numbers when a re-claim starts with the earlier claim's spend", async () => {
    const runId = "run:re-claimed";
    const policy = costEnvelopePolicyFromValue(
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    const carriedOver: ModelSpendEntry = Object.freeze({
      spendId: "spend:earlier-claim",
      spendSource: "RUN",
      runId,
      providerRef: "provider:test-layer",
      chargedOn: costEnvelopeDay(new Date("2026-09-27T11:00:00.000Z")),
      chargeMicros: 174_900,
      inputTokens: 1,
      outputTokens: 1,
      spendPhase: "BODY"
    });
    const store: ModelSpendStore = {
      recordSpend: async () => undefined,
      readRunSpentMicros: async (candidate) => candidate === runId ? carriedOver.chargeMicros : 0,
      readRunStorySpentMicros: async () => 0,
      readDaySpentMicros: async () => carriedOver.chargeMicros,
      admitNewRun: async () => ({ admitted: true, committedMicros: 0 })
    };
    const seam = new CostEnvelopeGuard({ store, policy, clock: () => new Date("2026-09-27T11:00:00.000Z") })
      .providerSeam({
        runId,
        price: { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 },
        requireReportedUsage: true,
        phase: "BODY"
      });

    // The re-claim's first call: the real seam refuses it on the spend carried over.
    const refusal = await Promise.resolve(seam.assertCallAllowed({ requestBytes: 800, completionTokenCeiling: 64 }))
      .then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(TypedDomainError);
    expect((refusal as TypedDomainError).code).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");

    const failure = firstCallCeilingFailure(refusal);
    expect(failure?.code).toBe("RUN_CEILING_BELOW_FIRST_CALL");
    // The seam's evidence, verbatim: spent, ceiling and the next call's cost.
    expect(failure?.message).toContain((refusal as Error).message);
    expect(failure?.message).toContain("spent 174900 of 175000");
    expect(failure?.message).toMatch(/the next call could cost \d+ more/u);
    // Both readings are named; neither is asserted as the cause.
    expect(failure?.message).toContain("below one call");
    expect(failure?.message).toContain("re-claim");
    expect(failure?.cause).toBe(refusal);
  });

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
