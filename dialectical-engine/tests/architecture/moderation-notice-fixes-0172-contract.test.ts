// tests/architecture/moderation-notice-fixes-0172-contract.test.ts
// 0172: the moderation notices' seven gaps after 0157 (the owner's list of 10 November 2026, M1-M7). One drained step, each gap a section of its own.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIL_TEMPLATE_IDS, renderMail } from "@debateai/mail-templates";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0172_moderation_notice_fixes.sql";
const SQL = read(`migrations/${NAME}`);
const EARLIER_FILES = readdirSync(new URL("migrations/", ROOT)).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME);
const EARLIER = EARLIER_FILES.map((name) => read(`migrations/${name}`)).join("\n");
const created = (text: string): string[] => [...text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+\.[a-z_]+)\(/gu)].map((match) => match[1]!);
const bodyOf = (name: string): string => {
  const at = SQL.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return SQL.slice(at, SQL.indexOf("$$;", SQL.indexOf("AS $$", at) + 5));
};
type Manifest = { previous: { name: string; manifestSha256: string }; migration: { name: string; sha256: string };
  amendsPostconditionsOf: Array<{ step: string; field: string; functions?: string[]; relations?: string[]; constraints?: string[] }> };
const manifest = JSON.parse(read("migrations/lineage/moderation-notice-fixes-forward0172.json")) as Manifest;

describe("0172: the moderation notice fixes", () => {
  it("comes last in the chain, after 0171, with its own loader, and is bound to its own bytes", () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("loadForward0170,loadForward0171,loadForward0172]);");
    expect(chain).toContain("import { loadForward0172 } from './migration-forward0172.js';");
    const loader = read("packages/db/src/migration-forward0172.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const PREVIOUS = "0171_security_review_hardening.sql";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain("throw Error(`MIGRATION_FORWARD0172_${detail}`)");
    expect(manifest.previous.name).toBe("0171_security_review_hardening.sql");
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/security-review-hardening-forward0171.json")));
    expect(manifest.migration).toEqual({ name: NAME, sha256: sha256(SQL) });
    // Its own postcondition digests what it adds; the stuck sources' table is the first.
    expect(loader).toContain('"identity.moderation_statement_stuck"');
  });

  it("is drained and keeps the verifier, and its header says so before its first statement", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const header = SQL.slice(0, SQL.search(/^(?!--)\S/mu));
    expect(header).toMatch(/^-- n1: drained$/mu);
    expect(header).toMatch(/^-- n1: keeps-verifier$/mu);
    // No billing object: the effective-capability verifier stays 0130's.
    expect(SQL).not.toMatch(/\b(?:billing|ledger)\.[a-z_]+/u);
  });

  it("defines each function once (R1), and every earlier one it restates is declared under its own step's function_definition", () => {
    const names = created(SQL);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    const earlier = new Set(created(EARLIER));
    const restated = names.filter((name) => earlier.has(name));
    const declared = manifest.amendsPostconditionsOf.filter((entry) => entry.field === "function_definition").flatMap((entry) => entry.functions ?? []);
    expect(declared.map((signature) => signature.slice(0, signature.indexOf("(")))).toEqual(restated);
    // Each is declared under the step that first created it.
    for (const entry of manifest.amendsPostconditionsOf.filter((one) => one.field === "function_definition")) {
      for (const signature of entry.functions!) {
        const first = EARLIER_FILES.find((file) => created(read(`migrations/${file}`)).includes(signature.slice(0, signature.indexOf("("))));
        expect(first, signature).toBe(entry.step);
      }
    }
    // The CHECK it swaps is 0151's, under the catalog's name, dropped and added in the same place.
    expect(manifest.amendsPostconditionsOf).toEqual([
      { step: "0151_public_flag.sql", relations: ["staff.public_flag_notice"], constraints: ["public_flag_notice_kind_check"], field: "constraint_definition" },
      { step: "0157_moderation_statements.sql", field: "function_definition", functions: ["identity.queue_moderation_statements()"] }
    ]);
    expect(SQL).toContain("ALTER TABLE staff.public_flag_notice DROP CONSTRAINT IF EXISTS public_flag_notice_kind_check;\n"
      + "ALTER TABLE staff.public_flag_notice ADD CONSTRAINT public_flag_notice_kind_check\n  CHECK (kind IN ('PUBLIC_FLAG_HIDDEN','PUBLIC_FLAG_WAITING','MODERATION_MAIL_FAILED'));");
  });

  it("edits no file of 0150, 0151, 0156 or 0157: each is still bound to its manifest, and each manifest to the step after it", () => {
    const steps = [
      ["0150_public_review.sql", "public-review-forward0150.json", "public-flag-forward0151.json"],
      ["0151_public_flag.sql", "public-flag-forward0151.json", "report-export-forward0152.json"],
      ["0156_moderation_notice.sql", "moderation-notice-forward0156.json", "moderation-statement-forward0157.json"],
      ["0157_moderation_statements.sql", "moderation-statement-forward0157.json", "pre-start-charge-forward0158.json"]
    ] as const;
    for (const [sql, own, next] of steps) {
      const bytes = read(`migrations/lineage/${own}`);
      expect((JSON.parse(bytes) as Manifest).migration.sha256, sql).toBe(sha256(read(`migrations/${sql}`)));
      expect((JSON.parse(read(`migrations/lineage/${next}`)) as Manifest).previous.manifestSha256, own).toBe(sha256(bytes));
    }
  });

  it("M5: each source in its own block, set aside with its SQLSTATE (never its words), retried hourly, alerted once, and its stuck row gone on success", () => {
    const queue = bodyOf("identity.queue_moderation_statements");
    expect(queue).toContain("RETURNS integer\nLANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    expect([...queue.matchAll(/EXCEPTION WHEN OTHERS THEN\n {6}GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;/gu)]).toHaveLength(2);
    expect([...queue.matchAll(/stuck\.last_failed_at > clock_timestamp\(\) - interval '1 hour'/gu)]).toHaveLength(2);
    for (const source of ["v.event_id", "d.decision_id"]) {
      expect(queue, source).toContain(`IF v_tries = 1 THEN PERFORM staff.queue_public_flag_notices(${source}, 'MODERATION_MAIL_FAILED'); END IF;`);
      expect(queue, source).toContain(`DELETE FROM identity.moderation_statement_stuck AS stuck WHERE stuck.source_id = ${source};`);
    }
    expect(queue).not.toMatch(/SQLERRM|MESSAGE_TEXT|PG_EXCEPTION_DETAIL/u);
    // 0157's who-is-told is kept word for word: its event loop's work is inside the new block.
    const original = read("migrations/0157_moderation_statements.sql");
    const work = original.slice(original.indexOf("    v_owner := identity.moderation_debate_owner(v.publication_ref);"), original.indexOf("    END IF;\n  END LOOP;\n  FOR d IN"));
    expect(queue).toContain(work.split("\n").map((line) => (line.length > 0 ? `  ${line}` : line)).join("\n"));
    // The stuck table: five columns, no grant to anyone, under the truncate guard; the contract checks the rest as the step applies.
    expect(SQL).toContain("CREATE TABLE IF NOT EXISTS identity.moderation_statement_stuck (\n  source_id uuid PRIMARY KEY,\n  sqlstate text NOT NULL,\n"
      + "  first_failed_at timestamptz NOT NULL,\n  last_failed_at timestamptz NOT NULL,\n  tries integer NOT NULL\n);");
    expect(SQL).toContain("SELECT core.install_truncate_guard('identity.moderation_statement_stuck');");
    expect(SQL).not.toMatch(/^GRANT /mu);
    expect(SQL).toContain(`IS DISTINCT FROM '${createHash("sha256").update(queue.slice(queue.indexOf("AS $$") + 5)).digest("hex")}'`);
  });

  it("M5: the staff alert rides 0151's notices, in the owner catalogue beside PUBLIC_FLAG_WAITING, with no id in its words", () => {
    expect(MAIL_TEMPLATE_IDS).toContain("MODERATION_MAIL_FAILED");
    expect(read("apps/api/src/mail-channel.ts")).toContain('MODERATION_MAIL_FAILED: "team-notice"');
    expect(read("apps/api/src/staff/team-limit.ts")).toContain('MODERATION_MAIL_FAILED: "MODERATION_MAIL_FAILED" } as const);');
    expect(read("packages/db/src/public-flag.ts")).toContain('kind: "PUBLIC_FLAG_HIDDEN" | "PUBLIC_FLAG_WAITING" | "MODERATION_MAIL_FAILED"');
    const { subject, text } = renderMail("MODERATION_MAIL_FAILED", "en", {});
    expect(subject).toBe("A moderation email could not be sent");
    expect(text).toContain("A moderation email could not be created or sent. Look at the moderation mail queue.");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/u);
  });

  it("M5: the sender settles each claim on its own, and the timer runs the statements and the reporters' answers apart", () => {
    const sender = read("apps/api/src/moderation-statements.ts");
    expect(sender).toContain('try { await this.repository.complete(claim, outcome); } catch { console.error("[MODERATION_STATEMENT_COMPLETE_FAILED]"); }');
    expect(sender).toContain('try { await this.repository.complete(claim, outcome); } catch { console.error("[PUBLIC_FLAG_ANSWER_COMPLETE_FAILED]"); }');
    const main = read("apps/api/src/main.ts");
    expect(main).toContain('  try { await moderationStatements.reconcile(100); } catch { console.error("[MODERATION_STATEMENT_PENDING]"); }\n'
      + '  try { await publicFlagAnswers.reconcile(100); } catch { console.error("[PUBLIC_FLAG_ANSWER_PENDING]"); }\n');
  });
});
