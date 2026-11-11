// tests/architecture/moderation-notice-fixes-0172-contract.test.ts
// 0172: the moderation notices' seven gaps after 0157 (the owner's list of 10 November 2026, M1-M7). One drained step, each gap a section of its own.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIL_TEMPLATE_IDS, MAIL_TEMPLATES, renderMail } from "@debateai/mail-templates";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0172_moderation_notice_fixes.sql";
const SQL = read(`migrations/${NAME}`);
const EARLIER_FILES = readdirSync(new URL("migrations/", ROOT)).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME);
const EARLIER = EARLIER_FILES.map((name) => read(`migrations/${name}`)).join("\n");
const created = (text: string): string[] => [...text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+\.[a-z_]+)\(/gu)].map((match) => match[1]!);
/** A function as name/arity: an overload with one more argument (M7's law) is a new function, not a second definition of the old one. */
const arityOf = (args: string): number => (args.trim() === "" ? 0 : args.split(",").length);
const createdFunctions = (text: string): string[] => [...text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+\.[a-z_]+)\(([^)]*)\)/gu)]
  .map((match) => `${match[1]!}/${arityOf(match[2]!)}`);
const functionOf = (signature: string): string => `${signature.slice(0, signature.indexOf("("))}/${arityOf(signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")")))}`;
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
    expect(chain).toContain("loadForward0170,loadForward0171,loadForward0172,loadForward0173,loadForward0174,loadForward0175]);");
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
    const names = createdFunctions(SQL);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    const earlier = new Set(createdFunctions(EARLIER));
    const restated = names.filter((name) => earlier.has(name));
    const declared = manifest.amendsPostconditionsOf.filter((entry) => entry.field === "function_definition").flatMap((entry) => entry.functions ?? []);
    expect(declared.map(functionOf)).toEqual(restated);
    // M7: the overloads with the law are new, and this step's own postcondition digests them.
    const loader = read("packages/db/src/migration-forward0172.ts");
    for (const added of ["identity.moderation_law_of(text[],text)", "identity.moderation_decide(uuid,uuid,text[],text,uuid,text,jsonb,integer,uuid,text,text)",
      "identity.record_step_ground(uuid,uuid,text[],text,uuid,text,jsonb,text)", "staff.public_review_body_grounded(text,jsonb,text)",
      "staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text)"]) {
      expect(earlier.has(functionOf(added)), added).toBe(false);
      expect(names, added).toContain(functionOf(added));
      expect(loader, added).toContain(`"${added}"`);
    }
    // Each is declared under the step that first created it.
    for (const entry of manifest.amendsPostconditionsOf.filter((one) => one.field === "function_definition")) {
      for (const signature of entry.functions!) {
        const first = EARLIER_FILES.find((file) => createdFunctions(read(`migrations/${file}`)).includes(functionOf(signature)));
        expect(first, signature).toBe(entry.step);
      }
    }
    // The CHECK it swaps is 0151's, under the catalog's name, dropped and added in the same place.
    expect(manifest.amendsPostconditionsOf).toEqual([
      { step: "0151_public_flag.sql", relations: ["staff.public_flag_notice"], constraints: ["public_flag_notice_kind_check"], field: "constraint_definition" },
      { step: "0157_moderation_statements.sql", field: "function_definition", functions: ["identity.queue_moderation_statements()",
        "identity.claim_moderation_statements(integer)", "identity.complete_moderation_statement(uuid,uuid,text)", "identity.claim_public_flag_mail(integer)",
        "identity.complete_public_flag_mail(uuid,uuid,text)", "identity.record_hide_ground(uuid,uuid,text[],text,uuid)",
        "identity.moderation_decide(uuid,uuid,text[],text,uuid,text,jsonb,integer,uuid,text)", "identity.record_step_ground(uuid,uuid,text[],text,uuid,text,jsonb)",
        "identity.queue_public_flag_mail()", "identity.public_flag_queue_answered()", "identity.read_own_moderation_statements(uuid)", "identity.read_public_flag_mail(uuid,uuid)",
        "identity.moderation_statement_ground(uuid)"], relations: ["identity.moderation_statement", "identity.public_flag_mail", "identity.moderation_ground", "identity.moderation_decision"],
        columns: ["next_attempt_at", "law_ref"],
        constraints: ["moderation_statement_kind_check", "moderation_ground_law_length", "moderation_ground_law_required", "moderation_decision_law_length", "moderation_decision_law_required"],
        revokes: ["EXECUTE ON FUNCTION staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) FROM debateai_runtime"] }
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
    // No grant on the stuck table: the step's one top-level GRANT is M7's, the runtime's on staff's door with the law.
    expect([...SQL.matchAll(/^GRANT [^\n]+$/gmu)].map(([line]) => line)).toEqual(["GRANT EXECUTE ON FUNCTION staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text) TO debateai_runtime;"]);
    expect(SQL).toContain(`IS DISTINCT FROM '${createHash("sha256").update(queue.slice(queue.indexOf("AS $$") + 5)).digest("hex")}'`);
  });

  it("M3: the decision loop gains the final statements for those told at the hide, the event loop stays 0157's, and the kind CHECK is swapped under 0157's name", () => {
    const queue = bodyOf("identity.queue_moderation_statements");
    const original = read("migrations/0157_moderation_statements.sql");
    // The event loop (everything before the decision loop) is 0157's work, word for word, as M5's case checks; here the decision's own line is still 0157's.
    expect(queue).toContain("PERFORM identity.state_moderation(identity.moderation_debate_owner(d.publication_ref), 'DEBATE_DECIDED', d.publication_ref, NULL, d.decision_id, '{}'::uuid[], NULL, NULL, NULL, d.recorded_at);");
    expect(original).toContain("PERFORM identity.state_moderation(identity.moderation_debate_owner(d.publication_ref), 'DEBATE_DECIDED', d.publication_ref, NULL, d.decision_id, '{}'::uuid[], NULL, NULL, NULL, d.recorded_at);");
    const decisions = queue.slice(queue.indexOf("  FOR d IN SELECT"));
    // The hide it makes final: the latest HIDE up to the decision with no REPUBLISH after it.
    expect(decisions).toContain("hide.action = 'HIDE' AND hide.revision <= d.revision");
    expect(decisions).toContain("back.action = 'REPUBLISH'\n            AND back.revision > hide.revision AND back.revision <= d.revision)");
    expect(decisions).toContain("ORDER BY hide.revision DESC LIMIT 1;");
    // Once per person and kind; no places, no piece (R8); an erased account is state_moderation's to skip, not this loop's.
    expect(decisions).toContain("SELECT DISTINCT affected.owner_ref, CASE affected.kind WHEN 'CONTRIBUTION_AFFECTED' THEN 'CONTRIBUTION_DECIDED' ELSE 'REPORT_DECIDED' END AS kind");
    expect(decisions).toContain("affected.event_id = v_hide AND affected.kind IN ('CONTRIBUTION_AFFECTED','REPORT_AFFECTED')");
    expect(decisions).toContain("PERFORM identity.state_moderation(v_row.owner_ref, v_row.kind, d.publication_ref, NULL, d.decision_id, '{}'::uuid[], NULL, NULL, NULL, d.recorded_at);");
    expect(decisions).not.toMatch(/identity\."user"|\.state\b/u);
    // The kind CHECK: 0157's name, dropped and added in one place, the seven kinds and the two new.
    expect(original).toContain("CONSTRAINT moderation_statement_kind_check CHECK (kind IN ('DEBATE_HIDDEN','DEBATE_DECIDED','CONTRIBUTION_REMOVED','REPORT_REMOVED','CORRECTED','CONTRIBUTION_AFFECTED','REPORT_AFFECTED'))");
    expect(SQL).toContain("ALTER TABLE identity.moderation_statement DROP CONSTRAINT IF EXISTS moderation_statement_kind_check;\n"
      + "ALTER TABLE identity.moderation_statement ADD CONSTRAINT moderation_statement_kind_check\n  CHECK (kind IN ('DEBATE_HIDDEN','DEBATE_DECIDED','CONTRIBUTION_REMOVED','REPORT_REMOVED','CORRECTED','CONTRIBUTION_AFFECTED','REPORT_AFFECTED','CONTRIBUTION_DECIDED','REPORT_DECIDED'));");
    // The kind rides the same path as its neighbours: type, contract, template, channel purpose, English copy.
    for (const kind of ["CONTRIBUTION_DECIDED", "REPORT_DECIDED"]) {
      expect(read("packages/db/src/moderation-statement.ts")).toContain(`"${kind}"`);
      expect(read("packages/contract/src/web.ts")).toContain(`"${kind}"`);
      expect(read("apps/api/src/moderation-statements.ts")).toContain(`${kind}: "MODERATION_STATEMENT_${kind}"`);
      expect(read("apps/api/src/mail-channel.ts")).toContain(`MODERATION_STATEMENT_${kind}: "moderation-notice"`);
      expect(MAIL_TEMPLATE_IDS).toContain(`MODERATION_STATEMENT_${kind}`);
    }
    expect(read("packages/mail-templates/src/templates.ts")).toContain('MODERATION_STATEMENT_CONTRIBUTION_DECIDED: statement("contributionDecided"),');
    expect(read("packages/mail-templates/src/templates.ts")).toContain('MODERATION_STATEMENT_REPORT_DECIDED: statement("reportDecided"),');
  });

  it("M3: the page's reader gives a decision's words to the debate owner's statement alone; it is 0157's body plus those edits, and the export reads through it", () => {
    const original = read("migrations/0157_moderation_statements.sql");
    const at = original.indexOf("CREATE OR REPLACE FUNCTION identity.read_own_moderation_statements");
    const was = original.slice(at, original.indexOf("$$;", original.indexOf("AS $$", at) + 5));
    const now = bodyOf("identity.read_own_moderation_statements");
    // The head is byte-equal; the body is 0157's with the two edits, each found once.
    expect(now.slice(0, now.indexOf("AS $$"))).toBe(was.slice(0, was.indexOf("AS $$")));
    const edited = was
      .replace("'facts', CASE WHEN s.decision_id IS NOT NULL THEN", "'facts', CASE WHEN s.decision_id IS NOT NULL AND s.kind = 'DEBATE_DECIDED' THEN")
      .replace("WHERE decision.decision_id = s.decision_id AND decision.facts_deleted_at IS NOT NULL),", "WHERE decision.decision_id = s.decision_id AND s.kind = 'DEBATE_DECIDED' AND decision.facts_deleted_at IS NOT NULL),");
    expect(edited).not.toBe(was);
    expect(now).toBe(edited);
    expect(SQL).toContain(`IS DISTINCT FROM '${createHash("sha256").update(now.slice(now.indexOf("AS $$") + 5)).digest("hex")}'`);
    // The export has no copy of the facts logic: it reads the person's statements through this one, which 0172 does not restate.
    expect(original).toContain("FROM jsonb_array_elements(identity.read_own_moderation_statements(v_owner_ref)) WITH ORDINALITY AS own(value, at)");
    expect(SQL).not.toContain("CREATE OR REPLACE FUNCTION identity.read_data_export_moderation");
    // A decision waits for its hide's statements, unless the hide predates the watch or none is open; it never raises for it.
    const queue = bodyOf("identity.queue_moderation_statements");
    expect(queue).toContain("IF v_hide IS NOT NULL AND v_hide_at >= v_since AND NOT EXISTS (SELECT 1 FROM identity.moderation_statement_seen AS seen WHERE seen.source_id = v_hide) THEN CONTINUE; END IF;");
    expect(queue.indexOf("v_hide_at >= v_since")).toBeLessThan(queue.indexOf("VALUES (d.decision_id)"));
  });

  it("M1: the reporter's answer reader is 0157's body plus the one key aiReadFirst (a verdict of the check given by the mail's moment, not UNAVAILABLE), the sender and the three templates use it, the two automatic mails do not", () => {
    const original = read("migrations/0157_moderation_statements.sql");
    const at = original.indexOf("CREATE OR REPLACE FUNCTION identity.read_public_flag_mail");
    const was = original.slice(at, original.indexOf("$$;", original.indexOf("AS $$", at) + 5));
    const now = bodyOf("identity.read_public_flag_mail");
    expect(now.slice(0, now.indexOf("AS $$"))).toBe(was.slice(0, was.indexOf("AS $$")));
    const edited = was.replace("'mailLocale', identity.moderation_mail_locale(identity_user.owner_ref),",
      "'aiReadFirst', COALESCE(flag.verdict IN ('AGREE','NOT_FOUND','UNSURE'), false) AND flag.judged_at IS NOT NULL AND flag.judged_at <= mail.happened_at,\n    'mailLocale', identity.moderation_mail_locale(identity_user.owner_ref),");
    expect(edited).not.toBe(was);
    expect(now).toBe(edited);
    expect(SQL).toContain(`IS DISTINCT FROM '${sha256(now.slice(now.indexOf("AS $$") + 5))}'`);
    const templates = read("packages/mail-templates/src/templates.ts");
    expect(templates).toContain('PUBLIC_FLAG_ANSWER_AUTO_HIDDEN: flagAnswer("autoHidden"),');
    expect(templates).toContain('PUBLIC_FLAG_ANSWER_AUTO_NOT_FOUND: flagAnswer("autoNotFound"),');
    expect(templates).toContain('PUBLIC_FLAG_ANSWER_NO_BREACH: flagAnswer("noBreach", true),');
    expect(templates).toContain('PUBLIC_FLAG_ANSWER_ACTED: flagAnswer("acted", true),');
  });

  it("M2: the four functions keep their 0157 signatures and results, each claim keeps its queue call first, and the backoff and the alert are as the brief says", () => {
    const original = read("migrations/0157_moderation_statements.sql");
    const head = (text: string, name: string): string => {
      const at = text.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      expect(at, name).toBeGreaterThan(-1);
      return text.slice(at, text.indexOf("AS $$", at));
    };
    for (const name of ["identity.claim_moderation_statements", "identity.complete_moderation_statement", "identity.claim_public_flag_mail", "identity.complete_public_flag_mail"]) {
      expect(head(SQL, name), name).toBe(head(original, name));
    }
    const claimStatements = bodyOf("identity.claim_moderation_statements");
    const claimMail = bodyOf("identity.claim_public_flag_mail");
    expect(claimStatements).toContain("BEGIN\n  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MODERATION_STATEMENT_LIMIT_INVALID'; END IF;\n  PERFORM identity.queue_moderation_statements();\n  RETURN QUERY");
    expect(claimMail).toContain("BEGIN\n  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_MAIL_LIMIT_INVALID'; END IF;\n  PERFORM identity.queue_public_flag_mail();\n  RETURN QUERY");
    expect(claimStatements).toContain("AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= clock_timestamp())");
    expect(claimMail).toContain("AND (mail.next_attempt_at IS NULL OR mail.next_attempt_at <= clock_timestamp())");
    // 0157's claim differs from this one by that condition only.
    const bodyIn = (text: string, name: string): string => {
      const at = text.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      return text.slice(text.indexOf("AS $$", at), text.indexOf("$$;", text.indexOf("AS $$", at) + 5));
    };
    const without = (text: string): string => text.replace(/\n +AND \((?:s|mail)\.next_attempt_at IS NULL OR (?:s|mail)\.next_attempt_at <= clock_timestamp\(\)\)/u, "");
    for (const name of ["identity.claim_moderation_statements", "identity.claim_public_flag_mail"]) expect(without(bodyIn(SQL, name)), name).toBe(bodyIn(original, name));
    for (const [name, alias, id] of [["identity.complete_moderation_statement", "s", "p_statement_id"], ["identity.complete_public_flag_mail", "mail", "p_mail_id"]] as const) {
      const body = bodyOf(name);
      expect(body, name).toContain(`next_attempt_at = CASE WHEN p_outcome = 'RETRY' AND ${alias}.attempts < 19 THEN clock_timestamp() + least(interval '1 minute' * power(2, ${alias}.attempts), interval '6 hours') END`);
      expect(body, name).toContain(`failed_at = CASE WHEN p_outcome = 'DROPPED' OR (p_outcome = 'RETRY' AND ${alias}.attempts >= 19) THEN clock_timestamp() END`);
      expect(body, name).toContain(`IF v_gave_up THEN PERFORM staff.queue_public_flag_notices(${id}, 'MODERATION_MAIL_FAILED'); END IF;`);
      expect(body, name).not.toMatch(/'DROPPED'[^\n]*queue_public_flag_notices/u);
    }
    expect(SQL).toContain("ALTER TABLE identity.moderation_statement ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;");
    expect(SQL).toContain("ALTER TABLE identity.public_flag_mail ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;");
  });

  it("M6, M4: a person's step that names a report closes it through one function that never raises; the five restated bodies are 0157's plus that", () => {
    const original = read("migrations/0157_moderation_statements.sql");
    const head = (text: string, name: string): string => {
      const at = text.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      expect(at, name).toBeGreaterThan(-1);
      return text.slice(at, text.indexOf("AS $$", at));
    };
    const bodyIn = (text: string, name: string): string => {
      const at = text.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      return text.slice(text.indexOf("AS $$", at) + 5, text.indexOf("$$;", text.indexOf("AS $$", at) + 5));
    };
    /** 0157's body with exactly these edits, each found once. */
    const edited = (name: string, edits: ReadonlyArray<readonly [string, string]>): string => edits.reduce((body, [from, to]) => {
      expect(body.split(from).length - 1, `${name}: ${from}`).toBe(1);
      return body.replace(from, () => to);
    }, bodyIn(original, name));
    const NIL = "'00000000-0000-0000-0000-000000000000'::uuid";
    const restated = ["identity.record_hide_ground", "identity.moderation_decide", "identity.record_step_ground", "identity.queue_public_flag_mail", "identity.public_flag_queue_answered"];
    for (const name of restated) expect(head(SQL, name), name).toBe(head(original, name));
    // R3: the close is its own function, and each ground function calls it in one line, after its own insert, only for a person's step.
    const closeCall = /identity\.close_public_flag_by_review\(/gu;
    expect(bodyIn(SQL, "identity.record_hide_ground")).toBe(edited("identity.record_hide_ground", [
      ["v_suspected text[];", "v_suspected text[]; v_actor uuid;"],
      ["SELECT event.event_id INTO v_event_id FROM", "SELECT event.event_id, event.actor_staff_id INTO v_event_id, v_actor FROM"],
      ["v_flag, true) ON CONFLICT (event_id) DO NOTHING;\n", `v_flag, true) ON CONFLICT (event_id) DO NOTHING;\n    IF v_flag IS NOT NULL AND v_actor <> ${NIL} THEN PERFORM identity.close_public_flag_by_review(v_flag, v_actor, v_event_id); END IF;\n`]]));
    expect(bodyIn(SQL, "identity.moderation_decide")).toBe(edited("identity.moderation_decide", [
      ["DECLARE v_revision integer; v_at timestamptz;", "DECLARE v_revision integer; v_at timestamptz; v_decision uuid;"],
      ["RETURNING recorded_at INTO v_at;\n", `RETURNING recorded_at, decision_id INTO v_at, v_decision;\n  IF p_source = 'REPORT_BUTTON' AND p_flag_id IS NOT NULL AND p_actor <> ${NIL} THEN PERFORM identity.close_public_flag_by_review(p_flag_id, p_actor, v_decision); END IF;\n`]]));
    const step = bodyIn(original, "identity.record_step_ground");
    expect(bodyIn(SQL, "identity.record_step_ground")).toBe(`\n  WITH recorded AS (${step.slice(0, -1)}\n  RETURNING event_id)\n`
      + "  SELECT identity.close_public_flag_by_review(p_flag_id, event.actor_staff_id, event.event_id) FROM recorded JOIN identity.public_review_event AS event ON event.event_id = recorded.event_id"
      + ` WHERE p_source = 'REPORT_BUTTON' AND p_flag_id IS NOT NULL AND event.actor_staff_id <> ${NIL}\n`);
    for (const name of ["identity.record_hide_ground", "identity.moderation_decide", "identity.record_step_ground"]) expect([...bodyIn(SQL, name).matchAll(closeCall)], name).toHaveLength(1);
    // A hide still cannot raise: its call is inside its own block.
    const hideBody = bodyIn(SQL, "identity.record_hide_ground");
    expect(hideBody.indexOf("close_public_flag_by_review")).toBeGreaterThan(hideBody.indexOf("  BEGIN\n"));
    expect(hideBody.indexOf("close_public_flag_by_review")).toBeLessThan(hideBody.indexOf("EXCEPTION WHEN OTHERS THEN"));
    // The close: 0151's dismissal under an operation derived from the step's row, then the ACTED answer; nothing when already closed; never raises.
    const closeBody = bodyIn(SQL, "identity.close_public_flag_by_review");
    expect(bodyOf("identity.close_public_flag_by_review")).toContain("CREATE OR REPLACE FUNCTION identity.close_public_flag_by_review(p_flag_id uuid, p_actor uuid, p_source_id uuid) RETURNS void\n"
      + "LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    expect(closeBody).toContain("v_operation := md5('review-close:' || p_source_id::text)::uuid;");
    expect(closeBody).toContain("identity.public_flag_dismiss(p_flag_id, p_actor, v_operation, encode(sha256(convert_to('review-close:' || p_source_id::text, 'UTF8')), 'hex'))");
    expect(closeBody).toContain("VALUES (p_flag_id, 'ACTED', p_actor, v_operation, v_at)");
    expect(closeBody).toContain("WHERE flag.flag_id = p_flag_id AND flag.dismissed_at IS NULL FOR UPDATE;\n    IF NOT FOUND THEN RETURN; END IF;");
    expect(closeBody).toContain("  EXCEPTION WHEN OTHERS THEN\n    RAISE WARNING 'PUBLIC_FLAG_REVIEW_CLOSE_SKIPPED';\n  END;\nEND ");
    expect(closeBody).not.toMatch(/RAISE EXCEPTION|SQLERRM|MESSAGE_TEXT|PG_EXCEPTION_DETAIL|%/u);
    // M4: the mail queue is 0157's with the three guards added, and nothing else. Final review: and, in its first insert, no receipt or automatic
    // answer once a person decided at or before its moment (a report closed, or named by a step, while the check still read it).
    const QUEUE_ADDED = [
      "    AND NOT EXISTS (SELECT 1 FROM identity.public_flag_answer AS answer WHERE answer.flag_id = due.flag_id AND answer.recorded_at <= due.happened_at)",
      "    AND NOT EXISTS (SELECT 1 FROM identity.public_flag_mail AS decided WHERE decided.flag_id = due.flag_id AND decided.kind IN ('ACTED','NO_BREACH') AND decided.happened_at <= due.happened_at)",
      "    AND NOT EXISTS (SELECT 1 FROM identity.moderation_ground AS ground WHERE ground.flag_id = due.flag_id AND ground.source = 'REPORT_BUTTON' AND ground.recorded_at <= due.happened_at)",
      "    AND NOT EXISTS (SELECT 1 FROM identity.moderation_decision AS decision WHERE decision.flag_id = due.flag_id AND decision.source = 'REPORT_BUTTON' AND decision.recorded_at <= due.happened_at)",
      "        AND NOT EXISTS (SELECT 1 FROM identity.public_flag_answer AS acted WHERE acted.flag_id = ground.flag_id AND acted.outcome = 'ACTED')",
      "        AND NOT EXISTS (SELECT 1 FROM identity.public_flag_answer AS acted WHERE acted.flag_id = decision.flag_id AND acted.outcome = 'ACTED')) AS due",
      "    AND NOT (due.kind = 'NO_BREACH' AND (EXISTS (SELECT 1 FROM identity.public_flag_mail AS mail WHERE mail.flag_id = due.flag_id AND mail.kind = 'ACTED')",
      "      OR EXISTS (SELECT 1 FROM identity.moderation_ground AS ground WHERE ground.flag_id = due.flag_id AND ground.source = 'REPORT_BUTTON' AND ground.recorded_at <= due.happened_at)",
      "      OR EXISTS (SELECT 1 FROM identity.moderation_decision AS decision WHERE decision.flag_id = due.flag_id AND decision.source = 'REPORT_BUTTON' AND decision.recorded_at <= due.happened_at)))"];
    const queue = bodyIn(SQL, "identity.queue_public_flag_mail");
    for (const line of QUEUE_ADDED) expect(queue.split("\n"), line).toContain(line);
    expect(queue.split("\n").filter((line) => !QUEUE_ADDED.includes(line)).join("\n").replace("WHERE decision.flag_id IS NOT NULL AND decision.source = 'REPORT_BUTTON'\n", "WHERE decision.flag_id IS NOT NULL AND decision.source = 'REPORT_BUTTON') AS due\n"))
      .toBe(bodyIn(original, "identity.queue_public_flag_mail"));
    // closed_by_step: recomputed from the rows that name the report, never by matching the id's text.
    const answered = bodyIn(SQL, "identity.public_flag_queue_answered");
    expect(answered).toContain("answer.operation_id = md5('review-close:' || ground.event_id::text)::uuid");
    expect(answered).toContain("answer.operation_id = md5('review-close:' || decision.decision_id::text)::uuid");
    expect(answered).not.toMatch(/LIKE|~|::text = /u);
    // Each body is pinned by its digest in the file's contract, and the close is its own postcondition's.
    for (const name of ["identity.close_public_flag_by_review", ...restated]) expect(SQL, name).toContain(`'${sha256(bodyIn(SQL, name))}')`);
    expect(read("packages/db/src/migration-forward0172.ts")).toContain('"identity.close_public_flag_by_review(uuid,uuid,uuid)"');
    // Staff's queue carries it to the panel, which shows the closed line and no Close button.
    expect(read("packages/contract/src/staff-access.ts")).toContain("closed_by_step: z.boolean() }).strict()).max(200) }).strict();");
    expect(read("apps/api/src/public-flag.ts")).toContain("closed_by_step: row.closed_by_step === true");
    expect(read("apps/ui/components/PublicReviewPanel.tsx")).toContain('report.closed_by_step ? "staff.publicReports.closedByStep"');
    expect((JSON.parse(read("apps/ui/messages/en/staff.json")) as Record<string, string>)["staff.publicReports.closedByStep"]).toBe("Closed: we acted on it (review step)");
    expect((JSON.parse(read("apps/ui/messages/ro/staff.json")) as Record<string, string>)["staff.publicReports.closedByStep"]).toBe("Închisă: am acționat (pas de verificare)");
  });

  it("M5: the staff alert rides 0151's notices, in the owner catalogue beside PUBLIC_FLAG_WAITING, with no id in its words", () => {
    expect(MAIL_TEMPLATE_IDS).toContain("MODERATION_MAIL_FAILED");
    expect(read("apps/api/src/mail-channel.ts")).toContain('MODERATION_MAIL_FAILED: "team-notice"');
    expect(read("apps/api/src/staff/team-limit.ts")).toContain('MODERATION_MAIL_FAILED: "MODERATION_MAIL_FAILED" } as const);');
    expect(read("packages/db/src/public-flag.ts")).toContain('kind: "PUBLIC_FLAG_HIDDEN" | "PUBLIC_FLAG_WAITING" | "MODERATION_MAIL_FAILED"');
    const { subject, text } = renderMail("MODERATION_MAIL_FAILED", "en", {});
    expect(subject).toBe("A moderation email could not be sent");
    expect(text).toContain("A moderation email could not be created or sent. It is retried for about three days; the team's database operator can see which one.");
    // Final review: the team page shows no moderation mail, so the alert does not send anyone there.
    expect(MAIL_TEMPLATES.MODERATION_MAIL_FAILED.paragraphs).toEqual(["owner.moderationMail.failed"]);
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

  it("M7: an illegal ground names the law; the new overloads are their neighbours' bodies plus the law, the check comes before the proof is spent, and no mail carries it", () => {
    const original = read("migrations/0157_moderation_statements.sql");
    /** The function whose head starts with `head`, from its CREATE to its closing $$ (its body is after AS $$). */
    const whole = (text: string, head: string): string => {
      const at = text.indexOf(`CREATE OR REPLACE FUNCTION ${head}`);
      expect(at, head).toBeGreaterThan(-1);
      return text.slice(at, text.indexOf("$$;", text.indexOf("AS $$", at) + 5));
    };
    const bodyIn = (fn: string): string => fn.slice(fn.indexOf("AS $$") + 5);
    /** `from` with exactly these edits, each found once. */
    const edited = (from: string, edits: ReadonlyArray<readonly [string, string]>): string => edits.reduce((text, [a, b]) => {
      expect(text.split(a).length - 1, a).toBe(1);
      return text.replace(a, () => b);
    }, from);
    const digest = (fn: string): string => sha256(bodyIn(fn));
    const contract = SQL.slice(SQL.indexOf("DO $moderation_notice_fixes_contract$"));
    // The statement's ground: 0157's, plus the distinct laws of its grounds, "; "-joined, or null.
    const ground = whole(SQL, "identity.moderation_statement_ground(");
    expect(ground).toBe(edited(whole(original, "identity.moderation_statement_ground("), [
      ["v_recorded boolean := false; v_event record;", "v_recorded boolean := false; v_event record; v_laws text[] := '{}';"],
      ["v_flag := d.flag_id; v_recorded := true;", "v_flag := d.flag_id; v_recorded := true; v_laws := ARRAY[d.law_ref];"],
      ["ground.source, ground.flag_id, ground.interim\n", "ground.source, ground.flag_id, ground.interim, ground.law_ref\n"],
      ["v_interim := v_interim OR v_event.interim; v_recorded := true;\n", "v_interim := v_interim OR v_event.interim; v_recorded := true; v_laws := v_laws || v_event.law_ref;\n"],
      ["'automated_detection', v_detected, 'automated_decision', v_decided);", "'automated_detection', v_detected, 'automated_decision', v_decided,\n    'law', (SELECT string_agg(DISTINCT law, '; ' ORDER BY law) FROM unnest(v_laws) AS law));"]]));
    // R3: the writers' overloads are Task 3's bodies in this file (the report's one-line close kept) plus the law, refused first.
    const decide = whole(SQL, "identity.moderation_decide(p_actor uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid, p_facts_sha256 text, p_facts jsonb,\n  p_expected_revision integer, p_operation uuid, p_request_sha256 text, p_law text)");
    expect(decide).toBe(edited(whole(SQL, "identity.moderation_decide("), [
      ["p_request_sha256 text) RETURNS timestamptz", "p_request_sha256 text, p_law text) RETURNS timestamptz"],
      ["DECLARE v_revision integer; v_at timestamptz; v_decision uuid;\nBEGIN\n", "DECLARE v_revision integer; v_at timestamptz; v_decision uuid; v_law text := identity.moderation_law_of(p_grounds, p_law);\nBEGIN\n"],
      ["operation_id, request_sha256)\n", "operation_id, request_sha256, law_ref)\n"], ["p_operation, p_request_sha256)\n", "p_operation, p_request_sha256, v_law)\n"]]));
    const step = whole(SQL, "identity.record_step_ground(p_operation uuid, p_publication_ref uuid, p_grounds text[], p_source text, p_flag_id uuid, p_facts_sha256 text, p_facts jsonb, p_law text)");
    expect(step).toBe(edited(whole(SQL, "identity.record_step_ground("), [
      ["p_facts jsonb) RETURNS void", "p_facts jsonb, p_law text) RETURNS void"],
      ["AS $$\n  WITH recorded AS (\n", "AS $$\n  SELECT identity.moderation_law_of(p_grounds, p_law);\n  WITH recorded AS (\n"],
      ["facts_ciphertext, interim)\n", "facts_ciphertext, interim, law_ref)\n"], ["p_facts, false\n", "p_facts, false, identity.moderation_law_of(p_grounds, p_law)\n"]]));
    for (const fn of [decide, step]) expect([...bodyIn(fn).matchAll(/identity\.close_public_flag_by_review\(/gu)]).toHaveLength(1);
    // The check: ILLEGAL needs a law, nothing else takes one, 3-200 characters once trimmed, by fixed codes.
    const law = whole(SQL, "identity.moderation_law_of(");
    expect(law).toContain("LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    for (const code of ["MODERATION_GROUND_LAW_MISSING", "MODERATION_GROUND_LAW_INVALID"]) expect(law).toContain(`MESSAGE='${code}'`);
    expect(law).toContain("char_length(v_law) NOT BETWEEN 3 AND 200");
    // Staff's door: 0157's body and door plus the law, bound in the proof's body and checked with the ground, before consume_action.
    const body = whole(SQL, "staff.public_review_body_grounded(p_action text,p_command jsonb,p_law text)");
    expect(body).toBe(edited(whole(original, "staff.public_review_body_grounded("), [["(p_action text,p_command jsonb) RETURNS text", "(p_action text,p_command jsonb,p_law text) RETURNS text"],
      ["'facts_sha256',p_command->>'factsSha256')::text)", "'facts_sha256',p_command->>'factsSha256','law',COALESCE(p_law,''))::text)"]]));
    const act = whole(SQL, "staff.public_review_act_grounded(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_content jsonb,p_facts jsonb,p_alert jsonb,p_law text)");
    expect(act).toBe(edited(whole(original, "staff.public_review_act_grounded("), [
      ["p_facts jsonb,p_alert jsonb) RETURNS jsonb", "p_facts jsonb,p_alert jsonb,p_law text) RETURNS jsonb"],
      ["v_facts_sha text;\n", "v_facts_sha text; v_law text;\n"],
      ["staff.public_review_body_grounded(v_action,p_command)", "staff.public_review_body_grounded(v_action,p_command,p_law)"],
      ["MESSAGE='PUBLIC_REVIEW_GROUND_INVALID'; END IF;\n  END IF;\n  PERFORM staff.consume_action", "MESSAGE='PUBLIC_REVIEW_GROUND_INVALID'; END IF;\n    v_law:=identity.moderation_law_of(v_grounds,p_law);\n  END IF;\n  PERFORM staff.consume_action"],
      ["v_operation,v_request_sha);\n  ELSE", "v_operation,v_request_sha,v_law);\n  ELSE"],
      ["v_facts_sha,p_facts);", "v_facts_sha,p_facts,v_law);"]]));
    expect(act.indexOf("identity.moderation_law_of(")).toBeLessThan(act.indexOf("staff.consume_action("));
    // A hide neither checks nor records a law.
    expect(act.slice(act.indexOf("IF v_step='HIDE' THEN"))).toContain("PERFORM identity.record_hide_ground(v_operation,v_target,v_grounds,v_source,v_flag);");
    // The contract pins every new or restated body by its digest.
    for (const fn of [law, decide, step, ground, body, act]) expect(contract, fn.slice(0, 80)).toContain(`'${digest(fn)}'`);
    // The columns and their CHECKs: new rows only.
    for (const table of ["ground", "decision"]) {
      expect(SQL).toContain(`ALTER TABLE identity.moderation_${table} ADD COLUMN IF NOT EXISTS law_ref text;`);
      expect(SQL).toContain(`ADD CONSTRAINT moderation_${table}_law_length CHECK (law_ref IS NULL OR char_length(law_ref) BETWEEN 3 AND 200) NOT VALID;`);
    }
    // R13: a row whose facts are gone passes, so the twelve-month purge can clear an old ILLEGAL row that names no law.
    expect(SQL).toContain("ADD CONSTRAINT moderation_ground_law_required CHECK (NOT ('ILLEGAL' = ANY (grounds)) OR law_ref IS NOT NULL OR interim OR facts_ciphertext IS NULL) NOT VALID;");
    expect(SQL).toContain("ADD CONSTRAINT moderation_decision_law_required CHECK (NOT ('ILLEGAL' = ANY (grounds)) OR law_ref IS NOT NULL OR facts_ciphertext IS NULL) NOT VALID;");
    expect(SQL).toContain("-- R13 (M7 review): NOT VALID only skips the first scan; every later UPDATE of a row is checked");
    // The runtime calls the new door, and no longer the release before's (drained); the twelve-month sweep and the export reader are not restated.
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text) TO debateai_runtime;");
    expect(SQL).toContain("REVOKE EXECUTE ON FUNCTION staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) FROM debateai_runtime;");
    expect(SQL).not.toContain("CREATE OR REPLACE FUNCTION identity.delete_moderation_words_due");
    expect(read("packages/db/src/public-review.ts")).toContain("SELECT staff.public_review_act_grounded($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::text)");
    // The mail stays content-free: its params are flags, dates and links, and the law's words are never read for it.
    const sender = read("apps/api/src/moderation-statements.ts");
    const params = sender.slice(sender.indexOf("export function statementMailParams"), sender.indexOf("\n}\n", sender.indexOf("export function statementMailParams")));
    expect(params).not.toContain(".law");
  });
});
