// tests/architecture/v4-account-memory-0130-contract.test.ts
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
 * 0130 (owner rulings N7 and N11, 2026-10-29; test-site release R22): the V4 pages remember the reading level, the
 * last visit of each debate and each dig's link in the person's ACCOUNT. Three identity tables keyed by the account's
 * owner_ref (ON DELETE CASCADE, so account erasure removes them), six API functions for the API's own role, one export
 * reader for the export worker. An `expand` step that keeps 0111's effective verifier in force. No database here: the
 * behaviour is tests/integration/v4-account-memory-database.test.ts.
 */
const NAME = "0130_v4_account_memory.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/v4-account-memory-forward0130.json";
const VERIFIER_111 = "aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a";
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0130 contains `--`). */
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

describe("0130: the V4 account memory step", () => {
  it("C-T is the last step of the chain's STEPS, after 0129, with its own loader", async () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0128,loadForward0129,loadForward0130]");
    const loader = read("packages/db/src/migration-forward0130.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "v4-account-memory-forward0130-v1";');
    expect(loader).toContain('const PREVIOUS = "0129_support_answer_scope.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0130_");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of [...API_FUNCTIONS, EXPORT_READER, HELPER]) expect(loader).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.slice(-2).map((step) => step.name)).toEqual(["0129_support_answer_scope.sql", NAME]);
    expect(plan.forwardChain.at(-1)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M has 0129's manifest shape, bound to 0129's manifest and to the verifier in force (0111's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read("migrations/lineage/support-answer-scope-forward0129.json")) as { baseRecipeSha256: string };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier"]);
    expect(manifest).toEqual({
      version: "v4-account-memory-forward0130-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: {
        name: "0129_support_answer_scope.sql",
        manifestSha256: sha256(read("migrations/lineage/support-answer-scope-forward0129.json")),
        verifierSha256: VERIFIER_111
      },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-111.sql", sha256: VERIFIER_111 }
    });
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-111.sql"))).toBe(VERIFIER_111);
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
    // Nothing 0130 creates existed before it.
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    for (const signature of [...API_FUNCTIONS, EXPORT_READER, HELPER]) {
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

  it("C-F defines its eight functions as definers with a fixed search path, and replaces no earlier one", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1]);
    expect(created).toEqual([HELPER, ...API_FUNCTIONS, EXPORT_READER].map((signature) => signature.slice(0, signature.indexOf("("))));
    for (const signature of [...API_FUNCTIONS, EXPORT_READER]) {
      const name = signature.slice(0, signature.indexOf("("));
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      const head = sql.slice(at, sql.indexOf("AS $$", at));
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    // The export reader checks its lease through 0128's gate, as identity.read_data_export_threat_reports does.
    expect(sql).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
  });

  it("C-G grants exactly seven EXECUTEs: the six API functions to the API's own role, the reader to the export worker", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      ...API_FUNCTIONS.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_billing_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(7);
    // Never to the shared runtime role the runner and scheduler log in with.
    expect(code(sql)).not.toMatch(/\bGRANT\b[^;]*\bTO\s+debateai_runtime\b/u);
  });

  it("C-R is documented as the twentieth step, after the support answer scope's section", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the threat reports (0128, below) the eighteenth, the support answer scope (0129, below) the nineteenth and the V4 account memory (0130, below) the twentieth.");
    const heading = "## The V4 account memory (0130)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(readme.indexOf("## The support answer scope (0129)"));
    expect(readme.indexOf("## Replay: every applied step keeps its own checks")).toBeGreaterThan(at);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length));
    for (const needle of ["twentieth", "0129", NAME, "v4-account-memory-forward0130.json", "verify-effective-capabilities-111.sql",
      "packages/db/src/migration-forward0130.ts", "`loadForward0130`", "`STEPS`", "MIGRATION_FORWARD0130_",
      ...TABLES, EXPORT_READER, "debateai_billing_runtime", "ON DELETE CASCADE", "-- n1: expand", "-- n1: keeps-verifier",
      "replayVerifierSql", "renumber"]) {
      expect(section.replace(/\s+/gu, " "), needle).toContain(needle);
    }
  });
});
