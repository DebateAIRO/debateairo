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
 * 0139 (plan 2026-10-31-r22-owner-changes decisions 6, 7): the shown quote kept apart from the passage, a reader's saved reply in its own transient store, the wipe of one debate; `expand`, keeping 0130's verifier. No database here: the behaviour is tests/integration/r22-foundation-database.test.ts.
 */
const NAME = "0139_passage_retention.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/passage-retention-forward0139.json";
const PREVIOUS = "0138_tree_updates.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/tree-updates-forward0138.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));

const TABLES = ["identity.web_shown_quote", "identity.web_reply_text", "identity.web_passage_wipe"] as const;
const FUNCTIONS = [
  "identity.guard_passage_retention_record()",
  "identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)",
  "identity.read_web_shown_quotes(uuid)",
  "identity.record_web_reply_text(uuid,uuid,jsonb,bytea)",
  "identity.read_web_reply_texts(uuid,uuid[])",
  "identity.debate_nothing_runs(uuid)",
  "identity.web_page_text_is_passage_bound(uuid,uuid)",
  "identity.wipe_debate_passages(uuid,text)",
  "identity.read_debates_holding_passages(integer)",
  "identity.close_investigation_keeping_texts(uuid,uuid)",
  "identity.forget_erased_debate_passages(uuid)",
  "identity.read_data_export_passage_retention(uuid,uuid)"
] as const;
const CARRIERS = ["identity.web_shown_quote", "identity.web_reply_text"] as const;

describe("0139: page texts and passages go when nothing runs", () => {
  it("C-T is a step of the chain's STEPS, after 0138, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0139 } from './migration-forward0139.js';");
    expect(chain).toContain("loadForward0138,loadForward0139");
    const loader = read("packages/db/src/migration-forward0139.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "passage-retention-forward0139-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/passage-retention-forward0139.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0139_");
    expect(loader).toContain("export async function loadForward0139(");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of FUNCTIONS) expect(loader).toContain(`"${signature}"`);
    expect(loader).not.toContain("model_spend_spend_source_check");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0138's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "passage-retention-forward0139-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit and the replay audit", async () => {
    const sql = read(SQL_PATH);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME)) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    // Never CREATE OR REPLACE a function another migration defines.
    for (const signature of FUNCTIONS) expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O guards every table, no role reads one, and no text is kept in clear", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql, table).toMatch(new RegExp(`^REVOKE ALL ON ${table.replace(".", "\\.")} FROM PUBLIC,`, "mu"));
      const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
      const columns = sql.slice(at, sql.indexOf("\n);", at));
      expect(columns, table).not.toMatch(/\b(?:text|question|answer|quote|summary|line|reason)\s+text\b/u);
    }
    expect(sql).not.toMatch(/^GRANT [^\n]*\bON (?:TABLE )?identity\./mu);
    for (const carrier of CARRIERS) expect(CONTENT_CARRIERS as readonly string[], carrier).toContain(carrier);
  });

  it("C-W the wipe goes through 0132's own guard, keeps the notes and the page rows, and never edits a call record", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf("CREATE OR REPLACE FUNCTION identity.wipe_debate_passages(");
    const wipe = sql.slice(at, sql.indexOf("\n$$;", at));
    expect(wipe).toContain("pg_catalog.set_config('debateai.web_evidence_forget', 'on', true)");
    for (const table of ["identity.web_pack", "identity.web_extract", "identity.web_reply_text", "identity.web_page_text"]) expect(wipe).toContain(`DELETE FROM ${table}`);
    for (const table of ["identity.web_reading", "identity.web_page ", "identity.web_shown_quote", "ledger."]) expect(wipe).not.toContain(`DELETE FROM ${table}`);
    expect(wipe).toContain("'QUOTES_MISSING'");
    expect(sql).not.toMatch(/\bledger\.(?:raw_artifact|call_prompt)\b/u);
    // 4 KiB is enough for 120 characters in any script; the wipe's row keeps counts and codes only.
    expect(sql).toContain("web_shown_quote_content_size CHECK (octet_length(content_ciphertext::text) <= 4096)");
  });

  it("C-E the erasure role and the export worker reach their functions; a saved reply is not exported", () => {
    expect(read("packages/db/src/erasure-page-memory.ts")).toContain('"SELECT identity.forget_erased_debate_passages($1)"');
    expect(read("packages/db/src/data-export.ts")).toContain('"identity.read_data_export_passage_retention(uuid,uuid)",');
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf("CREATE OR REPLACE FUNCTION identity.read_data_export_passage_retention(");
    expect(sql.slice(at, sql.indexOf("\n$$;", at))).not.toContain("identity.web_reply_text");
  });

  it("C-P discloses its grants and lists its files in the shipped corpus", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const sql = read(SQL_PATH);
    const actual = [...sql.matchAll(/^GRANT ([^\n]+) TO ([a-z_]+);$/gmu)].map((match) => `${match[2]}: ${match[1]}`).sort();
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)
      .flatMap(({ roleName, grants }) => grants.map((grant) => `${roleName}: ${grant}`)).sort();
    expect(actual).toEqual(declared);
    expect(actual.length).toBeGreaterThan(0);
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    expect(corpus).toContain("packages/db/src/migration-forward0139.ts");
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/r22-foundation-database.test.ts");
  });

  it("C-R is documented as the twenty-ninth step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0139, below) the twenty-ninth");
    const heading = "## The passage retention (0139)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-ninth", NAME, "passage-retention-forward0139.json", "packages/db/src/migration-forward0139.ts",
      "`loadForward0139`", "MIGRATION_FORWARD0139_", "-- n1: expand", "-- n1: keeps-verifier", "renumber"]) expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0139_passage_retention.sql` (after `0138_tree_updates.sql`, `n1: expand`)");
  });
});
