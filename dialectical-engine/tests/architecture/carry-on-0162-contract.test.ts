import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditMigrationReplaySafety,
  definedFunctionNames,
  definedRelationNames
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0162 (V4 start step, plan 2026-11-03 Task 56a; decision record answer 11, owner ruling 3 Nov night): the carry-on's digs run even when
 * the person has signed out or their session has lapsed. Built like 0123's re-admission (the readmitted run's key provision and its commit
 * lock), with tighter limits: one dig per path of the debate's own chosen paths, never retried; Free one in all; only while the carry-on is
 * BEGUN and not DONE; only while the account is active and still the debate's owner. 0123's core.create_encrypted_run is redefined with one
 * more branch and declared as an amendment of 0123's postcondition. No database here: the behaviour is
 * tests/integration/carry-on-dig-key-provision.test.ts.
 */
const NAME = "0162_carry_on_session_free_digs.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/carry-on-forward0162.json";
const LOADER_PATH = "packages/db/src/migration-forward0162.ts";
const PREVIOUS = "0161_saved_questions.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/saved-questions-forward0161.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0162 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const PREPARE = "core.prepare_carry_on_run_key_provision(uuid,uuid,text)";
const LOCK = "core.lock_carry_on_run_key_provision_for_commit(uuid,uuid,uuid,uuid)";
const CREATE = "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)";
const FUNCTIONS = [PREPARE, LOCK, CREATE] as const;
const COLUMNS = [
  "core.run_key_provision_intent.carry_on_parent_run_id",
  "identity.run_execution_binding.carry_on_parent_run_id",
  "identity.run_execution_binding.carry_on_path_id"
] as const;
const CODES = ["CARRY_ON_DIG_INVALID", "CARRY_ON_DIG_OWNER_GONE", "CARRY_ON_DIG_TAKEN"] as const;
const AMENDS = [{ step: "0123_side_by_side_releases.sql", functions: [CREATE], field: "function_definition" }];
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const headOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("AS $$", at));
};
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
};
/** core.create_encrypted_run from its CREATE through its one GRANT line: the function, its REVOKE and its GRANT, as written. */
const encryptedRunText = (sql: string): string => {
  const at = sql.indexOf("CREATE OR REPLACE FUNCTION core.create_encrypted_run(");
  const grant = "GRANT EXECUTE ON FUNCTION core.create_encrypted_run(jsonb,uuid,uuid,jsonb) TO debateai_content_provision;";
  return at < 0 ? "" : sql.slice(at, sql.indexOf(grant, at) + grant.length);
};
/** The one carry-on branch 0162 puts between 0123's two, with the space before 0123's ELSE that it ends on. */
const CARRY_ON_BRANCH = new RegExp([
  String.raw`WHEN EXISTS \(\n`,
  String.raw` {8}SELECT 1 FROM core\.run_key_provision_intent AS marked\n`,
  String.raw` {8}WHERE marked\.run_id=v_run_id AND marked\.carry_on_parent_run_id IS NOT NULL\n`,
  String.raw` {6}\) THEN core\.lock_carry_on_run_key_provision_for_commit\(\n`,
  String.raw` {8}v_run_id,p_user_id,p_owner_ref,v_execution_ref\n`,
  String.raw` {6}\) `
].join(""), "gu");

describe("0162: carry-on digs provision their key without a live sign-in", () => {
  it("C-T is the step right after 0161, found by name, with its own loader and its one declared amendment of 0123", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0162 } from './migration-forward0162.js';");
    expect(chain).toContain("loadForward0161,loadForward0162");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual(AMENDS);
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "carry-on-forward0162-v1";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    for (const name of [...FUNCTIONS, ...COLUMNS]) expect(loader, name).toContain(`"${name}"`);
    expect(loader).toContain("MIGRATION_FORWARD0162_");
    // Declared as 0144 declares its own amendment: frozen, the step, the functions and the field.
    expect(loader).toContain('const AMENDS: readonly PostconditionAmendment[] = Object.freeze([Object.freeze({\n  step: "0123_side_by_side_releases.sql",');
    expect(loader).toContain('functions: Object.freeze(["core.create_encrypted_run(jsonb,uuid,uuid,jsonb)"]),');
    expect(loader).toContain('field: "function_definition" as const');
  });

  it("C-M is bound to 0161's manifest and to the verifier in force (0130's, which 0161 keeps), and carries the amendment", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "carry-on-forward0162-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: AMENDS
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-130.sql"))).toBe(VERIFIER_130);
  });

  it("C-H says truthfully that it redefines an earlier step's function (drained, as 0123 and 0157) and keeps the verifier; both audits pass", async () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(sql).toMatch(/^-- n1: drained$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort()) {
      for (const defined of definedFunctionNames(read(`migrations/${name}`))) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(read(`migrations/${name}`))) earlierRelations.add(defined);
    }
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, { earlierFunctions, earlierRelations, keepsVerifier: true })).toEqual([]);
    // As expand it could not pass: an earlier step's function is replaced (and its grants re-asserted).
    const asExpand = sql.replace(/^-- n1: drained$/mu, "-- n1: expand");
    expect(auditMigrationN1Compatibility(SQL_PATH, asExpand, { earlierFunctions, earlierRelations, keepsVerifier: true })
      .map((finding) => finding.split(" ")[1])).toContain("N1_FORBIDDEN_REPLACE");
    // No table and no view of its own.
    expect([...definedRelationNames(sql)]).toEqual([]);
  });

  it("C-O three nullable marker columns, the three CHECKs and one UNIQUE index (one carry-on dig per path), replay-safe", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain("ALTER TABLE core.run_key_provision_intent ADD COLUMN IF NOT EXISTS carry_on_parent_run_id uuid NULL;");
    expect(sql).toContain("ALTER TABLE identity.run_execution_binding ADD COLUMN IF NOT EXISTS carry_on_parent_run_id uuid NULL;");
    expect(sql).toContain("ALTER TABLE identity.run_execution_binding ADD COLUMN IF NOT EXISTS carry_on_path_id text NULL;");
    expect([...sql.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+)/gu)].map((match) => match[1]))
      .toEqual(["carry_on_parent_run_id", "carry_on_parent_run_id", "carry_on_path_id"]);
    const checks = [...sql.matchAll(/ALTER TABLE ([a-z_.]+) ADD CONSTRAINT ([a-z_]+)\n\s+(CHECK \(.*\));/gu)]
      .map((match) => [match[1], match[2], match[3]]);
    expect(checks).toEqual([
      ["core.run_key_provision_intent", "run_key_provision_intent_one_marker",
        "CHECK (readmitted_from_run_id IS NULL OR carry_on_parent_run_id IS NULL)"],
      ["identity.run_execution_binding", "run_execution_binding_carry_on_pair",
        "CHECK ((carry_on_parent_run_id IS NULL AND carry_on_path_id IS NULL) OR (carry_on_parent_run_id IS NOT NULL AND carry_on_path_id IS NOT NULL AND carry_on_path_id ~ '^b[1-8]$'))"],
      ["identity.run_execution_binding", "run_execution_binding_one_marker",
        "CHECK (readmitted_from_run_id IS NULL OR carry_on_parent_run_id IS NULL)"]
    ]);
    for (const [table, name] of checks) expect(sql, `${String(name)}`).toContain(`ALTER TABLE ${String(table)} DROP CONSTRAINT IF EXISTS ${String(name)};`);
    expect(sql.match(/ADD CONSTRAINT /gu)).toHaveLength(3);
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS run_execution_binding_one_carry_on_dig_idx\n"
      + "  ON identity.run_execution_binding (carry_on_parent_run_id, carry_on_path_id) WHERE carry_on_parent_run_id IS NOT NULL;");
    expect(sql.match(/CREATE (?:UNIQUE )?INDEX/gu)).toHaveLength(1);
  });

  it("C-F exactly three functions, each a definer with only pg_catalog on its path; of earlier steps' functions only 0123's create_encrypted_run is redefined", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gmu)].map((match) => match[1]);
    expect(created).toEqual(FUNCTIONS.map(nameOf));
    expect([...definedFunctionNames(sql)]).toEqual(FUNCTIONS.map(nameOf));
    for (const signature of FUNCTIONS) {
      const head = headOf(code(sql), nameOf(signature));
      expect(head, signature).toMatch(/\n\s*SECURITY DEFINER\n/u);
      expect(head, signature).toMatch(/\n\s*SET search_path = pg_catalog\n/u);
      expect(head, signature).toMatch(/\n\s*VOLATILE\n/u);
    }
    expect(headOf(code(sql), nameOf(PREPARE))).toContain("(p_parent_run_id uuid, p_new_run_id uuid, p_path_id text)\nRETURNS TABLE(execution_ref uuid, user_id uuid)");
    expect(headOf(code(sql), nameOf(LOCK))).toContain("p_run_id uuid, p_user_id uuid, p_owner_ref uuid, p_execution_ref uuid\n)\nRETURNS boolean");
    // 0040 and 0123 keep every other function; 0162's new two are new everywhere.
    for (const earlier of ["0040_account_erasure.sql", "0085_staff_access_foundation.sql", "0123_side_by_side_releases.sql"]) {
      const theirs = definedFunctionNames(read(`migrations/${earlier}`));
      expect(theirs.length, earlier).toBeGreaterThan(0);
      for (const name of definedFunctionNames(sql)) {
        if (name !== nameOf(CREATE)) expect(theirs, `${earlier} ${name}`).not.toContain(name);
      }
    }
    expect(definedFunctionNames(read("migrations/0123_side_by_side_releases.sql"))).toContain(nameOf(CREATE));
    expect(code(sql)).not.toMatch(/^\s*DROP (?:TABLE|FUNCTION|INDEX) /mu);
  });

  it("C-E create_encrypted_run is 0123's §2 text byte for byte once the one carry-on branch is removed", () => {
    const ours = encryptedRunText(read(SQL_PATH));
    const theirs = encryptedRunText(read("migrations/0123_side_by_side_releases.sql"));
    expect(theirs).not.toBe("");
    expect(ours.match(CARRY_ON_BRANCH)).toHaveLength(1);
    expect(ours.replace(CARRY_ON_BRANCH, "")).toBe(theirs);
    // Between 0123's two branches: the readmitted one first, then the carry-on one, then 0040's lock.
    expect(ours.indexOf("core.lock_readmitted_run_key_provision_for_commit(")).toBeLessThan(ours.indexOf("core.lock_carry_on_run_key_provision_for_commit("));
    expect(ours.indexOf("core.lock_carry_on_run_key_provision_for_commit(")).toBeLessThan(ours.indexOf("ELSE core.lock_run_key_provision_for_commit("));
  });

  it("C-P the prepare: 0123's steps in 0123's lock order, the carry-on checks, the three codes, TAKEN after the account's lock, 5 minutes", () => {
    const body = bodyOf(code(read(SQL_PATH)), nameOf(PREPARE)).replace(/\s+/gu, " ");
    for (const needle of ["core.carry_on_mark", "'BEGUN'", "'DONE'", "core.start_path", "plan_tier", "'free'", ...CODES.map((one) => `'${one}'`),
      "p_path_id !~ '^b[1-8]$'", "identity.lock_security_subjects(ARRAY[v_user_id])",
      "pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:account:' || v_user_id::text, 0))",
      "identity.lock_account_t9_internal(v_user_id, true)", "v_account.owner_ref IS DISTINCT FROM v_owner_ref",
      "parent_run.content_encryption_version = 1", "parent_run.asker_id = 'owner:' || owner.owner_ref::text", "interval '5 minutes'",
      "EXISTS (SELECT 1 FROM core.run AS taken WHERE taken.run_id = p_new_run_id)",
      "carry_on_parent_run_id, carry_on_path_id",
      // Review of Task 56a: a deleted debate's content is no longer live (0123's re-admission refuses it the same way).
      "NOT core.run_private_content_is_live(p_parent_run_id)"]) expect(body, needle).toContain(needle);
    // The parent's binding is copied, signed out or not: no session is read, and no re-admission marker is written.
    expect(body).not.toContain("identity.session");
    expect(body).not.toContain("readmitted_from_run_id");
    // Lock order: the security subject, then the account; the carry-on marks and TAKEN are decided after it.
    expect(body.indexOf("identity.lock_security_subjects")).toBeLessThan(body.indexOf("pg_advisory_xact_lock"));
    expect(body.indexOf("pg_advisory_xact_lock")).toBeLessThan(body.indexOf("identity.lock_account_t9_internal"));
    expect(body.indexOf("identity.lock_account_t9_internal")).toBeLessThan(body.indexOf("'BEGUN'"));
    expect(body.indexOf("identity.lock_account_t9_internal")).toBeLessThan(body.indexOf("'CARRY_ON_DIG_TAKEN'"));
    expect(body.indexOf("'CARRY_ON_DIG_TAKEN'")).toBeLessThan(body.indexOf("INSERT INTO identity.run_execution_binding"));
    expect(body.match(/ERRCODE = '55000'/gu)?.length).toBeGreaterThanOrEqual(4);
  });

  it("C-L the commit lock: 0123's readmitted lock on the carry-on marker, ending on BEGUN, not DONE and the parent's newest owner", () => {
    const body = bodyOf(code(read(SQL_PATH)), nameOf(LOCK)).replace(/\s+/gu, " ");
    for (const needle of ["identity.lock_security_subjects(ARRAY[p_user_id])", "identity.lock_account_t9_internal(p_user_id, true)",
      "intent.cleanup_state = 'PREPARED'", "intent.expires_at > clock_timestamp()", "intent.carry_on_parent_run_id IS NOT NULL", "FOR UPDATE",
      "FOR KEY SHARE", "core.carry_on_mark", "'BEGUN'", "'DONE'", "core.run_ownership_event", "ORDER BY event.at_seq DESC LIMIT 1", "= p_owner_ref",
      "core.run_private_content_is_live(v_parent_run_id)"]) {
      expect(body, needle).toContain(needle);
    }
    expect(body).not.toContain("identity.session");
    expect(body).not.toContain("readmitted_from_run_id");
  });

  it("C-G exactly two GRANT lines, both to the content-provision role (the prepare's and create_encrypted_run's); the lock is granted to no one", () => {
    const sql = code(read(SQL_PATH));
    // In file order: create_encrypted_run's with its body (§4, as 0123 writes it), then the prepare's (§5).
    expect(sql.split("\n").filter((line) => /^\s*GRANT /u.test(line))).toEqual([
      `GRANT EXECUTE ON FUNCTION ${CREATE} TO debateai_content_provision;`,
      `GRANT EXECUTE ON FUNCTION ${PREPARE} TO debateai_content_provision;`
    ]);
    expect(sql.match(/\bGRANT\b/gu)).toHaveLength(2);
    const revokeList = "\n  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,\n"
      + "    debateai_replay,debateai_publication_cleanup,debateai_content_provision;";
    for (const signature of FUNCTIONS) expect(sql, signature).toContain(`REVOKE ALL ON FUNCTION ${signature}${revokeList}`);
    expect(sql.indexOf(`REVOKE ALL ON FUNCTION ${PREPARE}`)).toBeLessThan(sql.indexOf(`GRANT EXECUTE ON FUNCTION ${PREPARE}`));
    // The closing block checks the contract instead of assuming it.
    const contract = sql.slice(sql.indexOf("DO $carry_on_digs_contract$"), sql.indexOf("$carry_on_digs_contract$;"));
    expect(contract).toContain("CARRY_ON_0162_CONTRACT");
    for (const signature of FUNCTIONS) expect(contract, signature).toContain(`'${signature}'`);
  });

  it("C-R is documented and listed", () => {
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0162, below) the fifty-second", "## The carry-on digs without a live sign-in (0162)", "`loadForward0162`",
      "MIGRATION_FORWARD0162_", "`-- n1: drained`"]) expect(readme, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md"))
      .toContain("`migrations/0162_carry_on_session_free_digs.sql` (after `0161_saved_questions.sql`, `n1: drained`)");
  });

  it("C-D startRun takes the carry-on's prepare for a server principal's carryOn, and the content-provision login may run it", () => {
    const db = read("packages/db/src/index.ts");
    expect(db).toContain(`"${PREPARE}"`);
    expect(db).toContain("readonly carryOn?: Readonly<{ parentRunId: string; pathId: string }>");
    expect(db).toContain("FROM core.prepare_carry_on_run_key_provision($1,$2,$3)");
    expect(db).toMatch(/const CARRY_ON_DIG_REFUSALS: ReadonlySet<string> = new Set\(\[\n\s+"CARRY_ON_DIG_INVALID", "CARRY_ON_DIG_OWNER_GONE", "CARRY_ON_DIG_TAKEN"\n\]\);/u);
  });
});
