// tests/architecture/owner-answer-writes-0155-contract.test.ts
// 0155: the owner's two writes on their own answer go through definers (upload check Task 9; owner decision of 3 November 2026).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0155_owner_answer_writes.sql";
const SQL = read(`migrations/${NAME}`);
const INVESTIGATION = "core.record_owned_investigation_request(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,bytea)";
const UNLINK = "memory.unlink_owned_memory_link(uuid,uuid,text,text)";
const bodyOf = (name: string): string => {
  const at = SQL.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return SQL.slice(at, SQL.indexOf("\n$$;", at));
};

describe("0155: the gap-investigation request and the memory-link unlink as the owner's definers", () => {
  it("follows 0154 last in the chain, with its own loader, and is bound to its own bytes", () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0154,loadForward0155]");
    expect(chain).toContain("import { loadForward0155 } from './migration-forward0155.js';");
    const loader = read("packages/db/src/migration-forward0155.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const PREVIOUS = "0154_region_iceland_liechtenstein.sql";');
    const previous = read("migrations/lineage/region-iceland-liechtenstein-forward0154.json");
    const manifest = JSON.parse(read("migrations/lineage/owner-answer-writes-forward0155.json")) as { previous: { manifestSha256: string }; migration: { sha256: string } };
    expect(manifest.previous.manifestSha256).toBe(sha256(previous));
    expect(manifest.migration.sha256).toBe(sha256(SQL));
  });

  it("is expand and keeps the verifier: two new functions, no table, nothing earlier redefined", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect([...SQL.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gmu)].map((match) => match[1]))
      .toEqual(["core.record_owned_investigation_request", "memory.unlink_owned_memory_link"]);
    expect(SQL).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE POLICY|ROW LEVEL SECURITY|\bUPDATE\s+[a-z_]+\.|\bDELETE\s+FROM\b/u);
  });

  it("each is a definer with the empty search path, refuses PUBLIC, and only debateai_runtime may call it; no table right is granted", () => {
    for (const name of ["core.record_owned_investigation_request", "memory.unlink_owned_memory_link"]) {
      const head = bodyOf(name).split("\nAS $$")[0]!;
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path = pg_catalog");
    }
    expect([...SQL.matchAll(/^GRANT (.*)$/gmu)].map((match) => match[1])).toEqual([
      `EXECUTE ON FUNCTION ${INVESTIGATION} TO debateai_runtime;`,
      `EXECUTE ON FUNCTION ${UNLINK} TO debateai_runtime;`
    ]);
    expect(SQL).toContain("EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_name);");
    expect(SQL).toContain("'core.lock_owned_live_runs(uuid[],uuid,text)'::regprocedure");
  });

  it("each locks the run through core.lock_owned_live_runs, checks the owner again after the lock, and answers NULL for every refusal", () => {
    for (const name of ["core.record_owned_investigation_request", "memory.unlink_owned_memory_link"]) {
      const body = bodyOf(name);
      const lock = body.indexOf("PERFORM 1 FROM core.lock_owned_live_runs(ARRAY[p_run_id],p_owner_ref,p_legacy_asker_id);");
      const owned = body.indexOf("IF core.run_is_owned_by(p_run_id,p_owner_ref,p_legacy_asker_id) IS DISTINCT FROM true THEN RETURN NULL; END IF;");
      const write = body.indexOf("INSERT INTO ");
      expect([lock > -1, owned > lock, write > owned], name).toEqual([true, true, true]);
      // A refusal is NULL, never a raised error a caller could tell apart: only a malformed call raises.
      expect([...body.matchAll(/RAISE EXCEPTION USING ERRCODE='([0-9A-Z]+)', MESSAGE='([A-Z_]+)'/gu)].map((match) => match[1]), name).toEqual(["22023"]);
    }
    expect(bodyOf("memory.unlink_owned_memory_link")).toMatch(/ORDER BY link\.at_seq DESC LIMIT 1\n  FOR UPDATE;/u);
  });
});
