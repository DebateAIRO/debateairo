import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 0117 (question-language spec 2026-10-13, plan P2L Task 19): the fast language check's site cost. One short call made
 * before a debate exists: a row in the day's pot (`readDaySpentMicros`), never a run's and never a person's. Pre-flight
 * PF-L58, option (a): the SECURITY DEFINER function is the ONLY writer of a LANGUAGE_CHECK row (recordSpend refuses it).
 */
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const sql = readFileSync(new URL("0117_language_check_spend.sql", MIGRATIONS), "utf8");
const SIGNATURE = String.raw`ledger\.record_language_check_spend\(uuid,text,date,bigint,bigint,bigint\)`;

describe("0117: the language check's run-less site cost", () => {
  it("widens the source CHECK by exactly LANGUAGE_CHECK and keeps a run-less row phase-less", () => {
    expect(sql).toMatch(/CHECK \(spend_source IN \('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK'\)\)/u);
    expect(sql).toMatch(/spend_source <> 'LANGUAGE_CHECK' OR \(run_id IS NULL AND spend_phase IS NULL\)/u);
  });
  it("writes only through one SECURITY DEFINER function, granted to the runtime role alone", () => {
    // Deviation from the brief's `CREATE FUNCTION` (Task 19 report): the repository's replay-safety law
    // (tools/orphan-audit auditMigrationReplaySafety, tests/architecture/scaffold.test.ts) refuses a bare CREATE FUNCTION.
    // The brief's intent — this step defines a NEW function and replaces none — is pinned instead: exactly one function
    // is created, it is this one, and no earlier migration names it.
    expect([...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_.]+)\(/gu)].map(([, name]) => name))
      .toEqual(["ledger.record_language_check_spend"]);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION ledger\.record_language_check_spend\(/u);
    for (const earlier of readdirSync(MIGRATIONS).filter((name) => /^\d{4}_.+\.sql$/u.test(name) && name < "0117_")) {
      expect(readFileSync(new URL(earlier, MIGRATIONS), "utf8"), earlier).not.toContain("record_language_check_spend");
    }
    expect(sql).toMatch(/SECURITY DEFINER/u);
    expect(sql).toMatch(/SET search_path = pg_catalog/u);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION ledger\.record_language_check_spend\([^)]*\) FROM PUBLIC/u);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION ledger\.record_language_check_spend\([^)]*\) TO debateai_runtime;/u);
  });
  it("is replay-safe in the repository's form: each CHECK dropped IF EXISTS before it is added", () => {
    for (const name of ["model_spend_spend_source_check", "model_spend_language_check_is_runless"]) {
      expect(sql).toMatch(new RegExp(String.raw`DROP CONSTRAINT IF EXISTS ${name},\s+ADD CONSTRAINT ${name} CHECK`, "u"));
    }
  });
  it("is owned like 0093's spend writers (debateai_staff_security_owner), and no other role may execute it", () => {
    // The definer runs with its OWNER's rights: the NOLOGIN role 0093/0107 gave column INSERT on ledger.model_spend, never
    // the migration owner. Every other application role is revoked by name, as 0093 revokes its writers.
    expect(sql).toMatch(new RegExp(String.raw`ALTER FUNCTION ${SIGNATURE} OWNER TO debateai_staff_security_owner;`, "u"));
    expect(sql).toMatch(new RegExp(String.raw`REVOKE ALL ON FUNCTION ${SIGNATURE}\s+FROM PUBLIC,debateai_runtime,debateai_staff_recovery;`, "u"));
    expect([...sql.matchAll(/\bGRANT\b[^;]*;/gu)].map(([grant]) => grant))
      .toEqual(["GRANT EXECUTE ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) TO debateai_runtime;"]);
    // The row it writes names its source and nothing a run carries; no caller-chosen source, run, phase or attempt.
    expect(sql).toMatch(/VALUES \(p_spend_id, 'LANGUAGE_CHECK', NULL, p_provider_ref, p_charged_on, p_charge_micros, p_input_tokens, p_output_tokens, NULL, NULL\)/u);
  });
  // P2b pre-flight PF-B25: anchored on CREATE. A bare `FUNCTION <name>` substring check can never pass on a migration
  // that also says `EXECUTE FUNCTION <name>` or `GRANT EXECUTE ON FUNCTION <name>`.
  it("never redefines a function an earlier migration owns", () => {
    for (const owned of ["core.progress_value_is_code_shaped", "core.enforce_erasure_barrier()", "core.reject_mutation()", "core.install_truncate_guard"]) {
      expect(sql).not.toMatch(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+` + escapeRegExp(owned.replace(/\(\)$/u, "")), "u"));
    }
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
