/**
 * Preview practice, mode "rescore" (R2, E12; spec §11; INTERFACE §15.3): the free re-scoring, run again on saved debates.
 *
 * Plain words: every transcript.json under --transcripts is read again. First the engine's own arithmetic must give back
 * exactly the numbers it served (no more than 0.000000001 apart); a debate where it does not is listed and not used. Then
 * each debate is scored again with engine 2's honest scores and link rules, with a "cannot assess" link counting at 0.5,
 * 0.66, 0.75 and 1.0, each with the investigations' outcomes applied and not. It says which answer then leads by honest
 * final strength, by how much, and how often the lead changes. The comparing judges are not asked (that needs AI calls).
 * No AI is called, nothing is spent, no database is opened: it runs the runner's own pure functions on what the
 * transcript recorded. An older transcript (before R2) is rebuilt from its answer and its calls, or listed with what it lacks.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { honestGrade, honestMedian, honestPointScore, type EngineReviewStatus, type HonestVoice } from "@debateai/judgement";
import { ENGINE_ANSWER_LETTERS, TypedDomainError, type EngineAnswerLetter } from "@debateai/kernel";
import { evaluate, type EvaluationSnapshot, type SnapshotArrow } from "@debateai/propagation";
import {
  STRUCTURE_REPAIR_CALL_SITE_PREFIX,
  decodeModelJson,
  readPromptFrame,
  structureRepairOriginalKey,
  type PromptPacket,
  type RecordedProviderReply
} from "@debateai/providers";
import { engineReceiptSchema, engineSettingsOf, engineSettingsOfReceipt, type EngineScoring, type EngineSettings } from "@debateai/register";
import { projectJudgedStanding, selectServedRootByStrength } from "@debateai/runner";
import { seatBaseCallSiteKey } from "@debateai/serve";
import { engineInvestigatedStatuses } from "../../apps/runner/src/engine-investigations.js";
import { engineLinkedGraph } from "../../apps/runner/src/engine-links.js";
import { parsePracticeEnginePolicyText } from "./practice-engine.js";
import {
  panelKeyPrefixOf,
  practiceAcceptedJudgeReading,
  rootIndexOfAuthorKey,
  type TranscriptEngineEdge,
  type TranscriptEngineGraph,
  type TranscriptEngineNode,
  type TranscriptEngineReview,
  type TranscriptEngineVoice
} from "./practice-engine-graph.js";
import type { PracticeJudgeReading } from "./practice-lanes.js";
import { PracticeRefusal } from "./practice-settings.js";
import { PRACTICE_TRANSCRIPT_SCHEMA } from "./practice-transcript.js";
import { PRACTICE_EXIT_CODES, type PracticeVerdict } from "./practice-verdict.js";

export const PRACTICE_RESCORE_SCHEMA = "preview-practice-rescore-v1" as const;
export const PRACTICE_RESCORE_FILES = Object.freeze({ transcript: "transcript.json", json: "rescore.json", markdown: "rescore.md" } as const);
/** E12: the four weights the owner asked for, each with the investigations' outcomes applied and not. */
export const PRACTICE_RESCORE_SWEEP = Object.freeze({
  cannotAssessWeights: Object.freeze([0.5, 0.66, 0.75, 1] as const),
  investigationsApplied: Object.freeze([true, false] as const),
  /** The check first: the recomputed and the served final strengths differ by at most this. */
  tolerance: 1e-9
});
/** The engine settings the sweep starts from when --engine-policy is not given: R1d's start file. */
export const PRACTICE_RESCORE_START_POLICY_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "engine-policy-start.json");

export type PracticeRescoreRow = Readonly<{
  debate: string;
  /** The engine the debate ran with (plan deviation 22). */
  engine: 1 | 2;
  cannotAssessWeight: number;
  investigationsApplied: boolean;
  leaderRootNodeId: string;
  leaderLetter: EngineAnswerLetter;
  /** Between consecutive answers ranked by honest final strength: [leader − second, second − third, …]. */
  gaps: readonly number[];
  /** Engine-1 debates: the leader is not the answer engine 1 served. Engine-2 debates: always false (no engine-1 leader known). */
  leadChangedFromEngine1: boolean;
  /** The leader is not this debate's leader at the start setting (the policy's own weight, investigations applied). */
  leadChangedFromStart: boolean;
  /**
   * The debate's investigation rows by outcome, the same in both arms (pre-flight PF-R2a10.4): what the "applied" arm
   * applied. Every other result (unavailable, skipped, capped) changes nothing and is counted in none.
   */
  investigated: Readonly<{ holds: number; fails: number; deadEnd: number }>;
}>;
export type PracticeRescoreSummaryRow = Readonly<{
  cannotAssessWeight: number;
  investigationsApplied: boolean;
  debates: number;
  leadsChangedFromEngine1: number;
  leadsChangedFromStart: number;
  /** The median of each debate's first gap (its lead's margin); null when no debate had two answers. */
  medianGap: number | null;
}>;
export type PracticeRescoreNotRescored = Readonly<{
  debate: string;
  code: "PRACTICE_RESCORE_INPUT_INCOMPLETE" | "PRACTICE_RESCORE_ENGINE1_MISMATCH";
  what: string;
}>;
export type PracticeRescoreResult = Readonly<{
  schema: typeof PRACTICE_RESCORE_SCHEMA;
  writtenAt: string;
  transcripts: number;
  start: Readonly<{ cannotAssessWeight: number; investigationsApplied: true }>;
  rows: readonly PracticeRescoreRow[];
  summary: readonly PracticeRescoreSummaryRow[];
  notRescored: readonly PracticeRescoreNotRescored[];
  verdict: PracticeVerdict;
  exitCode: number;
  reasons: readonly string[];
}>;

/** One debate's missing input (`PRACTICE_RESCORE_INPUT_INCOMPLETE <what>`): caught per debate, listed, never thrown out. */
class RescoreInputIncomplete extends Error {
  constructor(readonly what: string) {
    super(`PRACTICE_RESCORE_INPUT_INCOMPLETE ${what}`);
    this.name = "RescoreInputIncomplete";
  }
}

const UNKNOWN_MAKER = "UNKNOWN";
/**
 * A9's row results that are an investigator's answer, each with its counter in a row's `investigated` (pre-flight
 * PF-R2a10.4): one lookup, no branch. Every other result (unavailable, skipped, capped) is counted in none. Counting
 * only: how a result reads as a review is the runner's one rule (`engineInvestigatedStatuses`), never this table.
 */
const INVESTIGATED_COUNTER: Readonly<Record<string, "holds" | "fails" | "deadEnd">> = Object.freeze({
  HOLDS: "holds", FAILS: "fails", DEAD_END: "deadEnd"
});
const REVIEW_KEY = /^JUDGE:review:(?:catch-up:[^:]+:)?([^:]+)$/u;
const CROSS_KEY_PREFIX = "JUDGE:cross-root:";

function reviewOutcomeOf(value: unknown): TranscriptEngineReview["outcome"] | null {
  return value === "agree" || value === "dispute" || value === "cannot-assess" ? value : null;
}

/**
 * The graph as the runner materialises it (packages/graph/src/index.ts:692-790): every node with the given base strength,
 * every edge with its measured bearing, in the recorded order; every arrow target resolved to the one operator the kernel
 * knows (`accumulate`, packages/kernel/src/index.ts:328-329), at the deployment level the runner records (:4747-4779).
 */
function snapshotOf(graph: TranscriptEngineGraph, baseOf: (nodeId: string) => number | null): EvaluationSnapshot {
  const arrows = graph.edges.map((edge): SnapshotArrow => Object.freeze({
    arrowId: edge.edgeId, sourceNodeId: edge.from, targetKind: edge.targetKind, targetNodeId: edge.to, targetEdgeId: edge.targetEdgeId,
    polarity: edge.polarity, kind: edge.kind, strength: edge.bearing, magnitudeStatus: edge.bearing === null ? "UNKNOWN" : "MEASURED",
    strengthSource: edge.strengthSource, clusterKey: edge.clusterKey
  }));
  const targets = [...new Set(arrows.flatMap((arrow) => arrow.targetKind === "NODE" && arrow.targetNodeId !== null ? [arrow.targetNodeId] : []))];
  return Object.freeze({
    nodes: Object.freeze(graph.nodes.map((node) => Object.freeze({ nodeId: node.nodeId, baseStrength: baseOf(node.nodeId),
      parentNodeId: node.parentNodeId, isFolder: node.isFolder }))),
    arrows: Object.freeze(arrows),
    arrowOrder: Object.freeze(arrows.map((arrow) => arrow.arrowId)),
    operatorResolutions: Object.freeze(targets.map((parentNodeId) =>
      Object.freeze({ parentNodeId, operator: "accumulate" as const, suppliedBy: "deployment" as const }))),
    clusterRecords: Object.freeze([])
  });
}

/**
 * The investigations' outcomes (applied) read as the reviews the points lacked (A8's `investigated`), by the runner's ONE
 * rule (`engineInvestigatedStatuses`, A14: holds = agree, fails = dispute; a dead end and every other result leave the
 * point cannot-assess); not applied: none. Only a point whose own review said "cannot assess" is read (A8 refuses any
 * other). The weights are A6's, never this file's: holds = its links at full weight; dead end = they stay at the
 * cannot-assess weight; fails = the dispute factor on its honest score AND its links stay at the cannot-assess weight
 * (controller ruling 2026-10-15, spec §4.2b/§17; holds 1 > dead end 0.66 > fails ≈ 0.46 at the start values)
 * (pre-flight PF-R2a10.3).
 */
function investigatedStatusesOf(graph: TranscriptEngineGraph, cannotAssessNodeIds: readonly string[], applied: boolean):
  ReadonlyMap<string, EngineReviewStatus> {
  if (!applied) return new Map();
  const cannotAssess = new Set(cannotAssessNodeIds);
  return engineInvestigatedStatuses(graph.investigations.filter((row) => cannotAssess.has(row.nodeId)));
}

/** Engine 2's propagation, as the runner runs it (INTERFACE §7.2): the link rules on the snapshot, then the standing, then propagation. */
function engineTwoStrengths(graph: TranscriptEngineGraph, baseOf: (nodeId: string) => number | null, settings: EngineSettings,
  applied: boolean): readonly Readonly<{ nodeId: string; strength: number }>[] {
  const ownReplyEdgeIds = new Map<string, readonly string[]>();
  for (const edge of graph.edges) {
    if (edge.ownReply) ownReplyEdgeIds.set(edge.from, Object.freeze([...(ownReplyEdgeIds.get(edge.from) ?? []), edge.edgeId]));
  }
  const cannotAssessNodeIds = graph.reviews.filter((review) => review.outcome === "cannot-assess").map((review) => review.nodeId);
  const investigated = investigatedStatusesOf(graph, cannotAssessNodeIds, applied);
  // The runner's own door (A8): the same facts, link rules and standing it serves from, never a copy.
  const linked = engineLinkedGraph({
    engine: settings,
    snapshot: snapshotOf(graph, baseOf),
    reviewedNodeIds: graph.reviews.filter((review) => review.outcome !== "cannot-assess").map((review) => review.nodeId),
    disputedNodeIds: graph.reviews.filter((review) => review.outcome === "dispute").map((review) => review.nodeId),
    cannotAssessNodeIds,
    ownReplyEdgeIds,
    investigated
  });
  if (linked === null) throw new RescoreInputIncomplete("engine-settings");
  return evaluate(projectJudgedStanding(linked.snapshot, linked.reviewedNodeIds).snapshot).strengths;
}

function receiptSettingsOf(graph: TranscriptEngineGraph): EngineSettings {
  const parsed = engineReceiptSchema.safeParse(graph.engineReceipt);
  if (!parsed.success) throw new RescoreInputIncomplete("engine-receipt");
  return engineSettingsOfReceipt(parsed.data);
}

/**
 * The check first (E12): the engine's arithmetic over the recorded base strengths and bearings gives back the served final
 * strengths. Engine 1: propagation over the served nodes (the hidden ones left out, as the runner's projection left them).
 * Engine 2: the same through the link rules at the receipt's own settings, every investigation applied (as served).
 */
export function reproduceServedPropagation(graph: TranscriptEngineGraph): Readonly<{ ok: boolean; worstDelta: number; what: string }> {
  const recorded = (nodeId: string): number | null => graph.served.baseStrength[nodeId] ?? null;
  const strengths = graph.engine === 1
    ? evaluate(projectJudgedStanding(snapshotOf(graph, recorded), engineOneStandingSeed(graph)).snapshot).strengths
    : engineTwoStrengths(graph, recorded, receiptSettingsOf(graph), true);
  const computed = new Map(strengths.map((row) => [row.nodeId, row.strength] as const));
  const served = graph.served.finalStrength;
  let worstDelta = 0;
  for (const nodeId of new Set([...computed.keys(), ...Object.keys(served)])) {
    const mine = computed.get(nodeId);
    const theirs = Object.hasOwn(served, nodeId) ? served[nodeId] : undefined;
    if (mine === undefined || theirs === undefined) {
      return Object.freeze({ ok: false, worstDelta: Number.POSITIVE_INFINITY, what: `${graph.engine === 1 ? "" : "engine2 "}node ${nodeId}` });
    }
    worstDelta = Math.max(worstDelta, Math.abs(mine - theirs));
  }
  const ok = worstDelta <= PRACTICE_RESCORE_SWEEP.tolerance;
  if (!ok) return Object.freeze({ ok, worstDelta, what: `${graph.engine === 1 ? "" : "engine2 "}delta ${String(worstDelta)}` });
  // R2a final wave (Ruling (A16 Important 1) Minor 1): the served answer, by the runner's own rule over the answers that
  // could be served (those with a served final strength); one that is not given back would make every "lead changed
  // from engine 1" in the sweep spurious.
  const servable = graph.nodes.filter((node) => node.kind === "ROOT" && Object.hasOwn(served, node.nodeId));
  if (graph.served.servedRootNodeId !== null && servable.length > 0
    && selectServedRootByStrength(servable, strengths).root.nodeId !== graph.served.servedRootNodeId) {
    return Object.freeze({ ok: false, worstDelta, what: "served-root" });
  }
  return Object.freeze({ ok, worstDelta, what: "" });
}

/**
 * R2a final wave (Ruling (A16 Important 1)): engine 1's judged-standing seed, for the runner's own projection
 * (`projectJudgedStanding`), so the recorded reviews decide which points engine 1 hid: every point a review agreed with or
 * disputed, and every point no review reached that was served (a mono-maker debate, or a spend stop that left points
 * unreviewed). A point whose review said "cannot assess" is never seeded; it stands only on judged points under it.
 */
function engineOneStandingSeed(graph: TranscriptEngineGraph): readonly string[] {
  const reviewed = new Set(graph.reviews.map((review) => review.nodeId));
  return Object.freeze([
    ...graph.reviews.filter((review) => review.outcome !== "cannot-assess").map((review) => review.nodeId),
    ...graph.nodes.filter((node) => !reviewed.has(node.nodeId) && Object.hasOwn(graph.served.finalStrength, node.nodeId))
      .map((node) => node.nodeId)
  ]);
}

/** Each node's honest score (A3): every grader's honest grade, the median of the other makers', the author only as last resort. */
function honestBaseOf(graph: TranscriptEngineGraph, scoring: EngineScoring): ReadonlyMap<string, number> {
  const byNode = new Map<string, HonestVoice[]>();
  for (const voice of graph.voices) {
    const list = byNode.get(voice.nodeId) ?? [];
    list.push(Object.freeze({ judgementRef: voice.judgementRef, maker: voice.maker, isAuthor: voice.isAuthor,
      grade: honestGrade(voice.assessment, scoring) }));
    byNode.set(voice.nodeId, list);
  }
  const base = new Map<string, number>();
  for (const [nodeId, voices] of byNode) {
    const score = honestPointScore(voices);
    if (score !== null) base.set(nodeId, score.score);
  }
  return base;
}

/** The leader (the runner's own rule, `selectServedRootByStrength`) and the gaps between the answers ranked by strength. */
function leadOf(graph: TranscriptEngineGraph, strengths: readonly Readonly<{ nodeId: string; strength: number }>[]):
  Readonly<{ leader: TranscriptEngineNode; gaps: readonly number[] }> {
  const byId = new Map(strengths.map((row) => [row.nodeId, row.strength] as const));
  const roots = graph.nodes.filter((node) => node.kind === "ROOT" && byId.has(node.nodeId));
  if (roots.length === 0) throw new RescoreInputIncomplete("roots");
  const leader = selectServedRootByStrength(roots, strengths).root;
  const ranked = roots.map((root) => byId.get(root.nodeId)!).sort((left, right) => right - left);
  return Object.freeze({ leader, gaps: Object.freeze(ranked.slice(1).map((strength, index) => ranked[index]! - strength)) });
}

function letterOf(node: TranscriptEngineNode): EngineAnswerLetter {
  const letter = ENGINE_ANSWER_LETTERS[node.rootIndex];
  if (letter === undefined) throw new RescoreInputIncomplete(`root-index ${node.nodeId}`);
  return letter;
}

/** The debate's investigation rows by outcome (pre-flight PF-R2a10.4); a result that is no outcome counts in none. */
function investigatedOf(graph: TranscriptEngineGraph): PracticeRescoreRow["investigated"] {
  const counts: Record<"holds" | "fails" | "deadEnd", number> = { holds: 0, fails: 0, deadEnd: 0 };
  for (const row of graph.investigations) {
    const counter = Object.hasOwn(INVESTIGATED_COUNTER, row.result) ? INVESTIGATED_COUNTER[row.result] : undefined;
    if (counter !== undefined) counts[counter] += 1;
  }
  return Object.freeze(counts);
}

/** One debate's eight rows (four weights × applied or not), each compared with engine 1 and with the start setting. */
export function rescoreDebate(debate: string, graph: TranscriptEngineGraph, settings: EngineSettings): readonly PracticeRescoreRow[] {
  const investigated = investigatedOf(graph);
  const base = honestBaseOf(graph, settings.scoring);
  const baseOf = (nodeId: string): number | null => base.get(nodeId) ?? null;
  const at = (cannotAssessWeight: number, applied: boolean) => leadOf(graph, engineTwoStrengths(graph, baseOf,
    Object.freeze({ ...settings, links: Object.freeze({ ...settings.links, cannotAssessWeight }) }), applied));
  const start = at(settings.links.cannotAssessWeight, true).leader.nodeId;
  const engineOneLeader = graph.engine === 1 ? graph.served.servedRootNodeId : null;
  if (graph.engine === 1 && engineOneLeader === null) throw new RescoreInputIncomplete("served-root");
  return Object.freeze(PRACTICE_RESCORE_SWEEP.cannotAssessWeights.flatMap((cannotAssessWeight) =>
    PRACTICE_RESCORE_SWEEP.investigationsApplied.map((investigationsApplied): PracticeRescoreRow => {
      const lead = at(cannotAssessWeight, investigationsApplied);
      return Object.freeze({
        debate, engine: graph.engine, cannotAssessWeight, investigationsApplied,
        leaderRootNodeId: lead.leader.nodeId, leaderLetter: letterOf(lead.leader), gaps: lead.gaps,
        leadChangedFromEngine1: engineOneLeader !== null && lead.leader.nodeId !== engineOneLeader,
        leadChangedFromStart: lead.leader.nodeId !== start,
        investigated
      });
    })));
}

export function rescoreSummary(rows: readonly PracticeRescoreRow[]): readonly PracticeRescoreSummaryRow[] {
  return Object.freeze(PRACTICE_RESCORE_SWEEP.cannotAssessWeights.flatMap((cannotAssessWeight) =>
    PRACTICE_RESCORE_SWEEP.investigationsApplied.map((investigationsApplied): PracticeRescoreSummaryRow => {
      const arm = rows.filter((row) => row.cannotAssessWeight === cannotAssessWeight && row.investigationsApplied === investigationsApplied);
      const margins = arm.flatMap((row) => row.gaps.length === 0 ? [] : [row.gaps[0]!]);
      return Object.freeze({
        cannotAssessWeight, investigationsApplied, debates: arm.length,
        leadsChangedFromEngine1: arm.filter((row) => row.leadChangedFromEngine1).length,
        leadsChangedFromStart: arm.filter((row) => row.leadChangedFromStart).length,
        medianGap: margins.length === 0 ? null : honestMedian(margins)
      });
    })));
}

/* ------------------------------------------------------------------ older transcripts (before R2) */

type OlderAttempt = Readonly<{ sequence: number; ledgerEntryId: string; callSiteKey: string; family: string; outcome: string;
  maker: string | null; providerRef: string; prompt: Readonly<{ messages: readonly unknown[] | null }> | null;
  reply: Readonly<{ content: string }> | null; parse: Readonly<{ finishReason: string | null }> }>;
type OlderNode = Readonly<{ node_id: string; claim: string; base_score: Readonly<{ value: number }>;
  final_strength: Readonly<{ value: number }> | null; review: Readonly<{ outcome: string }> | null }>;
type OlderEdge = Readonly<{ edge_id: string; from_node_ref: string; target_kind: "NODE" | "EDGE"; target_ref: string; relation: string;
  strength: Readonly<{ status: string; number?: Readonly<{ value: number }> }> }>;
type OlderTranscript = Readonly<{ run: Readonly<{ panel: readonly Readonly<{ providerRef: string }>[] }>;
  attempts: readonly OlderAttempt[]; structure: Readonly<{ answer: unknown }> }>;

/**
 * An older transcript (before R2) has no engine graph; it is rebuilt from what it holds, or refused with what is missing.
 * The served nodes and links come from `structure.answer`. A node's author is the accepted JUDGE call that wrote its exact
 * words; its graders are the PANEL calls under that call's key, each read as the gateway accepted it. A point the site hid
 * because its review said "cannot assess" comes from that review's own call: its key names the node, its prompt holds the
 * node's words and its links, its reply the outcome. The engine-1 taus of hidden points are not known and not needed (engine
 * 1 left them out; engine 2 scores them from their graders). An older transcript has no reply ids: the ledger entry id of
 * the call stands in as `judgementRef`.
 */
export function engineGraphFromOlderTranscript(value: unknown): TranscriptEngineGraph {
  const transcript = value as OlderTranscript;
  const answer = transcript.structure?.answer as { nodes?: unknown; edges?: unknown } | null | undefined;
  if (answer === null || answer === undefined || !Array.isArray(answer.nodes) || !Array.isArray(answer.edges)) {
    throw new RescoreInputIncomplete("structure.answer");
  }
  const panelRefs = new Set((transcript.run?.panel ?? []).map((member) => member.providerRef));
  const calls = [...(transcript.attempts ?? [])].sort((left, right) => left.sequence - right.sequence);
  const recordedOf = (attempt: OlderAttempt | undefined): RecordedProviderReply | null => attempt?.reply === null || attempt?.reply === undefined
    ? null : Object.freeze({ content: attempt.reply.content, reply: Object.freeze({ finishReason: attempt.parse.finishReason }) });
  const repairOf = (attempt: OlderAttempt) => calls.find((other) => other.sequence > attempt.sequence && other.outcome === "OK"
    && other.callSiteKey.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX) && structureRepairOriginalKey(other.callSiteKey) === attempt.callSiteKey);
  /** What the step read for this call: as A15's builder reads it (the reply, a merged patch, or LG-A's structure-repair copy). */
  const readingOf = (attempt: OlderAttempt): PracticeJudgeReading | null => {
    const baseKey = seatBaseCallSiteKey(attempt.callSiteKey);
    if (attempt.outcome === "OK") {
      const accepted = recordedOf(attempt);
      const before = calls.filter((other) => other.sequence < attempt.sequence && other.callSiteKey === attempt.callSiteKey
        && other.providerRef === attempt.providerRef).at(-1);
      return accepted === null ? null : practiceAcceptedJudgeReading({ callSiteKey: baseKey, accepted, answered: recordedOf(before) });
    }
    const repaired = recordedOf(repairOf(attempt));
    return repaired === null ? null : practiceAcceptedJudgeReading({ callSiteKey: baseKey, accepted: repaired, answered: null });
  };
  // The author of each statement: the one JUDGE call whose accepted reply wrote these exact words (two such calls: unknown).
  const authors = new Map<string, Readonly<{ attempt: OlderAttempt; reading: PracticeJudgeReading }> | null>();
  for (const attempt of calls) {
    if (attempt.family !== "JUDGE") continue;
    const reading = readingOf(attempt);
    if (reading === null || reading.statement === null) continue;
    authors.set(reading.statement, authors.has(reading.statement) ? null : Object.freeze({ attempt, reading }));
  }
  const authorOf = (nodeId: string, statement: string) => {
    const found = authors.get(statement);
    if (found === undefined || found === null) throw new RescoreInputIncomplete(`author ${nodeId}`);
    return found;
  };
  type Built = { nodeId: string; statement: string; author: OlderAttempt; parentNodeId: string | null; hidden: boolean;
    base: number | null; final: number | null; review: TranscriptEngineReview["outcome"] | null; reviewerMaker: string };
  const built = new Map<string, Built>();
  const edges: TranscriptEngineEdge[] = [];
  const edgeOf = (edgeId: string, from: string, to: string | null, polarity: "support" | "attack", bearing: number | null,
    targetEdgeId: string | null): TranscriptEngineEdge => Object.freeze({ edgeId, from, to, polarity, bearing, ownReply: false,
    targetKind: to === null ? "EDGE" : "NODE", targetEdgeId, kind: to === null ? "undercutting" : null, strengthSource: "REVIEWER",
    clusterKey: null });
  for (const node of answer.nodes as readonly OlderNode[]) {
    built.set(node.node_id, { nodeId: node.node_id, statement: node.claim, author: authorOf(node.node_id, node.claim).attempt,
      parentNodeId: null, hidden: false, base: node.base_score.value, final: node.final_strength?.value ?? null,
      review: reviewOutcomeOf(node.review?.outcome), reviewerMaker: UNKNOWN_MAKER });
  }
  for (const row of answer.edges as readonly OlderEdge[]) {
    const polarity = row.relation === "support" || row.relation === "attack" ? row.relation : null;
    if (polarity === null) throw new RescoreInputIncomplete(`edge-relation ${row.edge_id}`);
    edges.push(edgeOf(row.edge_id, row.from_node_ref, row.target_kind === "NODE" ? row.target_ref : null, polarity,
      row.strength.status === "PRESENT" && row.strength.number !== undefined ? row.strength.number.value : null,
      row.target_kind === "EDGE" ? row.target_ref : null));
  }
  // The points the site hid: each from its own cannot-assess review (words and links from its prompt).
  const hiddenLinks: { nodeId: string; links: readonly Readonly<{ ordinal: number; relation: string; target_statement: string }>[] }[] = [];
  for (const attempt of calls) {
    if (attempt.family !== "REVIEW" || attempt.outcome !== "OK" || attempt.reply === null) continue;
    const nodeId = REVIEW_KEY.exec(seatBaseCallSiteKey(attempt.callSiteKey))?.[1];
    if (nodeId === undefined) continue;
    const decoded = decodeModelJson(attempt.reply.content, { finishReason: attempt.parse.finishReason });
    const outcome = reviewOutcomeOf(decoded.ok ? (decoded.value as { outcome?: unknown } | null)?.outcome : undefined);
    let known = built.get(nodeId);
    if (known === undefined && attempt.prompt !== null && attempt.prompt.messages !== null) {
      // (pre-flight PF-R2a10.16) A resumed debate's review key names the replay book's site node id, not the served
      // node's: the served node is the one whose words the review prompt carries (two such nodes: cannot tell).
      let promptStatement: string | undefined;
      try {
        promptStatement = readPromptFrame({ messages: attempt.prompt.messages as PromptPacket["messages"] }).fields
          .find((field) => field.name === "statement")?.content;
      } catch { promptStatement = undefined; }
      const sameWords = [...built.values()].filter((entry) => !entry.hidden && entry.statement === promptStatement);
      if (sameWords.length > 1) throw new RescoreInputIncomplete(`review-node ${nodeId}`);
      known = sameWords[0];
    }
    if (known !== undefined) {
      known.reviewerMaker = attempt.maker ?? UNKNOWN_MAKER;
      known.review ??= outcome;
      continue;
    }
    // A point hidden for another reason (its review never came back) stays hidden under engine 2 too: nothing to rebuild.
    if (outcome !== "cannot-assess") continue;
    let fields: ReadonlyMap<string, string>;
    try {
      fields = new Map(readPromptFrame({ messages: attempt.prompt!.messages as PromptPacket["messages"] }).fields
        .map((field) => [field.name, field.content] as const));
    } catch {
      throw new RescoreInputIncomplete(`review-prompt ${nodeId}`);
    }
    const statement = fields.get("statement");
    let links: unknown;
    try { links = JSON.parse(fields.get("edges_sourced_by_this_node") ?? "null"); } catch { links = null; }
    if (statement === undefined || !Array.isArray(links) || links.length === 0) throw new RescoreInputIncomplete(`review-prompt ${nodeId}`);
    built.set(nodeId, { nodeId, statement, author: authorOf(nodeId, statement).attempt, parentNodeId: null, hidden: true,
      base: null, final: null, review: "cannot-assess", reviewerMaker: attempt.maker ?? UNKNOWN_MAKER });
    hiddenLinks.push({ nodeId, links: links as { ordinal: number; relation: string; target_statement: string }[] });
  }
  const nodeOfStatement = new Map([...built.values()].map((entry) => [entry.statement, entry.nodeId] as const));
  for (const { nodeId, links } of hiddenLinks) {
    for (const link of links) {
      const target = nodeOfStatement.get(link.target_statement);
      const polarity = link.relation === "support" || link.relation === "attack" ? link.relation : null;
      if (target === undefined || polarity === null) throw new RescoreInputIncomplete(`edge-target ${nodeId}:${String(link.ordinal)}`);
      edges.push(edgeOf(`review:${nodeId}:${String(link.ordinal)}`, nodeId, target, polarity, null, null));
    }
  }
  // Parents: a root has none; a cross-reply's is the root it supports; any other point's is its first link's target.
  for (const entry of built.values()) {
    const key = seatBaseCallSiteKey(entry.author.callSiteKey);
    if (rootIndexOfAuthorKey(key) !== null) continue;
    const own = edges.filter((edge) => edge.from === entry.nodeId && edge.to !== null);
    const parent = key.startsWith(CROSS_KEY_PREFIX) ? own.find((edge) => edge.polarity === "support") ?? own[0] : own[0];
    if (parent === undefined) throw new RescoreInputIncomplete(`parent ${entry.nodeId}`);
    entry.parentNodeId = parent.to;
  }
  const rootIndexOf = (nodeId: string): number => {
    const seen = new Set<string>();
    let current = built.get(nodeId);
    while (current !== undefined && !seen.has(current.nodeId)) {
      seen.add(current.nodeId);
      if (current.parentNodeId === null) return rootIndexOfAuthorKey(seatBaseCallSiteKey(current.author.callSiteKey)) ?? -1;
      current = built.get(current.parentNodeId);
    }
    return -1;
  };
  const nodes = [...built.values()].map((entry): TranscriptEngineNode => {
    const key = seatBaseCallSiteKey(entry.author.callSiteKey);
    return Object.freeze({ nodeId: entry.nodeId, parentNodeId: entry.parentNodeId, rootIndex: rootIndexOf(entry.nodeId),
      authorMaker: entry.author.maker ?? UNKNOWN_MAKER,
      kind: rootIndexOfAuthorKey(key) !== null ? "ROOT" : key.startsWith(CROSS_KEY_PREFIX) ? "CROSS" : "POINT",
      // An older transcript predates A15, and no code applied the dispute factor before R2: false (pre-flight consistency).
      hidden: entry.hidden, isFolder: false, disputeFactorApplied: false });
  });
  const kindOf = new Map(nodes.map((node) => [node.nodeId, node] as const));
  const finalEdges = edges.map((edge) => {
    const from = kindOf.get(edge.from);
    const ownReply = from?.kind === "CROSS" && edge.polarity === "support" && edge.to === from.parentNodeId && kindOf.get(edge.to ?? "")?.kind === "ROOT";
    return ownReply ? Object.freeze({ ...edge, ownReply: true }) : edge;
  });
  // The graders: per node, the PANEL calls under its author's key, the last one the step took per key.
  const voices: TranscriptEngineVoice[] = [];
  for (const entry of built.values()) {
    const authorReading = authorOf(entry.nodeId, entry.statement).reading;
    voices.push(Object.freeze({ nodeId: entry.nodeId, judgementRef: entry.author.ledgerEntryId, maker: entry.author.maker ?? UNKNOWN_MAKER,
      isAuthor: true, assessment: authorReading.assessment }));
    const prefix = panelKeyPrefixOf(seatBaseCallSiteKey(entry.author.callSiteKey));
    const chosen = new Map<string, OlderAttempt>();
    for (const attempt of calls) {
      const base = seatBaseCallSiteKey(attempt.callSiteKey);
      if (attempt.family !== "PANEL" || !base.startsWith(prefix) || !panelRefs.has(base.slice(prefix.length))) continue;
      if (attempt.outcome === "OK" || repairOf(attempt) !== undefined) chosen.set(base, attempt);
    }
    for (const attempt of chosen.values()) {
      const reading = readingOf(attempt);
      if (reading === null) throw new RescoreInputIncomplete(`voices ${entry.nodeId}`);
      voices.push(Object.freeze({ nodeId: entry.nodeId, judgementRef: attempt.ledgerEntryId, maker: attempt.maker ?? UNKNOWN_MAKER,
        isAuthor: false, assessment: reading.assessment }));
    }
  }
  const finals = Object.fromEntries([...built.values()].flatMap((entry) => entry.final === null ? [] : [[entry.nodeId, entry.final] as const]));
  const finalRows = Object.entries(finals).map(([nodeId, strength]) => ({ nodeId, strength }));
  const servedRoots = nodes.filter((node) => node.kind === "ROOT" && Object.hasOwn(finals, node.nodeId));
  return Object.freeze({
    engine: 1, engineReceipt: null,
    nodes: Object.freeze(nodes), edges: Object.freeze(finalEdges),
    reviews: Object.freeze([...built.values()].flatMap((entry) => entry.review === null ? []
      : [Object.freeze({ nodeId: entry.nodeId, outcome: entry.review, reviewerMaker: entry.reviewerMaker })])),
    voices: Object.freeze(voices), investigations: Object.freeze([]), unreadVoices: Object.freeze([]),
    served: Object.freeze({
      baseStrength: Object.freeze(Object.fromEntries([...built.values()].flatMap((entry) => entry.base === null ? [] : [[entry.nodeId, entry.base] as const]))),
      finalStrength: Object.freeze(finals),
      servedRootNodeId: servedRoots.length === 0 ? null : selectServedRootByStrength(servedRoots, finalRows).root.nodeId
    })
  });
}

/**
 * R2a final wave (Ruling (A16 Important 1) Minor 3): the minimal shape the rescore reads, so a malformed block is one
 * debate's missing input (`engineGraph`), never a batch-wide harness error.
 */
function engineGraphShaped(value: unknown): value is TranscriptEngineGraph {
  if (value === null || typeof value !== "object") return false;
  const graph = value as Record<string, unknown>;
  const served = graph.served as Record<string, unknown> | null | undefined;
  const record = (member: unknown): boolean => member !== null && typeof member === "object" && !Array.isArray(member);
  return (graph.engine === 1 || graph.engine === 2)
    && ["nodes", "edges", "reviews", "voices", "investigations", "unreadVoices"].every((key) => Array.isArray(graph[key]))
    && record(served) && record(served!.baseStrength) && record(served!.finalStrength)
    && (served!.servedRootNodeId === null || typeof served!.servedRootNodeId === "string");
}

/** One transcript's graph: its own block (R2 and later), else rebuilt from an older transcript. */
export function engineGraphOfTranscript(value: unknown): TranscriptEngineGraph {
  const transcript = value as { schema?: unknown; structure?: { engineGraph?: TranscriptEngineGraph } } | null;
  if (transcript === null || typeof transcript !== "object" || transcript.schema !== PRACTICE_TRANSCRIPT_SCHEMA) {
    throw new RescoreInputIncomplete("schema");
  }
  const graph = transcript.structure?.engineGraph;
  if (graph === undefined) return engineGraphFromOlderTranscript(value);
  if (!engineGraphShaped(graph)) throw new RescoreInputIncomplete("engineGraph");
  if (graph.unreadVoices.length > 0) throw new RescoreInputIncomplete(`voices ${[...new Set(graph.unreadVoices.map((voice) => voice.nodeId))].join(",")}`);
  return graph;
}

function rescoreVerdict(rows: readonly PracticeRescoreRow[], notRescored: readonly PracticeRescoreNotRescored[]):
  Readonly<{ verdict: PracticeVerdict; reasons: readonly string[] }> {
  const mismatch = notRescored.filter((row) => row.code === "PRACTICE_RESCORE_ENGINE1_MISMATCH").map((row) => `RESCORE_ENGINE1_MISMATCH:${row.debate}`);
  const incomplete = notRescored.filter((row) => row.code === "PRACTICE_RESCORE_INPUT_INCOMPLETE")
    .map((row) => `RESCORE_INPUT_INCOMPLETE:${row.debate}:${row.what}`);
  const nothing = rows.length === 0 ? ["RESCORE_NOTHING_RESCORED"] : [];
  const verdict: PracticeVerdict = mismatch.length > 0 ? "FAIL" : nothing.length > 0 ? "NOT_PROVEN"
    : incomplete.length > 0 ? "PASS_WITH_WARNINGS" : "PASS";
  return Object.freeze({ verdict, reasons: Object.freeze([...mismatch, ...nothing, ...incomplete]) });
}

/** Pure: every debate checked, then swept; each one that cannot be is listed with its code and what it lacks. */
export function rescoreTranscripts(inputs: readonly Readonly<{ debate: string; text: string }>[], settings: EngineSettings,
  now: Date = new Date()): PracticeRescoreResult {
  const rows: PracticeRescoreRow[] = [];
  const notRescored: PracticeRescoreNotRescored[] = [];
  for (const input of inputs) {
    try {
      let value: unknown;
      try { value = JSON.parse(input.text) as unknown; } catch { throw new RescoreInputIncomplete("json"); }
      const graph = engineGraphOfTranscript(value);
      const check = reproduceServedPropagation(graph);
      if (!check.ok) {
        notRescored.push(Object.freeze({ debate: input.debate, code: "PRACTICE_RESCORE_ENGINE1_MISMATCH", what: check.what }));
        continue;
      }
      rows.push(...rescoreDebate(input.debate, graph, settings));
    } catch (error) {
      // A graph the arithmetic refuses (a cycle, an endpoint that is not there) is an input that cannot be used, said so.
      const what = error instanceof RescoreInputIncomplete ? error.what
        : error instanceof TypedDomainError ? `graph ${error.code}` : null;
      if (what === null) throw error;
      notRescored.push(Object.freeze({ debate: input.debate, code: "PRACTICE_RESCORE_INPUT_INCOMPLETE", what }));
    }
  }
  const { verdict, reasons } = rescoreVerdict(rows, notRescored);
  return Object.freeze({
    schema: PRACTICE_RESCORE_SCHEMA, writtenAt: now.toISOString(), transcripts: inputs.length,
    start: Object.freeze({ cannotAssessWeight: settings.links.cannotAssessWeight, investigationsApplied: true as const }),
    rows: Object.freeze(rows), summary: rescoreSummary(rows), notRescored: Object.freeze(notRescored),
    verdict, exitCode: PRACTICE_EXIT_CODES[verdict], reasons
  });
}

/** The short summary a person reads first: counts and letters only, never any debate text. */
export function rescoreMarkdown(result: PracticeRescoreResult): string {
  const yes = (value: boolean) => (value ? "yes" : "no");
  const lines = [`# Preview practice (rescore): ${result.verdict}`, "",
    `${String(result.transcripts)} transcript(s). Start setting: a "cannot assess" link at ${String(result.start.cannotAssessWeight)}, `
      + "investigations applied. No AI was called and nothing was spent; the comparing judges are not asked here.", ""];
  if (result.reasons.length > 0) lines.push("Why:", "", ...result.reasons.map((reason) => `- ${reason}`), "");
  lines.push("Per setting (the lead is the answer with the highest honest final strength):", "",
    "| cannot-assess weight | investigations applied | debates | lead changed from engine 1 | lead changed from start | median gap |",
    "|---|---|---|---|---|---|");
  for (const row of result.summary) {
    lines.push(`| ${String(row.cannotAssessWeight)} | ${yes(row.investigationsApplied)} | ${String(row.debates)} | `
      + `${String(row.leadsChangedFromEngine1)} | ${String(row.leadsChangedFromStart)} | ${row.medianGap === null ? "-" : row.medianGap.toFixed(4)} |`);
  }
  // (pre-flight PF-R2a10.4) The last column shows which outcomes the "applied" arm applied (controller ruling: the sweep
  // shows all three).
  lines.push("", "Per debate:", "",
    "| debate | engine | weight | applied | lead | gaps | changed from engine 1 | changed from start | investigations (holds/fails/dead end) |",
    "|---|---|---|---|---|---|---|---|---|");
  for (const row of result.rows) {
    lines.push(`| ${row.debate} | ${String(row.engine)} | ${String(row.cannotAssessWeight)} | ${yes(row.investigationsApplied)} | `
      + `${row.leaderLetter} | ${row.gaps.map((gap) => gap.toFixed(4)).join(", ")} | ${yes(row.leadChangedFromEngine1)} | ${yes(row.leadChangedFromStart)} | `
      + `${String(row.investigated.holds)}/${String(row.investigated.fails)}/${String(row.investigated.deadEnd)} |`);
  }
  if (result.notRescored.length > 0) {
    lines.push("", "Not rescored (codes only):", "", ...result.notRescored.map((row) => `- ${row.debate}: ${row.code} ${row.what}`));
  }
  return `${lines.join("\n")}\n`;
}

/** The mode: every transcript.json under `transcripts` (sorted), the settings from the policy text; rescore.json and rescore.md. */
export function runPracticeRescore(input: Readonly<{ transcripts: string; out: string; enginePolicyText: string; now?: Date }>): PracticeRescoreResult {
  const policy = parsePracticeEnginePolicyText(input.enginePolicyText);
  let entries: readonly string[];
  try { entries = readdirSync(input.transcripts, { recursive: true, encoding: "utf8" }); } catch {
    throw new PracticeRefusal("PRACTICE_RESCORE_NO_INPUT", "the --transcripts folder cannot be read");
  }
  const files = entries.filter((entry) => entry.split(sep).at(-1) === PRACTICE_RESCORE_FILES.transcript).sort();
  if (files.length === 0) throw new PracticeRefusal("PRACTICE_RESCORE_NO_INPUT", `no ${PRACTICE_RESCORE_FILES.transcript} under --transcripts`);
  // `makers` only sizes the engine's estimate sites, which the rescore never reads; the preview argues with five.
  const settings = engineSettingsOf(policy, { makers: 5, mapOpening: false });
  const result = rescoreTranscripts(files.map((file) => Object.freeze({
    debate: dirname(file).split(sep).join("/"), text: readFileSync(join(input.transcripts, file), "utf8")
  })), settings, input.now);
  mkdirSync(input.out, { recursive: true, mode: 0o700 });
  writeFileSync(join(input.out, PRACTICE_RESCORE_FILES.json), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(input.out, PRACTICE_RESCORE_FILES.markdown), rescoreMarkdown(result), { mode: 0o600 });
  return result;
}
