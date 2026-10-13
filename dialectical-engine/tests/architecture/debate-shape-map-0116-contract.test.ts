import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "@debateai/crypto";

const sql = readFileSync(new URL("../../migrations/0116_debate_shape_map.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8");
/** tests/support has no shared helper; the same one as tests/architecture/tiers-s02-rosters.test.ts. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("0116: the debate shape's map tables", () => {
  it.each(["core.map_item", "core.map_choice", "core.map_position"])("%s is append-only, TRUNCATE-guarded and granted like a carrier", (table) => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
    expect(sql).toMatch(new RegExp(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}`, "u"));
    expect(sql).toContain(`GRANT SELECT, INSERT ON ${table} TO debateai_runtime;`);
    expect(sql).toContain(`GRANT SELECT ON ${table} TO debateai_replay;`);
    expect(sql).not.toMatch(new RegExp(`GRANT[^;]*(UPDATE|DELETE|TRUNCATE)[^;]*ON ${table.replace(".", "\\.")}`, "u"));
  });

  it.each(["core.map_item", "core.map_choice"])("%s carries encrypted content with its own guards and the erasure barrier", (table) => {
    const suffix = table.split(".")[1];
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_${suffix}()`);
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_${suffix}()`);
    expect(sql).toContain(`CREATE TRIGGER enforce_erasure_barrier\nBEFORE INSERT ON ${table}`);
    expect(CONTENT_CARRIERS).toContain(table);
  });

  it("core.map_position is erasure-barred too: an erased run refuses new rows before the root's foreign key is checked", () => {
    // Pre-flight PF-B26: map_position holds no debate text, but Task 8's writeMapPosition must answer RUN_ERASED on an
    // erased run (not the root_node_id foreign key's 23503), so 0040's barrier runs BEFORE INSERT here as well.
    expect(sql).toContain("DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_position;");
    expect(sql).toContain("CREATE TRIGGER enforce_erasure_barrier\nBEFORE INSERT ON core.map_position\nFOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();");
    expect(CONTENT_CARRIERS).not.toContain("core.map_position");
  });

  it("never redefines a function an earlier migration owns", () => {
    // Pre-flight PF-B25: anchored on CREATE, because this file must still EXECUTE FUNCTION core.enforce_erasure_barrier()
    // and core.reject_mutation() in its triggers (the 0090 pattern).
    for (const owned of ["core.progress_value_is_code_shaped", "core.enforce_erasure_barrier()", "core.reject_mutation()", "core.install_truncate_guard"]) {
      expect(sql).not.toMatch(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+` + escapeRegExp(owned.replace(/\(\)$/u, "")), "u"));
    }
  });

  it("mirrors the tables in the Drizzle schema", () => {
    for (const name of ["mapItem", "mapChoice", "mapPosition"]) expect(schema).toContain(`export const ${name} = core.table(`);
  });
});
