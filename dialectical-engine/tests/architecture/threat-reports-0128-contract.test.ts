import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { auditMigrationReplaySafety } from "../../tools/orphan-audit/src/index.js";

const read0125 = async (): Promise<string> =>
  readFile(new URL("../../migrations/0128_threat_reports.sql", import.meta.url), "utf8")
    .catch(() => "");

describe("0128 threat reports contract", () => {
  it("keeps the synthesis source and adds a runless QUESTION_CHECK writer", async () => {
    // Property: 0128 must preserve the prior spend sources while routing QUESTION_CHECK through its sole writer.
    const sql = await read0125();
    const prior = await readFile(new URL("../../migrations/0126_synthesis_check.sql", import.meta.url), "utf8");
    const sources = (value: string) => [...value.matchAll(/ADD CONSTRAINT model_spend_spend_source_check CHECK \(spend_source IN \(([^)]+)\)\)/gu)][0]?.[1]
      ?.match(/'[^']+'/gu);
    expect(sources(sql)).toEqual([...(sources(prior) ?? []), "'QUESTION_CHECK'"]);
    expect(sql).toContain("model_spend_question_check_is_runless");
    expect(sql).toContain("ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)");
    expect(sql).toContain("question_check_spend_writer_only");
    expect(sql).toContain("p_charge_micros IS NULL OR p_input_tokens IS NULL OR p_output_tokens IS NULL");
  });

  it("adds THREAT_REPORT to the delegated staff capability without losing PUBLICATION_REVIEW", async () => {
    // Property: a holder can use the new capability, while the prior review capability remains valid.
    const sql = await read0125();
    expect(sql).toContain("'PUBLICATION_REVIEW','THREAT_REPORT'");
    expect(sql).toContain("'THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED'");
    expect(sql).toContain("cardinality(p_caps) BETWEEN 1 AND 5");
    expect(sql).toContain("-- BEGIN staff.commit_owner_command (owner set of 0128;");
    expect(sql).toContain("WITH owner AS (");
    expect(sql).toContain("IN ('PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE') THEN staff.authorize_action(p_context,'PUBLICATION_REVIEW')");
    expect(sql).toContain("IN ('THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED') THEN staff.authorize_action(p_context,'THREAT_REPORT')");
    const previous = await readFile(new URL("../../migrations/0127_publication_review.sql", import.meta.url), "utf8");
    const ownerBlock = (value: string) => value.match(/-- BEGIN staff\.commit_owner_command[^\n]*\n([\s\S]*?)-- END staff\.commit_owner_command/u)?.[1];
    expect(ownerBlock(sql)?.replace("'PUBLICATION_REVIEW','THREAT_REPORT'", "'PUBLICATION_REVIEW'"))
      .toBe(ownerBlock(previous));
  });

  it("creates only the three private threat-report tables", async () => {
    // Property: the kept question and its operational companions have a fixed private table set.
    const sql = await read0125();
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([
      "staff.threat_report", "staff.threat_report_event", "staff.threat_report_alert"
    ]);
    for (const table of ["staff.threat_report", "staff.threat_report_event", "staff.threat_report_alert"]) {
      expect(sql).toContain(`ALTER TABLE ${table} OWNER TO debateai_staff_security_owner`);
      expect(sql).toContain(`REVOKE ALL ON ${table} FROM PUBLIC, debateai_runtime, debateai_staff_recovery`);
    }
  });

  it("creates the sixteen named functions and keeps the sealed export reader untouched", async () => {
    // Property: 0128 adds a lease reader beside 0115's sealed function and exposes only named report operations.
    const sql = await read0125();
    for (const name of [
      "ledger.record_question_check_spend", "ledger.refuse_question_check_spend_outside_writer",
      "staff.keep_threat_report", "staff.keep_threat_report_with_email", "staff.list_threat_reports", "staff.count_unread_threat_reports",
      "staff.peek_threat_report_account", "staff.read_threat_report", "staff.threat_report_recipient_user",
      "staff.decide_threat_report", "staff.erase_due_threat_reports",
      "staff.hold_threat_report_email", "staff.claim_threat_report_alerts", "staff.complete_threat_report_alert",
      "identity.read_data_export_threat_reports", "identity.data_export_lease_user"
    ]) expect(sql).toContain(`CREATE OR REPLACE FUNCTION ${name}(`);
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION identity.read_data_export_snapshot(");
    expect(sql).toContain("SELECT core.install_truncate_guard('staff.threat_report');");
    expect(sql).toContain("SELECT core.install_truncate_guard('staff.threat_report_alert');");
  });

  it("uses the repository's replay-safe migration forms", async () => {
    // Property: replay and orphan checks accept the 0128 DDL after earlier steps are sealed.
    const plan = await loadMigrationPlan();
    const migrateSource = await readFile(new URL("../../packages/db/src/index.ts", import.meta.url), "utf8");
    const transactionSource = await readFile(new URL("../../packages/db/src/migration-transaction.ts", import.meta.url), "utf8");
    expect(auditMigrationReplaySafety("migrations/0128_threat_reports.sql", await read0125(), { plan, migrateSource, transactionSource })).toEqual([]);
  });

  it("makes 0128 the forward step after 0127 (S05's 0129 follows it) and pins only objects it creates", async () => {
    // Property: the new loader records its own tables, functions, writer trigger and CHECK after 0127.
    const loader = await readFile(new URL("../../packages/db/src/migration-forward0128.ts", import.meta.url), "utf8").catch(() => "");
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.slice(-5).map((step) => step.name))
      .toEqual(["0127_publication_review.sql", "0128_threat_reports.sql", "0129_support_answer_scope.sql",
        "0130_row_level_security.sql", "0131_v4_account_memory.sql"]);
    for (const name of ["staff.threat_report", "staff.threat_report_event", "staff.threat_report_alert",
      "question_check_spend_writer_only", "model_spend_question_check_is_runless"]) expect(loader).toContain(name);
    expect(loader).not.toContain("staff.commit_owner_command");
    expect(loader).not.toContain("identity.read_data_export_snapshot");
  });
});
