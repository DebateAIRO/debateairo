import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { lineageEvidence, type MigrationPlan, type Lineage } from './migration-lineage.js';
import { base108Lineage } from './migration-forward108.js';

// Data export follows forward110 and binds its source, function bodies, shared bindings and receipt.
const NAME='0111_data_export.sql';
const VERSION='auth-dev-preview-20261006-forward111-v1';
const MANIFEST_PATH='lineage/auth-dev-preview-20261006-forward111.json';
const VERIFIER_PATH='lineage/verify-dx111-data-export.sql';
// The chain is the forward plan that runs immediately before this one in migrate().
const CHAIN_NAME='0110_account_erasure_public_debates.sql';
const CHAIN_MANIFEST_PATH='lineage/auth-dev-preview-20261006-forward110.json';
const CHAIN_RECEIPT_TABLE='public.debateai_schema_migration_forward110';
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD111_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const hex=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export type Forward111Function=Readonly<{signature:string;identityArguments:string;result:string;language:string;volatility:string;runtimeExecute:boolean;originalSource:string|null;originalBodySha256:string|null;currentBodySha256:string}>;
export type Forward111Plan=Readonly<{
 name:typeof NAME; manifestSha256:string; chain:typeof CHAIN_NAME; chainManifestSha256:string; sourceSha256:string; verifierSha256:string;
 sql:string; verifierSql:string; originalVerifierSql:string; functions:readonly Forward111Function[];
 sharedBindings:readonly Readonly<{signature:string;source:string;bodySha256:string}>[];
}>;
// [signature, originalSource, language, volatility, runtimeExecute].
const FUNCTIONS:readonly (readonly [string,string|null,string,string,boolean])[]=[
 ['identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamp with time zone,uuid,text,text,uuid,timestamp with time zone)','0107_auth_dev_integration.sql','plpgsql','v',false],
 ['identity.valid_consumer_authorization_internal(jsonb)','0107_auth_dev_integration.sql','sql','i',false],
 ['identity.request_data_export(uuid,uuid,text,uuid,text,jsonb)',null,'plpgsql','v',true],
 ['identity.read_data_export_status(uuid)',null,'plpgsql','s',true],
 ['identity.claim_data_export(uuid,integer)',null,'plpgsql','v',true],
 ['identity.renew_data_export_lease(uuid,uuid,integer)',null,'plpgsql','v',true],
 ['identity.read_data_export_snapshot(uuid,uuid)',null,'plpgsql','s',true],
 ['identity.complete_data_export(uuid,uuid,text,text,bigint,timestamp with time zone)',null,'plpgsql','v',true],
 ['identity.fail_data_export(uuid,uuid,text)',null,'plpgsql','v',true],
 ['identity.sweep_data_exports()',null,'plpgsql','v',true],
 ['identity.mark_data_export_key_destroyed(uuid)',null,'plpgsql','v',true],
 ['identity.live_data_export_ids(uuid[])',null,'sql','s',true],
 ['identity.open_data_export_link(uuid,text)',null,'plpgsql','s',true],
 ['identity.record_data_export_download(uuid,uuid,jsonb)',null,'plpgsql','v',true],
];
// Shared functions used by 0111 but unchanged by it.
const SHARED:readonly (readonly [string,string])[]=[
 ['identity.insert_consumer_grant_internal(uuid,uuid,text,jsonb,timestamp with time zone)','0100_consumer_security_recovery.sql'],
 ['identity.bind_consumer_grant_generation()','0100_consumer_security_recovery.sql'],
 ['identity.read_account_security_hold(uuid)','0085_staff_access_foundation.sql'],
];
// The LAST `CREATE [OR REPLACE] FUNCTION <schema>.<name>(` with this many non-OUT arguments, any dollar tag.
export function functionBody(sql:string,signature:string):string {
 const schema=signature.split('.')[0]!,name=signature.split('.')[1]!.split('(')[0]!;
 const want=signature.slice(signature.indexOf('(')+1,-1).split(',').filter(Boolean).length;
 const hits=[...sql.matchAll(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${schema}\\.${name}\\(([\\s\\S]*?)\\)[\\s\\S]*?AS \\$(\\w*)\\$([\\s\\S]*?)\\$\\2\\$;`,'g'))]
  .filter(match=>match[1]!.split(',').filter(arg=>arg.trim()!==''&&!/^\s*OUT\s/i.test(arg)).length===want);
 const body=hits.at(-1)?.[3];
 if(body===undefined)return fail('SOURCE_BODY');return body;
}
export async function loadForward111(baseRecipeSha256:string,baseVerifierSha256:string,chainManifestSha256:string):Promise<Forward111Plan>{
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(MANIFEST_PATH,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','baseVerifierSha256','chain','chainManifestSha256','migration','verifier','functions','sharedBindings'])||raw.version!==VERSION
  ||raw.baseRecipeSha256!==baseRecipeSha256||raw.baseVerifierSha256!==baseVerifierSha256||raw.chain!==CHAIN_NAME||raw.chainManifestSha256!==chainManifestSha256
  ||sha(await readFile(new URL(CHAIN_MANIFEST_PATH,directory)))!==chainManifestSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==NAME||!exactKeys(raw.verifier,['path','sha256'])||raw.verifier.path!==VERIFIER_PATH
  ||!Array.isArray(raw.functions)||raw.functions.length!==FUNCTIONS.length||!Array.isArray(raw.sharedBindings)||raw.sharedBindings.length!==SHARED.length)return fail('MANIFEST');
 for(const [index,item] of raw.functions.entries()){
  const [signature,source,language,volatility,runtime]=FUNCTIONS[index]!;
  if(!exactKeys(item,['signature','identityArguments','result','language','volatility','runtimeExecute','originalSource','originalBodySha256','currentBodySha256'])||item.signature!==signature
   ||typeof item.identityArguments!=='string'||typeof item.result!=='string'||item.language!==language||item.volatility!==volatility||item.runtimeExecute!==runtime
   ||item.originalSource!==source||(source===null?item.originalBodySha256!==null:!hex(item.originalBodySha256))||!hex(item.currentBodySha256))return fail('MANIFEST');
 }
 for(const [index,item] of raw.sharedBindings.entries()){
  if(!exactKeys(item,['signature','source','bodySha256'])||item.signature!==SHARED[index]![0]||item.source!==SHARED[index]![1]||!hex(item.bodySha256))return fail('MANIFEST');
 }
 if(!hex(raw.migration.sha256)||!hex(raw.verifier.sha256))return fail('MANIFEST');
 const functions=raw.functions as Forward111Function[],sharedBindings=raw.sharedBindings as Forward111Plan['sharedBindings'];
 const sqlBytes=await readFile(new URL(NAME,directory));const verifierBytes=await readFile(new URL(VERIFIER_PATH,directory));
 if(sha(sqlBytes)!==raw.migration.sha256||sha(verifierBytes)!==raw.verifier.sha256)return fail('SOURCE_DIGEST');
 const sql=sqlBytes.toString('utf8'),verifierSql=verifierBytes.toString('utf8');
 const sources=new Map<string,string>();const source=async(name:string)=>sources.get(name)??(sources.set(name,await readFile(new URL(name,directory),'utf8')),sources.get(name)!);
 for(const spec of functions){
  if(sha(functionBody(sql,spec.signature))!==spec.currentBodySha256)return fail('BODY_DIGEST');
  if(spec.originalSource!==null&&sha(functionBody(await source(spec.originalSource),spec.signature))!==spec.originalBodySha256)return fail('BODY_DIGEST');
 }
 // A shared binding whose live body is one file's body is checked against that file too; a derived one (+0099) only in the catalog.
 for(const spec of sharedBindings)if(!spec.source.includes('+')&&sha(functionBody(await source(spec.source),spec.signature))!==spec.bodySha256)return fail('SHARED_SOURCE_DIGEST');
 const phase="v_phase text:='post'";
 if(verifierSql.split(phase).length!==2)return fail('VERIFIER_BINDING');
 let originalVerifierSql=verifierSql.replace(phase,"v_phase text:='pre'");
 for(const spec of functions){
  const current=`"currentBodySha256":"${spec.currentBodySha256}"`;
  if(originalVerifierSql.split(current).length!==2)return fail('VERIFIER_BINDING');
  originalVerifierSql=originalVerifierSql.replace(current,`"currentBodySha256":${spec.originalBodySha256===null?'null':`"${spec.originalBodySha256}"`}`);
 }
 for(const spec of sharedBindings)if(verifierSql.split(`"bodySha256":"${spec.bodySha256}"`).length!==2)return fail('VERIFIER_BINDING');
 return {name:NAME,manifestSha256:sha(bytes),chain:CHAIN_NAME,chainManifestSha256,sourceSha256:sha(sqlBytes),verifierSha256:sha(verifierBytes),sql,verifierSql,originalVerifierSql,functions,sharedBindings};
}

async function anchor(client:PoolClient):Promise<Readonly<{oid:string;name:string;attributes:unknown}>>{
 const row=(await client.query<{oid:string;name:string;attributes:unknown;valid:boolean}>(`
  SELECT r.oid::text oid,r.rolname name,jsonb_build_object('login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'replication',r.rolreplication,'bypassrls',r.rolbypassrls) attributes,
   r.oid IS NOT DISTINCT FROM(SELECT relowner FROM pg_class WHERE oid='public.debateai_schema_migration'::regclass)
   AND r.oid IS NOT DISTINCT FROM(SELECT nspowner FROM pg_namespace WHERE oid='billing'::regnamespace) valid
  FROM pg_roles r WHERE r.rolname=current_user
 `)).rows[0];
 if(row?.valid!==true||row.oid===undefined)return fail('EXECUTOR_DRIFT');return {oid:row.oid,name:row.name,attributes:row.attributes};
}
const RECEIPT_COLUMNS=['source_name','base_recipe_sha256','chain_manifest_sha256','forward_manifest_sha256','source_sha256','verifier_sha256','precondition_evidence_digest','postcondition_evidence_digest','compat_prior_postcondition_digest','compat_postcondition_digest','executed_at'];
async function assertReceiptAcl(client:PoolClient,owner:Readonly<{oid:string}>):Promise<void>{
 const row=(await client.query<{valid:boolean}>(`
  SELECT c.relowner IS NOT DISTINCT FROM $1::oid AND c.relkind='r' AND c.relpersistence='p' AND NOT c.relrowsecurity
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
   AND NOT EXISTS(SELECT 1 FROM pg_attribute col CROSS JOIN LATERAL aclexplode(NULLIF(col.attacl,'{}'::aclitem[])) a WHERE col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped AND a.grantee<>c.relowner)
   AND NOT EXISTS(SELECT 1 FROM pg_roles service WHERE service.oid<>c.relowner AND left(service.rolname,9)='debateai_' AND pg_has_role(service.oid,c.relowner,'MEMBER'))
   AND (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',a.atthasdef) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)=$2::jsonb
   AND (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype IN('c','p'))=11
   AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype NOT IN('c','p','n'))
   AND EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p' AND k.conkey=ARRAY[1]::smallint[])
  AS valid FROM pg_class c WHERE c.oid=to_regclass('public.debateai_schema_migration_forward111')
 `,[owner.oid,JSON.stringify(RECEIPT_COLUMNS.map(name=>({name,type:name==='executed_at'?'timestamp with time zone':'text',required:!name.startsWith('compat_'),identity:'',generated:'',default:false})))])).rows[0];
 if(row?.valid!==true)return fail('RECEIPT_ACL_DRIFT');
}
async function metadataDigest(client:PoolClient,forward:Forward111Plan):Promise<string>{
 const signatures=forward.functions.map(spec=>spec.signature).concat(forward.sharedBindings.map(spec=>spec.signature));
 const rows=(await client.query(`
  SELECT signature,p.oid::text oid,pg_get_userbyid(p.proowner) owner,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256,
   encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha256,p.prokind,p.provolatile,p.proisstrict,p.proleakproof,p.proparallel,p.prosecdef,p.proretset,p.procost,p.prorows,p.prosupport::text,p.proconfig,p.proargnames,p.proargmodes,p.pronargdefaults,
   (SELECT jsonb_agg(jsonb_build_object('grantee',coalesce(grantee.rolname,'PUBLIC'),'grantor',grantor.rolname,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY coalesce(grantee.rolname,'PUBLIC'),grantor.rolname,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature
 `,[signatures])).rows;
 if(rows.length!==signatures.length)return fail('FUNCTION_DRIFT');
 const columns=(await client.query(`SELECT a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,
  COALESCE((SELECT jsonb_agg(x::text ORDER BY x::text) FROM unnest(a.attacl) x),'[]'::jsonb) acl,
  pg_get_expr(d.adbin,d.adrelid) "default" FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='identity.data_export'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`)).rows;
 const exportConstraints=(await client.query(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid) definition
  FROM pg_constraint WHERE conrelid='identity.data_export'::regclass ORDER BY conname`)).rows;
 const exportIndexes=(await client.query(`SELECT c.relname,i.indisunique,i.indisprimary,i.indisvalid,i.indisready,i.indislive,pg_get_indexdef(i.indexrelid) definition
  FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='identity.data_export'::regclass ORDER BY c.relname`)).rows;
 const exportTriggers=(await client.query(`SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition
  FROM pg_trigger WHERE tgrelid='identity.data_export'::regclass AND NOT tgisinternal ORDER BY tgname`)).rows;
 const check=(await client.query(`SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='identity.step_up_grant'::regclass AND conname='step_up_grant_action_check'`)).rows;
 return sha(JSON.stringify({functions:rows,columns,exportConstraints,exportIndexes,exportTriggers,check}));
}
function preconditionDigest(plan:MigrationPlan):string{
 const forward=plan.forward111;
 return sha(JSON.stringify({version:VERSION,baseRecipeSha256:plan.recipeSha256,chain:forward.chain,chainManifestSha256:forward.chainManifestSha256,
  manifestSha256:forward.manifestSha256,sourceSha256:forward.sourceSha256,verifierSha256:forward.verifierSha256,
  originalFunctions:forward.functions.map(({signature,originalBodySha256})=>({signature,bodySha256:originalBodySha256})),sharedBindings:forward.sharedBindings}));
}
export async function applyForward111(client:PoolClient,plan:MigrationPlan,lineage:Lineage,applied:ReadonlySet<string>):Promise<void>{
 const forward=plan.forward111,replay=applied.has(forward.name),owner=await anchor(client);
 // The prior forward receipt must be bound to the exact manifest pinned here.
 const chained=(await client.query<{source_name:string;forward_manifest_sha256:string}>(`SELECT source_name,forward_manifest_sha256 FROM ${CHAIN_RECEIPT_TABLE}`)).rows;
 if(chained.length!==1||chained[0]!.source_name!==CHAIN_NAME||chained[0]!.forward_manifest_sha256!==forward.chainManifestSha256||plan.forward110.name!==CHAIN_NAME||plan.forward110.manifestSha256!==forward.chainManifestSha256)return fail('CHAIN_BINDING_DRIFT');
 // identifyLineage admits 0111 only beside 0110 and its -108 base lineage.
 if(replay&&!(lineage==='integrated-original-108'||lineage==='integrated-compatibility-108'||lineage==='integrated-fresh-resolutions-108'))return fail('LINEAGE');
 const exists=(await client.query<{present:boolean}>("SELECT to_regclass('public.debateai_schema_migration_forward111') IS NOT NULL present")).rows[0]?.present===true;
 if(replay&&!exists)return fail('RECEIPT_MISSING');
 if(!exists){
  await client.query(`CREATE TABLE public.debateai_schema_migration_forward111(
   source_name text PRIMARY KEY CONSTRAINT fwd111_source_check CHECK(source_name='0111_data_export.sql'),
   base_recipe_sha256 text NOT NULL CONSTRAINT fwd111_base_sha_check CHECK(base_recipe_sha256 ~ '^[0-9a-f]{64}$'),
   chain_manifest_sha256 text NOT NULL CONSTRAINT fwd111_chain_sha_check CHECK(chain_manifest_sha256 ~ '^[0-9a-f]{64}$'),
   forward_manifest_sha256 text NOT NULL CONSTRAINT fwd111_manifest_sha_check CHECK(forward_manifest_sha256 ~ '^[0-9a-f]{64}$'),
   source_sha256 text NOT NULL CONSTRAINT fwd111_source_sha_check CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
   verifier_sha256 text NOT NULL CONSTRAINT fwd111_verifier_sha_check CHECK(verifier_sha256 ~ '^[0-9a-f]{64}$'),
   precondition_evidence_digest text NOT NULL CONSTRAINT fwd111_pre_sha_check CHECK(precondition_evidence_digest ~ '^[0-9a-f]{64}$'),
   postcondition_evidence_digest text NOT NULL CONSTRAINT fwd111_post_sha_check CHECK(postcondition_evidence_digest ~ '^[0-9a-f]{64}$'),
   compat_prior_postcondition_digest text CONSTRAINT fwd111_compat_prior_sha_check CHECK(compat_prior_postcondition_digest ~ '^[0-9a-f]{64}$'),
   compat_postcondition_digest text CONSTRAINT fwd111_compat_post_sha_check CHECK(compat_postcondition_digest ~ '^[0-9a-f]{64}$'),
   executed_at timestamptz NOT NULL
  )`);
  await client.query('REVOKE ALL ON public.debateai_schema_migration_forward111 FROM PUBLIC');
 }
 await assertReceiptAcl(client,owner);
 const receipts=(await client.query<{source_name:string;base_recipe_sha256:string;chain_manifest_sha256:string;forward_manifest_sha256:string;source_sha256:string;verifier_sha256:string;precondition_evidence_digest:string;postcondition_evidence_digest:string;compat_prior_postcondition_digest:string|null;compat_postcondition_digest:string|null}>('SELECT * FROM public.debateai_schema_migration_forward111 ORDER BY source_name')).rows;
 const expectedPre=preconditionDigest(plan);
 if(replay){
  const receipt=receipts[0];
  if(receipts.length!==1||receipt?.source_name!==forward.name||receipt.base_recipe_sha256!==plan.recipeSha256||receipt.chain_manifest_sha256!==forward.chainManifestSha256||receipt.forward_manifest_sha256!==forward.manifestSha256||receipt.source_sha256!==forward.sourceSha256||receipt.verifier_sha256!==forward.verifierSha256||receipt.precondition_evidence_digest!==expectedPre)return fail('RECEIPT_BINDING_DRIFT');
  if(lineage==='integrated-compatibility-108'){
   const resolution=(await client.query<{postcondition_evidence_digest:string}>("SELECT postcondition_evidence_digest FROM public.debateai_schema_migration_resolution WHERE logical_name='0093_billing_runtime_role.sql'")).rows[0];
   if(!hex(receipt.compat_prior_postcondition_digest)||!hex(receipt.compat_postcondition_digest)
    ||receipt.compat_postcondition_digest!==resolution?.postcondition_evidence_digest)return fail('RECEIPT_BINDING_DRIFT');
  }else if(receipt.compat_prior_postcondition_digest!==null||receipt.compat_postcondition_digest!==null)return fail('RECEIPT_BINDING_DRIFT');
  await client.query(forward.verifierSql);
  if(receipt.postcondition_evidence_digest!==await metadataDigest(client,forward))return fail('POSTCONDITION_DRIFT');
 }else{
  if(receipts.length!==0)return fail('RECEIPT_BINDING_DRIFT');
  await client.query(forward.originalVerifierSql);
  await client.query(forward.sql);
  await client.query(plan.effectiveCapabilityVerifierSql);
  await client.query(forward.verifierSql);
  const post=await metadataDigest(client,forward);
  let compatPrior:string|null=null,compatPost:string|null=null;
  if(['auth94','auth103','auth106','integrated-compatibility'].includes(base108Lineage(lineage))){
   compatPrior=(await client.query<{postcondition_evidence_digest:string}>("SELECT postcondition_evidence_digest FROM public.debateai_schema_migration_resolution WHERE logical_name='0093_billing_runtime_role.sql'")).rows[0]?.postcondition_evidence_digest??null;
   if(!hex(compatPrior))return fail('RECEIPT_BINDING_DRIFT');
   compatPost=await lineageEvidence(client);
   await client.query("UPDATE public.debateai_schema_migration_resolution SET postcondition_evidence_digest=$1 WHERE logical_name='0093_billing_runtime_role.sql'",[compatPost]);
  }
  await client.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[forward.name]);
  await client.query(`INSERT INTO public.debateai_schema_migration_forward111(source_name,base_recipe_sha256,chain_manifest_sha256,forward_manifest_sha256,source_sha256,verifier_sha256,precondition_evidence_digest,postcondition_evidence_digest,compat_prior_postcondition_digest,compat_postcondition_digest,executed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,statement_timestamp())`,[forward.name,plan.recipeSha256,forward.chainManifestSha256,forward.manifestSha256,forward.sourceSha256,forward.verifierSha256,expectedPre,post,compatPrior,compatPost]);
 }
 await assertReceiptAcl(client,owner);
}
