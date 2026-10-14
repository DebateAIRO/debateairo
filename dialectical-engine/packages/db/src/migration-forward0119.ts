import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * A debate taken over after a crash (spec 2026-10-14-reclaim-resume-design, "The database change") as the chain step
 * after the language check's site cost 0117 (migrations/lineage/README.md). The runtime may set a node aside
 * (generation_status 'stale', one way, nothing else in the row), and an answer's map root moves from a stale root to a
 * live one in a new append-only table, core.map_position_repoint (core.map_position itself is 0116's, digested by 0116's
 * postcondition, so it is not touched). It adds no billing relation and no billing function, so the effective verifier
 * 0117 keeps in force (0111's) stays in force and is named as its own. Its checks are its postcondition (below),
 * compared on every later migrate(); it has no supplemental verifier, so no replayVerifierSql.
 */
const NAME='0119_reclaim_resume.sql';
const VERSION='reclaim-resume-forward0119-v1';
const MANIFEST_PATH='lineage/reclaim-resume-forward0119.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0119 adds no billing relation or function, so it names the verifier in force (0111's, which 0112 to 0117 keep)
const PREVIOUS='0117_language_check_spend.sql';
const FUNCTIONS=['core.enforce_map_position_repoint()','core.reject_node_mutation_except_retire()'] as const;
const NODE_TRIGGERS=['reject_mutation','reject_mutation_except_retire'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0119_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/**
 * 0119's two trigger functions (owner, SECURITY DEFINER or not, search_path, volatility, definition digest and ACL);
 * core.node's guard triggers by name (0000's reject_mutation must stay ABSENT, reject_mutation_except_retire present:
 * name, enabled state, definition) and the runtime's column grants on core.node (UPDATE on generation_status only) and
 * its table grants there (no DELETE); and core.map_position_repoint whole (owner, ACL, columns, constraints, indexes,
 * triggers, rules), as 0116 digests its own tables.
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 const nodeTriggers=(await client.query(`
  SELECT t.tgname,t.tgenabled::text enabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t
  WHERE t.tgrelid='core.node'::regclass AND NOT t.tgisinternal AND t.tgname=ANY($1::text[]) ORDER BY t.tgname`,[NODE_TRIGGERS])).rows;
 if(nodeTriggers.length!==1||nodeTriggers[0]?.tgname!=='reject_mutation_except_retire')return fail('POSTCONDITION_OBJECTS');
 const nodeRights=(await client.query(`
  SELECT
   (SELECT jsonb_agg(a.attname||':'||a.attacl::text ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid='core.node'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL) column_acl,
   has_table_privilege('debateai_runtime','core.node','UPDATE') runtime_table_update,
   has_table_privilege('debateai_runtime','core.node','DELETE') runtime_delete,
   has_column_privilege('debateai_runtime','core.node','generation_status','UPDATE') runtime_retire`)).rows;
 if(nodeRights[0]?.runtime_retire!==true||nodeRights[0]?.runtime_table_update!==false||nodeRights[0]?.runtime_delete!==false)return fail('POSTCONDITION_OBJECTS');
 const tables=(await client.query(`
  SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
   (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
   (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
   (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,
   (SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class=c.oid) rules
  FROM pg_class c WHERE c.oid=to_regclass('core.map_position_repoint')`)).rows;
 if(tables.length!==1)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({functions,nodeTriggers,nodeRights,tables}));
}

export async function loadForward0119(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
