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
/** The reviewed native-plan schema check; the release tool runs it before writing a plan. */
export function validateNativePlan(plan) {
 const chosen=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'checkerChoice');
 exactKeys(plan,chosen?[...NATIVE_PLAN_KEYS,'checkerChoice']:NATIVE_PLAN_KEYS);
 if(plan.schema!=='preview-auth-dev-native-plan-v1'||!['apply-and-plan','plan','publish','verify'].includes(plan.operation)
  ||!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(plan.sourceRoot))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 if(chosen){
  exactKeys(plan.checkerChoice,Object.keys(DEEPSEEK_CHECKER_CHOICE),'PREVIEW_NATIVE_PLAN_REFUSED');
  if(!['plan','publish'].includes(plan.operation)||Object.entries(DEEPSEEK_CHECKER_CHOICE).some(([key,value])=>plan.checkerChoice[key]!==value))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 }
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
 const [db,lineage,register,publisher,verify]=await Promise.all([tsImport(join(engine,'packages/db/src/index.ts'),import.meta.url),tsImport(join(engine,'packages/db/src/migration-lineage.ts'),import.meta.url),tsImport(join(engine,'packages/register/src/index.ts'),import.meta.url),tsImport('./publish-register-v2.ts',import.meta.url),tsImport('./verify-native.ts',import.meta.url)]);
 const migration=await lineage.loadMigrationPlan();
 return withActiveNativePool({publicPeerModule:'/opt/debateai-v3-preview/operator/recovery106-v1/native-common106.mjs',auth106Names:migration.manifest.cohorts.auth106},async pool=>{
  if(plan.operation==='apply-and-plan')await db.migrate(pool);
  const base=await publisher.readSealedSnapshot(pool,plan.selectedBaseRegisterVersion);
  if(base.snapshotSha256!==plan.selectedBaseSnapshotSha256)refuse('PREVIEW_SELECTED_BASE_DRIFT');
  // Publish kit v2: plan and publish compose from the CURRENT published version (nothing sealed above the base but this publication's own replay).
  if(plan.operation==='plan'||plan.operation==='publish')await publisher.assertBaseIsCurrent(pool,base.registerVersion,plan.publicationId);
  const runtimeObservedAt=plan.approval?.runtimeObservedAt??new Date().toISOString();
  const rows=await publisher.buildPreviewSourceRowsV2(await register.loadBootstrapRegister(),{nodeVersion:process.version,pnpmVersion:source.pnpmVersion,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,operatorSha256:plan.operatorManifestSha256,observedAt:runtimeObservedAt},plan.checkerChoice);
  const snapshot=publisher.composePreviewSnapshotV2({sourceRows:rows,baseRows:base.rows,baseRegisterVersion:base.registerVersion,baseSnapshotSha256:base.snapshotSha256});
  const metadata=snapshotProposal({runtimeObservedAt,source,plan,snapshot});
  if(plan.operation==='plan'||plan.operation==='apply-and-plan')return metadata;
  if(!plan.approval)refuse('PREVIEW_SNAPSHOT_REVIEW_REQUIRED');
  const {runtimeObservedAt:approvedRuntimeObservedAt,publication,...approval}=plan.approval;
  if(typeof approvedRuntimeObservedAt!=='string')refuse('PREVIEW_RUNTIME_OBSERVATION_REQUIRED');
  // Only apply-and-plan applies SQL. publish and verify refuse a pending forward step before writing anything.
  if(plan.operation==='publish')await verify.refusePendingForwardSteps(pool);
  const receipt=plan.operation==='publish'?await publisher.publishPreviewRegisterV2(pool,{publicationId:plan.publicationId,sourceRef:`preview-auth-dev-v1 ${source.sourceRevision}/${source.sourceTree}; operator sha256:${plan.operatorManifestSha256}`,snapshot,approval}):publication;
  return verify.verifyNativeState(pool,{sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,nativeSourceSha256:source.nativeSha256,publication:receipt});
 });
}
/** The exact refusal verify-native.ts gives a database that lacks a forward step of this source (any number of steps). */
const PENDING_FORWARD_STEP=/^PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: \d{4}_[a-z0-9_]+\.sql(?:, \d{4}_[a-z0-9_]+\.sql){0,63}\. Verify never applies a migration; run the native operator with operation apply-and-plan first\.$/;
/** Fixed text of publish-register-v2.ts BASE_NOT_CURRENT (that module is loaded lazily through tsx; a unit test pins the two equal). */
export const BASE_NOT_CURRENT_LINE='PREVIEW_REGISTER_BASE_NOT_CURRENT: a sealed register version exists above the selected base; plan again from the newest publication';
/** Every failure stays opaque except a pending forward step (its line says to run apply-and-plan) or a stale register base (its line says to plan again). */
export function operatorRefusalLine(error){
 if(error?.code==='PREVIEW_REGISTER_BASE_NOT_CURRENT'&&error.message===BASE_NOT_CURRENT_LINE)return `${error.message}\n`;
 return error?.code==='PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP'&&typeof error.message==='string'&&PENDING_FORWARD_STEP.test(error.message)?`${error.message}\n`:'PREVIEW_NATIVE_OPERATION_REFUSED\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(`${JSON.stringify(await runNativeOperator())}\n`);}catch(error){process.stderr.write(operatorRefusalLine(error));process.exitCode=1;}}
