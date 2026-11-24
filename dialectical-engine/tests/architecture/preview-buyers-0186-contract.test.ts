import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PREVIEW_TEAM_MAX_MEMBERS } from "@debateai/providers";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

/**
 * 0186, the preview's approved buyers, read as text: what the step may do beside the release before (expand, its one
 * reviewed pair, no earlier name replaced), what its event list is, and that its numbers and names agree with the API's.
 */
const SQL_PATH = "migrations/0186_preview_buyers.sql";
const sqlOf = (path: string) => readFile(path, "utf8");
/** The statements outside comments, one per line as written. */
const statements = (sql: string) => sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
const eventList = (sql: string): string[] => {
  const start = sql.lastIndexOf("ADD CONSTRAINT audit_event_funded_event_type_check");
  const body = sql.slice(start, sql.indexOf(";", start));
  return [...body.matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1]!);
};

describe("0186 beside the release before", () => {
  it("declares expand and keeps-verifier, and adds nothing of billing", async () => {
    const sql = await sqlOf(SQL_PATH);
    expect(parseN1Header("0186_preview_buyers.sql", sql)).toMatchObject({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false });
    expect(statements(sql)).not.toMatch(/\bbilling\./u);
  });
  it("replaces no function or view an earlier step defines, and creates no ceremony function", async () => {
    const sql = await sqlOf(SQL_PATH), defined = [...statements(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_0-9]+)\(/gu)].map((match) => match[1]!);
    expect(defined.sort()).toEqual(["staff.preview_buyer_act", "staff.preview_buyer_body", "staff.preview_buyer_listed", "staff.read_audit_page_v2", "staff.read_preview_buyers"]);
    const earlier = (await readdir("migrations")).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < "0186_preview_buyers.sql");
    for (const name of earlier) {
      const text = statements(await sqlOf(`migrations/${name}`));
      for (const fn of defined) expect(text.includes(`FUNCTION ${fn}(`), `${fn} in ${name}`).toBe(false);
    }
    expect(sql).not.toMatch(/owned_action_allowed|begin_owned_webauthn|owned_challenge_current|consume_ceremony|complete_owned_webauthn/u);
  });
  it("revokes, drops and alters nothing earlier but the one reviewed pair, last in the step", async () => {
    const sql = await sqlOf(SQL_PATH), body = statements(sql);
    for (const line of body.split("\n").filter((text) => /^REVOKE\b/u.test(text) || /^ FROM PUBLIC/u.test(text))) {
      expect(line, line).not.toMatch(/staff\.(?!preview_buyer|read_preview_buyers|read_audit_page_v2)[a-z_]+\(/u);
    }
    expect(body.match(/^ALTER TABLE .*$/gmu)).toEqual([
      "ALTER TABLE staff.preview_buyer_event OWNER TO debateai_staff_security_owner;",
      "ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_funded_event_type_check;",
      "ALTER TABLE staff.audit_event ADD CONSTRAINT audit_event_funded_event_type_check"
    ]);
    const lines = sql.trimEnd().split("\n");
    const reviewed = lines.findIndex((line) => line.startsWith("-- n1: reviewed "));
    expect(lines.filter((line) => line.startsWith("-- n1: reviewed "))).toEqual([
      "-- n1: reviewed the event list only widens (0150's, plus the two this step writes); every event the release before writes stays allowed"]);
    expect(lines[reviewed + 1]).toBe("ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_funded_event_type_check;");
    expect(lines.at(-1)).toMatch(/\) NOT VALID;$/u);
    expect(body).not.toMatch(/\bDROP (?:TABLE|FUNCTION|TRIGGER|VIEW|INDEX)\b/u);
  });
});

describe("0186's event list and numbers", () => {
  it("the audit event list is 0150's list plus the two this step writes", async () => {
    const before = eventList(await sqlOf("migrations/0150_public_review.sql")), after = eventList(await sqlOf(SQL_PATH));
    expect(after).toEqual([...before, "PREVIEW_BUYER_ADDED", "PREVIEW_BUYER_REMOVED"]);
  });
  it("the API's alert sender and the database package know the same events", async () => {
    const after = eventList(await sqlOf(SQL_PATH));
    const alerts = await sqlOf("apps/api/src/staff/alerts.ts");
    const events = alerts.slice(alerts.indexOf("const EVENTS = new Set(["), alerts.indexOf("]);", alerts.indexOf("const EVENTS = new Set([")));
    expect([...events.matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1]).sort()).toEqual([...after].sort());
    const db = await sqlOf("packages/db/src/staff-access.ts");
    const union = db.slice(db.indexOf("event: 'INVITE'"), db.indexOf(";", db.indexOf("event: 'INVITE'")));
    expect([...union.matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1]).sort()).toEqual([...after].sort());
  });
  it("the database's own cap is the API's PREVIEW_TEAM_MAX_MEMBERS", async () => {
    const sql = await sqlOf(SQL_PATH);
    expect(sql.match(/v_cap CONSTANT integer:=(\d+);/u)?.[1]).toBe(String(PREVIEW_TEAM_MAX_MEMBERS));
  });
  it("the body the door digests names the same fields, in the same values, as the API's binding", async () => {
    const sql = await sqlOf(SQL_PATH), api = await sqlOf("apps/api/src/staff/preview-buyers.ts");
    expect(sql).toContain("json_build_object('action','TEAM_GRANT','intent',p_command->>'intent','target_id',p_command->>'targetId',\n  'expected_revision',(p_command->>'expectedRevision')::bigint,'operation_id',p_command->>'operationId')");
    expect(api).toContain('const body = { action: "TEAM_GRANT", intent, target_id: targetUserId, expected_revision: expectedRevision, operation_id: operationId };');
    expect(sql).toContain("PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_GRANT','TEAM_GRANT',v_target,v_operation);");
  });
});
