import { describe,expect,it } from 'vitest';
const plans=await import('../../deploy/'+'preview-auth-dev/v1/launch-plan.mjs');
const native=await import('../../deploy/'+'preview-auth-dev/v1/native-attestation.mjs');
const stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-plan.mjs');
const digest='a'.repeat(64),revision='a'.repeat(40),tree='b'.repeat(40);
const publication={publicationId:'11111111-1111-4111-8111-111111111111',publicationKind:'GENERAL',baseRegisterVersion:'8',registerVersion:'12',requestSha256:digest,snapshotSha256:digest,rowCount:68,recordedAt:'2026-10-06T12:00:00Z'};
const file={path:'/opt/debateai-v3-preview/artifacts/v1/source.json',sha256:digest};
const plan={schema:'preview-auth-dev-launch-v1',service:'api',artifact:'candidate',sourceRoot:'/opt/debateai-v3-preview/releases/auth-dev-candidate-v1-api',sourceRevision:revision,sourceTree:tree,serviceUid:1001,serviceGid:1001,sourceManifest:file,nativeAttestation:{...file,path:'/opt/debateai-v3-preview/artifacts/v1/native.json'},uiBuild:null,publication,operatorManifestSha256:digest,environment:{path:'/etc/debateai-v3-preview/auth-dev-v1/api-v1.env',root:'/etc/debateai-v3-preview/auth-dev-v1',uid:0,gid:1001,mode:0o640,parentUid:0},apiPort:'3101',uiPort:'3100',mailExecutable:'/opt/debateai-v3-preview/releases/auth-dev-candidate-v1-api/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs',mailFrom:'noreply@dezbatere.ro'};
describe('reviewed artifact and isolated stage plans',()=>{
 it('binds independent artifact roots to real native version, service identity and protected artifact references',()=>expect(plans.validateLaunchPlan(plan)).toEqual(plan));
 it.each([{sourceRoot:'/opt/debateai/dialectical-engine'},{sourceRevision:'bad'},{serviceUid:0},{artifact:'old106'},{service:'other'},{publication:{...publication,registerVersion:'8'}}])('refuses mismatched runtime plan',patch=>expect(()=>plans.validateLaunchPlan({...plan,...patch})).toThrow());
 // Side-by-side spec §6, §10: two slots, and each release reads its own env file.
 it('binds the env file and the ports to the release label and its slot',()=>{
  const root='/opt/debateai-v3-preview/releases/auth-dev-candidate-d50e33165-r19-v1-api';
  const ok={...plan,sourceRoot:root,mailExecutable:`${root}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`,
   environment:{...plan.environment,path:'/etc/debateai-v3-preview/auth-dev-v1/api-d50e33165-r19-v1.env'}};
  expect(plans.validateLaunchPlan(ok)).toEqual(ok);
  expect(plans.validateLaunchPlan({...ok,uiPort:'3200',apiPort:'3201'}).apiPort).toBe('3201');
  for(const bad of [{uiPort:'3100',apiPort:'3201'},{uiPort:'3200',apiPort:'3101'},{uiPort:3100,apiPort:3101},{environment:{...ok.environment,path:'/etc/debateai-v3-preview/auth-dev-v1/api.env'}},
   {environment:{...ok.environment,path:'/etc/debateai-v3-preview/auth-dev-v1/api-other-v1.env'}},{environment:{...ok.environment,path:'/etc/debateai-v3-preview/auth-dev-v1/ui-d50e33165-r19-v1.env'}}])
   expect(()=>plans.validateLaunchPlan({...ok,...bad})).toThrow('PREVIEW_LAUNCH_PLAN_REFUSED');
 });
 it.each(['/opt/debateai-v3-preview/releases/auth-dev-candidate-x-ui','/opt/debateai-v3-preview/releases/auth-dev-candidate-X-api',
  '/opt/debateai-v3-preview/releases/auth-dev-candidate--api','/opt/debateai-v3-preview/releases/auth-dev-candidate-a/b-api',
  '/opt/debateai-v3-preview/releases/auth-dev-candidate-x--api','/opt/debateai-v3-preview/releases/auth-dev-candidate-../x-api',
  '/opt/debateai-v3-preview/releases/auth-dev-candidate-x-api/','/opt/debateai-v3-preview/releases/auth-dev-other-x-api',
  `/opt/debateai-v3-preview/releases/auth-dev-candidate-${'a'.repeat(73)}-api`])('labelOfSourceRoot refuses %s for api',root=>
  expect(()=>plans.labelOfSourceRoot(root,'api')).toThrow('PREVIEW_LAUNCH_PLAN_REFUSED'));
 it('labelOfSourceRoot takes the label before the last service segment',()=>{
  expect(plans.labelOfSourceRoot('/opt/debateai-v3-preview/releases/auth-dev-fallback-r20-api-v1-api','api')).toBe('r20-api-v1');
  expect(plans.labelOfSourceRoot('/opt/debateai-v3-preview/releases/auth-dev-candidate-x-runner','runner')).toBe('x');
  expect(plans.labelOfSourceRoot(`/opt/debateai-v3-preview/releases/auth-dev-candidate-${'a'.repeat(72)}-ui`,'ui')).toBe('a'.repeat(72));
  expect(()=>plans.labelOfSourceRoot('/opt/debateai-v3-preview/releases/auth-dev-candidate-x-api','other')).toThrow('PREVIEW_LAUNCH_PLAN_REFUSED');
 });
 it('names the two slots, their env file paths, and refuses any other port pair',()=>{
  expect(plans.PREVIEW_SLOTS).toEqual({A:{uiPort:'3100',apiPort:'3101'},B:{uiPort:'3200',apiPort:'3201'}});
  expect(Object.isFrozen(plans.PREVIEW_SLOTS)&&Object.isFrozen(plans.PREVIEW_SLOTS.A)&&Object.isFrozen(plans.PREVIEW_SLOTS.B)).toBe(true);
  expect(plans.slotOfPorts('3100','3101')).toBe('A');expect(plans.slotOfPorts('3200','3201')).toBe('B');
  for(const [ui,api] of [['3101','3100'],['3100','3201'],['3300','3301'],[3100,3101]])expect(()=>plans.slotOfPorts(ui,api)).toThrow('PREVIEW_LAUNCH_PLAN_REFUSED');
  expect(plans.previewEnvironmentPath('runner','r20-v1')).toBe('/etc/debateai-v3-preview/auth-dev-v1/runner-r20-v1.env');
  for(const [service,label] of [['api','../x'],['api','X'],['other','x'],['api','']])expect(()=>plans.previewEnvironmentPath(service,label)).toThrow('PREVIEW_LAUNCH_PLAN_REFUSED');
  expect(plans.RELEASE_LABEL.test('d50e33165-r19-v1')).toBe(true);
  for(const label of ['','-x','x-','X','a/b','../x','a'.repeat(73)])expect(plans.RELEASE_LABEL.test(label)).toBe(false);
 });
 it('keeps candidate and fallback distinct and a separate fixed PG18 cluster instead of a second live database',()=>{const value={schema:'preview-auth-dev-stage-v1',candidateRoot:plan.sourceRoot,fallbackRoot:'/opt/debateai-v3-preview/releases/auth-dev-fallback-v1',sourceRevision:revision,sourceTree:tree,cluster:'debateai-preview-auth-dev-stage-v1',database:'debateai_preview_auth_dev_stage',socket:'/run/debateai-preview-auth-dev-stage/postgresql',dataDirectory:'/var/lib/postgresql/18/preview-auth-dev-stage',port:55434,apiPort:55431,uiPort:55430,postgresMajor:18};expect(stage.validateStagePlan(value)).toEqual(value);for(const patch of [{fallbackRoot:value.candidateRoot},{port:5434},{socket:'/run/debateai-v3-preview/postgresql'},{dataDirectory:'/var/lib/postgresql/18/v3-preview'},{cluster:'debateai-v3-preview-15fccd74'}])expect(()=>stage.validateStagePlan({...value,...patch})).toThrow();});
 it('requires fresh truthful current-native evidence and never accepts a historical106 attestation relabel',()=>{const now=Date.parse('2026-10-06T12:00:01Z');const evidence={schema:'preview-auth-dev-native-v1',sourceRevision:revision,sourceTree:tree,nativeSourceSha256:digest,verifiedAt:'2026-10-06T12:00:00Z',postgresMajor:18,executorRole:'debateai_prod_migrator',executorOid:16388,ledgerOwnerOid:16388,billingOwnerOid:16388,defaultOwnerCount:6,ledgerCount:128,resolutionCount:1,forwardCount:1,catalogSha256:digest,ledgerSha256:digest,resolutionSha256:digest,forwardSha256:digest,cohortCount:0,capabilityCounts:{api:10,runner:11},currentContractVerified:true,publication,databaseAhead:null};expect(native.validateNativeAttestation(evidence,{sourceRevision:revision,sourceTree:tree,nativeSourceSha256:digest,publication},now)).toEqual(evidence);expect(native.validateNativeAttestation({...evidence,publication:{...publication,recordedAt:'2026-10-06T14:00:00+02:00'}},{sourceRevision:revision,sourceTree:tree,nativeSourceSha256:digest,publication:{...publication,recordedAt:new Date(publication.recordedAt)}},now)).toBeTruthy();for(const patch of [{verifiedAt:'2026-10-06T11:55:00Z'},{executorOid:1},{forwardCount:0},{currentContractVerified:false},{sourceRevision:'c'.repeat(40)},{publication:{...publication,registerVersion:'13'}},{publication:{...publication,recordedAt:'2026-10-06T12:00:00.001Z'}}])expect(()=>native.validateNativeAttestation({...evidence,...patch},{sourceRevision:revision,sourceTree:tree,nativeSourceSha256:digest,publication},now)).toThrow();});
 // Side-by-side spec §5 (G6): a proof made beside a newer database names the root-pinned database-ahead file it used.
 it('accepts a database-ahead proof only for the file the lock pinned',()=>{
  const now=Date.parse('2026-10-06T12:00:01Z');
  const evidence={schema:'preview-auth-dev-native-v1',sourceRevision:revision,sourceTree:tree,nativeSourceSha256:digest,verifiedAt:'2026-10-06T12:00:00Z',postgresMajor:18,executorRole:'debateai_prod_migrator',executorOid:16388,ledgerOwnerOid:16388,billingOwnerOid:16388,defaultOwnerCount:6,ledgerCount:129,resolutionCount:1,forwardCount:1,catalogSha256:digest,ledgerSha256:digest,resolutionSha256:digest,forwardSha256:digest,cohortCount:0,capabilityCounts:{api:10},currentContractVerified:true,publication,
   databaseAhead:{fileSha256:'e'.repeat(64),newerLabel:'d50e33166-r20-v1',extraSteps:['0124_side_next.sql','0125_more.sql']}};
  const base={sourceRevision:revision,sourceTree:tree,nativeSourceSha256:digest,publication};
  expect(native.validateNativeAttestation(evidence,{...base,databaseAheadSha256:'e'.repeat(64)},now)).toEqual(evidence);
  // A caller that does not know the lock (the launcher, the release tool) checks the shape only.
  expect(native.validateNativeAttestation(evidence,base,now)).toEqual(evidence);
  expect(native.validateNativeAttestation({...evidence,databaseAhead:null},{...base,databaseAheadSha256:'e'.repeat(64)},now).databaseAhead).toBeNull();
  for(const binding of [{...base,databaseAheadSha256:'f'.repeat(64)},{...base,databaseAheadSha256:null},{...base,databaseAheadSha256:'E'.repeat(64)},{...base,databaseAheadSha256:undefined}])
   expect(()=>native.validateNativeAttestation(evidence,binding,now)).toThrow('PREVIEW_NATIVE_ATTESTATION_REFUSED');
  const ahead=evidence.databaseAhead;
  for(const value of [undefined,{},{...ahead,fileSha256:'x'},{...ahead,newerLabel:'New'},{...ahead,newerLabel:'a/b'},{...ahead,extraSteps:[]},{...ahead,extraSteps:['0125_more.sql','0124_side_next.sql']},
   {...ahead,extraSteps:['0124_side_next.sql','0124_side_next.sql']},{...ahead,extraSteps:['124_x.sql']},{...ahead,extraSteps:Array.from({length:65},(_,index)=>`${1000+index}_x.sql`)},{...ahead,more:1}])
   expect(()=>native.validateNativeAttestation({...evidence,databaseAhead:value},base,now)).toThrow('PREVIEW_NATIVE_ATTESTATION_REFUSED');
  const {databaseAhead:_dropped,...withoutKey}=evidence;
  expect(()=>native.validateNativeAttestation(withoutKey,base,now)).toThrow();
  expect(native.RELEASE_LABEL.source).toBe(plans.RELEASE_LABEL.source);
 });
});

describe('complete actual-main stage receipts',()=>{
 const stagePlan={schema:'preview-auth-dev-stage-v1',...stage.STAGE,candidateRoot:'/opt/debateai-v3-preview/releases/auth-dev-candidate-v1',fallbackRoot:'/opt/debateai-v3-preview/releases/auth-dev-fallback-v1',sourceRevision:revision,sourceTree:tree};
 const proof={passed:true,receiptSha256:digest};
 const leaf=()=>({schema:'preview-auth-dev-full-runtime-v1',fullAccountMatrixAccepted:true,installedCustodyAccepted:false,genuineCloudflareAccepted:false,nativeMailAccepted:false,runnerStarted:false,behaviorProofs:Object.fromEntries(stage.STAGE_REQUIRED_PROOFS.filter((name:string)=>!name.endsWith('-listen')).map((name:string)=>[name,{...proof}]))});
 const value=()=>({schema:'preview-auth-dev-stage-result-v2',platform:'linux',sourceRevision:revision,sourceTree:tree,...stage.STAGE,candidateRoot:stagePlan.candidateRoot,fallbackRoot:stagePlan.fallbackRoot,proofs:Object.fromEntries(stage.STAGE_REQUIRED_PROOFS.map((name:string)=>[name,{...proof}])),receipts:{candidate:leaf(),fallback:leaf()},runnerStarted:false,realMailSent:false,providerNetworkCalled:false,fullAccountMatrixAccepted:true,installedCustodyAccepted:false,nativeMailAccepted:false,genuineCloudflareAccepted:false});
 it('requires every finite behavioral proof independently from both full main lifecycles',()=>expect(stage.assertStageCompletion(value(),stagePlan)).toBe(true));
 it.each(['candidate','fallback'])('refuses missing, failed, smoke or installed-claim %s leaf',(artifact)=>{
  for(const kind of ['missing','failed','smoke','custody']){const r:any=value();if(kind==='missing')delete r.receipts[artifact].behaviorProofs['legacy-primary-recovery'];if(kind==='failed')r.receipts[artifact].behaviorProofs['legacy-primary-recovery'].passed=false;if(kind==='smoke')r.receipts[artifact].schema='preview-auth-dev-runtime-exercise-v1';if(kind==='custody')r.receipts[artifact].installedCustodyAccepted=true;expect(()=>stage.assertStageCompletion(r,stagePlan)).toThrow('PREVIEW_STAGE_INCOMPLETE');}
 });
});
