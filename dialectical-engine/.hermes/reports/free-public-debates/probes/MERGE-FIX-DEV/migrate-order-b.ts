import {
  migrate,
  type Pool
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/merge-dev-0921/dialectical-engine/packages/db/src/index.js";

export const DEV_ONLY_MIGRATIONS = Object.freeze([
  "0050_t16_algorithm_register_rows.sql",
  "0051_t8_remove_strict_and.sql",
  "0052_t5_reviewer_measured_edges.sql",
  "0053_t06_review_outcome_disclosure.sql",
  "0054_tint1_reject_edge_mutation_public_revoke.sql",
  "0055_t10_served_root_selection.sql",
  "0057_t09_synthesis_round.sql",
  "0061_algorithm_publication_profiles.sql",
  "0062_obs_view_owner_column_floor.sql",
  "0063_serve_answer_content_carrier.sql",
  "0064_synthesis_role_cost_rows.sql"
] as const);

/**
 * Exercise the already-deployed-local order without renaming an immutable
 * migration: ledger markers hold the eleven dev files out of pass one; after
 * removing only those markers, the production migrate() function applies the
 * same files in its second pass.
 */
export async function migrateOrderB(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
      name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
      applied_at timestamptz NOT NULL
    )
  `);
  await pool.query(
    `INSERT INTO public.debateai_schema_migration(name, applied_at)
       SELECT unnest($1::text[]), statement_timestamp()
     ON CONFLICT (name) DO NOTHING`,
    [DEV_ONLY_MIGRATIONS]
  );
  await migrate(pool);
  await pool.query(
    "DELETE FROM public.debateai_schema_migration WHERE name=ANY($1::text[])",
    [DEV_ONLY_MIGRATIONS]
  );
  await migrate(pool);
}
