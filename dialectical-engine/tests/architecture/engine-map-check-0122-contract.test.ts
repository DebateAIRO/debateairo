// tests/architecture/engine-map-check-0122-contract.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAP_ANSWER_CHECK_CODE } from "@debateai/map";

/**
 * 0122 (engine redesign spec 2026-10-15 §5.7, plan R3 Task 10): engine 2's map answer step stores what each point rests
 * on and the answer check's codes in two NEW append-only tables. 0117's tables are never altered (their digest is
 * compared on every migrate) and never referenced by a foreign key (it would break 0117's TRUNCATE guard first).
 */
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const sql = readFileSync(new URL("0122_engine_map_check.sql", MIGRATIONS), "utf8");
const TABLES = ["core.map_item_rests_on", "core.map_answer_check"] as const;

describe("0122: the map answer step's two code tables", () => {
  it("creates exactly the two tables and alters, references or defines nothing else", () => {
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map(([, name]) => name)).toEqual([...TABLES]);
    expect(sql).not.toMatch(/ALTER TABLE/u);
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/u);
    expect(sql).not.toMatch(/REFERENCES core\.map_/u);
    for (const earlier of readdirSync(MIGRATIONS).filter((name) => /^\d{4}_.+\.sql$/u.test(name) && name < "0122_")) {
      const text = readFileSync(new URL(earlier, MIGRATIONS), "utf8");
      for (const table of TABLES) expect(text, earlier).not.toContain(table);
    }
  });

  it("holds codes only, under the closed sets the map package writes", () => {
    expect(sql).toContain("CONSTRAINT map_item_rests_on_closed CHECK (rests_on IN ('question', 'assumption'))");
    expect(sql).toContain("CONSTRAINT map_item_rests_on_item_shape CHECK (item_id ~ '^pt[0-9]{2,4}$')");
    const one = MAP_ANSWER_CHECK_CODE.source.slice(1, -1);
    expect(sql).toContain(`array_to_string(answer_check, ',') ~ '^${one}(,${one})*$'`);
    expect(sql).toContain("cardinality(answer_check) BETWEEN 1 AND 8");
    expect(sql).toContain("array_position(answer_check, NULL) IS NULL");
    expect(sql).toContain("checker_maker IS NULL OR core.jsonb_is_code_token(to_jsonb(checker_maker))");
    // Ruling (premiseExempt storage), pre-flight consistency: the premise-exempt check ids, ids only, at most 8.
    expect(sql).toContain("premise_exempt text[] NOT NULL DEFAULT '{}'");
    expect(sql).toContain("cardinality(premise_exempt) <= 8");
    expect(sql).toContain("array_to_string(premise_exempt, ',') ~ '^(a[1-4]|c[1-4])(,(a[1-4]|c[1-4]))*$'");
  });

  it("each table is erasure-barred, append-only, truncate-guarded and granted like 0119's code table, and says so itself", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`DROP TRIGGER IF EXISTS enforce_erasure_barrier ON ${table};`);
      expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql).toMatch(new RegExp(String.raw`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}\s+FOR EACH STATEMENT EXECUTE FUNCTION core\.reject_mutation\(\);`, "u"));
      expect(sql).toContain(`REVOKE ALL ON ${table} FROM PUBLIC;`);
      expect(sql).toContain(`GRANT SELECT, INSERT ON ${table} TO debateai_runtime;`);
      expect(sql).toContain(`GRANT SELECT ON ${table} TO debateai_replay;`);
    }
    expect(sql).toContain("RAISE EXCEPTION 'ENGINE_MAP_CHECK_GUARD_CONTRACT_INCOMPLETE'");
  });

  it("follows R2 in the chain, with its own loader", () => {
    const manifest = JSON.parse(readFileSync(new URL("lineage/engine-map-check-forward0122.json", MIGRATIONS), "utf8")) as
      { version: string; previous: { name: string }; migration: { name: string } };
    expect(manifest.version).toBe("engine-map-check-forward0122-v1");
    expect(manifest.migration.name).toBe("0122_engine_map_check.sql");
    expect(manifest.previous.name).toBe("0121_engine_verdict.sql");
    // 0123 follows 0122, which still follows R2 in the one chain list.
    expect(readFileSync(new URL("../../packages/db/src/migration-forward-chain.ts", import.meta.url), "utf8")).toContain("loadForward0121,loadForward0122,loadForward0123]");
  });
});
