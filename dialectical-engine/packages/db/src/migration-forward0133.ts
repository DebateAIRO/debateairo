import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0133, investigations (R22; plan 2026-10-30 task W1-3): a debate and its digs as one budget unit, its closings by
 * report version, the server-side dig parent and the person's one reserve; the page texts' wipe on closing and after 30
 * days without activity. It pins only the objects it creates; 0132 and earlier retain their own postconditions; it
 * keeps 0130's verifier.
 */
const NAME = "0133_investigations.sql";
const VERSION = "investigations-forward0133-v1";
const MANIFEST_PATH = "lineage/investigations-forward0133.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0132_web_evidence.sql";
const TABLES = ["identity.investigation", "identity.investigation_member", "identity.investigation_closing", "identity.investigation_reserve_event"] as const;
const FUNCTIONS = [
  "identity.guard_investigation_record()",
  "identity.open_investigation(uuid,uuid)",
  "identity.join_investigation(uuid,uuid,uuid,text[],text)",
  "identity.touch_investigation(uuid,uuid)",
  "identity.wipe_investigation_page_text(uuid)",
  "identity.close_investigation(uuid,uuid)",
  "identity.reopen_investigation(uuid,uuid)",
  "identity.read_investigation(uuid,uuid)",
  "identity.investigation_json(uuid)",
  "identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)",
  "identity.read_reserve(uuid)",
  "identity.read_investigation_of_run(uuid)",
  "identity.record_investigation_report(uuid,integer,uuid)",
  "identity.wipe_inactive_web_page_text(integer)",
  "identity.forget_erased_debate_investigation(uuid)",
  "identity.read_data_export_investigations(uuid,uuid)"
] as const;
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0133_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The 4 tables (owner, ACL, columns, constraints, indexes, triggers) and the 16 functions (owner, definer, body, ACL). */
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

export async function loadForward0133(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
