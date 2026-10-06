import { tsImport } from 'tsx/esm/api';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withPrivateBytes,strictJson,exactKeys,sha256,refuse } from './custody.mjs';
import { readPublicArtifact } from './launch-plan.mjs';
import { verifySourceManifest } from './source-manifest.mjs';
import { withActiveNativePool } from './native-peer.mjs';
/** Fixed public plan + fixed private peer FD. No database URL, role, secret or env override argument. */
export async function runNativeOperator() {
 const plan=await withPrivateBytes('/etc/debateai-v3-preview/auth-dev-v1/native-plan.json',{root:'/etc/debateai-v3-preview/auth-dev-v1',uid:0,mode:0o644,maxBytes:32768},raw=>strictJson(raw));
 exactKeys(plan,['schema','operation','sourceRoot','sourceRevision','sourceTree','sourceManifest','operatorManifestSha256','selectedBaseRegisterVersion','selectedBaseSnapshotSha256','publicationId','approval']);
 if(plan.schema!=='preview-auth-dev-native-plan-v1'||!['apply-and-plan','plan','publish','verify'].includes(plan.operation)
  ||!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]+$/.test(plan.sourceRoot))refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 const source=await readPublicArtifact(plan.sourceManifest);
 if(source.uid!==0)refuse('PREVIEW_SOURCE_OWNER_REFUSED');
 await verifySourceManifest(source,{sourceRevision:plan.sourceRevision,sourceTree:plan.sourceTree,sourceRoot:plan.sourceRoot,role:'api',manifestSha256:plan.sourceManifest.sha256,execution:{entryUrl:import.meta.url,entryName:'native-operator.mjs',operatorManifestSha256:plan.operatorManifestSha256}});
 const operator=source.files.filter(file=>file.path.startsWith('dialectical-engine/deploy/preview-auth-dev/v1/'));
 if(sha256(JSON.stringify(operator))!==plan.operatorManifestSha256)refuse('PREVIEW_OPERATOR_SOURCE_REFUSED');
 const engine=join(plan.sourceRoot,'dialectical-engine');
 const [db,lineage,register,publisher,verify]=await Promise.all([tsImport(join(engine,'packages/db/src/index.ts'),import.meta.url),tsImport(join(engine,'packages/db/src/migration-lineage.ts'),import.meta.url),tsImport(join(engine,'packages/register/src/index.ts'),import.meta.url),tsImport('./publish-register.ts',import.meta.url),tsImport('./verify-native.ts',import.meta.url)]);
 const migration=await lineage.loadMigrationPlan();
 return withActiveNativePool({publicPeerModule:'/opt/debateai-v3-preview/operator/recovery106-v1/native-common106.mjs',auth106Names:migration.manifest.cohorts.auth106},async pool=>{
  if(plan.operation==='apply-and-plan')await db.migrate(pool);
  const base=await publisher.readSealedSnapshot(pool,plan.selectedBaseRegisterVersion);
  if(base.snapshotSha256!==plan.selectedBaseSnapshotSha256)refuse('PREVIEW_SELECTED_BASE_DRIFT');
  const runtimeObservedAt=plan.approval?.runtimeObservedAt??new Date().toISOString();
  const rows=await publisher.buildPreviewSourceRows(await register.loadBootstrapRegister(),{nodeVersion:process.version,pnpmVersion:source.pnpmVersion,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,operatorSha256:plan.operatorManifestSha256,observedAt:runtimeObservedAt});
  const snapshot=publisher.composePreviewSnapshot({sourceRows:rows,baseRows:base.rows,baseRegisterVersion:base.registerVersion,baseSnapshotSha256:base.snapshotSha256});
  const metadata={schema:'preview-auth-dev-snapshot-proposal-v1',runtimeObservedAt,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,baseRegisterVersion:snapshot.baseRegisterVersion,baseSnapshotSha256:snapshot.baseSnapshotSha256,snapshotSha256:snapshot.snapshotSha256,deltaSha256:snapshot.deltaSha256,rowCount:snapshot.rows.length,rowKeys:snapshot.rows.map(row=>row.rowKey),addedKeys:snapshot.addedKeys,delta:snapshot.delta};
  if(plan.operation==='plan'||plan.operation==='apply-and-plan')return metadata;
  if(!plan.approval)refuse('PREVIEW_SNAPSHOT_REVIEW_REQUIRED');
  const {runtimeObservedAt:approvedRuntimeObservedAt,publication,...approval}=plan.approval;
  if(typeof approvedRuntimeObservedAt!=='string')refuse('PREVIEW_RUNTIME_OBSERVATION_REQUIRED');
  const receipt=plan.operation==='publish'?await publisher.publishPreviewRegister(pool,{publicationId:plan.publicationId,sourceRef:`preview-auth-dev-v1 ${source.sourceRevision}/${source.sourceTree}; operator sha256:${plan.operatorManifestSha256}`,snapshot,approval}):publication;
  return verify.verifyNativeState(pool,{sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,nativeSourceSha256:source.nativeSha256,publication:receipt});
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(`${JSON.stringify(await runNativeOperator())}\n`);}catch{process.stderr.write('PREVIEW_NATIVE_OPERATION_REFUSED\n');process.exitCode=1;}}
