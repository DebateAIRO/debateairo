import type { WayOfKnowing } from "@debateai/kernel";
import { TypedDomainError } from "@debateai/kernel";

/**
 * T9 — the synthesis serve chain (goal-v4 222-270; rulings S6-1..S6-4,
 * confirm-items 1 and 2).
 *
 * Three things live here, in the order the goal states them.
 *
 * 1. DIGEST. A deterministic ALL-NODE schema. One entry per materialized node,
 *    always. The byte budget governs SUMMARY LENGTH per node and never
 *    membership, so a decisive node that is neither a root nor one of the two
 *    surviving objections still reaches the synthesizer. The top-2 surviving
 *    objections and the runner-up positions are EMPHASIS fields laid OVER that
 *    total membership (S6-2) — they select what to stress, never what to send.
 * 2. ROLES. SYNTHESIZER and EVALUATOR are named provider roles whose refs are
 *    read from T16's sealed rows (J8). Each call is fresh-context: the recorded
 *    request carries the named artifacts and NOTHING else — no debate
 *    transcript, no provider history. Initial and retry requests are
 *    DISTINGUISHED, so the loop converges by feedback and never by accident.
 * 3. LOOP. At most `evaluatorLoopMaxRounds` rounds (the sealed register row —
 *    never a code constant) or evaluator satisfied, whichever comes first.
 *    After the last round the statement is SERVED regardless, and a standing
 *    objection rides it as a visible condition mark (confirm-items 2-3).
 *
 * Nothing in this file returns a terminal. The chain in `./index.ts` owns the
 * terminal; this file owns the digest, the request shapes and the loop record.
 */

/* ------------------------------------------------------------------ digest */

/** One materialized node, as the digest's source hands it over. */
export interface DigestSourceNode {
  readonly nodeId: string;
  /** The node's statement in full. The digest summarises it; it never drops it. */
  readonly statement: string;
  /**
   * The propagated final strength, or `null` for a node the propagation run
   * produced no strength for (a hidden or excluded node). `null` is a real
   * value here, never a zero: a node with no number is still a MEMBER of the
   * digest, because membership is what the byte budget may not touch.
   */
  readonly finalStrength: number | null;
  readonly wayOfKnowing: WayOfKnowing;
  readonly marks: readonly string[];
  readonly polarityRelations: readonly DigestPolarityRelation[];
  /** True for a node that is a served-root candidate (a maker position). */
  readonly isPosition: boolean;
  /** True for an objection that survived to the end of the debate. */
  readonly isSurvivingObjection: boolean;
}

export interface DigestPolarityRelation {
  readonly polarity: "support" | "attack";
  readonly targetNodeId: string;
}

/** One digest entry. Every field except `statementSummary` is verbatim. */
export interface DigestNodeEntry {
  readonly nodeId: string;
  readonly statementSummary: string;
  /** True when the summary is shorter than the statement it stands for. */
  readonly summaryTruncated: boolean;
  readonly finalStrength: number | null;
  readonly wayOfKnowing: WayOfKnowing;
  readonly marks: readonly string[];
  readonly polarityRelations: readonly DigestPolarityRelation[];
}

/**
 * S6-2: emphasis over total membership. These node ids are ALSO present in
 * `nodes` — this field says which of them to stress, never which to send.
 */
export interface DigestEmphasis {
  readonly topSurvivingObjectionNodeIds: readonly string[];
  readonly runnerUpPositionNodeIds: readonly string[];
}

export interface SynthesisDigest {
  /** Total membership: one entry per materialized node, at every compression level. */
  readonly nodes: readonly DigestNodeEntry[];
  readonly emphasis: DigestEmphasis;
  /** Index into `DIGEST_COMPRESSION_LEVELS`; 0 = no compression applied. */
  readonly compressionLevel: number;
  readonly summaryCharacterCap: number | null;
  readonly byteSize: number;
}

/**
 * The per-node summary caps the digest tightens through, widest first. `null`
 * is "the statement verbatim". The LAST entry is maximum compression: if the
 * digest still exceeds the budget there, the digest CANNOT EXIST and the
 * outcome is loud — never a silent subset of the membership.
 */
export const DIGEST_COMPRESSION_LEVELS: readonly (number | null)[] =
  Object.freeze([null, 480, 240, 120, 60, 24]);

/** How many surviving objections the emphasis field carries (S6-2: top-2). */
export const DIGEST_EMPHASIS_OBJECTION_COUNT = 2;

/** The mark a digest that had to be tightened to fit the budget rides on. */
export const DIGEST_COMPRESSED_MARK = "DIGEST-COMPRESSED" as const;

/** The mark the digest-cannot-exist crash class rides on. */
export const DIGEST_CANNOT_EXIST_MARK = "DIGEST-CANNOT-EXIST" as const;

/** F4 / J25: the envelope terminal fired with the R9 restatement FAILING. */
export const PROTECTED_CORE_GUARD_RETIRED_MARK = "PROTECTED-CORE-GUARD-RETIRED" as const;

/** The mark a served statement carrying an unsatisfied objection rides on. */
export const SYNTHESIS_OBJECTION_STANDING_MARK = "SYNTHESIS-OBJECTION-STANDING" as const;

export type DigestOutcome =
  | { readonly kind: "DIGEST"; readonly digest: SynthesisDigest; readonly marks: readonly string[] }
  | {
      readonly kind: "DIGEST_CANNOT_EXIST";
      readonly byteSizeAtMaxCompression: number;
      readonly budgetBound: number;
      readonly marks: readonly string[];
    };

function summarise(statement: string, cap: number | null): { text: string; truncated: boolean } {
  if (cap === null || statement.length <= cap) return { text: statement, truncated: false };
  // Provenance-preserving: the summary says it is one, so a reader of the
  // digest can never mistake a shortened statement for the whole statement.
  const ellipsis = "…";
  return { text: `${statement.slice(0, Math.max(0, cap - ellipsis.length))}${ellipsis}`, truncated: true };
}

function compressAt(
  nodes: readonly DigestSourceNode[],
  emphasis: DigestEmphasis,
  levelIndex: number
): SynthesisDigest {
  const cap = DIGEST_COMPRESSION_LEVELS[levelIndex] ?? null;
  const entries: DigestNodeEntry[] = nodes.map((node) => {
    const summary = summarise(node.statement, cap);
    return Object.freeze({
      nodeId: node.nodeId,
      statementSummary: summary.text,
      summaryTruncated: summary.truncated,
      finalStrength: node.finalStrength,
      wayOfKnowing: node.wayOfKnowing,
      marks: Object.freeze([...node.marks]),
      polarityRelations: Object.freeze(node.polarityRelations.map((relation) => Object.freeze({ ...relation })))
    });
  });
  const shape = {
    nodes: entries,
    emphasis,
    compressionLevel: levelIndex,
    summaryCharacterCap: cap
  };
  return Object.freeze({
    ...shape,
    nodes: Object.freeze(entries),
    byteSize: Buffer.byteLength(JSON.stringify(shape), "utf8")
  });
}

/**
 * Emphasis selection. Deterministic: strongest first, node id breaks a tie —
 * the same total order T10 uses for the served root, for the same reason
 * (configuration order must not be able to change what the synthesizer is
 * told to stress).
 */
function selectEmphasis(
  nodes: readonly DigestSourceNode[],
  servedRootNodeId: string
): DigestEmphasis {
  const byStrengthThenId = (
    left: DigestSourceNode,
    right: DigestSourceNode
  ): number => (right.finalStrength ?? -1) - (left.finalStrength ?? -1)
    || left.nodeId.localeCompare(right.nodeId);
  return Object.freeze({
    topSurvivingObjectionNodeIds: Object.freeze(
      nodes.filter((node) => node.isSurvivingObjection)
        .sort(byStrengthThenId)
        .slice(0, DIGEST_EMPHASIS_OBJECTION_COUNT)
        .map((node) => node.nodeId)
    ),
    runnerUpPositionNodeIds: Object.freeze(
      nodes.filter((node) => node.isPosition && node.nodeId !== servedRootNodeId)
        .sort(byStrengthThenId)
        .map((node) => node.nodeId)
    )
  });
}

/**
 * Build the digest for a byte budget.
 *
 * The budget tightens SUMMARIES. Membership is invariant: `digest.nodes` has
 * one entry per input node at every compression level, including the one that
 * finally fits. If the widest-fitting level is not level 0 the caller is told
 * to serve WITH the compression mark; if even maximum compression exceeds the
 * budget the outcome is DIGEST_CANNOT_EXIST — loud, with its enumerated crash
 * class and mark, never a subset of the nodes.
 */
export function buildSynthesisDigest(input: {
  readonly nodes: readonly DigestSourceNode[];
  readonly servedRootNodeId: string;
  readonly budgetBound: number;
}): DigestOutcome {
  if (input.nodes.length === 0) {
    throw new TypedDomainError("DIGEST_NODE_SET_EMPTY", "A digest requires at least one materialized node");
  }
  const seen = new Set(input.nodes.map((node) => node.nodeId));
  if (seen.size !== input.nodes.length) {
    throw new TypedDomainError("DIGEST_NODE_IDS_NOT_UNIQUE", "A materialized node appears twice in the digest source");
  }
  if (!seen.has(input.servedRootNodeId)) {
    throw new TypedDomainError("DIGEST_SERVED_ROOT_ABSENT", input.servedRootNodeId);
  }
  if (!Number.isFinite(input.budgetBound) || input.budgetBound < 0) {
    throw new TypedDomainError("COMPOSITION_BUDGET_UNRESOLVED", "A V-ratified composition budget is required");
  }
  const emphasis = selectEmphasis(input.nodes, input.servedRootNodeId);
  let tightest = compressAt(input.nodes, emphasis, 0);
  for (let level = 0; level < DIGEST_COMPRESSION_LEVELS.length; level += 1) {
    tightest = compressAt(input.nodes, emphasis, level);
    if (tightest.byteSize <= input.budgetBound) {
      return Object.freeze({
        kind: "DIGEST" as const,
        digest: tightest,
        marks: Object.freeze(level === 0 ? [] : [DIGEST_COMPRESSED_MARK])
      });
    }
  }
  return Object.freeze({
    kind: "DIGEST_CANNOT_EXIST" as const,
    byteSizeAtMaxCompression: tightest.byteSize,
    budgetBound: input.budgetBound,
    marks: Object.freeze([DIGEST_CANNOT_EXIST_MARK])
  });
}

/* ------------------------------------------------------------------- roles */

/** The code-derived label and numbers every synthesis request carries (T10/T11). */
export interface SynthesisCodeLabel {
  readonly verdictLabel: string;
  readonly servedNodeId: string;
  readonly servedStrength: number;
  readonly margin: number | null;
  readonly registerVersion: number;
}

/** The T16 rows this loop reads. No value below is ever a code constant (J8). */
export interface SynthesisLoopControls {
  readonly synthesizerRoleRef: string;
  readonly evaluatorRoleRef: string;
  readonly evaluatorLoopMaxRounds: number;
}

export const SYNTHESIZER_INSTRUCTIONS =
  "Write the served statement from the digest below. Every load-bearing claim must trace to a "
  + "digest node. Do not overstate the evidence, and state the losing positions fairly.";

export const EVALUATOR_INSTRUCTIONS =
  "Judge the candidate statement against the digest and the code label. Check fairness to the "
  + "losing positions, agreement between the statement and the code label, and overstatement. "
  + "Return an objection whenever you are not satisfied.";

/**
 * The synthesizer's recorded request. The key set IS the fresh-context
 * assertion: these are the named artifacts and there is nothing else to carry
 * a debate transcript or a provider history in.
 */
export type SynthesizerRequest =
  | {
      readonly role: "SYNTHESIZER";
      readonly stage: "INITIAL";
      readonly roleRef: string;
      readonly round: number;
      readonly instructions: string;
      readonly digest: SynthesisDigest;
      readonly codeLabel: SynthesisCodeLabel;
    }
  | {
      readonly role: "SYNTHESIZER";
      readonly stage: "RETRY";
      readonly roleRef: string;
      readonly round: number;
      readonly instructions: string;
      readonly digest: SynthesisDigest;
      readonly codeLabel: SynthesisCodeLabel;
      /** The prior evaluator objection, VERBATIM. Never paraphrased or truncated. */
      readonly priorObjection: string;
      readonly priorCandidateRef: string;
    };

/**
 * THE ONE call-site key builder, used by BOTH the runner that RECORDS the call
 * and the persistence that VERIFIES it (codex r4 B1).
 *
 * Before this, the runner built these keys with two template literals and
 * persistence accepted whatever the caller supplied, checking only that the key
 * ended in `:<round>`. A real round-1 SYNTHESIZER artifact offered as the
 * round's verdict therefore passed both the suffix check and the ledger lookup,
 * and a synthesizer response committed as the evaluator verdict.
 *
 * Deriving the EXPECTED key here, from the typed role and the round's own
 * fields, makes the role a PREDICATE. It also makes a future format change fail
 * closed: the runner and the verifier move together or not at all, because
 * there is only one place the format exists.
 *
 * The two prefixes are load-bearing beyond this module and are NOT free to
 * rename: `core.read_terminal_recorded_facts` (migrations/0049) counts
 * `COMPOSER:%` into `composer_calls` and `POST_COMPOSE_R9:%` into `r9_calls`,
 * which battery-row predicates read.
 */
export type SynthesisCallSiteBinding =
  | { readonly role: "SYNTHESIZER"; readonly stage: "INITIAL" | "RETRY"; readonly round: number }
  | { readonly role: "EVALUATOR"; readonly round: number };

export function synthesisCallSiteKey(binding: SynthesisCallSiteBinding): string {
  if (!Number.isInteger(binding.round) || binding.round < 1) {
    throw new TypedDomainError(
      "SYNTHESIS_ROUND_ARTIFACT_UNRESOLVED",
      `A synthesis call site needs a positive integer round, not ${String(binding.round)}`
    );
  }
  return binding.role === "SYNTHESIZER"
    ? `COMPOSER:SYNTHESIZER:${binding.stage}:${binding.round}`
    : `POST_COMPOSE_R9:EVALUATOR:${binding.round}`;
}

export interface EvaluatorRequest {
  readonly role: "EVALUATOR";
  readonly roleRef: string;
  readonly round: number;
  readonly instructions: string;
  readonly digest: SynthesisDigest;
  readonly codeLabel: SynthesisCodeLabel;
  readonly candidateStatement: string;
}

/** The named artifacts a fresh-context request may contain, and no others. */
export const SYNTHESIZER_INITIAL_REQUEST_KEYS: readonly string[] =
  Object.freeze(["role", "stage", "roleRef", "round", "instructions", "digest", "codeLabel"]);
export const SYNTHESIZER_RETRY_REQUEST_KEYS: readonly string[] =
  Object.freeze([...SYNTHESIZER_INITIAL_REQUEST_KEYS, "priorObjection", "priorCandidateRef"]);
export const EVALUATOR_REQUEST_KEYS: readonly string[] =
  Object.freeze(["role", "roleRef", "round", "instructions", "digest", "codeLabel", "candidateStatement"]);

/**
 * The fresh-context assertion, stated as the goal states it: each recorded
 * request contains NO debate transcript or provider history BEYOND the named
 * artifacts — never the absence of an artifact the role needs. So this checks
 * the key set exactly, in both directions: an extra key is a leak, a missing
 * key is a starved role, and both are loud.
 */
export function assertFreshContextRequest(
  request: SynthesizerRequest | EvaluatorRequest
): void {
  const expected = request.role === "EVALUATOR"
    ? EVALUATOR_REQUEST_KEYS
    : request.stage === "RETRY" ? SYNTHESIZER_RETRY_REQUEST_KEYS : SYNTHESIZER_INITIAL_REQUEST_KEYS;
  const actual = Object.keys(request).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) {
    throw new TypedDomainError(
      "SYNTHESIS_REQUEST_NOT_FRESH_CONTEXT",
      `${request.role} request keys ${actual.join(",")} are not exactly ${wanted.join(",")}`
    );
  }
}

export function buildSynthesizerRequest(input: {
  readonly controls: SynthesisLoopControls;
  readonly round: number;
  readonly digest: SynthesisDigest;
  readonly codeLabel: SynthesisCodeLabel;
  readonly prior: { readonly objection: string; readonly candidateRef: string } | null;
}): SynthesizerRequest {
  const base = {
    role: "SYNTHESIZER" as const,
    roleRef: input.controls.synthesizerRoleRef,
    round: input.round,
    instructions: SYNTHESIZER_INSTRUCTIONS,
    digest: input.digest,
    codeLabel: input.codeLabel
  };
  const request: SynthesizerRequest = input.prior === null
    ? Object.freeze({ ...base, stage: "INITIAL" as const })
    : Object.freeze({
        ...base,
        stage: "RETRY" as const,
        priorObjection: input.prior.objection,
        priorCandidateRef: input.prior.candidateRef
      });
  assertFreshContextRequest(request);
  return request;
}

export function buildEvaluatorRequest(input: {
  readonly controls: SynthesisLoopControls;
  readonly round: number;
  readonly digest: SynthesisDigest;
  readonly codeLabel: SynthesisCodeLabel;
  readonly candidateStatement: string;
}): EvaluatorRequest {
  const request: EvaluatorRequest = Object.freeze({
    role: "EVALUATOR" as const,
    roleRef: input.controls.evaluatorRoleRef,
    round: input.round,
    instructions: EVALUATOR_INSTRUCTIONS,
    digest: input.digest,
    codeLabel: input.codeLabel,
    candidateStatement: input.candidateStatement
  });
  assertFreshContextRequest(request);
  return request;
}

/* -------------------------------------------------------------------- loop */

/**
 * What the evaluator checked. `citationTracing` is the re-routed conformance
 * gate: every load-bearing claim traces to a digest node. `restatement` is the
 * re-routed R9 limb — pre-compose and post-compose alike. None of them is a
 * terminal any more; each is an OBJECTION CRITERION.
 */
export interface EvaluatorCriteria {
  readonly fairnessToLosers: boolean;
  readonly statementLabelAgreement: boolean;
  readonly noOverstatement: boolean;
  readonly restatement: boolean;
  readonly citationTracing: boolean;
}

export const EVALUATOR_CRITERIA_KEYS: readonly (keyof EvaluatorCriteria)[] = Object.freeze([
  "fairnessToLosers",
  "statementLabelAgreement",
  "noOverstatement",
  "restatement",
  "citationTracing"
]);

export interface EvaluatorVerdict {
  readonly satisfied: boolean;
  /** Required whenever `satisfied` is false; forbidden when it is true. */
  readonly objection: string | null;
  readonly criteria: EvaluatorCriteria;
}

export function assertEvaluatorVerdict(verdict: EvaluatorVerdict): EvaluatorVerdict {
  const allPass = EVALUATOR_CRITERIA_KEYS.every((key) => verdict.criteria[key]);
  if (verdict.satisfied !== allPass) {
    throw new TypedDomainError(
      "EVALUATOR_VERDICT_INCOHERENT",
      `satisfied=${String(verdict.satisfied)} disagrees with its own criteria`
    );
  }
  if (verdict.satisfied && verdict.objection !== null) {
    throw new TypedDomainError("EVALUATOR_VERDICT_INCOHERENT", "A satisfied evaluator raises no objection");
  }
  if (!verdict.satisfied && (verdict.objection ?? "").trim().length === 0) {
    throw new TypedDomainError(
      "EVALUATOR_OBJECTION_MISSING",
      "An unsatisfied evaluator must state the objection the next round answers verbatim"
    );
  }
  return verdict;
}

/** One loop round, persisted whole (goal DoD: "loop-round records"). */
export interface SynthesisLoopRound {
  readonly round: number;
  readonly synthesizerRequest: SynthesizerRequest;
  readonly candidateRef: string;
  readonly candidateStatement: string;
  readonly evaluatorRequest: EvaluatorRequest;
  readonly verdict: EvaluatorVerdict;
  /** The `ledger.raw_artifact` id of the evaluator call for this round. */
  readonly verdictRef: string;
  readonly candidateCallSiteKey: string;
  readonly verdictCallSiteKey: string;
}

export interface SynthesisLoopOutcome<TCandidate> {
  readonly candidate: TCandidate;
  readonly candidateStatement: string;
  readonly rounds: readonly SynthesisLoopRound[];
  /** The objection still standing when the loop ended, or null. */
  readonly standingObjection: string | null;
  /** `[SYNTHESIS-OBJECTION-STANDING]` when an objection stands, else empty. */
  readonly marks: readonly string[];
}

/**
 * What one synthesizer call produced: the candidate itself and the RECORDED
 * artifact reference for it.
 *
 * `candidateRef` must resolve to the artifact the provider call actually
 * recorded. The first filing fabricated `candidate:round-N` here — a string
 * that resembles an identifier and dereferences to nothing, so a retry's
 * `priorCandidateRef` pointed at no artifact at all (codex r1 B2). Making the
 * reference part of the synthesizer's OWN result is what removes the seam a
 * label could be invented in: the loop has no way to name a candidate the
 * adapter did not record.
 */
export interface SynthesizedCandidate<TCandidate> {
  readonly candidate: TCandidate;
  /**
   * The `ledger.raw_artifact` id of the call that produced this candidate.
   * codex r2 B2: a TYPED KEY, not a label — persistence stores it as a uuid
   * foreign key and proves it belongs to this run before committing.
   */
  readonly candidateRef: string;
  /**
   * The call-site key the synthesizer call was recorded under. codex r3 B2: a
   * reference that only proves "some artifact in this run" is not a producer
   * binding — an unrelated JUDGE artifact from the same run satisfied it. The
   * call site is what the ledger uses to tell producers apart, so it travels
   * with the reference and `persist` resolves the pair against the ledger.
   */
  readonly candidateCallSiteKey: string;
}

/** The evaluator's verdict together with the artifact its call recorded. */
export interface EvaluatedCandidate {
  readonly verdict: EvaluatorVerdict;
  /** The `ledger.raw_artifact` id of the evaluator call. */
  readonly verdictRef: string;
  /** The call-site key the evaluator call was recorded under. */
  readonly verdictCallSiteKey: string;
}

export interface SynthesisLoopDependencies<TCandidate> {
  readonly synthesize: (request: SynthesizerRequest) => Promise<SynthesizedCandidate<TCandidate>>;
  readonly evaluate: (request: EvaluatorRequest) => Promise<EvaluatedCandidate>;
  /** The statement text the evaluator judges, read off the synthesizer's output. */
  readonly readCandidateStatement: (candidate: TCandidate) => string;
}

/**
 * ≤ `evaluatorLoopMaxRounds` rounds, or evaluator satisfied — whichever comes
 * first. After the last round the statement is SERVED regardless: the loop
 * never returns "no answer", it returns the last candidate plus whatever
 * objection is still standing, and the caller serves it WITH the mark.
 */
export async function runSynthesisLoop<TCandidate>(
  input: {
    readonly controls: SynthesisLoopControls;
    readonly digest: SynthesisDigest;
    readonly codeLabel: SynthesisCodeLabel;
  },
  dependencies: SynthesisLoopDependencies<TCandidate>
): Promise<SynthesisLoopOutcome<TCandidate>> {
  const maxRounds = input.controls.evaluatorLoopMaxRounds;
  if (!Number.isInteger(maxRounds) || maxRounds < 1) {
    throw new TypedDomainError(
      "SYNTHESIS_ROLE_CONTROLS_UNRESOLVED",
      "The evaluator loop bound is a sealed T16 register row and is never invented"
    );
  }
  const rounds: SynthesisLoopRound[] = [];
  let prior: { objection: string; candidateRef: string } | null = null;
  let candidate: TCandidate | null = null;
  let candidateStatement = "";
  for (let round = 1; round <= maxRounds; round += 1) {
    const synthesizerRequest = buildSynthesizerRequest({
      controls: input.controls,
      round,
      digest: input.digest,
      codeLabel: input.codeLabel,
      prior
    });
    const synthesized = await dependencies.synthesize(synthesizerRequest);
    candidate = synthesized.candidate;
    const candidateRef = synthesized.candidateRef;
    if (candidateRef.trim().length === 0) {
      throw new TypedDomainError(
        "SYNTHESIS_CANDIDATE_REF_MISSING",
        "A round's candidate must carry the reference of the artifact the provider call recorded"
      );
    }
    candidateStatement = dependencies.readCandidateStatement(candidate);
    const evaluatorRequest = buildEvaluatorRequest({
      controls: input.controls,
      round,
      digest: input.digest,
      codeLabel: input.codeLabel,
      candidateStatement
    });
    const evaluated = await dependencies.evaluate(evaluatorRequest);
    const verdict = assertEvaluatorVerdict(evaluated.verdict);
    if (evaluated.verdictRef.trim().length === 0) {
      throw new TypedDomainError(
        "SYNTHESIS_CANDIDATE_REF_MISSING",
        "A round's verdict must carry the reference of the artifact the evaluator call recorded"
      );
    }
    rounds.push(Object.freeze({
      round,
      synthesizerRequest,
      candidateRef,
      candidateStatement,
      evaluatorRequest,
      verdict,
      verdictRef: evaluated.verdictRef,
      candidateCallSiteKey: synthesized.candidateCallSiteKey,
      verdictCallSiteKey: evaluated.verdictCallSiteKey
    }));
    if (verdict.satisfied) {
      prior = null;
      break;
    }
    prior = { objection: verdict.objection!, candidateRef };
  }
  if (candidate === null) {
    throw new TypedDomainError("SYNTHESIS_LOOP_PRODUCED_NO_CANDIDATE", "The loop bound admitted no round");
  }
  const standingObjection = rounds.at(-1)?.verdict.satisfied === true
    ? null
    : rounds.at(-1)?.verdict.objection ?? null;
  return Object.freeze({
    candidate,
    candidateStatement,
    rounds: Object.freeze(rounds),
    standingObjection,
    marks: Object.freeze(standingObjection === null ? [] : [SYNTHESIS_OBJECTION_STANDING_MARK])
  });
}
