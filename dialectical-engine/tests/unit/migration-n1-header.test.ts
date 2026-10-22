import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { N1_GRANDFATHERED_THROUGH, parseN1Header } from "../../packages/db/src/migration-n1.js";

/**
 * The ONE n1 header parser (side-by-side spec 2026-10-21 §5, "The N-1 rule"; plan A, task A6; A7 and A8 reuse it). A
 * migration after 0122 declares, in its leading comment block, exactly one of `-- n1: expand` / `-- n1: drained`,
 * optionally `-- n1: keeps-verifier`, and `-- n1: outside-transaction` only for an expand step whose whole body is one
 * concurrent index build. 0122 and earlier are grandfathered: they declare nothing and read all false.
 */
const refusalOf = (work: () => unknown): unknown => {
  try { work(); } catch (error) { return error; }
  return "NOT_REFUSED";
};
const invalid = (name: string, sql: string): void => {
  const refusal = refusalOf(() => parseN1Header(name, sql));
  expect(refusal, sql).toMatchObject({ code: "MIGRATION_N1_HEADER_INVALID" });
  expect(String((refusal as Error).message), sql).toMatch(/^MIGRATION_N1_HEADER_INVALID /u);
};
const ALL_FALSE = { expand: false, drained: false, keepsVerifier: false, outsideTransaction: false, concurrentIndex: null };
const CONCURRENT = "CREATE INDEX CONCURRENTLY IF NOT EXISTS probe_run_seq_idx ON core.run (created_at_seq);";

describe("side-by-side §5: parseN1Header", () => {
  it("reads a drained step that keeps the verifier", () => {
    const declaration = parseN1Header("0123_x.sql", "-- t\n-- n1: drained\n-- n1: keeps-verifier\nSELECT 1;");
    expect(declaration).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(Object.isFrozen(declaration)).toBe(true);
  });

  it("refuses a missing, doubled, contradictory, misplaced or misspelled declaration", () => {
    invalid("0123_x.sql", "-- t\nSELECT 1;");
    invalid("0123_x.sql", "-- t\n-- n1: keeps-verifier\nSELECT 1;");
    invalid("0123_x.sql", "-- n1: expand\n-- n1: drained\nSELECT 1;");
    invalid("0123_x.sql", `-- n1: drained\n-- n1: outside-transaction\n${CONCURRENT}`);
    invalid("0123_x.sql", `-- n1: expand\n-- n1: outside-transaction\n${CONCURRENT}\nSELECT 1;`);
    invalid("0123_x.sql", "-- t\nSELECT 1;\n-- n1: drained\n");
    invalid("0123_x.sql", "-- n1: expand\n-- n1: expand\nSELECT 1;");
    invalid("0123_x.sql", "-- n1: expnad\nSELECT 1;");
    invalid("0123_x.sql", "-- n1: expand \nSELECT 1;");
  });

  it("a reviewed line of the N-1 audit (A8) is no declaration, anywhere, but needs its reason", () => {
    const sql = "-- n1: expand\n-- n1: reviewed guard pair\nALTER TABLE core.run DROP CONSTRAINT IF EXISTS c;\n-- n1: reviewed again\nSELECT 1;";
    expect(parseN1Header("0199_probe.sql", sql)).toEqual({ expand: true, drained: false, keepsVerifier: false, outsideTransaction: false, concurrentIndex: null });
    invalid("0199_probe.sql", "-- n1: expand\n-- n1: reviewed\nSELECT 1;");
    invalid("0199_probe.sql", "-- n1: expand\nSELECT 1;\n-- n1: reviewed \nSELECT 2;");
  });

  it("an outside-transaction step is exactly one concurrent index build, which names the index and its table", () => {
    expect(parseN1Header("0199_probe_concurrent_index.sql", `-- probe\n-- n1: expand\n-- n1: keeps-verifier\n-- n1: outside-transaction\n${CONCURRENT}\n`))
      .toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: true, concurrentIndex: { schema: "core", table: "run", name: "probe_run_seq_idx" } });
    // Not CONCURRENTLY, not IF NOT EXISTS, an unqualified table, a quoted name, or a hidden second statement.
    for (const body of ["CREATE INDEX IF NOT EXISTS probe_run_seq_idx ON core.run (created_at_seq);",
      "CREATE INDEX CONCURRENTLY probe_run_seq_idx ON core.run (created_at_seq);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS probe_run_seq_idx ON run (created_at_seq);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"Probe\" ON core.run (created_at_seq);",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS probe_run_seq_idx ON core.run (created_at_seq) /* ; DROP TABLE core.run */;",
      "SELECT 1;"]) invalid("0199_probe.sql", `-- n1: expand\n-- n1: outside-transaction\n${body}`);
    // An expand step that does not declare outside-transaction runs inside its own transaction and names no index.
    expect(parseN1Header("0199_probe.sql", `-- n1: expand\n${CONCURRENT}`).concurrentIndex).toBeNull();
  });

  it("0122 and earlier are grandfathered: no header, all false", async () => {
    expect(N1_GRANDFATHERED_THROUGH).toBe("0122_engine_map_check.sql");
    expect(parseN1Header("0122_engine_map_check.sql", "SELECT 1;")).toEqual(ALL_FALSE);
    expect(parseN1Header("0001_s01.sql", "-- n1: expnad\nSELECT 1;")).toEqual(ALL_FALSE);
    expect(parseN1Header("0122_engine_map_check.sql", await readFile(new URL("../../migrations/0122_engine_map_check.sql", import.meta.url), "utf8")))
      .toEqual(ALL_FALSE);
  });

  it("0123 declares drained and keeps-verifier", async () => {
    const sql = await readFile(new URL("../../migrations/0123_side_by_side_releases.sql", import.meta.url), "utf8");
    expect(parseN1Header("0123_side_by_side_releases.sql", sql))
      .toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
  });
});
