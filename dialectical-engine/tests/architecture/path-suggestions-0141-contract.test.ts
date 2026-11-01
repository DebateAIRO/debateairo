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
 * 0141 (plan 2026-10-31-r22-owner-changes decision 9): the AI's suggestions of what to dig into on one path of a debate's map, encrypted, append-only, the newest of a path winning; `expand`, keeping 0130's verifier. No database here: the behaviour is tests/integration/path-suggestions-database.test.ts.
 */
const NAME = "0141_path_suggestions.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/path-suggestions-forward0141.json";
const PREVIOUS = "0140_internal_spend_kinds.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/internal-spend-kinds-forward0140.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));

const TABLE = "identity.path_suggestions";
const FUNCTIONS = [
  "identity.guard_path_suggestions_record()",
  "identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)",
  "identity.read_path_suggestions_of_run(uuid)",
  "identity.forget_erased_debate_path_suggestions(uuid)",
  "identity.read_data_export_path_suggestions(uuid,uuid)"
] as const;

describe("0141: a path's suggestions", () => {
  it("C-T is a step of the chain's STEPS, after 0140, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0141 } from './migration-forward0141.js';");
    expect(chain).toContain("loadForward0140,loadForward0141");
    const loader = read("packages/db/src/migration-forward0141.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "path-suggestions-forward0141-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/path-suggestions-forward0141.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0141_");
    expect(loader).toContain("export async function loadForward0141(");
    expect(loader).toContain(`"${TABLE}"`);
    for (const signature of FUNCTIONS) expect(loader).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0140's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "path-suggestions-forward0141-v1",
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
    expect(earlierRelations.has(TABLE)).toBe(false);
    // Never CREATE OR REPLACE a function another migration defines.
    for (const signature of FUNCTIONS) expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O guards the table, no role reads it, and no text is kept in clear", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([TABLE]);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
    expect(sql).toMatch(/^REVOKE ALL ON identity\.path_suggestions FROM PUBLIC,/mu);
    const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE} (`);
    const columns = sql.slice(at, sql.indexOf("\n);", at));
    expect(columns).not.toMatch(/\b(?:text|question|answer|quote|summary|line|reason|suggestion|suggestions)\s+text\b/u);
    expect([...columns.matchAll(/^ {2}([a-z_]+) (?:text|varchar)/gmu)].map((match) => match[1])).toEqual(["position_ref"]);
    expect(sql).not.toMatch(/^GRANT [^\n]*\bON (?:TABLE )?identity\.path_suggestions/mu);
    expect(sql).toContain(`BEFORE INSERT ON ${TABLE}\nFOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('set_id');`);
    expect(sql).toContain(`BEFORE UPDATE OR DELETE ON ${TABLE}\nFOR EACH ROW EXECUTE FUNCTION identity.guard_path_suggestions_record();`);
    expect(CONTENT_CARRIERS as readonly string[]).toContain(TABLE);
  });

  it("C-P keeps the same path rule as 0138's turn, and changes nothing earlier", () => {
    const sql = code(read(SQL_PATH));
    const rule = /CONSTRAINT path_update_turn_position_check CHECK \((position_ref ~ '[^']+')\)/u.exec(read("migrations/0138_tree_updates.sql"))?.[1];
    expect(rule).toBeDefined();
    expect(sql).toContain(`CONSTRAINT path_suggestions_position_check CHECK (${rule!})`);
    expect(sql).not.toMatch(/ALTER TABLE identity\.(?!path_suggestions)/u);
  });

  it("C-E the erasure role and the export worker reach their functions", () => {
    expect(read("packages/db/src/erasure-page-memory.ts")).toContain('"SELECT identity.forget_erased_debate_path_suggestions($1)"');
    expect(read("packages/db/src/account-erasure.ts")).toContain("FORGET_ERASED_DEBATE_PATH_SUGGESTIONS,\n");
    expect(read("packages/db/src/data-export.ts")).toContain('"identity.read_data_export_path_suggestions(uuid,uuid)",');
  });

  it("C-D discloses its grants and lists its files in the shipped corpus", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const sql = read(SQL_PATH);
    const actual = [...sql.matchAll(/^GRANT ([^\n]+) TO ([a-z_]+);$/gmu)].map((match) => `${match[2]}: ${match[1]}`).sort();
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)
      .flatMap(({ roleName, grants }) => grants.map((grant) => `${roleName}: ${grant}`)).sort();
    expect(actual).toEqual(declared);
    expect(actual.length).toBeGreaterThan(0);
    // The reader sits on the role that reads 0134's rewrites, so whatever reads those reads these on the same pool.
    expect(actual).toContain("debateai_runtime: EXECUTE ON FUNCTION identity.read_path_suggestions_of_run(uuid)");
    expect(read("migrations/0134_dig_model_and_month_pause.sql")).toContain("GRANT EXECUTE ON FUNCTION identity.read_path_rewrites_of_run(uuid) TO debateai_runtime;");
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    expect(corpus).toContain("packages/db/src/migration-forward0141.ts");
    expect(corpus).toContain("packages/db/src/path-suggestions.ts");
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/path-suggestions-database.test.ts");
  });

  it("C-R is documented as the thirty-first step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0141, below) the thirty-first");
    const heading = "## The path suggestions (0141)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["thirty-first", NAME, "path-suggestions-forward0141.json", "packages/db/src/migration-forward0141.ts",
      "`loadForward0141`", "MIGRATION_FORWARD0141_", "-- n1: expand", "-- n1: keeps-verifier", "renumber"]) expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0141_path_suggestions.sql` (after `0140_internal_spend_kinds.sql`, `n1: expand`)");
  });
});
