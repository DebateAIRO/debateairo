import pg from 'pg';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { exactKeys,strictJson,withPrivateBytes,sha256,refuse } from './custody.mjs';
import { validateStagePlan,STAGE,STAGE_REQUIRED_PROOFS,assertStageCompletion } from './stage-plan.mjs';
import { readPublicArtifact } from './launch-plan.mjs';
import { verifySourceManifest } from './source-manifest.mjs';
import { verifyUiBuildManifest } from './ui-build.mjs';
import { exerciseStageRuntime } from './stage-runtime.mjs';
/** The executable has one fixed stage namespace and never accepts a target URL argument. */
export async function runStage(){
 if(process.platform!=='linux'||process.version!=='v26.8.2'||process.argv.length!==2||process.getuid?.()===0)refuse('PREVIEW_LINUX_STAGE_ACTOR_REQUIRED');
 const operation=await withPrivateBytes('/etc/debateai-v3-preview/auth-dev-v1/stage-operation.json',{root:'/etc/debateai-v3-preview/auth-dev-v1',uid:0,mode:0o644,maxBytes:32768},raw=>strictJson(raw));
 exactKeys(operation,['schema','stage','stageUid','candidate','fallback']);
 const full=operation.schema==='preview-auth-dev-stage-operation-v3';
 if(!['preview-auth-dev-stage-operation-v2','preview-auth-dev-stage-operation-v3'].includes(operation.schema)||operation.stageUid!==process.getuid())refuse('PREVIEW_STAGE_ACTOR_REFUSED');
 const stage=validateStagePlan(operation.stage),root='/var/lib/debateai-preview-auth-dev-stage';
 const prepared={};const roots=[];
 for(const artifact of ['candidate','fallback']){
  const input=exactKeys(operation[artifact],['api','ui','uiBuild']);
  const api=await readPublicArtifact(input.api,'source'),ui=await readPublicArtifact(input.ui,'source'),build=await readPublicArtifact(input.uiBuild,'ui-build');
  for(const [role,source,reference]of [['api',api,input.api],['ui',ui,input.ui]]){
   if(source.uid!==0||source.sourceRoot!==`${stage[`${artifact}Root`]}-${role}`)refuse('PREVIEW_STAGE_SOURCE_ROOT_REFUSED');
   await verifySourceManifest(source,{sourceRevision:stage.sourceRevision,sourceTree:stage.sourceTree,sourceRoot:source.sourceRoot,role,manifestSha256:reference.sha256,...(artifact==='candidate'&&role==='api'?{execution:{entryUrl:import.meta.url,entryName:'run-stage.mjs',operatorManifestSha256:sha256(JSON.stringify(source.files.filter(file=>file.path.startsWith('dialectical-engine/deploy/preview-auth-dev/v1/'))))}}:{})});roots.push(source.sourceRoot);
  }
  await verifyUiBuildManifest(build,ui);
  prepared[artifact]={api,ui};
 }
 if(new Set(roots).size!==4)refuse('PREVIEW_STAGE_PACKAGE_REUSE_REFUSED');
 const fixture=await withPrivateBytes(join(root,full?'full-fixture.json':'fixture.json'),{root,uid:operation.stageUid,mode:0o600,parentMode:0o700,maxBytes:65536},raw=>strictJson(raw));
 exactKeys(fixture,full?['schema','environment','publication','accounts','cohortCount']:['environment','publication']);
 if(full&&(fixture.schema!=='preview-auth-dev-full-fixture-v1'||fixture.cohortCount!==4))refuse('PREVIEW_STAGE_FULL_FIXTURE_REFUSED');
 if(fixture.environment.API_PORT!==String(STAGE.apiPort))refuse('PREVIEW_STAGE_PORT_REFUSED');
 for(const [key,value]of Object.entries(fixture.environment))if(key==='DATABASE_URL'||key.endsWith('_DATABASE_URL')){
  const url=new URL(value);if(url.pathname!==`/${STAGE.database}`||url.searchParams.get('host')!==STAGE.socket||String(url.searchParams.get('port')??url.port)!==String(STAGE.port))refuse('PREVIEW_STAGE_DATABASE_REFUSED');
 }
 const probe=new pg.Client({connectionString:fixture.environment.DATABASE_URL,connectionTimeoutMillis:5000});
 try{await probe.connect();const row=(await probe.query(`SELECT current_database() database,current_setting('port')::int port,current_setting('cluster_name') cluster,current_setting('data_directory') directory,(current_setting('server_version_num')::int/10000) major`)).rows[0];
  if(!row||row.database!==STAGE.database||row.port!==STAGE.port||row.cluster!==STAGE.cluster||row.directory!==STAGE.dataDirectory||row.major!==18)refuse('PREVIEW_STAGE_DATABASE_REFUSED');
 }finally{await probe.end();}
 const receipts={};
 for(const artifact of ['candidate','fallback']){
  const {api,ui}=prepared[artifact];
  receipts[artifact]=await exerciseStageRuntime({apiRoot:join(api.sourceRoot,'dialectical-engine'),uiRoot:join(ui.sourceRoot,'dialectical-engine'),stateRoot:join(root,artifact),environment:fixture.environment,publication:fixture.publication,uiPort:STAGE.uiPort,...(full?{fullFixture:fixture,artifact}:{})});
 }
 if(full){
  const proofs={};
  for(const name of STAGE_REQUIRED_PROOFS){
   if(name.endsWith('-listen')){const [artifact,role]=name.split('-'),leaf=receipts[artifact];proofs[name]={passed:true,receiptSha256:sha256(JSON.stringify(role==='api'?{pid:leaf.apiPid,main:leaf.apiMainSha256,version:leaf.registerVersion,snapshot:leaf.nativeSnapshotSha256,responses:leaf.apiProofs}:{pid:leaf.uiPid,pages:leaf.pages,build:leaf.servedBuildSha256}))};}
   else{const both=['candidate','fallback'].map(artifact=>receipts[artifact].behaviorProofs?.[name]);if(both.some(p=>p?.passed!==true))refuse('PREVIEW_STAGE_INCOMPLETE');proofs[name]={passed:true,receiptSha256:sha256(JSON.stringify(both))};}
  }
  const receipt={schema:'preview-auth-dev-stage-result-v2',platform:process.platform,sourceRevision:stage.sourceRevision,sourceTree:stage.sourceTree,cluster:STAGE.cluster,database:STAGE.database,postgresMajor:18,candidateRoot:stage.candidateRoot,fallbackRoot:stage.fallbackRoot,publication:fixture.publication,proofs,receipts,
   runnerStarted:false,realMailSent:false,providerNetworkCalled:false,fullAccountMatrixAccepted:true,installedCustodyAccepted:false,nativeMailAccepted:false,genuineCloudflareAccepted:false};
  assertStageCompletion(receipt,stage);const text=JSON.stringify(receipt);await writeFile(join(root,'full-stage-result.json'),text,{mode:0o600,flag:'wx'});
  return {schema:receipt.schema,platform:receipt.platform,sourceRevision:receipt.sourceRevision,receiptSha256:sha256(text),candidateStarted:true,fallbackStarted:true,fullAccountMatrixAccepted:true,installedCustodyAccepted:false,nativeMailAccepted:false,genuineCloudflareAccepted:false};
 }
 const receipt={schema:'preview-auth-dev-both-startups-v1',platform:process.platform,sourceRevision:stage.sourceRevision,sourceTree:stage.sourceTree,cluster:STAGE.cluster,publication:fixture.publication,receipts,
  runnerStarted:false,fullAccountMatrixAccepted:false,installedCustodyAccepted:false};
 const text=JSON.stringify(receipt);await writeFile(join(root,'both-startups.json'),text,{mode:0o600,flag:'wx'});
 return {schema:receipt.schema,platform:receipt.platform,sourceRevision:receipt.sourceRevision,receiptSha256:sha256(text),candidateStarted:true,fallbackStarted:true,fullAccountMatrixAccepted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(`${JSON.stringify(await runStage())}\n`);}catch{process.stderr.write('PREVIEW_STAGE_REFUSED\n');process.exitCode=1;}}
