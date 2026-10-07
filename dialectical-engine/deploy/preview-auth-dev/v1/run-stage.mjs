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
import { assertNativeConnection } from './native-peer.mjs';
/** The existing stage-owned credential has one exact direct-creator envelope and endpoint. */
export function parseStageCreatorConnection(connection){
 try{
  exactKeys(connection,['schema','url'],'PREVIEW_STAGE_CREATOR_REFUSED');
  const url=new URL(connection.url);
  if(connection.schema!=='preview-auth-dev-synthetic-stage-connection-v1'||url.protocol!=='postgresql:'||url.username!=='debateai_prod_migrator'||!/^[a-f0-9]{64}$/.test(url.password)
   ||url.hostname!=='localhost'||url.port!==''||url.hash!==''||url.pathname!==`/${STAGE.database}`||url.searchParams.size!==2
   ||url.searchParams.get('host')!==STAGE.socket||url.searchParams.get('port')!==String(STAGE.port))refuse('PREVIEW_STAGE_CREATOR_REFUSED');
  return connection.url;
 }catch{refuse('PREVIEW_STAGE_CREATOR_REFUSED');}
}
/** Client-only identity gate; synthetic PG18 tests supply their isolated measured target. */
export async function assertStageDatabaseConnections(probe,creator,target=STAGE){
 const identity=await probe.query(`SELECT session_user::text session,current_user::text role,current_database() database,current_setting('port')::int port,current_setting('cluster_name') cluster,(current_setting('server_version_num')::int/10000) major`),row=identity.rows[0];
 if(identity.rows.length!==1||!row||row.session!=='preview_recovery_fixture_api'||row.role!==row.session||row.database!==target.database||row.port!==target.port||row.cluster!==target.cluster||row.major!==18)refuse('PREVIEW_STAGE_DATABASE_REFUSED');
 const native=await assertNativeConnection(creator,{...target,session:'debateai_prod_migrator',role:'debateai_prod_migrator'},[]);
 const owner=(await creator.query(`SELECT (SELECT datdba::int FROM pg_database WHERE datname=current_database()) database_owner,r.rolreplication,r.rolconfig FROM pg_roles r WHERE r.rolname=current_user`)).rows;
 if(owner.length!==1||owner[0].database_owner!==native.roleOid||owner[0].rolreplication!==false||owner[0].rolconfig!==null)refuse('PREVIEW_STAGE_CREATOR_REFUSED');
 return true;
}
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
 const connection=await withPrivateBytes(join(root,'admin-connection.json'),{root,uid:operation.stageUid,mode:0o600,parentMode:0o700,maxBytes:2048},raw=>strictJson(raw));
 const creatorUrl=parseStageCreatorConnection(connection);
 const probe=new pg.Client({connectionString:fixture.environment.DATABASE_URL,connectionTimeoutMillis:5000}),creator=new pg.Client({connectionString:creatorUrl,connectionTimeoutMillis:5000});
 connection.url='';
 try{await probe.connect();await creator.connect();await assertStageDatabaseConnections(probe,creator);}
 finally{await Promise.all([probe.end(),creator.end()]);}
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
