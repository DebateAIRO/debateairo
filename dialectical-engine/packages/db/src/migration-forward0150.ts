import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0150, a public debate under review (R22, decision 33; drained): the log, the corrections, the notices, their definers, and the readers that now read the log, each redefined in place and declared as an amendment of its step.
 */
const NAME = "0150_public_review.sql";
const VERSION = "public-review-forward0150-v1";
const MANIFEST_PATH = "lineage/public-review-forward0150.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0149_public_report_team_month.sql";
const TABLES: readonly string[] = ["identity.public_review_event", "identity.public_review_correction", "identity.public_review_detached", "identity.public_review_read", "staff.public_review_notice"];
const FUNCTIONS: readonly string[] = ["identity.public_review_held(uuid)", "identity.public_review_dig_out(uuid)", "identity.public_review_row_off(uuid,uuid,uuid,integer)", "identity.public_review_report_off(uuid,uuid,timestamptz)", "identity.public_review_row_closed(uuid,timestamptz)", "identity.read_public_review_overlay(uuid)", "identity.public_review_replay(uuid,text)", "identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)", "core.public_review_snapshot(uuid)", "identity.public_review_material(uuid)", "identity.public_review_mark_read(uuid,uuid)", "identity.public_review_list()", "staff.queue_public_review_notices(uuid)", "staff.claim_public_review_notices(integer)", "staff.complete_public_review_notice(uuid,uuid,boolean)", "staff.public_review_notice_user(uuid,uuid)", "staff.read_public_review_command(jsonb,text,uuid)", "staff.read_public_review(jsonb,text,uuid)", "staff.read_public_review_list(jsonb,text)", "staff.public_review_body(text,jsonb)", "staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)", "core.run_is_published(uuid,uuid)"];
const AMENDS = [
  { step: "0137_public_debates.sql", field: "function_definition" as const, functions: ["core.current_publication_of_run(uuid)", "identity.read_public_debate_updates(uuid)", "identity.read_own_public_contributions(uuid,uuid)"] },
  { step: "0138_tree_updates.sql", field: "function_definition" as const, functions: ["identity.path_line_json(uuid,boolean)", "identity.main_answer_updates_json(uuid)", "identity.read_data_export_tree_updates(uuid,uuid)"] },
  { step: "0142_team_limit.sql", field: "function_definition" as const, functions: ["staff.read_audit_page(jsonb,text,integer,timestamptz,uuid)", "staff.owned_action_allowed(jsonb,jsonb)", "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)"] },
  { step: "0147_public_tree.sql", field: "function_definition" as const, functions: ["identity.read_public_dig_parent(uuid,uuid)", "identity.join_public_tree(uuid,uuid,uuid,uuid,text)", "identity.read_public_tree_of_run(uuid)", "identity.read_public_debate_reports(uuid)", "identity.read_public_page_owed(integer)", "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)", "identity.read_public_answer_updates(uuid)"] },
  { step: "0149_public_report_team_month.sql", field: "function_definition" as const, functions: ["identity.read_public_debate_updates(uuid)", "identity.read_public_dig_parent(uuid,uuid)", "identity.join_public_tree(uuid,uuid,uuid,uuid,text)", "identity.read_public_tree_of_run(uuid)"] }
];
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0150_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The tables (owner, ACL, columns, constraints, indexes, triggers) and the functions (owner, definer, body, ACL). */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const tables = (await client.query(`
    SELECT relation,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
      (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
      (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
      (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers
    FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) ORDER BY relation`, [TABLES])).rows;
  if (tables.length !== TABLES.length) return fail("POSTCONDITION_OBJECTS");
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ tables, functions }));
}

export async function loadForward0150(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
  const directory = new URL("../../../migrations/", import.meta.url);
  const bytes = await readFile(new URL(MANIFEST_PATH, directory));
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (!exactKeys(raw, ["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"])
    || raw.version !== VERSION || raw.baseRecipeSha256 !== anchor.baseRecipeSha256
    || !exactKeys(raw.previous, ["name", "manifestSha256", "verifierSha256"])
    || raw.previous.name !== PREVIOUS || anchor.previousName !== PREVIOUS
    || raw.previous.manifestSha256 !== anchor.previousManifestSha256
    || raw.previous.verifierSha256 !== anchor.previousVerifierSha256
    || !exactKeys(raw.migration, ["name", "sha256"]) || raw.migration.name !== NAME
    || !digest(raw.migration.sha256)
    || !exactKeys(raw.verifier, ["path", "sha256"]) || raw.verifier.path !== VERIFIER_PATH
    || !digest(raw.verifier.sha256) || JSON.stringify(raw.amendsPostconditionsOf) !== JSON.stringify(AMENDS)) return fail("MANIFEST");
  const sqlBytes = await readFile(new URL(NAME, directory));
  if (sha(sqlBytes) !== raw.migration.sha256) return fail("SOURCE_DIGEST");
  const verifierBytes = await readFile(new URL(VERIFIER_PATH, directory));
  if (sha(verifierBytes) !== raw.verifier.sha256) return fail("VERIFIER_DIGEST");
  return Object.freeze({
    name: NAME, version: VERSION, manifestSha256: sha(bytes), sourceSha256: raw.migration.sha256,
    sql: sqlBytes.toString("utf8"), previousName: PREVIOUS,
    previousManifestSha256: anchor.previousManifestSha256,
    previousVerifierSha256: anchor.previousVerifierSha256,
    verifierPath: VERIFIER_PATH, verifierSha256: raw.verifier.sha256,
    verifierSql: verifierBytes.toString("utf8"), postconditionEvidence, amendsPostconditionsOf: AMENDS
  });
}
