import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * The fast language check's site cost (question-language spec 2026-10-13, plan 2026-10-13-debate-shape-phase2-language
 * Task 19) as the chain step after the debate shape's map 0116 (migrations/lineage/README.md). It adds no billing
 * relation and no billing function, so the effective verifier 0116 keeps in force (0111's) stays in force and is named
 * as its own. Its checks are its postcondition (the one writer's definition, owner, rights and ACL, and the two CHECKs
 * on ledger.model_spend), compared on every later migrate(); it has no supplemental verifier, so no replayVerifierSql.
 */
const NAME='0117_language_check_spend.sql';
const VERSION='language-check-spend-forward0117-v1';
const MANIFEST_PATH='lineage/language-check-spend-forward0117.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0117 adds no billing relation or function, so it names the verifier in force (0111's, which 0112 to 0116 keep)
const PREVIOUS='0116_debate_shape_map.sql';
const FUNCTIONS=['ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)'] as const;
const CONSTRAINTS=['model_spend_language_check_is_runless','model_spend_spend_source_check'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0117_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/**
 * 0117's writer (owner, SECURITY DEFINER, its search_path, volatility, definition digest and ACL) and the two CHECKs it
 * puts on ledger.model_spend (the widened source list and the run-less LANGUAGE_CHECK row), by name and definition.
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 const constraints=(await client.query(`
  SELECT k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k
  WHERE k.conrelid='ledger.model_spend'::regclass AND k.conname=ANY($1::text[]) ORDER BY k.conname`,[CONSTRAINTS])).rows;
 if(constraints.length!==CONSTRAINTS.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({functions,constraints}));
}

export async function loadForward0117(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
