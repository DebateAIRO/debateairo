import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * A sign-up not finished within 24 hours is deleted (owner's goal of 2026-11-11): the chain step after 0182, the MFA
 * recovery control user index (migrations/lineage/README.md); built as 0176 and renumbered after the steps dev had by then. One new table (the key files still to be destroyed) and four new functions, the
 * cross-account marker's alone; nothing earlier is redefined. If another step takes 0183 first, this step takes the next free
 * number and its `previous` is re-chained to the step then last, as the README's renumber recipe says. It adds no billing object, so 0130's verifier
 * stays in force; no supplemental verifier, so no replayVerifierSql: its checks are its postcondition digest (the table's columns,
 * constraints and ACL, and the four functions whole), which every later migrate() compares.
 */
const NAME='0183_unfinished_signup_expiry.sql';
const VERSION='unfinished-signup-expiry-forward0183-v1';
const MANIFEST_PATH='lineage/unfinished-signup-expiry-forward0183.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-130.sql';
const PREVIOUS='0182_mfa_recovery_control_user_started.sql';
const TABLES=['identity.unfinished_signup_key_cleanup'] as const;
const FUNCTIONS=['identity.complete_unfinished_signup_key_cleanup(uuid)','identity.expire_unfinished_signup(uuid)',
 'identity.read_unfinished_signup_key_cleanup(integer)','identity.read_unfinished_signups_due(integer)'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0183_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const acl=(oid:string,kind:string,owner:string)=>`(SELECT jsonb_agg(g.item ORDER BY g.item COLLATE "C") FROM (SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(${oid},acldefault('${kind}',${owner}))) a) g)`;

async function postconditionEvidence(client:PoolClient):Promise<string>{
 const tables=(await client.query(`
  SELECT relation,pg_get_userbyid(c.relowner)::text owner,c.relrowsecurity rls,${acl('c.relacl','r','c.relowner')} acl,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname::text,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
   (SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname COLLATE "C") FROM pg_constraint k WHERE k.conrelid=c.oid) constraints
  FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='r' ORDER BY relation COLLATE "C"`,[TABLES])).rows;
 if(tables.length!==TABLES.length)return fail('POSTCONDITION_OBJECTS');
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner)::text owner,p.prosecdef definer,p.proconfig config,p.provolatile::text volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,${acl('p.proacl','f','p.proowner')} acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature COLLATE "C"`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({tables,functions}));
}

export async function loadForward0183(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
