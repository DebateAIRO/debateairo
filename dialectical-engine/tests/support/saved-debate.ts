// What a run saved, read back with SQL with its random ids named, and the per-run database copies a finish-order proof
// argues in — moved from tests/integration/parallel-calls-debate.test.ts (debate-shape plan, Task 15 Step 1; written in
// Task 13). The one change: the maintenance-database pool (`admin`) is a first argument. `savedDebate` also reads the
// debate shape's map rows (core.map_item, core.map_choice, core.map_position).
import type { Pool } from "@debateai/db";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

/** Waits until no session is connected to `name` (a template must have none), within a deadline. */
export async function untilUnused(admin: Pool, name: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const { rows } = await admin.query<{ sessions: string }>(
      `SELECT count(*)::text AS sessions FROM pg_stat_activity WHERE datname=$1`, [name]);
    if (rows[0]?.sessions === "0") return;
    if (Date.now() > deadline) throw new Error(`test: database ${name} still has ${rows[0]?.sessions ?? "?"} sessions`);
    await new Promise((resolve) => { setTimeout(resolve, 250); });
  }
}

/** A copy of database `from` (PostgreSQL's CREATE DATABASE … TEMPLATE: the same rows, ids included). */
export async function copyDatabase(admin: Pool, from: string, to: string): Promise<void> {
  await untilUnused(admin, from, 60_000);
  await admin.query(`CREATE DATABASE "${to}" TEMPLATE "${from}"`);
}

/** Drops a per-run copy once nothing is connected to it. */
export async function dropDatabase(admin: Pool, name: string): Promise<void> {
  await untilUnused(admin, name, 60_000);
  await admin.query(`DROP DATABASE "${name}"`);
}

export type SavedDebate = Readonly<{
  nodes: readonly unknown[]; edges: readonly unknown[]; reduced: readonly unknown[]; reviews: readonly unknown[];
  answer: unknown; composed: unknown; factBundle: unknown;
  /** The debate shape's map (empty on a run without one): items, the choice, and which root argued each answer. */
  mapItems: readonly unknown[]; mapChoice: readonly unknown[]; mapPositions: readonly unknown[];
}>;

/** Keys that are a row's own place on the clock or a digest over random ids: not content. */
const VOLATILE_KEYS = new Set([
  "created_at_seq", "at_seq", "sealed_at_seq", "relevant_as_of", "content_hash", "replay_handle", "input_hash", "recorded_at"
]);

/**
 * What one run saved, read back with SQL, every random id replaced by a stable name: a node by its place in the save
 * order (`node#k`, which is the plan order this proves), an edge likewise, a model's answer by the call site and
 * member that produced it. Rows a recorder writes are listed in the order they were written.
 */
export async function savedDebate(pool: Pool, runId: string, answerId: string): Promise<SavedDebate> {
  const rows = async (sql: string, values: readonly unknown[]): Promise<Record<string, unknown>[]> =>
    (await pool.query<{ row: Record<string, unknown> }>(sql, [...values])).rows.map((entry) => entry.row);
  const nodes = await rows(`SELECT to_jsonb(node) AS row FROM core.node AS node WHERE run_id=$1 ORDER BY created_at_seq`, [runId]);
  const edges = await rows(`SELECT to_jsonb(edge) AS row FROM core.edge AS edge WHERE run_id=$1 ORDER BY created_at_seq`, [runId]);
  const names = new Map<string, string>();
  nodes.forEach((node, index) => names.set(String(node.node_id), `node#${String(index)}`));
  edges.forEach((edge, index) => names.set(String(edge.edge_id), `edge#${String(index)}`));
  const nameIds = (text: string): string => text.replace(UUID, (id) => names.get(id.toLowerCase()) ?? "<id>");
  // A model's answer is named by the call that produced it: its call site (node ids named) and the member that answered.
  const artifacts = await pool.query<{ raw_artifact_ref: string; call_site_key: string; actor_ref: string }>(
    `SELECT raw_artifact_ref::text, call_site_key, actor_ref FROM ledger.ledger_entry
      WHERE run_id=$1 AND raw_artifact_ref IS NOT NULL AND call_site_key IS NOT NULL`, [runId]);
  for (const artifact of artifacts.rows) {
    names.set(artifact.raw_artifact_ref, `answer(${nameIds(artifact.call_site_key)} @ ${artifact.actor_ref})`);
  }
  const named = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, field: unknown) =>
    VOLATILE_KEYS.has(key) ? undefined : typeof field === "string" ? nameIds(field) : field));
  const reduced = await rows(`SELECT to_jsonb(reduced) AS row FROM ledger.reduced_judgement AS reduced WHERE run_id=$1 ORDER BY at_seq`, [runId]);
  const reviews = await rows(`SELECT to_jsonb(review) AS row FROM ledger.node_review AS review WHERE run_id=$1 ORDER BY at_seq`, [runId]);
  const answer = await rows(`SELECT to_jsonb(answer) AS row FROM serve.answer AS answer WHERE answer_id=$1 ORDER BY answer_version`, [answerId]);
  const factBundle = await rows(`SELECT to_jsonb(bundle) AS row FROM serve.fact_bundle AS bundle WHERE run_id=$1 ORDER BY version`, [runId]);
  const composed = await rows(`SELECT to_jsonb(composed) AS row FROM serve.composed_text AS composed
      JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id = composed.fact_bundle_id WHERE bundle.run_id=$1 ORDER BY composed.attempt`, [runId]);
  // The map (content as stored: the plain value, or the sentinel of a sealed run); `recorded_at` is a volatile key.
  const mapItems = await rows(`SELECT to_jsonb(item) AS row FROM core.map_item AS item WHERE run_id=$1 ORDER BY position, item_id`, [runId]);
  const mapChoice = await rows(`SELECT to_jsonb(choice) AS row FROM core.map_choice AS choice WHERE run_id=$1`, [runId]);
  const mapPositions = await rows(`SELECT to_jsonb(position) AS row FROM core.map_position AS position WHERE run_id=$1 ORDER BY root_index`, [runId]);
  return Object.freeze({
    nodes: named(nodes) as unknown[], edges: named(edges) as unknown[], reduced: named(reduced) as unknown[],
    reviews: named(reviews) as unknown[], answer: named(answer), composed: named(composed), factBundle: named(factBundle),
    mapItems: named(mapItems) as unknown[], mapChoice: named(mapChoice) as unknown[], mapPositions: named(mapPositions) as unknown[]
  });
}
