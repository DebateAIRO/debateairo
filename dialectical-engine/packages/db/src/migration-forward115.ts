import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/** The data export as the chain step after role rotation's 0114 (mission data-export S01, V-41; migrations/lineage/README.md). */
const NAME='0115_data_export.sql';
const VERSION='data-export-forward115-v1';
const MANIFEST_PATH='lineage/data-export-forward115.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0115 adds no billing relation or function, so it names the verifier in force (0111's, which 0112, 0113 and 0114 keep)
const PREVIOUS='0114_role_rotation.sql';
const FUNCTIONS=[
 'identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamp with time zone,uuid,text,text,uuid,timestamp with time zone)',
 'identity.valid_consumer_authorization_internal(jsonb)',
 'identity.request_data_export(uuid,uuid,text,uuid,text,jsonb)','identity.read_data_export_status(uuid)',
 'identity.claim_data_export(uuid,integer)','identity.renew_data_export_lease(uuid,uuid,integer)',
 'identity.read_data_export_snapshot(uuid,uuid)','identity.complete_data_export(uuid,uuid,text,text,bigint,timestamp with time zone)',
 'identity.fail_data_export(uuid,uuid,text)','identity.sweep_data_exports()','identity.mark_data_export_key_destroyed(uuid)',
 'identity.live_data_export_ids(uuid[])','identity.open_data_export_link(uuid,text)','identity.record_data_export_download(uuid,uuid,jsonb)'
] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD115_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** 0115's table, its 14 functions, the worker role, the identity schema grant it adds and the action CHECK it replaces. */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 const table=(await client.query(`
  SELECT pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
   (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
   (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
   (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,
   (SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class=c.oid) rules,
   (SELECT jsonb_agg(p.pubname ORDER BY p.pubname) FROM pg_publication_tables pt JOIN pg_publication p ON p.pubname=pt.pubname WHERE pt.schemaname='identity' AND pt.tablename='data_export') publications
  FROM pg_class c WHERE c.oid=to_regclass('identity.data_export')`)).rows;
 const role=(await client.query(`
  SELECT r.rolcanlogin login,r.rolinherit inherit,r.rolsuper super,r.rolbypassrls bypassrls,r.rolcreaterole createrole,r.rolcreatedb createdb,
   has_schema_privilege(r.oid,'identity','USAGE') identity_usage
  FROM pg_roles r WHERE r.rolname='debateai_data_export_worker'`)).rows;
 const memberships=(await client.query(`
  SELECT member.rolname member,granted.rolname granted,m.admin_option
  FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid
  WHERE member.rolname IN ('debateai_data_export_worker','debateai_authorization_runtime','debateai_runtime')
    AND granted.rolname IN ('debateai_data_export_worker','debateai_authorization_runtime','debateai_runtime')
  ORDER BY member.rolname,granted.rolname`)).rows;
 const effectiveMemberships=(await client.query(`
  SELECT pg_has_role('debateai_authorization_runtime','debateai_data_export_worker','MEMBER') auth_to_worker,
    pg_has_role('debateai_data_export_worker','debateai_authorization_runtime','MEMBER') worker_to_auth,
    pg_has_role('debateai_runtime','debateai_data_export_worker','MEMBER') runtime_to_worker`)).rows;
 const check=(await client.query(`SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='identity.step_up_grant'::regclass AND conname='step_up_grant_action_check'`)).rows;
 if(table.length!==1||role.length!==1||effectiveMemberships.length!==1||check.length!==1)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({functions,table,role,memberships,effectiveMemberships,check}));
}

export async function loadForward115(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
