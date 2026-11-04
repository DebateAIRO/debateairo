import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from "./migration-forward-chain.js";

/**
 * 0156, the small AIs before Start count in the person's quota (V4 start step; plan 2026-11-03 Task 18; drained): one row per call naming the
 * person, the kind, the cost and the time, its writer and readers, and 0144's two readers taught to count it. It pins the objects it creates and
 * the two it redefines; it keeps 0130's verifier.
 */
const NAME = "0156_pre_start_charge.sql";
const VERSION = "pre-start-charge-forward0156-v1";
const MANIFEST_PATH = "lineage/pre-start-charge-forward0156.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0155_owner_answer_writes.sql";
const TABLES = ["identity.pre_start_charge"] as const;
const FUNCTIONS = [
  "identity.guard_pre_start_charge()",
  "identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint)",
  "ledger.refuse_pre_start_spend_outside_writer()",
  "identity.read_pre_start_spent(uuid,timestamptz,timestamptz)",
  "billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)",
  "staff.read_team_internal_spent(timestamptz,timestamptz)",
  "identity.read_data_export_pre_start(uuid,uuid)"
] as const;
/** 0140's and 0144's digests both pin the two readers this step teaches the new kind, so it declares both (0130's route). The manifest carries the same list. */
const READERS = Object.freeze(["billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)", "staff.read_team_internal_spent(timestamptz,timestamptz)"]);
const AMENDS: readonly PostconditionAmendment[] = Object.freeze(["0140_internal_spend_kinds.sql", "0144_ask_clarify_charge.sql"].map((step) =>
  Object.freeze({ step, functions: READERS, field: "function_definition" as const })));
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0156_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/**
 * The 1 table (owner, ACL, columns, constraints, indexes, triggers), the 7 functions (owner, definer, body, ACL), and what it adds to
 * ledger.model_spend, as 0128's: the writer-only trigger (the only barrier for a login whose row security admits a run-less row) and the
 * run-less CHECK. Not the shared source CHECK, which later steps widen.
 */
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
  const trigger = (await client.query(`
    SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
    FROM pg_trigger t WHERE t.tgrelid='ledger.model_spend'::regclass
      AND t.tgname='pre_start_spend_writer_only'`)).rows;
  const check = (await client.query(`
    SELECT k.conname,pg_get_constraintdef(k.oid) definition
    FROM pg_constraint k WHERE k.conrelid='ledger.model_spend'::regclass
      AND k.conname='model_spend_pre_start_is_runless'`)).rows;
  if (trigger.length !== 1 || check.length !== 1) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ tables, functions, trigger, check }));
}

export async function loadForward0156(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
