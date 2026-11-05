import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationN1Compatibility, auditMigrationReplaySafety, definedFunctionNames, definedRelationNames, type N1AuditContext } from "../../tools/orphan-audit/src/index.js";

/**
 * 0151 (plan 2026-10-31-r22-owner-changes decisions 35 and 36): the Report button and the sealed originals' six months. These read the migration's text and the plan: the n1 lines, the amendment,
 * who may call what, that no request role reads the new tables, the guard and the insert-only logs, that the limits arrive as arguments, the proof's action, and the 410 the page's route declares.
 * What the definers do on real PostgreSQL is tests/integration/public-tree-flow.test.ts's and public-review-http.test.ts's.
 */
const NAME = "0151_public_flag.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-flag-forward0151.json";
const LOADER_PATH = "packages/db/src/migration-forward0151.ts";
const PREVIOUS = "0150_public_review.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/public-review-forward0150.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const escaped = (text: string): string => text.replace(/[\\.()[\]]/gu, "\\$&");

const RUNTIME = "debateai_runtime";
/** Every role a 0131-to-0150 step takes care to refuse by name, beside PUBLIC. The request-facing roles are all here. */
const ROLES = [RUNTIME, "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker"] as const;

/** The report's row moves forward only; a trigger of its own says how. */
const REPORT = "identity.public_flag";
/** Insert-only, by core.reject_mutation. */
const LOGS = ["identity.public_flag_event", "identity.public_review_purged"] as const;
/** The notice is claimed and marked delivered, so it is no log; it stays staff's. */
const NOTICE = "staff.public_flag_notice";
const TABLES = [REPORT, ...LOGS, NOTICE] as const;
/** The eleven the runtime may call, in the file's order. */
const GRANTED = [
  "identity.read_public_flag_target(uuid)",
  "identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)",
  "identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)",
  "identity.delete_public_flag_words_due()",
  "identity.read_public_review_purge_due(integer)",
  "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)",
  "staff.claim_public_flag_notices(integer)",
  "staff.complete_public_flag_notice(uuid,uuid,boolean)",
  "staff.public_flag_notice_user(uuid,uuid)",
  "staff.read_public_flag_queue(jsonb,text)",
  "staff.public_flag_dismiss(jsonb,uuid,jsonb,uuid,uuid,jsonb)"
] as const;
const PRIVATE = [
  "identity.guard_public_flag()",
  "identity.public_flag_queue()",
  "identity.public_flag_mark_read(uuid)",
  "identity.public_flag_dismiss(uuid,uuid,uuid,text)",
  "identity.public_flag_replay(uuid,text)",
  "core.public_review_replace_snapshot(uuid,jsonb)",
  "staff.queue_public_flag_notices(uuid,text)"
] as const;
const AMENDS = [
  { step: "0142_team_limit.sql", field: "function_definition", functions: ["staff.owned_action_allowed(jsonb,jsonb)", "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)"] }
] as const;
const REDEFINED = AMENDS.flatMap((amendment) => amendment.functions as readonly string[]);

/** A function's text from its CREATE to the `$$;` that closes its body. */
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("$$;", at));
};
const earlierSteps = (): string[] => readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();

describe("0151: the Report button and the sealed originals' six months", () => {
  it("follows 0150 in the chain, with its own loader, and keeps 0130's verifier", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0151 } from './migration-forward0151.js';");
    expect(chain).toContain("loadForward0149,loadForward0150,loadForward0151,loadForward0152,loadForward0153,loadForward0154,loadForward0155,loadForward0156,loadForward0157,loadForward0158,loadForward0159,loadForward0160,loadForward0161]");
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-flag-forward0151-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/public-flag-forward0151.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0151_");
    expect(loader).toContain("export async function loadForward0151(");
    for (const table of TABLES) expect(loader, table).toContain(`"${table}"`);
    for (const signature of [...GRANTED, ...PRIVATE]) expect(loader, signature).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-11)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.replayVerifierSql).toBeUndefined();
  });

  it("is bound to 0150's manifest and its own bytes, and the manifest and the plan declare the same amendment", async () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "public-flag-forward0151-v1",
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

  it("every function it redefines is declared against the step that last defined it, and nothing else earlier is redefined", () => {
    const sql = code(read(SQL_PATH));
    const definedHere = [...sql.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_]+)\(/gmu)].map((match) => match[1]!);
    expect([...definedHere].sort()).toEqual([...GRANTED, ...PRIVATE, ...REDEFINED].map(nameOf).sort());
    const lastDefiner = new Map<string, string>();
    for (const step of earlierSteps()) for (const name of definedFunctionNames(read(`migrations/${step}`))) lastDefiner.set(name, step);
    // 0150 redefined these two as well, under its own amendment of 0142: 0150's own postcondition does not digest them, so 0142's receipt is the only one a replay compares.
    for (const signature of REDEFINED) {
      const defined = definedFunctionNames(read(`migrations/${AMENDS[0].step}`));
      expect([...defined], signature).toContain(nameOf(signature));
      expect(lastDefiner.get(nameOf(signature)), signature).toBe(PREVIOUS);
      expect(read("packages/db/src/migration-forward0150.ts"), signature).toContain('step: "0142_team_limit.sql"');
      const postcondition = /const FUNCTIONS[^=]*= \[([^\]]*)\]/u.exec(read("packages/db/src/migration-forward0150.ts"))?.[1];
      expect(postcondition, signature).toBeDefined();
      expect(postcondition, signature).not.toContain(signature);
    }
    for (const signature of [...GRANTED, ...PRIVATE]) expect(lastDefiner.has(nameOf(signature)), signature).toBe(false);
    const earlier = earlierSteps().flatMap((step) => [...definedRelationNames(read(`migrations/${step}`))]);
    for (const table of TABLES) expect(earlier, table).not.toContain(table);
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

  it("makes exactly four tables, all truncate-guarded; the two logs are insert-only by core.reject_mutation", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
    for (const table of LOGS) {
      expect(sql, table).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
    }
  });

  it("a report's row moves forward only: its guard fires per row, refuses a delete, and names each move it allows", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain(`CREATE TRIGGER guard_public_flag BEFORE UPDATE OR DELETE ON ${REPORT} FOR EACH ROW EXECUTE FUNCTION identity.guard_public_flag();`);
    const guard = bodyOf(sql, "identity.guard_public_flag");
    expect(guard).toMatch(/IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_FLAG_APPEND_ONLY'/u);
    // The check's answer once; a dismissal once; the words once; and an erasure takes the name and nothing else.
    expect(guard).toContain("OLD.state = 'CHECKING' AND NEW.state <> 'CHECKING' AND OLD.judged_at IS NULL AND NEW.judged_at IS NOT NULL");
    expect(guard).toContain("OLD.dismissed_at IS NULL AND NEW.dismissed_at IS NOT NULL AND NEW.dismissed_by IS NOT NULL");
    expect(guard).toContain("OLD.content_ciphertext IS NOT NULL AND NEW.content_ciphertext IS NULL");
    expect(guard).toContain("(v_new - ARRAY['reporter_ref']) = (v_old - ARRAY['reporter_ref']) AND NEW.reporter_ref IS NULL");
    // Anything else falls through to the refusal, the guard's last statement.
    expect(guard.trimEnd()).toMatch(/RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_FLAG_APPEND_ONLY';\s*END\s*$/u);
    expect(sql).toMatch(/reporter_ref uuid REFERENCES identity\."user"\(owner_ref\) ON DELETE SET NULL/u);
  });

  it("no request role reads the new tables: each is revoked by name, none is granted, and the file proves it as it applies", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain("ARRAY['identity.public_flag','identity.public_flag_event','identity.public_review_purged']");
    expect(sql).toContain(`REVOKE ALL ON %s FROM PUBLIC,${ROLES.join(",")}`);
    expect(sql).toContain(`REVOKE ALL ON ${NOTICE} FROM PUBLIC, debateai_runtime, debateai_staff_recovery;`);
    expect(sql).toContain(`ALTER TABLE ${NOTICE} OWNER TO debateai_staff_security_owner;`);
    for (const table of TABLES) expect(sql, table).not.toMatch(new RegExp(`GRANT [A-Z, ]+ ON (?:TABLE )?${escaped(table)}\\b`, "u"));
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE)/u);
    expect(sql).toContain("pg_catalog.has_table_privilege(v_role,v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')");
    expect(sql).toContain("'PUBLIC_FLAG_0151_CONTRACT table privilege % %'");
  });

  it("every new function is a pinned definer, every one starts revoked, and the runtime is granted exactly its eleven", () => {
    const sql = code(read(SQL_PATH));
    for (const signature of [...GRANTED, ...PRIVATE]) {
      expect(bodyOf(sql, nameOf(signature)), signature).toMatch(/SECURITY DEFINER SET search_path=pg_catalog AS \$\$/u);
      // The ownership blocks walk their lists by name; the one core function is taken alone, under core's owner.
      expect(sql, signature).toContain(signature.startsWith("core.") ? `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,${ROLES.join(",")}` : `'${signature}'`);
    }
    expect([...sql.matchAll(/^GRANT EXECUTE ON FUNCTION (\S+) TO (\w+);$/gmu)].map((match) => [match[1], match[2]])).toEqual(GRANTED.map((signature) => [signature, RUNTIME]));
    for (const signature of PRIVATE) expect(sql, signature).not.toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO ${RUNTIME}`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION %s FROM PUBLIC,${ROLES.join(",")}`);
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_staff_recovery");
  });

  it("no number from the limits is in the SQL: open_public_flag takes them as arguments and compares its counts with them", () => {
    const source = read("apps/api/src/public-flag.ts");
    // R22 decision 18: the limits are the register's abuseLimits row; no constant stands in for it in the code.
    expect(source).not.toContain("PUBLIC_FLAG_LIMITS");
    const row = read("packages/register/src/abuse-limits.ts");
    const numbers = [...row.matchAll(/\bflag_per_\w+: (\d+)/gu)].map((match) => Number(match[1]));
    expect(numbers).toHaveLength(3);
    const sql = code(read(SQL_PATH));
    const open = bodyOf(sql, "identity.open_public_flag");
    expect(open).toContain("p_person_hour integer, p_debate_day integer, p_site_day integer");
    const comparisons = [...open.matchAll(/\)\s*(>=|<)\s*(\S+?)(?:\s|;)/gu)].map((match) => match[2]);
    expect(comparisons).toEqual(["p_person_hour", "p_debate_day", "p_debate_day", "p_site_day"]);
    // A count is never compared with a bare number, in this function or any other in the file; and no limit value stands on its own in the function that enforces them.
    expect(sql).not.toMatch(/count\(\*\)[^;]*?\)\s*(?:>=|<=|>|<|=)\s*\d/u);
    for (const value of numbers) expect(open, `limit value ${value}`).not.toMatch(new RegExp(`(?<![\\w'-])${value}(?![\\w'-])`, "u"));
    // And the API is what passes them.
    expect(source).toContain("limits: ports.limits }");
  });

  it("only AGREE on a debate never hidden hides, through 0150's own hide, under the nil staff id", () => {
    const settle = bodyOf(code(read(SQL_PATH)), "identity.settle_public_flag");
    expect(settle).toMatch(/IF p_verdict = 'AGREE' AND identity\.read_public_flag_target\(v\.publication_ref\) IS NOT NULL AND NOT identity\.public_review_held\(v\.publication_ref\)\s+AND NOT EXISTS \(SELECT 1 FROM identity\.public_review_event AS event WHERE event\.publication_ref = v\.publication_ref AND event\.action = 'HIDE'\) THEN/u);
    expect(settle).toContain("identity.public_review_apply('00000000-0000-0000-0000-000000000000'::uuid, 'HIDE', v.publication_ref");
    expect(settle.match(/public_review_apply/gu)).toHaveLength(1);
  });

  it("only the purge's two definers disable a trigger, and each enables it again in the same breath", () => {
    const sql = code(read(SQL_PATH));
    const disables = [...sql.matchAll(/ALTER TABLE (\S+) DISABLE TRIGGER reject_mutation;/gu)].map((match) => match[1]);
    expect(disables).toEqual(["serve.publication_snapshot", "identity.public_debate_update", "identity.public_debate_report", "identity.public_review_correction"]);
    for (const table of disables) expect(sql, table).toContain(`ALTER TABLE ${table} ENABLE TRIGGER reject_mutation;`);
    const replace = bodyOf(sql, "core.public_review_replace_snapshot");
    const purge = bodyOf(sql, "identity.public_review_purge");
    expect(replace).toContain("serve.publication_snapshot DISABLE TRIGGER");
    for (const table of disables.slice(1)) expect(purge, table).toContain(`${table} DISABLE TRIGGER`);
    // Nothing is due before six months, and what is purged leaves a digest with no text.
    expect(purge).toContain("v_event_at > clock_timestamp() - interval '6 months' THEN RETURN 'NOT_DUE'");
    expect(sql).toMatch(/original_sha256 text NOT NULL CONSTRAINT public_review_purged_digest_check CHECK \(original_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  });

  it("the proof gains the dismissal in both lists, behind the same authority as the review, and the contract names it", () => {
    const sql = code(read(SQL_PATH));
    expect(bodyOf(sql, "staff.owned_action_allowed")).toContain("WHEN p_binding->>'action' IN ('TEAM_LIMIT_SET','TEAM_PRACTICE_RECORD','PUBLIC_REVIEW_HIDE','PUBLIC_REVIEW_STEP','PUBLIC_REPORT_DISMISS') THEN staff.authorize_action(p_context,'TEAM_LIMIT_SET')");
    expect(bodyOf(sql, "staff.begin_owned_webauthn")).toContain("'PUBLIC_REVIEW_HIDE','PUBLIC_REVIEW_STEP','PUBLIC_REPORT_DISMISS')");
    const dismiss = bodyOf(sql, "staff.public_flag_dismiss");
    expect(dismiss).toContain("staff.authorize_action(p_context,'TEAM_LIMIT_SET')");
    expect(dismiss).toContain("IF p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'");
    expect(dismiss).toContain("staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET','PUBLIC_REPORT_DISMISS',p_flag,p_operation)");
    expect(read("packages/contract/src/staff-access.ts")).toContain('action: z.literal("PUBLIC_REPORT_DISMISS")');
  });

  it("the contract declares the three routes, and that the page's route can answer 410", () => {
    const generate = read("packages/contract/src/generate.ts");
    const line = generate.split("\n").find((entry) => entry.includes('"GET /v1/public/debates/{id}":'));
    expect(line).toBeDefined();
    for (const status of ["200", "404", "410"]) expect(line, status).toContain(`"${status}": { description:`);
    const staff = read("packages/contract/src/staff-access.ts");
    for (const route of ["GET /v1/admin/public-reports", "POST /v1/admin/public-reports/{id}/dismiss"]) expect(staff, route).toContain(`"${route}"`);
    for (const schema of ["PublicFlagQueueSchema", "PublicFlagDismissRequestSchema"]) {
      expect(staff.slice(staff.indexOf("export const staffContractInventory")), schema).toContain(schema);
    }
    expect(read("packages/contract/src/index.ts")).toContain("POST /v1/public/debates/{id}/flag");
  });

  it("discloses its grants, lists its loader, and is documented truthfully as drained with what it amends", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH);
    expect(declared.map(({ roleName, grants }) => [roleName, grants])).toEqual([[RUNTIME, GRANTED.map((signature) => `EXECUTE ON FUNCTION ${signature}`)]]);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0151, below) the forty-first");
    const heading = "## The Report button and the sealed originals' six months (0151)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["forty-first", NAME, "public-flag-forward0151.json", LOADER_PATH, "`loadForward0151`", "MIGRATION_FORWARD0151_",
      "-- n1: drained", "-- n1: keeps-verifier", "amendsPostconditionsOf", "PUBLIC_REPORT_DISMISS", ...TABLES, ...AMENDS.map((amendment) => amendment.step.slice(0, 4))]) expect(section, needle).toContain(needle);
    for (const name of REDEFINED.map(nameOf)) expect(section, name).toContain(`\`${name.slice(name.indexOf(".") + 1)}\``);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(`\`migrations/${NAME}\` (after \`${PREVIOUS}\`, \`n1: drained\`)`);
  });
});
