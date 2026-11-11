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
 * 0140 (plan 2026-10-31-r22-owner-changes, known gap and decision 14): 0093's and 0123's readers and admission learn every kind a person is charged for, and the team's one spend reader; truthfully `drained`, keeping 0130's verifier. No database here: the behaviour is tests/integration/r22-foundation-database.test.ts.
 */
const NAME = "0140_internal_spend_kinds.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/internal-spend-kinds-forward0140.json";
const PREVIOUS = "0139_passage_retention.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/passage-retention-forward0139.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");

const TABLES: readonly string[] = [];
const FUNCTIONS = [
  "billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)",
  "billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)",
  "billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)",
  "staff.read_team_internal_spent(timestamptz,timestamptz)"
] as const;
const CARRIERS = [] as const;

describe("0140: a funded person's window counts every spend kind", () => {
  it("C-T is a step of the chain's STEPS, after 0139, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0140 } from './migration-forward0140.js';");
    expect(chain).toContain("loadForward0139,loadForward0140");
    const loader = read("packages/db/src/migration-forward0140.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "internal-spend-kinds-forward0140-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/internal-spend-kinds-forward0140.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0140_");
    expect(loader).toContain("export async function loadForward0140(");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of FUNCTIONS) expect(loader).toContain(`"${signature}"`);
    expect(loader).not.toContain("model_spend_spend_source_check");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0139's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "internal-spend-kinds-forward0140-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
  });

  it("C-H declares `-- n1: drained` and `-- n1: keeps-verifier` in its header", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
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
    expect(earlierFunctions.has("staff.read_team_internal_spent")).toBe(false);
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

  it("C-K redefines exactly what it says, with no real figure, and the team's limit is no server setting", () => {
    const sql = code(read(SQL_PATH));
    const kinds = "'RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK'";
    expect(sql.split(kinds).length).toBe(5); // the admission list, the spend reader, the commitments, the team's
    expect(sql).toContain("IF p_source='PUBLIC_REPORT' THEN RETURN false;END IF;");
    // Decision 24 (0142): the team's limit lives in the database, so the register module reads no setting for it.
    const team = read("packages/register/src/team-limit.ts");
    expect(team).not.toContain("process.env");
    expect(team).not.toContain("TEAM_LIMIT_MONTH_MICROS");
    expect(code(team)).not.toMatch(/=\s*[0-9]{4,}/u);
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
    expect(corpus).toContain("packages/db/src/migration-forward0140.ts");
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/r22-foundation-database.test.ts");
  });

  it("C-R is documented as the thirtieth step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0140, below) the thirtieth");
    const heading = "## The funded spend kinds (0140)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["thirtieth", NAME, "internal-spend-kinds-forward0140.json", "packages/db/src/migration-forward0140.ts",
      "`loadForward0140`", "MIGRATION_FORWARD0140_", "-- n1: drained", "-- n1: keeps-verifier", "renumber"]) expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0140_internal_spend_kinds.sql` (after `0139_passage_retention.sql`, `n1: drained`)");
  });
});
