import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/** NETOPIA's migration as the first forward step after dev's 0108 (PR-54; migrations/lineage/README.md). */
const NAME='0109_billing_netopia.sql';
const VERSION='billing-netopia-forward109-v1';
const MANIFEST_PATH='lineage/billing-netopia-forward109.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-109.sql';
const PREVIOUS='0108_preview_recovery_verified_bindings.sql';
const TABLES=['card_token','card_token_revocation','hosted_payment','notice_quarantine','payment_notice','payment_notice_outcome','payment_notice_raw','status_read','tool_order'] as const;
const FUNCTIONS=['billing.purge_expired_records(timestamptz)','billing.purge_revoked_card_tokens(timestamptz)','billing.purge_short_lived(timestamptz)'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD109_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** 0109's tables (owner, kind, grants, columns, constraints, triggers) and its three purges (definition, owner, grants). */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const rows=(await client.query(`
  SELECT 'table' AS kind,c.relname AS name,jsonb_build_object(
    'owner',pg_get_userbyid(c.relowner),'relkind',c.relkind,'rls',c.relrowsecurity,
    'acl',(SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g),
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),
    'triggers',(SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||t.tgfoid::regprocedure::text ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
   ) AS facts
  FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relname=ANY($1::text[])
  UNION ALL
  SELECT 'function',signature,jsonb_build_object(
    'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,
    'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
    'acl',(SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g))
  FROM unnest($2::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature)
  ORDER BY 1,2
 `,[TABLES,FUNCTIONS])).rows;
 if(rows.length!==TABLES.length+FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify(rows));
}

export async function loadForward109(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(MANIFEST_PATH,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','previous','migration','verifier'])||raw.version!==VERSION||raw.baseRecipeSha256!==anchor.baseRecipeSha256
  ||!exactKeys(raw.previous,['name','manifestSha256','verifierSha256'])||raw.previous.name!==PREVIOUS||anchor.previousName!==PREVIOUS
  ||raw.previous.manifestSha256!==anchor.previousManifestSha256||raw.previous.verifierSha256!==anchor.previousVerifierSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==NAME||!digest(raw.migration.sha256)
  ||!exactKeys(raw.verifier,['path','sha256'])||raw.verifier.path!==VERIFIER_PATH||!digest(raw.verifier.sha256))return fail('MANIFEST');
 const sqlBytes=await readFile(new URL(NAME,directory));
 if(sha(sqlBytes)!==raw.migration.sha256)return fail('SOURCE_DIGEST');
 const verifierBytes=await readFile(new URL(VERIFIER_PATH,directory));
 if(sha(verifierBytes)!==raw.verifier.sha256)return fail('VERIFIER_DIGEST');
 return Object.freeze({name:NAME,version:VERSION,manifestSha256:sha(bytes),sourceSha256:raw.migration.sha256,sql:sqlBytes.toString('utf8'),
  previousName:PREVIOUS,previousManifestSha256:anchor.previousManifestSha256,previousVerifierSha256:anchor.previousVerifierSha256,
  verifierPath:VERIFIER_PATH,verifierSha256:raw.verifier.sha256,verifierSql:verifierBytes.toString('utf8'),postconditionEvidence});
}
