import { DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, type Answer, type DebateMapView } from "@debateai/contract";
import { normalizeRunOwnership, type RunOwnershipAccess } from "@debateai/db";
import { mapAnswersArgued, mapMergeAlsoRaised } from "@debateai/map";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, §3.4) — the debate page's view of the map:
 * - each argued answer's statement, keyed by the opening position (root node) that argued it;
 * - the points that were raised but not debated.
 *
 * The row is P2b's (`core.map_choice`, read by `readMapChoiceForRun`, decrypted like other
 * debate text; an erased run reads as no map). This module only turns it into the contract's
 * words. Nothing that names a maker, a count, a mark, an AI or a map id leaves here.
 *
 * P2b's map reader takes a bare run id and checks no owner. So the read here asks
 * `core.run_is_owned_by` first and reads nothing for a caller who does not own the run: a
 * second gate behind the route's owner-scoped answer read (pre-flight PF-C16).
 *
 * Ruling C-MAPREAD: the page asks for the map on every load, and most debates have none. So
 * the route first asks `findMapRun` (one owner query that also names the answer's run, then
 * one primary-key lookup of the map choice's opening) and answers 404 before any full answer
 * read or content lease when there is no map.
 */

/**
 * The members of P2b's map choice row this module reads (Contract deviation 4). Named
 * `MapViewSource`, not `MapChoiceRecord`, so it never clashes with `@debateai/map`'s own type.
 */
export interface MapViewSource {
  readonly answers: readonly Readonly<{ statement: string; rootNodeId: string | null }>[];
  readonly alsoRaised: readonly Readonly<{ claim: string; makers: readonly string[] }>[];
}

export interface MapChoiceReader {
  /**
   * The opening the run's map choice recorded, or null when the run has none: one primary-key lookup of a code
   * column, with no content lease and no decryption (ruling C-MAPREAD).
   */
  readMapOpeningForRun(runId: string): Promise<"MAP" | "TODAYS_OPENING" | null>;
  readMapChoiceForRun(runId: string): Promise<MapViewSource | null>;
}

/** Does this caller own this run? The same predicate every owner read uses. */
export interface RunOwnerCheck {
  owns(runId: string, ownership: RunOwnershipAccess): Promise<boolean>;
  /** The run of this answer when the caller owns it, else null: one owner query, no content read. */
  ownedRunOfAnswer(answerId: string, ownership: RunOwnershipAccess): Promise<string | null>;
}

/** One query on the runtime pool; main.ts passes `pool.query`. */
export type RunOwnerQuery = (
  text: string,
  values: unknown[]
) => Promise<Readonly<{ rows: readonly Readonly<{ owned?: unknown; run_id?: unknown }>[] }>>;

const RUN_OWNED_SQL = "SELECT core.run_is_owned_by($1,$2,$3) AS owned";

/**
 * Ruling C-MAPREAD: the answer's run, only for its owner, in the ownership query itself. serve.answer's primary key
 * leads with answer_id, and no content column is read, so no content lease is taken.
 */
const ANSWER_RUN_OWNED_SQL = `SELECT answer.run_id::text AS run_id FROM serve.answer AS answer
  WHERE answer.answer_id = $1 AND core.run_is_owned_by(answer.run_id,$2,$3) LIMIT 1`;

/**
 * `core.run_is_owned_by(p_run_id uuid, p_owner_ref uuid, p_legacy_asker_id text)` (migration
 * 0037, EXECUTE granted to debateai_runtime). Only a true answer owns: no row, null or any
 * other value is "not yours".
 */
export function runOwnerCheckFrom(query: RunOwnerQuery): RunOwnerCheck {
  return Object.freeze({
    owns: async (runId: string, ownership: RunOwnershipAccess): Promise<boolean> => {
      const result = await query(RUN_OWNED_SQL, [runId, ownership.ownerRef, ownership.legacyAskerId]);
      return result.rows[0]?.owned === true;
    },
    ownedRunOfAnswer: async (answerId: string, ownership: RunOwnershipAccess): Promise<string | null> => {
      const result = await query(ANSWER_RUN_OWNED_SQL, [answerId, ownership.ownerRef, ownership.legacyAskerId]);
      const runId = result.rows[0]?.run_id;
      return typeof runId === "string" ? runId : null;
    }
  });
}

/** The node ids P2b writes (`core.map_position.root_node_id` is a uuid column). */
const NODE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The answer's own UUID node ids: the sanity check on the nodes the MAP recorded (controller
 * ruling C-ROOTS). Which node is a position is the map's record (`core.map_position`, written by
 * P2b's `writeMapPosition` and carried as `rootNodeId` by `readMapChoiceForRun`), never inferred
 * from the edge graph, so an opening position that replies to another position keeps its title.
 * This set only drops a recorded node the answer does not hold, so a title never names a node
 * the page cannot show.
 */
export function answerNodeIds(answer: Pick<Answer, "nodes">): ReadonlySet<string> {
  return new Set(answer.nodes.map((node) => node.node_id).filter((nodeId) => NODE_UUID.test(nodeId)));
}

/** Trimmed, and cut to `limit` UTF-16 units with an ellipsis, never splitting a character. */
function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  let kept = "";
  for (const character of trimmed) {
    if (kept.length + character.length > limit - 1) break;
    kept += character;
  }
  return `${kept}…`;
}

/**
 * The view. Each position's node is the one the map recorded for it; it is kept only when it is
 * a UUID the answer holds (`answerNodeIds`), so a title never points at a node the page cannot
 * show. So is one with no node, or a second answer on the same node. Also-raised claims are
 * merged when they say the same (their makers joined), come most-raised first, ties in the map's
 * order, and only the claims travel.
 * After a re-claim, `core.map_position` keeps the first pass's `root_node_id` (it is written
 * with ON CONFLICT DO NOTHING), but a copy that took the run over after a crash set that root
 * aside and moved the answer to its own root (migration 0119's `core.map_position_repoint`);
 * `readMapChoiceForRun` carries the root in force, so the title shows. If the recorded node is
 * still not in the answer the position is dropped here: its title just does not show
 * (pre-flight PF-C19).
 */
export function debateMapViewFrom(record: MapViewSource, nodeIds: ReadonlySet<string>): DebateMapView {
  const seen = new Set<string>();
  const positions = record.answers.flatMap((answer) => {
    const nodeId = answer.rootNodeId;
    if (nodeId === null || !NODE_UUID.test(nodeId) || !nodeIds.has(nodeId) || seen.has(nodeId)
      || answer.statement.trim() === "") return [];
    seen.add(nodeId);
    return [{ node_id: nodeId, answer: clip(answer.statement, DEBATE_MAP_VIEW_LIMITS.maxAnswerChars) }];
  }).slice(0, DEBATE_MAP_VIEW_LIMITS.maxPositions);
  // Review m-4: the one also-raised rule the story uses too (@debateai/map mapMergeAlsoRaised); the stored list is already
  // in its order, so this only guards a row stored before it.
  const alsoRaised = mapMergeAlsoRaised(record.alsoRaised)
    .slice(0, DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised)
    .map((item) => clip(item.claim, DEBATE_MAP_VIEW_LIMITS.maxClaimChars));
  return DebateMapViewSchema.parse({ positions, also_raised: alsoRaised });
}

/** Whose run, against which of the answer's nodes, read as whom (pre-flight PF-C16). */
export type MapViewReadInput = Readonly<{
  runId: string;
  nodeIds: ReadonlySet<string>;
  ownership: RunOwnershipAccess;
}>;

/** Which answer, read as whom (ruling C-MAPREAD). */
export type MapRunFindInput = Readonly<{
  answerId: string;
  ownership: RunOwnershipAccess;
}>;

export interface AnswerMapViewApplication {
  /**
   * Ruling C-MAPREAD — the route's cheap gate, before the full answer read: the run of the caller's own answer, only
   * when that run's map opened the debate; else null. At most one owner query and one map-choice lookup, no content
   * lease, no decryption. A caller who does not own the answer learns nothing about its map: the owner query runs
   * first and the map is not looked up for them.
   */
  findMapRun(input: MapRunFindInput): Promise<string | null>;
  readMapView(input: MapViewReadInput): Promise<DebateMapView | null>;
}

/** What a publication needs: the view of a run it already holds (its answer was read as the publisher). */
export type MapViewReader = Pick<AnswerMapViewApplication, "readMapView">;

/** An ownership naming nobody (or both principals) is refused before any query, as `StoryRepository.readForAnswer` does. */
function ownershipOrNull(ownership: RunOwnershipAccess): RunOwnershipAccess | null {
  try {
    return normalizeRunOwnership({ ownerRef: ownership.ownerRef, legacyAskerId: ownership.legacyAskerId });
  } catch {
    return null;
  }
}

/**
 * A run with no map choice has no view. That covers a run without the new shape, an erased run,
 * a map that fell back to today's opening and chose no answer, and (ruling C-TWO) a map whose
 * fewer than two answers left the debate arguing today's opening. The page then shows exactly
 * what it shows today. A caller who does not own the run has no view either, and the map is not
 * read for them. An ownership naming nobody (or both principals) is refused before any query, as
 * `StoryRepository.readForAnswer` refuses it.
 */
export class RepositoryAnswerMapViewApplication implements AnswerMapViewApplication {
  constructor(
    private readonly reader: MapChoiceReader,
    private readonly owner: RunOwnerCheck
  ) {}

  async findMapRun(input: MapRunFindInput): Promise<string | null> {
    const ownership = ownershipOrNull(input.ownership);
    if (ownership === null) return null;
    const runId = await this.owner.ownedRunOfAnswer(input.answerId, ownership);
    if (runId === null) return null;
    return await this.reader.readMapOpeningForRun(runId) === "MAP" ? runId : null;
  }

  async readMapView(input: MapViewReadInput): Promise<DebateMapView | null> {
    const ownership = ownershipOrNull(input.ownership);
    if (ownership === null) return null;
    if (!await this.owner.owns(input.runId, ownership)) return null;
    const record = await this.reader.readMapChoiceForRun(input.runId);
    // Ruling C-TWO: the runner's own story rule. With fewer than two map answers the debate argued today's opening
    // and the story got no also-raised points, so the page gets no view either.
    if (record === null || !mapAnswersArgued(record.answers.length)) return null;
    return debateMapViewFrom(record, input.nodeIds);
  }
}

/** No reader composed (local tools, older deployments): never a view. */
export const NO_MAP_VIEWS: AnswerMapViewApplication = Object.freeze({
  findMapRun: async () => null,
  readMapView: async () => null
});
