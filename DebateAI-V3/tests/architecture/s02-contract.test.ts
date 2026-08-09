import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);

describe("S02 DDL and carrier contract", () => {
  it("keeps every first-class edge invariant in the creating migration", async () => {
    const migration = await readFile(new URL("migrations/0002_s02.sql", root), "utf8");
    for (const required of [
      "CREATE TABLE core.edge",
      "FOREIGN KEY (run_id, source_node_id)",
      "FOREIGN KEY (run_id, target_node_id)",
      "FOREIGN KEY (run_id, target_edge_id, target_edge_polarity)",
      "kind <> 'undercutting'",
      "magnitude_status = 'UNKNOWN' AND strength IS NULL",
      "magnitude_status = 'MEASURED' AND strength IS NOT NULL",
      "polarity = 'attack' AND kind IS NOT NULL",
      "target_kind <> 'EDGE'",
      "kind IS NOT NULL AND kind = 'undercutting'",
      "strength_source <> 'UNDERCUT_TRANSMISSION'",
      "source_node_id <> target_node_id",
      "CREATE UNIQUE INDEX IF NOT EXISTS edge_identity_unique"
    ]) {
      expect(migration).toContain(required);
    }
  });

  it("derives arrow order with explicit NULLS FIRST and never opaque-id ordering", async () => {
    const graph = await readFile(new URL("packages/graph/src/index.ts", root), "utf8");
    expect(graph).toContain("edge.kind NULLS FIRST");
    expect(graph).toContain("source.materialized_path, source.sibling_ordinal, edge.created_at_seq");
    expect(graph).not.toMatch(/ORDER BY[^`]*edge\.edge_id/s);
  });

  it("keeps the S01 ledger carrier aligned with all migration columns", async () => {
    const schema = await readFile(new URL("packages/db/src/schema.ts", root), "utf8");
    for (const carrier of ["attemptId", "callSiteKey", "actorRef", "rawArtifactRef", "startedAt", "finishedAt"]) {
      expect(schema).toContain(`${carrier}:`);
    }
  });

  it("baselines a pre-ledger S01 database without replay failure", async () => {
    const migration = await readFile(new URL("migrations/0001_s01.sql", root), "utf8");
    expect(migration.match(/IF NOT EXISTS/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).toContain("column_name = 'operator_resolutions'");
    expect(migration).toContain("column_name = 'operator_by_parent'");
  });
});
