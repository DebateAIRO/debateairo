import { dirname, join } from 'node:path';
import { exactKeys,sha256,strictJson,withPrivateBytes,refuse } from './custody.mjs';
import { verifySourceManifest,operatorManifestSha256 } from './source-manifest.mjs';
import { validateNativeAttestation } from './native-attestation.mjs';
import { validatePublication } from './runtime-receipt.mjs';
const SERVICES=Object.freeze(['api','ui','runner']);
/** Side-by-side spec §6: two port slots; a release runs in one while the other release keeps serving. */
export const PREVIEW_SLOTS=Object.freeze({A:Object.freeze({uiPort:'3100',apiPort:'3101'}),B:Object.freeze({uiPort:'3200',apiPort:'3201'})});
/** Side-by-side spec §10: a release label names unit instances, /etc files and folders, so it never holds a dot, slash or upper case. */
export const RELEASE_LABEL=/^[a-z0-9](?:[a-z0-9-]{0,70}[a-z0-9])?$/;
/** The one folder every preview env file lives in (root-owned; the files are root:<service group> 0640). */
export const PREVIEW_ENV_ROOT='/etc/debateai-v3-preview/auth-dev-v1';
// One anchored pattern built from RELEASE_LABEL's body: kind, label, then the service as the last segment.
const ROOT=new RegExp(`^/opt/debateai-v3-preview/releases/auth-dev-(candidate|fallback)-(${RELEASE_LABEL.source.slice(1,-1)})-(api|ui|runner)$`);
/** Side-by-side spec §10: the release label of a release folder whose last segment is `service` (`…/auth-dev-candidate-<label>-api`); anything else refuses. */
export function labelOfSourceRoot(sourceRoot,service) {
 const match=typeof sourceRoot==='string'?ROOT.exec(sourceRoot):null;
 if(!match||match[3]!==service)refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 return match[2];
}
/** Side-by-side spec §6: the slot a port pair belongs to; any other pair (a mixed one included) refuses. */
export function slotOfPorts(uiPort,apiPort) {
 const slot=Object.keys(PREVIEW_SLOTS).find(name=>PREVIEW_SLOTS[name].uiPort===uiPort&&PREVIEW_SLOTS[name].apiPort===apiPort);
 return slot??refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
}
/** Side-by-side spec §10: each release reads its own env file, `<service>-<label>.env`. */
export function previewEnvironmentPath(service,label) {
 if(!SERVICES.includes(service)||typeof label!=='string'||!RELEASE_LABEL.test(label))refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 return `${PREVIEW_ENV_ROOT}/${service}-${label}.env`;
}
export function validateLaunchPlan(plan) {
 exactKeys(plan,['schema','service','artifact','sourceRoot','sourceRevision','sourceTree','serviceUid','serviceGid','sourceManifest','nativeAttestation','uiBuild','publication','operatorManifestSha256','environment','apiPort','uiPort','mailExecutable','mailFrom'],'PREVIEW_LAUNCH_PLAN_REFUSED');
 const match=ROOT.exec(plan.sourceRoot??'');
 if(plan.schema!=='preview-auth-dev-launch-v1'||!SERVICES.includes(plan.service)||!match||match[1]!==plan.artifact||match[3]!==plan.service
  ||!/^([a-f0-9]{40})$/.test(plan.sourceRevision)||!/^([a-f0-9]{40})$/.test(plan.sourceTree)||!/^([a-f0-9]{64})$/.test(plan.operatorManifestSha256)
  ||!Number.isSafeInteger(plan.serviceUid)||plan.serviceUid<1||!Number.isSafeInteger(plan.serviceGid)||plan.serviceGid<1
  ||plan.mailFrom!=='noreply@dezbatere.ro'
  ||plan.mailExecutable!==join(plan.sourceRoot,'dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs'))refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 slotOfPorts(plan.uiPort,plan.apiPort);
 validatePublication(plan.publication);
 for(const file of [plan.sourceManifest,plan.nativeAttestation,...(plan.uiBuild?[plan.uiBuild]:[])]){
  exactKeys(file,['path','sha256']);if(!/^\/opt\/debateai-v3-preview\/artifacts\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256))refuse('PREVIEW_LAUNCH_PLAN_REFUSED');
 }
 const custody=plan.environment;
 exactKeys(custody,['path','root','uid','gid','mode','parentUid']);
 if(custody.path!==previewEnvironmentPath(plan.service,labelOfSourceRoot(plan.sourceRoot,plan.service))||custody.root!==PREVIEW_ENV_ROOT
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
 if(operatorManifestSha256(source)!==plan.operatorManifestSha256)refuse('PREVIEW_OPERATOR_SOURCE_REFUSED');
 const native=await readPublicArtifact(plan.nativeAttestation);
 validateNativeAttestation(native,{sourceRevision:plan.sourceRevision,sourceTree:plan.sourceTree,nativeSourceSha256:source.nativeSha256,publication:plan.publication});
 return {plan,source,native};
}
