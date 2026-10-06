import { lstat, readdir, readFile, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, isAbsolute, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256, safeRelative, exactKeys, refuse } from './custody.mjs';
const SCHEMA='preview-auth-dev-source-v2';
const OPERATOR_PATH='dialectical-engine/deploy/preview-auth-dev/v1/';
// Only this source-derived UI output is delegated to the separate complete UiBuildManifest.
const generatedPaths=role=>role==='ui'?['dialectical-engine/apps/ui/.next']:[];
const compare=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
function inside(root,path){const rel=relative(root,path);return rel!==''&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../');}
async function fileDigest(path,uid) {
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
  try{const before=await handle.stat();const named=await lstat(path);
    if(!before.isFile()||named.isSymbolicLink()||before.uid!==uid||(before.mode&0o022)!==0||before.size>67_108_864||before.ino!==named.ino||before.dev!==named.dev)refuse('PREVIEW_SOURCE_CUSTODY_REFUSED');
    bytes=await handle.readFile();const after=await handle.stat(),last=await lstat(path);
    if(['dev','ino','size','mtimeMs','ctimeMs','mode','uid'].some(k=>before[k]!==after[k]||after[k]!==last[k])||bytes.length!==before.size)refuse('PREVIEW_SOURCE_RACE_REFUSED');
    return sha256(bytes);
  }finally{bytes?.fill(0);await handle.close();}
}
async function scanInventory(root,uid,{dependencies=false,complete=false,allowedRoot=root,excludedDirectories=[]}={}) {
  if(await realpath(root)!==root)refuse('PREVIEW_SOURCE_ROOT_REFUSED');
  const files=[],dependencyRoots=[];
  async function walk(directory) {
    const stat=await lstat(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o022)!==0)refuse('PREVIEW_SOURCE_CUSTODY_REFUSED');
    for(const name of (await readdir(directory)).sort(compare)) {
      if(['.git','.superpowers'].includes(name))refuse('PREVIEW_SOURCE_PACKAGE_SET_REFUSED');
      const path=join(directory,name),child=await lstat(path),rel=safeRelative(relative(root,path));
      if(!dependencies&&!complete&&(name==='node_modules'||excludedDirectories.includes(rel))){
        if(!child.isDirectory()||child.isSymbolicLink()||child.uid!==uid||(child.mode&0o022)!==0||await realpath(path)!==path)refuse('PREVIEW_PACKAGE_REALPATH_REFUSED');
        if(name==='node_modules')dependencyRoots.push(rel);
        continue;
      }
      if(child.isSymbolicLink()) {
        if(!dependencies)refuse('PREVIEW_SOURCE_SYMLINK_REFUSED');
        const target=await realpath(path);
        if(!inside(allowedRoot,target))refuse('PREVIEW_PACKAGE_REALPATH_REFUSED');
        files.push({path:rel,realpath:target});
      }else if(child.isDirectory())await walk(path);
      else files.push({path:rel,sha256:await fileDigest(path,uid),mode:child.mode&0o777});
    }
  }
  await walk(root);return {files:files.sort((a,b)=>compare(a.path,b.path)),dependencyRoots:dependencyRoots.sort(compare)};
}
export async function buildInventory(root,uid,options={}) { return (await scanInventory(root,uid,options)).files; }
export async function verifyPackageLinks(root,links) {
  const seen=new Set();
  for(const link of links){exactKeys(link,['path','realpath']);safeRelative(link.path);if(seen.has(link.path)||!inside(root,link.realpath)||await realpath(join(root,link.path))!==link.realpath)refuse('PREVIEW_PACKAGE_REALPATH_REFUSED');seen.add(link.path);}
  return true;
}
export async function verifyInventory(root,uid,files,options={}) {
  if(!Array.isArray(files)||!files.length)refuse('PREVIEW_SOURCE_INVENTORY_REFUSED');
  for(const row of files){safeRelative(row.path);if('sha256'in row){exactKeys(row,['path','sha256','mode']);if(!/^[a-f0-9]{64}$/.test(row.sha256)||![0o444,0o644,0o555,0o755,0o600,0o400,0o700,0o500].includes(row.mode))refuse('PREVIEW_SOURCE_HASH_REFUSED');}else exactKeys(row,['path','realpath']);}
  const actual=await buildInventory(root,uid,options);
  if(JSON.stringify(actual)!==JSON.stringify(files))refuse('PREVIEW_SOURCE_INVENTORY_REFUSED');
  return true;
}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:32*1024*1024,env:{PATH:'/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',LC_ALL:'C'}}).trim();}
/** Called after the reviewed commit, on a separate git-archive package; write its result OUTSIDE the checkout. */
export async function generateSourceManifest({repositoryRoot,sourceRoot,role,uid}) {
  if(!['api','ui','runner'].includes(role)||git(repositoryRoot,['status','--porcelain','--untracked-files=no'])!=='')refuse('PREVIEW_SOURCE_NOT_FROZEN');
  const sourceRevision=git(repositoryRoot,['rev-parse','HEAD']),sourceTree=git(repositoryRoot,['rev-parse','HEAD^{tree}']);
  const tracked=git(repositoryRoot,['ls-tree','-rz','--name-only','HEAD']).split('\0').filter(Boolean).sort(compare);
  const layout=await scanInventory(sourceRoot,uid,{excludedDirectories:generatedPaths(role)});
  const files=layout.files;
  if(JSON.stringify(files.map(f=>f.path))!==JSON.stringify(tracked))refuse('PREVIEW_SOURCE_PACKAGE_SET_REFUSED');
  for(const file of files){if(file.sha256!==sha256(execFileSync('git',['-C',repositoryRoot,'show',`${sourceRevision}:${file.path}`],{maxBuffer:64*1024*1024})))refuse('PREVIEW_SOURCE_PACKAGE_HASH_REFUSED');}
  assertDependencyRoots(layout.dependencyRoots,files);
  const dependencyInventory=[];const packageLinks=[];
  for(const path of layout.dependencyRoots){const root=join(sourceRoot,path);const inventory=await buildInventory(root,uid,{dependencies:true,allowedRoot:sourceRoot});dependencyInventory.push({path:relative(sourceRoot,root),files:inventory});for(const item of inventory)if(item.realpath)packageLinks.push({path:relative(sourceRoot,join(root,item.path)),realpath:item.realpath});}
  if(!dependencyInventory.length)refuse('PREVIEW_DEPENDENCY_INVENTORY_REQUIRED');
  await verifyPackageLinks(sourceRoot,packageLinks);
  const generatedContracts=files.filter(file=>file.path.startsWith('dialectical-engine/packages/contract/generated/'));
  if(generatedContracts.length<2)refuse('PREVIEW_CONTRACT_REQUIRED');
  const groups={native:[],contract:generatedContracts,promptStoryProvider:[],packages:[]};
  for(const file of files){if(/\/migrations\//.test(file.path))groups.native.push(file);if(/\/(?:providers|story)\/|\/prompts\//.test(file.path))groups.promptStoryProvider.push(file);if(/(?:package\.json|pnpm-lock\.yaml)$/.test(file.path))groups.packages.push(file);}
  if(process.version!=='v26.8.2'||execFileSync('pnpm',['--version'],{encoding:'utf8',env:{PATH:'/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin'}}).trim()!=='11.20.0')refuse('PREVIEW_RUNTIME_VERSION_REFUSED');
  return {schema:SCHEMA,sourceRevision,sourceTree,sourceRoot,role,uid,nodeVersion:process.version,pnpmVersion:'11.20.0',files,packageLinks,dependencyInventory,
    nativeSha256:sha256(JSON.stringify(groups.native)),contractSha256:sha256(JSON.stringify(generatedContracts)),promptStoryProviderSha256:sha256(JSON.stringify(groups.promptStoryProvider)),packageLockSha256:sha256(JSON.stringify(groups.packages))};
}
export async function verifySourceManifest(manifest,expected) {
  exactKeys(manifest,['schema','sourceRevision','sourceTree','sourceRoot','role','uid','nodeVersion','pnpmVersion','files','packageLinks','dependencyInventory','nativeSha256','contractSha256','promptStoryProviderSha256','packageLockSha256']);
  if(manifest.schema!==SCHEMA||manifest.sourceRevision!==expected.sourceRevision||manifest.sourceTree!==expected.sourceTree
    ||manifest.sourceRoot!==expected.sourceRoot||manifest.role!==expected.role||manifest.nodeVersion!=='v26.8.2'||manifest.pnpmVersion!=='11.20.0'
    ||sha256(JSON.stringify(manifest))!==expected.manifestSha256||process.version!==manifest.nodeVersion)refuse('PREVIEW_SOURCE_BINDING_REFUSED');
  const layout=await scanInventory(manifest.sourceRoot,manifest.uid,{excludedDirectories:generatedPaths(manifest.role)});
  if(JSON.stringify(layout.files)!==JSON.stringify(manifest.files))refuse('PREVIEW_SOURCE_INVENTORY_REFUSED');
  if(!Array.isArray(manifest.dependencyInventory)||!manifest.dependencyInventory.length)refuse('PREVIEW_DEPENDENCY_INVENTORY_REQUIRED');
  for(const entry of manifest.dependencyInventory){exactKeys(entry,['path','files']);safeRelative(entry.path);}
  const declaredRoots=manifest.dependencyInventory.map(entry=>entry.path);
  assertDependencyRoots(declaredRoots,manifest.files);
  if(JSON.stringify(declaredRoots)!==JSON.stringify(layout.dependencyRoots))refuse('PREVIEW_DEPENDENCY_ROOT_SET_REFUSED');
  const declaredLinks=manifest.dependencyInventory.flatMap(entry=>entry.files.filter(file=>file.realpath).map(file=>({path:`${entry.path}/${file.path}`,realpath:file.realpath})));
  if(JSON.stringify(declaredLinks)!==JSON.stringify(manifest.packageLinks))refuse('PREVIEW_PACKAGE_LINK_SET_REFUSED');
  await verifyPackageLinks(manifest.sourceRoot,manifest.packageLinks);
  const knownFiles=[...manifest.files.map(file=>join(manifest.sourceRoot,file.path)),...manifest.dependencyInventory.flatMap(entry=>entry.files.filter(file=>file.sha256).map(file=>join(manifest.sourceRoot,entry.path,file.path)))];
  if(manifest.packageLinks.some(link=>!knownFiles.some(path=>path===link.realpath||path.startsWith(`${link.realpath}/`))))refuse('PREVIEW_PACKAGE_TARGET_UNBOUND');
  // Each dependency subtree has a closed complete inventory. PNPM links name their exact package/workspace target.
  for(const entry of manifest.dependencyInventory){safeRelative(entry.path);await verifyInventory(join(manifest.sourceRoot,entry.path),manifest.uid,entry.files,{dependencies:true,allowedRoot:manifest.sourceRoot});}
  if(expected.execution!==undefined)await verifyExecutingOperator(manifest,expected.execution);
  return true;
}

function assertDependencyRoots(roots,files) {
  if(new Set(roots).size!==roots.length)refuse('PREVIEW_DEPENDENCY_ROOT_SET_REFUSED');
  const packages=new Set(files.filter(file=>file.path==='package.json'||file.path.endsWith('/package.json')).map(file=>dirname(file.path)));
  for(const path of roots)if(!packages.has(dirname(path))||!path.endsWith('/node_modules')&&path!=='node_modules')refuse('PREVIEW_DEPENDENCY_ROOT_SET_REFUSED');
}
async function verifyExecutingOperator(manifest,execution) {
  exactKeys(execution,['entryUrl','entryName','operatorManifestSha256'],'PREVIEW_EXECUTING_OPERATOR_REFUSED');
  if(!['launch-api.mjs','launch-ui.mjs','launch-runner.mjs','native-operator.mjs','run-stage.mjs'].includes(execution.entryName))refuse('PREVIEW_EXECUTING_OPERATOR_REFUSED');
  const operatorRoot=join(manifest.sourceRoot,OPERATOR_PATH.slice(0,-1)),entry=join(operatorRoot,execution.entryName),verifier=join(operatorRoot,'source-manifest.mjs');
  const entryUrl=new URL(execution.entryUrl),selfUrl=new URL(import.meta.url);
  if(entryUrl.protocol!=='file:'||entryUrl.search||entryUrl.hash||selfUrl.search||selfUrl.hash
    ||fileURLToPath(entryUrl)!==entry||entryUrl.href!==pathToFileURL(entry).href||fileURLToPath(selfUrl)!==verifier
    ||process.argv[1]!==entry||resolve(process.argv[1])!==entry||await realpath(entry)!==entry||await realpath(verifier)!==verifier)refuse('PREVIEW_EXECUTING_OPERATOR_REFUSED');
  const declared=manifest.files.filter(file=>file.path.startsWith(OPERATOR_PATH));
  const actual=(await buildInventory(operatorRoot,manifest.uid,{complete:true,allowedRoot:manifest.sourceRoot})).map(file=>({...file,path:OPERATOR_PATH+file.path}));
  // Compare fields explicitly: property insertion order is not module identity.
  if(!declared.some(file=>file.path===OPERATOR_PATH+execution.entryName)
    ||sha256(JSON.stringify(declared))!==execution.operatorManifestSha256
    ||actual.length!==declared.length||actual.some((file,index)=>file.path!==declared[index]?.path||file.sha256!==declared[index]?.sha256||file.mode!==declared[index]?.mode))refuse('PREVIEW_EXECUTING_OPERATOR_REFUSED');
}
