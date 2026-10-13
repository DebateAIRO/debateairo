import { tsImport } from 'tsx/esm/api';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withPrivateBytes,strictJson,exactKeys,refuse } from './custody.mjs';
import { readPublicArtifact } from './launch-plan.mjs';
import { verifySourceManifest,operatorManifestSha256 } from './source-manifest.mjs';
import { withActiveNativePool } from './native-peer.mjs';
const NATIVE_PLAN_KEYS=['schema','operation','sourceRoot','sourceRevision','sourceTree','sourceManifest','operatorManifestSha256','selectedBaseRegisterVersion','selectedBaseSnapshotSha256','publicationId','approval'];
/**
 * The one reviewed non-default checker choice a plan may carry (publish-register-v2.ts PreviewCheckerChoice).
 * Without `checkerChoice` the register's checker stays GLM. Only plan and publish compose a reviewed proposal,
 * so only they may carry it; the publisher checks it again before it builds a row.
 */
export const DEEPSEEK_CHECKER_CHOICE=Object.freeze({checker:'deepseek',deepseekEnabledOnGate:true});
/**
 * The one non-default role rotation choice a plan may carry (publish-register-v2.ts PreviewRoleRotationChoice):
 * `roleRotation: 'off'` publishes the rotation row disabled (the preview's rollback). Without it rotation stays on.
 * Like the checker choice, only plan and publish may carry it; the publisher checks it again.
 */
export const ROLE_ROTATION_OFF='off';
/**
 * The operator's optional parallel-calls policy (publish-register-v2.ts buildPreviewSourceRowsV2's fifth argument,
 * spec 2026-10-12 §3.1): exactly perDebate 1..64, perModelPerDebate 1..16 and perModelPerRunner, an object of
 * lower-case vendor keys with a required `default`, each 1..1000. The same bounds as the register's own parser
 * (packages/register/src/call-concurrency-policy.ts), which the publisher runs again before it builds the row.
 * Like the checker choice, only plan and publish may carry it. Returns the policy in one fixed key order.
 */
export function validateCallConcurrencyChoice(value) {
 const count=(number,max)=>Number.isSafeInteger(number)&&number>=1&&number<=max;
 exactKeys(value,['perDebate','perModelPerDebate','perModelPerRunner'],'PREVIEW_NATIVE_PLAN_REFUSED');
 const runner=value.perModelPerRunner;
 if(!runner||typeof runner!=='object'||Object.getPrototypeOf(runner)!==Object.prototype||!Object.hasOwn(runner,'default'))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 const vendors=Object.keys(runner);
 if(!count(value.perDebate,64)||!count(value.perModelPerDebate,16)
  ||vendors.some(vendor=>!/^[a-z][a-z0-9-]{0,31}$/.test(vendor)||!count(runner[vendor],1000)))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return {perDebate:value.perDebate,perModelPerDebate:value.perModelPerDebate,
  perModelPerRunner:Object.fromEntries(['default',...vendors.filter(vendor=>vendor!=='default').sort()].map(vendor=>[vendor,runner[vendor]]))};
}
/**
 * Sanity bounds on the owner's hosted-preview ceilings (publish-register-v3.ts PREVIEW_HOSTED_CEILING_BOUNDS; a unit
 * test pins the two equal). They catch a typed extra digit; the ceilings themselves are always the owner's inputs.
 */
export const HOSTED_CEILING_BOUNDS=Object.freeze({perRunMaxMicros:50_000_000,dailyMaxMicros:200_000_000});
/**
 * The owner's hosted-preview inputs (publish-register-v3.ts PreviewHostedBillingChoice, owner rulings 2026-10-13):
 * exactly `billing` ('on' or 'off'), `perRunCeilingMicros` and `dailyCeilingMicros` (whole micro-dollars, per run at
 * most the day) and `askRoomReads` ({limit, windowMs, capacity}: the room read's budget, the register's own bounds).
 * A plan that carries it composes with kit v3 (hosted rows); without it, with kit v2 (local rows, billing off). The
 * kit checks it again before it builds a row. Returns the choice in one fixed key order.
 */
export function validateHostedBillingChoice(value) {
 const count=(number,max)=>Number.isSafeInteger(number)&&number>=1&&number<=max;
 exactKeys(value,['billing','perRunCeilingMicros','dailyCeilingMicros','askRoomReads'],'PREVIEW_NATIVE_PLAN_REFUSED');
 exactKeys(value.askRoomReads,['limit','windowMs','capacity'],'PREVIEW_NATIVE_PLAN_REFUSED');
 const reads=value.askRoomReads;
 if(!['on','off'].includes(value.billing)||!count(value.perRunCeilingMicros,HOSTED_CEILING_BOUNDS.perRunMaxMicros)||!count(value.dailyCeilingMicros,HOSTED_CEILING_BOUNDS.dailyMaxMicros)
  ||value.perRunCeilingMicros>value.dailyCeilingMicros||!count(reads.limit,1_000_000)||!count(reads.windowMs,86_400_000)||!count(reads.capacity,1_048_576))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return {billing:value.billing,perRunCeilingMicros:value.perRunCeilingMicros,dailyCeilingMicros:value.dailyCeilingMicros,askRoomReads:{limit:reads.limit,windowMs:reads.windowMs,capacity:reads.capacity}};
}
/** The reviewed native-plan schema check; the release tool runs it before writing a plan. */
export function validateNativePlan(plan) {
 const chosen=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'checkerChoice');
 const rotation=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'roleRotation');
 const concurrency=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'callConcurrency');
 const hosted=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'hostedBilling');
 exactKeys(plan,[...NATIVE_PLAN_KEYS,...(chosen?['checkerChoice']:[]),...(rotation?['roleRotation']:[]),...(concurrency?['callConcurrency']:[]),...(hosted?['hostedBilling']:[])]);
 if(plan.schema!=='preview-auth-dev-native-plan-v1'||!['apply-and-plan','plan','publish','verify'].includes(plan.operation)
  ||!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(plan.sourceRoot))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 if(chosen){
  exactKeys(plan.checkerChoice,Object.keys(DEEPSEEK_CHECKER_CHOICE),'PREVIEW_NATIVE_PLAN_REFUSED');
  if(!['plan','publish'].includes(plan.operation)||Object.entries(DEEPSEEK_CHECKER_CHOICE).some(([key,value])=>plan.checkerChoice[key]!==value))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 if(rotation&&(plan.roleRotation!==ROLE_ROTATION_OFF||!['plan','publish'].includes(plan.operation)))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 if(concurrency){
  validateCallConcurrencyChoice(plan.callConcurrency);
  if(!['plan','publish'].includes(plan.operation))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
 // Unlike the three choices above, every operation may carry it: once a hosted version is the base, verify and
 // apply-and-plan compose with kit v3 too (kit v2 refuses a base with billing on).
 if(hosted)validateHostedBillingChoice(plan.hostedBilling);
 return plan;
}
/**
 * What the owner reviews before publish (v2): the full delta with old and new canonical values.
 * The release tool re-hashes `delta` against `deltaSha256` and copies the approval from this file.
 */
export function snapshotProposal({runtimeObservedAt,source,plan,snapshot}) {
 return {schema:'preview-auth-dev-snapshot-proposal-v2',composer:snapshot.composer,runtimeObservedAt,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,operatorManifestSha256:plan.operatorManifestSha256,
  baseRegisterVersion:snapshot.baseRegisterVersion,baseSnapshotSha256:snapshot.baseSnapshotSha256,snapshotSha256:snapshot.snapshotSha256,deltaSha256:snapshot.deltaSha256,
  rowCount:snapshot.rows.length,rowKeys:snapshot.rows.map(row=>row.rowKey),addedKeys:snapshot.addedKeys,changedKeys:snapshot.changedKeys,delta:snapshot.delta};
}
/** Fixed public plan + fixed private peer FD. No database URL, role, secret or env override argument. */
export async function runNativeOperator() {
 const plan=validateNativePlan(await withPrivateBytes('/etc/debateai-v3-preview/auth-dev-v1/native-plan.json',{root:'/etc/debateai-v3-preview/auth-dev-v1',uid:0,mode:0o644,maxBytes:32768},raw=>strictJson(raw)));
 const source=await readPublicArtifact(plan.sourceManifest,'source');
 if(source.uid!==0)refuse('PREVIEW_SOURCE_OWNER_REFUSED');
 await verifySourceManifest(source,{sourceRevision:plan.sourceRevision,sourceTree:plan.sourceTree,sourceRoot:plan.sourceRoot,role:'api',manifestSha256:plan.sourceManifest.sha256,execution:{entryUrl:import.meta.url,entryName:'native-operator.mjs',operatorManifestSha256:plan.operatorManifestSha256}});
 if(operatorManifestSha256(source)!==plan.operatorManifestSha256)refuse('PREVIEW_OPERATOR_SOURCE_REFUSED');
 const engine=join(plan.sourceRoot,'dialectical-engine');
 // Owner rulings 2026-10-13: a plan with the owner's hosted-billing inputs composes with kit v3 (hosted rows); every
 // other plan with kit v2, exactly as before.
 const hosted=Object.hasOwn(plan,'hostedBilling');
 const [db,lineage,register,publisher,verify]=await Promise.all([tsImport(join(engine,'packages/db/src/index.ts'),import.meta.url),tsImport(join(engine,'packages/db/src/migration-lineage.ts'),import.meta.url),tsImport(join(engine,'packages/register/src/index.ts'),import.meta.url),tsImport(hosted?'./publish-register-v3.ts':'./publish-register-v2.ts',import.meta.url),tsImport('./verify-native.ts',import.meta.url)]);
 const migration=await lineage.loadMigrationPlan();
 return withActiveNativePool({publicPeerModule:'/opt/debateai-v3-preview/operator/recovery106-v1/native-common106.mjs',auth106Names:migration.manifest.cohorts.auth106},async pool=>{
  if(plan.operation==='apply-and-plan')await db.migrate(pool);
  const base=await publisher.readSealedSnapshot(pool,plan.selectedBaseRegisterVersion);
  if(base.snapshotSha256!==plan.selectedBaseSnapshotSha256)refuse('PREVIEW_SELECTED_BASE_DRIFT');
  // Publish kit v2: plan and publish compose from the CURRENT published version (nothing sealed above the base but this publication's own replay).
  if(plan.operation==='plan'||plan.operation==='publish')await publisher.assertBaseIsCurrent(pool,base.registerVersion,plan.publicationId);
  const runtimeObservedAt=plan.approval?.runtimeObservedAt??new Date().toISOString();
  const observation={nodeVersion:process.version,pnpmVersion:source.pnpmVersion,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,operatorSha256:plan.operatorManifestSha256,observedAt:runtimeObservedAt};
  const rows=hosted?await publisher.buildPreviewSourceRowsV3(await register.loadBootstrapRegister(),observation,plan.hostedBilling,plan.checkerChoice,plan.roleRotation,plan.callConcurrency??null)
   :await publisher.buildPreviewSourceRowsV2(await register.loadBootstrapRegister(),{...observation},plan.checkerChoice,plan.roleRotation,plan.callConcurrency??null);
  const composition={sourceRows:rows,baseRows:base.rows,baseRegisterVersion:base.registerVersion,baseSnapshotSha256:base.snapshotSha256};
  const snapshot=hosted?publisher.composePreviewSnapshotV3(composition):publisher.composePreviewSnapshotV2(composition);
  const metadata=snapshotProposal({runtimeObservedAt,source,plan,snapshot});
  if(plan.operation==='plan'||plan.operation==='apply-and-plan')return metadata;
  if(!plan.approval)refuse('PREVIEW_SNAPSHOT_REVIEW_REQUIRED');
  const {runtimeObservedAt:approvedRuntimeObservedAt,publication,...approval}=plan.approval;
  if(typeof approvedRuntimeObservedAt!=='string')refuse('PREVIEW_RUNTIME_OBSERVATION_REQUIRED');
  // Only apply-and-plan applies SQL. publish and verify refuse a pending forward step before writing anything.
  if(plan.operation==='publish')await verify.refusePendingForwardSteps(pool);
  const input={publicationId:plan.publicationId,sourceRef:`preview-auth-dev-v1 ${source.sourceRevision}/${source.sourceTree}; operator sha256:${plan.operatorManifestSha256}`,snapshot,approval};
  const receipt=plan.operation!=='publish'?publication:hosted?await publisher.publishPreviewRegisterV3(pool,input):await publisher.publishPreviewRegisterV2(pool,input);
  return verify.verifyNativeState(pool,{sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,nativeSourceSha256:source.nativeSha256,publication:receipt});
 });
}
/** The exact refusal verify-native.ts gives a database that lacks a forward step of this source (any number of steps). */
const PENDING_FORWARD_STEP=/^PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: \d{4}_[a-z0-9_]+\.sql(?:, \d{4}_[a-z0-9_]+\.sql){0,63}\. Verify never applies a migration; run the native operator with operation apply-and-plan first\.$/;
/** Fixed text of publish-register-v2.ts BASE_NOT_CURRENT, which v3 re-exports (both load lazily through tsx; a unit test pins the two equal). */
export const BASE_NOT_CURRENT_LINE='PREVIEW_REGISTER_BASE_NOT_CURRENT: a sealed register version exists above the selected base; plan again from the newest publication';
/** Every failure stays opaque except a pending forward step (its line says to run apply-and-plan) or a stale register base (its line says to plan again). */
export function operatorRefusalLine(error){
 if(error?.code==='PREVIEW_REGISTER_BASE_NOT_CURRENT'&&error.message===BASE_NOT_CURRENT_LINE)return `${error.message}\n`;
 return error?.code==='PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP'&&typeof error.message==='string'&&PENDING_FORWARD_STEP.test(error.message)?`${error.message}\n`:'PREVIEW_NATIVE_OPERATION_REFUSED\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(`${JSON.stringify(await runNativeOperator())}\n`);}catch(error){process.stderr.write(operatorRefusalLine(error));process.exitCode=1;}}
