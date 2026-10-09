import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { MigrationPlan } from './migration-lineage.js';
import { loadForward111 } from './migration-forward111.js';
import { loadForwardAuthDbBatch } from './migration-forward-auth-db-batch.js';

/**
 * The forward steps after dev's sealed lineage, its 0108 and its 0110 (PR-54, PR-58, migrations/lineage/README.md): an
 * ordered chain. Each step has its own manifest, bound to the base recipe, to the step before it (0110's manifest for
 * the first) and to the effective-capability verifier it supersedes (the sealed one for the first: 0110 keeps it in
 * force); its own loader; and its own receipt row in public.debateai_schema_migration_step. The verifier of the last
 * applied step replaces dev's sealed verifier at the end of every migrate(). A new step appends its loader to STEPS and
 * edits no earlier step's file.
 */
export type ForwardStepAnchor=Readonly<{baseRecipeSha256:string;previousName:string;previousManifestSha256:string;previousVerifierSha256:string}>;
export type ForwardStepPlan=Readonly<{
 name:string; version:string; manifestSha256:string; sourceSha256:string; sql:string;
 previousName:string; previousManifestSha256:string; previousVerifierSha256:string;
 verifierPath:string; verifierSha256:string; verifierSql:string;
 /** A digest of the catalog objects the step creates, recorded at apply and compared on every later migrate(). */
 postconditionEvidence(client:PoolClient):Promise<string>;
 /**
  * The step's own security checks (SQL that raises on drift), re-run on EVERY later migrate() for as long as the step
  * is applied — not only while it is the last one — so appending a step never retires an earlier step's promises.
  */
 replayVerifierSql?:string;
}>;
type StepLoader=(anchor:ForwardStepAnchor)=>Promise<ForwardStepPlan>;

/** The chain, in order: 0111 (NETOPIA), then the auth DB batch (0112). A new step appends its loader here (README). */
const STEPS:readonly StepLoader[]=Object.freeze([loadForward111,loadForwardAuthDbBatch]);

const STEP_NAME=/^\d{4}_[a-z0-9_]+\.sql$/;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD_CHAIN_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');

export async function loadForwardChain(first:ForwardStepAnchor):Promise<readonly ForwardStepPlan[]>{
 const chain:ForwardStepPlan[]=[];let anchor=first;
 for(const load of STEPS){
  const step=await load(anchor);
  if(!STEP_NAME.test(step.name)||step.name<=anchor.previousName||step.previousName!==anchor.previousName
   ||step.previousManifestSha256!==anchor.previousManifestSha256||step.previousVerifierSha256!==anchor.previousVerifierSha256)fail('ORDER');
  chain.push(step);
  anchor={baseRecipeSha256:first.baseRecipeSha256,previousName:step.name,previousManifestSha256:step.manifestSha256,previousVerifierSha256:step.verifierSha256};
 }
 return Object.freeze(chain);
}

/** The applied prefix of the chain; any other applied subset is refused. */
export function appliedForwardSteps(plan:Pick<MigrationPlan,'forwardChain'>,applied:ReadonlySet<string>):readonly ForwardStepPlan[]{
 const done=plan.forwardChain.filter(step=>applied.has(step.name));
 if(done.some((step,index)=>step!==plan.forwardChain[index]))return fail('ORDER');
 return done;
}

/** The effective-capability verifier of the last applied step, or undefined while no step is applied (dev's sealed one holds). */
export function effectiveForwardVerifierSql(plan:MigrationPlan,applied:ReadonlySet<string>):string|undefined{
 return appliedForwardSteps(plan,applied).at(-1)?.verifierSql;
}

async function executor(client:PoolClient):Promise<Readonly<{oid:string;name:string;attributes:unknown}>>{
 const row=(await client.query<{oid:string;name:string;attributes:unknown;valid:boolean}>(`
  SELECT r.oid::text oid,r.rolname name,jsonb_build_object('login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'replication',r.rolreplication,'bypassrls',r.rolbypassrls) attributes,
   r.oid IS NOT DISTINCT FROM(SELECT relowner FROM pg_class WHERE oid='public.debateai_schema_migration'::regclass)
   AND r.oid IS NOT DISTINCT FROM(SELECT nspowner FROM pg_namespace WHERE oid='billing'::regnamespace) valid
  FROM pg_roles r WHERE r.rolname=current_user
 `)).rows[0];
 if(row?.valid!==true)return fail('EXECUTOR_DRIFT');return {oid:row.oid,name:row.name,attributes:row.attributes};
}

const RECEIPT_COLUMNS=['source_name','base_recipe_sha256','previous_manifest_sha256','forward_manifest_sha256','source_sha256','verifier_sha256','precondition_evidence_digest','postcondition_evidence_digest','executed_at'] as const;
async function assertReceiptAcl(client:PoolClient,owner:Readonly<{oid:string}>):Promise<void>{
 // The receipt is private to the installer, as 0108's is (migration-forward108.ts, the same principal gate): no grant
 // to anyone, no column grant, and no debateai_ role or runtime alias (indirect and SET-only included) able to act as
 // its owner.
 const row=(await client.query<{valid:boolean}>(`
  WITH RECURSIVE runtime_aliases(oid) AS (
   SELECT oid FROM pg_roles WHERE rolname=ANY(ARRAY[
    'debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime',
    'debateai_erasure_runtime','debateai_publication_cleanup','debateai_content_provision',
    'debateai_replay','debateai_settlement_watch','debateai_evaluator_worker',
    'debateai_evaluator_api','debateai_evaluator_reader','debateai_support',
    'debateai_support_config_operator','debateai_staff_recovery',
    'debateai_password_reset_runtime','debateai_backup_email_runtime','debateai_mfa_recovery_runtime'
   ])
   UNION
   SELECT membership.member FROM pg_auth_members membership JOIN runtime_aliases parent ON parent.oid=membership.roleid
  )
  SELECT c.relowner IS NOT DISTINCT FROM $1::oid AND c.relkind='r' AND c.relpersistence='p' AND NOT c.relrowsecurity
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
   AND NOT EXISTS(SELECT 1 FROM pg_attribute col CROSS JOIN LATERAL aclexplode(NULLIF(col.attacl,'{}'::aclitem[])) a WHERE col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped AND a.grantee<>c.relowner)
   AND NOT EXISTS(SELECT 1 FROM pg_roles service WHERE service.oid<>c.relowner
    AND (left(service.rolname,9)='debateai_' OR service.oid IN(SELECT oid FROM runtime_aliases))
    AND pg_has_role(service.oid,c.relowner,'MEMBER'))
   AND (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)=$2::jsonb
   AND (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype IN('c','p'))=9
   AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype NOT IN('c','p','n'))
  AS valid FROM pg_class c WHERE c.oid=to_regclass('public.debateai_schema_migration_step')
 `,[owner.oid,JSON.stringify(RECEIPT_COLUMNS.map(name=>({name,type:name==='executed_at'?'timestamp with time zone':'text',required:true})))])).rows[0];
 if(row?.valid!==true)return fail('RECEIPT_ACL_DRIFT');
}

function preconditionDigest(plan:MigrationPlan,step:ForwardStepPlan,owner:unknown):string{
 const index=plan.forwardChain.indexOf(step);
 return sha(JSON.stringify({version:step.version,baseRecipeSha256:plan.recipeSha256,baseTerminal:[...plan.manifest.order].sort(),
  forward108:{name:plan.forward108.name,manifestSha256:plan.forward108.manifestSha256},
  forward110:{name:plan.forward110.name,manifestSha256:plan.forward110.manifestSha256},
  prior:plan.forwardChain.slice(0,index).map(({name,manifestSha256})=>({name,manifestSha256})),owner,
  step:{name:step.name,manifestSha256:step.manifestSha256,sourceSha256:step.sourceSha256,verifierSha256:step.verifierSha256,previousVerifierSha256:step.previousVerifierSha256}}));
}

type Receipt=Readonly<Record<(typeof RECEIPT_COLUMNS)[number],string>>;
/**
 * Runs after applyForward110. Before any step: 0108 and 0110 are applied and the sealed verifier has passed. Each
 * pending step runs its SQL, then its superseding verifier, then records its ledger row and its receipt. Applied steps
 * are replayed only by their receipts (and the last one's postcondition); their SQL never runs twice.
 */
export async function applyForwardChain(client:PoolClient,plan:MigrationPlan,applied:ReadonlySet<string>):Promise<void>{
 const done=appliedForwardSteps(plan,applied);
 if(plan.forwardChain.length===0)return;
 // applyForward110 has just replayed or applied 0110 (after 0108) in this transaction; its ledger row is the chain's base.
 const base=(await client.query<{present:boolean}>('SELECT EXISTS(SELECT 1 FROM public.debateai_schema_migration WHERE name=$1) AND EXISTS(SELECT 1 FROM public.debateai_schema_migration WHERE name=$2) present',[plan.forward108.name,plan.forward110.name])).rows[0];
 if(base?.present!==true)return fail('BASE_STATE');
 const owner=await executor(client);
 const exists=(await client.query<{present:boolean}>("SELECT to_regclass('public.debateai_schema_migration_step') IS NOT NULL present")).rows[0]?.present===true;
 if(done.length>0&&!exists)return fail('RECEIPT_MISSING');
 if(!exists){
  await client.query(`CREATE TABLE public.debateai_schema_migration_step(
   source_name text PRIMARY KEY CONSTRAINT fwdstep_source_check CHECK(source_name ~ '^[0-9]{4}_[a-z0-9_]+[.]sql$'),
   base_recipe_sha256 text NOT NULL CONSTRAINT fwdstep_base_sha_check CHECK(base_recipe_sha256 ~ '^[0-9a-f]{64}$'),
   previous_manifest_sha256 text NOT NULL CONSTRAINT fwdstep_previous_sha_check CHECK(previous_manifest_sha256 ~ '^[0-9a-f]{64}$'),
   forward_manifest_sha256 text NOT NULL CONSTRAINT fwdstep_manifest_sha_check CHECK(forward_manifest_sha256 ~ '^[0-9a-f]{64}$'),
   source_sha256 text NOT NULL CONSTRAINT fwdstep_source_sha_check CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
   verifier_sha256 text NOT NULL CONSTRAINT fwdstep_verifier_sha_check CHECK(verifier_sha256 ~ '^[0-9a-f]{64}$'),
   precondition_evidence_digest text NOT NULL CONSTRAINT fwdstep_pre_sha_check CHECK(precondition_evidence_digest ~ '^[0-9a-f]{64}$'),
   postcondition_evidence_digest text NOT NULL CONSTRAINT fwdstep_post_sha_check CHECK(postcondition_evidence_digest ~ '^[0-9a-f]{64}$'),
   executed_at timestamptz NOT NULL
  )`);
  await client.query('REVOKE ALL ON public.debateai_schema_migration_step FROM PUBLIC');
 }
 await assertReceiptAcl(client,owner);
 const receipts=(await client.query<Receipt>('SELECT * FROM public.debateai_schema_migration_step ORDER BY source_name')).rows;
 if(receipts.length!==done.length)return fail('RECEIPT_BINDING_DRIFT');
 for(const [index,step] of done.entries()){
  const receipt=receipts[index];
  if(receipt?.source_name!==step.name||receipt.base_recipe_sha256!==plan.recipeSha256||receipt.previous_manifest_sha256!==step.previousManifestSha256
   ||receipt.forward_manifest_sha256!==step.manifestSha256||receipt.source_sha256!==step.sourceSha256||receipt.verifier_sha256!==step.verifierSha256
   ||receipt.precondition_evidence_digest!==preconditionDigest(plan,step,owner))return fail(`RECEIPT_BINDING_DRIFT ${step.name}`);
 }
 // Every applied step's own checks run on every replay, whichever step is last.
 for(const step of done)if(step.replayVerifierSql!==undefined)await client.query(step.replayVerifierSql);
 // Every applied step's postcondition digest is compared, not only the last one's: appending a step must not retire
 // the check of an earlier step's objects (a later step never changes an earlier step's objects without its own design).
 const postconditions=async()=>{for(const [index,step] of done.entries())if(receipts[index]?.postcondition_evidence_digest!==await step.postconditionEvidence(client))return fail(`POSTCONDITION_DRIFT ${step.name}`);};
 await postconditions();
 for(const step of plan.forwardChain.slice(done.length)){
  await client.query(step.sql);
  await client.query(step.verifierSql);
  const post=await step.postconditionEvidence(client);
  await client.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[step.name]);
  await client.query(`INSERT INTO public.debateai_schema_migration_step(source_name,base_recipe_sha256,previous_manifest_sha256,forward_manifest_sha256,source_sha256,verifier_sha256,precondition_evidence_digest,postcondition_evidence_digest,executed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,statement_timestamp())`,
   [step.name,plan.recipeSha256,step.previousManifestSha256,step.manifestSha256,step.sourceSha256,step.verifierSha256,preconditionDigest(plan,step,owner),post]);
 }
 // A step applied in THIS run must keep every earlier step's rules too: all applied steps' own checks run again here,
 // before the caller commits, so a breaking step is rolled back instead of caught on the next migrate().
 if(plan.forwardChain.length>done.length){
  for(const step of plan.forwardChain)if(step.replayVerifierSql!==undefined)await client.query(step.replayVerifierSql);
  await postconditions();
 }
 await assertReceiptAcl(client,owner);
}
