// tests/architecture/moderation-notice-0156-contract.test.ts
// 0156: the person whose content a review took off the public page is told by email (owner request of 5 November 2026).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIL_TEMPLATES } from "@debateai/mail-templates";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0156_moderation_notice.sql";
const SQL = read(`migrations/${NAME}`);
const FUNCTIONS = ["identity.queue_moderation_notices", "identity.claim_moderation_notices", "identity.read_moderation_notice", "identity.complete_moderation_notice"];
const bodyOf = (name: string): string => {
  const at = SQL.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return SQL.slice(at, SQL.indexOf("$$;", SQL.indexOf("AS $$", at) + 5));
};

describe("0156: the moderation notice", () => {
  it("follows 0155 last in the chain, with its own loader, and is bound to its own bytes", () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0155,loadForward0156]");
    expect(chain).toContain("import { loadForward0156 } from './migration-forward0156.js';");
    const loader = read("packages/db/src/migration-forward0156.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const PREVIOUS = "0155_owner_answer_writes.sql";');
    const previous = read("migrations/lineage/owner-answer-writes-forward0155.json");
    const manifest = JSON.parse(read("migrations/lineage/moderation-notice-forward0156.json")) as { previous: { manifestSha256: string }; migration: { sha256: string } };
    expect(manifest.previous.manifestSha256).toBe(sha256(previous));
    expect(manifest.migration.sha256).toBe(sha256(SQL));
  });

  it("is expand and keeps the verifier: two new tables, four new functions, and nothing of an earlier step touched", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect([...SQL.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gmu)].map((match) => match[1])).toEqual(FUNCTIONS);
    expect([...SQL.matchAll(/^CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gmu)].map((match) => match[1])).toEqual(["identity.moderation_notice", "identity.moderation_notice_since"]);
    // 0150's log is only read: no trigger, constraint or function of an earlier step is added to or replaced.
    expect([...SQL.matchAll(/\bON (identity\.[a-z_]+)/gmu)].map((match) => match[1])).toEqual(expect.arrayContaining(["identity.moderation_notice_since"]));
    expect(SQL).not.toMatch(/(?:TRIGGER|ALTER TABLE|INSERT INTO|UPDATE)\s+[^\n]*identity\.public_review_event/u);
    expect(SQL).not.toMatch(/^-- n1: reviewed (?!gives only the new tables)/mu);
  });

  it("the queue tells only the author of what left the page, only of rows since the step applied, once each; no runtime login reads the queue", () => {
    const queue = bodyOf("identity.queue_moderation_notices");
    expect(queue).toContain("event.action IN ('HIDE','REMOVE_DIG','HIDE_REPORT') AND event.recorded_at >= start.since");
    expect(queue).toContain("core.run_ownership_event");
    expect(queue).toContain("identity.public_contribution AS contribution WHERE contribution.dig_run_id = event.piece_id");
    expect(queue).toContain("identity.public_report AS report WHERE report.report_id = event.piece_id");
    expect(queue).toContain("identity_user.state = 'active'");
    expect(queue).toContain("legal.acceptance");
    expect(queue).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(bodyOf("identity.claim_moderation_notices")).toContain("PERFORM identity.queue_moderation_notices();");
    expect(SQL).toContain("INSERT INTO identity.moderation_notice_since (since) VALUES (clock_timestamp()) ON CONFLICT (only_row) DO NOTHING;");
    for (const name of FUNCTIONS) expect(bodyOf(name), name).toMatch(/SECURITY DEFINER SET search_path=pg_catalog/u);
    expect([...SQL.matchAll(/^GRANT (.*)$/gmu)].map((match) => match[1])).toEqual([
      "EXECUTE ON FUNCTION identity.claim_moderation_notices(integer) TO debateai_runtime;",
      "EXECUTE ON FUNCTION identity.read_moderation_notice(uuid,uuid) TO debateai_runtime;",
      "EXECUTE ON FUNCTION identity.complete_moderation_notice(uuid,uuid,text) TO debateai_runtime;"
    ]);
    expect(SQL).toContain("'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)'::regprocedure");
  });

  it("the queue holds no words of the debate and goes with the account", () => {
    const table = SQL.slice(SQL.indexOf("CREATE TABLE IF NOT EXISTS identity.moderation_notice"), SQL.indexOf("\n);", SQL.indexOf("CREATE TABLE IF NOT EXISTS identity.moderation_notice")));
    expect(table).toContain('owner_ref uuid REFERENCES identity."user"(owner_ref) ON DELETE CASCADE');
    // A row with nobody to tell is settled the moment it is written, so it is never claimed.
    expect(table).toContain("CHECK (owner_ref IS NOT NULL OR (failed_at IS NOT NULL AND claim_token IS NULL))");
    expect(table).not.toMatch(/ciphertext|content|text_sha256|actor_staff_id/u);
  });

  it("the API sends the three templates, each with only the date and the Terms link", () => {
    const sender = read("apps/api/src/moderation-notices.ts");
    for (const id of ["MODERATION_DEBATE_HIDDEN", "MODERATION_CONTRIBUTION_REMOVED", "MODERATION_REPORT_REMOVED"] as const) {
      expect(sender).toContain(`"${id}"`);
      expect(MAIL_TEMPLATES[id].catalogue).toBe("mail");
      expect(MAIL_TEMPLATES[id].params).toEqual({ happened: "date", termsUrl: "url" });
    }
    expect(read("apps/api/src/main.ts")).toContain("new ModerationNoticeReconciler(new PostgresModerationNoticeRepository(pool), dekStore,");
  });
});
