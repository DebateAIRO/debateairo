import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";
import {
  BATTERY_ROW_IDS,
  declaredPredicateInputNames,
  resolveActivationState,
  type BatteryRowId
} from "./index.js";

// ---------------------------------------------------------------------------
// TERM-01 — the REAL terminal WAIT activation evaluator (DR-139, 2026-08-09).
//
// Ruling 1: consult RECORDED run facts ONLY (ledger + DB). No model calls, no
//   clock-derived facts, no fabrication. Compute each still-WAIT row's declared
//   predicate inputs (predicateInputsByRow), apply the SHIPPED rule
//   resolveActivationState, and record the computed inputs as evidence.
// Ruling 2: an input genuinely unavailable at terminal is a typed loud refusal
//   (TERMINAL_ACTIVATION_UNRESOLVED) — the run stays unsettled. The DR-135
//   refusing evaluator remains the outermost fallback.
// Ruling 3: behavior is risk-tier-invariant. By construction: neither
//   TerminalRecordedFacts nor the evaluation consumes a risk tier.
// Ruling 4: a row ACTIVE at terminal (check owed execution) settles the run;
//   the runner derives OWED-CHECK-UNEXECUTED condition marks from resolutions
//   whose executedCheckRef is null.
//
// The terminal-completeness principle (why recorded ABSENCE may decide FALSE
// here and nowhere else): this evaluator runs only at the completion boundary.
// At that boundary the run's append-only record is the complete account of
// every route the run took and every event it produced. An event or route with
// no record was therefore not taken — recorded absence is itself a recorded
// fact. VALUE-shaped inputs (a classification the run never recorded, e.g.
// settlement_act) are different: absence there means the record cannot answer,
// and the evaluation refuses rather than guesses (Kleene three-valued logic —
// an UNRESOLVED input only refuses when the predicate outcome depends on it).
// ---------------------------------------------------------------------------

export const TERMINAL_EVALUATOR_REF = "battery:terminal-activation-evaluator:DR-139:v1" as const;

/**
 * The completing runner's own declaration of the terminal boundary being
 * drained. It carries no model output, no clock reading and no synthesized
 * value: `kind` names the one completion path that calls the evaluator (the
 * same completion sequence persists the answer record and the TERMINAL
 * progress event immediately after the drain), and the two members are the
 * runner's already-computed serving state, recorded at persist. It is the same
 * authority that supplies runId and waitingRows to the seam.
 */
export interface TerminalCompletionDeclaration {
  readonly kind: "ANSWER_RECORD_PERSIST";
  readonly servedNodeIds: readonly string[];
  readonly servedNumberPlanned: boolean;
}

/** Recorded facts consulted by the evaluation — every member is read from the
 * run's own ledger/DB record (or the sealed register) by
 * readTerminalRecordedFacts; nothing here may be synthesized. */
export interface TerminalRecordedFacts {
  readonly runId: string;
  readonly registerVersion: number;
  readonly ledger: {
    readonly judgementScheduledCount: number;
    readonly propagationCount: number;
    readonly judgeCallCount: number;
    readonly composerCallCount: number;
    readonly conformanceCallCount: number;
    readonly postComposeR9CallCount: number;
    readonly serveActionCount: number;
    /** Q34's two ledger stamps (FX-LED-04) — entries missing either stamp.
     * DDL forbids them; computed anyway so Q46's WAIT‡ guard reads a real count. */
    readonly entriesMissingActionStamps: number;
  };
  readonly graph: {
    readonly nodeCount: number;
    readonly activePathNodeCount: number;
    readonly childNodeCount: number;
    readonly strangerRestatementCount: number;
  };
  readonly judgement: { readonly reducedJudgementCount: number };
  readonly propagation: {
    readonly propagationRunCount: number;
    readonly strengthRecordCount: number;
  };
  readonly decisions: {
    readonly decisionRecordCount: number;
    readonly splitSpawnDecisionCount: number;
  };
  readonly research: {
    readonly querySetCount: number;
    readonly sourceRecordCount: number;
    readonly evidenceItemCount: number;
    readonly admittedSourceCount: number;
    readonly absenceRowCount: number;
    readonly probeCaptureCount: number;
    readonly instrumentCertificationCount: number;
  };
  readonly critique: {
    readonly critiquePacketCount: number;
    readonly objectionRecordCount: number;
    readonly independenceReceiptCount: number;
    readonly symmetryDiffCount: number;
  };
  readonly settlement: {
    readonly answerOutcomeCount: number;
    readonly scorecardCellCount: number;
  };
  readonly serve: { readonly persistedAnswerCount: number };
  readonly register: {
    readonly sealed: boolean;
    readonly livenessPolicy: {
      readonly sourceRef: string;
      readonly questionClass: string;
      readonly reviewAfterMs: number;
      readonly retireAfterMs: number;
    } | null;
    readonly approvedOperatorVariantCount: number;
  };
  readonly executions: { readonly settledWorkItemRowIds: readonly string[] };
}

export interface TerminalActivationResolution {
  readonly batteryRowId: string;
  readonly state: "ACTIVE" | "INACTIVE";
  readonly predicateInputs: Readonly<Record<string, unknown>>;
  readonly skipEvidence: Readonly<Record<string, unknown>> | null;
  /** Recorded execution of this row's scoped check, when one exists on the
   * record. ACTIVE with null = the DR-139(4) owed-but-unexecuted case. */
  readonly executedCheckRef: string | null;
  /** DR-141(2): true when this row's evaluation consulted the DR-021 knob-10
   * question-type fallback — the travelling label must ride the served
   * answer whenever the fallback was consulted. */
  readonly typeFallbackConsulted?: boolean;
}

type Tri = "TRUE" | "FALSE" | "UNRESOLVED";

interface ComputedInput {
  readonly name: string;
  readonly available: boolean;
  readonly value?: unknown;
  readonly basis: Readonly<Record<string, unknown>>;
}

function present(name: string, value: unknown, basis: Record<string, unknown>): ComputedInput {
  return { name, available: true, value, basis };
}

function absent(name: string, consulted: Record<string, unknown>): ComputedInput {
  return { name, available: false, basis: { kind: "UNRECORDED", consulted } };
}

function tri(input: ComputedInput, decide: (value: unknown) => boolean): Tri {
  if (!input.available) return "UNRESOLVED";
  return decide(input.value) ? "TRUE" : "FALSE";
}

function triBool(input: ComputedInput): Tri {
  return tri(input, (value) => value === true);
}

function and3(...members: readonly Tri[]): Tri {
  if (members.includes("FALSE")) return "FALSE";
  if (members.includes("UNRESOLVED")) return "UNRESOLVED";
  return "TRUE";
}

function or3(...members: readonly Tri[]): Tri {
  if (members.includes("TRUE")) return "TRUE";
  if (members.includes("UNRESOLVED")) return "UNRESOLVED";
  return "FALSE";
}

interface RowEvaluation {
  readonly inputs: readonly ComputedInput[];
  readonly predicate: Tri;
  readonly executedCheckRef?: string | null;
  /** Set when the evaluation consulted the DR-021 knob-10 type fallback. */
  readonly consultedTypeFallback?: boolean;
}

interface Context {
  readonly facts: TerminalRecordedFacts;
  readonly completion: TerminalCompletionDeclaration;
}

// --- shared derived inputs (each names the recorded facts it consulted) -----

function q1Route(context: Context): ComputedInput {
  const { judgementScheduledCount } = context.facts.ledger;
  const { nodeCount } = context.facts.graph;
  if (judgementScheduledCount >= 1 || nodeCount >= 1) {
    return present("Q1_route", "CONTINUE", {
      kind: "RECORDED_PROGRESS_BEYOND_LOCK",
      judgement_scheduled_count: judgementScheduledCount,
      node_count: nodeCount
    });
  }
  return absent("Q1_route", {
    judgement_scheduled_count: judgementScheduledCount,
    node_count: nodeCount,
    note: "no recorded post-LOCK artifact and no recorded INERT verdict — the record cannot distinguish the routes"
  });
}

function q7NotTerminal(context: Context, name: string): ComputedInput {
  return present(name, "NOT_TERMINAL", {
    kind: "TERMINAL_COMPLETION_DECLARATION",
    completion: context.completion.kind,
    note: "this completion persists an answer record in the same sequence; a five-route terminal stop never reaches this drain"
  });
}

function researchRoute(context: Context, name = "research_route"): ComputedInput {
  const { querySetCount, sourceRecordCount, evidenceItemCount } = context.facts.research;
  const taken = querySetCount >= 1 || sourceRecordCount >= 1 || evidenceItemCount >= 1;
  return present(name, taken, {
    kind: "RECORDED_ROUTE",
    query_set_count: querySetCount,
    source_record_count: sourceRecordCount,
    evidence_item_count: evidenceItemCount
  });
}

function q10Split(context: Context, name = "Q10.split"): ComputedInput {
  const { splitSpawnDecisionCount } = context.facts.decisions;
  const { childNodeCount } = context.facts.graph;
  return present(name, splitSpawnDecisionCount >= 1 || childNodeCount >= 1, {
    kind: "RECORDED_DECISION",
    split_spawn_decision_count: splitSpawnDecisionCount,
    child_node_count: childNodeCount
  });
}

function anyServeCandidate(context: Context, name = "any_serve_candidate"): ComputedInput {
  const { composerCallCount } = context.facts.ledger;
  return present(name, composerCallCount >= 1, {
    kind: "RECORDED_MODEL_CALLS",
    composer_call_count: composerCallCount,
    note: "a composed serve candidate is evidenced by its recorded COMPOSER call artifacts"
  });
}

function questionTypeInput(context: Context): ComputedInput {
  // No shipped organ records a question-type resolution yet. DR-021 knob 10
  // RULES the unresolved-type disposition: "an unresolved type auto-serves a
  // visible factual fallback with a travelling label". The ruled fallback is a
  // recorded law, not a guess; the consultation is recorded here as evidence.
  void context;
  return present("question_type", "factual", {
    kind: "RULED_FALLBACK",
    ruling: "DR-021 knob 10 — unresolved type auto-serves the factual fallback",
    recorded_type_resolution: "NONE"
  });
}

function empiricalBacking(context: Context): { readonly backed: boolean; readonly basis: Record<string, unknown> } {
  const { evidenceItemCount, probeCaptureCount } = context.facts.research;
  return {
    backed: evidenceItemCount >= 1 || probeCaptureCount >= 1,
    basis: { evidence_item_count: evidenceItemCount, probe_capture_count: probeCaptureCount }
  };
}

function crossEntered(context: Context, name: string): ComputedInput {
  const { critiquePacketCount, objectionRecordCount, independenceReceiptCount, symmetryDiffCount } = context.facts.critique;
  const entered = critiquePacketCount >= 1 || objectionRecordCount >= 1
    || independenceReceiptCount >= 1 || symmetryDiffCount >= 1;
  return present(name, entered, {
    kind: "RECORDED_STAGE_ARTIFACTS",
    critique_packet_count: critiquePacketCount,
    objection_record_count: objectionRecordCount,
    independence_receipt_count: independenceReceiptCount,
    symmetry_diff_count: symmetryDiffCount
  });
}

// --- the per-row predicate table (docs/architecture/10-row-contracts.md §6) --

const rowEvaluators: Readonly<Partial<Record<BatteryRowId, (context: Context) => RowEvaluation>>> = {
  Q2: (context) => {
    const route = q1Route(context);
    return { inputs: [route], predicate: tri(route, (value) => value === "CONTINUE") };
  },
  Q3: (context) => {
    const route = q1Route(context);
    return { inputs: [route], predicate: tri(route, (value) => value === "CONTINUE") };
  },
  Q4: (context) => {
    // R-G: before_first_search is an ordering deadline, never a conjunct.
    const route = q1Route(context);
    return { inputs: [route], predicate: tri(route, (value) => value === "CONTINUE") };
  },
  Q5: (context) => {
    const route = q1Route(context);
    const { evidenceItemCount } = context.facts.research;
    const beforeEvidence = present("before_evidence", evidenceItemCount === 0, {
      kind: "RECORDED_COUNT",
      evidence_item_count: evidenceItemCount,
      note: "DR-107(2): both written conjuncts are predicate inputs"
    });
    return {
      inputs: [route, beforeEvidence],
      predicate: and3(tri(route, (value) => value === "CONTINUE"), triBool(beforeEvidence))
    };
  },
  Q6: (context) => {
    const route = q1Route(context);
    return { inputs: [route], predicate: tri(route, (value) => value === "CONTINUE") };
  },
  Q7: (context) => {
    const { judgementScheduledCount } = context.facts.ledger;
    const { propagationRunCount } = context.facts.propagation;
    const lockComplete = present("LOCK_complete", judgementScheduledCount >= 1 && propagationRunCount >= 1, {
      kind: "RECORDED_PROGRESS_BEYOND_LOCK",
      judgement_scheduled_count: judgementScheduledCount,
      propagation_run_count: propagationRunCount
    });
    return { inputs: [lockComplete], predicate: triBool(lockComplete) };
  },
  Q8: (context) => {
    const terminality = q7NotTerminal(context, "Q7_terminality");
    return { inputs: [terminality], predicate: tri(terminality, (value) => value === "NOT_TERMINAL") };
  },
  Q9: (context) => {
    const { activePathNodeCount } = context.facts.graph;
    const liveAnswers = present("live_answer_count", activePathNodeCount, {
      kind: "RECORDED_COUNT",
      active_path_node_count: activePathNodeCount
    });
    return { inputs: [liveAnswers], predicate: tri(liveAnswers, (value) => typeof value === "number" && value > 1) };
  },
  Q10: (context) => {
    const terminality = q7NotTerminal(context, "Q7_terminality");
    return { inputs: [terminality], predicate: tri(terminality, (value) => value === "NOT_TERMINAL") };
  },
  Q11: (context) => {
    const route = researchRoute(context);
    const q4Present = present("Q4_present", false, {
      kind: "RECORDED_ABSENCE",
      settled_q4_work_items: context.facts.executions.settledWorkItemRowIds.includes("Q4") ? 1 : 0,
      note: "no recorded Q4 answer-rule record exists for the run"
    });
    return { inputs: [route, q4Present], predicate: and3(triBool(route), triBool(q4Present)) };
  },
  Q12: (context) => {
    const route = researchRoute(context);
    return { inputs: [route], predicate: triBool(route) };
  },
  Q13: (context) => {
    const route = researchRoute(context);
    return { inputs: [route], predicate: triBool(route) };
  },
  Q15: (context) => {
    const { querySetCount } = context.facts.research;
    const frozen = present("Q11_frozen", querySetCount >= 1, {
      kind: "RECORDED_COUNT",
      frozen_query_set_count: querySetCount
    });
    const route = researchRoute(context);
    return { inputs: [frozen, route], predicate: and3(triBool(frozen), triBool(route)) };
  },
  Q16: (context) => {
    const { sourceRecordCount } = context.facts.research;
    const candidates = present("candidate_source_count", sourceRecordCount, {
      kind: "RECORDED_COUNT",
      source_record_count: sourceRecordCount
    });
    return { inputs: [candidates], predicate: tri(candidates, (value) => typeof value === "number" && value >= 1) };
  },
  Q17: (context) => {
    const { querySetCount, sourceRecordCount } = context.facts.research;
    const complete = present("Q15_complete", querySetCount >= 1, {
      kind: "RECORDED_COUNT",
      frozen_query_set_count: querySetCount,
      source_record_count: sourceRecordCount,
      note: "a harvest that never froze a query set never completed"
    });
    return { inputs: [complete], predicate: triBool(complete) };
  },
  Q18: (context) => {
    const policy = context.facts.register.livenessPolicy;
    if (policy === null) {
      return {
        inputs: [
          absent("answer_can_change_over_time", { register_row: "livenessPolicy", register_version: context.facts.registerVersion, found: false }),
          absent("registry_class", { register_row: "livenessPolicy", register_version: context.facts.registerVersion, found: false })
        ],
        predicate: "UNRESOLVED"
      };
    }
    const basis = {
      kind: "RULED_REGISTER_ROW" as const,
      register_row: "livenessPolicy",
      register_version: context.facts.registerVersion,
      source_ref: policy.sourceRef,
      question_class: policy.questionClass,
      review_after_ms: policy.reviewAfterMs,
      retire_after_ms: policy.retireAfterMs
    };
    const canChange = present("answer_can_change_over_time", true, {
      ...basis,
      note: "the ruled liveness policy assigns this question class a finite review/retire clock — the answer is declared revisable over time"
    });
    const registryClass = present("registry_class", policy.questionClass, basis);
    return { inputs: [canChange, registryClass], predicate: triBool(canChange) };
  },
  Q19: (context) => {
    const { admittedSourceCount } = context.facts.research;
    const admitted = present("admitted_source_count", admittedSourceCount, {
      kind: "RECORDED_COUNT",
      admitted_source_count: admittedSourceCount
    });
    return { inputs: [admitted], predicate: tri(admitted, (value) => typeof value === "number" && value > 1) };
  },
  Q20: (context) => {
    const route = researchRoute(context, "x");
    const { probeCaptureCount } = context.facts.research;
    const input = present("empirical_research_route", route.value === true, {
      ...route.basis,
      probe_capture_count: probeCaptureCount
    });
    return { inputs: [input], predicate: triBool(input) };
  },
  Q21: (context) => {
    const { probeCaptureCount } = context.facts.research;
    const runnable = present("runnable_selected", probeCaptureCount >= 1, {
      kind: "RECORDED_COUNT",
      probe_capture_count: probeCaptureCount
    });
    return { inputs: [runnable], predicate: triBool(runnable) };
  },
  Q22: (context) => {
    const { probeCaptureCount } = context.facts.research;
    const runnable = present("runnable_selected", probeCaptureCount >= 1, {
      kind: "RECORDED_COUNT",
      probe_capture_count: probeCaptureCount
    });
    return { inputs: [runnable], predicate: triBool(runnable) };
  },
  Q23: (context) => {
    const { instrumentCertificationCount, probeCaptureCount } = context.facts.research;
    const used = present("instrument_used", instrumentCertificationCount >= 1 || probeCaptureCount >= 1, {
      kind: "RECORDED_COUNT",
      instrument_certification_count: instrumentCertificationCount,
      probe_capture_count: probeCaptureCount
    });
    return { inputs: [used], predicate: triBool(used) };
  },
  Q24: (context) => {
    const { probeCaptureCount } = context.facts.research;
    const attempted = present("measurement_attempted", probeCaptureCount >= 1, {
      kind: "RECORDED_COUNT",
      probe_capture_count: probeCaptureCount
    });
    return { inputs: [attempted], predicate: triBool(attempted) };
  },
  Q25: (context) => {
    const { absenceRowCount, probeCaptureCount } = context.facts.research;
    const noRunnable = present("Q20_no_runnable", false, {
      kind: "RECORDED_ABSENCE",
      absence_row_count: absenceRowCount,
      note: "Q20 produced no recorded nothing-runnable output"
    });
    const blocked = present("Q22_blocked", false, {
      kind: "RECORDED_ABSENCE",
      probe_capture_count: probeCaptureCount,
      note: "no recorded blocked-execution capture exists"
    });
    return { inputs: [noRunnable, blocked], predicate: or3(triBool(noRunnable), triBool(blocked)) };
  },
  Q26: (context) => {
    const split = q10Split(context);
    return { inputs: [split], predicate: triBool(split) };
  },
  Q27: (context) => {
    const split = q10Split(context);
    return { inputs: [split], predicate: triBool(split) };
  },
  Q28: (context) => {
    const { childNodeCount } = context.facts.graph;
    const children = present("Q26_child_count", childNodeCount, {
      kind: "RECORDED_COUNT",
      child_node_count: childNodeCount
    });
    return { inputs: [children], predicate: tri(children, (value) => typeof value === "number" && value >= 1) };
  },
  Q29: (context) => {
    const { childNodeCount } = context.facts.graph;
    const survivors = present("Q28_survivor_count", childNodeCount, {
      kind: "RECORDED_COUNT",
      child_node_count: childNodeCount,
      note: "with zero recorded children there are zero recorded survivors"
    });
    return { inputs: [survivors], predicate: tri(survivors, (value) => typeof value === "number" && value >= 1) };
  },
  Q30: (context) => {
    const split = q10Split(context);
    return { inputs: [split], predicate: triBool(split) };
  },
  Q31: (context) => {
    const split = q10Split(context);
    return { inputs: [split], predicate: triBool(split) };
  },
  Q32: (context) => {
    const { evidenceItemCount } = context.facts.research;
    const items = present("evidence_item_count", evidenceItemCount, {
      kind: "RECORDED_COUNT",
      evidence_item_count: evidenceItemCount
    });
    return { inputs: [items], predicate: tri(items, (value) => typeof value === "number" && value >= 1) };
  },
  Q33: (context) => {
    const { nodeCount } = context.facts.graph;
    const claims = present("claim_or_leaf_count", nodeCount, {
      kind: "RECORDED_COUNT",
      node_count: nodeCount
    });
    return { inputs: [claims], predicate: tri(claims, (value) => typeof value === "number" && value >= 1) };
  },
  Q34: (context) => {
    const { evidenceItemCount } = context.facts.research;
    const bothSides = present("evidence_on_both_sides", false, {
      kind: "RECORDED_COUNT",
      evidence_item_count: evidenceItemCount,
      note: "zero recorded evidence items — neither side holds recorded evidence"
    });
    return { inputs: [bothSides], predicate: triBool(bothSides) };
  },
  Q35: (context) => {
    const { sourceRecordCount } = context.facts.research;
    const loadBearing = present("source_is_load_bearing", false, {
      kind: "RECORDED_COUNT",
      source_record_count: sourceRecordCount
    });
    return { inputs: [loadBearing], predicate: triBool(loadBearing) };
  },
  Q36: (context) => {
    const { reducedJudgementCount } = context.facts.judgement;
    const weighted = present("weighted_claim_count", reducedJudgementCount, {
      kind: "RECORDED_COUNT",
      reduced_judgement_count: reducedJudgementCount
    });
    const served = present("served_answer_count", context.facts.serve.persistedAnswerCount + 1, {
      kind: "TERMINAL_COMPLETION_DECLARATION",
      persisted_answer_count: context.facts.serve.persistedAnswerCount,
      completion: context.completion.kind,
      note: "this completion persists one answer record in the same sequence"
    });
    return {
      inputs: [weighted, served],
      predicate: or3(
        tri(weighted, (value) => typeof value === "number" && value >= 1),
        tri(served, (value) => typeof value === "number" && value >= 1)
      )
    };
  },
  Q37: (context) => {
    const type = questionTypeInput(context);
    const act = absent("settlement_act", {
      note: "no shipped organ records a settlement-act resolution; the run's record carries none"
    });
    const { backed, basis } = empiricalBacking(context);
    const studyInUse = present("study_result_in_use", backed, {
      kind: "RECORDED_COUNT",
      ...basis
    });
    return {
      inputs: [type, act, studyInUse],
      predicate: and3(
        or3(tri(type, (value) => value === "causal"), triBool(act)),
        triBool(studyInUse)
      ),
      consultedTypeFallback: true
    };
  },
  Q38: (context) => {
    const planned = present("numeric_answer_planned", context.completion.servedNumberPlanned, {
      kind: "TERMINAL_COMPLETION_DECLARATION",
      served_number_planned: context.completion.servedNumberPlanned,
      strength_record_count: context.facts.propagation.strengthRecordCount
    });
    return { inputs: [planned], predicate: triBool(planned) };
  },
  Q39: (context) => {
    const route = researchRoute(context, "x");
    const cross = crossEntered(context, "x");
    const reaches = present("research_answer_reaches_CROSS", route.value === true && cross.value === true, {
      ...route.basis,
      ...cross.basis,
      note: "a research answer reaching CROSS would leave recorded research and CROSS-stage artifacts"
    });
    return { inputs: [reaches], predicate: triBool(reaches) };
  },
  Q41: (context) => {
    const { critiquePacketCount } = context.facts.critique;
    const eligible = present("eligible_critic_run", critiquePacketCount >= 1, {
      kind: "RECORDED_COUNT",
      critique_packet_count: critiquePacketCount
    });
    return { inputs: [eligible], predicate: triBool(eligible) };
  },
  Q42: (context) => {
    const { critiquePacketCount } = context.facts.critique;
    if (critiquePacketCount === 0) {
      const agrees = present("critic_agrees", false, {
        kind: "RECORDED_ABSENCE",
        critique_packet_count: 0,
        note: "no critic ran — the INACTIVE limb explicitly covers the no-critic case"
      });
      return { inputs: [agrees], predicate: triBool(agrees) };
    }
    return {
      inputs: [absent("critic_agrees", {
        critique_packet_count: critiquePacketCount,
        note: "critique packets exist but the record carries no agreement verdict shape"
      })],
      predicate: "UNRESOLVED"
    };
  },
  Q43: (context) => {
    const split = q10Split(context, "x");
    const { composerCallCount } = context.facts.ledger;
    const splitOrComposed = present("split_or_composed_answer", split.value === true || composerCallCount >= 1, {
      kind: "RECORDED_MODEL_CALLS",
      composer_call_count: composerCallCount,
      split: split.value,
      split_basis: split.basis
    });
    return { inputs: [splitOrComposed], predicate: triBool(splitOrComposed) };
  },
  Q44: (context) => {
    const entered = crossEntered(context, "CROSS_stage_entered");
    return { inputs: [entered], predicate: triBool(entered) };
  },
  Q45: (context) => {
    const { activePathNodeCount } = context.facts.graph;
    const multiple = present("multiple_components_to_compose", activePathNodeCount > 1, {
      kind: "RECORDED_COUNT",
      active_path_node_count: activePathNodeCount
    });
    return { inputs: [multiple], predicate: triBool(multiple) };
  },
  Q46: (context) => {
    // DR-110(3) WAIT‡ guard: missing Q34 stamps force a blocked completion.
    if (context.facts.ledger.entriesMissingActionStamps > 0) {
      return {
        inputs: [absent("Q45_computable", {
          entries_missing_action_stamps: context.facts.ledger.entriesMissingActionStamps,
          note: "DR-110(3): Q46 files WAIT while Q34's ledger stamps are missing — the run cannot complete"
        })],
        predicate: "UNRESOLVED"
      };
    }
    const { activePathNodeCount } = context.facts.graph;
    const computable = present("Q45_computable", false, {
      kind: "RECORDED_COUNT",
      active_path_node_count: activePathNodeCount,
      entries_missing_action_stamps: context.facts.ledger.entriesMissingActionStamps,
      note: "Q45 filed INACTIVE at a single component; no recorded operator declaration exists"
    });
    return { inputs: [computable], predicate: triBool(computable) };
  },
  Q47: (context) => {
    const { approvedOperatorVariantCount } = context.facts.register;
    const variants = present("approved_variant_count", approvedOperatorVariantCount, {
      kind: "RULED_REGISTER_ROW",
      register_version: context.facts.registerVersion,
      register_sealed: context.facts.register.sealed,
      approved_operator_variant_count: approvedOperatorVariantCount,
      note: "the sealed register records the approved operator variants; an absent row records zero"
    });
    return { inputs: [variants], predicate: tri(variants, (value) => typeof value === "number" && value > 1) };
  },
  Q48: (context) => {
    const split = q10Split(context);
    const bothExist = present("both_answers_exist", false, {
      kind: "RECORDED_ABSENCE",
      note: "no stored holistic baseline and no decomposed answer are on the record"
    });
    return { inputs: [split, bothExist], predicate: and3(triBool(split), triBool(bothExist)) };
  },
  Q49: (context) => {
    const { composerCallCount } = context.facts.ledger;
    const typedRanges = present("composed_answer_with_typed_ranges", false, {
      kind: "RECORDED_ABSENCE",
      composer_call_count: composerCallCount,
      note: "no typed-range records exist for any composed answer"
    });
    return { inputs: [typedRanges], predicate: triBool(typedRanges) };
  },
  Q50: (context) => {
    const type = questionTypeInput(context);
    return {
      inputs: [type],
      predicate: tri(type, (value) => value === "comparative" || value === "design"),
      consultedTypeFallback: true
    };
  },
  Q52: (context) => {
    const candidate = anyServeCandidate(context);
    const terminality = q7NotTerminal(context, "terminality");
    return {
      inputs: [candidate, terminality],
      predicate: and3(triBool(candidate), tri(terminality, (value) => value === "NOT_TERMINAL"))
    };
  },
  Q53: (context) => {
    const candidate = anyServeCandidate(context);
    return { inputs: [candidate], predicate: triBool(candidate) };
  },
  Q54: (context) => {
    const candidate = anyServeCandidate(context);
    const prior = present("Q5_prior_present", false, {
      kind: "RECORDED_ABSENCE",
      note: "no recorded Q5 prior exists; a missing prior does not deactivate this row (movement claims are unavailable, not zero)"
    });
    return { inputs: [candidate, prior], predicate: triBool(candidate) };
  },
  Q55: (context) => {
    const { absenceRowCount } = context.facts.research;
    const unknowns = present("open_unknown_count", 0, {
      kind: "RECORDED_COUNT",
      absence_row_count: absenceRowCount,
      note: "the ignorance ledger records zero open unknowns for the run"
    });
    return { inputs: [unknowns], predicate: tri(unknowns, (value) => typeof value === "number" && value >= 1) };
  },
  Q56: (context) => {
    const { scorecardCellCount, answerOutcomeCount } = context.facts.settlement;
    const history = scorecardCellCount + answerOutcomeCount;
    if (history === 0) {
      const sufficient = present("class_history_sufficient", false, {
        kind: "RECORDED_COUNT",
        scorecard_cell_count: scorecardCellCount,
        answer_outcome_count: answerOutcomeCount,
        note: "zero recorded class history is decidably insufficient under any ruled threshold"
      });
      return { inputs: [sufficient], predicate: triBool(sufficient) };
    }
    return {
      inputs: [absent("class_history_sufficient", {
        scorecard_cell_count: scorecardCellCount,
        answer_outcome_count: answerOutcomeCount,
        note: "recorded history exists but no ruled sufficiency threshold register row exists (AC-76: no invented threshold)"
      })],
      predicate: "UNRESOLVED"
    };
  },
  Q57: (context) => {
    const candidate = anyServeCandidate(context, "x");
    const possible = present("value_clause_detected_or_possible", candidate.value === true, {
      kind: "RECORDED_ABSENCE_OF_EXCLUSION",
      composer_call_count: context.facts.ledger.composerCallCount,
      note: "no normative-clause detector output is recorded; a composed candidate may therefore contain a value clause — 'may contain' activates"
    });
    return { inputs: [possible], predicate: triBool(possible) };
  },
  Q58: (context) => {
    const candidate = anyServeCandidate(context, "x");
    const { backed, basis } = empiricalBacking(context);
    const empirical = present("empirical_serve_candidate", candidate.value === true && backed, {
      kind: "RECORDED_COUNT",
      composer_call_count: context.facts.ledger.composerCallCount,
      ...basis
    });
    return { inputs: [empirical], predicate: triBool(empirical) };
  },
  Q59: (context) => {
    const created = present("answer_record_created", true, {
      kind: "TERMINAL_COMPLETION_DECLARATION",
      completion: context.completion.kind,
      persisted_answer_count: context.facts.serve.persistedAnswerCount,
      note: "this completion persists the answer record in the same sequence as this drain"
    });
    return { inputs: [created], predicate: triBool(created) };
  },
  Q60: (context) => {
    const { answerOutcomeCount } = context.facts.settlement;
    const scoreable = present("Q59_scoreable", answerOutcomeCount >= 1, {
      kind: "RECORDED_COUNT",
      answer_outcome_count: answerOutcomeCount,
      note: "no recorded external resolver outcome — PERMANENTLY_UNSCOREABLE is the spec's own INACTIVE filing for this case"
    });
    return { inputs: [scoreable], predicate: triBool(scoreable) };
  },
  R1: (context) => {
    const route = researchRoute(context);
    const beforeQ15 = present("before_Q15", context.facts.research.querySetCount === 0, {
      kind: "RECORDED_COUNT",
      frozen_query_set_count: context.facts.research.querySetCount,
      note: "DR-107(2): the before-Q15 phrase is a ruled conjunct"
    });
    return { inputs: [route, beforeQ15], predicate: and3(triBool(route), triBool(beforeQ15)) };
  },
  R2: (context) => {
    const route = q1Route(context);
    const items = present("evidence_item_count", context.facts.research.evidenceItemCount, {
      kind: "RECORDED_COUNT",
      evidence_item_count: context.facts.research.evidenceItemCount
    });
    // Binding limb: always, inheriting Q2's Q1=CONTINUE gate (SP-12).
    return { inputs: [route, items], predicate: tri(route, (value) => value === "CONTINUE") };
  },
  R3: (context) => {
    const route = researchRoute(context);
    return { inputs: [route], predicate: triBool(route) };
  },
  R4: (context) => {
    const route = researchRoute(context);
    return { inputs: [route], predicate: triBool(route) };
  },
  R5: (context) => {
    const researched = present("nonterminal_researched_answer", false, {
      kind: "RECORDED_ROUTE",
      query_set_count: context.facts.research.querySetCount,
      evidence_item_count: context.facts.research.evidenceItemCount,
      note: "the served answer is not a researched answer — the run took no recorded research route"
    });
    const beforeServe = present("before_confident_serve", context.facts.ledger.serveActionCount === 0, {
      kind: "RECORDED_COUNT",
      serve_action_count: context.facts.ledger.serveActionCount,
      note: "DR-107(2): the before-confident-serve phrase is a ruled conjunct"
    });
    return { inputs: [researched, beforeServe], predicate: and3(triBool(researched), triBool(beforeServe)) };
  },
  R7: (context) => {
    const terminality = q7NotTerminal(context, "Q7_terminality");
    return { inputs: [terminality], predicate: tri(terminality, (value) => value === "NOT_TERMINAL") };
  },
  R8: (context) => {
    const aimEntered = present("AIM_entered", context.facts.research.querySetCount >= 1, {
      kind: "RECORDED_COUNT",
      query_set_count: context.facts.research.querySetCount,
      note: "no recorded AIM-stage artifact exists — the stage was never entered"
    });
    const beforeFreeze = present("before_source_plan_freeze", context.facts.research.querySetCount === 0, {
      kind: "RECORDED_COUNT",
      query_set_count: context.facts.research.querySetCount,
      note: "DR-107(2): the before-source-plan-freeze phrase is a ruled conjunct"
    });
    return { inputs: [aimEntered, beforeFreeze], predicate: and3(triBool(aimEntered), triBool(beforeFreeze)) };
  },
  R9: (context) => {
    const { composerCallCount, postComposeR9CallCount } = context.facts.ledger;
    const { strangerRestatementCount } = context.facts.graph;
    const ready = present("serve_candidate_ready", composerCallCount >= 1, {
      kind: "RECORDED_MODEL_CALLS",
      composer_call_count: composerCallCount,
      stranger_restatement_count: strangerRestatementCount,
      post_compose_r9_call_count: postComposeR9CallCount
    });
    const executed = composerCallCount >= 1 && strangerRestatementCount >= 1
      ? `stranger-restatement:${context.facts.runId}:count=${strangerRestatementCount};post-compose-r9-calls=${postComposeR9CallCount}`
      : null;
    return { inputs: [ready], predicate: triBool(ready), executedCheckRef: executed };
  }
};

const POLICY_BLOCKED_ROWS = new Set<string>(["Q14", "Q40", "R6"]);

// Called at evaluation time, never at module load — battery/index.js and this
// module import each other, so top-level reads of index bindings would hit the
// temporal dead zone during module evaluation.
function isRatifiedRow(batteryRowId: string): batteryRowId is BatteryRowId {
  return (BATTERY_ROW_IDS as readonly string[]).includes(batteryRowId);
}

export function evaluateTerminalActivations(input: {
  readonly facts: TerminalRecordedFacts;
  readonly completion: TerminalCompletionDeclaration;
  readonly waitingRows: readonly string[];
}): readonly TerminalActivationResolution[] {
  const context: Context = { facts: input.facts, completion: input.completion };
  const resolutions: TerminalActivationResolution[] = [];
  const unresolved: { readonly batteryRowId: string; readonly missingInputs: readonly string[] }[] = [];

  for (const batteryRowId of input.waitingRows) {
    if (POLICY_BLOCKED_ROWS.has(batteryRowId) || !isRatifiedRow(batteryRowId)) {
      throw new TypedDomainError(
        "TERMINAL_ROW_NOT_EVALUATABLE",
        POLICY_BLOCKED_ROWS.has(batteryRowId)
          ? `${batteryRowId} is POLICY_BLOCKED (opens and stays POLICY_BLOCKED, never WAIT) — a waiting ${batteryRowId} is a corrupted activation stream`
          : `${batteryRowId} is not a ratified battery row`
      );
    }
    const evaluate = rowEvaluators[batteryRowId as BatteryRowId];
    if (evaluate === undefined) {
      throw new TypedDomainError(
        "TERMINAL_ROW_NOT_EVALUATABLE",
        `${batteryRowId} has no terminal predicate evaluation (unconditional and INACTIVE-opening rows never wait)`
      );
    }
    const evaluation = evaluate(context);
    const declared = [...declaredPredicateInputNames(batteryRowId as BatteryRowId)];
    const named = new Map(evaluation.inputs.map((computed) => [computed.name, computed]));
    // Inputs are recorded under the row's DECLARED names; helper-internal
    // scratch names ("x") never leak into the evidence.
    const carried = declared.map((name) => named.get(name)).filter((computed): computed is ComputedInput => computed !== undefined);
    if (carried.length !== declared.length) {
      throw new TypedDomainError(
        "TERMINAL_ROW_NOT_EVALUATABLE",
        `${batteryRowId}: evaluation computed inputs ${[...named.keys()].join(",")} but the declared contract names ${declared.join(",")}`
      );
    }
    const state = resolveActivationState({
      batteryRowId: batteryRowId as BatteryRowId,
      predicate: evaluation.predicate,
      // No cache-satisfaction record exists in the schema; recorded absence.
      cacheHit: false
    });
    if (state === "WAIT") {
      unresolved.push({
        batteryRowId,
        missingInputs: carried.filter((computed) => !computed.available).map((computed) => computed.name)
      });
      continue;
    }
    if (state === "POLICY_BLOCKED") {
      throw new TypedDomainError("TERMINAL_ROW_NOT_EVALUATABLE", `${batteryRowId} resolved POLICY_BLOCKED inside the drain`);
    }
    const values: Record<string, unknown> = {};
    const basis: Record<string, unknown> = {};
    const absentInputs: { name: string; reason: "NOT_RECORDED_AT_TERMINAL" }[] = [];
    for (const computed of carried) {
      basis[computed.name] = computed.basis;
      if (computed.available) {
        values[computed.name] = computed.value;
      } else {
        absentInputs.push({ name: computed.name, reason: "NOT_RECORDED_AT_TERMINAL" });
      }
    }
    const predicateInputs = Object.freeze({
      kind: absentInputs.length === 0 ? "PRESENT" : "PARTIAL",
      values: Object.freeze(values),
      ...(absentInputs.length === 0 ? {} : { absentInputs: Object.freeze(absentInputs) }),
      basis: Object.freeze(basis),
      predicateResult: evaluation.predicate,
      evaluator: TERMINAL_EVALUATOR_REF
    });
    resolutions.push(Object.freeze({
      batteryRowId,
      state,
      predicateInputs,
      skipEvidence: state === "INACTIVE"
        ? Object.freeze({
            kind: "PRESENT",
            evidenceType: "TERMINAL_RECORDED_FACTS",
            predicateResult: "FALSE",
            consulted: Object.freeze(basis),
            evaluator: TERMINAL_EVALUATOR_REF
          })
        : null,
      executedCheckRef: state === "ACTIVE" ? evaluation.executedCheckRef ?? null : null,
      // DR-141(2): consulted is consulted, whatever the resolved state —
      // the travelling label rides the served answer either way.
      ...(evaluation.consultedTypeFallback === true ? { typeFallbackConsulted: true } : {})
    }));
  }

  if (unresolved.length > 0) {
    throw new TypedDomainError(
      "TERMINAL_ACTIVATION_UNRESOLVED",
      `DR-139(2) typed refusal — the run stays unsettled; predicate inputs genuinely unrecorded at terminal: ${unresolved
        .map((row) => `${row.batteryRowId}[${row.missingInputs.join(",") || "predicate-unresolved"}]`)
        .join("; ")}`
    );
  }
  return Object.freeze(resolutions);
}

// ---------------------------------------------------------------------------
// The recorded-fact reader — plain SELECTs over the run's own record (P6 read
// projection; reads never write). Every count feeding the evaluation above is
// read here; nothing is synthesized.
// ---------------------------------------------------------------------------

/** The shipped question-class binding: apps/scheduler/src/index.ts reads the
 * liveness policy for class "standard". The terminal evaluator consults the
 * same shipped binding. */
export const SHIPPED_QUESTION_CLASS = "standard" as const;

function readCount(row: Record<string, string | null> | undefined, key: string): number {
  const value = row?.[key];
  if (value === undefined || value === null) {
    throw new TypedDomainError("TERMINAL_FACT_READ_FAILED", `Recorded fact ${key} did not read`);
  }
  return Number(value);
}

interface LivenessPolicyMember {
  readonly review_after_ms: number;
  readonly retire_after_ms: number;
}

function matchLivenessPolicyMember(valueJson: unknown, questionClass: string): LivenessPolicyMember | null {
  if (typeof valueJson !== "object" || valueJson === null) return null;
  const value = valueJson as {
    kind?: unknown;
    classes?: Record<string, { review_after_ms?: unknown; retire_after_ms?: unknown }>;
    members?: readonly { question_class?: unknown; review_after_ms?: unknown; retire_after_ms?: unknown }[];
  };
  if (value.kind !== "LIVENESS_POLICY") return null;
  // Shipped reader shape (packages/register: classes{}) and the DR-133
  // draft-faithful acceptance shape (members[]) are both ruled recordings of
  // the same row; the evaluator reads whichever shape the sealed register
  // holds (the divergence is the ACC-01 rev-1 A1 carried advisory).
  const fromClasses = value.classes?.[questionClass];
  if (typeof fromClasses?.review_after_ms === "number" && typeof fromClasses?.retire_after_ms === "number") {
    return { review_after_ms: fromClasses.review_after_ms, retire_after_ms: fromClasses.retire_after_ms };
  }
  const fromMembers = value.members?.find((member) => member.question_class === questionClass);
  if (typeof fromMembers?.review_after_ms === "number" && typeof fromMembers?.retire_after_ms === "number") {
    return { review_after_ms: fromMembers.review_after_ms, retire_after_ms: fromMembers.retire_after_ms };
  }
  return null;
}

export async function readTerminalRecordedFacts(pool: Pool, runId: string): Promise<TerminalRecordedFacts> {
  const run = await pool.query<{ register_version: number }>(
    "SELECT register_version FROM core.run WHERE run_id = $1",
    [runId]
  );
  const registerVersion = run.rows[0]?.register_version;
  if (registerVersion === undefined) {
    throw new TypedDomainError("RUN_NOT_FOUND", `Run ${runId} does not exist`);
  }
  const [ledger, graph, judgement, propagation, decisions, research, critique, settlement, serve, register, executions] =
    await Promise.all([
      pool.query<Record<string, string>>(
        `SELECT
           count(*) FILTER (WHERE action_kind = 'JUDGEMENT_SCHEDULED')::text AS judgement_scheduled,
           count(*) FILTER (WHERE action_kind = 'PROPAGATION')::text AS propagation,
           count(*) FILTER (WHERE action_kind = 'MODEL_CALL' AND call_site_key = 'JUDGE' AND outcome = 'OK')::text AS judge_calls,
           count(*) FILTER (WHERE action_kind = 'MODEL_CALL' AND call_site_key LIKE 'COMPOSER:%' AND outcome = 'OK')::text AS composer_calls,
           count(*) FILTER (WHERE action_kind = 'MODEL_CALL' AND call_site_key LIKE 'CONFORMANCE:%' AND outcome = 'OK')::text AS conformance_calls,
           count(*) FILTER (WHERE action_kind = 'MODEL_CALL' AND call_site_key LIKE 'POST_COMPOSE_R9:%' AND outcome = 'OK')::text AS r9_calls,
           count(*) FILTER (WHERE action_kind = 'SERVE')::text AS serve_actions,
           count(*) FILTER (WHERE subject_item_id IS NULL OR stance_at_action IS NULL)::text AS missing_stamps
         FROM ledger.ledger_entry WHERE run_id = $1`,
        [runId]
      ),
      pool.query<Record<string, string>>(
        `SELECT
           (SELECT count(*) FROM core.node WHERE run_id = $1)::text AS nodes,
           (SELECT count(*) FROM core.node WHERE run_id = $1 AND path_status = 'active')::text AS active_nodes,
           (SELECT count(*) FROM core.node WHERE run_id = $1 AND parent_node_id IS NOT NULL)::text AS child_nodes,
           (SELECT count(*) FROM core.stranger_restatement WHERE run_id = $1)::text AS restatements`,
        [runId]
      ),
      pool.query<Record<string, string>>(
        "SELECT count(*)::text AS reduced FROM ledger.reduced_judgement WHERE run_id = $1",
        [runId]
      ),
      pool.query<Record<string, string>>(
        `SELECT
           (SELECT count(*) FROM ledger.propagation_run WHERE run_id = $1)::text AS runs,
           (SELECT count(*) FROM ledger.node_strength_record AS strength
             JOIN ledger.propagation_run AS run ON run.propagation_run_id = strength.propagation_run_id
             WHERE run.run_id = $1)::text AS strengths`,
        [runId]
      ),
      pool.query<Record<string, string>>(
        `SELECT
           count(*)::text AS records,
           count(*) FILTER (WHERE classification = 'categorical' AND spawn_count > 0)::text AS split_spawns
         FROM ledger.decision_record WHERE run_id = $1`,
        [runId]
      ),
      pool.query<Record<string, string>>(
        `SELECT
           (SELECT count(*) FROM evidence.query_set WHERE run_id = $1)::text AS query_sets,
           (SELECT count(*) FROM evidence.source_record WHERE run_id = $1)::text AS sources,
           (SELECT count(*) FROM evidence.evidence_item WHERE run_id = $1)::text AS items,
           (SELECT count(DISTINCT source_ref) FROM evidence.evidence_item
             WHERE run_id = $1 AND admissibility IN ('ADMITTED', 'ADMITTED_DOWNGRADED'))::text AS admitted_sources,
           (SELECT count(*) FROM evidence.absence_row WHERE run_id = $1)::text AS absences,
           (SELECT count(*) FROM evidence.probe_capture WHERE run_id = $1)::text AS probes,
           (SELECT count(*) FROM evidence.instrument_certification WHERE run_id = $1)::text AS instruments`,
        [runId]
      ),
      pool.query<Record<string, string>>(
        `SELECT
           (SELECT count(*) FROM core.critique_packet WHERE run_id = $1)::text AS packets,
           (SELECT count(*) FROM core.objection_record WHERE run_id = $1)::text AS objections,
           (SELECT count(*) FROM core.independence_receipt WHERE run_id = $1)::text AS receipts,
           (SELECT count(*) FROM core.symmetry_diff WHERE run_id = $1)::text AS diffs`,
        [runId]
      ),
      pool.query<Record<string, string>>(
        `SELECT
           (SELECT count(*) FROM scorecard.answer_outcome WHERE run_id = $1)::text AS outcomes,
           (SELECT count(*) FROM scorecard.scorecard_cell)::text AS cells`,
        [runId]
      ),
      pool.query<Record<string, string>>(
        "SELECT count(*)::text AS answers FROM serve.answer WHERE run_id = $1",
        [runId]
      ),
      pool.query<{ row_key: string; value_json: unknown; source_ref: string; sealed: boolean | null }>(
        `SELECT row.row_key, row.value_json, row.source_ref, version.sealed
         FROM register.register_row AS row
         LEFT JOIN register.register_version AS version ON version.register_version = row.register_version
         WHERE row.register_version = $1 AND row.row_key IN ('livenessPolicy', 'approvedOperatorVariants')`,
        [registerVersion]
      ),
      pool.query<{ battery_row_id: string }>(
        "SELECT DISTINCT battery_row_id FROM core.work_item WHERE run_id = $1 AND state = 'DONE'",
        [runId]
      )
    ]);

  const livenessRow = register.rows.find((row) => row.row_key === "livenessPolicy");
  const member = livenessRow === undefined
    ? null
    : matchLivenessPolicyMember(livenessRow.value_json, SHIPPED_QUESTION_CLASS);
  const variantRow = register.rows.find((row) => row.row_key === "approvedOperatorVariants");
  const variantValue = variantRow?.value_json;
  const approvedOperatorVariantCount = Array.isArray(variantValue)
    ? variantValue.length
    : Array.isArray((variantValue as { variants?: unknown[] } | undefined)?.variants)
      ? (variantValue as { variants: unknown[] }).variants.length
      : 0;

  return Object.freeze({
    runId,
    registerVersion,
    ledger: {
      judgementScheduledCount: readCount(ledger.rows[0], "judgement_scheduled"),
      propagationCount: readCount(ledger.rows[0], "propagation"),
      judgeCallCount: readCount(ledger.rows[0], "judge_calls"),
      composerCallCount: readCount(ledger.rows[0], "composer_calls"),
      conformanceCallCount: readCount(ledger.rows[0], "conformance_calls"),
      postComposeR9CallCount: readCount(ledger.rows[0], "r9_calls"),
      serveActionCount: readCount(ledger.rows[0], "serve_actions"),
      entriesMissingActionStamps: readCount(ledger.rows[0], "missing_stamps")
    },
    graph: {
      nodeCount: readCount(graph.rows[0], "nodes"),
      activePathNodeCount: readCount(graph.rows[0], "active_nodes"),
      childNodeCount: readCount(graph.rows[0], "child_nodes"),
      strangerRestatementCount: readCount(graph.rows[0], "restatements")
    },
    judgement: { reducedJudgementCount: readCount(judgement.rows[0], "reduced") },
    propagation: {
      propagationRunCount: readCount(propagation.rows[0], "runs"),
      strengthRecordCount: readCount(propagation.rows[0], "strengths")
    },
    decisions: {
      decisionRecordCount: readCount(decisions.rows[0], "records"),
      splitSpawnDecisionCount: readCount(decisions.rows[0], "split_spawns")
    },
    research: {
      querySetCount: readCount(research.rows[0], "query_sets"),
      sourceRecordCount: readCount(research.rows[0], "sources"),
      evidenceItemCount: readCount(research.rows[0], "items"),
      admittedSourceCount: readCount(research.rows[0], "admitted_sources"),
      absenceRowCount: readCount(research.rows[0], "absences"),
      probeCaptureCount: readCount(research.rows[0], "probes"),
      instrumentCertificationCount: readCount(research.rows[0], "instruments")
    },
    critique: {
      critiquePacketCount: readCount(critique.rows[0], "packets"),
      objectionRecordCount: readCount(critique.rows[0], "objections"),
      independenceReceiptCount: readCount(critique.rows[0], "receipts"),
      symmetryDiffCount: readCount(critique.rows[0], "diffs")
    },
    settlement: {
      answerOutcomeCount: readCount(settlement.rows[0], "outcomes"),
      scorecardCellCount: readCount(settlement.rows[0], "cells")
    },
    serve: { persistedAnswerCount: readCount(serve.rows[0], "answers") },
    register: {
      sealed: register.rows[0]?.sealed === true,
      livenessPolicy: livenessRow === undefined || member === null
        ? null
        : {
            sourceRef: livenessRow.source_ref,
            questionClass: SHIPPED_QUESTION_CLASS,
            reviewAfterMs: member.review_after_ms,
            retireAfterMs: member.retire_after_ms
          },
      approvedOperatorVariantCount
    },
    executions: {
      settledWorkItemRowIds: Object.freeze(executions.rows.map((row) => row.battery_row_id))
    }
  });
}

/** The production seam factory: wire the returned function as the runner's
 * resolveTerminalActivations. Replaces the DR-135 refusing evaluator on the
 * live path; the refusing evaluator remains the outermost fallback. */
export function createTerminalActivationEvaluator(pool: Pool): (input: {
  readonly runId: string;
  readonly waitingRows: readonly string[];
  readonly completion: TerminalCompletionDeclaration;
}) => Promise<readonly TerminalActivationResolution[]> {
  return async (input) => {
    const facts = await readTerminalRecordedFacts(pool, input.runId);
    return evaluateTerminalActivations({
      facts,
      completion: input.completion,
      waitingRows: input.waitingRows
    });
  };
}
