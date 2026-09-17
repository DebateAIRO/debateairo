import type { Pool } from "pg";
import type { Answer } from "@debateai/contract";
import { SYNTHESIS_OBJECTION_STANDING_MARK } from "@debateai/serve";

/**
 * The Global definition of done, read off a settled run and printed by the
 * acceptance ceremony
 * (`.hermes/reports/2026-09-01-algorithm-live-loop/slices/S12-closure/SPEC.md:36-40`):
 *
 *   Full multi-maker acceptance run (M>=2, depth>=2) completes with: panel-reduced
 *   tau (non-self-graded), measured edges, at least one root's final strength != tau,
 *   an adaptive stop or ceiling recorded, a synthesizer verdict statement
 *   acknowledging the strongest surviving objection, an evaluator loop record
 *   (<=3 rounds), a code-derived three-state label, a band counted over cited
 *   nodes, AND envelope state WITHIN at terminal.
 *
 * The algorithm computes and persists every one of these. Until this module
 * existed the ceremony's report wrote down only sub-clauses 4 and 9, so a
 * closing run's log could not evidence the clause it was run to prove
 * (W12 closure audit 2026-09-16, section 2.3: 1, 3, 5, 6, 7, 8 absent, 2
 * partial). This reads the six absent facts and completes the partial one.
 *
 * TWO KINDS OF BAD NEWS, AND ONLY ONE OF THEM THROWS.
 *
 * A SHAPE violation means the run cannot be read at all — a node with no
 * judgement, rounds numbered other than 1..n, more rounds than the register
 * sealed, a label that is neither a state nor an unavailability reason. Those
 * are typed refusals in the style of ACCEPTANCE_TERMINAL_ENVELOPE_STATE_INVALID.
 *
 * A DoD OUTCOME means the run is readable and the answer is no: no root whose
 * final strength left its tau, an objection still standing, a single-voice
 * panel, an UNKNOWN edge magnitude, no surviving objection. Those are REPORTED,
 * never thrown. The judge of a closing run decides what they mean; a reader
 * that threw would decide for them and would destroy the very evidence the
 * report exists to carry.
 *
 * NO DEBATE CONTENT crosses this boundary. Ids, numbers, booleans, condition
 * marks and register row keys only — never a claim, a statement, a reason or an
 * objection's text. The printed lines go verbatim into
 * `logs/closing-run/ceremony-*.log`.
 */

/**
 * The stable leading token of each printed line, in printed order. Sub-clauses
 * 4 (the ceiling/envelope arm) and 9 (envelope WITHIN at terminal) are already
 * printed by the ceremony itself and keep their own `T17` token.
 *
 * Nothing greps these today; they are the vocabulary the W12 judge and the
 * closure audit read. They are unique, and they are fixed from here on — a
 * token that moves silently invalidates every log captured before it moved.
 * Documented in `acceptance/README.md` beside the paragraph on what the
 * ceremony prints.
 */
export const DEFINITION_OF_DONE_TOKENS = Object.freeze({
  panelReducedTau: "DOD-1 panel-reduced-tau",
  measuredEdges: "DOD-2 measured-edges",
  rootFinalVersusTau: "DOD-3 root-final-vs-tau",
  survivingObjection: "DOD-5 surviving-objection",
  evaluatorLoop: "DOD-6 evaluator-loop",
  verdictLabel: "DOD-7 verdict-label",
  confidenceBand: "DOD-8 confidence-band"
} as const);

/* ------------------------------------------------------- the shape refusals */

/** A node the run judged nothing for: there is no tau to report. */
export const ACCEPTANCE_DOD_NODE_TAU_MISSING = "ACCEPTANCE_DOD_NODE_TAU_MISSING";
/** Loop rounds that are not numbered 1..n in order. */
export const ACCEPTANCE_DOD_LOOP_ROUND_NUMBERING_INVALID = "ACCEPTANCE_DOD_LOOP_ROUND_NUMBERING_INVALID";
/** More rounds recorded than the register sealed as the bound. */
export const ACCEPTANCE_DOD_LOOP_ROUNDS_ABOVE_BOUND = "ACCEPTANCE_DOD_LOOP_ROUNDS_ABOVE_BOUND";
/** Neither a three-state label nor an unavailability reason ref — or both. */
export const ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID = "ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID";

/* -------------------------------------------------------------- the inputs */

export type SynthesizerStage = "INITIAL" | "RETRY";
export type VerdictState = "SUPPORTED" | "CONTESTED" | "UNSUPPORTED";
export type AnswerTerminal = "SERVED" | "DOWNGRADED" | "BLOCKED" | "COMPONENTS_ONLY";
export type AnswerServeState = "COMPOSED" | "RECOMPOSED_ONCE" | "COMPONENTS_ONLY";
export type EdgeMagnitudeStatus = "MEASURED" | "UNKNOWN";

/**
 * The panel that produced a node's tau, as the runner wrote it onto
 * `ledger.reduced_judgement.disagreement.panel` (apps/runner/src/index.ts:2727-2739).
 * `null` is the M=1 skeleton path, which selects the author's own judgement and
 * records an unmeasured disagreement carrying no panel at all: one voice, none
 * of them a non-author's — self-graded.
 */
export interface DefinitionOfDonePanelInput {
  readonly voiceCount: number;
  readonly nonAuthorVoiceCount: number;
}

export interface DefinitionOfDoneNodeInput {
  readonly nodeId: string;
  /** `core.node.depth`; 0 is a root. */
  readonly depth: number;
  /** `ledger.reduced_judgement.tau`, latest by `at_seq`. */
  readonly tau: number | null;
  /** The latest propagation run's `ledger.node_strength_record.strength`. */
  readonly finalStrength: number | null;
  readonly panel: DefinitionOfDonePanelInput | null;
}

export interface DefinitionOfDoneEdgeInput {
  readonly sourceNodeId: string;
  /** `core.edge.polarity`; `attack` is the arrow the clause counts. */
  readonly polarity: string;
  readonly magnitudeStatus: EdgeMagnitudeStatus;
}

export interface DefinitionOfDoneRoundInput {
  readonly round: number;
  readonly synthesizerStage: SynthesizerStage;
  readonly evaluatorSatisfied: boolean;
}

export interface DefinitionOfDoneBandInput {
  readonly basis: DefinitionOfDoneBandBasis;
  readonly registerRowKey: string;
}

export interface DefinitionOfDoneBandBasis {
  readonly LOOKED_UP: number;
  readonly RAN: number;
  readonly REASONING: number;
}

export interface DefinitionOfDoneFactsInput {
  readonly nodes: readonly DefinitionOfDoneNodeInput[];
  readonly edges: readonly DefinitionOfDoneEdgeInput[];
  readonly loopRounds: readonly DefinitionOfDoneRoundInput[];
  /** The sealed `evaluatorLoopMaxRounds` register row, handed in by its reader. */
  readonly sealedEvaluatorLoopMaxRounds: number;
  readonly conditionMarks: readonly string[];
  readonly verdictState: VerdictState | null;
  readonly verdictUnavailableReasonRef: string | null;
  readonly terminal: AnswerTerminal;
  readonly serveState: AnswerServeState;
  readonly confidenceBand: string | null;
  readonly bandCeiling: DefinitionOfDoneBandInput | null;
}

/* ------------------------------------------------------------- the outputs */

export interface DefinitionOfDoneNodeFact {
  readonly nodeId: string;
  readonly tau: number;
  readonly voiceCount: number;
  readonly nonAuthorVoiceCount: number;
  readonly singleVoicePanel: boolean;
}

export interface DefinitionOfDoneRootFact {
  readonly nodeId: string;
  readonly tau: number;
  readonly finalStrength: number | null;
  readonly finalDiffersFromTau: boolean;
}

export interface DefinitionOfDoneObjectionFact {
  readonly nodeId: string;
  readonly finalStrength: number;
}

export interface DefinitionOfDoneRoundFact {
  readonly round: number;
  readonly synthesizerStage: SynthesizerStage;
  readonly evaluatorSatisfied: boolean;
}

export interface DefinitionOfDoneFacts {
  /* (1) panel-reduced tau, non-self-graded */
  readonly panelNodes: readonly DefinitionOfDoneNodeFact[];
  readonly everyNodeHasNonAuthorVoice: boolean;
  readonly singleVoicePanelNodeIds: readonly string[];
  /* (2) measured edges */
  readonly attackEdgeCount: number;
  readonly attackEdgePresentMagnitudeCount: number;
  /* (3) at least one root's final strength != tau */
  readonly roots: readonly DefinitionOfDoneRootFact[];
  readonly aRootFinalDiffersFromTau: boolean;
  readonly rootFinalDiffersWitnessNodeId: string | null;
  /* (5) the statement acknowledging the strongest surviving objection */
  readonly strongestSurvivingObjection: DefinitionOfDoneObjectionFact | null;
  readonly finalRoundSatisfied: boolean;
  readonly objectionStandingMarkPresent: boolean;
  /* (6) the evaluator loop record */
  readonly loopRounds: readonly DefinitionOfDoneRoundFact[];
  readonly loopRoundCount: number;
  readonly sealedEvaluatorLoopMaxRounds: number;
  /* (7) the code-derived three-state label */
  readonly verdictState: VerdictState | null;
  readonly verdictUnavailableReasonRef: string | null;
  readonly terminal: AnswerTerminal;
  readonly serveState: AnswerServeState;
  /* (8) the band counted over cited nodes */
  readonly confidenceBand: string | null;
  readonly bandBasis: DefinitionOfDoneBandBasis | null;
  readonly bandCeilingRegisterRowKey: string | null;
}

/* ---------------------------------------------------------- the derivation */

/**
 * Strongest first, node id breaking a tie — the SAME total order the digest's
 * emphasis selection uses (`packages/serve/src/synthesis.ts:186-190`), so the
 * objection this report names is the one the synthesizer was told to stress.
 */
function byStrengthThenId(
  left: DefinitionOfDoneObjectionFact,
  right: DefinitionOfDoneObjectionFact
): number {
  return right.finalStrength - left.finalStrength || left.nodeId.localeCompare(right.nodeId);
}

export function deriveDefinitionOfDoneFacts(input: DefinitionOfDoneFactsInput): DefinitionOfDoneFacts {
  const panelNodes = input.nodes.map((node) => {
    if (node.tau === null) {
      throw new Error(`${ACCEPTANCE_DOD_NODE_TAU_MISSING}:${node.nodeId}`);
    }
    // A panel-less judgement is the M=1 skeleton selecting the author's own
    // number: one voice, zero of them non-author. Reported, never thrown.
    const voiceCount = node.panel?.voiceCount ?? 1;
    const nonAuthorVoiceCount = node.panel?.nonAuthorVoiceCount ?? 0;
    return Object.freeze({
      nodeId: node.nodeId,
      tau: node.tau,
      voiceCount,
      nonAuthorVoiceCount,
      singleVoicePanel: nonAuthorVoiceCount === 0
    });
  });
  const singleVoicePanelNodeIds = panelNodes
    .filter((node) => node.singleVoicePanel)
    .map((node) => node.nodeId)
    .sort();

  const attackEdges = input.edges.filter((edge) => edge.polarity === "attack");

  const roots = input.nodes
    .filter((node) => node.depth === 0)
    .map((node) => Object.freeze({
      nodeId: node.nodeId,
      // Non-null by construction: the tau refusal above ran over every node.
      tau: node.tau as number,
      finalStrength: node.finalStrength,
      finalDiffersFromTau: node.finalStrength !== null && node.finalStrength !== node.tau
    }));
  const rootFinalDiffersWitnessNodeId = roots
    .filter((root) => root.finalDiffersFromTau)
    .map((root) => root.nodeId)
    .sort()[0] ?? null;

  // A SURVIVING objection: it attacks something AND it still carries a
  // propagated number at the end of the debate
  // (apps/runner/src/index.ts:3925-3928). A node without a number is excluded
  // outright rather than sorted to the back.
  const attackerNodeIds = new Set(attackEdges.map((edge) => edge.sourceNodeId));
  const strongestSurvivingObjection = input.nodes
    .filter((node) => node.finalStrength !== null && attackerNodeIds.has(node.nodeId))
    .map((node) => Object.freeze({ nodeId: node.nodeId, finalStrength: node.finalStrength as number }))
    .sort(byStrengthThenId)[0] ?? null;

  const loopRounds = input.loopRounds.map((round) => Object.freeze({
    round: round.round,
    synthesizerStage: round.synthesizerStage,
    evaluatorSatisfied: round.evaluatorSatisfied
  }));
  if (loopRounds.some((round, index) => round.round !== index + 1)) {
    throw new Error(
      `${ACCEPTANCE_DOD_LOOP_ROUND_NUMBERING_INVALID}:${loopRounds.map((round) => round.round).join(",")}`
    );
  }
  if (loopRounds.length > input.sealedEvaluatorLoopMaxRounds) {
    throw new Error(
      `${ACCEPTANCE_DOD_LOOP_ROUNDS_ABOVE_BOUND}:${loopRounds.length}:${input.sealedEvaluatorLoopMaxRounds}`
    );
  }

  if (input.verdictState === null && input.verdictUnavailableReasonRef === null) {
    throw new Error(`${ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID}:NEITHER`);
  }
  if (input.verdictState !== null && input.verdictUnavailableReasonRef !== null) {
    throw new Error(`${ACCEPTANCE_DOD_VERDICT_LABEL_PROJECTION_INVALID}:BOTH`);
  }

  return Object.freeze({
    panelNodes: Object.freeze(panelNodes),
    everyNodeHasNonAuthorVoice: panelNodes.every((node) => node.nonAuthorVoiceCount >= 1),
    singleVoicePanelNodeIds: Object.freeze(singleVoicePanelNodeIds),
    attackEdgeCount: attackEdges.length,
    attackEdgePresentMagnitudeCount: attackEdges.filter((edge) => edge.magnitudeStatus === "MEASURED").length,
    roots: Object.freeze(roots),
    aRootFinalDiffersFromTau: roots.some((root) => root.finalDiffersFromTau),
    rootFinalDiffersWitnessNodeId,
    strongestSurvivingObjection,
    finalRoundSatisfied: loopRounds.at(-1)?.evaluatorSatisfied ?? false,
    objectionStandingMarkPresent: input.conditionMarks.includes(SYNTHESIS_OBJECTION_STANDING_MARK),
    loopRounds: Object.freeze(loopRounds),
    loopRoundCount: loopRounds.length,
    sealedEvaluatorLoopMaxRounds: input.sealedEvaluatorLoopMaxRounds,
    verdictState: input.verdictState,
    verdictUnavailableReasonRef: input.verdictUnavailableReasonRef,
    terminal: input.terminal,
    serveState: input.serveState,
    confidenceBand: input.confidenceBand,
    bandBasis: input.bandCeiling === null ? null : Object.freeze({ ...input.bandCeiling.basis }),
    bandCeilingRegisterRowKey: input.bandCeiling?.registerRowKey ?? null
  });
}

/* ------------------------------------------------------------ the printing */

const NONE = "none";

/**
 * One line per sub-clause, each led by its documented token. Ids, numbers,
 * booleans, condition marks and register row keys — nothing else.
 */
export function renderDefinitionOfDoneLines(facts: DefinitionOfDoneFacts): readonly string[] {
  const objection = facts.strongestSurvivingObjection;
  return Object.freeze([
    `${DEFINITION_OF_DONE_TOKENS.panelReducedTau}: ${facts.panelNodes.length} node(s)`
    + ` · every tau has a non-author voice: ${String(facts.everyNodeHasNonAuthorVoice)}`
    + ` · single-voice panel node ids: ${facts.singleVoicePanelNodeIds.join(",") || NONE}`,

    `${DEFINITION_OF_DONE_TOKENS.measuredEdges}:`
    + ` ${facts.attackEdgePresentMagnitudeCount}/${facts.attackEdgeCount}`
    + " attack edge(s) carry a PRESENT magnitude",

    `${DEFINITION_OF_DONE_TOKENS.rootFinalVersusTau}: ${facts.roots.length} root(s)`
    + ` · a root's final strength left its tau: ${String(facts.aRootFinalDiffersFromTau)}`
    + ` · witness node id: ${facts.rootFinalDiffersWitnessNodeId ?? NONE}`
    + ` · roots: ${JSON.stringify(facts.roots)}`,

    `${DEFINITION_OF_DONE_TOKENS.survivingObjection}: strongest`
    + ` ${objection === null ? NONE : `${objection.nodeId} @ ${String(objection.finalStrength)}`}`
    + ` · final round satisfied: ${String(facts.finalRoundSatisfied)}`
    + ` · ${SYNTHESIS_OBJECTION_STANDING_MARK}: ${String(facts.objectionStandingMarkPresent)}`,

    `${DEFINITION_OF_DONE_TOKENS.evaluatorLoop}:`
    + ` ${facts.loopRoundCount}/${facts.sealedEvaluatorLoopMaxRounds}`
    + " round(s) within the sealed evaluatorLoopMaxRounds"
    + ` · rounds: ${JSON.stringify(facts.loopRounds)}`,

    `${DEFINITION_OF_DONE_TOKENS.verdictLabel}:`
    + ` ${facts.verdictState ?? `unavailable ${facts.verdictUnavailableReasonRef ?? NONE}`}`
    + ` · terminal ${facts.terminal} · serve state ${facts.serveState}`,

    `${DEFINITION_OF_DONE_TOKENS.confidenceBand}: ${facts.confidenceBand ?? NONE}`
    + ` · basis LOOKED_UP/RAN/REASONING: ${facts.bandBasis === null ? NONE
      : `${facts.bandBasis.LOOKED_UP}/${facts.bandBasis.RAN}/${facts.bandBasis.REASONING}`}`
    + ` · ceiling register row key: ${facts.bandCeilingRegisterRowKey ?? NONE}`
  ]);
}

/* -------------------------------------------------------------- the reader */

export interface DefinitionOfDoneReadRequest {
  readonly runId: string;
  /** The OWNER read of the settled run's answer, parsed through the contract. */
  readonly answer: Answer;
  /** The sealed `evaluatorLoopMaxRounds` row, as this deployment read it. */
  readonly sealedEvaluatorLoopMaxRounds: number;
}

interface NodeRow {
  readonly node_id: string;
  readonly depth: number;
  readonly tau: number | null;
  readonly disagreement: Readonly<Record<string, unknown>> | null;
  readonly strength: number | null;
}

interface EdgeRow {
  readonly source_node_id: string;
  readonly polarity: string;
  readonly magnitude_status: EdgeMagnitudeStatus;
}

interface RoundRow {
  readonly round: number;
  readonly synthesizer_stage: SynthesizerStage;
  readonly evaluator_satisfied: boolean;
}

function readPanel(disagreement: Readonly<Record<string, unknown>> | null): DefinitionOfDonePanelInput | null {
  const panel = disagreement?.["panel"];
  if (panel === undefined || panel === null || typeof panel !== "object") return null;
  const voiceCount = (panel as Record<string, unknown>)["voiceCount"];
  const nonAuthorVoiceCount = (panel as Record<string, unknown>)["nonAuthorVoiceCount"];
  if (typeof voiceCount !== "number" || typeof nonAuthorVoiceCount !== "number") return null;
  return Object.freeze({ voiceCount, nonAuthorVoiceCount });
}

/**
 * Read the facts off the settled run.
 *
 * SOURCE OF RECORD, deliberately: the per-node numbers, the panel record, the
 * arrows and the loop rounds come from SQL over the relations the clause names
 * — `ledger.reduced_judgement`, `ledger.node_strength_record`, `core.edge`,
 * `serve.synthesis_round` — while the label, the terminal, the serve state, the
 * band and the condition marks come from the PARSED ANSWER, which is the
 * projection that derives them. Reading the numbers through the projection
 * instead would make the report evidence that the projection is
 * self-consistent, not that the run computed them.
 *
 * "Latest" is the served definition in both cases: the judgement is the last by
 * `at_seq`, and the strength is the last propagation run's
 * (`packages/serve/src/index.ts:3331-3336`).
 */
export async function readDefinitionOfDoneFacts(
  pool: Pool,
  request: DefinitionOfDoneReadRequest
): Promise<DefinitionOfDoneFacts> {
  const [nodeRows, edgeRows, roundRows] = await Promise.all([
    pool.query<NodeRow>(
      `SELECT node.node_id::text AS node_id, node.depth::int AS depth,
              judgement.tau, judgement.disagreement, strength.strength
       FROM core.node AS node
       LEFT JOIN LATERAL (
         SELECT tau, disagreement FROM ledger.reduced_judgement
         WHERE node_id = node.node_id ORDER BY at_seq DESC LIMIT 1
       ) AS judgement ON true
       LEFT JOIN LATERAL (
         SELECT record.strength FROM ledger.node_strength_record AS record
         JOIN ledger.propagation_run AS propagation
           ON propagation.propagation_run_id = record.propagation_run_id
         WHERE record.node_id = node.node_id ORDER BY propagation.at_seq DESC LIMIT 1
       ) AS strength ON true
       WHERE node.run_id=$1 ORDER BY node.created_at_seq`,
      [request.runId]
    ),
    pool.query<EdgeRow>(
      `SELECT source_node_id::text AS source_node_id, polarity, magnitude_status
       FROM core.edge WHERE run_id=$1 ORDER BY created_at_seq`,
      [request.runId]
    ),
    pool.query<RoundRow>(
      `SELECT round::int AS round, synthesizer_stage, evaluator_satisfied
       FROM serve.synthesis_round WHERE answer_id=$1 AND answer_version=$2 ORDER BY round`,
      [request.answer.answer_id, request.answer.answer_version]
    )
  ]);
  return deriveDefinitionOfDoneFacts({
    nodes: nodeRows.rows.map((row) => Object.freeze({
      nodeId: row.node_id,
      depth: Number(row.depth),
      tau: row.tau === null ? null : Number(row.tau),
      finalStrength: row.strength === null ? null : Number(row.strength),
      panel: readPanel(row.disagreement)
    })),
    edges: edgeRows.rows.map((row) => Object.freeze({
      sourceNodeId: row.source_node_id,
      polarity: row.polarity,
      magnitudeStatus: row.magnitude_status
    })),
    loopRounds: roundRows.rows.map((row) => Object.freeze({
      round: Number(row.round),
      synthesizerStage: row.synthesizer_stage,
      evaluatorSatisfied: row.evaluator_satisfied
    })),
    sealedEvaluatorLoopMaxRounds: request.sealedEvaluatorLoopMaxRounds,
    conditionMarks: request.answer.condition_marks,
    verdictState: request.answer.verdict_state,
    verdictUnavailableReasonRef: request.answer.verdict_unavailable?.reason_ref ?? null,
    terminal: request.answer.terminal,
    serveState: request.answer.serve_state,
    confidenceBand: request.answer.confidence_band,
    bandCeiling: request.answer.band_ceiling === null ? null : Object.freeze({
      basis: request.answer.band_ceiling.basis,
      registerRowKey: request.answer.band_ceiling.register_row_key
    })
  });
}
