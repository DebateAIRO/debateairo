// tests/architecture/investigation-reports-0136-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditMigrationReplaySafety,
  definedFunctionNames,
  definedRelationNames,
  type N1AuditContext
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0136 (plan task W5-1, owner answer F7 A): the final report over an investigation, one per closing, written once by the
 * runner (its text sealed under the investigation's ROOT run key), the runner's readers, the person's reader, an export
 * reader and the spend source INVESTIGATION_REPORT. The last step of the chain, `expand`, keeping 0130's verifier. No
 * database here: the behaviour is tests/integration/investigation-report-database.test.ts.
 */
const NAME = "0136_investigation_reports.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/investigation-reports-forward0136.json";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/dig-picks-forward0135.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const body = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};
const tableBody = (sql: string, table: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  return sql.slice(at, sql.indexOf("\n);", at));
};

const TABLE = "identity.investigation_report";
const RUNTIME = [
  "identity.read_unreported_closings(integer)",
  "identity.read_investigation_waiting_of_run(uuid)",
  "identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)",
  "identity.read_investigation_reports_of_run(uuid)",
  "identity.read_closing_since_of_root(uuid)"
] as const;
const API = "identity.read_investigation_reports(uuid,uuid)";
const EXPORT_READER = "identity.read_data_export_investigation_reports(uuid,uuid)";
const CONTENT = "identity.enforce_investigation_report_content()";
const GUARD = "identity.guard_investigation_report_record()";
const HELPERS = ["identity.investigation_report_waiting(uuid)", "identity.investigation_reports_json(uuid)"] as const;
const DEFINERS = [...RUNTIME, API, EXPORT_READER] as const;
const SIGNATURES = [CONTENT, GUARD, ...HELPERS, ...DEFINERS] as const;
const ROLES = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime",
  "debateai_replay", "debateai_data_export_worker"] as const;

describe("0136: the final report over an investigation", () => {
  it("C-T is the last step of the chain's STEPS, after 0135, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0134,loadForward0135,loadForward0136]);");
    expect(chain).toContain("import { loadForward0136 } from './migration-forward0136.js';");
    const loader = read("packages/db/src/migration-forward0136.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "investigation-reports-forward0136-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/investigation-reports-forward0136.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain('const PREVIOUS = "0135_dig_picks.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0136_");
    expect(loader).toContain("export async function loadForward0136(");
    expect(loader).toContain(`"${TABLE}"`);
    for (const signature of SIGNATURES) expect(loader).toContain(`"${signature}"`);
    // Its evidence pins its own run rule on the ledger, never the shared source list later steps widen again.
    expect(loader).toContain('const OWN_CONSTRAINT = "model_spend_investigation_report_names_its_run";');
    expect(loader).not.toContain("model_spend_spend_source_check");
    expect(loader).toContain("return sha(JSON.stringify({ tables, functions, check }));");
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.slice(-2).map((step) => step.name)).toEqual(["0135_dig_picks.sql", NAME]);
    expect(plan.forwardChain.at(-1)?.previousName).toBe("0135_dig_picks.sql");
    expect(plan.forwardChain.at(-1)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0135's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "investigation-reports-forward0136-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: "0135_dig_picks.sql", manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-130.sql"))).toBe(VERIFIER_130);
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n")).toEqual(expect.arrayContaining(["-- n1: expand", "-- n1: keeps-verifier"]));
    expect(parseN1Header(NAME, sql)).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit and the replay audit, and only through its reviewed lines", async () => {
    const sql = read(SQL_PATH);
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME).sort();
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of earlier) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    expect(earlierRelations.has(TABLE)).toBe(false);
    // Never CREATE OR REPLACE a function another migration defines.
    for (const signature of SIGNATURES) expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).length).toBeGreaterThan(0);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O creates only its one account table, bound to its closing, truncate-guarded, append-only, keeping no text in clear", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([TABLE]);
    const columns = tableBody(sql, TABLE);
    expect(columns).toMatch(/owner_ref uuid NOT NULL REFERENCES identity\."user"\(owner_ref\) ON DELETE CASCADE/u);
    expect(columns).toContain("REFERENCES identity.investigation_closing(investigation_id, report_version) ON DELETE CASCADE");
    expect(columns).toContain("CONSTRAINT investigation_report_pkey PRIMARY KEY (investigation_id, report_version)");
    expect(columns).toContain("report_id uuid NOT NULL CONSTRAINT investigation_report_id_once UNIQUE");
    expect(columns).not.toMatch(/\b(?:text|question|answer|line|summary|words|body|report_text)\s+(?:text|jsonb)\b/u);
    expect(columns).toContain("(outcome = 'FAILED') = (content_ciphertext IS NULL)");
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
    expect(sql).toContain(`CREATE TRIGGER guard_investigation_report_record BEFORE UPDATE OR DELETE ON ${TABLE}\n`);
    const guard = body(sql, "identity.guard_investigation_report_record");
    expect(guard).toContain("IF TG_OP = 'DELETE' AND (pg_catalog.current_setting('debateai.investigation_forget', true) = 'on'");
    expect(guard).not.toMatch(/TG_OP = 'UPDATE'/u);
    expect(guard).toContain("MESSAGE='INVESTIGATION_REPORT_APPEND_ONLY'");
    // No earlier table is altered but the ledger's two CHECKs, and no earlier table is written but 0133's closing
    // through 0133's own writer.
    expect([...sql.matchAll(/\bALTER TABLE ([a-z_.]+)/gu)].map((match) => match[1]))
      .toEqual(["ledger.model_spend", "ledger.model_spend", "ledger.model_spend", "ledger.model_spend"]);
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM) identity\.(?!investigation_report\b)/u);
    expect(body(sql, "identity.record_investigation_report_version"))
      .toContain("identity.record_investigation_report(p_investigation_id, p_report_version, p_report_id)");
  });

  it("C-C seals the report under the ROOT's run key, bound to the report id, with 0132's checks called, not redefined", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain(`CREATE TRIGGER aaa_enforce_investigation_report_content BEFORE INSERT ON ${TABLE}\n`
      + "FOR EACH ROW EXECUTE FUNCTION identity.enforce_investigation_report_content();");
    const check = body(sql, "identity.enforce_investigation_report_content");
    for (const called of ["core.run_uses_content_encryption(NEW.root_run_id)", "core.run_private_content_is_live(NEW.root_run_id)",
      "core.is_content_envelope(NEW.content_ciphertext)", "core.content_envelope_attestation_bytes(NEW.root_run_id",
      "NEW.report_id::text", "audit_crypto_internal.hmac("]) expect(check, called).toContain(called);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION (?:core\.|identity\.enforce_web_evidence_content)/u);
    expect(CONTENT_CARRIERS).toContain(TABLE);
    const repository = read("packages/db/src/investigation-reports.ts");
    expect(repository).toContain(`export const INVESTIGATION_REPORT_CARRIER = "${TABLE}" as const;`);
    // Re-exported through investigations.ts, not the package index (its bytes are pinned by the migration audit).
    expect(read("packages/db/src/investigations.ts")).toContain('export * from "./investigation-reports.js";');
    expect(read("packages/db/src/index.ts")).not.toContain("investigation-reports");
  });

  it("C-F defines its definers with a fixed search path; the private helpers are plain and no one's", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1]);
    expect(created.sort()).toEqual(SIGNATURES.map(nameOf).sort());
    for (const signature of SIGNATURES) {
      const name = nameOf(signature);
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      const head = sql.slice(at, sql.indexOf("AS $$", at));
      expect(head, name).toContain("SET search_path=pg_catalog");
      expect(head.includes("SECURITY DEFINER"), name).toBe(!(HELPERS as readonly string[]).includes(signature));
    }
    // Every refusal before any read.
    const list = body(code(sql), "identity.read_unreported_closings");
    expect(list.indexOf("INVESTIGATION_REPORT_LIST_INVALID")).toBeLessThan(list.indexOf("FROM identity."));
    const record = body(code(sql), "identity.record_investigation_report_version");
    expect(record.indexOf("INVESTIGATION_REPORT_RECORD_INVALID")).toBeLessThan(record.indexOf("FROM identity."));
    expect(record.indexOf("FOR UPDATE")).toBeLessThan(record.indexOf("RETURN 'ALREADY'"));
    expect(record.indexOf("RETURN 'ALREADY'")).toBeLessThan(record.indexOf("INSERT INTO"));
    expect(body(code(sql), "identity.read_investigation_reports")).toContain("identity.page_memory_run_owned(p_owner_ref, p_run_id)");
    expect(body(code(sql), "identity.read_data_export_investigation_reports"))
      .toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
    expect(body(code(sql), "identity.read_data_export_investigation_reports")).not.toMatch(/content_ciphertext|spent_micros/u);
    // The owner block gives the table and ten functions (all but the content trigger's) 0115's export owner.
    expect(sql).toContain("WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;");
    for (const signature of SIGNATURES.filter((signature) => signature !== CONTENT)) expect(sql).toContain(`    '${signature}'`);
    expect(sql).not.toContain(`    '${CONTENT}'`);
  });

  it("C-W counts as waiting a debate not settled and not month-paused, and a settled dig on a path with no rewrite yet", () => {
    const waiting = body(code(read(SQL_PATH)), "identity.investigation_report_waiting");
    for (const needle of ["work.state IN ('READY','CLAIMED')", "work.state = 'FAILED'", "work.items = 0",
      "identity.run_pause_event", "<> 'PAUSED'", "pick_set.position_ref IS NOT NULL", "NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite",
      "ORDER BY member.run_id"]) expect(waiting, needle).toContain(needle);
    expect(waiting).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/u);
  });

  it("C-G grants five runtime functions, the API's reader and the export reader, and no table right", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      ...RUNTIME.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${API} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(7);
    expect(sql).not.toMatch(/TO debateai_erasure_runtime/u);
    expect(sql).toContain(`REVOKE ALL ON ${TABLE} FROM PUBLIC,${ROLES.join(",")};`);
    for (const signature of [CONTENT, GUARD]) expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
    for (const signature of HELPERS) expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,${ROLES.join(",")};`);
    for (const message of ["INVESTIGATION_REPORTS_0136_CONTRACT table", "INVESTIGATION_REPORTS_0136_CONTRACT table privilege",
      "INVESTIGATION_REPORTS_0136_CONTRACT definers", "INVESTIGATION_REPORTS_0136_CONTRACT privileges",
      "INVESTIGATION_REPORTS_0136_CONTRACT helper", "INVESTIGATION_REPORTS_0136_CONTRACT spend source"]) expect(sql).toContain(message);
  });

  it("C-S adds INVESTIGATION_REPORT to 0134's spend sources, NOT VALID, and the report's charge names its run", () => {
    const sources = (value: string) => [...value.matchAll(/ADD CONSTRAINT model_spend_spend_source_check\s+CHECK \(spend_source IN \(([^)]+)\)\)/gu)][0]?.[1]
      ?.match(/'[^']+'/gu);
    const sql = read(SQL_PATH);
    expect(sources(sql)).toEqual([...(sources(read("migrations/0134_dig_model_and_month_pause.sql")) ?? []), "'INVESTIGATION_REPORT'"]);
    expect(code(sql)).toMatch(/ADD CONSTRAINT model_spend_spend_source_check\s+CHECK \([^;]+\) NOT VALID;/u);
    expect(code(sql)).toMatch(/ADD CONSTRAINT model_spend_investigation_report_names_its_run\s+CHECK \(spend_source <> 'INVESTIGATION_REPORT' OR run_id IS NOT NULL\) NOT VALID;/u);
  });

  it("C-D adds no deletion function: the root's erasure takes the reports through its closings, and the erasure count stays", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).not.toMatch(/forget_erased_debate/u);
    expect(read("packages/db/src/account-erasure.ts")).not.toMatch(/INVESTIGATION_REPORT/u);
    expect(read("packages/db/src/erasure-page-memory.ts")).not.toMatch(/investigation_report/u);
  });

  it("C-E the export worker reaches the reader through 0128's lease, and its boot check counts it", () => {
    const exporter = read("packages/db/src/data-export.ts");
    expect(exporter.indexOf(`"${EXPORT_READER}",`)).toBeGreaterThan(exporter.indexOf('"identity.read_data_export_dig_picks(uuid,uuid)",'));
    expect(exporter).toContain("worker.worker_count !== 15");
    expect(read("packages/db/src/investigation-reports.ts")).toContain(`export const READ_DATA_EXPORT_INVESTIGATION_REPORTS = "${EXPORT_READER}" as const;`);
  });

  it("C-P discloses its grants and lists its files in the shipped corpus and the CI integration list", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)).toEqual([
      { roleName: "debateai_billing_runtime", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${API}`] },
      { roleName: "debateai_runtime", source: SQL_PATH, grants: RUNTIME.map((signature) => `EXECUTE ON FUNCTION ${signature}`) },
      { roleName: "debateai_data_export_worker", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${EXPORT_READER}`] }
    ]);
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of ["packages/db/src/investigation-reports.ts", "packages/db/src/migration-forward0136.ts"]) expect(corpus).toContain(path);
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/investigation-report-database.test.ts");
  });

  it("C-R is documented as the twenty-sixth step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the dig picks (0135, below) the twenty-fifth and the investigation reports (0136, below) the twenty-sixth");
    const heading = "## The investigation reports (0136)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(readme.indexOf("## The dig picks (0135)"));
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-sixth", NAME, "investigation-reports-forward0136.json", "packages/db/src/migration-forward0136.ts",
      "`loadForward0136`", "MIGRATION_FORWARD0136_", TABLE, "CONTENT_CARRIERS", "-- n1: expand", "-- n1: keeps-verifier",
      "INVESTIGATION_REPORT", EXPORT_READER, "renumber"]) expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(
      "adds the database step `migrations/0136_investigation_reports.sql` (after `0135_dig_picks.sql`, `n1: expand`)");
  });
});
