import { describe, expect, it } from "vitest";
import {
  declaredPredicateInputNames,
  evaluateTerminalActivations,
  type BatteryRowId,
  type TerminalCompletionDeclaration,
  type TerminalRecordedFacts
} from "@debateai/battery";

// TERM-01 (DR-139): the REAL terminal WAIT activation evaluator.
// Facts are RECORDED run facts only; the evaluation is three-valued;
// UNRESOLVED refuses typed-loud (ruling 2); behavior is tier-invariant by
// construction (ruling 3 — TerminalRecordedFacts carries no risk tier field);
// ACTIVE at terminal marks the owed check (ruling 4).

const WAITING_ROWS_AT_TERMINAL = [
  "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10",
  "Q11", "Q12", "Q13", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20",
  "Q21", "Q22", "Q23", "Q24", "Q25", "Q26", "Q27", "Q28", "Q29", "Q30",
  "Q31", "Q32", "Q33", "Q34", "Q35", "Q36", "Q37", "Q38", "Q39",
  "Q41", "Q42", "Q43", "Q44", "Q45", "Q46", "Q47", "Q48", "Q49", "Q50",
  "Q52", "Q53", "Q54", "Q55", "Q56", "Q57", "Q58", "Q59", "Q60",
  "R1", "R2", "R3", "R4", "R5", "R7", "R8", "R9"
] as const;

const EXPECTED_ACTIVE_COMPOSED = [
  "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q10", "Q18",
  "Q33", "Q36", "Q38", "Q43", "Q52", "Q53", "Q54", "Q57", "Q59",
  "R2", "R7", "R9"
] as const;

const EXPECTED_ACTIVE_DEFECT = [
  "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q10", "Q18",
  "Q33", "Q36", "Q59", "R2", "R7"
] as const;

function composedServeFacts(): TerminalRecordedFacts {
  return {
    runId: "run:test-composed",
    registerVersion: 1,
    ledger: {
      judgementScheduledCount: 1,
      propagationCount: 1,
      judgeCallCount: 1,
      composerCallCount: 1,
      conformanceCallCount: 2,
      postComposeR9CallCount: 1,
      serveActionCount: 0,
      entriesMissingActionStamps: 0
    },
    graph: {
      nodeCount: 1,
      activePathNodeCount: 1,
      childNodeCount: 0,
      strangerRestatementCount: 1
    },
    judgement: { reducedJudgementCount: 1 },
    propagation: { propagationRunCount: 1, strengthRecordCount: 1 },
    decisions: { decisionRecordCount: 0, splitSpawnDecisionCount: 0 },
    research: {
      querySetCount: 0,
      sourceRecordCount: 0,
      evidenceItemCount: 0,
      admittedSourceCount: 0,
      absenceRowCount: 0,
      probeCaptureCount: 0,
      instrumentCertificationCount: 0
    },
    critique: {
      critiquePacketCount: 0,
      objectionRecordCount: 0,
      independenceReceiptCount: 0,
      symmetryDiffCount: 0
    },
    settlement: { answerOutcomeCount: 0, scorecardCellCount: 0 },
    serve: { persistedAnswerCount: 0 },
    register: {
      sealed: true,
      livenessPolicy: {
        sourceRef: "acceptance:DR-133:V-approved",
        questionClass: "standard",
        reviewAfterMs: 604_800_000,
        retireAfterMs: 15_552_000_000
      },
      approvedOperatorVariantCount: 0
    },
    executions: { settledWorkItemRowIds: [] }
  };
}

function defectTerminalFacts(): TerminalRecordedFacts {
  const facts = composedServeFacts();
  return {
    ...facts,
    runId: "run:test-defect",
    ledger: {
      ...facts.ledger,
      composerCallCount: 0,
      conformanceCallCount: 0,
      postComposeR9CallCount: 0
    }
  };
}

const completion: TerminalCompletionDeclaration = {
  kind: "ANSWER_RECORD_PERSIST",
  servedNodeIds: ["node:primary"],
  servedNumberPlanned: true
};

const defectCompletion: TerminalCompletionDeclaration = {
  kind: "ANSWER_RECORD_PERSIST",
  servedNodeIds: ["node:primary"],
  servedNumberPlanned: false
};

describe("TERM-01 — DR-139 terminal activation evaluator (recorded facts only)", () => {
  it("resolves all 64 terminal WAIT rows of a composed serve honestly — no blanket verdict", () => {
    const resolutions = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: WAITING_ROWS_AT_TERMINAL
    });
    expect(resolutions).toHaveLength(64);
    const byState = new Map(resolutions.map((resolution) => [resolution.batteryRowId, resolution.state]));
    const active = [...byState.entries()].filter(([, state]) => state === "ACTIVE").map(([row]) => row).sort();
    const inactive = [...byState.entries()].filter(([, state]) => state === "INACTIVE").map(([row]) => row);
    expect(active).toEqual([...EXPECTED_ACTIVE_COMPOSED].sort());
    expect(active.length + inactive.length).toBe(64);
    // DR-135 class: no resolution may be WAIT or fabricated.
    expect(resolutions.every((resolution) => resolution.state === "ACTIVE" || resolution.state === "INACTIVE")).toBe(true);
  });

  it("records each row's declared predicate inputs as evidence on the transition", () => {
    const resolutions = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: WAITING_ROWS_AT_TERMINAL
    });
    for (const resolution of resolutions) {
      const declared = declaredPredicateInputNames(resolution.batteryRowId as BatteryRowId);
      const inputs = resolution.predicateInputs as {
        kind: string;
        values: Record<string, unknown>;
        absentInputs?: readonly { name: string; reason: string }[];
        basis: Record<string, unknown>;
      };
      expect(["PRESENT", "PARTIAL"]).toContain(inputs.kind);
      const carried = [
        ...Object.keys(inputs.values),
        ...(inputs.absentInputs ?? []).map((absent) => absent.name)
      ].sort();
      expect(carried).toEqual([...declared].sort());
      for (const name of Object.keys(inputs.values)) {
        expect(inputs.basis[name]).toBeDefined();
      }
    }
  });

  it("files INACTIVE with typed skip evidence and ACTIVE without one (L-3)", () => {
    const resolutions = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: WAITING_ROWS_AT_TERMINAL
    });
    for (const resolution of resolutions) {
      if (resolution.state === "INACTIVE") {
        expect(resolution.skipEvidence).toMatchObject({
          kind: "PRESENT",
          evidenceType: "TERMINAL_RECORDED_FACTS",
          predicateResult: "FALSE"
        });
      } else {
        expect(resolution.skipEvidence).toBeNull();
      }
    }
  });

  it("marks every ACTIVE row's check owed-but-unexecuted except R9, whose stranger check is recorded", () => {
    const resolutions = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: WAITING_ROWS_AT_TERMINAL
    });
    const owed = resolutions
      .filter((resolution) => resolution.state === "ACTIVE" && resolution.executedCheckRef === null)
      .map((resolution) => resolution.batteryRowId)
      .sort();
    const executed = resolutions.filter((resolution) => resolution.executedCheckRef !== null);
    expect(owed).toEqual(EXPECTED_ACTIVE_COMPOSED.filter((row) => row !== "R9").sort());
    expect(executed.map((resolution) => resolution.batteryRowId)).toEqual(["R9"]);
  });

  it("resolves a components-only defect terminal without a composed candidate", () => {
    const resolutions = evaluateTerminalActivations({
      facts: defectTerminalFacts(),
      completion: defectCompletion,
      waitingRows: WAITING_ROWS_AT_TERMINAL
    });
    const active = resolutions
      .filter((resolution) => resolution.state === "ACTIVE")
      .map((resolution) => resolution.batteryRowId)
      .sort();
    expect(active).toEqual([...EXPECTED_ACTIVE_DEFECT].sort());
  });

  it("decides Q37 FALSE by its recorded conjunct and records the unrecorded settlement act as absent (Kleene, no guess)", () => {
    const resolutions = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: ["Q37"]
    });
    expect(resolutions[0]).toMatchObject({ batteryRowId: "Q37", state: "INACTIVE" });
    expect(resolutions[0]?.predicateInputs).toMatchObject({
      kind: "PARTIAL",
      absentInputs: [{ name: "settlement_act", reason: "NOT_RECORDED_AT_TERMINAL" }]
    });
  });

  it("resolves Q50 through the ruled DR-021 knob-10 factual type fallback, recorded as such", () => {
    const resolutions = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: ["Q50"]
    });
    expect(resolutions[0]).toMatchObject({ batteryRowId: "Q50", state: "INACTIVE" });
    const inputs = resolutions[0]?.predicateInputs as {
      values: Record<string, unknown>;
      basis: Record<string, { kind?: string }>;
    };
    expect(inputs.values["question_type"]).toBe("factual");
    expect(inputs.basis["question_type"]).toMatchObject({ kind: "RULED_FALLBACK" });
  });

  it("refuses typed-loud when a genuinely unrecorded input decides a predicate (ruling 2)", () => {
    const facts = composedServeFacts();
    const unrecordable: TerminalRecordedFacts = {
      ...facts,
      register: { ...facts.register, livenessPolicy: null }
    };
    expect(() => evaluateTerminalActivations({
      facts: unrecordable,
      completion,
      waitingRows: WAITING_ROWS_AT_TERMINAL
    })).toThrowError(expect.objectContaining({
      name: "TypedDomainError",
      code: "TERMINAL_ACTIVATION_UNRESOLVED",
      message: expect.stringContaining("Q18")
    }));
  });

  it("refuses a POLICY_BLOCKED or unknown row in the waiting set — those rows never wait", () => {
    for (const row of ["Q14", "Q40", "R6", "Q99"]) {
      expect(() => evaluateTerminalActivations({
        facts: composedServeFacts(),
        completion,
        waitingRows: [row]
      })).toThrowError(expect.objectContaining({
        name: "TypedDomainError",
        code: "TERMINAL_ROW_NOT_EVALUATABLE"
      }));
    }
  });

  it("flags the DR-021 knob-10 type fallback on exactly the rows that consulted it — never otherwise (DR-141(2))", () => {
    const resolutions = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: WAITING_ROWS_AT_TERMINAL
    });
    const consulted = resolutions
      .filter((resolution) => resolution.typeFallbackConsulted === true)
      .map((resolution) => resolution.batteryRowId)
      .sort();
    expect(consulted).toEqual(["Q37", "Q50"]);
    const withoutTypeRows = evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: ["Q2", "Q53", "R9"]
    });
    expect(withoutTypeRows.every((resolution) => resolution.typeFallbackConsulted !== true)).toBe(true);
  });

  it("returns no resolutions for an empty waiting set", () => {
    expect(evaluateTerminalActivations({
      facts: composedServeFacts(),
      completion,
      waitingRows: []
    })).toEqual([]);
  });
});
