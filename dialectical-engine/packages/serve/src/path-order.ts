/**
 * V4 start step, Task 58b (Task 53b's rule, spec 2026-11-03 §4.3: the served answer is the same whichever path finishes first). Each path
 * of a path debate saves in its own order, so `created_at_seq` across paths follows which path finished first. The served answer lists a
 * path debate's nodes path by path, in plan order (b1, b2, …: the order `Answer.branches` lists), each path's nodes (its root in force and
 * everything under it) in their saved order. A node outside every path keeps its place before the paths (saved before any path's node) or
 * after them (saved later), in saved order. An edge follows its source node's place, then its own saved order. Pure: the reader hands it
 * the ids it read (each live node with its parent, and the paths' roots in force).
 */

/** A live node of the debate, as saved: its id and its parent's (null for a root). */
export type PathOrderNode = Readonly<{ nodeId: string; parentNodeId: string | null }>;

/** Postgres renders a uuid in lower case; ids are matched whatever their case. */
const keyOf = (id: string): string => id.toLowerCase();

/**
 * Each node's served place, by node id in lower case: the nodes outside every path saved before the first path node, then each path's
 * nodes in plan order, then every other node outside every path. `nodes` are the debate's live nodes in saved order (`created_at_seq`);
 * `roots` the paths' roots in force, in plan order. A node belongs to the path of the nearest root on its parent chain; a chain that
 * leaves the live nodes (a parent a reclaim set aside) belongs to no path. No root: the saved order.
 */
export function pathNodePlacesOf(nodes: readonly PathOrderNode[], roots: readonly string[]): ReadonlyMap<string, number> {
  const parentOf = new Map(nodes.map((node) => [keyOf(node.nodeId), node.parentNodeId === null ? null : keyOf(node.parentNodeId)] as const));
  const pathOfRoot = new Map<string, number>();
  roots.forEach((root, index) => { if (!pathOfRoot.has(keyOf(root))) pathOfRoot.set(keyOf(root), index); });
  const pathOf = new Map<string, number | null>();
  const resolve = (nodeId: string): number | null => {
    const chain: string[] = [];
    let current: string | null = nodeId;
    let found: number | null = null;
    // A parent is always saved before its child (0002's depth rule), so a chain is never longer than the nodes.
    while (current !== null && chain.length <= nodes.length) {
      const known = pathOf.get(current);
      if (known !== undefined) {
        found = known;
        break;
      }
      chain.push(current);
      const root = pathOfRoot.get(current);
      if (root !== undefined) {
        found = root;
        break;
      }
      current = parentOf.get(current) ?? null;
    }
    for (const id of chain) pathOf.set(id, found);
    return found;
  };
  const keys = nodes.map((node) => keyOf(node.nodeId));
  const firstOnAPath = keys.findIndex((key) => resolve(key) !== null);
  const before: string[] = [];
  const paths: string[][] = roots.map(() => []);
  const after: string[] = [];
  keys.forEach((key, index) => {
    const path = resolve(key);
    if (path !== null) paths[path]!.push(key);
    else if (firstOnAPath < 0 || index < firstOnAPath) before.push(key);
    else after.push(key);
  });
  return new Map([...before, ...paths.flat(), ...after].map((key, place) => [key, place] as const));
}

/**
 * `items` in their served places: by the place of the node `nodeIdOf` names (a stable sort, so items of one node keep their saved order);
 * an item whose node has no place comes last.
 */
export function inPathOrder<T>(items: readonly T[], nodeIdOf: (item: T) => string, places: ReadonlyMap<string, number>): T[] {
  const placeOf = (item: T): number => places.get(keyOf(nodeIdOf(item))) ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((left, right) => placeOf(left) - placeOf(right));
}
