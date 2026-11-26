import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

/**
 * 0191, the Owner adds a buyer with the security key alone, read as text: a drained step that drops 0186's CHECK that only
 * a removal may go without an alert, and restates 0186's door with its body unchanged but for the one refusal of an
 * addition without an alert. Nothing else of 0186's door may move with it.
 */
const SQL_PATH = "migrations/0191_preview_buyer_add_key_only.sql";
const sqlOf = (path: string) => readFile(path, "utf8");
/** The statements outside comments, one per line as written. */
const statements = (sql: string) => sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
/** The door's whole CREATE OR REPLACE, from its first line to its END. */
const door = (sql: string): string => {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION staff.preview_buyer_act(");
  return sql.slice(start, sql.indexOf("END $$;", start) + "END $$;".length);
};
const REFUSAL = " IF v_intent='PREVIEW_BUYER_ADD' AND p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;";
const REFUSAL_COMMENT = " -- An addition widens who may pay, so it waits for the team tools, as every other Team page change does.";

describe("0191 restates 0186's door without the refusal of a locked addition", () => {
  it("declares drained and keeps-verifier, and adds nothing of billing", async () => {
    const sql = await sqlOf(SQL_PATH);
    expect(parseN1Header("0191_preview_buyer_add_key_only.sql", sql)).toMatchObject({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false });
    expect(statements(sql)).not.toMatch(/\bbilling\./u);
  });
  it("the restated door is 0186's, line for line, but for the one refusal and its comment", async () => {
    const before = door(await sqlOf("migrations/0186_preview_buyers.sql")).split("\n"), after = door(await sqlOf(SQL_PATH)).split("\n");
    expect(before).toContain(REFUSAL);
    expect(before).toContain(REFUSAL_COMMENT);
    expect(after).toEqual(before.filter((line) => line !== REFUSAL && line !== REFUSAL_COMMENT));
    expect(after.join("\n")).not.toContain("STAFF_ALERT_UNAVAILABLE");
    // The rest of the rule stays: the Owner's TEAM_GRANT, the bound proof, the cap, the revision and the audit row with an alert.
    for (const needle of ["staff.authorize_action(p_context,'TEAM_GRANT')", "STAFF_PROOF_INVALID", "PREVIEW_BUYERS_STALE", "PREVIEW_BUYERS_FULL",
      "PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_GRANT','TEAM_GRANT',v_target,v_operation);", "p_alert IS NOT NULL)",
      "IF p_alert IS NOT NULL THEN", "PERFORM staff.record_mutation("]) expect(after.join("\n"), needle).toContain(needle);
  });
  it("drops only 0186's CHECK that tied alerted to a removal; creates, grants, revokes and drops nothing else", async () => {
    const body = statements(await sqlOf(SQL_PATH));
    expect(body.match(/^(?:CREATE|ALTER|REVOKE|GRANT|DROP|INSERT|UPDATE|DELETE|DO|COMMENT|SET)\b.*$/gmu)).toEqual([
      "ALTER TABLE staff.preview_buyer_event DROP CONSTRAINT IF EXISTS preview_buyer_event_check;",
      "CREATE OR REPLACE FUNCTION staff.preview_buyer_act(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb"
    ]);
    // The CHECK it drops is 0186's one table CHECK reading two columns, which Postgres names after the table alone.
    const created = statements(await sqlOf("migrations/0186_preview_buyers.sql"));
    expect(created).toContain(" CHECK(kind='REMOVED' OR alerted)\n);");
    expect(created.match(/^ CHECK\(/gmu)).toHaveLength(1);
  });
  it("the kit's README says the release that carries it is a drained upload", async () => {
    const kit = (await readFile("deploy/preview-auth-dev/v1/README.md", "utf8")).replace(/\s+/gu, " ");
    const note = kit.slice(kit.indexOf("**The Owner adds a buyer with the security key alone (0191).**"));
    expect(note.startsWith("**The Owner adds a buyer with the security key alone (0191).** `apply-and-plan` applies it after 0190, in one transaction (`n1: drained`)")).toBe(true);
    for (const needle of ["drained upload", "the owner's yes before its first start", "ACCESS EXCLUSIVE on `staff.preview_buyer_event`", "`MIGRATION_LOCK_TIMEOUT 0191_…`",
      "`MAIN-SITE.md` 6b.3"]) expect(note, needle).toContain(needle);
  });
});
