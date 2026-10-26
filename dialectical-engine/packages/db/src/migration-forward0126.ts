import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/** S05 retires persisted support conversations and model-call records. */
const NAME='0126_support_answer_scope.sql';
const VERSION='support-answer-scope-forward0126-v1';
const MANIFEST_PATH='lineage/support-answer-scope-forward0126.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql';
const PREVIOUS='0125_threat_reports.sql';
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0126_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** The effective definition is compared on every later migrate(), including after S06. */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const grants=(await client.query(`
  SELECT c.relname name,
   has_table_privilege('debateai_support',c.oid,'SELECT') "select",
   has_table_privilege('debateai_support',c.oid,'INSERT') "insert",
   has_table_privilege('debateai_support',c.oid,'UPDATE') "update",
   has_table_privilege('debateai_support',c.oid,'DELETE') "delete"
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='support' AND c.relkind='r' ORDER BY c.relname`)).rows;
 const guards=(await client.query(`
  SELECT c.relname relation,t.tgname name,t.tgfoid::regprocedure function_name,
    t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='support' AND c.relkind='r' AND NOT t.tgisinternal
   AND t.tgname IN ('reject_mutation','reject_delete','reject_truncate','support_shred_row_guard')
  ORDER BY c.relname,t.tgname`)).rows;
 if(grants.length<17||guards.length<37)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({grants,guards}));
}

export async function loadForward0126(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
