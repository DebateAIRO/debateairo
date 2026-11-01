import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationN1Compatibility, auditMigrationReplaySafety, definedFunctionNames, definedRelationNames, type N1AuditContext } from "../../tools/orphan-audit/src/index.js";

/**
 * 0150 (plan 2026-10-31-r22-owner-changes decision 33): a public debate under review. These read the migration's text and the plan: the n1 lines, the amendments, who may call what,
 * that no request role reads the new tables, the insert-only logs, the hide being the only step that may go without the independent alert, the proof's two actions, and the export's filter.
 * What the definers do on real PostgreSQL is tests/integration/public-tree-flow.test.ts's and public-review-http.test.ts's.
 */
const NAME = "0150_public_review.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-review-forward0150.json";
const LOADER_PATH = "packages/db/src/migration-forward0150.ts";
const PREVIOUS = "0149_public_report_team_month.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/public-report-team-month-forward0149.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const escaped = (text: string): string => text.replace(/[.()[\]]/gu, "\\$&");

const RUNTIME = "debateai_runtime";
/** Every role a 0131-to-0149 step takes care to refuse by name, beside PUBLIC. The request-facing roles are all here. */
const ROLES = [RUNTIME, "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker"] as const;

/** The four insert-only records, owned as the rest of identity's public debate tables are. */
const LOGS = ["identity.public_review_event", "identity.public_review_correction", "identity.public_review_detached", "identity.public_review_read"] as const;
/** The notice is claimed and marked delivered, so it is no log; it stays staff's. */
const NOTICE = "staff.public_review_notice";
const TABLES = [...LOGS, NOTICE] as const;
/** The nine the runtime may call, in the file's order. */
const GRANTED = [
  "staff.read_public_review_command(jsonb,text,uuid)",
  "staff.read_public_review(jsonb,text,uuid)",
  "staff.read_public_review_list(jsonb,text)",
  "staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)",
  "staff.claim_public_review_notices(integer)",
  "staff.complete_public_review_notice(uuid,uuid,boolean)",
  "staff.public_review_notice_user(uuid,uuid)",
  "identity.read_public_review_overlay(uuid)",
  "identity.public_review_held(uuid)"
] as const;
const PRIVATE = [
  "identity.public_review_dig_out(uuid)",
  "identity.public_review_row_off(uuid,uuid,uuid,integer)",
  "identity.public_review_report_off(uuid,uuid,timestamptz)",
  "identity.public_review_row_closed(uuid,timestamptz)",
  "identity.public_review_replay(uuid,text)",
  "identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)",
  "core.public_review_snapshot(uuid)",
  "identity.public_review_material(uuid)",
  "identity.public_review_mark_read(uuid,uuid)",
  "identity.public_review_list()",
  "staff.queue_public_review_notices(uuid)",
  "staff.public_review_body(text,jsonb)"
] as const;
const AMENDS = [
  { step: "0137_public_debates.sql", field: "function_definition", functions: ["core.current_publication_of_run(uuid)", "identity.read_public_debate_updates(uuid)", "identity.read_own_public_contributions(uuid,uuid)"] },
  { step: "0138_tree_updates.sql", field: "function_definition", functions: ["identity.path_line_json(uuid,boolean)", "identity.main_answer_updates_json(uuid)", "identity.read_data_export_tree_updates(uuid,uuid)"] },
  { step: "0142_team_limit.sql", field: "function_definition", functions: ["staff.read_audit_page(jsonb,text,integer,timestamptz,uuid)", "staff.owned_action_allowed(jsonb,jsonb)", "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)"] },
  { step: "0147_public_tree.sql", field: "function_definition", functions: ["identity.read_public_dig_parent(uuid,uuid)", "identity.join_public_tree(uuid,uuid,uuid,uuid,text)", "identity.read_public_tree_of_run(uuid)", "identity.read_public_debate_reports(uuid)", "identity.read_public_page_owed(integer)", "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)", "identity.read_public_answer_updates(uuid)"] },
  { step: "0149_public_report_team_month.sql", field: "function_definition", functions: ["identity.read_public_debate_updates(uuid)", "identity.read_public_dig_parent(uuid,uuid)", "identity.join_public_tree(uuid,uuid,uuid,uuid,text)", "identity.read_public_tree_of_run(uuid)"] }
] as const;
/** 0039's reader, before the chain, so no step's receipt declares it. */
const RECIPE_FUNCTION = "core.run_is_published(uuid,uuid)";
const REDEFINED = [...new Set(AMENDS.flatMap((amendment) => amendment.functions as readonly string[]))];

/** A function's text from its CREATE to the `$$;` that closes its body: 0150 writes both `\n$$;` and `END $$;`. */
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("$$;", at));
};
const earlierSteps = (): string[] => readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();

describe("0150: a public debate under review", () => {
  it("follows 0149 as the chain's head, with its own loader, and keeps 0130's verifier", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0150 } from './migration-forward0150.js';");
    expect(chain).toContain("loadForward0148,loadForward0149,loadForward0150,loadForward0151]");
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-review-forward0150-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/public-review-forward0150.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0150_");
    expect(loader).toContain("export async function loadForward0150(");
    for (const table of TABLES) expect(loader, table).toContain(`"${table}"`);
    // The loader's postcondition digests every new function, and 0039's, which no earlier receipt in the chain holds.
    for (const signature of [...GRANTED, ...PRIVATE, RECIPE_FUNCTION]) expect(loader, signature).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-2)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.replayVerifierSql).toBeUndefined();
  });

  it("is bound to 0149's manifest and its own bytes, and the manifest and the plan declare the same amendments", async () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "public-review-forward0150-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: AMENDS
    });
    // The loader refuses a manifest whose list differs from its own, and the plan hands the chain the list.
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-2)!.amendsPostconditionsOf).toEqual(AMENDS);
  });

  it("declares `-- n1: drained` and `-- n1: keeps-verifier`", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("every function it redefines is declared against each step that defined it since the chain began, and nothing else earlier is redefined", () => {
    const sql = code(read(SQL_PATH));
    const definedHere = [...sql.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_]+)\(/gmu)].map((match) => match[1]!);
    expect([...definedHere].sort()).toEqual([...GRANTED, ...PRIVATE, ...REDEFINED, RECIPE_FUNCTION].map(nameOf).sort());
    const lastDefiner = new Map<string, string>();
    for (const step of earlierSteps()) for (const name of definedFunctionNames(read(`migrations/${step}`))) lastDefiner.set(name, step);
    for (const amendment of AMENDS) {
      const defined = definedFunctionNames(read(`migrations/${amendment.step}`));
      for (const signature of amendment.functions) expect([...defined], `${amendment.step} ${signature}`).toContain(nameOf(signature));
    }
    // The newest definer's receipt is the one a replay compares, so it has to be among the declared.
    for (const signature of REDEFINED) {
      const declared = AMENDS.filter((amendment) => (amendment.functions as readonly string[]).includes(signature)).map((amendment) => amendment.step);
      expect(declared, signature).toContain(lastDefiner.get(nameOf(signature)));
    }
    // Before the chain: no step's receipt holds it, so there is nothing to declare.
    expect(lastDefiner.get(nameOf(RECIPE_FUNCTION))).toBe("0039_publication_visibility.sql");
    for (const signature of [...GRANTED, ...PRIVATE]) expect(lastDefiner.has(nameOf(signature)), signature).toBe(false);
    const earlier = earlierSteps().flatMap((step) => [...definedRelationNames(read(`migrations/${step}`))]);
    for (const table of TABLES) expect(earlier, table).not.toContain(table);
  });

  it("passes the replay audit, and the N-1 audit finds nothing a drained step may not do", async () => {
    const sql = read(SQL_PATH);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const step of earlierSteps()) {
      const source = read(`migrations/${step}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("makes exactly five tables; the four logs are insert-only and every table is truncate-guarded", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
    for (const table of LOGS) {
      expect(sql, table).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
    }
    // The file also proves it to itself as it applies.
    expect(sql).toContain("t.tgname='reject_mutation'");
    expect(sql).toContain("'PUBLIC_REVIEW_0150_CONTRACT log %'");
    // The notice is written to as it is claimed, so it has no such trigger: that is the one difference, and the file's own check does not list it.
    expect(sql).not.toContain(`ON ${NOTICE} FOR EACH STATEMENT`);
  });

  it("no request role reads or writes the new tables: nothing grants one, and each role is refused by name", () => {
    const sql = code(read(SQL_PATH));
    // The four go through one owner's loop of revokes; the file's contract block checks the same six roles.
    const loop = /FOREACH v_name IN ARRAY ARRAY\[([^\]]*)\] LOOP\s*EXECUTE pg_catalog\.format\('ALTER TABLE %s OWNER TO %I', v_name, v_owner\);\s*EXECUTE pg_catalog\.format\('REVOKE ALL ON %s FROM ([^']*)', v_name\);/u.exec(sql);
    expect(loop?.[1]?.split(",").map((entry) => entry.replaceAll("'", "").trim())).toEqual([...LOGS]);
    expect(loop?.[2]?.split(",")).toEqual(["PUBLIC", ...ROLES]);
    const checked = /FOREACH v_role IN ARRAY ARRAY\[([^\]]*)\] LOOP\s*IF pg_catalog\.has_table_privilege/u.exec(sql);
    expect(checked?.[1]?.split(",").map((entry) => entry.replaceAll("'", "").trim())).toEqual([...ROLES]);
    expect(sql).toContain(`ALTER TABLE ${NOTICE} OWNER TO debateai_staff_security_owner;`);
    expect(sql).toContain(`REVOKE ALL ON ${NOTICE} FROM PUBLIC, debateai_runtime, debateai_staff_recovery;`);
    // No table grant of any kind in this file.
    expect(sql).not.toMatch(/\bGRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/u);
    // The request code goes through the definers only.
    for (const file of ["apps/api/src/staff/public-review.ts", "packages/db/src/public-review.ts", "packages/db/src/public-debates.ts", "packages/db/src/publication.ts", "apps/api/src/public-tree.ts", "apps/runner/src/public-tree-sources.ts"]) {
      for (const table of TABLES) expect(read(file), `${file} ${table}`).not.toMatch(new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+${escaped(table)}\\b`, "u"));
    }
  });

  it("each new definer has one way in: the runtime for the nine, its owners' neighbours for the rest", () => {
    const sql = code(read(SQL_PATH));
    for (const name of [...GRANTED, ...PRIVATE].map(nameOf)) {
      const head = bodyOf(sql, name).split("AS $$")[0]!;
      expect(head, name).toContain("SET search_path=pg_catalog");
      // The proof's body text reads no table and runs as its caller; everything else is a definer.
      if (name === "staff.public_review_body") expect(head, name).toMatch(/LANGUAGE sql IMMUTABLE SET search_path=pg_catalog/u);
      else expect(head, name).toContain("SECURITY DEFINER");
    }
    const granted = [...sql.matchAll(/^GRANT EXECUTE ON FUNCTION (\S+) TO ([a-z_]+);$/gmu)].map((match) => [match[1], match[2]]);
    expect(granted).toEqual(GRANTED.map((signature) => [signature, RUNTIME]));
    // Only 0039's reader's owner, and the staff door's owner, are let further in; nothing runs a private definer otherwise.
    expect([...sql.matchAll(/GRANT EXECUTE ON FUNCTION [^'\n]*'/gu)].map((match) => match[0])).toEqual([
      "GRANT EXECUTE ON FUNCTION identity.public_review_held(uuid) TO %I'",
      "GRANT EXECUTE ON FUNCTION core.public_review_snapshot(uuid) TO %I,debateai_staff_security_owner'",
      "GRANT EXECUTE ON FUNCTION %s TO debateai_staff_security_owner'"
    ]);
    for (const signature of ["staff.read_public_review_command(jsonb,text,uuid)", "staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)", "staff.queue_public_review_notices(uuid)", "staff.public_review_body(text,jsonb)"]) {
      expect(sql, signature).toContain(`ALTER FUNCTION ${signature} OWNER TO debateai_staff_security_owner;`);
      expect(sql, signature).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,debateai_runtime,debateai_staff_recovery;`);
    }
    // A redefined function keeps its owner and grants: CREATE OR REPLACE keeps them, and the file touches them nowhere.
    for (const signature of [...REDEFINED, RECIPE_FUNCTION]) expect(sql, signature).not.toMatch(new RegExp(`\\b(?:ALTER FUNCTION|REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION) ${escaped(signature)}`, "u"));
  });

  it("a hide is the only step that may go without the independent alert", () => {
    const act = bodyOf(code(read(SQL_PATH)), "staff.public_review_act");
    expect(act).toContain("IF v_step<>'HIDE' AND p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;");
    expect(act.match(/STAFF_ALERT_UNAVAILABLE/gu)).toHaveLength(1);
    // The refusal comes before the proof is spent, and before anything is applied.
    expect(act.indexOf("STAFF_ALERT_UNAVAILABLE")).toBeLessThan(act.indexOf("PERFORM staff.consume_action("));
    expect(act.indexOf("PERFORM staff.consume_action(")).toBeLessThan(act.indexOf("identity.public_review_apply("));
    // A hide with no alert records no mutation that would need one; every other path has it.
    expect(act).toMatch(/IF p_alert IS NOT NULL THEN\s*PERFORM staff\.record_mutation\(v_operation,'PUBLIC_REVIEW_CHANGED'/u);
    // A hide proves its own action, every other step the other one: a hide's proof cannot carry a correction.
    expect(act).toContain("v_action:=CASE WHEN v_step='HIDE' THEN 'PUBLIC_REVIEW_HIDE' ELSE 'PUBLIC_REVIEW_STEP' END;");
    expect(act).toContain("p_binding->>'action' IS DISTINCT FROM v_action");
  });

  it("the proof knows the two actions: begin_owned_webauthn lists them, owned_action_allowed gives them only to the team-limit authority", () => {
    const sql = code(read(SQL_PATH));
    const before = bodyOf(code(read("migrations/0142_team_limit.sql")), "staff.begin_owned_webauthn");
    expect(before).not.toContain("PUBLIC_REVIEW");
    const begin = bodyOf(sql, "staff.begin_owned_webauthn");
    const list = /p_binding->>'action' NOT IN\(([^)]*)\)/u.exec(begin)?.[1]?.split(",").map((entry) => entry.replaceAll("'", ""));
    expect(list).toContain("PUBLIC_REVIEW_HIDE");
    expect(list).toContain("PUBLIC_REVIEW_STEP");
    // Everything the older list held stays.
    const beforeList = /p_binding->>'action' NOT IN\(([^)]*)\)/u.exec(before)?.[1]?.split(",").map((entry) => entry.replaceAll("'", ""));
    expect(beforeList?.length).toBeGreaterThan(0);
    for (const action of beforeList!) expect(list, action).toContain(action);
    expect(list).toHaveLength(beforeList!.length + 2);
    expect(bodyOf(sql, "staff.owned_action_allowed")).toContain("WHEN p_binding->>'action' IN ('TEAM_LIMIT_SET','TEAM_PRACTICE_RECORD','PUBLIC_REVIEW_HIDE','PUBLIC_REVIEW_STEP') THEN staff.authorize_action(p_context,'TEAM_LIMIT_SET')");
    const contract = read("packages/contract/src/staff-access.ts");
    expect(contract).toContain('action: z.literal("PUBLIC_REVIEW_HIDE")');
    expect(contract).toContain('action: z.literal("PUBLIC_REVIEW_STEP")');
  });

  it("the audit log's check gains PUBLIC_REVIEW_CHANGED, and the general audit page does not show it", () => {
    const sql = code(read(SQL_PATH));
    const check = /ADD CONSTRAINT audit_event_funded_event_type_check\s*CHECK\(event_type IN\(([^)]*)\)\)/u.exec(sql)?.[1]?.split(",").map((entry) => entry.replaceAll("'", "").trim());
    expect(check).toContain("PUBLIC_REVIEW_CHANGED");
    expect(check).toContain("TEAM_LIMIT_CHANGED");
    expect(bodyOf(sql, "staff.read_audit_page")).toContain("a.event_type NOT IN('TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED','PUBLIC_REVIEW_CHANGED')");
  });

  // The data export has no run on real PostgreSQL here: no integration test seeds a closed row and reads the export. This reads the text only, so it says the filter is
  // written, not that it is right on a real database.
  it("the export leaves out an answer row a review closed, and the other side of the same rule hides its content", () => {
    const sql = code(read(SQL_PATH));
    const before = bodyOf(code(read("migrations/0138_tree_updates.sql")), "identity.read_data_export_tree_updates");
    expect(before).not.toContain("public_review_row_closed");
    const exported = bodyOf(sql, "identity.read_data_export_tree_updates");
    expect(exported).toMatch(/FROM identity\.main_answer_update AS row_found WHERE row_found\.owner_ref = v_owner_ref\s*AND NOT identity\.public_review_row_closed\(row_found\.trigger_run_id, row_found\.recorded_at\)/u);
    // The lease still comes first, and the owner is still the lease's.
    expect(exported.indexOf("identity.data_export_lease_user(p_export_id, p_worker)")).toBeLessThan(exported.indexOf("public_review_row_closed"));
    // The readers of 0138 give a closed row no content.
    expect(bodyOf(sql, "identity.main_answer_updates_json")).toContain("CASE WHEN identity.public_review_row_closed(row_found.trigger_run_id, row_found.recorded_at) THEN NULL ELSE row_found.content");
    expect(bodyOf(sql, "identity.path_line_json")).toContain("CASE WHEN COALESCE(closed.shut, false) THEN NULL ELSE path_update.content_ciphertext END");
  });

  it("a held debate is not published, and only a person's act ends the hold: no timer reads the log", () => {
    const sql = code(read(SQL_PATH));
    expect(bodyOf(sql, "core.run_is_published")).toContain("identity.public_review_held");
    expect(bodyOf(sql, "core.current_publication_of_run")).toContain("identity.public_review_held");
    const held = bodyOf(sql, "identity.public_review_held");
    expect(held).toContain("identity.public_review_event");
    expect(held).not.toMatch(/\b(?:clock_timestamp|now|statement_timestamp|interval)\b/u);
  });

  it("discloses its grants, lists its loader, and is documented truthfully as drained with what it amends", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH);
    expect(declared.map(({ roleName, grants }) => [roleName, grants])).toEqual([[RUNTIME, GRANTED.map((signature) => `EXECUTE ON FUNCTION ${signature}`)]]);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0150, below) the fortieth");
    const heading = "## A public debate under review (0150)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["fortieth", NAME, "public-review-forward0150.json", LOADER_PATH, "`loadForward0150`", "MIGRATION_FORWARD0150_",
      "-- n1: drained", "-- n1: keeps-verifier", "amendsPostconditionsOf", "PUBLIC_REVIEW_CHANGED", "core.run_is_published", ...TABLES, ...AMENDS.map((amendment) => amendment.step.slice(0, 4))]) expect(section, needle).toContain(needle);
    for (const name of REDEFINED.map(nameOf)) expect(section, name).toContain(`\`${name.slice(name.indexOf(".") + 1)}\``);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(`\`migrations/${NAME}\` (after \`${PREVIOUS}\`, \`n1: drained\`)`);
  });
});
