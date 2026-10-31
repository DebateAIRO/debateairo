import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0147, the public tree (R22, decisions 13 and 22): digs, checks, reports and the page on the publication, whoever is still here. Seven tables and their
 * definers; no earlier object changes; it keeps 0130's verifier.
 */
const NAME = "0147_public_tree.sql";
const VERSION = "public-tree-forward0147-v1";
const MANIFEST_PATH = "lineage/public-tree-forward0147.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0145_web_researched_unsettled.sql";
const TABLES: readonly string[] = ["identity.public_material", "identity.public_dig_input", "identity.public_contribution_check", "identity.public_climb_done", "identity.public_answer_update", "identity.public_report", "identity.public_debate_report", "identity.public_page_skip"];
const FUNCTIONS: readonly string[] = [
  "identity.guard_public_tree_record()",
  "identity.public_tree_ongoing(uuid)",
  "identity.read_public_dig_parent(uuid,uuid)",
  "identity.join_public_tree(uuid,uuid,uuid,uuid,text)",
  "identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)",
  "identity.open_public_report(uuid,uuid,uuid,boolean)",
  "identity.read_public_tree_of_run(uuid)",
  "identity.read_public_material(uuid)",
  "identity.record_public_dig_input(uuid,text,jsonb,bytea)",
  "identity.read_public_dig_input(uuid)",
  "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)",
  "identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.read_public_path_line(uuid)",
  "identity.read_public_climb_next(uuid)",
  "identity.record_public_check_passed(uuid,uuid)",
  "identity.read_public_digs_unsettled(timestamptz,integer)",
  "identity.read_public_climbs_owed(integer)",
  "identity.mark_public_climb_done(uuid)",
  "identity.read_public_answer_updates(uuid)",
  "identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)",
  "identity.read_public_reports_unwritten(integer)",
  "identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)",
  "identity.read_public_report_charged_until(uuid)",
  "identity.read_public_checks_passed(integer)",
  "identity.read_public_page_owed(integer)",
  "identity.read_public_reports_owed(integer)",
  "identity.record_public_debate_report(uuid,integer,uuid,jsonb)",
  "identity.read_public_debate_reports(uuid)",
  "identity.record_public_page_skip(uuid,uuid,text,text)",
  "identity.read_free_debate_owner(uuid)",
  "identity.forget_erased_debate_public_tree(uuid)",
  "identity.read_data_export_public_tree(uuid,uuid)"
];
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0147_${detail}`); };
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

export async function loadForward0147(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
  const directory = new URL("../../../migrations/", import.meta.url);
  const bytes = await readFile(new URL(MANIFEST_PATH, directory));
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (!exactKeys(raw, ["version", "baseRecipeSha256", "previous", "migration", "verifier"])
    || raw.version !== VERSION || raw.baseRecipeSha256 !== anchor.baseRecipeSha256
    || !exactKeys(raw.previous, ["name", "manifestSha256", "verifierSha256"])
    || raw.previous.name !== PREVIOUS || anchor.previousName !== PREVIOUS
    || raw.previous.manifestSha256 !== anchor.previousManifestSha256
    || raw.previous.verifierSha256 !== anchor.previousVerifierSha256
    || !exactKeys(raw.migration, ["name", "sha256"]) || raw.migration.name !== NAME
    || !digest(raw.migration.sha256)
    || !exactKeys(raw.verifier, ["path", "sha256"]) || raw.verifier.path !== VERIFIER_PATH
    || !digest(raw.verifier.sha256)) return fail("MANIFEST");
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
    verifierSql: verifierBytes.toString("utf8"), postconditionEvidence
  });
}
