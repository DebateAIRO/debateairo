import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "@debateai/crypto";
import { MAP_FALLBACK_ANGLES, MAP_LIMITS, mapAngleCodeId, mapChosenAnswerCodeId } from "@debateai/map";

const sql = readFileSync(new URL("../../migrations/0117_debate_shape_map.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8");
/** tests/support has no shared helper; the same one as tests/architecture/tiers-s02-rosters.test.ts. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("0117: the debate shape's map tables", () => {
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

  describe("ruling T7-PRIV: every id in a readable column is code-minted, never an AI's own", () => {
    /** The pattern a column's CHECK holds it to, read from the SQL (the POSIX forms used are the same in JavaScript). */
    const checkPattern = (constraint: string, column: string): RegExp => {
      const at = sql.indexOf(`CONSTRAINT ${constraint} CHECK`);
      expect(at, constraint).toBeGreaterThan(-1);
      // The constraint ends at the first "),\n" after it (both span at most two lines).
      const statement = sql.slice(at, sql.indexOf("),\n", at) + 1);
      const match = new RegExp(`${column} ~ '([^']+)'`, "u").exec(statement);
      expect(match, `${constraint}: ${column}`).not.toBeNull();
      return new RegExp(match![1]!, "u");
    };
    const angleId = () => checkPattern("map_item_codes_shape", "angle_id");
    const answerId = () => checkPattern("map_position_answer_shape", "answer_id");
    const SLUGS = ["sell-family-home", "keep-renting", "opposite", "worry", "general", "filled-2", "an01", "kp01", "a-1", "g-1"];

    it("core.map_item.angle_id takes g1..gN up to the map's most angles, and refuses an AI's slug", () => {
      const pattern = angleId();
      const minted = Array.from({ length: MAP_LIMITS.anglesMax }, (_unused, index) => mapAngleCodeId(index));
      for (const id of [...minted, ...MAP_FALLBACK_ANGLES.map((angle) => angle.angleId)]) expect(pattern.test(id), id).toBe(true);
      for (const id of [...SLUGS, mapAngleCodeId(MAP_LIMITS.anglesMax), "g0", "G1", "g1 ", "a1"]) expect(pattern.test(id), id).toBe(false);
    });

    it("core.map_position.answer_id takes a1..aN up to the map's most answers, and refuses an AI's slug", () => {
      const pattern = answerId();
      const minted = Array.from({ length: MAP_LIMITS.chooseAnswersMax }, (_unused, index) => mapChosenAnswerCodeId(index));
      for (const id of minted) expect(pattern.test(id), id).toBe(true);
      for (const id of [...SLUGS, mapChosenAnswerCodeId(MAP_LIMITS.chooseAnswersMax), "a0", "A1", "a1 ", "g1"]) expect(pattern.test(id), id).toBe(false);
    });

    it("keeps the item id code form and no other free id column", () => {
      expect(sql).toContain("CONSTRAINT map_item_id_shape CHECK (item_id ~ '^[a-z]{2}[0-9]{2,4}$')");
      // The two id columns an AI could once fill hold the code forms only: no open slug pattern is left anywhere.
      expect(sql).not.toContain("[a-z0-9][a-z0-9-]{0,23}");
    });
  });

  it("core.map_position's root is a node of the same run (composite foreign key on core.node's UNIQUE (run_id, node_id))", () => {
    expect(sql).toContain("CONSTRAINT map_position_root_node_same_run FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id)");
    expect(sql).not.toContain("REFERENCES core.node(node_id)");
  });

  it("mirrors the tables in the Drizzle schema", () => {
    for (const name of ["mapItem", "mapChoice", "mapPosition"]) expect(schema).toContain(`export const ${name} = core.table(`);
  });
});
