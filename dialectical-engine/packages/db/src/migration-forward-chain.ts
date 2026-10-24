import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { MigrationPlan } from './migration-lineage.js';
import { migrationRefusal, N1_GRANDFATHERED_THROUGH, parseN1Header, type N1Declaration } from './migration-n1.js';
import { loadForward111 } from './migration-forward111.js';
import { loadForwardAuthDbBatch } from './migration-forward-auth-db-batch.js';
import { loadForward0113 } from './migration-forward0113.js';
import { loadForward0114 } from './migration-forward0114.js';
import { loadForward115 } from './migration-forward115.js';
import { loadForward0116 } from './migration-forward0116.js';
import { loadForward0117 } from './migration-forward0117.js';
import { loadForward0118 } from './migration-forward0118.js';
import { loadForward0119 } from './migration-forward0119.js';
import { loadForward0120 } from './migration-forward0120.js';
import { loadForward0121 } from './migration-forward0121.js';
import { loadForward0122 } from './migration-forward0122.js';
import { loadForward0123 } from './migration-forward0123.js';
import { loadForward0124 } from './migration-forward0124.js';
import { loadForward0125 } from './migration-forward0125.js';

/**
 * The forward steps after dev's sealed lineage, its 0108 and its 0110 (PR-54, PR-58, migrations/lineage/README.md): an
 * ordered chain. Each step has its own manifest, bound to the base recipe, to the step before it (0110's manifest for
 * the first) and to the effective-capability verifier it supersedes (the sealed one for the first: 0110 keeps it in
 * force); its own loader; and its own receipt row in public.debateai_schema_migration_step. The verifier of the last
 * applied step replaces dev's sealed verifier at the end of every migrate(). A new step appends its loader to STEPS and
 * edits no earlier step's file. Side-by-side spec 2026-10-21 §5: migrate()'s prologue replays the applied prefix
 * (replayForwardChain), then each pending step commits on its own (applyForwardStep inside its own transaction), so a
 * step's locks never outlive it and a step that fails leaves every earlier step applied. Each step after 0122 also
 * records its n1 header in public.debateai_schema_migration_step_n1, so an older release can accept a database at most
 * one release ahead (migration-ahead.ts, side-by-side §5 "database ahead").
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
/**
 * A loaded chain step with its n1 header (side-by-side spec 2026-10-21 §5; migration-n1.ts), parsed once from the
 * step's own reviewed SQL: whether it is expand or drained, keeps the verifier in force, or builds one index outside a
 * transaction.
 */
export type ChainStep=ForwardStepPlan&Readonly<{n1:N1Declaration}>;

/**
 * The chain, in order: 0111 (NETOPIA), then the auth DB batch (0112), then Part C's prices (0113, spec 2026-10-05
 * §2.16.6), then role rotation (0114, spec 2026-10-11 Part 3), then the data export (0115, V-41), then the mail locale carrier
 * (0116, mission email-locale S01-C05), then the debate shape's map (0117, spec 2026-10-12 §3.4), then the language
 * check's site cost (0118, spec 2026-10-13), then the reclaim resume (0119, spec 2026-10-14), then the reply measures
 * (0120, spec 2026-10-15 length guidance), then the engine verdict (0121, spec 2026-10-15 engine redesign R2), then the
 * engine's map answer step (0122, spec 2026-10-15 engine redesign R3), then the side-by-side releases (0123, spec
 * 2026-10-21 side-by-side uploads), then the settings activation (0124, side-by-side spec §13: settings changes without
 * an upload), then the Italy-specific approval (0125, mission italy-clause-approval). A new step appends its loader here
 * (README).
 */
const STEPS:readonly StepLoader[]=Object.freeze([loadForward111,loadForwardAuthDbBatch,loadForward0113,loadForward0114,loadForward115,loadForward0116,loadForward0117,loadForward0118,loadForward0119,loadForward0120,loadForward0121,loadForward0122,loadForward0123,loadForward0124,loadForward0125]);

/** A forward step's file name; the receipt and declaration tables CHECK the same shape. */
export const FORWARD_STEP_NAME=/^\d{4}_[a-z0-9_]+\.sql$/;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD_CHAIN_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');

export async function loadForwardChain(first:ForwardStepAnchor):Promise<readonly ChainStep[]>{
 const chain:ChainStep[]=[];let anchor=first;
 for(const load of STEPS){
  const step=await load(anchor);
  if(!FORWARD_STEP_NAME.test(step.name)||step.name<=anchor.previousName||step.previousName!==anchor.previousName
   ||step.previousManifestSha256!==anchor.previousManifestSha256||step.previousVerifierSha256!==anchor.previousVerifierSha256)fail('ORDER');
  // side-by-side §5: after 0122 the header says whether the step keeps the verifier in force, and its manifest must
  // agree (it names the verifier of the step before it exactly when it keeps it).
  const n1=parseN1Header(step.name,step.sql);
  if(step.name>N1_GRANDFATHERED_THROUGH&&n1.keepsVerifier!==(step.verifierSha256===step.previousVerifierSha256)){
   throw migrationRefusal('MIGRATION_FORWARD_CHAIN_N1_KEEPS_VERIFIER',step.name);
  }
  chain.push(Object.freeze({...step,n1}));
  anchor={baseRecipeSha256:first.baseRecipeSha256,previousName:step.name,previousManifestSha256:step.manifestSha256,previousVerifierSha256:step.verifierSha256};
 }
 return Object.freeze(chain);
}

/** The applied prefix of the chain; any other applied subset is refused. */
export function appliedForwardSteps(plan:Pick<MigrationPlan,'forwardChain'>,applied:ReadonlySet<string>):readonly ChainStep[]{
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
type Column=Readonly<{name:string;type:string;required:boolean}>;
const RECEIPT_SHAPE:readonly Column[]=RECEIPT_COLUMNS.map(name=>({name,type:name==='executed_at'?'timestamp with time zone':'text',required:true}));
/**
 * Side-by-side §5 ("database ahead"): one row per applied step after 0122, written in that step's own transaction:
 * its n1 header and the manifest SHA-256 of the LAST step of the chain of the code that applied it (one newer release =
 * one head). An older release reads these rows for the steps it does not know, so this shape is frozen for as long as
 * an older release can start (migrations/lineage/README.md).
 */
const DECLARATION_SHAPE:readonly Column[]=[{name:'source_name',type:'text',required:true},{name:'n1_expand',type:'boolean',required:true},
 {name:'keeps_verifier',type:'boolean',required:true},{name:'outside_transaction',type:'boolean',required:true},
 {name:'chain_head_manifest_sha256',type:'text',required:true},{name:'recorded_at',type:'timestamp with time zone',required:true}];
async function assertPrivateTable(client:PoolClient,owner:Readonly<{oid:string}>,table:string,shape:readonly Column[],keys:number,drift:string):Promise<void>{
 // The receipt and the declaration tables are private to the installer, as 0108's receipt is (migration-forward108.ts,
 // the same principal gate): no grant to anyone, no column grant, and no debateai_ role or runtime alias (indirect and
 // SET-only included) able to act as their owner; exact columns and CHECK/PRIMARY KEY count.
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
   AND (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype IN('c','p'))=$4::bigint
   AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype NOT IN('c','p','n'))
  AS valid FROM pg_class c WHERE c.oid=to_regclass($3)
 `,[owner.oid,JSON.stringify(shape),table,keys])).rows[0];
 if(row?.valid!==true)return fail(drift);
}
const assertReceiptAcl=(client:PoolClient,owner:Readonly<{oid:string}>):Promise<void>=>
 assertPrivateTable(client,owner,'public.debateai_schema_migration_step',RECEIPT_SHAPE,9,'RECEIPT_ACL_DRIFT');
/** The declaration table: its primary key and its two CHECKs (the step-name shape and the 64-hex head). */
const assertDeclarationAcl=(client:PoolClient,owner:Readonly<{oid:string}>):Promise<void>=>
 assertPrivateTable(client,owner,'public.debateai_schema_migration_step_n1',DECLARATION_SHAPE,3,'DECLARATION_ACL_DRIFT');

/**
 * Read-only, for the "database ahead" check (migration-ahead.ts, side-by-side §5), which also runs outside migrate():
 * the executor is the installer, and the receipt and declaration tables, where they exist, pass the checks
 * replayForwardChain makes. Says which of the two exist.
 */
export async function assertForwardRecordsPrivate(client:PoolClient):Promise<Readonly<{receipts:boolean;declarations:boolean}>>{
 const owner=await executor(client);
 const present=(await client.query<{receipts:boolean;declarations:boolean}>("SELECT to_regclass('public.debateai_schema_migration_step') IS NOT NULL receipts,to_regclass('public.debateai_schema_migration_step_n1') IS NOT NULL declarations")).rows[0];
 const receipts=present?.receipts===true,declarations=present?.declarations===true;
 if(receipts)await assertReceiptAcl(client,owner);
 if(declarations)await assertDeclarationAcl(client,owner);
 return Object.freeze({receipts,declarations});
}

function preconditionDigest(plan:MigrationPlan,step:ChainStep,owner:unknown):string{
 const index=plan.forwardChain.indexOf(step);
 return sha(JSON.stringify({version:step.version,baseRecipeSha256:plan.recipeSha256,baseTerminal:[...plan.manifest.order].sort(),
  forward108:{name:plan.forward108.name,manifestSha256:plan.forward108.manifestSha256},
  forward110:{name:plan.forward110.name,manifestSha256:plan.forward110.manifestSha256},
  prior:plan.forwardChain.slice(0,index).map(({name,manifestSha256})=>({name,manifestSha256})),owner,
  step:{name:step.name,manifestSha256:step.manifestSha256,sourceSha256:step.sourceSha256,verifierSha256:step.verifierSha256,previousVerifierSha256:step.previousVerifierSha256}}));
}

type Receipt=Readonly<Record<(typeof RECEIPT_COLUMNS)[number],string>>;
const readReceipts=async(client:PoolClient):Promise<readonly Receipt[]>=>
 (await client.query<Receipt>('SELECT * FROM public.debateai_schema_migration_step ORDER BY source_name')).rows;
/**
 * Every applied step's postcondition digest is compared, not only the last one's: appending a step must not retire the
 * check of an earlier step's objects (a later step never changes an earlier step's objects without its own design).
 */
async function assertPostconditions(client:PoolClient,applied:readonly ChainStep[],receipts:readonly Receipt[]):Promise<void>{
 for(const [index,step] of applied.entries())if(receipts[index]?.postcondition_evidence_digest!==await step.postconditionEvidence(client))return fail(`POSTCONDITION_DRIFT ${step.name}`);
}

/**
 * Runs in migrate()'s prologue transaction, after applyForward110: 0108 and 0110 are applied and the effective
 * verifier has passed. It creates the private receipt table on first use, checks its ACL, binds every applied step to
 * its receipt, and runs every applied step's own checks and postcondition. Applied steps are replayed only by their
 * receipts; their SQL never runs twice. Returns the applied prefix of the chain (side-by-side spec 2026-10-21 §5). It
 * also creates the private declaration table on first use and checks its ACL. `extra` names the applied steps a newer
 * release added (splitLedger, "database ahead"): their receipts are left to the acceptance check (migration-ahead.ts),
 * and every other receipt binds to this code's applied prefix exactly.
 */
export async function replayForwardChain(client:PoolClient,plan:MigrationPlan,applied:ReadonlySet<string>,extra:readonly string[]=[]):Promise<readonly ChainStep[]>{
 const done=appliedForwardSteps(plan,applied);
 if(plan.forwardChain.length===0)return done;
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
 // Side-by-side §5: the declaration table, created on first use (a database migrated before it has no row to carry:
 // steps up to 0122 declare nothing).
 if((await client.query<{present:boolean}>("SELECT to_regclass('public.debateai_schema_migration_step_n1') IS NOT NULL present")).rows[0]?.present!==true){
  await client.query(`CREATE TABLE public.debateai_schema_migration_step_n1(
   source_name text PRIMARY KEY CONSTRAINT fwdstep_source_check CHECK(source_name ~ '^[0-9]{4}_[a-z0-9_]+[.]sql$'),
   n1_expand boolean NOT NULL,
   keeps_verifier boolean NOT NULL,
   outside_transaction boolean NOT NULL,
   chain_head_manifest_sha256 text NOT NULL CONSTRAINT fwdstep_head_sha_check CHECK(chain_head_manifest_sha256 ~ '^[0-9a-f]{64}$'),
   recorded_at timestamptz NOT NULL
  )`);
  await client.query('REVOKE ALL ON public.debateai_schema_migration_step_n1 FROM PUBLIC');
 }
 await assertDeclarationAcl(client,owner);
 const ahead=new Set(extra);
 const receipts=(await readReceipts(client)).filter(receipt=>!ahead.has(receipt.source_name));
 if(receipts.length!==done.length)return fail('RECEIPT_BINDING_DRIFT');
 for(const [index,step] of done.entries()){
  const receipt=receipts[index];
  if(receipt?.source_name!==step.name||receipt.base_recipe_sha256!==plan.recipeSha256||receipt.previous_manifest_sha256!==step.previousManifestSha256
   ||receipt.forward_manifest_sha256!==step.manifestSha256||receipt.source_sha256!==step.sourceSha256||receipt.verifier_sha256!==step.verifierSha256
   ||receipt.precondition_evidence_digest!==preconditionDigest(plan,step,owner))return fail(`RECEIPT_BINDING_DRIFT ${step.name}`);
 }
 // Every applied step's own checks run on every replay, whichever step is last.
 for(const step of done)if(step.replayVerifierSql!==undefined)await client.query(step.replayVerifierSql);
 await assertPostconditions(client,done,receipts);
 return done;
}

/** The steps after the replayed prefix `done`, in chain order. */
export function pendingForwardSteps(plan:Pick<MigrationPlan,'forwardChain'>,done:readonly ChainStep[]):readonly ChainStep[]{
 if(done.some((step,index)=>step!==plan.forwardChain[index]))return fail('ORDER');
 return plan.forwardChain.slice(done.length);
}

/**
 * Applies ONE pending step inside the caller's transaction (migrate()'s step transaction, side-by-side spec §5): its
 * SQL (or, for an outside-transaction step, the check that runOutsideTransactionStep left a valid index), its
 * superseding verifier and its postcondition; then its ledger row, its receipt and (after 0122) its declaration row;
 * then every applied step's own checks and postcondition with this step included, and both tables' ACL, so a step that
 * breaks an earlier step's rules is rolled back before its COMMIT instead of caught on the next migrate().
 */
export async function applyForwardStep(client:PoolClient,plan:MigrationPlan,step:ChainStep,done:readonly ChainStep[]):Promise<void>{
 if(done.some((entry,index)=>entry!==plan.forwardChain[index])||plan.forwardChain[done.length]!==step)return fail('ORDER');
 const owner=await executor(client);
 // replayForwardChain created the receipt table in the prologue, before any step.
 if((await client.query<{present:boolean}>("SELECT to_regclass('public.debateai_schema_migration_step') IS NOT NULL present")).rows[0]?.present!==true)return fail('RECEIPT_MISSING');
 if((await client.query<{present:boolean}>("SELECT to_regclass('public.debateai_schema_migration_step_n1') IS NOT NULL present")).rows[0]?.present!==true)return fail('DECLARATION_MISSING');
 if(step.n1.outsideTransaction)await assertConcurrentIndexValid(client,step);
 else await client.query(step.sql);
 await client.query(step.verifierSql);
 const post=await step.postconditionEvidence(client);
 await client.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[step.name]);
 await client.query(`INSERT INTO public.debateai_schema_migration_step(source_name,base_recipe_sha256,previous_manifest_sha256,forward_manifest_sha256,source_sha256,verifier_sha256,precondition_evidence_digest,postcondition_evidence_digest,executed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,statement_timestamp())`,
  [step.name,plan.recipeSha256,step.previousManifestSha256,step.manifestSha256,step.sourceSha256,step.verifierSha256,preconditionDigest(plan,step,owner),post]);
 // Side-by-side §5: the step's n1 header and this code's chain head, so an older release can tell expand steps of ONE
 // newer release from anything else. 0122 and earlier predate the header and record nothing.
 if(step.name>N1_GRANDFATHERED_THROUGH){
  await client.query('INSERT INTO public.debateai_schema_migration_step_n1(source_name,n1_expand,keeps_verifier,outside_transaction,chain_head_manifest_sha256,recorded_at) VALUES($1,$2,$3,$4,$5,statement_timestamp())',
   [step.name,step.n1.expand,step.n1.keepsVerifier,step.n1.outsideTransaction,plan.forwardChain.at(-1)!.manifestSha256]);
 }
 // This step must keep every earlier step's rules too: all applied steps' own checks, this one's included, before COMMIT.
 const applied=[...done,step];
 for(const entry of applied)if(entry.replayVerifierSql!==undefined)await client.query(entry.replayVerifierSql);
 const receipts=await readReceipts(client);
 if(receipts.length!==applied.length||receipts.some((receipt,index)=>receipt.source_name!==applied[index]?.name))return fail(`RECEIPT_BINDING_DRIFT ${step.name}`);
 await assertPostconditions(client,applied,receipts);
 await assertReceiptAcl(client,owner);
 await assertDeclarationAcl(client,owner);
}

const PLAIN_NAME=/^[a-z_][a-z0-9_]*$/;
/** The index an outside-transaction step builds and its table; their names are plain, as parseN1Header admits them. */
const concurrentIndexOf=(step:ChainStep):Readonly<{schema:string;table:string;name:string}>=>{
 const index=step.n1.concurrentIndex;
 if(!step.n1.outsideTransaction||index===null||!PLAIN_NAME.test(index.schema)||!PLAIN_NAME.test(index.table)||!PLAIN_NAME.test(index.name)){
  throw migrationRefusal('MIGRATION_FORWARD_CHAIN_OUTSIDE_TRANSACTION_UNDECLARED',step.name);
 }
 return index;
};

/** A valid index of that name ON the step's own table (A6 review: a same-named index elsewhere is not the step's). */
async function assertConcurrentIndexValid(client:PoolClient,step:ChainStep):Promise<void>{
 const index=concurrentIndexOf(step);
 const row=(await client.query<{valid:boolean}>('SELECT indisvalid valid FROM pg_index WHERE indexrelid=to_regclass($1) AND indrelid=to_regclass($2)',
  [`${index.schema}.${index.name}`,`${index.schema}.${index.table}`])).rows[0];
 if(row?.valid!==true)throw migrationRefusal('MIGRATION_OUTSIDE_TRANSACTION_INDEX_INVALID',step.name);
}

/**
 * The one statement of an outside-transaction step (n1 `outside-transaction`: a concurrent index build, which cannot
 * run inside a transaction), on the migration session with the same 2 s lock wait. An INVALID index of that name on
 * the step's table, left by a build that was interrupted or timed out, is dropped concurrently first, so the build
 * starts clean (IF NOT EXISTS would keep the invalid one). migrate() then records the step in a normal step
 * transaction, which refuses unless that index is valid and on that table. The caller retries a lock wait that ran out
 * (withMigrationLockRetry).
 */
export async function runOutsideTransactionStep(client:PoolClient,step:ChainStep):Promise<void>{
 const index=concurrentIndexOf(step);
 const qualified=`${index.schema}.${index.name}`;
 await client.query("SET lock_timeout = '2s'");
 try{
  const invalid=(await client.query<{invalid:boolean}>('SELECT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass($1) AND indrelid=to_regclass($2) AND NOT indisvalid) invalid',
   [qualified,`${index.schema}.${index.table}`])).rows[0]?.invalid===true;
  if(invalid)await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${qualified}`);
  await client.query(step.sql);
 }finally{
  await client.query('RESET lock_timeout');
 }
}
