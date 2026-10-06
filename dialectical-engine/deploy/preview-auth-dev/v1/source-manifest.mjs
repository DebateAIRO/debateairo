import { lstat, readdir, readFile, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, isAbsolute } from 'node:path';
import { sha256, safeRelative, exactKeys, refuse } from './custody.mjs';
const SCHEMA='preview-auth-dev-source-v1';
const generated=new Set(['node_modules','.next']);
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
export async function buildInventory(root,uid,{dependencies=false,allowedRoot=root}={}) {
  if(await realpath(root)!==root)refuse('PREVIEW_SOURCE_ROOT_REFUSED');
  const files=[];
  async function walk(directory) {
    const stat=await lstat(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o022)!==0)refuse('PREVIEW_SOURCE_CUSTODY_REFUSED');
    for(const name of (await readdir(directory)).sort(compare)) {
      if(['.git','.superpowers'].includes(name))refuse('PREVIEW_SOURCE_PACKAGE_SET_REFUSED');
      if(!dependencies&&generated.has(name))continue;
      const path=join(directory,name),child=await lstat(path),rel=safeRelative(relative(root,path));
      if(child.isSymbolicLink()) {
        if(!dependencies)refuse('PREVIEW_SOURCE_SYMLINK_REFUSED');
        const target=await realpath(path);
        if(!inside(allowedRoot,target))refuse('PREVIEW_PACKAGE_REALPATH_REFUSED');
        files.push({path:rel,realpath:target});
      }else if(child.isDirectory())await walk(path);
      else files.push({path:rel,sha256:await fileDigest(path,uid),mode:child.mode&0o777});
    }
  }
  await walk(root);return files.sort((a,b)=>compare(a.path,b.path));
}
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
  const files=await buildInventory(sourceRoot,uid);
  if(JSON.stringify(files.map(f=>f.path))!==JSON.stringify(tracked))refuse('PREVIEW_SOURCE_PACKAGE_SET_REFUSED');
  for(const file of files){if(file.sha256!==sha256(execFileSync('git',['-C',repositoryRoot,'show',`${sourceRevision}:${file.path}`],{maxBuffer:64*1024*1024})))refuse('PREVIEW_SOURCE_PACKAGE_HASH_REFUSED');}
  const dependencyRoots=[];
  async function dependencyDirectories(directory){for(const name of await readdir(directory)){if(['.git','.superpowers','.next'].includes(name))continue;const path=join(directory,name);const stat=await lstat(path);if(name==='node_modules'){if(!stat.isDirectory()||stat.isSymbolicLink())refuse('PREVIEW_PACKAGE_REALPATH_REFUSED');dependencyRoots.push(path);}else if(stat.isDirectory()&&!stat.isSymbolicLink())await dependencyDirectories(path);}}
  await dependencyDirectories(sourceRoot);
  const dependencyInventory=[];const packageLinks=[];
  for(const root of dependencyRoots.sort(compare)){const inventory=await buildInventory(root,uid,{dependencies:true,allowedRoot:sourceRoot});dependencyInventory.push({path:relative(sourceRoot,root),files:inventory});for(const item of inventory)if(item.realpath)packageLinks.push({path:relative(sourceRoot,join(root,item.path)),realpath:item.realpath});}
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
  await verifyInventory(manifest.sourceRoot,manifest.uid,manifest.files);
  await verifyPackageLinks(manifest.sourceRoot,manifest.packageLinks);
  const knownFiles=[...manifest.files.map(file=>join(manifest.sourceRoot,file.path)),...manifest.dependencyInventory.flatMap(entry=>entry.files.filter(file=>file.sha256).map(file=>join(manifest.sourceRoot,entry.path,file.path)))];
  if(manifest.packageLinks.some(link=>!knownFiles.some(path=>path===link.realpath||path.startsWith(`${link.realpath}/`))))refuse('PREVIEW_PACKAGE_TARGET_UNBOUND');
  // Each dependency subtree has a closed complete inventory. PNPM links name their exact package/workspace target.
  for(const entry of manifest.dependencyInventory){safeRelative(entry.path);await verifyInventory(join(manifest.sourceRoot,entry.path),manifest.uid,entry.files,{dependencies:true,allowedRoot:manifest.sourceRoot});}
  return true;
}
