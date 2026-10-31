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
 * 0138 (plan 2026-10-31-r22-owner-changes decisions 2, 3, 5): a climb's rewrites and their causes with their turns, the main answer's automatic versions under the root's key, and a debate's purpose lines, encrypted; `expand`, keeping 0130's verifier. No database here: the behaviour is tests/integration/r22-foundation-database.test.ts.
 */
const NAME = "0138_tree_updates.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/tree-updates-forward0138.json";
const PREVIOUS = "0137_public_debates.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/public-debates-forward0137.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));

const TABLES = ["identity.path_update_turn", "identity.path_update", "identity.main_answer_update", "identity.run_purpose_lines"] as const;
const FUNCTIONS = [
  "identity.guard_tree_update_record()",
  "identity.path_line_entries(uuid,text)",
  "identity.path_line_front(uuid,text,timestamptz)",
  "identity.path_line_json(uuid,boolean)",
  "identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)",
  "identity.read_path_update_turn(uuid)",
  "identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.read_path_line_of_run(uuid)",
  "identity.read_path_climb_next(uuid)",
  "identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)",
  "identity.main_answer_updates_json(uuid)",
  "identity.read_main_answer_updates_of_run(uuid)",
  "identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)",
  "identity.read_run_purpose_lines_of_run(uuid)",
  "identity.read_path_line(uuid,uuid)",
  "identity.read_main_answer_updates(uuid,uuid)",
  "identity.read_run_purpose_lines(uuid,uuid)",
  "identity.close_public_investigation(uuid,uuid)",
  "identity.reopen_public_investigation(uuid,integer)",
  "identity.forget_erased_debate_tree_updates(uuid)",
  "identity.read_data_export_tree_updates(uuid,uuid)"
] as const;
const CARRIERS = ["identity.path_update", "identity.main_answer_update", "identity.run_purpose_lines"] as const;

describe("0138: tree updates, main-answer updates and purpose lines", () => {
  it("C-T is a step of the chain's STEPS, after 0137, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0138 } from './migration-forward0138.js';");
    expect(chain).toContain("loadForward0137,loadForward0138");
    const loader = read("packages/db/src/migration-forward0138.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "tree-updates-forward0138-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/tree-updates-forward0138.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0138_");
    expect(loader).toContain("export async function loadForward0138(");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of FUNCTIONS) expect(loader).toContain(`"${signature}"`);
    expect(loader).not.toContain("model_spend_spend_source_check");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0137's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "tree-updates-forward0138-v1",
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

  it("C-L edits nothing of 0134, and the line holds both tables", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION identity\.record_path_rewrite\(/u);
    expect(sql).not.toMatch(/ALTER TABLE identity\.path_rewrite/u);
    const at = sql.indexOf("CREATE OR REPLACE FUNCTION identity.path_line_entries(");
    const entries = sql.slice(at, sql.indexOf("\n$$;", at));
    expect(entries).toContain("identity.path_rewrite_turn");
    expect(entries).toContain("identity.path_update_turn");
    expect(sql).toContain("RETURN identity.record_path_rewrite(p_rewrite_id,");
    for (const carrier of CARRIERS) {
      expect(sql).toContain(`ON ${carrier}\nFOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content(`.replace("ON ", "BEFORE INSERT ON "));
    }
  });

  it("C-E the erasure role and the export worker reach their functions", () => {
    expect(read("packages/db/src/erasure-page-memory.ts")).toContain('"SELECT identity.forget_erased_debate_tree_updates($1)"');
    expect(read("packages/db/src/data-export.ts")).toContain('"identity.read_data_export_tree_updates(uuid,uuid)",');
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
    expect(corpus).toContain("packages/db/src/migration-forward0138.ts");
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/r22-foundation-database.test.ts");
  });

  it("C-R is documented as the twenty-eighth step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0138, below) the twenty-eighth");
    const heading = "## The tree updates (0138)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-eighth", NAME, "tree-updates-forward0138.json", "packages/db/src/migration-forward0138.ts",
      "`loadForward0138`", "MIGRATION_FORWARD0138_", "-- n1: expand", "-- n1: keeps-verifier", "renumber"]) expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0138_tree_updates.sql` (after `0137_public_debates.sql`, `n1: expand`)");
  });
});
