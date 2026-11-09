import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedFunctionNames, definedRelationNames } from "../../tools/orphan-audit/src/index.js";
import { stopIsSetAside } from "../../apps/api/src/run-continue.js";

/**
 * 0168 (V4 start step, plan 2026-11-03 Task 57j; the owner's answer of 7 Nov afternoon, "Continue, they pay the rest"): a debate an update set
 * aside continues where it stopped, where Continue moves it to the release that is current, and the person pays only for what runs after
 * Continue. One insert-only table of such Continues, one bound (until when a waived debate's charges are the site's), 0165's four person
 * readers reading it, 0165's re-open continuing a set-aside only with a move, and 0165's facts counting the re-opens that failed again.
 * Drained: it redefines 0165's six functions in place and declares those amendments.
 */
const NAME = "0168_set_aside_continue.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/set-aside-continue-forward0168.json";
const LOADER_PATH = "packages/db/src/migration-forward0168.ts";
const PREVIOUS = "0167_public_report_own_carrier.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/public-report-own-carrier-forward0167.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const BOUND = "ledger.spend_waived_until(uuid)";
const SPENT = "identity.read_pre_start_spent(uuid,timestamptz,timestamptz)";
const READERS = ["billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)", "staff.read_team_internal_spent(timestamptz,timestamptz)"];
const QUOTA = "identity.read_run_quota_used(uuid,uuid)";
const REOPEN = "core.continue_failed_run(uuid,uuid,text,bigint)";
const FACTS = "core.read_run_continue(uuid,uuid)";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const bodyOf = (sql: string, head: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${head}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at))).replace(/\s+/gu, " ");
};

describe("0168: a debate an update set aside continues where it stopped; the person pays only for what runs after Continue", () => {
  it("C-T is a step of the chain, right after 0167, with its own loader and its four amendments", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0168 } from './migration-forward0168.js';");
    // Task 57o-fix (0169): no longer the chain's head; 0169 follows it.
    expect(chain).toContain("loadForward0166,loadForward0167,loadForward0168,");
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-4)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.previousManifestSha256).toBe(plan.forwardChain.at(-5)!.manifestSha256);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.replayVerifierSql).toBeUndefined();
    expect(step.amendsPostconditionsOf).toEqual([
      { step: "0140_internal_spend_kinds.sql", functions: READERS, field: "function_definition" },
      { step: "0144_ask_clarify_charge.sql", functions: READERS, field: "function_definition" },
      { step: "0158_pre_start_charge.sql", functions: [SPENT, ...READERS], field: "function_definition" },
      { step: "0165_pre_start_release.sql", functions: [SPENT, ...READERS, QUOTA, REOPEN, FACTS], field: "function_definition" }
    ]);
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "set-aside-continue-forward0168-v1";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain('const TABLES = ["ledger.set_aside_continue"] as const;');
    expect(loader).toContain("MIGRATION_FORWARD0168_");
  });

  it("C-M is bound to 0167's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toMatchObject({
      version: "set-aside-continue-forward0168-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
  });

  it("C-H says truthfully that it is drained and keeps the verifier; replay-safe; one new table and one new function, the rest redefined", async () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    expect([...definedRelationNames(sql)]).toEqual(["ledger.set_aside_continue"]);
    expect([...definedFunctionNames(sql)].sort()).toEqual(["billing.read_internal_grant_spent", "core.continue_failed_run", "core.read_run_continue",
      "identity.read_pre_start_spent", "identity.read_run_quota_used", "ledger.spend_waived_until", "staff.read_team_internal_spent"]);
    // The table is insert-only and truncate-guarded; no earlier object is altered or dropped.
    expect(code(sql)).toMatch(/CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger\.set_aside_continue\s+FOR EACH STATEMENT EXECUTE FUNCTION core\.reject_mutation\(\);/u);
    expect(code(sql)).toContain("SELECT core.install_truncate_guard('ledger.set_aside_continue');");
    expect(code(sql)).not.toMatch(/^\s*(ALTER|DROP) (TABLE|FUNCTION)/mu);
  });

  it("C-B the bound: no waiver, nothing; never continued from a set-aside or set aside now, everything; else the newest such Continue", () => {
    const body = bodyOf(code(read(SQL_PATH)), "ledger.spend_waived_until");
    expect(body).toContain("RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    const order = ["THEN '-infinity'::timestamptz", "FROM ledger.set_aside_continue AS continued WHERE continued.run_id = p_run_id) THEN 'infinity'::timestamptz",
      "newest.state = 'FAILED'", "ELSE (SELECT max(continued.continued_at)"].map((needle) => body.indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    // The set-aside's two forms, as the API's rule reads them.
    expect(body).toContain("newest.terminal_reason LIKE 'RUN_SET_ASIDE:%' OR newest.terminal_reason LIKE 'RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:%'");
    expect(stopIsSetAside("RUN_SET_ASIDE:BACKSTOP") && stopIsSetAside("RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:BACKSTOP")).toBe(true);
  });

  it("C-R every person reader bounds 0123's waiver, its charges before Start included; the subscription reader too; no site-day reader is touched", () => {
    const sql = code(read(SQL_PATH));
    const bounded = "NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id AND s.recorded_at < ledger.spend_waived_until(s.run_id))";
    for (const head of ["billing.read_internal_grant_spent", "staff.read_team_internal_spent", "identity.read_run_quota_used"]) {
      const body = bodyOf(sql, head);
      expect(body, head).toContain(bounded);
      expect(body, head).not.toContain("WHERE w.run_id = s.run_id)");
      expect(body, head).toContain("ledger.model_spend_call_waiver cw WHERE cw.attempt_id = s.attempt_id");
    }
    expect(bodyOf(sql, "identity.read_pre_start_spent")).toContain(
      "NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN ledger.model_spend_waiver w ON w.run_id=t.run_id WHERE t.charge_id=c.charge_id AND c.recorded_at < ledger.spend_waived_until(t.run_id))");
    for (const head of ["billing.read_internal_grant_spent", "staff.read_team_internal_spent"]) {
      expect(bodyOf(sql, head), head).toContain("WHERE t.charge_id=b.charge_id AND b.recorded_at < ledger.spend_waived_until(t.run_id)");
    }
    expect(bodyOf(sql, "identity.read_run_quota_used")).toContain("AND c.recorded_at < ledger.spend_waived_until(t.run_id)");
    expect(sql).not.toMatch(/readDaySpentMicros|read_site_day|daily_cost/u);
    const store = read("packages/budget/src/model-spend.ts");
    expect(store).toContain("AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver AS waiver WHERE waiver.run_id = spend.run_id\n"
      + "           AND spend.recorded_at < ledger.spend_waived_until(spend.run_id))");
  });

  it("C-O the re-open: a set-aside only with a move to another release, its Continue recorded; the waiver alone no longer refuses; the facts count failed re-opens", () => {
    const sql = code(read(SQL_PATH));
    const reopen = bodyOf(sql, "core.continue_failed_run");
    expect(reopen).toContain("v_set_aside := COALESCE(v_item.terminal_reason LIKE 'RUN_SET_ASIDE:%' OR v_item.terminal_reason LIKE 'RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:%', false);");
    expect(reopen).toContain("OR (v_set_aside AND (p_to_release_key IS NULL OR v_release IS NOT DISTINCT FROM p_to_release_key))");
    expect(reopen).not.toContain("ledger.model_spend_waiver");
    expect(reopen).toContain("IF v_set_aside THEN INSERT INTO ledger.set_aside_continue (work_item_id, reopen_no, run_id) VALUES (v_item.work_item_id, v_reopen, p_run_id); END IF;");
    for (const kept of ["v_item.terminal_reason LIKE 'RUN_SETUP_FAILED:%'", "IN ('PATHS_SET_MISSING', 'START_MENU_INVALID', 'PATHS_OVER_RECEIPT')",
      "v_item.settled_attempt_id IS NOT NULL", "core.run_private_content_is_live(p_run_id)", "event.kind = 'PAUSED'", "RETURN 'NOT_CURRENT'",
      "RETURN 'VERSION_NOT_PASSED'", "pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0))"]) {
      expect(reopen, kept).toContain(kept);
    }
    const facts = bodyOf(sql, "core.read_run_continue");
    expect(facts).toContain("'failed_continues', CASE WHEN v_reopens = 0 THEN 0 WHEN v_item.state = 'FAILED' THEN v_reopens ELSE v_reopens - 1 END");
    expect(facts).toContain("'reopened', v_reopens > 0");
    // Task 57m-fix (the owner's answer of 8 Nov, "Update doesn't count"): a re-open that ended in an update's set-aside is never counted, an
    // earlier one (the next re-open continued a set-aside: §1's row, reopen_no 2 or more) nor the newest (set aside now).
    expect(facts).toContain("SELECT count(*)::integer INTO v_set_aside_ends FROM ledger.set_aside_continue AS continued "
      + "WHERE continued.work_item_id = v_item.work_item_id AND continued.reopen_no >= 2;");
    expect(facts).toContain("- v_set_aside_ends - CASE WHEN v_reopens > 0 AND v_item.state = 'FAILED' AND v_set_aside_now THEN 1 ELSE 0 END");
    expect(facts).toContain("v_set_aside_now := COALESCE(v_item.terminal_reason LIKE 'RUN_SET_ASIDE:%' OR v_item.terminal_reason LIKE 'RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:%', false);");
  });

  it("C-G the table read by no role; the bound for the readers' owner and the runtime role alone; documented and listed", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/^GRANT (.*)$/gmu)].map((match) => match[1])).toEqual([
      `EXECUTE ON FUNCTION ${BOUND} TO debateai_staff_security_owner;`, `EXECUTE ON FUNCTION ${BOUND} TO debateai_runtime;`]);
    expect(sql).toContain("REVOKE ALL ON ledger.set_aside_continue FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;");
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${BOUND} FROM PUBLIC,`);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0168, below) the fifty-eighth", "## A debate an update set aside continues where it stopped (0168)", "`loadForward0168`",
      "MIGRATION_FORWARD0168_", "`-- n1: drained`", "`ledger.spend_waived_until(uuid)`"]) expect(readme, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0168_set_aside_continue.sql` (after `0167_public_report_own_carrier.sql`, `n1: drained`)");
    const principals = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(principals.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)).toEqual([
      { roleName: "debateai_staff_security_owner", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${BOUND}`] },
      { roleName: "debateai_runtime", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${BOUND}`] }]);
  });
});
