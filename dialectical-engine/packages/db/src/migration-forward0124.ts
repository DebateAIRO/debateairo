import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/** The publication review's own objects are pinned; shared source and tombstone lists remain extendable. */
const NAME = "0124_publication_review.sql";
const VERSION = "publication-review-forward0124-v1";
const MANIFEST_PATH = "lineage/publication-review-forward0124.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-111.sql";
const PREVIOUS = "0123_synthesis_check.sql";
const TABLES = [
  "serve.publication_review_request", "serve.publication_review_decision",
  "serve.publication_review_copy", "staff.publication_review_event"
] as const;
const FUNCTIONS = [
  "core.enforce_publication_review_answer_run()",
  "core.enforce_erasure_barrier_publication_review_request()",
  "core.enforce_content_attestation_v2_publication_review_decision()",
  "core.enforce_content_ciphertext_publication_review_decision()",
  "core.enforce_erasure_barrier_publication_review_decision()",
  "core.enforce_content_attestation_v2_publication_review_copy()",
  "core.enforce_content_ciphertext_publication_review_copy()",
  "core.enforce_erasure_barrier_publication_review_copy()",
  "serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)",
  "serve.read_publication_review_state(uuid,uuid,uuid)",
  "serve.publication_review_approved(uuid,uuid,integer)",
  "serve.sever_publication_review(uuid)",
  "serve.sever_publication_review_on_secret_delete()",
  "serve.sever_publication_review_on_cleanup_intent()",
  "staff.list_publication_reviews(jsonb,text,integer)",
  "staff.open_publication_review(jsonb,text,uuid,text)",
  "staff.record_publication_review_copy(jsonb,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea)",
  "staff.decide_publication_review(jsonb,text,uuid,jsonb,uuid,text,jsonb,jsonb,bytea)",
  "serve.publication_review_run_live(uuid)"
] as const;
const TRIGGER_HOSTS = [
  "core.run_content_attestation_secret", "serve.private_run_key_cleanup_intent"
] as const;
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0124_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

async function postconditionEvidence(client: PoolClient): Promise<string> {
  const tables = (await client.query(`
    SELECT relation,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
      (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
      (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
      (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,
      (SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class=c.oid) rules
    FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) ORDER BY relation`, [TABLES])).rows;
  if (tables.length !== TABLES.length) return fail("POSTCONDITION_OBJECTS");
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  const triggers = (await client.query(`
    SELECT host,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
    FROM unnest($1::text[]) host
    JOIN pg_trigger t ON t.tgrelid=to_regclass(host) AND t.tgname='zz_sever_publication_review'
    ORDER BY host`, [TRIGGER_HOSTS])).rows;
  if (triggers.length !== TRIGGER_HOSTS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ tables, functions, triggers }));
}

export async function loadForward0124(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
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
