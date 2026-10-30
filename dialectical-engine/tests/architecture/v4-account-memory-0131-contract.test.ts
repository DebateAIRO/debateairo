// tests/architecture/v4-account-memory-0131-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
 * 0131 (owner rulings N7 and N11, 2026-10-29; test-site release R22): the V4 pages remember the reading level, the
 * last visit of each debate and each dig's link in the person's ACCOUNT. Three identity tables keyed by the account's
 * owner_ref (ON DELETE CASCADE, so account erasure removes them), six API functions for the API's own role, one export
 * reader for the export worker. An `expand` step that keeps 0130's effective verifier in force (written as 0130,
 * renumbered to 0131 at the merge of origin/dev 64ef40c21, whose row-level security took 0130 first). No database
 * here: the behaviour is tests/integration/v4-account-memory-database.test.ts.
 */
const NAME = "0131_v4_account_memory.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/v4-account-memory-forward0131.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0131 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");

const TABLES = ["identity.page_reading_level", "identity.debate_last_visit", "identity.dig_link"] as const;
const API_FUNCTIONS = [
  "identity.read_page_reading_level(uuid)",
  "identity.save_page_reading_level(uuid,text)",
  "identity.read_debate_last_visit(uuid,uuid)",
  "identity.record_debate_last_visit(uuid,uuid,jsonb)",
  "identity.read_dig_links(uuid,uuid)",
  "identity.record_dig_link(uuid,uuid,uuid,text[],text)"
] as const;
const EXPORT_READER = "identity.read_data_export_page_memory(uuid,uuid)";
const HELPER = "identity.page_memory_run_owned(uuid,uuid)";
/** R22 item 16: deleting one private debate also deletes its page memory, called by the erasure role alone. */
const FORGET = "identity.forget_erased_debate_page_memory(uuid)";

describe("0131: the V4 account memory step", () => {
  it("C-T follows 0130 in the chain's STEPS (the Perplexity plan's 0132 and 0133 come after it), with its own loader", async () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0129,loadForward0130,loadForward0131,");
    const loader = read("packages/db/src/migration-forward0131.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "v4-account-memory-forward0131-v1";');
    expect(loader).toContain('const PREVIOUS = "0130_row_level_security.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0131_");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of [...API_FUNCTIONS, FORGET, EXPORT_READER, HELPER]) expect(loader).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual(["0130_row_level_security.sql", NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M has 0129's manifest shape, bound to 0130's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read("migrations/lineage/row-level-security-forward0130.json")) as { baseRecipeSha256: string };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier"]);
    expect(manifest).toEqual({
      version: "v4-account-memory-forward0131-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: {
        name: "0130_row_level_security.sql",
        manifestSha256: sha256(read("migrations/lineage/row-level-security-forward0130.json")),
        verifierSha256: VERIFIER_130
      },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-130.sql"))).toBe(VERIFIER_130);
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit and the replay audit, and only through its one reviewed owner block", async () => {
    const sql = read(SQL_PATH);
    const earlier = readdirSync(new URL("../../migrations/", import.meta.url))
      .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME).sort();
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of earlier) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    // Nothing 0131 creates existed before it.
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    for (const signature of [...API_FUNCTIONS, FORGET, EXPORT_READER, HELPER]) {
      expect(earlierFunctions.has(signature.slice(0, signature.indexOf("("))), signature).toBe(false);
    }
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    const findings = auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1]);
    expect(findings).toEqual(["N1_DYNAMIC_SQL"]);
    const plan = await loadMigrationPlan();
    const migrateSource = read("packages/db/src/index.ts");
    const transactionSource = read("packages/db/src/migration-transaction.ts");
    expect(auditMigrationReplaySafety(SQL_PATH, sql, { plan, migrateSource, transactionSource })).toEqual([]);
  });

  it("C-O creates only the three account tables, each keyed by the account with ON DELETE CASCADE, and keeps no text", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      const body = sql.slice(sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`), sql.indexOf("\n);", sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`)));
      expect(body, table).toMatch(/owner_ref uuid (?:PRIMARY KEY|NOT NULL) REFERENCES identity\."user"\(owner_ref\) ON DELETE CASCADE/u);
      // Ids, the level, state words, places and times only: no question, answer or line column.
      expect(body, table).not.toMatch(/\b(?:question|answer|line|text_|body)\w*\s+text\b/u);
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
    }
    // Bounded: the visit snapshot's size and the places list are checked by the table itself.
    expect(sql).toContain("octet_length(items::text) <= 65536");
    expect(sql).toContain("cardinality(places) <= 16");
    expect(sql).toContain("reading_level IN ('plain','background','expert')");
    expect(sql).toContain("mode IN ('quick','thorough')");
  });

  it("C-F defines its nine functions as definers with a fixed search path, and replaces no earlier one", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1]);
    expect(created).toEqual([HELPER, ...API_FUNCTIONS, FORGET, EXPORT_READER].map((signature) => signature.slice(0, signature.indexOf("("))));
    for (const signature of [...API_FUNCTIONS, FORGET, EXPORT_READER]) {
      const name = signature.slice(0, signature.indexOf("("));
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      const head = sql.slice(at, sql.indexOf("AS $$", at));
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    // The export reader checks its lease through 0128's gate, as identity.read_data_export_threat_reports does.
    expect(sql).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
  });

  it("C-G grants exactly eight EXECUTEs: six API functions to the API's role, the deletion to the erasure role, the reader to the export worker", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      ...API_FUNCTIONS.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_billing_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${FORGET} TO debateai_erasure_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(8);
    // Never to the shared runtime role the runner and scheduler log in with.
    expect(code(sql)).not.toMatch(/\bGRANT\b[^;]*\bTO\s+debateai_runtime\b/u);
  });

  it("C-D (R22 item 16) deleting one debate deletes its page memory in the finalize transaction, only once it is erased", () => {
    const sql = code(read(SQL_PATH));
    const body = (name: string): string => {
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      return sql.slice(at, sql.indexOf("\n$$;", at));
    };
    const forget = body("identity.forget_erased_debate_page_memory");
    // Only an erased run (0040's tombstone, written by the same finalize), else 55000 and nothing deleted.
    expect(forget).toMatch(/IF p_run_id IS NULL OR NOT EXISTS \(SELECT 1 FROM serve\.private_run_erasure_tombstone[\s\S]*?RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PAGE_MEMORY_DEBATE_NOT_ERASED';/u);
    expect(forget).toContain("DELETE FROM identity.debate_last_visit AS visit WHERE visit.run_id = p_run_id;");
    expect(forget).toContain("DELETE FROM identity.dig_link AS link WHERE link.parent_run_id = p_run_id OR link.child_run_id = p_run_id;");
    expect(forget).not.toMatch(/DELETE FROM identity\.page_reading_level/u);
    // The deletion and both writers share one lock per run; the writers take it before their ownership check.
    const lock = "pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' ||";
    expect(forget.indexOf(lock)).toBeLessThan(forget.indexOf("DELETE FROM"));
    for (const writer of ["identity.record_debate_last_visit", "identity.record_dig_link"]) {
      const text = body(writer);
      expect(text.indexOf(lock), writer).toBeGreaterThan(0);
      expect(text.indexOf(lock), writer).toBeLessThan(text.indexOf("identity.page_memory_run_owned("));
    }
    // An erased run is no longer the account's, for every read and write.
    expect(body("identity.page_memory_run_owned")).toContain("AND NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone");
    // Both finalize paths call it in their own transaction, after a COMMITTED finalize; the erasure boot check lists it.
    const helper = read("packages/db/src/erasure-page-memory.ts");
    expect(helper).toContain('FORGET_ERASED_DEBATE_PAGE_MEMORY = "identity.forget_erased_debate_page_memory(uuid)"');
    const begin = helper.indexOf('client.query("BEGIN")');
    const finalize = helper.indexOf("(finalizeSql, [...values])");
    const committed = helper.indexOf('outcome === "COMMITTED"');
    const forgetCall = helper.indexOf('"SELECT identity.forget_erased_debate_page_memory($1)"');
    const commit = helper.indexOf('client.query("COMMIT")');
    expect([begin, finalize, committed, forgetCall, commit].every((at, index, all) => at > 0 && (index === 0 || at > all[index - 1]!))).toBe(true);
    const erasure = read("packages/db/src/account-erasure.ts");
    expect(erasure).toContain("finalizeWithPageMemory<PrivateRunErasureOutcome>(this.pool, input.erasureId,\n      `SELECT core.finalize_private_run_erasure($1,$2,$3,$4,$5) AS outcome`");
    // 0132 and 0133 append their own deletions after it (the web evidence, the investigation rows).
    expect(erasure).toMatch(/const ERASURE_FUNCTION_SIGNATURES = Object\.freeze\(\[[\s\S]*?FORGET_ERASED_DEBATE_PAGE_MEMORY,\n[\s\S]*?\] as const\);/u);
    expect(read("packages/db/src/synthesis-check-erasure.ts"))
      .toContain('finalizeWithPageMemory<SynthesisCheckErasureOutcome>(this.pool, input.erasureId,\n      "SELECT core.finalize_synthesis_check_erasure($1,$2,$3,$4,$5) AS outcome"');
    expect(read(SQL_PATH)).toMatch(/^-- n1: expand$/mu);
  });

  it("C-R is documented as the twenty-first step, after row-level security's section", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the support answer scope (0129, below) the nineteenth, row-level security (0130, below) the twentieth, the V4 account memory (0131, below) the twenty-first,");
    const heading = "## The V4 account memory (0131)";
    const at = readme.indexOf(heading);
    expect(readme.indexOf("## Row-level security (0130)")).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(readme.indexOf("## Row-level security (0130)"));
    expect(readme.indexOf("## Replay: every applied step keeps its own checks")).toBeGreaterThan(at);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length));
    for (const needle of ["twenty-first", "0130", NAME, "v4-account-memory-forward0131.json", "verify-effective-capabilities-130.sql",
      "packages/db/src/migration-forward0131.ts", "`loadForward0131`", "`STEPS`", "MIGRATION_FORWARD0131_",
      ...TABLES, EXPORT_READER, "debateai_billing_runtime", "ON DELETE CASCADE", "-- n1: expand", "-- n1: keeps-verifier",
      "replayVerifierSql", "renumber"]) {
      expect(section.replace(/\s+/gu, " "), needle).toContain(needle);
    }
  });
});
