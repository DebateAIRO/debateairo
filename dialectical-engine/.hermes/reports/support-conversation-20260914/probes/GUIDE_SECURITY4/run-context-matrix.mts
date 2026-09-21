import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync,lstatSync,readFileSync,realpathSync } from "node:fs";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const target=resolve(required("GUIDE_SECURITY4_TARGET_ROOT"));
const revision=required("GUIDE_SECURITY4_TARGET_REVISION");
const manifestPath=resolve(required("GUIDE_SECURITY4_TARGET_MANIFEST"));
const dependencyRoot=resolve(required("GUIDE_SECURITY4_DEPENDENCY_ROOT"));
const matrixPath=resolve(required("GUIDE_SECURITY4_MATRIX"));
const expectedMatrixSha256=required("GUIDE_SECURITY4_MATRIX_SHA256");
const expectedMatrixCount=Number.parseInt(required("GUIDE_SECURITY4_MATRIX_COUNT"),10);
if(matrixPath!==resolve(join(here,"matrix.json"))) throw new Error("MATRIX_PATH_NOT_ALLOWED");
const matrixBytes=readFileSync(matrixPath);
const matrixSha256=sha256(matrixBytes);
const matrix=JSON.parse(matrixBytes.toString("utf8"));
if(matrixSha256!==expectedMatrixSha256 || matrix.cases.length!==expectedMatrixCount) {
  throw new Error(`MATRIX_IDENTITY_MISMATCH_${matrixSha256}_${matrix.cases.length}`);
}
const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));

function required(name:string):string {
  const value=process.env[name];
  if(value===undefined||value.trim()==="") throw new Error(`${name}_REQUIRED`);
  return value;
}
function sha256(bytes:Buffer):string {
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
const [{buildSupportKnowledgeContext},{loadHelpCorpus},{SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES},
  {resolveSupportActions}]=await Promise.all([
  import(moduleUrl("packages/support-kb/src/context.ts")),
  import(moduleUrl("packages/support-kb/src/index.ts")),
  import(moduleUrl("packages/support-kb/src/catalog.ts")),
  import(moduleUrl("packages/support-kb/src/navigation.ts"))
]);
const corpus=loadHelpCorpus(join(target,"packages/support-kb/content"),{
  reviewManifest:JSON.parse(readFileSync(join(target,"packages/support-kb/reviews/manifest.json"),"utf8")),
  recoveryComponents:readFileSync(join(target,"packages/support-kb/recovery/components.json")),
  requireReviewedRecovery:true
});
const privateMarkers=[...new Set(corpus.entries.flatMap((entry:any)=>[
  ...(entry.sources??[]),entry.verifiedAgainst
]).filter((value:any)=>typeof value==="string"&&value.length>=8))];
const results=[];
for(const item of matrix.cases){
  const availableActionIds=resolveSupportActions(SUPPORT_ACTION_IDS,{
    signedIn:item.signedIn,language:item.language
  }).map((action:any)=>action.id);
  const context=buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,
    availableActionIds,language:item.language,query:item.query,historyText:"",maxCodePoints:24_000,
    referenceFor:(kind:string,index:number)=>`${kind==="source"?"s":"a"}-40000000000040008000000000000004-${index+1}`
  });
  const noPrivateMarker=privateMarkers.every((marker:string)=>!context.text.includes(marker));
  const exactActions=JSON.stringify(context.requestedActionIds)===JSON.stringify(item.expectedActions);
  const sourceExpectation=item.expectSource===null ? true
    : item.expectSource ? context.sourceIds.length>0 : context.sourceIds.length===0;
  const referencesMatch=context.actionReferences.length===context.requestedActionIds.length;
  const pass=exactActions&&sourceExpectation&&noPrivateMarker&&referencesMatch
    &&context.requestedActionIds.every((id:string)=>availableActionIds.includes(id));
  results.push({id:item.id,query:item.query,expectedActions:item.expectedActions,
    actualActions:context.requestedActionIds,sourceIds:context.sourceIds,noPrivateMarker,
    availableActionIds,actionReferences:context.actionReferences,pass});
}
const failed=results.filter((item:any)=>!item.pass);
console.log(JSON.stringify({kind:"GUIDE_SECURITY4_CONTEXT_MATRIX",revision,custody,
  matrixPath,matrixSha256,matrixCount:matrix.cases.length,cases:results.length,
  passed:results.length-failed.length,failed:failed.length,privateMarkersChecked:privateMarkers.length,
  results},null,2));
if(failed.length>0) process.exitCode=1;
