import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { MigrationPlan, Lineage } from './migration-lineage.js';

const NAME='0108_preview_recovery_verified_bindings.sql';
const VERSION='auth-dev-preview-20261006-forward108-v1';
const MANIFEST_PATH='lineage/auth-dev-preview-20261006-forward108.json';
const VERIFIER_PATH='lineage/verify-auth108-recovery-bindings.sql';
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD108_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export type Forward108Function=Readonly<{signature:string;args:readonly string[];result:string;owner:string;originalBodySha256:string;currentBodySha256:string}>;
export type Forward108Plan=Readonly<{
 name:typeof NAME; manifestSha256:string; sourceSha256:string; verifierSha256:string;
 sql:string; verifierSql:string; originalVerifierSql:string; functions:readonly Forward108Function[];
 sharedBinding:Readonly<{signature:string;bodySha256:string}>;
}>;
function functionBody(sql:string,name:string):string {
 const match=sql.match(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION identity\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`));
 if(match?.[1]===undefined)return fail('SOURCE_BODY');return match[1];
}
export async function loadForward108(baseRecipeSha256:string,baseVerifierSha256:string):Promise<Forward108Plan>{
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(MANIFEST_PATH,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','baseVerifierSha256','migration','verifier','functions','sharedBinding'])||raw.version!==VERSION||raw.baseRecipeSha256!==baseRecipeSha256||raw.baseVerifierSha256!==baseVerifierSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==NAME||!exactKeys(raw.verifier,['path','sha256'])||raw.verifier.path!==VERIFIER_PATH
  ||!Array.isArray(raw.functions)||raw.functions.length!==4||!exactKeys(raw.sharedBinding,['signature','bodySha256'])||raw.sharedBinding.signature!=='identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)')return fail('MANIFEST');
 const signatures=['identity.password_reset_prepare(bytea)','identity.password_reset_start(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint)','identity.mfa_recovery_prepare_exchange(text)','identity.mfa_recovery_exchange(text,text,text,text,jsonb,text,jsonb)'];
 const expectedArgs=[['p_index'],['p_index','p_candidate','p_channels','p_refs','p_link','p_cancel','p_notices','p_source','p_register'],['p_link'],['p_link','p_password','p_session','p_csrf','p_refs','p_risk','p_source']];
 const expectedResults=['jsonb','boolean','jsonb','text'];
 for(const [index,item] of raw.functions.entries())if(!exactKeys(item,['signature','args','result','owner','originalBodySha256','currentBodySha256'])||item.signature!==signatures[index]||JSON.stringify(item.args)!==JSON.stringify(expectedArgs[index])||item.result!==expectedResults[index]||item.owner!==(index<2?'debateai_password_reset_owner':'debateai_mfa_recovery_owner')||typeof item.originalBodySha256!=='string'||typeof item.currentBodySha256!=='string'||!/^[0-9a-f]{64}$/.test(item.originalBodySha256)||!/^[0-9a-f]{64}$/.test(item.currentBodySha256))return fail('MANIFEST');
 const functions=raw.functions as Forward108Function[];
 const sqlBytes=await readFile(new URL(NAME,directory));const verifierBytes=await readFile(new URL(VERIFIER_PATH,directory));
 if(sha(sqlBytes)!==raw.migration.sha256||sha(verifierBytes)!==raw.verifier.sha256)return fail('SOURCE_DIGEST');
 const sql=sqlBytes.toString('utf8'),verifierSql=verifierBytes.toString('utf8');
 const oldMfa=await readFile(new URL('0106_known_password_mfa_recovery.sql',directory),'utf8');
 const oldReset=await readFile(new URL('0104_password_only_reset.sql',directory),'utf8');
 const shared=await readFile(new URL('0097_recovery_email_verification.sql',directory),'utf8');
 for(const spec of functions){const name=spec.signature.split('.')[1]!.split('(')[0]!;if(sha(functionBody(name.startsWith('password_reset')?oldReset:oldMfa,name))!==spec.originalBodySha256||sha(functionBody(sql,name))!==spec.currentBodySha256)return fail('BODY_DIGEST');}
 if(typeof raw.sharedBinding.bodySha256!=='string'||sha(functionBody(shared,'start_account_recovery'))!==raw.sharedBinding.bodySha256)return fail('SHARED_SOURCE_DIGEST');
 let originalVerifierSql=verifierSql;
 for(const spec of functions){const current=`"currentBodySha256":"${spec.currentBodySha256}"`;if(!originalVerifierSql.includes(current))return fail('VERIFIER_BINDING');originalVerifierSql=originalVerifierSql.replace(current,`"currentBodySha256":"${spec.originalBodySha256}"`);}
 return {name:NAME,manifestSha256:sha(bytes),sourceSha256:sha(sqlBytes),verifierSha256:sha(verifierBytes),sql,verifierSql,originalVerifierSql,functions,sharedBinding:raw.sharedBinding as {signature:string;bodySha256:string}};
}

const baseOf:Readonly<Partial<Record<Lineage,Lineage>>>=Object.freeze({
 'integrated-original-108':'integrated-original',
 'integrated-compatibility-108':'integrated-compatibility',
 'integrated-fresh-resolutions-108':'integrated-fresh-resolutions'
});
export const base108Lineage=(lineage:Lineage):Lineage=>baseOf[lineage]??lineage;
export const has108Lineage=(lineage:Lineage):boolean=>Object.hasOwn(baseOf,lineage);
async function anchor(client:PoolClient):Promise<Readonly<{oid:string;name:string;attributes:unknown}>>{
 const row=(await client.query<{oid:string;name:string;attributes:unknown;valid:boolean}>(`
  SELECT r.oid::text oid,r.rolname name,jsonb_build_object('login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'replication',r.rolreplication,'bypassrls',r.rolbypassrls) attributes,
   r.oid IS NOT DISTINCT FROM(SELECT relowner FROM pg_class WHERE oid='public.debateai_schema_migration'::regclass)
   AND r.oid IS NOT DISTINCT FROM(SELECT nspowner FROM pg_namespace WHERE oid='billing'::regnamespace)
   AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['billing.consume_withdrawal_grant(uuid,uuid,uuid,text)','billing.owner_age_frozen(uuid)','billing.owner_erasure_committed(uuid)','billing.owner_erasure_pending(uuid)','billing.pending_erasure_owner_refs(uuid,integer)','billing.purge_expired_records(timestamptz)']) signature
    WHERE r.oid IS DISTINCT FROM(SELECT proowner FROM pg_proc WHERE oid=to_regprocedure(signature))) valid
  FROM pg_roles r WHERE r.rolname=current_user
 `)).rows[0];
 if(row?.valid!==true||row.oid===undefined)return fail('EXECUTOR_DRIFT');return {oid:row.oid,name:row.name,attributes:row.attributes};
}
async function assertReceiptAcl(client:PoolClient,owner:Readonly<{oid:string}>):Promise<void>{
 const row=(await client.query<{valid:boolean}>(`
  SELECT c.relowner IS NOT DISTINCT FROM $1::oid AND c.relkind='r' AND c.relpersistence='p' AND NOT c.relrowsecurity
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
   AND NOT EXISTS(SELECT 1 FROM pg_attribute col CROSS JOIN LATERAL aclexplode(NULLIF(col.attacl,'{}'::aclitem[])) a WHERE col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped AND a.grantee<>c.relowner)
   AND NOT EXISTS(SELECT 1 FROM pg_roles service WHERE left(service.rolname,9)='debateai_' AND service.oid<>c.relowner AND pg_has_role(service.oid,c.relowner,'MEMBER'))
   AND (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',a.atthasdef) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)=$2::jsonb
   AND (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype IN('c','p'))=8
   AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype NOT IN('c','p','n'))
   AND EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p' AND k.conkey=ARRAY[1]::smallint[])
  AS valid FROM pg_class c WHERE c.oid=to_regclass('public.debateai_schema_migration_forward')
 `,[owner.oid,JSON.stringify(['source_name','base_recipe_sha256','forward_manifest_sha256','source_sha256','verifier_sha256','precondition_evidence_digest','postcondition_evidence_digest','executed_at'].map(name=>({name,type:name==='executed_at'?'timestamp with time zone':'text',required:true,identity:'',generated:'',default:false})))])).rows[0];
 if(row?.valid!==true)return fail('RECEIPT_ACL_DRIFT');
}
async function metadataDigest(client:PoolClient,forward:Forward108Plan):Promise<string>{
 const rows=(await client.query(`
  SELECT signature,p.oid::text oid,pg_get_userbyid(p.proowner) owner,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256,
   encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha256,p.prokind,p.provolatile,p.proisstrict,p.proleakproof,p.proparallel,p.prosecdef,p.proretset,p.procost,p.prorows,p.prosupport::text,p.proconfig,p.proargnames,p.proargmodes,p.pronargdefaults,
   (SELECT jsonb_agg(jsonb_build_object('grantee',coalesce(grantee.rolname,'PUBLIC'),'grantor',grantor.rolname,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY coalesce(grantee.rolname,'PUBLIC'),grantor.rolname,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature
 `,[forward.functions.map(spec=>spec.signature).concat(forward.sharedBinding.signature)])).rows;
 if(rows.length!==5)return fail('FUNCTION_DRIFT');return sha(JSON.stringify(rows));
}
function preconditionDigest(plan:MigrationPlan,lineage:Lineage,owner:unknown):string{
 const forward=plan.forward108;
 return sha(JSON.stringify({version:VERSION,lineage,baseRecipeSha256:plan.recipeSha256,baseTerminal:[...plan.manifest.order].sort(),owner,
  manifestSha256:forward.manifestSha256,sourceSha256:forward.sourceSha256,verifierSha256:forward.verifierSha256,
  originalFunctions:forward.functions.map(({signature,args,result,owner,originalBodySha256})=>({signature,args,result,owner,bodySha256:originalBodySha256,language:'plpgsql',kind:'f',volatility:'v',securityDefiner:true,searchPath:['search_path=pg_catalog'],runtimeExecute:owner.replace('_owner','_runtime'),noOtherRuntimeExecute:true})),sharedBinding:forward.sharedBinding}));
}
export async function applyForward108(client:PoolClient,plan:MigrationPlan,lineage:Lineage,applied:ReadonlySet<string>):Promise<void>{
 const forward=plan.forward108,replay=has108Lineage(lineage),owner=await anchor(client);
 const exists=(await client.query<{present:boolean}>("SELECT to_regclass('public.debateai_schema_migration_forward') IS NOT NULL present")).rows[0]?.present===true;
 if(replay&&!exists)return fail('RECEIPT_MISSING');
 if(!exists){
  await client.query(`CREATE TABLE public.debateai_schema_migration_forward(
   source_name text PRIMARY KEY CONSTRAINT fwd108_source_check CHECK(source_name='0108_preview_recovery_verified_bindings.sql'),
   base_recipe_sha256 text NOT NULL CONSTRAINT fwd108_base_sha_check CHECK(base_recipe_sha256 ~ '^[0-9a-f]{64}$'),
   forward_manifest_sha256 text NOT NULL CONSTRAINT fwd108_manifest_sha_check CHECK(forward_manifest_sha256 ~ '^[0-9a-f]{64}$'),
   source_sha256 text NOT NULL CONSTRAINT fwd108_source_sha_check CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
   verifier_sha256 text NOT NULL CONSTRAINT fwd108_verifier_sha_check CHECK(verifier_sha256 ~ '^[0-9a-f]{64}$'),
   precondition_evidence_digest text NOT NULL CONSTRAINT fwd108_pre_sha_check CHECK(precondition_evidence_digest ~ '^[0-9a-f]{64}$'),
   postcondition_evidence_digest text NOT NULL CONSTRAINT fwd108_post_sha_check CHECK(postcondition_evidence_digest ~ '^[0-9a-f]{64}$'),
   executed_at timestamptz NOT NULL
  )`);
  await client.query('REVOKE ALL ON public.debateai_schema_migration_forward FROM PUBLIC');
 }
 await assertReceiptAcl(client,owner);
 const receipts=(await client.query<{source_name:string;base_recipe_sha256:string;forward_manifest_sha256:string;source_sha256:string;verifier_sha256:string;precondition_evidence_digest:string;postcondition_evidence_digest:string}>('SELECT * FROM public.debateai_schema_migration_forward ORDER BY source_name')).rows;
 const terminal=new Set([...applied,...(lineage==='integrated-fresh-resolutions'||lineage==='integrated-fresh-resolutions-108'?plan.manifest.transactionBodies.map(body=>body.logicalName):lineage==='integrated-compatibility'||lineage==='integrated-compatibility-108'? [plan.manifest.compatibility.logicalName]:[])]);
 if(!plan.manifest.order.every(name=>terminal.has(name)))return fail('BASE_STATE');
 const base=base108Lineage(lineage);
 // New fresh/Auth/Dev transitions all arrive at an exact complete base. Infer only their declared resolution form.
 const preBase:Lineage=base==='fresh'?'integrated-fresh-resolutions':base==='auth94'||base==='auth103'||base==='auth106'?'integrated-compatibility':base==='dev95'?'integrated-original':base;
 const expectedPre=preconditionDigest(plan,preBase,owner);
 if(replay){
  const receipt=receipts[0];
  if(receipts.length!==1||receipt?.source_name!==forward.name||receipt.base_recipe_sha256!==plan.recipeSha256||receipt.forward_manifest_sha256!==forward.manifestSha256||receipt.source_sha256!==forward.sourceSha256||receipt.verifier_sha256!==forward.verifierSha256||receipt.precondition_evidence_digest!==expectedPre)return fail('RECEIPT_BINDING_DRIFT');
  await client.query(forward.verifierSql);
  if(receipt.postcondition_evidence_digest!==await metadataDigest(client,forward))return fail('POSTCONDITION_DRIFT');
 }else{
  if(receipts.length!==0||applied.has(forward.name))return fail('RECEIPT_BINDING_DRIFT');
  await client.query(forward.originalVerifierSql);
  await client.query(forward.sql);
  await client.query(plan.effectiveCapabilityVerifierSql);
  await client.query(forward.verifierSql);
  const post=await metadataDigest(client,forward);
  await client.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[forward.name]);
  await client.query(`INSERT INTO public.debateai_schema_migration_forward(source_name,base_recipe_sha256,forward_manifest_sha256,source_sha256,verifier_sha256,precondition_evidence_digest,postcondition_evidence_digest,executed_at) VALUES($1,$2,$3,$4,$5,$6,$7,statement_timestamp())`,[forward.name,plan.recipeSha256,forward.manifestSha256,forward.sourceSha256,forward.verifierSha256,expectedPre,post]);
 }
 await assertReceiptAcl(client,owner);
}
