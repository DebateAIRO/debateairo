import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { auditMigrationReplaySafety } from "../../tools/orphan-audit/src/index.js";

const migrations = new URL("../../migrations/", import.meta.url);
const source = () => readFile(new URL("0125_synthesis_check.sql", migrations), "utf8");
const sevenTables = [
  "serve.synthesis_check_request", "serve.synthesis_check_attempt", "serve.synthesis_check_result",
  "serve.synthesis_check_inheritance", "serve.synthesis_check_removal_request",
  "serve.synthesis_check_removal_notice", "identity.synthesis_check_erasure_binding"
] as const;
const erasureFunctions = [
  "core.prepare_synthesis_check_erasures(integer)",
  "core.pending_synthesis_check_erasure_cleanup(integer)",
  "core.finalize_synthesis_check_erasure(uuid,timestamptz,timestamptz,integer,integer)"
] as const;
const runtimeFunctions = [
  "serve.take_synthesis_check_removal_notice(uuid)",
  "serve.synthesis_check_removal_notice_exists(uuid)",
  "serve.purge_expired_synthesis_check_removal_notices()",
  "serve.run_removed_by_synthesis_check(uuid)"
] as const;
const writerFunctions = [
  "serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)",
  "serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid)"
] as const;

describe("0125 synthesis check database contract", () => {
  it("0125 is replay-safe in the repository's form", async () => {
    const plan = await loadMigrationPlan();
    const migrateSource = await readFile(new URL("../../packages/db/src/index.ts", import.meta.url), "utf8");
    expect(auditMigrationReplaySafety("migrations/0125_synthesis_check.sql", await source(), { plan, migrateSource })).toEqual([]);
  });

  it("0125 creates the check tables with their named constraints and the one-final-per-synthesis partial unique index", async () => {
    const sql = await source();
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([
      ...sevenTables.slice(0, 3), sevenTables[3], sevenTables[4], sevenTables[5], sevenTables[6]
    ]);
    for (const name of [
      "synthesis_check_request_answer_fk", "synthesis_check_request_one_per_answer_version",
      "synthesis_check_attempt_answer_fk", "synthesis_check_attempt_origin_is_coherent",
      "synthesis_check_attempt_one_per_request", "synthesis_check_result_answer_fk",
      "synthesis_check_result_origin_fk", "synthesis_check_result_origin_not_later",
      "synthesis_check_result_final_is_coherent", "synthesis_check_result_one_per_attempt",
      "synthesis_check_inheritance_answer_fk"
    ]) expect(sql, name).toContain(name);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS synthesis_check_result_one_final_per_synthesis\s+ON serve\.synthesis_check_result \(answer_id, synthesis_origin_version\) WHERE final/u);
    expect(sql).not.toMatch(/\bverdict\s+text\b/u);
  });

  it("0125 widens the spend source list by exactly SYNTHESIS_CHECK and adds model_spend_synthesis_check_names_its_run", async () => {
    const sql = await source();
    expect(sql).toContain("spend_source IN ('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK', 'SYNTHESIS_CHECK')");
    expect(sql).toContain("model_spend_synthesis_check_names_its_run");
    expect(sql).toContain("spend_source <> 'SYNTHESIS_CHECK' OR (run_id IS NOT NULL AND spend_phase IS NULL AND attempt_id IS NULL)");
  });

  it("0125 leaves direct runtime INSERT only on request and attempt; results and restricted writes use definer functions", async () => {
    const sql = await source();
    const ordinary = sql.match(/GRANT SELECT, INSERT ON ([^;]+) TO debateai_runtime;/u)?.[1] ?? "";
    for (const table of [sevenTables[0], sevenTables[1]]) {
      expect(ordinary, table).toContain(table);
    }
    for (const table of [sevenTables[2], sevenTables[3], sevenTables[4], sevenTables[5]]) expect(ordinary).not.toContain(table);
    // REV-S01-p3 security N1 (t_52f57ef1): a direct INSERT would bypass the writer's one-final-per-synthesis guard.
    expect(sql).toMatch(/GRANT SELECT ON [^;]*serve\.synthesis_check_result[^;]* TO debateai_runtime;/u);
    expect(sql).not.toMatch(/GRANT [^;]*INSERT[^;]*serve\.synthesis_check_result[^;]*TO debateai_runtime;/u);
    expect(sql).toContain("GRANT SELECT ON serve.synthesis_check_result, serve.synthesis_check_inheritance,");
    expect(sql).toContain("serve.synthesis_check_removal_request TO debateai_runtime;");
    expect(sql).not.toContain("GRANT INSERT ON serve.synthesis_check_removal_notice TO debateai_runtime;");
    expect(sql).not.toMatch(/GRANT [^;]*SELECT[^;]*synthesis_check_removal_notice/u);
    expect(sql).not.toMatch(/GRANT [^;]*identity\.synthesis_check_erasure_binding/u);
    expect(sql).not.toMatch(/GRANT (?:UPDATE|DELETE|TRUNCATE|ALL) ON (?:serve|identity)\.synthesis_check_/u);
  });

  it("the result table is a content carrier: CONTENT_CARRIERS lists serve.synthesis_check_result and schema.ts declares its content_ciphertext and content_attestation", async () => {
    expect(CONTENT_CARRIERS).toContain("serve.synthesis_check_result");
    const schema = await readFile(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8");
    const block = schema.slice(schema.indexOf('serve.table("synthesis_check_result"'));
    expect(block).toContain('contentCiphertext: jsonb("content_ciphertext")');
    expect(block).toContain('contentAttestation: bytea("content_attestation")');
  });

  it("no earlier migration names any function 0125 creates", async () => {
    const names = [
      "enforce_synthesis_check_answer_run", "enforce_content_attestation_v2_synthesis_check_result",
      "enforce_content_ciphertext_synthesis_check_result", "enforce_erasure_barrier_synthesis_check_result",
      "enforce_synthesis_check_inheritance", "enforce_synthesis_check_removal_request",
      ...erasureFunctions.map((signature) => signature.split("(")[0]!.split(".")[1]!),
      ...runtimeFunctions.map((signature) => signature.split("(")[0]!.split(".")[1]!),
      ...writerFunctions.map((signature) => signature.split("(")[0]!.split(".")[1]!)
    ];
    for (const file of await readdir(migrations)) {
      if (!/^\d{4}_.+\.sql$/u.test(file) || file >= "0125_") continue;
      const earlier = await readFile(new URL(file, migrations), "utf8");
      for (const name of names) expect(earlier, `${file}: ${name}`).not.toContain(`${name}(`);
    }
  });

  it("the seven deletion functions are SECURITY DEFINER with search_path pg_catalog; the three core ones are granted to debateai_erasure_runtime only and the four serve ones to debateai_runtime only", async () => {
    const sql = await source();
    for (const signature of [...erasureFunctions, ...runtimeFunctions]) {
      const name = signature.split("(")[0]!;
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf("$$;", start);
      const definition = sql.slice(start, end);
      expect(definition, name).toContain("SECURITY DEFINER");
      expect(definition, name).toContain("SET search_path = pg_catalog");
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO ${erasureFunctions.includes(signature as typeof erasureFunctions[number]) ? "debateai_erasure_runtime" : "debateai_runtime"};`);
    }
  });

  it("the two restricted writers are SECURITY DEFINER and executable by runtime, with no PUBLIC grant", async () => {
    const sql = await source();
    for (const signature of writerFunctions) {
      const name = signature.split("(")[0]!;
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      expect(start).toBeGreaterThanOrEqual(0);
      const definition = sql.slice(start, sql.indexOf("$$;", start));
      expect(definition).toContain("SECURITY DEFINER SET search_path = pg_catalog");
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`);
    }
  });

  it("forward 0125 records both restricted writers in its pinned function postcondition", async () => {
    const forward = await readFile(new URL("../../packages/db/src/migration-forward0125.ts", import.meta.url), "utf8");
    for (const signature of writerFunctions) {
      expect(forward).toContain(`"${signature}"`);
    }
  });

  it("ERASURE_FUNCTION_SIGNATURES lists the three erasure functions 0125 creates", async () => {
    const db = await readFile(new URL("../../packages/db/src/account-erasure.ts", import.meta.url), "utf8");
    const signatures = db.slice(db.indexOf("const ERASURE_FUNCTION_SIGNATURES"), db.indexOf("] as const", db.indexOf("const ERASURE_FUNCTION_SIGNATURES")));
    for (const signature of erasureFunctions) expect(signatures).toContain(`"${signature}"`);
  });

  it("0125 widens publication_ref_tombstone_ref_kind_check to exactly 19 kinds: 0040's 15 in 0040's order, then synthesis_check_erasure_request, synthesis_check_erasure_audit_id, synthesis_check_erasure_audit_actor and synthesis_check_erasure_audit_target, dropped IF EXISTS first", async () => {
    const old = await readFile(new URL("0040_account_erasure.sql", migrations), "utf8");
    const next = await source();
    const kinds = (text: string) => [...(text.match(/ref_kind IN \(([^)]+)\)/u)?.[1] ?? "").matchAll(/'([^']+)'/gu)].map((match) => match[1]);
    expect(kinds(old)).toHaveLength(15);
    expect(next).toContain("DROP CONSTRAINT IF EXISTS publication_ref_tombstone_ref_kind_check");
    expect(kinds(next)).toEqual([...kinds(old),
      "synthesis_check_erasure_request", "synthesis_check_erasure_audit_id",
      "synthesis_check_erasure_audit_actor", "synthesis_check_erasure_audit_target"
    ]);
  });
});
