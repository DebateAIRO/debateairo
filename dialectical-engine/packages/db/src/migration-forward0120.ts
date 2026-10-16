import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * Reply measures (length guidance and repair first, spec 2026-10-15 §3.6, L27, L34; INTERFACE §4) as the chain step after
 * the reclaim resume 0119 (migrations/lineage/README.md): six nullable columns on ledger.raw_artifact and their six CHECKs,
 * and core.read_terminal_recorded_facts(uuid) redefined in place (0049's form; an OK row under the structure-repair key
 * REPAIR:STRUCTURE:<original key> counts like the original key's; pre-flight PF-A44, ruling R8). It adds no billing
 * relation and no billing function, so the effective verifier 0119 keeps in force (0111's) stays in force and is named as
 * its own. Its checks are its postcondition (the six columns' types and nullability, the six CHECKs by name and
 * definition, and the function's owner, SECURITY DEFINER, search_path, volatility, definition digest and ACL), compared
 * on every later migrate(); it has no supplemental verifier, so no replayVerifierSql.
 */
const NAME='0120_reply_measures.sql';
const VERSION='reply-measures-forward0120-v1';
const MANIFEST_PATH='lineage/reply-measures-forward0120.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0120 adds no billing relation or billing function, so it names the verifier in force (0111's, which 0112 to 0120 keep)
const PREVIOUS='0119_reclaim_resume.sql';
const COLUMNS=['actual_words','cached_input_tokens','guided_words','reply_failure_class','reply_form','reply_repairs'] as const;
const CONSTRAINTS=['raw_artifact_actual_words_non_negative','raw_artifact_cached_input_tokens_non_negative','raw_artifact_guided_words_non_negative',
 'raw_artifact_reply_failure_class_known','raw_artifact_reply_form_known','raw_artifact_reply_repairs_code_shaped'] as const;
const FUNCTIONS=['core.read_terminal_recorded_facts(uuid)'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0120_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/**
 * 0120's six columns on ledger.raw_artifact (type, nullability, default), its six CHECKs by name and definition, and the
 * function it redefines (owner, SECURITY DEFINER, search_path, volatility, definition digest and ACL), as 0119 digests its own.
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const columns=(await client.query(`
  SELECT a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_value
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='ledger.raw_artifact'::regclass AND a.attname=ANY($1::text[]) AND NOT a.attisdropped ORDER BY a.attname`,[COLUMNS])).rows;
 if(columns.length!==COLUMNS.length)return fail('POSTCONDITION_OBJECTS');
 const constraints=(await client.query(`
  SELECT k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k
  WHERE k.conrelid='ledger.raw_artifact'::regclass AND k.conname=ANY($1::text[]) ORDER BY k.conname`,[CONSTRAINTS])).rows;
 if(constraints.length!==CONSTRAINTS.length)return fail('POSTCONDITION_OBJECTS');
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({columns,constraints,functions}));
}

export async function loadForward0120(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
