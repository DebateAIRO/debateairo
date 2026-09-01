import { afterEach, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * T5 (S3-1) — UPGRADE transition for `0052`, not a from-empty run.
 *
 * A from-empty migration run cannot exercise a row that was legal before
 * `0052`, and every interesting question about this migration is about such a
 * row. Each arm applies the ledger only THROUGH `0051`, seeds a shape that was
 * valid at that point, then applies `0052` alone against it.
 *
 * Two legacy shapes matter and the policy DIFFERS between them, which is the
 * whole reason both are tested:
 *
 *   (a) `UNKNOWN` / `NULL` / `EVIDENCE_VERIFIER` — the ordinary placeholder
 *       every shipped writer produced before T5. **Policy: RENAME.** The stamp
 *       on a NULL strength names an INTENDED source; it does not assert that a
 *       measurement happened. Renaming it invents nothing, and
 *       `magnitude_status` and `strength` must come through untouched — that
 *       last part is what this arm actually guards, because a migration that
 *       renamed the stamp AND minted a magnitude would be fabricating evidence.
 *
 *   (b) `MEASURED` / `<number>` / `EVIDENCE_VERIFIER` — a real number
 *       attributed to a role that never measured anything. **Policy: REFUSE,
 *       loudly and non-destructively.** No shipped writer could produce one
 *       (the repealed DR-184 sentinel proved exactly that by scanning the
 *       source), but that is a fact about this source history, not about a
 *       deployed database. Relabelling it would launder its provenance, so the
 *       operator decides and the migration does not decide for them.
 *
 * Each arm gets its OWN database: arm (b) leaves a row that `0052` refuses, so
 * the two shapes cannot share a schema history.
 */

const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const THROUGH = "0051_t8_remove_strict_and.sql";
const RENAME = "0052_t5_reviewer_measured_edges.sql";
const RETIRED_STAMP = "EVIDENCE_VERIFIER";

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.stop();
  database = undefined;
});

async function migrationNames(): Promise<readonly string[]> {
  return (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
}

async function applyThrough(target: TestDatabase, through: string): Promise<void> {
  const names = await migrationNames();
  const cutoff = names.indexOf(through);
  if (cutoff === -1) throw new Error(`T5_TEST_FIXTURE: unknown migration ${through}`);
  const client = await target.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
        name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
        applied_at timestamptz NOT NULL
      )
    `);
    for (const name of names.slice(0, cutoff + 1)) {
      await client.query(await readFile(new URL(name, MIGRATIONS), "utf8"));
      await client.query(
        "INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())",
        [name]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Applies ONE migration in its own transaction, so a refusal rolls back whole. */
async function applyOne(target: TestDatabase, name: string): Promise<void> {
  const client = await target.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(new URL(name, MIGRATIONS), "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedRun(target: TestDatabase, label: string): Promise<string> {
  const result = await target.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line, asker_id, session_id, caller_scope, as_of,
      asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
      composition_budget_tier, depth_params, agent_count, discovered_panel,
      stranger_sample_rate, envelope_basis, register_version,
      battery_version, created_at_seq
    ) VALUES (
      $1, $2, $3, 'ASKER', '2026-08-08T00:00:00.000Z',
      'casual', 'casual', 'ASKER', $4,
      'low', '{}', 1,
      '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
      1, '{}', 1, 't5-upgrade', ledger.allocate_sequence()
    ) RETURNING run_id
  `, [label, `asker:${label}`, `session:${label}`, `asker-declaration:${label}`]);
  return result.rows[0]!.run_id;
}

async function seedNode(target: TestDatabase, runId: string, input: {
  readonly claimText: string;
  readonly parentNodeId?: string;
  readonly siblingOrdinal?: number;
}): Promise<string> {
  const parent = input.parentNodeId === undefined ? null : input.parentNodeId;
  const ordinal = input.siblingOrdinal ?? 0;
  const result = await target.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
      materialized_path, generation_status, path_status, exploration_decision,
      way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
    ) VALUES ($1,$2,'unknown',$3,$4,$5,$6,$7,'complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())
    RETURNING node_id
  `, [runId, input.claimText, parent, parent === null ? null : "defeater",
    parent === null ? 0 : 1, ordinal, parent === null ? "0" : `0/${String(ordinal)}`]);
  return result.rows[0]!.node_id;
}

/** An edge exactly as it was legal to write at `0051`. */
async function seedLegacyEdge(target: TestDatabase, input: {
  readonly runId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly strength: number | null;
  readonly magnitudeStatus: "MEASURED" | "UNKNOWN";
}): Promise<string> {
  const result = await target.pool.query<{ edge_id: string }>(`
    INSERT INTO core.edge (
      run_id, source_node_id, target_kind, target_node_id, target_edge_id,
      target_edge_polarity, polarity, kind, strength, magnitude_status,
      strength_source, provenance_ref, created_at_seq
    ) VALUES ($1,$2,'NODE',$3,NULL,NULL,'attack','rebutting',$4,$5,$6,'provenance:t5-upgrade',ledger.allocate_sequence())
    RETURNING edge_id
  `, [input.runId, input.sourceNodeId, input.targetNodeId, input.strength,
    input.magnitudeStatus, RETIRED_STAMP]);
  return result.rows[0]!.edge_id;
}

async function seedEdgeOfShape(magnitudeStatus: "MEASURED" | "UNKNOWN", strength: number | null): Promise<{
  readonly target: TestDatabase; readonly edgeId: string;
}> {
  const target = await startTestDatabase();
  database = target;
  await applyThrough(target, THROUGH);
  const runId = await seedRun(target, `t5-upgrade-${magnitudeStatus.toLowerCase()}`);
  const rootId = await seedNode(target, runId, { claimText: "The parent position" });
  const childId = await seedNode(target, runId, {
    claimText: "The attacking position", parentNodeId: rootId, siblingOrdinal: 1
  });
  const edgeId = await seedLegacyEdge(target, {
    runId, sourceNodeId: childId, targetNodeId: rootId, strength, magnitudeStatus
  });
  return { target, edgeId };
}

describe("T5 · 0052 upgrade from a 0051-shaped database", () => {
  it("arm (a) RENAMES an UNKNOWN placeholder without inventing a magnitude", async () => {
    const { target, edgeId } = await seedEdgeOfShape("UNKNOWN", null);

    // The retired stamp is legal at 0051 — that is the premise of this arm.
    const before = await target.pool.query<{ strength_source: string }>(
      "SELECT strength_source FROM core.edge WHERE edge_id=$1", [edgeId]
    );
    expect(before.rows[0]!.strength_source).toBe(RETIRED_STAMP);

    await expect(applyOne(target, RENAME)).resolves.toBeUndefined();

    const after = await target.pool.query<{
      strength: number | null; magnitude_status: string; strength_source: string;
    }>(
      "SELECT strength, magnitude_status, strength_source FROM core.edge WHERE edge_id=$1", [edgeId]
    );
    // Renamed — and the magnitude it never had is still absent.
    expect(after.rows[0]).toEqual({
      strength: null, magnitude_status: "UNKNOWN", strength_source: "REVIEWER"
    });
  }, 240_000);

  it("arm (a) leaves the replacement stamp constraint VALIDATED, not merely promised", async () => {
    const { target } = await seedEdgeOfShape("UNKNOWN", null);
    await applyOne(target, RENAME);

    // NOT VALID alone would let exactly the rows this migration renamed hide
    // behind a green migration.
    const constraint = await target.pool.query<{ convalidated: boolean }>(
      `SELECT convalidated FROM pg_constraint
        WHERE conrelid='core.edge'::regclass AND conname='edge_strength_source_check'`
    );
    expect(constraint.rows[0]!.convalidated).toBe(true);

    // And the retired literal is refused from here on.
    await expect(target.pool.query(
      `UPDATE core.edge SET strength_source=$1`, [RETIRED_STAMP]
    )).rejects.toThrow();
  }, 240_000);

  it("arm (b) REFUSES a measured magnitude under the retired stamp, non-destructively", async () => {
    const { target, edgeId } = await seedEdgeOfShape("MEASURED", 0.75);

    await expect(applyOne(target, RENAME)).rejects.toThrowError(
      /T5_LEGACY_MEASURED_EVIDENCE_VERIFIER/
    );

    // Non-destructive: the row the operator must rule on is untouched, and the
    // pre-0052 vocabulary is still in force because the whole file rolled back.
    const after = await target.pool.query<{
      strength: number | null; magnitude_status: string; strength_source: string;
    }>(
      "SELECT strength, magnitude_status, strength_source FROM core.edge WHERE edge_id=$1", [edgeId]
    );
    expect(after.rows[0]).toEqual({
      strength: 0.75, magnitude_status: "MEASURED", strength_source: RETIRED_STAMP
    });
    const applied = await target.pool.query<{ name: string }>(
      "SELECT name FROM public.debateai_schema_migration WHERE name=$1", [RENAME]
    );
    expect(applied.rowCount).toBe(0);
  }, 240_000);

  it("arm (b) becomes applicable once the operator has ruled on the offending row", async () => {
    const { target, edgeId } = await seedEdgeOfShape("MEASURED", 0.75);
    await expect(applyOne(target, RENAME)).rejects.toThrow();

    // The operator's disposition, whatever it is, has to reach the row itself;
    // here it is the narrowest one that preserves the recorded number.
    await target.pool.query("ALTER TABLE core.edge DISABLE TRIGGER reject_mutation");
    await target.pool.query(
      "UPDATE core.edge SET strength=NULL, magnitude_status='UNKNOWN' WHERE edge_id=$1", [edgeId]
    );
    await target.pool.query("ALTER TABLE core.edge ENABLE TRIGGER reject_mutation");

    await expect(applyOne(target, RENAME)).resolves.toBeUndefined();
    const after = await target.pool.query<{ strength_source: string }>(
      "SELECT strength_source FROM core.edge WHERE edge_id=$1", [edgeId]
    );
    expect(after.rows[0]!.strength_source).toBe("REVIEWER");
  }, 240_000);
});
