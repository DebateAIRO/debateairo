import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * The engine verdict (engine redesign R2, spec 2026-10-15 §4.2b, §4.9; INTERFACE §8.7, §9.5-§9.7, §14) as the chain
 * step after the reply measures' 0120 (migrations/lineage/README.md): two append-only content carriers
 * (ledger.point_investigation, ledger.verdict_vote), their four guard functions, and four CHECKs re-added on older serve
 * tables. It adds no billing relation and no billing function, so the effective verifier 0120 keeps in force (0111's)
 * stays in force and is named as its own. Its postcondition, compared on every later migrate(), is the two tables whole
 * and the four functions (definition digest and ACL). The four re-added CHECKs sit on tables older steps own and that a
 * later step may need to widen again, so they are checked by the file's own closing block and pinned by tests, not
 * digested here. It has no supplemental verifier, so no replayVerifierSql.
 */
const NAME='0121_engine_verdict.sql';
const VERSION='engine-verdict-forward0121-v1';
const MANIFEST_PATH='lineage/engine-verdict-forward0121.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0121 adds no billing relation or function, so it names the verifier in force (0111's, which 0112 to 0120 keep)
const PREVIOUS='0120_reply_measures.sql';
const TABLES=['ledger.point_investigation','ledger.verdict_vote'] as const;
const FUNCTIONS=[
 'core.enforce_content_attestation_v2_point_investigation()','core.enforce_content_attestation_v2_verdict_vote()',
 'core.enforce_content_ciphertext_point_investigation()','core.enforce_content_ciphertext_verdict_vote()'
] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0121_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** 0121's two tables (owner, ACL, columns, constraints, indexes, triggers, rules) and its four functions (definition digest and ACL). */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 const tables=(await client.query(`
  SELECT relation,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
   (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
   (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
   (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,
   (SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class=c.oid) rules
  FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) ORDER BY relation`,[TABLES])).rows;
 if(tables.length!==TABLES.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({functions,tables}));
}

export async function loadForward0121(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
