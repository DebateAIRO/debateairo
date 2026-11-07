import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0134, the new dig model and the month pause (R22; plan 2026-10-30 dig-model revision task W2-8 and its money rule of
 * 31 Oct): each dig's level (at most 10) and the nested join that refuses an eleventh, the path rewrite's turns and its
 * encrypted rewrites, the search planner's decision for each path (W3-3's request), the month pause of a running debate, and the spend source PATH_REWRITE. It pins only the objects
 * it creates (not 0074's shared spend-source list, which later steps widen again, nor 0133's member table, which it does
 * not alter); 0133 and earlier retain their own postconditions; it keeps 0130's verifier.
 */
const NAME = "0134_dig_model_and_month_pause.sql";
const VERSION = "dig-model-forward0134-v1";
const MANIFEST_PATH = "lineage/dig-model-forward0134.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0133_investigations.sql";
const TABLES = ["identity.investigation_dig_level", "identity.path_rewrite_turn", "identity.path_rewrite", "identity.web_plan_path",
  "identity.run_pause_event"] as const;
const FUNCTIONS = [
  "identity.enforce_path_rewrite_content()",
  "identity.guard_dig_model_record()",
  "identity.investigation_member_dig_level(uuid)",
  "identity.join_investigation_nested(uuid,uuid,uuid,text[],text)",
  "identity.read_dig_level(uuid,uuid)",
  "identity.read_investigation_dig_levels(uuid,uuid)",
  "identity.read_dig_level_of_run(uuid)",
  "identity.take_path_rewrite_turn(uuid,uuid,text)",
  "identity.read_path_rewrite_turn(uuid)",
  "identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.path_rewrite_entry_json(identity.path_rewrite_turn)",
  "identity.path_rewrites_json(uuid)",
  "identity.read_path_rewrites_of_run(uuid)",
  "identity.read_path_rewrites(uuid,uuid)",
  "identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)",
  "identity.read_web_plan(uuid)",
  "identity.run_pause_json(uuid)",
  "identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)",
  "identity.read_run_pause_of_run(uuid)",
  "identity.resume_paused_run(uuid,uuid)",
  "identity.read_run_pause(uuid,uuid)",
  "identity.read_paused_runs(uuid)",
  "identity.forget_erased_debate_dig_model(uuid)",
  "identity.read_data_export_dig_model(uuid,uuid)"
] as const;
/** The rewrite's own run rule on ledger.model_spend (the shared source list is 0074's, widened by later steps too). */
const OWN_CONSTRAINT = "model_spend_path_rewrite_names_its_run";
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0134_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The 5 tables (owner, ACL, columns, constraints, indexes, triggers), the 24 functions (owner, definer, body, ACL) and its own spend CHECK. */
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
  const check = (await client.query(`
    SELECT k.conname,k.contype,pg_get_expr(k.conbin,k.conrelid) expression
    FROM pg_constraint k WHERE k.conrelid='ledger.model_spend'::regclass AND k.conname=$1`, [OWN_CONSTRAINT])).rows;
  if (check.length !== 1) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ tables, functions, check }));
}

export async function loadForward0134(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
