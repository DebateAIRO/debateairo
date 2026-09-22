import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync,lstatSync,readFileSync,realpathSync } from "node:fs";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const target=resolve(required("GUIDE_SECURITY6_TARGET_ROOT"));
const revision=required("GUIDE_SECURITY6_TARGET_REVISION");
const manifestPath=resolve(required("GUIDE_SECURITY6_TARGET_MANIFEST"));
const dependencyRoot=resolve(required("GUIDE_SECURITY6_DEPENDENCY_ROOT"));
const matrixPath=resolve(required("GUIDE_SECURITY6_POLICY_MATRIX"));
const expectedMatrixSha256=required("GUIDE_SECURITY6_POLICY_MATRIX_SHA256");
const expectedMatrixCount=Number.parseInt(required("GUIDE_SECURITY6_POLICY_MATRIX_COUNT"),10);
if(matrixPath!==resolve(join(here,"matrix-policy.json"))) throw new Error("MATRIX_PATH_NOT_ALLOWED");
const matrixBytes=readFileSync(matrixPath);
const matrixSha256=sha256(matrixBytes);
const matrix=JSON.parse(matrixBytes.toString("utf8"));
const matrixCount=matrix.routeCases.length+matrix.policyCases.length;
if(matrixSha256!==expectedMatrixSha256||matrixCount!==expectedMatrixCount) {
  throw new Error(`MATRIX_IDENTITY_MISMATCH_${matrixSha256}_${matrixCount}`);
}
const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));

function required(name:string):string {
  const value=process.env[name];
  if(value===undefined||value.trim()==="") throw new Error(`${name}_REQUIRED`);
  return value;
}
function sha256(bytes:Buffer|string):string {
  return createHash("sha256").update(bytes).digest("hex");
}
function git(...args:string[]):string {
  return execFileSync("git",["-C",target,...args],{encoding:"utf8"}).trim();
}
const allowedDependencyLinks=[
  "node_modules","apps/api/node_modules","apps/ui/node_modules",
  "apps/runner/node_modules","packages/support-kb/node_modules"
];
const rawDirty=git("status","--short");
const dirtyLines=rawDirty===""?[]:rawDirty.split("\n");
const dependencyLinks=allowedDependencyLinks.map((relative)=>{
  const link=join(target,relative),expected=join(dependencyRoot,relative);
  return {relative,symlink:existsSync(link)&&lstatSync(link).isSymbolicLink(),
    targetMatches:existsSync(link)&&existsSync(expected)&&realpathSync(link)===realpathSync(expected)};
});
const custody={
  head:git("rev-parse","HEAD"),dirty:rawDirty,
  unexpectedDirty:dirtyLines.filter((line)=>!allowedDependencyLinks.some((relative)=>line===`?? ${relative}`)),
  dependencyLinks,manifestRevision:String(manifest.revision??""),
  productMismatches:(manifest.productFiles??[]).flatMap((item:any)=>{
    const path=join(target,item.laneRelative);
    if(!existsSync(path)) return [{path:item.laneRelative,reason:"missing"}];
    const bytes=readFileSync(path);
    return sha256(bytes)===item.sha256&&bytes.length===item.bytes?[]:[{path:item.laneRelative,reason:"digest"}];
  }),
  deletedPresent:(manifest.deletedProductPaths??[]).filter((path:string)=>existsSync(join(target,path)))
};
if(custody.head!==revision||custody.unexpectedDirty.length>0
  ||custody.dependencyLinks.some((item)=>!item.symlink||!item.targetMatches)
  ||custody.manifestRevision!==revision||custody.productMismatches.length>0
  ||custody.deletedPresent.length>0) {
  console.log(JSON.stringify({kind:"CUSTODY_FAILURE",revision,custody},null,2));
  process.exit(2);
}

const moduleUrl=(path:string)=>pathToFileURL(join(target,path)).href;
const [contextModule,indexModule,catalogModule,navigationModule,classifyModule,boundaryModule]=await Promise.all([
  import(moduleUrl("packages/support-kb/src/context.ts")),
  import(moduleUrl("packages/support-kb/src/index.ts")),
  import(moduleUrl("packages/support-kb/src/catalog.ts")),
  import(moduleUrl("packages/support-kb/src/navigation.ts")),
  import(moduleUrl("apps/api/src/support/classify.ts")),
  import(moduleUrl("apps/api/src/support/public-guide-boundary.ts"))
]);
const {buildSupportKnowledgeContext}=contextModule;
const {loadHelpCorpus,selectSupportRecoveryEntry,supportSourceIdsSatisfyPolicy}=indexModule;
const {SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,SUPPORT_SOURCE_POLICIES}=catalogModule;
const {resolveSupportActions}=navigationModule;
const {classifySupportMessage}=classifyModule;
const {classifyPublicGuideBoundary}=boundaryModule;

const corpus=loadHelpCorpus(join(target,"packages/support-kb/content"),{
  reviewManifest:JSON.parse(readFileSync(join(target,"packages/support-kb/reviews/manifest.json"),"utf8")),
  recoveryComponents:readFileSync(join(target,"packages/support-kb/recovery/components.json")),
  requireReviewedRecovery:true
});
const corpusIds=new Set(corpus.entries.map((entry:any)=>entry.id));
const privateMarkers=[...new Set(corpus.entries.flatMap((entry:any)=>[
  ...(entry.sources??[]),entry.verifiedAgainst
]).filter((value:any)=>typeof value==="string"&&value.length>=8))];
const expectedPolicy={
  id:"your-and-public-debates",requiredActionIds:["your-debates","public-catalog"],
  requiredSourceIds:["app-navigation"],allowedSourceIds:["app-navigation","browse-public-debates"],
  recoverySourceIds:["app-navigation"]
};
const declaredPolicy=SUPPORT_SOURCE_POLICIES.find((item:any)=>item.id===expectedPolicy.id);
const declarationPass=JSON.stringify(declaredPolicy)===JSON.stringify(expectedPolicy)
  && Object.isFrozen(SUPPORT_SOURCE_POLICIES)&&Object.isFrozen(declaredPolicy);

function routeGate(classification:any,boundary:any):string {
  if(boundary.kind==="PRIVATE_RECORD_REQUEST"
    && classification.outcome!=="REFUSE_INJECTION"
    && classification.outcome!=="REFUSE_SAFETY") return "PRIVATE_RECORD_REQUEST";
  if(classification.securityNavigation==="FORGOT_PASSWORD"
    ||classification.securityOperation==="CREDENTIAL_OPERATION") return "SECURITY_RECOVERY";
  return classification.outcome??"MODEL";
}
const routeResults=[];
for(const item of matrix.routeCases){
  const classification=classifySupportMessage(item.text);
  const boundary=classifyPublicGuideBoundary(item.text,item.language);
  const gate=routeGate(classification,boundary);
  let context:any=null;
  if(gate==="MODEL") {
    const availableActionIds=resolveSupportActions(SUPPORT_ACTION_IDS,{
      signedIn:item.signedIn,language:item.language
    }).map((action:any)=>action.id);
    context=buildSupportKnowledgeContext({
      entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,availableActionIds,
      language:item.language,query:item.text,historyText:"",maxCodePoints:24_000,
      referenceFor:(kind:string,index:number)=>`${kind==="source"?"s":"a"}-60000000000040008000000000000006-${index+1}`
    });
  }
  const actualPolicy=context?.sourcePolicy?.id??null;
  const actualActions=[...(context?.requestedActionIds??[])];
  const expectedActions=[...(item.expectedRequiredActions??[])];
  const exactExpectedActions=expectedActions.length===0
    || JSON.stringify([...actualActions].sort())===JSON.stringify([...expectedActions].sort());
  const policySourcesPass=context===null||context.sourcePolicy===null
    || supportSourceIdsSatisfyPolicy(context.sourceIds,context.sourcePolicy);
  const sourcesClosed=context===null||context.sourceIds.every((id:string)=>corpusIds.has(id));
  const noPrivateMarker=context===null||privateMarkers.every((marker:string)=>!context.text.includes(marker));
  const pass=gate===item.expectedGate
    && (item.expectedGate!=="MODEL"||actualPolicy===item.expectedPolicy)
    && exactExpectedActions&&policySourcesPass&&sourcesClosed&&noPrivateMarker;
  routeResults.push({id:item.id,expectedGate:item.expectedGate,gate,classification,boundary,
    expectedPolicy:item.expectedPolicy??null,actualPolicy,actualActions,
    sourceIds:context?.sourceIds??[],policySourcesPass,sourcesClosed,noPrivateMarker,
    contextBuilt:context!==null,pass});
}

const policy=declaredPolicy;
const policyResults=matrix.policyCases.map((item:any)=>{
  const actual=policy===undefined?false:supportSourceIdsSatisfyPolicy(item.sourceIds,policy);
  return {...item,actual,pass:actual===item.expected};
});
const englishEntries=corpus.entries.filter((entry:any)=>entry.lang==="en"
  && ["app-navigation","browse-public-debates"].includes(entry.id));
const recoveryChecks={
  reverseOrder:selectSupportRecoveryEntry([...englishEntries].reverse(),policy)?.id??null,
  optionalOnly:selectSupportRecoveryEntry(
    englishEntries.filter((entry:any)=>entry.id==="browse-public-debates"),policy)?.id??null,
  invalidPolicy:selectSupportRecoveryEntry(englishEntries,{
    id:"invalid",requiredSourceIds:["app-navigation"],allowedSourceIds:["browse-public-debates"],
    recoverySourceIds:["app-navigation"]
  })?.id??null
};
const recoveryPass=recoveryChecks.reverseOrder==="app-navigation"
  && recoveryChecks.optionalOnly===null&&recoveryChecks.invalidPolicy===null;
let historyRejected=false;
try {
  buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,availableActionIds:SUPPORT_ACTION_IDS,
    language:"en",query:"Where is Help?",historyText:"earlier private text",maxCodePoints:24_000,
    referenceFor:(kind:string,index:number)=>`${kind==="source"?"s":"a"}-60000000000040008000000000000006-${index+1}`
  });
} catch(error) {
  historyRejected=error instanceof Error&&error.message==="SUPPORT_KB_HISTORY_NOT_AVAILABLE_IN_CP1";
}
const failed=[
  ...routeResults.filter((item:any)=>!item.pass).map((item:any)=>`route:${item.id}`),
  ...policyResults.filter((item:any)=>!item.pass).map((item:any)=>`policy:${item.id}`),
  ...(declarationPass?[]:["declaration"]),...(recoveryPass?[]:["recovery"]),
  ...(historyRejected?[]:["history"])
];
console.log(JSON.stringify({kind:"GUIDE_SECURITY6_POLICY_SAFETY",revision,custody,
  matrixPath,matrixSha256,matrixCount,declarationPass,routeResults,policyResults,
  recoveryChecks,recoveryPass,historyRejected,privateMarkersChecked:privateMarkers.length,
  passed:matrixCount-failed.filter((item)=>item.startsWith("route:")||item.startsWith("policy:")).length,
  failed},null,2));
if(failed.length>0) process.exitCode=1;
