import { DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, type Answer, type DebateMapView } from "@debateai/contract";
import { normalizeRunOwnership, type RunOwnershipAccess } from "@debateai/db";

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
  readMapChoiceForRun(runId: string): Promise<MapViewSource | null>;
}

/** Does this caller own this run? The same predicate every owner read uses. */
export interface RunOwnerCheck {
  owns(runId: string, ownership: RunOwnershipAccess): Promise<boolean>;
}

/** One query on the runtime pool; main.ts passes `pool.query`. */
export type RunOwnerQuery = (
  text: string,
  values: unknown[]
) => Promise<Readonly<{ rows: readonly Readonly<{ owned?: unknown }>[] }>>;

const RUN_OWNED_SQL = "SELECT core.run_is_owned_by($1,$2,$3) AS owned";

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
    }
  });
}

/** The node ids P2b writes (`core.map_position.root_node_id` is a uuid column). */
const NODE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The answer's root nodes: its UUID nodes that answer no other node or edge. An opening position
 * is such a node; a reply (a defeater, a support, an attack on an edge) never is. Only these may
 * carry a position's title, so a title never lands on a reply, nor on a node the page cannot show.
 */
export function answerRootNodeIds(answer: Pick<Answer, "nodes" | "edges">): ReadonlySet<string> {
  const replies = new Set(answer.edges
    .filter((edge) => edge.from_node_ref !== edge.target_ref)
    .map((edge) => edge.from_node_ref));
  return new Set(answer.nodes
    .map((node) => node.node_id)
    .filter((nodeId) => NODE_UUID.test(nodeId) && !replies.has(nodeId)));
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

/** Two spellings of one claim (case, spacing, Unicode form) are one claim. */
function claimKey(claim: string): string {
  return claim.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * The view, against the answer's own root nodes (`answerRootNodeIds`). A position whose node is
 * not a UUID the caller's set holds is dropped, so a title never points at a node the page cannot
 * show. So is one with no node, or a second answer on the same node. Also-raised claims are
 * merged when they say the same (their makers joined), come most-raised first, ties in the map's
 * order, and only the claims travel.
 * After a re-claim, P2b keeps the first pass's `root_node_id` (`core.map_position` is written
 * with ON CONFLICT DO NOTHING). If that node is not in the answer the position is dropped
 * here: its title just does not show (pre-flight PF-C19).
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
  const merged = new Map<string, { claim: string; makers: Set<string>; order: number }>();
  for (const [order, item] of record.alsoRaised.entries()) {
    const claim = item.claim.trim();
    if (claim === "") continue;
    const key = claimKey(claim);
    const known = merged.get(key);
    if (known === undefined) merged.set(key, { claim, makers: new Set(item.makers), order });
    else for (const maker of item.makers) known.makers.add(maker);
  }
  const alsoRaised = [...merged.values()]
    .sort((left, right) => right.makers.size - left.makers.size || left.order - right.order)
    .slice(0, DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised)
    .map((item) => clip(item.claim, DEBATE_MAP_VIEW_LIMITS.maxClaimChars));
  return DebateMapViewSchema.parse({ positions, also_raised: alsoRaised });
}

/** Whose run, against which root nodes, read as whom (pre-flight PF-C16). */
export type MapViewReadInput = Readonly<{
  runId: string;
  nodeIds: ReadonlySet<string>;
  ownership: RunOwnershipAccess;
}>;

export interface AnswerMapViewApplication {
  readMapView(input: MapViewReadInput): Promise<DebateMapView | null>;
}

/**
 * A run with no map choice has no view. That covers a run without the new shape, an erased run,
 * and a map that fell back to today's opening and chose no answer. The page then shows exactly
 * what it shows today. A caller who does not own the run has no view either, and the map is not
 * read for them. An ownership naming nobody (or both principals) is refused before any query, as
 * `StoryRepository.readForAnswer` refuses it.
 */
export class RepositoryAnswerMapViewApplication implements AnswerMapViewApplication {
  constructor(
    private readonly reader: MapChoiceReader,
    private readonly owner: RunOwnerCheck
  ) {}

  async readMapView(input: MapViewReadInput): Promise<DebateMapView | null> {
    let ownership: RunOwnershipAccess;
    try {
      ownership = normalizeRunOwnership({
        ownerRef: input.ownership.ownerRef,
        legacyAskerId: input.ownership.legacyAskerId
      });
    } catch {
      return null;
    }
    if (!await this.owner.owns(input.runId, ownership)) return null;
    const record = await this.reader.readMapChoiceForRun(input.runId);
    if (record === null || record.answers.length === 0) return null;
    return debateMapViewFrom(record, input.nodeIds);
  }
}

/** No reader composed (local tools, older deployments): never a view. */
export const NO_MAP_VIEWS: AnswerMapViewApplication = Object.freeze({
  readMapView: async () => null
});
