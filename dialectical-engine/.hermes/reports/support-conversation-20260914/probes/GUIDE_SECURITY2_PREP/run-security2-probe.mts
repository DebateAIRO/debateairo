import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync,readFileSync } from "node:fs";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const target=resolve(required("GUIDE_SECURITY2_TARGET_ROOT"));
const revision=required("GUIDE_SECURITY2_TARGET_REVISION");
const manifestPath=resolve(required("GUIDE_SECURITY2_TARGET_MANIFEST"));
const matrix=JSON.parse(readFileSync(join(here,"matrix.json"),"utf8"));
const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));

function required(name:string):string {
  const value=process.env[name];
  if(value===undefined || value.trim()==="") throw new Error(`${name}_REQUIRED`);
  return value;
}
function sha256(bytes:Buffer):string {
  return createHash("sha256").update(bytes).digest("hex");
}
function git(...args:string[]):string {
  return execFileSync("git",["-C",target,...args],{encoding:"utf8"}).trim();
}

const custody={
  head:git("rev-parse","HEAD"),
  dirty:git("status","--short"),
  manifestRevision:String(manifest.revision ?? ""),
  productMismatches:(manifest.productFiles ?? []).flatMap((item:any)=>{
    const path=join(target,item.laneRelative);
    if(!existsSync(path)) return [{path:item.laneRelative,reason:"missing"}];
    const bytes=readFileSync(path);
    return sha256(bytes)===item.sha256 && bytes.length===item.bytes
      ? [] : [{path:item.laneRelative,reason:"digest"}];
  }),
  deletedPresent:(manifest.deletedProductPaths ?? [])
    .filter((path:string)=>existsSync(join(target,path)))
};
if(custody.head!==revision || custody.dirty!=="" || custody.manifestRevision!==revision
  || custody.productMismatches.length>0 || custody.deletedPresent.length>0) {
  console.log(JSON.stringify({kind:"CUSTODY_FAILURE",revision,custody},null,2));
  process.exit(2);
}

const requireFromTarget=createRequire(join(target,"package.json"));
const fastifyModule=requireFromTarget("fastify");
const Fastify=fastifyModule.default ?? fastifyModule;
const moduleUrl=(path:string)=>pathToFileURL(join(target,path)).href;
const [{installSupportRoutes},{classifySupportMessage},{classifySecurityRecovery,recoverySecurityGuidance},
  {classifyPublicGuideBoundary,isPublicAccountLocationGuide}]=await Promise.all([
  import(moduleUrl("apps/api/src/support/index.ts")),
  import(moduleUrl("apps/api/src/support/classify.ts")),
  import(moduleUrl("apps/api/src/support/security-guidance.ts")),
  import(moduleUrl("apps/api/src/support/public-guide-boundary.ts"))
]);

const KB_VERSION="a".repeat(64);
const at=new Date("2026-09-17T08:00:00.000Z");
const sessions=new Map<string,any>();
const answerInputs:any[]=[];
const admissions:any[]=[];
const writes:any[]=[];
const application:any={
  configuration:{current:async()=>({kind:"AVAILABLE",snapshot:{
    supportRegisterVersion:"1",schemaVersion:1,recordedAt:at,
    supportSnapshotSha256:"b".repeat(64),fullSnapshotSha256:"c".repeat(64),
    values:{supportEnabled:true,supportModelRef:"synthetic:none",supportRelayConcurrency:1,
      supportDailyCallCap:100,supportLimitAnonMessages10m:100,
      supportLimitAnonMessages24h:100,supportLimitAnonSessions1h:10,
      supportLimitSessionMessages:100,supportLimitMessageCharacters:2000,
      supportLimitAccountMessages10m:100,supportLimitAccountMessages24h:100,
      supportQueueDepth:1,supportLockAfterInjections:3,supportIpCooldownMinutes:1,
      supportRetentionPolicy:"keep",supportRetentionRatifiedBy:null}}})},
  sessions:{
    create:async(input:any)=>{const record=Object.freeze({sessionId:input.sessionId,
      identityOwnerRef:null,language:input.language,state:"OPEN",kbVersion:input.kbVersion,
      createdAt:input.createdAt,shreddedAt:null});sessions.set(input.sessionId,record);return record;},
    read:async({sessionId}:any)=>sessions.get(sessionId)??null,
    admitMessage:async(input:any)=>{admissions.push(input);return "ADMITTED";},
    recordRateLimit:async()=>undefined,
    status:async()=>({callsToday:0,deflection7Days:null,deflection30Days:null,
      ratingResolution7Days:null,ratingResolution30Days:null,openSessions:2,newCases:0})
  },
  messages:{
    write:async(input:any)=>{const result={...input,redacted:false};writes.push(result);return result;},
    writeAndTransit:async(input:any,transit:(text:string)=>Promise<void>)=>{
      await transit(input.text);const result={...input,redacted:false};writes.push(result);return result;},
    read:async()=>null,listSession:async()=>[]
  },
  answer:{respond:async(input:any)=>{answerInputs.push(input);return{
    messageId:`model-${answerInputs.length}`,outcome:"NO_SOURCE",text:"synthetic ordinary answer",
    canEscalate:true,sources:[],actions:[]};}},
  knowledge:{status:async()=>({kbVersion:KB_VERSION,shipped:1,ignored:0}),
    snapshot:(version:string)=>version===KB_VERSION?Object.freeze({}):undefined},
  clock:()=>at
};

const server=Fastify({logger:false});
installSupportRoutes(server,application,()=>({config:{auth:"public",session:"optional"}}));
await server.ready();
const opened=new Map<string,any>();
for(const language of ["en","ro"]){
  const response=await server.inject({method:"POST",url:"/v1/support/sessions",payload:{language}});
  if(response.statusCode!==201) throw new Error(`SESSION_OPEN_${language}_${response.statusCode}`);
  opened.set(language,response.json());
}

const results=[];
for(const item of matrix.cases){
  const capability=opened.get(item.language);
  const before=answerInputs.length;
  const response=await server.inject({method:"POST",
    url:`/v1/support/sessions/${capability.session.session_id}/messages`,
    headers:{"x-support-session-token":capability.session_token,"x-forwarded-for":"203.0.113.88"},
    payload:{text:item.text}});
  const body=response.json();
  const model=answerInputs.length>before;
  const actions=Array.isArray(body.actions)?body.actions.length:0;
  const sources=Array.isArray(body.sources)?body.sources.length:0;
  const guidance=item.guidance===undefined?true
    : body.text===recoverySecurityGuidance(item.guidance,item.language);
  const actual={status:response.statusCode,outcome:body.outcome??body.error,model,actions,sources,
    guidance,classify:classifySupportMessage(item.text).outcome,
    recovery:classifySecurityRecovery(item.text,item.language)?.kind??null,
    boundary:classifyPublicGuideBoundary(item.text,item.language).kind,
    accountLocation:isPublicAccountLocationGuide(item.text)};
  const pass=actual.status===200 && actual.outcome===item.outcome
    && actual.model===item.model && actions===item.actions && sources===item.sources && guidance;
  results.push({id:item.id,class:item.class,expected:item,actual,pass});
}
await server.close();
const failed=results.filter((item:any)=>!item.pass);
const output={kind:"GUIDE_SECURITY2_SYNTHETIC_ROUTE",revision,custody,
  matrixSha256:sha256(readFileSync(join(here,"matrix.json"))),
  composedSensitivePorts:[],cases:results.length,passed:results.length-failed.length,
  failed:failed.length,answerCalls:answerInputs.length,admissions:admissions.length,
  writes:writes.length,results};
console.log(JSON.stringify(output,null,2));
if(failed.length>0) process.exitCode=1;
