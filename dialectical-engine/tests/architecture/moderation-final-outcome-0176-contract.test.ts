// tests/architecture/moderation-final-outcome-0176-contract.test.ts
// 0176: everyone told "until the review ends" hears how it ended (what was left of 0172's M3, owner, 11 November 2026). One drained step: 0172's queue and
// page reader restated, 0157's kind CHECK widened by four kinds, all one amendment of 0157; the four kinds reach the mail, the contract and the page.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0176_moderation_final_outcome.sql";
const SQL = read(`migrations/${NAME}`);
const FUNCTIONS = ["identity.queue_moderation_statements()", "identity.read_own_moderation_statements(uuid)"];
const AMENDS = [{ step: "0157_moderation_statements.sql", functions: FUNCTIONS, field: "function_definition", relations: ["identity.moderation_statement"],
  constraints: ["moderation_statement_kind_check"] }];
const KINDS = ["CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF", "CONTRIBUTION_BACK", "REPORT_BACK"] as const;
const manifest = JSON.parse(read("migrations/lineage/moderation-final-outcome-forward0176.json")) as {
  previous: { name: string; manifestSha256: string; verifierSha256: string }; migration: { name: string; sha256: string };
  verifier: { path: string; sha256: string }; amendsPostconditionsOf: unknown };
/** A function's body as PostgreSQL keeps it (prosrc): the text between its dollar quotes. */
const body = (signature: string): string => {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const open = SQL.indexOf("AS $$", start) + 5;
  return SQL.slice(open, SQL.indexOf("$$;", open));
};

describe("0176: everyone told \"until the review ends\" hears how it ended", () => {
  it("comes last in the chain, after 0175, with its own loader, bound to its own bytes and 0175's manifest", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0174,loadForward0175,loadForward0176]);");
    expect(chain).toContain("import { loadForward0176 } from './migration-forward0176.js';");
    const loader = read("packages/db/src/migration-forward0176.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "moderation-final-outcome-forward0176-v1";');
    expect(loader).toContain('const PREVIOUS = "0175_statement_ai_read_verdict.sql";');
    expect(loader).toContain("throw Error(`MIGRATION_FORWARD0176_${detail}`)");
    expect(manifest.previous.name).toBe("0175_statement_ai_read_verdict.sql");
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/statement-ai-read-verdict-forward0175.json")));
    expect(manifest.migration).toEqual({ name: NAME, sha256: sha256(SQL) });
    expect(manifest.verifier).toEqual({ path: "lineage/verify-effective-capabilities-130.sql", sha256: sha256(read("migrations/lineage/verify-effective-capabilities-130.sql")) });
    expect(manifest.amendsPostconditionsOf).toEqual(AMENDS);
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-1)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe("0175_statement_ai_read_verdict.sql");
    expect(step.verifierSha256).toBe(plan.forwardChain.at(-2)!.verifierSha256);
    expect(step.replayVerifierSql).toBeUndefined();
    expect(step.amendsPostconditionsOf).toEqual(AMENDS);
  });

  it("is drained and keeps the verifier, and touches no billing object", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(SQL).not.toMatch(/\b(?:billing|ledger)\.[a-z_]+/u);
    // It restates only the two functions it declares, grants and revokes nothing, and edits no earlier file.
    expect([...SQL.matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1])).toEqual(["identity.queue_moderation_statements", "identity.read_own_moderation_statements"]);
    expect(SQL).not.toMatch(/^\s*(?:GRANT|REVOKE|ALTER FUNCTION)\b/mu);
  });

  it("its contract checks each restated body by the digest of the body in this file, and the kind CHECK by its full definition", () => {
    for (const signature of ["identity.queue_moderation_statements()", "identity.read_own_moderation_statements(p_owner_ref uuid)"]) {
      expect(SQL, signature).toContain(`IS DISTINCT FROM '${sha256(body(signature))}'`);
    }
    for (const kind of KINDS) expect(SQL).toContain(`''${kind}''::text`);
  });

  it("tells the end at a re-publish and at a decision, waits for the review's own statements, and keeps the facts the owner's", () => {
    const queue = body("identity.queue_moderation_statements()");
    for (const kind of KINDS) expect(queue).toContain(`'${kind}'`);
    // Both ends wait for every hide and dig taken out of the review before telling anyone.
    expect(queue.match(/cause\.action IN \('HIDE','REMOVE_DIG'\)/gu)).toHaveLength(2);
    // A piece the review took out itself is told its end then, at both ends.
    expect(queue.match(/own\.action = CASE affected\.piece_kind WHEN 'DIG' THEN 'REMOVE_DIG' ELSE 'HIDE_REPORT' END/gu)).toHaveLength(2);
    const reader = body("identity.read_own_moderation_statements(p_owner_ref uuid)");
    expect(reader.match(/'DEBATE_HIDDEN','DEBATE_DECIDED','CONTRIBUTION_REMOVED','REPORT_REMOVED','CORRECTED'/gu)).toHaveLength(2);
  });

  it("each new kind has its mail template, its purpose, its sender mapping, its contract value and its page lines", () => {
    const templates = read("packages/mail-templates/src/templates.ts");
    const channel = read("apps/api/src/mail-channel.ts");
    const sender = read("apps/api/src/moderation-statements.ts");
    const contract = read("packages/contract/src/web.ts");
    const kinds = read("packages/db/src/moderation-statement.ts");
    const page = JSON.parse(read("apps/ui/messages/en/public.json")) as Record<string, string>;
    for (const kind of KINDS) {
      expect(templates).toContain(`"MODERATION_STATEMENT_${kind}"`);
      expect(channel).toContain(`MODERATION_STATEMENT_${kind}: "moderation-notice"`);
      expect(sender).toContain(`${kind}: "MODERATION_STATEMENT_${kind}"`);
      expect(contract).toContain(`"${kind}"`);
      expect(kinds).toContain(`"${kind}"`);
      expect(page[`public.moderation.kind.${kind}`], kind).toBeTruthy();
      expect(page[`public.moderation.what.${kind}`], kind).toBeTruthy();
    }
    // The final notices give their country and duration, and name the other content's rule as such.
    const mail = JSON.parse(read("packages/mail-templates/messages/en/mail.json")) as Record<string, string>;
    for (const key of ["contributionDecided", "reportDecided", "contributionKeptOff", "reportKeptOff"]) {
      expect(mail[`mail.statement.${key}`], key).toContain("in every country and with no end date");
    }
    for (const kind of ["contributionAffected", "reportAffected", "contributionDecided", "reportDecided", "contributionKeptOff", "reportKeptOff"]) {
      expect(templates).toContain(`statement("${kind}", true)`);
    }
    expect(templates).toContain('MODERATION_STATEMENT_CONTRIBUTION_BACK: statementBack("contributionBack")');
  });
});
