import { describe, expect, it, vi } from 'vitest';
import { computeRegisterSnapshotSha256 } from '@debateai/register';
import { loadMigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { NativeVerifyDatabaseAheadError,NativeVerifyPendingForwardStepError,pendingForwardSteps,refusePendingForwardSteps,verifyNativeState } from '../../deploy/preview-auth-dev/v1/verify-native.js';
// migrate() is replaced so these synthetic pools never run it: verifyNativeState runs it once on every database it accepts,
// with the pinned newer chain on a database ahead (D5 review). By default it reports a database that is not ahead.
const migrate=vi.hoisted(()=>vi.fn(async(_pool:unknown,_options?:unknown)=>({appliedSteps:[] as string[],extraSteps:[] as string[]})));
vi.mock('@debateai/db',async original=>({...(await original<typeof import('@debateai/db')>()),migrate}));
const operator=await import('../../deploy/'+'preview-auth-dev/v1/native-operator.mjs');
const ahead=await import('../../deploy/'+'preview-auth-dev/v1/database-ahead.mjs');
describe('native verify and pending forward steps',()=>{
 // dev's own tests/unit/preview-auth-dev-pending-forward.test.ts covers the chain-only cases; these use the full source shape.
 // Re-review 2026-10-09: every numbered migration of the source counts, not only the chain — dev's 0110 is applied
 // after 0108 as its own forward110, outside plan.forwardChain, and verify must not apply it either.
 const source={manifest:{order:['0000_s00.sql','0093_billing_runtime_role.sql','0107_auth_dev_integration.sql']},forward108:{name:'0108_preview_recovery_verified_bindings.sql'},
  forward110:{name:'0110_account_erasure_public_debates.sql'},forwardChain:[{name:'0111_billing_netopia.sql'},{name:'0112_auth_db_batch.sql'}]} as unknown as Parameters<typeof pendingForwardSteps>[0];
 it('names a pending separate forward110 and any other numbered migration, in source order',()=>{
  const base=['0000_s00.sql','0093_billing_runtime_role.sql','0107_auth_dev_integration.sql','0108_preview_recovery_verified_bindings.sql'];
  expect(pendingForwardSteps(source,new Set(base))).toEqual(['0110_account_erasure_public_debates.sql','0111_billing_netopia.sql','0112_auth_db_batch.sql']);
  expect(pendingForwardSteps(source,new Set([...base,'0110_account_erasure_public_debates.sql','0111_billing_netopia.sql']))).toEqual(['0112_auth_db_batch.sql']);
  expect(pendingForwardSteps(source,new Set(['0108_preview_recovery_verified_bindings.sql']))).toEqual(['0000_s00.sql','0093_billing_runtime_role.sql','0107_auth_dev_integration.sql','0110_account_erasure_public_debates.sql','0111_billing_netopia.sql','0112_auth_db_batch.sql']);
 });
 it('counts a migration recorded in the resolution table (by logical name) as applied, and only reads',async()=>{
  const queries:string[]=[];
  const pool=(ledger:string[],resolved:string[])=>({query:async(sql:string)=>{queries.push(sql);
   if(/to_regclass/.test(sql))return {rows:[{present:true}]};
   if(/debateai_schema_migration_resolution/.test(sql))return {rows:resolved.map(logical_name=>({logical_name}))};
   return {rows:ledger.map(name=>({name}))};}}) as unknown as Parameters<typeof refusePendingForwardSteps>[0];
  const everything=['0000_s00.sql','0107_auth_dev_integration.sql','0108_preview_recovery_verified_bindings.sql','0110_account_erasure_public_debates.sql','0111_billing_netopia.sql','0112_auth_db_batch.sql'];
  // The live preview's 0093 is a resolution (compatibility body), not a ledger row: that is complete, not pending.
  await expect(refusePendingForwardSteps(pool(everything,['0093_billing_runtime_role.sql']),source as never)).resolves.toBeUndefined();
  await expect(refusePendingForwardSteps(pool(everything,[]),source as never)).rejects.toMatchObject({code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP',pending:['0093_billing_runtime_role.sql']});
  await expect(refusePendingForwardSteps(pool(everything.filter(n=>!n.startsWith('0110')),['0093_billing_runtime_role.sql']),source as never)).rejects.toMatchObject({pending:['0110_account_erasure_public_debates.sql']});
  expect(queries.every(sql=>/^\s*SELECT/i.test(sql))).toBe(true);
 });
 it('refuses with a code and a message that tell the operator to run apply-and-plan',()=>{
  const error=new NativeVerifyPendingForwardStepError(['0111_billing_netopia.sql','0112_auth_db_batch.sql']);
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP');
  expect(error.pending).toEqual(['0111_billing_netopia.sql','0112_auth_db_batch.sql']);
  expect(error.message).toMatch(/^PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: /);
  expect(error.message).toContain('0111_billing_netopia.sql, 0112_auth_db_batch.sql');
  expect(error.message).toContain('apply-and-plan');
 });
 it('the native operator prints that refusal and keeps every other failure opaque',()=>{
  const pending=new NativeVerifyPendingForwardStepError(['0112_auth_db_batch.sql']);
  expect(operator.operatorRefusalLine(pending)).toBe(`${pending.message}\n`);
  expect(operator.operatorRefusalLine(new TypeError('PREVIEW_NATIVE_VERIFICATION_REFUSED'))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  expect(operator.operatorRefusalLine(Object.assign(new Error('secret detail\nsecond line'),{code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP'}))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  expect(operator.operatorRefusalLine(undefined)).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
 });
});

// Side-by-side spec §5 ("database ahead", G6): an older release's verify accepts a database a newer release moved forward
// by n1-expand steps only against the newer release's root-pinned database-ahead file, and says so in its proof.
const H='e'.repeat(64),S1='1'.repeat(64),S2='2'.repeat(64);
// Probe names after this source's chain head (0134, the dig model and the month pause, after the Perplexity plan's
// investigations 0133 and web evidence store 0132): a newer release's steps.
const NEXT='0135_side_next.sql',MORE='0136_more.sql';
const ROW={rowKey:'fixtureRow',valueJsonText:'1',sourceRef:'native verify fixture'};
const SNAPSHOT=computeRegisterSnapshotSha256([ROW] as unknown as Parameters<typeof computeRegisterSnapshotSha256>[0]);
const publication={publicationId:'11111111-1111-4111-8111-111111111111',publicationKind:'GENERAL',baseRegisterVersion:'11',registerVersion:'12',requestSha256:'a'.repeat(64),snapshotSha256:SNAPSHOT,rowCount:1,recordedAt:'2026-10-21T12:00:00.000Z'} as const;
const binding={sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),nativeSourceSha256:'c'.repeat(64),publication} as unknown as Parameters<typeof verifyNativeState>[1];
const plan=await loadMigrationPlan();
/** Every numbered migration of this source: the database has them all (refusePendingForwardSteps passes). */
const KNOWN=pendingForwardSteps(plan,new Set());
/** The newer release's whole chain as its describeForwardSteps() prints it: this source's chain, then its own steps. */
const declaration=(name:string,sourceSha256:string,patch:Record<string,unknown>={})=>({name,manifestSha256:'7'.repeat(64),sourceSha256,verifierSha256:'8'.repeat(64),n1Expand:true,keepsVerifier:true,outsideTransaction:false,...patch});
const OWN_CHAIN=plan.forwardChain.map(step=>({name:step.name,manifestSha256:step.manifestSha256,sourceSha256:step.sourceSha256,verifierSha256:step.verifierSha256,n1Expand:step.n1.expand,keepsVerifier:step.n1.keepsVerifier,outsideTransaction:step.n1.outsideTransaction}));
const NEWER_CHAIN=[...OWN_CHAIN,declaration(NEXT,S1),declaration(MORE,S2)];
const pinned=(patch:Record<string,unknown>={})=>({fileSha256:H,newerLabel:'new-v1',accepted:[{name:NEXT,sha256:S1},{name:MORE,sha256:S2}],newerChain:NEWER_CHAIN,...patch});
/** A synthetic native pool whose ledger holds `names`; it answers every read verifyNativeState makes and refuses anything else. */
function poolWithLedger(names:readonly string[]){
 const statements:string[]=[];
 const answer=(text:string):unknown[]=>{
  statements.push(text);
  if(/^\s*(BEGIN READ ONLY|COMMIT|ROLLBACK)\s*$/.test(text))return [];
  if(text.includes("name='0108_preview_recovery_verified_bindings.sql'"))return [{name:'0108_preview_recovery_verified_bindings.sql'}];
  if(text.includes('to_regclass'))return [{present:false}];
  if(text.includes('SELECT name,applied_at'))return names.map(name=>({name,applied_at:'2026-10-21T00:00:00.000Z'}));
  if(/SELECT name FROM public\.debateai_schema_migration(\s|$)/.test(text))return names.map(name=>({name}));
  if(text.includes('FROM public.debateai_schema_migration_resolution'))return [];
  if(text.includes('FROM public.debateai_schema_migration_forward'))return [{source_name:'0108_preview_recovery_verified_bindings.sql'}];
  if(text.includes('current_user role'))return [{role:'debateai_prod_migrator',oid:16388,major:18,ledger_owner:16388,billing_owner:16388}];
  if(text.includes('pg_get_functiondef'))return [];
  if(text.includes('mfa_recovery_legacy_cohort'))return [{n:0}];
  if(text.includes('has_function_privilege'))return [];
  if(text.includes('regprocedure'))return [{n:6}];
  if(text.includes('register_version=$1 AND sealed'))return [{register_version:'12',base_register_version:'11',publication_id:publication.publicationId,publication_kind:'GENERAL',
   request_sha256:publication.requestSha256,snapshot_sha256:SNAPSHOT,row_count:1,recorded_at:publication.recordedAt}];
  if(text.includes('SELECT sealed,row_count'))return [{sealed:true,row_count:1,snapshot_sha256:SNAPSHOT,actual_sha256:SNAPSHOT,historical:false}];
  if(text.includes('FROM register.register_row'))return [{row_key:ROW.rowKey,value_json:ROW.valueJsonText,source_ref:ROW.sourceRef}];
  throw new Error(`unexpected statement: ${text}`);
 };
 const query=async(text:string)=>({rows:answer(text)});
 const pool={query,connect:async()=>({query,release:()=>undefined}),statements};
 return pool as unknown as Parameters<typeof verifyNativeState>[0]&{statements:string[]};
}
describe('native verify on a database ahead of this source (side-by-side spec §5)',()=>{
 it('keeps today\'s path on a database that is not ahead: migrate() runs and the proof says databaseAhead null',async()=>{
  migrate.mockClear();
  const verifyDatabaseAhead=vi.fn();
  const proof=await verifyNativeState(poolWithLedger(KNOWN),binding,{databaseAhead:pinned(),verifyDatabaseAhead});
  expect(proof.databaseAhead).toBeNull();
  expect(proof.forwardCount).toBe(1);
  expect(migrate).toHaveBeenCalledTimes(1);
  expect(migrate.mock.calls[0]![1]).toEqual({});
  expect(verifyDatabaseAhead).not.toHaveBeenCalled();
 });
 it('refuses a database ahead of this source with its own line when no newer list is pinned',async()=>{
  migrate.mockClear();
  const refusal=await verifyNativeState(poolWithLedger([...KNOWN,NEXT]),binding).then(()=>undefined,(error:unknown)=>error);
  expect(refusal).toBeInstanceOf(NativeVerifyDatabaseAheadError);
  expect(refusal).toMatchObject({code:'PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD',extra:[NEXT]});
  expect((refusal as Error).message).toBe(`PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD: the database has steps this release does not know: ${NEXT}. Pin the newer release's database-ahead file with prestart.mjs accept-ahead first.`);
  await expect(verifyNativeState(poolWithLedger([...KNOWN,NEXT]),binding,{databaseAhead:null})).rejects.toMatchObject({code:'PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD'});
  expect(migrate).not.toHaveBeenCalled();
 });
 it('accepts a database ahead by a prefix of the pinned list and records it in the proof',async()=>{
  migrate.mockClear();
  migrate.mockResolvedValueOnce({appliedSteps:[],extraSteps:[NEXT]});
  const verifyDatabaseAhead=vi.fn(async()=>({mode:'AHEAD' as const,knownSteps:OWN_CHAIN.length,extraSteps:[NEXT]}));
  const pool=poolWithLedger([...KNOWN,NEXT]);
  const proof=await verifyNativeState(pool,binding,{databaseAhead:pinned(),verifyDatabaseAhead});
  expect(proof.databaseAhead).toEqual({fileSha256:H,newerLabel:'new-v1',extraSteps:[NEXT]});
  // Plan A's read-only check first, then the full replay, both with the newer release's whole chain.
  expect(verifyDatabaseAhead).toHaveBeenCalledWith(pool,{newerChain:NEWER_CHAIN});
  expect(migrate).toHaveBeenCalledTimes(1);
  expect(migrate).toHaveBeenCalledWith(pool,{newerChain:NEWER_CHAIN});
  expect(verifyDatabaseAhead.mock.invocationCallOrder[0]!).toBeLessThan(migrate.mock.invocationCallOrder[0]!);
  expect(proof).toMatchObject({forwardCount:1,ledgerCount:KNOWN.length+1,currentContractVerified:true,publication});
  migrate.mockResolvedValueOnce({appliedSteps:[],extraSteps:[NEXT,MORE]});
  const both=vi.fn(async()=>({mode:'AHEAD' as const,knownSteps:OWN_CHAIN.length,extraSteps:[NEXT,MORE]}));
  expect((await verifyNativeState(poolWithLedger([...KNOWN,NEXT,MORE]),binding,{databaseAhead:pinned(),verifyDatabaseAhead:both})).databaseAhead).toEqual({fileSha256:H,newerLabel:'new-v1',extraSteps:[NEXT,MORE]});
 });
 it('refuses an extra step that is not in the pinned list, or out of its order',async()=>{
  const verifyDatabaseAhead=vi.fn();
  for(const ledger of [[...KNOWN,'0135_other.sql'],[...KNOWN,MORE],[...KNOWN,NEXT,MORE,'0137_third.sql']]){
   const refusal=await verifyNativeState(poolWithLedger(ledger),binding,{databaseAhead:pinned(),verifyDatabaseAhead}).then(()=>undefined,(error:unknown)=>error);
   expect(refusal).toMatchObject({code:'DATABASE_AHEAD_NOT_ACCEPTED'});
   expect((refusal as Error).message).toMatch(/^DATABASE_AHEAD_NOT_ACCEPTED NOT_PINNED \d{4}_[a-z0-9_]+\.sql$/);
  }
  expect(verifyDatabaseAhead).not.toHaveBeenCalled();
 });
 it('passes plan A\'s refusal through, and refuses a report that names other steps than the ledger',async()=>{
  const refusal=Object.assign(new Error('DATABASE_AHEAD_NOT_ACCEPTED CHAIN_BROKEN 0135_side_next.sql'),{code:'DATABASE_AHEAD_NOT_ACCEPTED'});
  await expect(verifyNativeState(poolWithLedger([...KNOWN,NEXT]),binding,{databaseAhead:pinned(),verifyDatabaseAhead:vi.fn(async()=>{throw refusal;})})).rejects.toBe(refusal);
  const other=vi.fn(async()=>({mode:'AHEAD' as const,knownSteps:OWN_CHAIN.length,extraSteps:[NEXT,MORE]}));
  await expect(verifyNativeState(poolWithLedger([...KNOWN,NEXT]),binding,{databaseAhead:pinned(),verifyDatabaseAhead:other})).rejects.toThrow('PREVIEW_NATIVE_VERIFICATION_REFUSED');
 });
 it('refuses a replay that applied a step or reports other extra steps, and passes the replay\'s own refusal through',async()=>{
  const accepted=vi.fn(async()=>({mode:'AHEAD' as const,knownSteps:OWN_CHAIN.length,extraSteps:[NEXT]}));
  for(const report of [{appliedSteps:[],extraSteps:[]},{appliedSteps:[],extraSteps:[NEXT,MORE]},{appliedSteps:[NEXT],extraSteps:[NEXT]}]){
   migrate.mockResolvedValueOnce(report);
   await expect(verifyNativeState(poolWithLedger([...KNOWN,NEXT]),binding,{databaseAhead:pinned(),verifyDatabaseAhead:accepted})).rejects.toThrow('PREVIEW_NATIVE_VERIFICATION_REFUSED');
  }
  migrate.mockResolvedValueOnce({appliedSteps:['0123_side_by_side_releases.sql'],extraSteps:[]});
  await expect(verifyNativeState(poolWithLedger(KNOWN),binding)).rejects.toThrow('PREVIEW_NATIVE_VERIFICATION_REFUSED');
  const refusal=Object.assign(new Error('DATABASE_AHEAD_NOT_ACCEPTED NEWER_CHAIN_MISMATCH 0135_side_next.sql'),{code:'DATABASE_AHEAD_NOT_ACCEPTED'});
  migrate.mockRejectedValueOnce(refusal);
  await expect(verifyNativeState(poolWithLedger([...KNOWN,NEXT]),binding,{databaseAhead:pinned(),verifyDatabaseAhead:accepted})).rejects.toBe(refusal);
 });
 it('still refuses a pending step of its own first, ahead or not',async()=>{
  await expect(verifyNativeState(poolWithLedger([...KNOWN.slice(0,-1),NEXT]),binding,{databaseAhead:pinned()})).rejects.toMatchObject({code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP',pending:[KNOWN.at(-1)]});
 });
 it('the native operator passes the database-ahead line and keeps every other failure opaque',()=>{
  const line=new NativeVerifyDatabaseAheadError([NEXT,MORE]);
  expect(operator.operatorRefusalLine(line)).toBe(`${line.message}\n`);
  expect(line.message).toContain(`${NEXT}, ${MORE}`);
  const forged=Object.assign(new Error(`${line.message}\nsecond line`),{code:'PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD'});
  const unpinned=Object.assign(new Error(`DATABASE_AHEAD_NOT_ACCEPTED NOT_PINNED ${NEXT}`),{code:'DATABASE_AHEAD_NOT_ACCEPTED'});
  for(const other of [forged,unpinned,Object.assign(new Error(line.message),{code:'OTHER'}),new TypeError('PREVIEW_DATABASE_AHEAD_REFUSED')])expect(operator.operatorRefusalLine(other)).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
 });
});

describe('the native operator of each release (side-by-side spec §10)',()=>{
 it('derives the native plan of the release it runs from',()=>{
  expect(operator.nativePlanPathForEntry('/opt/debateai-v3-preview/releases/auth-dev-candidate-d50e33165-r19-v1-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs'))
   .toBe('/etc/debateai-v3-preview/auth-dev-v1/native-plan-d50e33165-r19-v1.json');
  for(const entry of ['/opt/debateai-v3-preview/releases/auth-dev-fallback-x-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs',
   '/opt/debateai-v3-preview/releases/auth-dev-candidate-x-ui/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs',
   '/opt/debateai-v3-preview/releases/auth-dev-candidate-X-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs',
   '/opt/debateai-v3-preview/releases/auth-dev-candidate-x-/-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs',
   '/opt/debateai-v3-preview/releases/auth-dev-candidate-x-api/dialectical-engine/deploy/preview-auth-dev/v1/launch-api.mjs',
   '/tmp/auth-dev-candidate-x-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs',undefined])expect(()=>operator.nativePlanPathForEntry(entry)).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
 });
 it('names the same per-release files as the lifecycle tools (prestart.mjs pins them, common.mjs)',async()=>{
  const common=await import('../../deploy/'+'preview-lifecycle/v1/common.mjs');
  const entry='/opt/debateai-v3-preview/releases/auth-dev-candidate-d50e33165-r19-v1-api/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs';
  expect(operator.nativePlanPathForEntry(entry)).toBe(common.nativePlanPathFor(common.LAYOUT,'d50e33165-r19-v1'));
  expect(ahead.databaseAheadPathForLabel('d50e33165-r19-v1')).toBe(common.databaseAheadPathFor(common.LAYOUT,'d50e33165-r19-v1'));
  for(const label of ['../x','X','x-',''])expect(()=>ahead.databaseAheadPathForLabel(label)).toThrow('PREVIEW_DATABASE_AHEAD_REFUSED');
 });
 it('takes exactly --credential-fd 3, optionally followed by --database-ahead, and hands the peer only the credential pair',()=>{
  expect(operator.parseOperatorArguments(['--credential-fd','3'])).toEqual({databaseAhead:false,peerArguments:['--credential-fd','3']});
  expect(operator.parseOperatorArguments(['--credential-fd','3','--database-ahead'])).toEqual({databaseAhead:true,peerArguments:['--credential-fd','3']});
  expect(operator.parseOperatorArguments([])).toEqual({databaseAhead:false,peerArguments:[]});
  for(const argv of [['--database-ahead'],['--database-ahead','--credential-fd','3'],['--credential-fd','4'],['--credential-fd','3','--database-ahead','x'],['--credential-fd','3','--database-ahead=yes'],['--credential-fd','3','--database-ahead','--database-ahead']])
   expect(()=>operator.parseOperatorArguments(argv)).toThrow('PREVIEW_NATIVE_INPUT_REFUSED');
 });
});

describe('the database-ahead file (preview-database-ahead-v1, side-by-side spec §5)',()=>{
 const OLD_REV='a'.repeat(40),NEW_REV='c'.repeat(40);
 const newerManifest={path:'/opt/debateai-v3-preview/artifacts/auth-dev-new-v1/candidate-api-source.json',sha256:'d'.repeat(64)};
 const file=(patch:Record<string,unknown>={})=>({schema:'preview-database-ahead-v1',olderLabel:'old-v1',olderSourceRevision:OLD_REV,newerLabel:'new-v1',newerSourceRevision:NEW_REV,
  newerSourceManifest:newerManifest,steps:[{name:NEXT,sha256:S1},{name:MORE,sha256:S2}],newerChain:NEWER_CHAIN,...patch});
 const manifest=(patch:Record<string,unknown>={})=>({uid:0,role:'api',sourceRoot:'/opt/debateai-v3-preview/releases/auth-dev-candidate-new-v1-api',sourceRevision:NEW_REV,
  files:[{path:'dialectical-engine/apps/api/src/main.ts',sha256:'3'.repeat(64)},{path:`dialectical-engine/migrations/${NEXT}`,sha256:S1},{path:`dialectical-engine/migrations/${MORE}`,sha256:S2}],...patch});
 const read=(value:unknown,newer:unknown=manifest())=>({
  readFile:vi.fn(async(path:string)=>{expect(path).toBe('/etc/debateai-v3-preview/auth-dev-v1/database-ahead-old-v1.json');return {value,sha256:H};}),
  readManifest:vi.fn(async(reference:unknown)=>{expect(reference).toEqual(newerManifest);return newer;})
 });
 it('checks the file whole: its schema, labels, revisions, ascending steps and the newer chain whose tail they are',()=>{
  expect(ahead.validateDatabaseAheadFile(file())).toEqual(file());
  expect(ahead.DATABASE_AHEAD_SCHEMA).toBe('preview-database-ahead-v1');
  for(const patch of [{schema:'preview-database-ahead-v0'},{olderLabel:'Old'},{newerLabel:'old-v1'},{olderSourceRevision:'x'},{newerSourceRevision:NEW_REV.slice(1)},
   {newerSourceManifest:{path:'relative.json',sha256:H}},{newerSourceManifest:{path:newerManifest.path,sha256:'x'}},{newerSourceManifest:{...newerManifest,extra:1}},
   {steps:[]},{steps:[{name:MORE,sha256:S2},{name:NEXT,sha256:S1}]},{steps:[{name:NEXT,sha256:S1},{name:NEXT,sha256:S1}]},{steps:[{name:'124_x.sql',sha256:S1}]},{steps:[{name:NEXT,sha256:'x'}]},
   {steps:Array.from({length:65},(_,index)=>({name:`${String(1000+index)}_x.sql`,sha256:S1}))},
   {newerChain:[]},{newerChain:[declaration(NEXT,S1)]},{newerChain:[...OWN_CHAIN,declaration(NEXT,S2),declaration(MORE,S2)]},{newerChain:[...OWN_CHAIN,declaration(NEXT,S1,{n1Expand:false}),declaration(MORE,S2)]},
   {newerChain:[...OWN_CHAIN,declaration(NEXT,S1),declaration(MORE,S2,{keepsVerifier:false})]},{newerChain:[...OWN_CHAIN,declaration(NEXT,S1),declaration(MORE,S2),declaration('0135_after.sql',S2)]},
   {newerChain:[...OWN_CHAIN,declaration(NEXT,S1,{outsideTransaction:'no'}),declaration(MORE,S2)]},{newerChain:[...OWN_CHAIN,{...declaration(NEXT,S1),extra:1},declaration(MORE,S2)]},
   {newerChain:[declaration(MORE,S2),...OWN_CHAIN,declaration(NEXT,S1),declaration(MORE,S2)]},{newerChain:Array.from({length:129},(_,index)=>declaration(`${String(1000+index)}_x.sql`,S1))},{unknown:true}])
   expect(()=>ahead.validateDatabaseAheadFile(file(patch)),JSON.stringify(Object.keys(patch))).toThrow('PREVIEW_DATABASE_AHEAD_REFUSED');
 });
 it('reads its own release\'s file and checks every step against the newer release\'s source manifest',async()=>{
  const io=read(file());
  expect(await operator.readDatabaseAhead({label:'old-v1',plan:{sourceRevision:OLD_REV}},io)).toEqual({fileSha256:H,newerLabel:'new-v1',accepted:[{name:NEXT,sha256:S1},{name:MORE,sha256:S2}],newerChain:NEWER_CHAIN});
  expect(io.readManifest).toHaveBeenCalledTimes(1);
 });
 it.each([
  ['another release\'s file', file({olderLabel:'other-v1'}),manifest()],
  ['a file for another revision of this release', file({olderSourceRevision:'f'.repeat(40)}),manifest()],
  ['a newer manifest of another release', file(),manifest({sourceRoot:'/opt/debateai-v3-preview/releases/auth-dev-candidate-other-v1-api'})],
  ['a newer manifest of another revision', file(),manifest({sourceRevision:'f'.repeat(40)})],
  ['a newer manifest that is not an api manifest', file(),manifest({role:'ui',sourceRoot:'/opt/debateai-v3-preview/releases/auth-dev-candidate-new-v1-ui'})],
  ['a newer manifest that root does not own', file(),manifest({uid:1000})],
  ['a step whose bytes the newer manifest does not list', file(),manifest({files:[{path:`dialectical-engine/migrations/${NEXT}`,sha256:S1}]})],
  ['a step with other bytes than the newer manifest', file(),manifest({files:[{path:`dialectical-engine/migrations/${NEXT}`,sha256:S1},{path:`dialectical-engine/migrations/${MORE}`,sha256:S1}]})],
  ['a file that is not a database-ahead file', {schema:'preview-database-ahead-v1'},manifest()]
 ])('refuses %s',async(_name,value,newer)=>{
  await expect(operator.readDatabaseAhead({label:'old-v1',plan:{sourceRevision:OLD_REV}},read(value,newer))).rejects.toThrow('PREVIEW_DATABASE_AHEAD_REFUSED');
 });
});
