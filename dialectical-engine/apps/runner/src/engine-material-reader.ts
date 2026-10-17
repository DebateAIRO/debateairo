// apps/runner/src/engine-material-reader.ts
/**
 * ENGINE 2: THE RUNNER'S MATERIAL READER (spec 2026-10-15 §4.2b, §4.3; INTERFACE §11.2).
 *
 * Builds the shared material's source (`EngineMaterialSource`, packages/kernel/src/engine-material.ts) for one debate.
 * What the runner already holds in memory is passed in (`EngineMaterialGraph`: statements, the map's chosen words, the
 * materialised snapshot, the node facts, the strengths), so the material is built from exactly the graph the
 * propagation used. What only the database holds is read here: each review's reasons (encrypted; read through the
 * story's leased reader, which borrows the lease when the caller holds one on the same pool, else holds its own for
 * the read (pre-flight PF-R2a7.5)), its author's and reviewer's makers and its order
 * (the ledger, which the database trigger checks), and the investigations as recorded. No decrypt primitive is called
 * in this file. Plain words: code finds which answer each point bears on and whether it attacks or supports; every text
 * stays the AI's own.
 */
import type { Pool } from "@debateai/db";
import {
  ENGINE_ANSWER_LETTERS, type EngineAnswerLetter, type EngineMaterialInvestigation, type EngineMaterialSource,
  type EngineMaterialSourcePoint
} from "@debateai/kernel";
import { POINT_INVESTIGATION_BASES, PointInvestigationRepository } from "@debateai/judgement";
import type { EvaluationSnapshot, SnapshotArrow } from "@debateai/propagation";
import { readStoryEnrichment } from "@debateai/story";
import type { EngineNodeFacts } from "./engine-links.js";

/** The debate as the runner holds it in memory when it builds material. */
export type EngineMaterialGraph = Readonly<{
  question: string;
  /** Every root of THIS copy, by root index (letters are fixed: root 0 is A). */
  roots: readonly Readonly<{ rootIndex: number; nodeId: string; statement: string; mapWords: string | null }>[];
  /** Every other node of this copy, in plan order. */
  points: readonly Readonly<{ nodeId: string; statement: string }>[];
  snapshot: EvaluationSnapshot;
  facts: ReadonlyMap<string, EngineNodeFacts>;
  /** Honest final strengths (B5); before the final propagation (A14) the base honest scores stand in. */
  honestFinalStrength: ReadonlyMap<string, number>;
}>;

/** One node's cross-maker review as the ledger holds it. */
export type EngineReviewRead = Readonly<{
  nodeId: string;
  outcome: "agree" | "dispute" | "cannot-assess";
  reasons: readonly string[];
  authorMaker: string;
  reviewerMaker: string;
  /** 1 = the earliest of the reviews read together (ledger order). */
  reviewOrder: number;
}>;

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const REVIEW_OUTCOMES: ReadonlySet<string> = new Set(["agree", "dispute", "cannot-assess"]);
const OUTCOME_OF_RESULT: Readonly<Record<string, EngineMaterialInvestigation["outcome"]>> =
  Object.freeze({ HOLDS: "holds", FAILS: "fails", DEAD_END: "dead_end" });
// A10's list, declared once (plan deviation 16); never a local copy (pre-flight PF-R2a7.3)
const INVESTIGATION_BASES: ReadonlySet<string> = new Set<string>(POINT_INVESTIGATION_BASES);

/**
 * The graph from the runner's own records: plan positions below `rootCount` are the roots (position = root index), the
 * rest are points. `mapWords[i]` is the map's chosen words for root i (null or blank: the root's own statement).
 */
export function engineMaterialGraphOf(input: Readonly<{
  question: string;
  rootCount: number;
  authored: ReadonlyMap<number, Readonly<{ nodeId: string; statement: string }>>;
  mapWords: readonly (string | null)[];
  snapshot: EvaluationSnapshot;
  facts: ReadonlyMap<string, EngineNodeFacts>;
  honestFinalStrength: ReadonlyMap<string, number>;
}>): EngineMaterialGraph {
  const positions = [...input.authored.keys()].sort((left, right) => left - right);
  const roots = positions.flatMap((position) => {
    const node = input.authored.get(position);
    if (node === undefined || position >= input.rootCount) return [];
    const words = input.mapWords[position] ?? null;
    return [Object.freeze({ rootIndex: position, nodeId: node.nodeId, statement: node.statement,
      mapWords: words === null || words.trim() === "" ? null : words })];
  });
  const points = positions.flatMap((position) => {
    const node = input.authored.get(position);
    return node === undefined || position < input.rootCount ? [] : [Object.freeze({ nodeId: node.nodeId, statement: node.statement })];
  });
  return Object.freeze({
    question: input.question, roots: Object.freeze(roots), points: Object.freeze(points), snapshot: input.snapshot,
    facts: input.facts, honestFinalStrength: input.honestFinalStrength
  });
}

/**
 * Each requested node's review: outcome, makers and order from the ledger (plain columns), reasons through
 * `readStoryEnrichment` (decrypted under the caller's lease when it holds one, else under a short lease of its own;
 * pre-flight PF-R2a7.5). A node with no review is absent from the map.
 */
export async function readEngineReviews(pool: Pool, runId: string, nodeIds: readonly string[]):
  Promise<ReadonlyMap<string, EngineReviewRead>> {
  const wanted = [...new Set(nodeIds.filter((nodeId) => UUID_TEXT.test(nodeId)))];
  const result = new Map<string, EngineReviewRead>();
  if (wanted.length === 0) return result;
  const callerId = new Map(wanted.map((nodeId) => [nodeId.toLowerCase(), nodeId] as const));
  const rows = await pool.query<{ node_id: string; outcome: string; author_maker: string; reviewer_maker: string }>(
    `SELECT review.node_id::text AS node_id, review.outcome,
            author.maker AS author_maker, reviewer.maker AS reviewer_maker
       FROM ledger.node_review AS review
       JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
       JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
      WHERE review.run_id = $1 AND review.node_id = ANY($2::uuid[])
      ORDER BY review.at_seq`,
    [runId, [...callerId.keys()]]
  );
  // R2a final wave (Ruling (A12 concerns) 1): no review row, nothing to word; the story's reader (a lease and two
  // queries) is not asked.
  if (rows.rows.length === 0) return result;
  const enrichment = await readStoryEnrichment(pool, {
    runId, nodes: wanted.map((nodeId) => ({ nodeId, judgeArtifactRef: null }))
  });
  let order = 0;
  for (const row of rows.rows) {
    const nodeId = callerId.get(row.node_id.toLowerCase());
    if (nodeId === undefined || !REVIEW_OUTCOMES.has(row.outcome)) continue;
    order += 1;
    result.set(nodeId, Object.freeze({
      nodeId,
      outcome: row.outcome as EngineReviewRead["outcome"],
      reasons: Object.freeze([...(enrichment.get(nodeId)?.reviewReasons ?? [])]),
      authorMaker: row.author_maker,
      reviewerMaker: row.reviewer_maker,
      reviewOrder: order
    }));
  }
  return result;
}

/** The recorded findings an AI wrote (HOLDS, FAILS, DEAD_END), by node; every other result code carries none. */
export function engineMaterialInvestigationsOf(rows: readonly Readonly<{
  nodeId: string; result: string; basis: string | null;
  content: Readonly<{ missing: string; found: string; reason: string }> | null;
}>[]): ReadonlyMap<string, EngineMaterialInvestigation> {
  const result = new Map<string, EngineMaterialInvestigation>();
  for (const row of rows) {
    const outcome = Object.hasOwn(OUTCOME_OF_RESULT, row.result) ? OUTCOME_OF_RESULT[row.result] : undefined;
    if (outcome === undefined || row.basis === null || !INVESTIGATION_BASES.has(row.basis) || row.content === null) continue;
    result.set(row.nodeId, Object.freeze({
      missing: row.content.missing, found: row.content.found,
      basis: row.basis as EngineMaterialInvestigation["basis"], outcome, reason: row.content.reason
    }));
  }
  return result;
}

/** Arrows a node sources toward another node, in the snapshot's arrow order. */
function nodeArrowsOf(snapshot: EvaluationSnapshot): (nodeId: string) => readonly SnapshotArrow[] {
  const rank = new Map(snapshot.arrowOrder.map((arrowId, index) => [arrowId, index] as const));
  const last = snapshot.arrowOrder.length;
  return (nodeId) => snapshot.arrows
    .filter((arrow) => arrow.sourceNodeId === nodeId && arrow.targetKind === "NODE" && arrow.targetNodeId !== null)
    .sort((left, right) => (rank.get(left.arrowId) ?? last) - (rank.get(right.arrowId) ?? last));
}

/**
 * Pure. Each answer is a root (letter by root index; words = the map's chosen words, else the root's statement; the
 * case = the root's statement when the words came from the map). Each point's link is its first arrow that is not its
 * own-reply edge (A6's `ownReplyEdgeIds`) and lands on a root or another point; a cross-reply is therefore an
 * objection to the rival, made by its own answer's reply (`fromRivalReply`). A point whose chain never reaches a root
 * of this copy is left out. Statuses come from the facts (after investigations), reasons from the reviews.
 */
export function engineMaterialSourceOf(
  graph: EngineMaterialGraph,
  reviews: ReadonlyMap<string, EngineReviewRead>,
  investigations: ReadonlyMap<string, EngineMaterialInvestigation>
): EngineMaterialSource {
  const letterOfRoot = new Map<string, EngineAnswerLetter>();
  const answers = graph.roots.map((root) => {
    const letter = ENGINE_ANSWER_LETTERS[root.rootIndex];
    if (letter === undefined) throw new TypeError("ENGINE_MATERIAL_INVALID:roots");
    letterOfRoot.set(root.nodeId, letter);
    return Object.freeze({
      letter, rootNodeId: root.nodeId, words: root.mapWords ?? root.statement,
      caseText: root.mapWords === null ? null : root.statement, assumptions: Object.freeze([] as string[])
    });
  });
  const pointIds = new Set(graph.points.map((point) => point.nodeId));
  const arrowsOf = nodeArrowsOf(graph.snapshot);
  type Link = Readonly<{ relation: "SUPPORTS" | "ATTACKS"; targetRef: string; fromRivalReply: EngineAnswerLetter | null }>;
  const links = new Map<string, Link>();
  for (const point of graph.points) {
    const own = new Set(graph.facts.get(point.nodeId)?.ownReplyEdgeIds ?? []);
    const arrows = arrowsOf(point.nodeId);
    const counted = arrows.find((arrow) => !own.has(arrow.arrowId) && arrow.targetNodeId !== null
      && (letterOfRoot.has(arrow.targetNodeId) || pointIds.has(arrow.targetNodeId)));
    if (counted === undefined || counted.targetNodeId === null) continue;
    const ownRoot = arrows.find((arrow) => own.has(arrow.arrowId))?.targetNodeId ?? null;
    links.set(point.nodeId, Object.freeze({
      relation: counted.polarity === "support" ? "SUPPORTS" : "ATTACKS",
      targetRef: counted.targetNodeId,
      fromRivalReply: ownRoot === null ? null : letterOfRoot.get(ownRoot) ?? null
    }));
  }
  const answerLetterOf = (nodeId: string): EngineAnswerLetter | null => {
    let current = links.get(nodeId);
    for (let step = 0; current !== undefined && step <= links.size; step += 1) {
      const letter = letterOfRoot.get(current.targetRef);
      if (letter !== undefined) return letter;
      current = links.get(current.targetRef);
    }
    return null;
  };
  const points = graph.points.flatMap((point): EngineMaterialSourcePoint[] => {
    const link = links.get(point.nodeId);
    const answerLetter = answerLetterOf(point.nodeId);
    if (link === undefined || answerLetter === null) return [];
    return [Object.freeze({
      nodeId: point.nodeId,
      text: point.statement,
      relation: link.relation,
      targetRef: link.targetRef,
      answerLetter,
      fromRivalReply: link.fromRivalReply,
      restsOn: null,
      status: graph.facts.get(point.nodeId)?.status ?? "NONE",
      reviewerReasons: Object.freeze([...(reviews.get(point.nodeId)?.reasons ?? [])]),
      honestFinalStrength: graph.honestFinalStrength.get(point.nodeId) ?? 0,
      investigation: investigations.get(point.nodeId) ?? null
    })];
  });
  return Object.freeze({ question: graph.question, answers: Object.freeze(answers), points: Object.freeze(points) });
}

/** The full source: every point's review (reasons and makers) and every recorded investigation, read; the rest in memory. */
export async function readEngineMaterialSource(input: Readonly<{ pool: Pool; runId: string; graph: EngineMaterialGraph }>):
  Promise<EngineMaterialSource> {
  const reviews = await readEngineReviews(input.pool, input.runId, input.graph.points.map((point) => point.nodeId));
  const recorded = await new PointInvestigationRepository(input.pool).readPointInvestigationsForRun(input.runId);
  return engineMaterialSourceOf(input.graph, reviews, engineMaterialInvestigationsOf(recorded));
}
