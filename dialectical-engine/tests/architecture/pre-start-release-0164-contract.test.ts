import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedFunctionNames, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0164 (V4 start step, plan 2026-11-03 Task 57c; the owner's 5 Nov answer Q20 A and its second-round follow-up): a failed question gives back
 * its path-list charge. Each charge before Start names its try; Start gives the try's charges to the debate once; the person's readers leave
 * out a charge whose debate failed; a failed debate's read says whether any quota was used. Drained, because it redefines 0157's readers.
 */
const NAME = "0164_pre_start_release.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/pre-start-release-forward0164.json";
const PREVIOUS = "0163_main_answer_path_added.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/main-answer-path-added-forward0163.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.pre_start_try";
const SPENT = "identity.read_pre_start_spent(uuid,timestamptz,timestamptz)";
const READERS = ["billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)", "staff.read_team_internal_spent(timestamptz,timestamptz)"];
const AMENDS = [
  { step: "0140_internal_spend_kinds.sql", functions: READERS, field: "function_definition" },
  { step: "0144_ask_clarify_charge.sql", functions: READERS, field: "function_definition" },
  { step: "0157_pre_start_charge.sql", functions: [SPENT, ...READERS], field: "function_definition" }
];
/** What makes a charge given back: given to a debate with a FAILED work item. */
const GIVEN_BACK = "NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=";
/** Task 57e: ... that keeps no paths chosen from the list (Ask again re-uses those, so their charges are kept). */
const NOT_KEPT = "AND NOT core.run_pre_start_kept(t.run_id)";
const KEPT = "core.run_pre_start_kept(uuid)";
const RETRY_TABLE = "core.work_item_retry";
const RETRY = "core.record_work_item_retry(uuid,uuid,timestamptz)";
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("(")).toLowerCase();
const bodyOf = (sql: string, head: string): string => {
  const at = sql.indexOf(head);
  expect(at, head).toBeGreaterThanOrEqual(0);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};

describe("0164: a failed question gives back its path-list charge", () => {
  it("C-T is a step of the chain, after 0163, with its own loader and its amendments", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0164 } from './migration-forward0164.js';");
    expect(chain).toContain("loadForward0163,loadForward0164]");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual(AMENDS);
    const loader = read("packages/db/src/migration-forward0164.ts");
    for (const name of [TABLE, "identity.record_pre_start_try_charge(", "identity.link_pre_start_try(", "identity.read_run_quota_used(", SPENT, ...READERS,
      RETRY_TABLE, KEPT, RETRY]) {
      expect(loader, name).toContain(name);
    }
  });

  it("C-M is bound to 0163's manifest as Task 56e left it and to the verifier in force, and declares its amendments", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "pre-start-release-forward0164-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: AMENDS
    });
  });

  it("C-H says truthfully that it is drained and keeps the verifier; each function it redefines is declared against every step whose digest pins it", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();
    const lastDefiner = new Map<string, string>();
    for (const step of earlier) for (const name of definedFunctionNames(read(`migrations/${step}`))) lastDefiner.set(name, step);
    const redefined = definedFunctionNames(read(SQL_PATH)).filter((name) => lastDefiner.has(name)).sort();
    expect(redefined).toEqual([nameOf(READERS[0]!), nameOf(SPENT), nameOf(READERS[1]!)].sort());
    for (const name of redefined) expect(lastDefiner.get(name), name).toBe("0157_pre_start_charge.sql");
  });

  it("C-A passes the replay audit; its one table is new", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    expect([...definedRelationNames(sql)]).toEqual([TABLE, RETRY_TABLE]);
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME);
    for (const table of [TABLE, RETRY_TABLE]) expect(earlier.some((name) => definedRelationNames(read(`migrations/${name}`)).includes(table)), table).toBe(false);
  });

  it("C-O stores the charge, its person, its try and (from Start) its debate: no text; no request role reads it; append-only but for the link", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE} (`);
    const columns = sql.slice(at, sql.indexOf("\n);", at));
    expect([...columns.matchAll(/^ {2}([a-z_]+) (?:uuid|text|bigint|timestamptz|jsonb|bytea)/gmu)].map((match) => match[1]))
      .toEqual(["charge_id", "owner_ref", "try_ref", "run_id", "linked_at"]);
    expect(columns).not.toMatch(/question|suggestion|answer|ciphertext|content|words/u);
    expect(columns).toContain("REFERENCES identity.pre_start_charge(charge_id) ON DELETE CASCADE");
    expect(columns).toContain('REFERENCES identity."user"(owner_ref) ON DELETE CASCADE');
    expect(columns).toContain("CHECK (try_ref ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
    const guard = bodyOf(sql, "CREATE OR REPLACE FUNCTION identity.guard_pre_start_try()");
    expect(guard).toContain("OLD.run_id IS NULL AND NEW.run_id IS NOT NULL");
    expect(guard).toContain("PRE_START_TRY_GIVEN_ONCE");
    expect(sql).toMatch(/^REVOKE ALL ON identity\.pre_start_try FROM PUBLIC,/mu);
    expect([...sql.matchAll(/^GRANT [^\n]* ON identity\.pre_start_try TO ([a-z_]+);$/gmu)].map((match) => match[1])).toEqual(["debateai_staff_security_owner"]);
  });

  it("C-R every reader of the person's quota leaves out a charge whose debate failed, and the funded readers keep their earlier rules", () => {
    const sql = code(read(SQL_PATH));
    expect(bodyOf(sql, "CREATE OR REPLACE FUNCTION identity.read_pre_start_spent(")).toContain(`${GIVEN_BACK}c.charge_id AND w.state='FAILED' ${NOT_KEPT})`);
    for (const head of ["CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(", "CREATE OR REPLACE FUNCTION staff.read_team_internal_spent("]) {
      const body = bodyOf(sql, head);
      expect(body, head).toContain(`${GIVEN_BACK}b.charge_id AND w.state='FAILED' ${NOT_KEPT})`);
      // 0123's waiver and 0144's step-2 charge stay, word for word.
      expect(body, head).toContain("NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id)");
      expect(body, head).toContain("FROM identity.ask_clarify_charge k");
    }
    const quota = bodyOf(sql, "CREATE OR REPLACE FUNCTION identity.read_run_quota_used(");
    expect(quota).toContain("THEN 'SOME'");
    expect(quota).toContain("ELSE 'NONE'");
    expect(quota).toContain("core.run_ownership_event");
    expect(quota).toContain(`AND NOT EXISTS (SELECT 1 FROM core.work_item w WHERE w.run_id=t.run_id AND w.state='FAILED' ${NOT_KEPT})`);
    const link = bodyOf(sql, "CREATE OR REPLACE FUNCTION identity.link_pre_start_try(");
    expect(link).toContain("core.run_ownership_event");
    expect(link).toContain("open_try.run_id IS NULL");
  });

  it("C-D discloses its grants, lists its loader, and is documented", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const actual = [...read(SQL_PATH).matchAll(/^GRANT ([^\n]+) TO ([a-z_]+);$/gmu)].map((match) => `${match[2]}: ${match[1]}`).sort();
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)
      .flatMap(({ roleName, grants }) => grants.map((grant) => `${roleName}: ${grant}`)).sort();
    expect(actual).toEqual(declared);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain("packages/db/src/migration-forward0164.ts");
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0164, below) the fifty-fourth", "## A failed question gives back its path-list charge (0164)", "`loadForward0164`",
      "MIGRATION_FORWARD0164_", "`core.run_pre_start_kept`", "`core.work_item_retry`"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0164_pre_start_release.sql` (after `0163_main_answer_path_added.sql`, `n1: drained`)");
  });

  // Task 57d (the owner's 6 Nov answer, card "Privacy": "Random id"; edited in place, never pushed or applied): the try is a random id the API
  // mints once per reading and carries inside the signed check; nothing made from the question's words is stored. The step and its README say so.
  it("C-P names a try that is a random id per reading, never anything made from the question's words", () => {
    const header = read(SQL_PATH).split("\n").filter((line) => line.startsWith("--")).join(" ").replace(/\s*--\s*/gu, " ");
    expect(header).toContain("a random id the API mints once per reading before Start, carried inside the signed check");
    expect(header).toContain("Nothing made from the question's words is stored");
    expect(header).not.toMatch(/keyed hash|HMAC|derives/u);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    const section = readme.slice(readme.indexOf("## A failed question gives back its path-list charge (0164)"));
    expect(section).toContain("a random id the API mints once per reading before Start and carries inside the signed check");
    expect(section.slice(0, section.indexOf("## ", 3))).not.toMatch(/keyed hash|derives from one person's one question/u);
  });

  // Task 57e (the owner's 6 Nov rule: "re-use what we already paid for"; edited in place, never pushed or applied): a charge before Start is
  // given back only when its failed debate keeps nothing it bought (no paths chosen from the list: Ask again re-uses those); and a debate that
  // stops on our side is claimed again once, a few minutes later, its one retry recorded per work item.
  it("C-K a failed debate keeps the charges of paths it kept from the list (not one set aside): one codes-only reader, for the readers' owner alone", () => {
    const sql = code(read(SQL_PATH));
    const kept = bodyOf(sql, "CREATE OR REPLACE FUNCTION core.run_pre_start_kept(");
    expect(kept).toContain("SECURITY DEFINER");
    expect(kept).toContain("SET search_path=pg_catalog");
    expect(kept).toContain("FROM core.start_path_set AS path_set WHERE path_set.run_id = p_run_id AND path_set.source = 'MENU'");
    // A debate an upload set aside used none of the person's quota (0123's waiver, its own sentence): its charges are given back as before.
    expect(kept).toContain("AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver AS waiver WHERE waiver.run_id = p_run_id)");
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${KEPT} FROM PUBLIC,`);
    expect([...sql.matchAll(/^GRANT EXECUTE ON FUNCTION core\.run_pre_start_kept\(uuid\) TO ([a-z_]+);$/gmu)].map((match) => match[1]))
      .toEqual(["debateai_staff_security_owner"]);
    // 0158's table and 0123's waiver are read by their owner's definer, never granted: their digests of their ACLs stay as they were.
    expect(sql).not.toMatch(/^GRANT [^\n]* ON (?:core\.start_path_set|ledger\.model_spend_waiver) /mu);
  });

  it("C-Y the one retry: one row per work item, ids and times only, insert-only; its one writer for the runner's role alone", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${RETRY_TABLE} (`);
    const columns = sql.slice(at, sql.indexOf("\n);", at));
    expect([...columns.matchAll(/^ {2}([a-z_]+) (?:uuid|text|bigint|timestamptz|jsonb|bytea)/gmu)].map((match) => match[1]))
      .toEqual(["work_item_id", "run_id", "retry_after", "recorded_at"]);
    expect(columns).toContain("work_item_id uuid PRIMARY KEY");
    expect(columns).not.toMatch(/question|answer|ciphertext|content|reason|words/u);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${RETRY_TABLE}');`);
    expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${RETRY_TABLE}`);
    const writer = bodyOf(sql, "CREATE OR REPLACE FUNCTION core.record_work_item_retry(");
    expect(writer).toContain("item.state = 'CLAIMED'");
    expect(writer).toContain("ON CONFLICT DO NOTHING");
    expect(writer).toContain("RETURN 'ALREADY'");
    expect(sql).toMatch(/^REVOKE ALL ON core\.work_item_retry FROM PUBLIC,/mu);
    expect([...sql.matchAll(/^GRANT [^\n]* ON core\.work_item_retry TO ([a-z_]+);$/gmu)]).toEqual([]);
    expect([...sql.matchAll(/^GRANT EXECUTE ON FUNCTION core\.record_work_item_retry\(uuid,uuid,timestamptz\) TO ([a-z_]+);$/gmu)].map((match) => match[1]))
      .toEqual(["debateai_runtime"]);
    const header = read(SQL_PATH).split("\n").filter((line) => line.startsWith("--")).join(" ");
    expect(header).toContain("Task 57e");
  });
});
