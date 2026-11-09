import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUN_PATH_SET_REFUSALS } from "@debateai/battery";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedFunctionNames, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0165 (V4 start step, plan 2026-11-03 Task 57c; the owner's 5 Nov answer Q20 A and its second-round follow-up): a failed question gives back
 * its path-list charge. Each charge before Start names its try; Start gives the try's charges to the debate once; the person's readers leave
 * out a charge whose debate failed; a failed debate's read says whether any quota was used. Drained, because it redefines 0158's readers.
 */
const NAME = "0165_pre_start_release.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/pre-start-release-forward0165.json";
const PREVIOUS = "0164_main_answer_path_added.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/main-answer-path-added-forward0164.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
/** Every regular-expression metacharacter escaped, the backslash included (CodeQL js/incomplete-sanitization). */
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.pre_start_try";
const SPENT = "identity.read_pre_start_spent(uuid,timestamptz,timestamptz)";
const READERS = ["billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)", "staff.read_team_internal_spent(timestamptz,timestamptz)"];
const AMENDS = [
  { step: "0140_internal_spend_kinds.sql", functions: READERS, field: "function_definition" },
  { step: "0144_ask_clarify_charge.sql", functions: READERS, field: "function_definition" },
  { step: "0158_pre_start_charge.sql", functions: [SPENT, ...READERS], field: "function_definition" }
];
/** What makes a charge given back: given to a debate with a FAILED work item. */
const GIVEN_BACK = "NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=";
/** Task 57e: ... that keeps no paths chosen from the list (Ask again re-uses those, so their charges are kept). */
const NOT_KEPT = "AND NOT core.run_pre_start_kept(t.run_id)";
const KEPT = "core.run_pre_start_kept(uuid)";
const RETRY_TABLE = "core.work_item_retry";
const RETRY = "core.record_work_item_retry(uuid,uuid,timestamptz)";
/** Task 57f: a failed debate continues where it stopped, and a call bought again is the site's. */
const REOPEN_TABLE = "core.work_item_reopen";
const CALL_WAIVER_TABLE = "ledger.model_spend_call_waiver";
const READ_CONTINUE = "core.read_run_continue(uuid,uuid)";
const CONTINUE = "core.continue_failed_run(uuid,uuid,text,bigint)";
const RECORD_CALL_WAIVER = "ledger.record_call_waiver(uuid,uuid[])";
const CALL_WAIVED = "ledger.call_waived_attempts(uuid)";
/** What leaves a call the site paid for out of the person's spend, in every reader that counts it. */
const NOT_CALL_WAIVED = "NOT EXISTS (SELECT 1 FROM ledger.model_spend_call_waiver cw WHERE cw.attempt_id = s.attempt_id)";
/**
 * Task 57h: the codes of a path debate's claim-time refusal that its stored set makes final, as a definer lists them after `column IN (`:
 * the same set as the API's rule (packages/battery RUN_PATH_SET_REFUSALS), so the database and the read never disagree.
 */
const pathSetRefusalsIn = (body: string, column: string): readonly string[] | null => {
  const listed = body.match(new RegExp(`${escapeRegExp(column)} IN \\(([^)]*)\\)`, "u"))?.[1];
  return listed === undefined ? null : listed.split(",").map((value) => value.trim().replace(/^'|'$/gu, "")).sort();
};
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("(")).toLowerCase();
const bodyOf = (sql: string, head: string): string => {
  const at = sql.indexOf(head);
  expect(at, head).toBeGreaterThanOrEqual(0);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};

describe("0165: a failed question gives back its path-list charge", () => {
  it("C-T is a step of the chain, after 0164, with its own loader and its amendments", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0165 } from './migration-forward0165.js';");
    // Task 56g (0166): no longer the chain's head; found by its name below.
    expect(chain).toContain("loadForward0164,loadForward0165,");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual(AMENDS);
    const loader = read("packages/db/src/migration-forward0165.ts");
    for (const name of [TABLE, "identity.record_pre_start_try_charge(", "identity.link_pre_start_try(", "identity.read_run_quota_used(", SPENT, ...READERS,
      RETRY_TABLE, KEPT, RETRY, REOPEN_TABLE, CALL_WAIVER_TABLE, READ_CONTINUE, CONTINUE, RECORD_CALL_WAIVER, CALL_WAIVED]) {
      expect(loader, name).toContain(name);
    }
  });

  it("C-M is bound to 0164's manifest as Task 56e left it and to the verifier in force, and declares its amendments", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "pre-start-release-forward0165-v1",
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
    for (const name of redefined) expect(lastDefiner.get(name), name).toBe("0158_pre_start_charge.sql");
  });

  it("C-A passes the replay audit; its one table is new", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    expect([...definedRelationNames(sql)]).toEqual([TABLE, CALL_WAIVER_TABLE, RETRY_TABLE, REOPEN_TABLE]);
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME);
    for (const table of [TABLE, CALL_WAIVER_TABLE, RETRY_TABLE, REOPEN_TABLE]) expect(earlier.some((name) => definedRelationNames(read(`migrations/${name}`)).includes(table)), table).toBe(false);
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
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain("packages/db/src/migration-forward0165.ts");
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0165, below) the fifty-fifth", "## A failed question gives back its path-list charge (0165)", "`loadForward0165`",
      "MIGRATION_FORWARD0165_", "`core.run_pre_start_kept`", "`core.work_item_retry`", "`core.continue_failed_run`", "`ledger.model_spend_call_waiver`"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0165_pre_start_release.sql` (after `0164_main_answer_path_added.sql`, `n1: drained`)");
  });

  // Task 57d (the owner's 6 Nov answer, card "Privacy": "Random id"; edited in place, never pushed or applied): the try is a random id the API
  // mints once per reading and carries inside the signed check; nothing made from the question's words is stored. The step and its README say so.
  it("C-P names a try that is a random id per reading, never anything made from the question's words", () => {
    const header = read(SQL_PATH).split("\n").filter((line) => line.startsWith("--")).join(" ").replace(/\s*--\s*/gu, " ");
    expect(header).toContain("a random id the API mints once per reading before Start, carried inside the signed check");
    expect(header).toContain("Nothing made from the question's words is stored");
    expect(header).not.toMatch(/keyed hash|HMAC|derives/u);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    const section = readme.slice(readme.indexOf("## A failed question gives back its path-list charge (0165)"));
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
    // Task 57f: the paths are re-used by continuing the debate; one never queued as a debate (RUN_SETUP_FAILED) can never continue: given back.
    expect(kept).toContain("item.state = 'FAILED'");
    expect(kept).toContain("item.terminal_reason LIKE 'RUN_SETUP_FAILED:%'");
    // Task 57h: nor can a path debate whose stored set makes its claim-time refusal final (every copy meets it again): given back too.
    expect(pathSetRefusalsIn(kept, "item.terminal_reason")).toEqual([...RUN_PATH_SET_REFUSALS].sort());
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${KEPT} FROM PUBLIC,`);
    expect([...sql.matchAll(/^GRANT EXECUTE ON FUNCTION core\.run_pre_start_kept\(uuid\) TO ([a-z_]+);$/gmu)].map((match) => match[1]))
      .toEqual(["debateai_staff_security_owner"]);
    // 0159's table and 0123's waiver are read by their owner's definer, never granted: their digests of their ACLs stay as they were.
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
  // Task 57f (the owner's 7 Nov answers: "continue where it 'broke', and not charge the customer again ... Only if we can't re-use, then we
  // need to pay for this ourselves"; edited in place, never pushed or applied): the person's own failed debate is re-opened by one owner-checked
  // definer for the API's role alone, each re-open recorded (ids and times only); and a call an earlier copy paid for and could not hand back
  // is the site's once it is bought again (the waiver, call by call), left out by every reader of the person's spend.
  it("C-C continue: one owner-checked re-open of the newest FAILED work item, recorded once per press that re-opens; read and re-open for the API's role alone", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${REOPEN_TABLE} (`);
    const columns = sql.slice(at, sql.indexOf("\n);", at));
    expect([...columns.matchAll(/^ {2}([a-z_]+) (?:uuid|text|bigint|integer|timestamptz|jsonb|bytea)/gmu)].map((match) => match[1]))
      .toEqual(["work_item_id", "reopen_no", "run_id", "reopened_at"]);
    expect(columns).not.toMatch(/question|answer|ciphertext|content|reason|words|owner/u);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${REOPEN_TABLE}');`);
    expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${REOPEN_TABLE}`);
    const reopen = bodyOf(sql, "CREATE OR REPLACE FUNCTION core.continue_failed_run(");
    expect(reopen).toContain("SECURITY DEFINER");
    expect(reopen).toContain("SET search_path=pg_catalog");
    // The same lock as 0134's resume and 0143's hand-over: one press at a time per debate, and never beside the month's Continue.
    expect(reopen).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0))");
    expect(reopen).toContain("core.run_ownership_event");
    expect(reopen).toContain("RETURN 'NOT_OWNED'");
    expect(reopen).toContain("RETURN 'CONTINUING'");
    expect(reopen).toContain("RETURN 'NOT_CONTINUABLE'");
    // Claimable at once, as a copy that let go of it leaves it: the wake hands it on, and the runner's re-send of lapsed claims does if the wake fails.
    expect(reopen).toContain("SET state = 'CLAIMED', terminal_reason = NULL, claimed_by = 'continue', claim_deadline = pg_catalog.clock_timestamp()");
    expect(reopen).toContain(`INSERT INTO ${REOPEN_TABLE}`);
    // Never a debate set aside by an upload (0123's waiver: it used none of the person's quota), one never queued, a settled one, an erased one.
    for (const needle of ["ledger.model_spend_waiver", "'RUN_SET_ASIDE:%'", "'RUN_SETUP_FAILED:%'", "settled_attempt_id IS NOT NULL",
      "core.run_private_content_is_live(p_run_id)", "identity.run_handover", "register.settings_version_passed"]) expect(reopen, needle).toContain(needle);
    // Task 57h: nor a path debate whose stored set makes its claim-time refusal final, as the API's rule (its list charge was given back).
    expect(pathSetRefusalsIn(reopen, "v_item.terminal_reason")).toEqual([...RUN_PATH_SET_REFUSALS].sort());
    const facts = bodyOf(sql, "CREATE OR REPLACE FUNCTION core.read_run_continue(");
    expect(facts).toContain("core.run_ownership_event");
    expect(facts).toContain(REOPEN_TABLE);
    for (const signature of [READ_CONTINUE, CONTINUE]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,`);
      const name = signature.slice(0, signature.indexOf("(")).replace(".", "\\.");
      expect([...sql.matchAll(new RegExp(`^GRANT EXECUTE ON FUNCTION ${name}\\([^)]*\\) TO ([a-z_]+);$`, "gmu"))].map((match) => match[1]), signature)
        .toEqual(["debateai_billing_runtime"]);
    }
    expect(sql).toMatch(/^REVOKE ALL ON core\.work_item_reopen FROM PUBLIC,/mu);
    expect([...sql.matchAll(/^GRANT [^\n]* ON core\.work_item_reopen TO ([a-z_]+);$/gmu)]).toEqual([]);
    const header = read(SQL_PATH).split("\n").filter((line) => line.startsWith("--")).join(" ");
    expect(header).toContain("Task 57f");
  });

  it("C-W the waiver, call by call: ids and times only, insert-only, written for the runner's role; every reader of the person's spend leaves it out", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${CALL_WAIVER_TABLE} (`);
    const columns = sql.slice(at, sql.indexOf("\n);", at));
    expect([...columns.matchAll(/^ {2}([a-z_]+) (?:uuid|text|bigint|integer|timestamptz|jsonb|bytea)/gmu)].map((match) => match[1]))
      .toEqual(["attempt_id", "run_id", "recorded_at"]);
    expect(columns).toContain("attempt_id uuid PRIMARY KEY");
    expect(columns).not.toMatch(/question|answer|ciphertext|content|words|owner/u);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${CALL_WAIVER_TABLE}');`);
    expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${CALL_WAIVER_TABLE}`);
    // It waives only a charge recorded on that same debate, once.
    const writer = bodyOf(sql, "CREATE OR REPLACE FUNCTION ledger.record_call_waiver(");
    expect(writer).toContain("FROM ledger.model_spend AS spend");
    expect(writer).toContain("spend.run_id = p_run_id");
    expect(writer).toContain("ON CONFLICT DO NOTHING");
    for (const head of ["CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(", "CREATE OR REPLACE FUNCTION staff.read_team_internal_spent(",
      "CREATE OR REPLACE FUNCTION identity.read_run_quota_used("]) {
      expect(bodyOf(sql, head), head).toContain(NOT_CALL_WAIVED);
    }
    expect(bodyOf(sql, "CREATE OR REPLACE FUNCTION ledger.call_waived_attempts(")).toContain("billing.run_charge_scope");
    // The subscription reader (packages/budget) reads it through the one definer, never the table.
    expect(read("packages/budget/src/model-spend.ts")).toContain("unnest(ledger.call_waived_attempts($1::uuid))");
    expect(sql).toMatch(/^REVOKE ALL ON ledger\.model_spend_call_waiver FROM PUBLIC,/mu);
    expect([...sql.matchAll(/^GRANT ([^\n]*) ON ledger\.model_spend_call_waiver TO ([a-z_]+);$/gmu)].map((match) => `${match[2]}: ${match[1]}`))
      .toEqual(["debateai_staff_security_owner: SELECT"]);
    expect([...sql.matchAll(/^GRANT EXECUTE ON FUNCTION (ledger\.[a-z_]+)\([^)]*\) TO ([a-z_]+);$/gmu)].map((match) => `${match[1]} ${match[2]}`))
      .toEqual(["ledger.record_call_waiver debateai_runtime", "ledger.call_waived_attempts debateai_runtime"]);
  });
});
