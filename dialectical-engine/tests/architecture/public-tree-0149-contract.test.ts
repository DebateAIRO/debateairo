import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationN1Compatibility, auditMigrationReplaySafety, definedFunctionNames, definedRelationNames, type N1AuditContext } from "../../tools/orphan-audit/src/index.js";

/**
 * 0149 (plan 2026-10-31-r22-owner-changes decisions 7, 13 and 24): a funded person's public report in the team's month, a settled dig holding no passages, the page's public
 * references, digs no longer waiting for a report, and a report's check naming the report. These read the migration's text and the plan: the n1 lines, the amendments, who may
 * call what, that no request role reads the new tables, and the changed lines. What the definers do on real PostgreSQL is tests/integration/public-tree-flow.test.ts's.
 */
const NAME = "0149_public_report_team_month.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-report-team-month-forward0149.json";
const LOADER_PATH = "packages/db/src/migration-forward0149.ts";
const PREVIOUS = "0148_erasure_keeps_public.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/erasure-keeps-public-forward0148.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const escaped = (text: string): string => text.replace(/[\\.()[\]]/gu, "\\$&");

const RUNTIME = "debateai_runtime";
/** Every role a 0131-to-0148 step takes care to refuse by name, beside PUBLIC. The request-facing roles are all here. */
const ROLES = [RUNTIME, "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker"] as const;

const TABLES = ["staff.team_public_report_spend", "identity.public_update_ref", "identity.public_report_check"] as const;
/** Only the runtime may call these two. */
const GRANTED = [
  "identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean)",
  "identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer)"
] as const;
/** The team's two private definers: no role calls them but the owner of the public report's tables, whose functions do. */
const PRIVATE = ["identity.team_public_report_record(uuid,uuid,bigint)", "identity.team_public_report_funded(uuid)"] as const;
const AMENDS = [
  { step: "0137_public_debates.sql", field: "function_definition", functions: ["identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)", "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)", "identity.read_public_debate_updates(uuid)"] },
  { step: "0139_passage_retention.sql", field: "function_definition", functions: ["identity.debate_nothing_runs(uuid)"] },
  { step: "0142_team_limit.sql", field: "function_definition", functions: ["staff.read_team_month_spent(timestamptz,timestamptz)"] },
  { step: "0147_public_tree.sql", field: "function_definition", functions: ["identity.read_public_dig_parent(uuid,uuid)", "identity.read_public_tree_of_run(uuid)", "identity.join_public_tree(uuid,uuid,uuid,uuid,text)", "identity.public_tree_ongoing(uuid)"] }
] as const;
const REDEFINED = AMENDS.flatMap((amendment) => amendment.functions as readonly string[]);

const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};
const earlierSteps = (): string[] => readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();

describe("0149: a funded person's public report, a settled dig, the page's references", () => {
  it("follows 0148 in the chain, with its own loader, and keeps 0130's verifier", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0149 } from './migration-forward0149.js';");
    expect(chain).toContain("loadForward0147,loadForward0148,loadForward0149,loadForward0150,loadForward0151,loadForward0152,loadForward0153,loadForward0154,loadForward0155,loadForward0156,loadForward0157,loadForward0170,loadForward0171]");
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-report-team-month-forward0149-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/public-report-team-month-forward0149.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0149_");
    expect(loader).toContain("export async function loadForward0149(");
    for (const table of TABLES) expect(loader, table).toContain(`"${table}"`);
    for (const signature of [...GRANTED, ...PRIVATE, ...REDEFINED]) expect(loader, signature).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-11)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.replayVerifierSql).toBeUndefined();
  });

  it("is bound to 0148's manifest and its own bytes, and the manifest and the loader declare the same amendments", async () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "public-report-team-month-forward0149-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: AMENDS
    });
    // The loader refuses a manifest whose list differs from its own, and the plan hands the chain the list.
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-11)!.amendsPostconditionsOf).toEqual(AMENDS);
  });

  it("declares `-- n1: drained` and `-- n1: keeps-verifier`", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("every function it redefines is declared, against the last step that defined it, and nothing else earlier is redefined", () => {
    const sql = code(read(SQL_PATH));
    const definedHere = [...sql.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_]+)\(/gmu)].map((match) => match[1]!);
    expect([...definedHere].sort()).toEqual([...GRANTED, ...PRIVATE, ...REDEFINED].map(nameOf).sort());
    const lastDefiner = new Map<string, string>();
    for (const step of earlierSteps()) for (const name of definedFunctionNames(read(`migrations/${step}`))) lastDefiner.set(name, step);
    for (const amendment of AMENDS) {
      for (const signature of amendment.functions) expect(lastDefiner.get(nameOf(signature)), signature).toBe(amendment.step);
    }
    for (const signature of [...GRANTED, ...PRIVATE]) expect(lastDefiner.has(nameOf(signature)), signature).toBe(false);
    for (const table of TABLES) {
      const earlier = earlierSteps().flatMap((step) => definedRelationNames(read(`migrations/${step}`)));
      expect(earlier, table).not.toContain(table);
    }
  });

  it("passes the replay audit, and the N-1 audit finds nothing a drained step may not do", async () => {
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

  it("makes exactly three tables, each insert-only and truncate-guarded, and no request role reads them", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql, table).toMatch(new RegExp(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${escaped(table)}\\nFOR EACH STATEMENT EXECUTE FUNCTION core\\.reject_mutation\\(\\);`, "u"));
      const revoke = new RegExp(`^REVOKE ALL ON ${escaped(table)} FROM ([^;\\n]+);$`, "mu").exec(sql);
      expect(revoke?.[1]?.split(","), table).toEqual(["PUBLIC", ...ROLES]);
      // Nothing in this file grants a table, under its own name or any other way.
      expect(sql, table).not.toMatch(new RegExp(`\\bGRANT\\b[^\\n]*\\b${escaped(table)}\\b`, "u"));
    }
    expect(sql).not.toMatch(/\bGRANT\b[^\n]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b/u);
    // The three go through the file's definers only: every name in the tree of request code is a definer's, never a table's.
    for (const file of ["packages/db/src/public-debates.ts", "packages/db/src/public-tree.ts", "apps/api/src/public-tree.ts", "apps/runner/src/public-contribution.ts", "packages/budget/src/model-spend.ts"]) {
      for (const table of TABLES) expect(read(file), `${file} ${table}`).not.toMatch(new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+${escaped(table)}\\b`, "u"));
    }
  });

  it("each new definer has one way in: the runtime for the two, no request role for the team's two", () => {
    const sql = code(read(SQL_PATH));
    for (const name of [...GRANTED, ...PRIVATE].map(nameOf)) {
      const head = bodyOf(sql, name).split("\nAS $$")[0]!;
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    const granted = [...sql.matchAll(/^GRANT EXECUTE ON FUNCTION (\S+) TO ([a-z_]+);$/gmu)].map((match) => [match[1], match[2]]);
    expect(granted).toEqual(GRANTED.map((signature) => [signature, RUNTIME]));
    for (const signature of GRANTED) {
      const revoke = new RegExp(`^REVOKE ALL ON FUNCTION ${escaped(signature)} FROM ([^;\\n]+);$`, "mu").exec(sql);
      expect(revoke?.[1]?.split(",").sort(), signature).toEqual(["PUBLIC", ...ROLES.filter((role) => role !== RUNTIME)].sort());
    }
    for (const signature of PRIVATE) {
      const revoke = new RegExp(`^REVOKE ALL ON FUNCTION ${escaped(signature)} FROM ([^;\\n]+);$`, "mu").exec(sql);
      expect(revoke?.[1]?.split(","), signature).toEqual(["PUBLIC", ...ROLES]);
      expect(sql, signature).toContain(`ALTER FUNCTION ${signature} OWNER TO debateai_staff_security_owner;`);
    }
    expect(sql).toContain("ALTER TABLE staff.team_public_report_spend OWNER TO debateai_staff_security_owner;");
    // The owner of 0137's tables may call the team's two, so its functions can; that is the only other grant.
    expect(sql.match(/GRANT EXECUTE ON FUNCTION identity\.team_public_report_record[^\n]*/gu)).toEqual([
      "GRANT EXECUTE ON FUNCTION identity.team_public_report_record(uuid,uuid,bigint), identity.team_public_report_funded(uuid) TO %I', v_owner);"
    ]);
    // A redefined function keeps its owner and grants: CREATE OR REPLACE keeps them, and the file touches them nowhere.
    for (const signature of REDEFINED) expect(sql, signature).not.toMatch(new RegExp(`\\b(?:ALTER FUNCTION|REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION) ${escaped(signature)}`, "u"));
  });

  it("a settled contribution holds no passages: `contribution.outcome IS NULL` is the new line in debate_nothing_runs", () => {
    const before = bodyOf(code(read("migrations/0139_passage_retention.sql")), "identity.debate_nothing_runs");
    const after = bodyOf(code(read(SQL_PATH)), "identity.debate_nothing_runs");
    expect(before).not.toContain("contribution.outcome IS NULL");
    expect(after).toContain("contribution.position_ref IS NOT NULL AND contribution.outcome IS NULL");
    // The rest of 0139's rule stands: an unsettled dig with no row still holds them.
    expect(after).toContain("NOT EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.run_id = p_run_id");
  });

  it("the team's month adds the new table once, and the charge's writer fills it in the same transaction", () => {
    const sql = code(read(SQL_PATH));
    const before = bodyOf(code(read("migrations/0142_team_limit.sql")), "staff.read_team_month_spent");
    const reader = bodyOf(sql, "staff.read_team_month_spent");
    expect(before).not.toContain("staff.team_public_report_spend");
    expect(reader.match(/FROM staff\.team_public_report_spend/gu)).toHaveLength(1);
    expect(reader).toContain("staff.read_team_internal_spent(p_from,p_to)");
    expect(reader).toContain("FROM staff.team_practice_spend");
    const writer = bodyOf(sql, "identity.record_public_report_charge");
    expect(writer).toContain("PERFORM identity.team_public_report_record(p_spend_id, p_owner_ref, p_charge_micros);");
    // Funded means a live grant at the moment of the charge.
    expect(bodyOf(sql, "identity.team_public_report_record")).toContain("grant_row.revoked_at IS NULL AND grant_row.starts_at <= clock_timestamp() AND grant_row.expires_at > clock_timestamp()");
    // The person's windows split by that record, so a charge never counts twice.
    expect(bodyOf(sql, "identity.read_public_report_spent_by_funding")).toContain("identity.team_public_report_funded(charge.spend_id) = p_funded");
  });

  it("a page shows and a dig names the random reference, never the row's own id", () => {
    const sql = code(read(SQL_PATH));
    expect(bodyOf(sql, "identity.record_public_debate_update")).toContain("INSERT INTO identity.public_update_ref (update_id, public_ref) VALUES (p_update_id, gen_random_uuid());");
    const page = bodyOf(sql, "identity.read_public_debate_updates");
    expect(page).toContain("'update_id', reference.public_ref");
    expect(page).not.toContain("'update_id', update_row.update_id");
    expect(page).toContain("JOIN identity.public_update_ref AS reference ON reference.update_id = update_row.update_id");
    expect(bodyOf(sql, "identity.read_public_dig_parent")).toContain("WHERE reference.public_ref = p_dig_update_id");
    expect(bodyOf(sql, "identity.read_public_tree_of_run")).toContain("SELECT reference.public_ref FROM identity.public_debate_update");
    // Updates older than this step get one too.
    expect(sql).toMatch(/INSERT INTO identity\.public_update_ref \(update_id, public_ref\)\nSELECT update_row\.update_id, gen_random_uuid\(\) FROM identity\.public_debate_update AS update_row\nON CONFLICT \(update_id\) DO NOTHING;/u);
  });

  it("digs no longer wait for a report, and a dig waiting in line holds no report back", () => {
    const sql = code(read(SQL_PATH));
    const beforeJoin = bodyOf(code(read("migrations/0147_public_tree.sql")), "identity.join_public_tree");
    const join = bodyOf(sql, "identity.join_public_tree");
    expect(beforeJoin).toContain("'WRITING'");
    expect(join).not.toContain("WRITING");
    expect(join).not.toContain("identity.public_report ");
    expect(bodyOf(sql, "identity.read_public_dig_parent")).toContain("'writing', false");
    const ongoing = bodyOf(sql, "identity.public_tree_ongoing");
    expect(ongoing).toContain("contribution.outcome IS NULL AND EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = contribution.dig_run_id)");
  });

  it("a report's check names the report", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain("report_id uuid NOT NULL REFERENCES identity.public_report(report_id)");
    expect(sql).toContain("CONSTRAINT public_report_check_outcome_check CHECK (outcome IN ('ALLOW','BLOCK','UNSURE','UNAVAILABLE'))");
    expect(bodyOf(sql, "identity.record_public_report_check")).toContain("INSERT INTO identity.public_report_check (report_id,");
  });

  it("discloses its grants, lists its loader, and is documented truthfully as drained with what it amends", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH);
    expect(declared.map(({ roleName, grants }) => [roleName, grants])).toEqual([[RUNTIME, GRANTED.map((signature) => `EXECUTE ON FUNCTION ${signature}`)]]);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0149, below) the thirty-ninth");
    const heading = "## A funded person's public report in the team's month (0149)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["thirty-ninth", NAME, "public-report-team-month-forward0149.json", LOADER_PATH, "`loadForward0149`", "MIGRATION_FORWARD0149_",
      "-- n1: drained", "-- n1: keeps-verifier", "amendsPostconditionsOf", ...TABLES, ...AMENDS.map((amendment) => amendment.step.slice(0, 4))]) expect(section, needle).toContain(needle);
    for (const name of REDEFINED.map(nameOf)) expect(section, name).toContain(`\`${name.slice(name.indexOf(".") + 1)}\``);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(`\`migrations/${NAME}\` (after \`${PREVIOUS}\`, \`n1: drained\`)`);
  });
});
