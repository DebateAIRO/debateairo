// tests/architecture/moderation-statements-0157-contract.test.ts
// 0157: the DSA moderation notices (the owner's answers of 6 November 2026, D1-D11): statements of reasons, and answers to people who report.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0157_moderation_statements.sql";
const SQL = read(`migrations/${NAME}`);
const EARLIER = readdirSync(new URL("migrations/", ROOT)).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME).map((name) => read(`migrations/${name}`)).join("\n");
const created = (text: string, kind: "FUNCTION" | "TABLE"): string[] =>
  [...text.matchAll(kind === "FUNCTION" ? /CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+\.[a-z_]+)\(/gu : /CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+\.[a-z_"]+)/gu)].map((match) => match[1]!);
const NEW_FUNCTIONS = created(SQL, "FUNCTION");
const NEW_TABLES = created(SQL, "TABLE");
const bodyOf = (name: string): string => {
  const at = SQL.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return SQL.slice(at, SQL.indexOf("$$;", SQL.indexOf("AS $$", at) + 5));
};

describe("0157: the moderation statements", () => {
  it("follows 0156 in the chain, with its own loader, and is bound to its own bytes", () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0156,loadForward0157]");
    expect(chain).toContain("import { loadForward0157 } from './migration-forward0157.js';");
    const loader = read("packages/db/src/migration-forward0157.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const PREVIOUS = "0156_moderation_notice.sql";');
    expect(loader).toContain("const AMENDS: readonly never[] = [];");
    for (const name of [...NEW_TABLES, ...NEW_FUNCTIONS]) expect(loader, name).toContain(`"${name}`);
    const manifest = JSON.parse(read("migrations/lineage/moderation-statement-forward0157.json")) as { previous: { manifestSha256: string }; migration: { sha256: string }; amendsPostconditionsOf: unknown[] };
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/moderation-notice-forward0156.json")));
    expect(manifest.migration.sha256).toBe(sha256(SQL));
    expect(manifest.amendsPostconditionsOf).toEqual([]);
  });

  it("is expand and keeps the verifier: only new tables and new functions, under names no earlier step used, and nothing of an earlier step touched", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const earlierFunctions = new Set(created(EARLIER, "FUNCTION"));
    const earlierTables = new Set(created(EARLIER, "TABLE"));
    expect(NEW_FUNCTIONS.filter((name) => earlierFunctions.has(name))).toEqual([]);
    expect(NEW_TABLES.filter((name) => earlierTables.has(name))).toEqual([]);
    // Triggers, ALTERs, REVOKEs and DROPs only ever name this step's own objects.
    for (const match of SQL.matchAll(/^(?:CREATE TRIGGER \S+ BEFORE [A-Z ]+ ON|DROP TRIGGER IF EXISTS \S+ ON|ALTER TABLE|ALTER FUNCTION|REVOKE ALL ON FUNCTION|REVOKE ALL ON) ([a-z_]+\.[a-z_]+)/gmu)) {
      expect([...NEW_TABLES, ...NEW_FUNCTIONS], match[0]).toContain(match[1]);
    }
    expect(SQL).not.toMatch(/^\s*DROP (?!TRIGGER IF EXISTS guard_moderation_words ON identity\.(?:moderation_ground|moderation_decision|public_flag_quote);|TRIGGER IF EXISTS reject_mutation ON identity\.(?:moderation_statement_since|public_flag_answer|public_flag_mail_since);)/mu);
    // 0156's queue is left alone: no new kind, no second notice per event, nothing the release before's sender would claim.
    expect(SQL).not.toMatch(/INSERT INTO identity\.moderation_notice\b(?!_)/u);
    // 0150's log and 0151's reports are only read.
    expect(SQL).not.toMatch(/(?:TRIGGER|ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM)\s+[^\n]*identity\.(?:public_review_event|public_flag|public_flag_event)\b(?!_)/u);
    expect([...SQL.matchAll(/^-- n1: (\S+)/gmu)].map((match) => match[1])).toEqual(expect.arrayContaining(["expand", "keeps-verifier"]));
    expect(SQL).not.toMatch(/^-- n1: (?:drained|reviewed (?!gives only the new tables))/mu);
  });

  it("staff's new door reuses the proof's three action names, binds the ground's digest and never the facts, and never refuses or slows a hide", () => {
    const act = bodyOf("staff.public_review_act_grounded");
    expect([...new Set([...SQL.matchAll(/'(PUBLIC_[A-Z_]+)'/gu)].map((match) => match[1]))].filter((name) => /^PUBLIC_(?:REVIEW|REPORT)_[A-Z]+$/u.test(name!) && !/_(?:INVALID|STALE|HIDDEN|PUBLIC|UNKNOWN|CHANGED|HOLD)$/u.test(name!)).sort())
      .toEqual(["PUBLIC_REPORT_DISMISS", "PUBLIC_REVIEW_HIDE", "PUBLIC_REVIEW_STEP"]);
    expect(bodyOf("staff.public_review_body_grounded")).toContain("'facts_sha256',p_command->>'factsSha256'");
    expect(bodyOf("staff.public_review_body_grounded")).not.toContain("p_facts");
    // A hide is containment: its ground is recorded by a function that cannot raise, and only a hide skips the ground check and the alert.
    expect(act).toContain("IF v_step<>'HIDE' AND p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'");
    expect(act).toContain("IF v_step<>'HIDE' THEN");
    expect(act.indexOf("moderation_ground_whole")).toBeLessThan(act.indexOf("staff.consume_action"));
    expect(bodyOf("identity.record_hide_ground")).toContain("EXCEPTION WHEN OTHERS THEN");
    expect(SQL).toContain("CREATE TRIGGER guard_moderation_words BEFORE UPDATE OR DELETE ON identity.moderation_ground");
  });

  it("statements are queued by the sender, never by the step: a hide's transaction writes no statement, and only active or suspended accounts are told", () => {
    // Containment: no step function of this migration or of 0150 calls the queue; only the sender's claim does.
    expect([...SQL.matchAll(/PERFORM identity\.queue_moderation_statements\(\)/gu)].length).toBe(1);
    expect(bodyOf("identity.claim_moderation_statements")).toContain("identity.queue_moderation_statements()");
    for (const name of ["staff.public_review_act_grounded", "identity.record_hide_ground", "identity.moderation_decide", "identity.record_step_ground"]) expect(bodyOf(name), name).not.toContain("moderation_statement");
    // D8: an erased account gets nothing; its statements go with it.
    expect(bodyOf("identity.state_moderation")).toContain("identity_user.state IN ('active','suspended')");
    expect(bodyOf("identity.read_moderation_statement")).toContain("identity_user.state IN ('active','suspended')");
    expect(SQL).toContain('owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE');
    // D9: the start is 0156's, so steps 0156 already told of are told again with their ground, and none before.
    expect(SQL).toContain("INSERT INTO identity.moderation_statement_since (since) SELECT start.since FROM identity.moderation_notice_since AS start");
    // Words never enter the mail: the mail read gives the email, the kind, the dates, the ref and the ground's codes, never facts or quote.
    const mail = bodyOf("identity.read_moderation_statement");
    expect(mail).not.toMatch(/facts|quote|staff_id|reporter/u);
  });

  it("D4: the close is 0151's Dismiss with the outcome in the passkey's body; the reporter's mails carry no words and go only to a live reporter; a stuck check settles through 0151's own settle", () => {
    const close = bodyOf("staff.public_flag_close");
    expect(close).toContain("json_build_object('action','PUBLIC_REPORT_DISMISS','target_id',p_flag::text,'outcome',p_outcome,'expected_revision',0,'operation_id',p_operation::text)");
    expect(close).toContain("staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET','PUBLIC_REPORT_DISMISS',p_flag,p_operation)");
    // The dismissal is 0151's own, the one move its guard allows, so the words' six months still start from it.
    expect(bodyOf("identity.public_flag_close")).toContain("identity.public_flag_dismiss(p_flag_id, p_actor, p_operation, p_request_sha256)");
    expect(bodyOf("identity.settle_stuck_public_flags")).toContain("identity.settle_public_flag(v_flag, 'UNAVAILABLE', NULL, NULL, NULL, NULL, NULL, NULL)");
    expect(bodyOf("identity.settle_stuck_public_flags")).toContain("interval '5 minutes'");
    const mail = bodyOf("identity.read_public_flag_mail");
    expect(mail).not.toMatch(/content_ciphertext|reason|verdict|actor_staff_id|pseudonym/u);
    expect(mail).toContain("identity_user.owner_ref = flag.reporter_ref AND identity_user.state IN ('active','suspended')");
    // Only the sender's claim queues the mails.
    expect([...SQL.matchAll(/PERFORM identity\.queue_public_flag_mail\(\)/gu)].length).toBe(1);
    expect(bodyOf("identity.claim_public_flag_mail")).toContain("identity.queue_public_flag_mail()");
  });

  it("no runtime login reads a table of this step; the runtime calls only its doors", () => {
    for (const table of NEW_TABLES) expect(SQL, table).toContain(`'${table}'`);
    expect(SQL).toMatch(/REVOKE ALL ON %s FROM PUBLIC,debateai_runtime,/u);
    for (const match of SQL.matchAll(/^GRANT EXECUTE ON FUNCTION (\S+) TO debateai_runtime;$/gmu)) expect(NEW_FUNCTIONS.some((name) => match[1]!.startsWith(`${name}(`)), match[1]).toBe(true);
    expect(SQL).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE)/u);
  });
});
