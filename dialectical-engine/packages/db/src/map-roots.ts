import type { Pool, PoolClient } from "pg";

/**
 * Debate shape (migration 0117) and reclaim resume (0119): which node is each chosen answer's root IN FORCE. Ids and codes
 * only (core.map_position is not a content carrier), so no content lease and no decryption.
 *
 * The map's repository (packages/map/src/repository.ts) writes and reads positions through this one query, and the web
 * part of an answer (packages/serve, W3-6) names each web path by it: the web step keys a path by the map's answer id
 * (`a1`, `a2`…), the page by the path's opening position, the root node id, as the story paths and the map view do.
 */

/**
 * Each position's root IN FORCE (migration 0119): the last re-point's root (the move no later move of the answer starts
 * from), else the position's own; its maker likewise; and whether that root has been set aside ('stale'). Ids and codes
 * only. `$1` is the run; a caller may append `AND position.answer_id = $2`.
 */
export const MAP_ROOT_IN_FORCE_SQL = `SELECT position.answer_id, COALESCE(moved.root_node_id, position.root_node_id)::text AS root_node_id,
         COALESCE(moved.maker, position.maker) AS maker, node.generation_status = 'stale' AS stale
    FROM core.map_position AS position
    LEFT JOIN core.map_position_repoint AS moved
      ON moved.run_id = position.run_id AND moved.answer_id = position.answer_id
     AND NOT EXISTS (SELECT 1 FROM core.map_position_repoint AS later
                      WHERE later.run_id = moved.run_id AND later.answer_id = moved.answer_id
                        AND later.from_root_node_id = moved.root_node_id)
    JOIN core.node AS node ON node.run_id = position.run_id AND node.node_id = COALESCE(moved.root_node_id, position.root_node_id)
   WHERE position.run_id = $1`;

/** One chosen answer's root in force. */
export type MapRootInForce = Readonly<{ answerId: string; rootNodeId: string; maker: string; stale: boolean }>;

/** The run's roots in force, by answer id; none when the run has no map position (no map, or no root argued yet). */
export async function readMapRootsInForce(executor: Pick<Pool, "query"> | PoolClient, runId: string): Promise<readonly MapRootInForce[]> {
  const rows = (await executor.query<{ answer_id: string; root_node_id: string; maker: string; stale: boolean }>(
    `${MAP_ROOT_IN_FORCE_SQL} ORDER BY position.answer_id`, [runId])).rows;
  return Object.freeze(rows.map((row) => Object.freeze({ answerId: row.answer_id, rootNodeId: row.root_node_id, maker: row.maker,
    stale: row.stale })));
}
