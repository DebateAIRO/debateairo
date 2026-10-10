import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * Part C's migration (spec 2026-10-05 §2.16, prices in RON, EUR and USD) as the chain step after 0111
 * (migrations/lineage/README.md). It adds no billing relation and no function, so 0111's verifier stays in force and is
 * named as its own. Its working number is 0113; it is renumbered and re-chained at merge time if dev moved (§2.16.6).
 */
const NAME='0113_billing_price_currencies.sql';
const VERSION='billing-price-currencies-forward0113-v1';
const MANIFEST_PATH='lineage/billing-price-currencies-forward0113.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql';
const PREVIOUS='0111_billing_netopia.sql';
const CONSTRAINTS=['charge_currency_known','quote_currency_known','subscription_event_created_currency_known'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0113_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** What the step creates: billing.quote's currency column and the definitions of its three CHECKs. */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const rows=(await client.query(`
  SELECT 'column' AS kind,a.attname::text AS name,jsonb_build_object(
    'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',a.atthasdef) AS facts
  FROM pg_attribute a WHERE a.attrelid='billing.quote'::regclass AND a.attname='currency' AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'constraint',k.conname::text,jsonb_build_object('relation',k.conrelid::regclass::text,'definition',pg_get_constraintdef(k.oid))
  FROM pg_constraint k
  WHERE k.conrelid IN ('billing.quote'::regclass,'billing.charge'::regclass,'billing.subscription_event'::regclass)
   AND k.conname=ANY($1::text[])
  ORDER BY 1,2
 `,[CONSTRAINTS])).rows as Array<{kind:string}>;
 if(rows.filter(row=>row.kind==='column').length!==1||rows.filter(row=>row.kind==='constraint').length!==CONSTRAINTS.length){
  return fail('POSTCONDITION_OBJECTS');
 }
 return sha(JSON.stringify(rows));
}

export async function loadForward0113(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
