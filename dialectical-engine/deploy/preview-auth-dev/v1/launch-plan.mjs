import { dirname, join } from 'node:path';
import { exactKeys,sha256,strictJson,withPrivateBytes,refuse } from './custody.mjs';
import { verifySourceManifest } from './source-manifest.mjs';
import { validateNativeAttestation } from './native-attestation.mjs';
import { validatePublication } from './runtime-receipt.mjs';
const ROOT=/^\/opt\/debateai-v3-preview\/releases\/auth-dev-(candidate|fallback)-[a-z0-9-]{1,80}$/;
export function validateLaunchPlan(plan) {
 exactKeys(plan,['schema','service','artifact','sourceRoot','sourceRevision','sourceTree','serviceUid','serviceGid','sourceManifest','nativeAttestation','uiBuild','publication','operatorManifestSha256','environment','apiPort','uiPort','mailExecutable','mailFrom'],'PREVIEW_LAUNCH_PLAN_REFUSED');
 const match=ROOT.exec(plan.sourceRoot??'');
 if(plan.schema!=='preview-auth-dev-launch-v1'||!['api','ui','runner'].includes(plan.service)||!match||match[1]!==plan.artifact
  ||!/^([a-f0-9]{40})$/.test(plan.sourceRevision)||!/^([a-f0-9]{40})$/.test(plan.sourceTree)||!/^([a-f0-9]{64})$/.test(plan.operatorManifestSha256)
  ||!Number.isSafeInteger(plan.serviceUid)||plan.serviceUid<1||!Number.isSafeInteger(plan.serviceGid)||plan.serviceGid<1
  ||plan.apiPort!=='3101'||plan.uiPort!=='3100'||plan.mailFrom!=='noreply@dezbatere.ro'
  ||plan.mailExecutable!==join(plan.sourceRoot,'dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs'))refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 validatePublication(plan.publication);
 for(const file of [plan.sourceManifest,plan.nativeAttestation,...(plan.uiBuild?[plan.uiBuild]:[])]){
  exactKeys(file,['path','sha256']);if(!/^\/opt\/debateai-v3-preview\/artifacts\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256))refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 }
 const custody=plan.environment;
 exactKeys(custody,['path','root','uid','gid','mode','parentUid']);
 if(custody.path!==`/etc/debateai-v3-preview/auth-dev-v1/${plan.service}.env`||custody.root!=='/etc/debateai-v3-preview/auth-dev-v1'
  ||custody.uid!==0||custody.parentUid!==0||custody.gid!==plan.serviceGid||custody.mode!==0o640)refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 if((plan.service==='ui')!==(plan.uiBuild!==null))refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 return plan;
}
export function parsePublicArtifactBytes(raw,inventoryKind) {
 if(inventoryKind!==undefined&&!['source','ui-build'].includes(inventoryKind))refuse('PREVIEW_PUBLIC_ARTIFACT_KIND_REFUSED');
 const value=strictJson(raw,32,{publicInventory:inventoryKind!==undefined});
 if(inventoryKind!==undefined&&value?.schema!==(inventoryKind==='source'?'preview-auth-dev-source-v3':'preview-auth-dev-ui-build-v1'))refuse('PREVIEW_PUBLIC_ARTIFACT_KIND_REFUSED');
 return value;
}
export async function readPublicArtifact(file,inventoryKind) {
 return withPrivateBytes(file.path,{root:dirname(file.path),uid:0,mode:0o644,maxBytes:16777216},raw=>{if(sha256(raw)!==file.sha256)refuse();return parsePublicArtifactBytes(raw,inventoryKind);});
}
export async function prepareLaunch(argv,service,entryUrl) {
 if(process.platform!=='linux'||process.version!=='v26.8.2'||argv.length!==2||argv[0]!=='--plan'
  ||!/^\/opt\/debateai-v3-preview\/artifacts\/[a-z0-9-]+\/(?:api|ui|runner)-launch\.json$/.test(argv[1]))refuse('PREVIEW_LAUNCH_INPUT_REFUSED');
 const plan=validateLaunchPlan(await withPrivateBytes(argv[1],{root:dirname(argv[1]),uid:0,mode:0o644,maxBytes:32768},raw=>strictJson(raw)));
 if(plan.service!==service||process.getuid?.()!==plan.serviceUid||process.getgid?.()!==plan.serviceGid)refuse('PREVIEW_LAUNCH_ACTOR_REFUSED');
 const source=await readPublicArtifact(plan.sourceManifest,'source');
 if(source.uid!==0)refuse('PREVIEW_SOURCE_OWNER_REFUSED');
 await verifySourceManifest(source,{sourceRevision:plan.sourceRevision,sourceTree:plan.sourceTree,sourceRoot:plan.sourceRoot,role:service,manifestSha256:plan.sourceManifest.sha256,execution:{entryUrl,entryName:`launch-${service}.mjs`,operatorManifestSha256:plan.operatorManifestSha256}});
 const operator=source.files.filter(file=>file.path.startsWith('dialectical-engine/deploy/preview-auth-dev/v1/'));
 if(sha256(JSON.stringify(operator))!==plan.operatorManifestSha256)refuse('PREVIEW_OPERATOR_SOURCE_REFUSED');
 const native=await readPublicArtifact(plan.nativeAttestation);
 validateNativeAttestation(native,{sourceRevision:plan.sourceRevision,sourceTree:plan.sourceTree,nativeSourceSha256:source.nativeSha256,publication:plan.publication});
 return {plan,source,native};
}
