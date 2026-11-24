import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0186, the preview's approved buyers (expand; migrations/lineage/README.md "The preview's approved buyers (0186)"): one
 * append-only table of changes, staff.preview_buyer_event, and the functions around it: the yes or no the API asks at
 * the pay button, the Owner's list, the one door that adds or removes an account under the Owner's hardware-key proof
 * (made under the existing action TEAM_GRANT, its meaning in the body digest the door computes again), and 0150's audit
 * page beside itself with the list's two events left out. staff.audit_event's event list only widens (a reviewed
 * DROP/ADD ... NOT VALID pair). No billing relation or function is added, so it names 0130's verifier as its own and has
 * no replayVerifierSql: its checks are its postcondition (below), compared on every later migrate().
 */
const NAME = "0186_preview_buyers.sql";
const VERSION = "preview-buyers-forward0186-v1";
const MANIFEST_PATH = "lineage/preview-buyers-forward0186.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0185_release_history.sql";
/** The five functions the step creates, each digested whole (owner, definer, settings, volatility, body and ACL). */
const FUNCTIONS: readonly string[] = [
  "staff.preview_buyer_listed(uuid)",
  "staff.preview_buyer_body(jsonb)",
  "staff.read_preview_buyers(jsonb,text)",
  "staff.preview_buyer_act(jsonb,uuid,jsonb,jsonb,jsonb)",
  "staff.read_audit_page_v2(jsonb,text,integer,timestamptz,uuid)"
];
/** The one table the step creates, digested whole (owner, ACL, columns, constraints, indexes, triggers, rules). */
const TABLES: readonly string[] = ["staff.preview_buyer_event"];
/** The one constraint of an earlier table the step widens, by name and definition. */
const CONSTRAINTS: readonly (readonly [table: string, name: string])[] = [["staff.audit_event", "audit_event_funded_event_type_check"]];
const AMENDS: readonly never[] = [];
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0186_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The five functions, the table and the widened event list, each whole: a changed body, owner, grant, column, constraint, index or trigger moves the digest. */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  const tables = (await client.query(`
    SELECT relation,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
      (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
      (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
      (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,
      (SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class=c.oid) rules
    FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='r' ORDER BY relation`, [TABLES])).rows;
  if (tables.length !== TABLES.length) return fail("POSTCONDITION_OBJECTS");
  const constraints = (await client.query(`
    SELECT x.relation,x.name,pg_get_constraintdef(k.oid) definition
    FROM jsonb_to_recordset($1::jsonb) AS x(relation text,name text)
    JOIN pg_constraint k ON k.conrelid=to_regclass(x.relation) AND k.conname=x.name ORDER BY x.relation,x.name`,
  [JSON.stringify(CONSTRAINTS.map(([relation, name]) => ({ relation, name })))])).rows;
  if (constraints.length !== CONSTRAINTS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ functions, tables, constraints }));
}

export async function loadForward0186(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
