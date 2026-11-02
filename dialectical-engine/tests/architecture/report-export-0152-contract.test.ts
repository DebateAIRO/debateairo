import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationN1Compatibility, auditMigrationReplaySafety, definedFunctionNames, definedRelationNames, type N1AuditContext } from "../../tools/orphan-audit/src/index.js";

/**
 * 0152 (R22): a reporter's own reports in their export, and what the AI checks on public rows used. These read the migration's text and the plan: the n1 lines, who may call what,
 * that no request role reads the new table, and that the export reader takes no verdict, reason, judge or token column.
 * What the definers do on real PostgreSQL is tests/integration/public-tree-flow.test.ts's; what the archive does with the rows is tests/unit/v4-account-memory-export.test.ts's.
 */
const NAME = "0152_report_export_and_check_usage.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/report-export-forward0152.json";
const LOADER_PATH = "packages/db/src/migration-forward0152.ts";
const PREVIOUS = "0151_public_flag.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/public-flag-forward0151.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const escaped = (text: string): string => text.replace(/[\\.()[\]]/gu, "\\$&");

const RUNTIME = "debateai_runtime";
const WORKER = "debateai_data_export_worker";
/** Every role a 0131-to-0151 step takes care to refuse by name, beside PUBLIC. The request-facing roles are all here. */
const ROLES = [RUNTIME, "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", WORKER] as const;
const TABLE = "identity.public_check_usage";
const RECORD = "identity.record_public_check_usage(text,uuid,timestamptz,integer,integer,integer,numeric)";
const EXPORT_READER = "identity.read_data_export_public_flags(uuid,uuid)";

/** A function's text from its CREATE to the `$$;` or `END $$;` that closes its body. */
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("$$;", at));
};
const earlierSteps = (): string[] => readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();

describe("0152: a reporter's own reports in their export, and what the AI checks on public rows used", () => {
  it("follows 0151 in the chain, with its own loader, and keeps 0130's verifier", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0152 } from './migration-forward0152.js';");
    expect(chain).toContain("loadForward0150,loadForward0151,loadForward0152,");
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "report-export-forward0152-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/report-export-forward0152.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0152_");
    expect(loader).toContain("export async function loadForward0152(");
    expect(loader).toContain(`"${TABLE}"`);
    for (const signature of [RECORD, EXPORT_READER]) expect(loader, signature).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-2)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.replayVerifierSql).toBeUndefined();
    expect(step.amendsPostconditionsOf).toEqual([]);
  });

  it("is bound to 0151's manifest and its own bytes, and amends nothing", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "report-export-forward0152-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
  });

  it("declares `-- n1: expand` and `-- n1: keeps-verifier`", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("defines one new table and two new functions, and redefines nothing earlier", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([TABLE]);
    expect([...sql.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_]+)\(/gmu)].map((match) => match[1]!)).toEqual([RECORD, EXPORT_READER].map(nameOf));
    const earlierFunctions = earlierSteps().flatMap((step) => [...definedFunctionNames(read(`migrations/${step}`))]);
    for (const signature of [RECORD, EXPORT_READER]) expect(earlierFunctions, signature).not.toContain(nameOf(signature));
    const earlierRelations = earlierSteps().flatMap((step) => [...definedRelationNames(read(`migrations/${step}`))]);
    expect(earlierRelations).not.toContain(TABLE);
  });

  it("passes the replay audit, and the N-1 audit finds nothing an expand step may not do", async () => {
    const sql = read(SQL_PATH);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const step of earlierSteps()) {
      const source = read(`migrations/${step}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("the table is ids and numbers only, truncate-guarded and insert-only", () => {
    const sql = code(read(SQL_PATH));
    const table = sql.slice(sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE}`), sql.indexOf(");\nCREATE INDEX", sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE}`)));
    expect([...table.matchAll(/^\s+([a-z_]+) (uuid|text|timestamptz|integer|numeric)\b/gmu)].map((match) => [match[1], match[2]])).toEqual([
      ["usage_id", "uuid"], ["subject_kind", "text"], ["subject_id", "uuid"], ["attempted_at", "timestamptz"], ["judge_call_count", "integer"],
      ["input_tokens", "integer"], ["output_tokens", "integer"], ["cost_usd", "numeric"], ["recorded_at", "timestamptz"]
    ]);
    // The one text column is a closed list, so nobody's words can sit in it.
    expect(table).toContain("CHECK (subject_kind IN ('RUN','PUBLIC_REPORT'))");
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
    expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${TABLE} FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
  });

  it("no request role reads the new table: it is revoked by name and never granted", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain(`REVOKE ALL ON ${TABLE} FROM PUBLIC,${ROLES.join(",")}`);
    expect(sql).not.toMatch(new RegExp(`GRANT [A-Z, ]+ ON (?:TABLE )?${escaped(TABLE)}\\b`, "u"));
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE)/u);
  });

  it("the export reader takes no verdict, reason, judge or token column, and leans on the worker's lease", () => {
    const flagColumns = (() => {
      const source = code(read(`migrations/${PREVIOUS}`));
      const at = source.indexOf("CREATE TABLE IF NOT EXISTS identity.public_flag (");
      expect(at).toBeGreaterThan(-1);
      return [...source.slice(at, source.indexOf("\n);", at)).matchAll(/^\s+([a-z_]+) [a-z]/gmu)].map((match) => match[1]!);
    })();
    const reader = bodyOf(code(read(SQL_PATH)), nameOf(EXPORT_READER));
    // Everything it reads from the report's row, by name.
    const used = [...new Set([...reader.matchAll(/\bflag\.([a-z_]+)/gu)].map((match) => match[1]!))].sort();
    expect(used).toEqual(["content_ciphertext", "created_at", "dismissed_at", "flag_id", "publication_ref", "reporter_ref", "state"]);
    // The refused columns are real ones: the names below would otherwise guard nothing.
    const refused = flagColumns.filter((column) => /verdict|reason|judge|token|cost|provider|model/u.test(column));
    expect(refused.length).toBeGreaterThan(0);
    for (const column of refused) expect(reader, column).not.toMatch(new RegExp(`\\b${column}\\b`, "u"));
    // What it hands out, and to whom it belongs.
    expect([...reader.matchAll(/'([a-z_]+)', /gu)].map((match) => match[1])).toEqual(["publication_ref", "run_id", "created_at", "state", "dismissed_at", "content"]);
    expect(reader).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
    expect(reader).toContain("WHERE flag.reporter_ref = v_owner_ref");
  });

  it("both functions are pinned definers; the runtime records, and the worker has exactly the reader", () => {
    const sql = code(read(SQL_PATH));
    for (const signature of [RECORD, EXPORT_READER]) {
      expect(bodyOf(sql, nameOf(signature)), signature).toMatch(/SECURITY DEFINER SET search_path=pg_catalog AS \$\$/u);
      expect(sql, signature).toContain(`'${signature}'`);
    }
    expect(sql).toContain(`REVOKE ALL ON FUNCTION %s FROM PUBLIC,${ROLES.join(",")}`);
    expect([...sql.matchAll(/^GRANT ([^\n]+);$/gmu)].map((match) => match[1])).toEqual([
      `EXECUTE ON FUNCTION ${RECORD} TO ${RUNTIME}`,
      `EXECUTE ON FUNCTION ${EXPORT_READER} TO ${WORKER}`
    ]);
    expect(read("packages/db/src/data-export.ts")).toContain(`"${EXPORT_READER}"`);
    expect(read("packages/db/src/data-export.ts")).toContain("worker.worker_count !== 22");
  });

  it("discloses its grants, lists its loader, and is documented truthfully as expand", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH).map(({ roleName, grants }) => [roleName, grants])).toEqual([
      [RUNTIME, [`EXECUTE ON FUNCTION ${RECORD}`]],
      [WORKER, [`EXECUTE ON FUNCTION ${EXPORT_READER}`]]
    ]);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0152, below) the forty-second");
    const heading = "## A reporter's own reports in their export, and what the AI checks on public rows used (0152)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["forty-second", NAME, "report-export-forward0152.json", LOADER_PATH, "`loadForward0152`", "MIGRATION_FORWARD0152_",
      "-- n1: expand", "-- n1: keeps-verifier", "amendsPostconditionsOf", TABLE, "record_public_check_usage", "read_data_export_public_flags", WORKER]) expect(section, needle).toContain(needle);
    expect(section).not.toContain("-- n1: drained");
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(`\`migrations/${NAME}\` (after \`${PREVIOUS}\`, \`n1: expand\`)`);
  });
});
