import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,mkdir,writeFile,readFile,cp,rm,realpath,symlink,lstat,chmod } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const execute=promisify(execFile);
const source=await import('../../deploy/'+'preview-auth-dev/v1/source-manifest.mjs');
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
const operator='dialectical-engine/deploy/preview-auth-dev/v1';
const roots:string[]=[];
const entryNames=['launch-api.mjs','launch-ui.mjs','launch-runner.mjs','native-operator.mjs','run-stage.mjs'];
async function fixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'preview-binding-fix-')));roots.push(root);
 await mkdir(join(root,operator),{recursive:true});await mkdir(join(root,'dialectical-engine/apps/api/src'),{recursive:true});
 await mkdir(join(root,'dialectical-engine/node_modules/.pnpm/example/node_modules/example'),{recursive:true});
 await mkdir(join(root,'dialectical-engine/packages/example'),{recursive:true});
 await writeFile(join(root,'dialectical-engine/package.json'),'{"private":true}');
 await mkdir(join(root,'dialectical-engine/packages/contract/src'),{recursive:true});
 await mkdir(join(root,'dialectical-engine/packages/contract/generated'),{recursive:true});
 await mkdir(join(root,'dialectical-engine/node_modules/tsx/dist'),{recursive:true});
 await writeFile(join(root,'dialectical-engine/node_modules/tsx/dist/loader.mjs'),'export {};');
 await writeFile(join(root,'dialectical-engine/packages/contract/src/generate.ts'),'// synthetic metadata fixture; no producer execution claim');
 await writeFile(join(root,'dialectical-engine/packages/contract/package.json'),'{"type":"module"}');
 await writeFile(join(root,'dialectical-engine/tsconfig.json'),'{}');
 for(const name of ['client.ts','field-inventory.json','openapi.json'])await writeFile(join(root,'dialectical-engine/packages/contract/generated',name),'{}');
 await symlink('../packages/contract/generated/client.ts',join(root,'dialectical-engine/node_modules/generated-client'));

 await writeFile(join(root,'dialectical-engine/apps/api/src/main.cjs'),'module.exports=1;\n');
 await writeFile(join(root,'dialectical-engine/node_modules/.pnpm/example/node_modules/example/index.js'),'module.exports="bound";\n');
 await writeFile(join(root,'dialectical-engine/packages/example/index.js'),'export const value=1;\n');
 await writeFile(join(root,'dialectical-engine/packages/example/package.json'),'{"name":"workspace-example","private":true}');
 await symlink('.pnpm/example/node_modules/example',join(root,'dialectical-engine/node_modules/example'));
 await symlink('../packages/example',join(root,'dialectical-engine/node_modules/workspace-example'));
 for(const name of ['source-manifest.mjs','custody.mjs'])await cp(resolve('deploy/preview-auth-dev/v1',name),join(root,operator,name));
 for(const name of ['verify-native.ts','publish-register.ts'])await writeFile(join(root,operator,name),'export const fixture = true;\n');
 for(const name of entryNames)await writeFile(join(root,operator,name),`import {readFile} from 'node:fs/promises';\nimport {verifySourceManifest} from './source-manifest.mjs';\nconst packet=JSON.parse(await readFile(process.argv[2],'utf8'));\nconst effects=[];\ntry { await verifySourceManifest(packet.manifest,{...packet.expected,execution:{entryUrl:import.meta.url,entryName:${JSON.stringify(name)},operatorManifestSha256:packet.operatorSha256}});effects.push('SQL','listen','event');console.log(JSON.stringify({accepted:true,effects})); } catch { console.log(JSON.stringify({accepted:false,effects})); }\n`);
 return root;
}
async function freeze(root:string,role='api'){
 const uid=process.getuid!(),files=await source.buildInventory(root,uid,{excludedDirectories:['dialectical-engine/packages/contract/generated',...(role==='ui'?['dialectical-engine/apps/ui/.next']:[])]});
 const dependencies=await source.buildInventory(join(root,'dialectical-engine/node_modules'),uid,{dependencies:true,allowedRoot:root});
 const packageLinks=dependencies.filter((f:any)=>f.realpath).map((f:any)=>({path:`dialectical-engine/node_modules/${f.path}`,realpath:f.realpath}));
 const manifest={schema:'preview-auth-dev-source-v3',sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),sourceRoot:root,role,uid,nodeVersion:process.version,pnpmVersion:'11.20.0',files,packageLinks,dependencyInventory:[{path:'dialectical-engine/node_modules',files:dependencies}],generatedContract:null as any,nativeSha256:'c'.repeat(64),contractSha256:'d'.repeat(64),promptStoryProviderSha256:'e'.repeat(64),packageLockSha256:'f'.repeat(64)};
 const dir='dialectical-engine/packages/contract/generated';
 const derived=(await source.buildInventory(join(root,dir),uid,{complete:true})).map((file:any)=>({...file,path:dir+'/'+file.path}));
 const executable=await realpath(process.execPath),stat=await lstat(executable);
 const runtime={nodeVersion:process.version,pnpmVersion:'11.20.0',platform:process.platform,arch:process.arch,nodeExecutable:executable,nodeIdentitySha256:hash(JSON.stringify([stat.dev,stat.ino,stat.uid,stat.gid,stat.mode,stat.nlink,stat.size,stat.mtimeMs,stat.ctimeMs])),tsxLoader:'dialectical-engine/node_modules/tsx/dist/loader.mjs'};
 const inputSha256=hash(JSON.stringify({producer:'dialectical-engine/packages/contract/src/generate.ts',files,dependencies:manifest.dependencyInventory,packageLinks,runtime})),outputSha256=hash(JSON.stringify(derived));
 // These are synthetic binding records only. The real producer is exercised in the clean-archive receipt.
 manifest.generatedContract={schema:'preview-auth-dev-generated-contract-v1',producer:'dialectical-engine/packages/contract/src/generate.ts',files:derived,runtime,inputSha256,outputSha256,reproductions:[outputSha256,outputSha256]};
 manifest.contractSha256=outputSha256;
 return {manifest,expected:{sourceRevision:manifest.sourceRevision,sourceTree:manifest.sourceTree,sourceRoot:root,role,manifestSha256:hash(JSON.stringify(manifest))},operatorSha256:hash(JSON.stringify(files.filter((f:any)=>f.path.startsWith(operator+'/'))))};
}
async function invoke(root:string,packet:unknown,name='launch-api.mjs',entry?:string){
 const input=join(await realpath(await mkdtemp(join(tmpdir(),'preview-binding-input-'))),'packet.json');roots.push(resolve(input,'..'));await writeFile(input,JSON.stringify(packet));
 const result=await execute(process.execPath,[entry??join(root,operator,name),input]);return JSON.parse(result.stdout.trim());
}
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
describe('complete dependency-root and generated-path closure',()=>{
 it('retains valid PNPM and workspace realpaths',async()=>{const root=await fixture(),p=await freeze(root);await expect(source.verifySourceManifest(p.manifest,p.expected)).resolves.toBe(true);});
 it.each(['new-root','known-package-root','nested-root','missing-root','duplicate-root','redirected-root','unlisted-next'] as const)('rejects %s with the original complete manifest',async kind=>{
  const root=await fixture(),p=await freeze(root);await source.verifySourceManifest(p.manifest,p.expected);
  if(kind==='new-root'){const path=join(root,'dialectical-engine/apps/api/src/node_modules/injected');await mkdir(path,{recursive:true});await writeFile(join(path,'index.js'),'unlisted');}
  if(kind==='known-package-root'){const path=join(root,'dialectical-engine/packages/example/node_modules/injected');await mkdir(path,{recursive:true});await writeFile(join(path,'index.js'),'unlisted');}
  if(kind==='nested-root'){const path=join(root,'dialectical-engine/node_modules/example-nested/node_modules/injected');await mkdir(path,{recursive:true});await writeFile(join(path,'index.js'),'unlisted');}
  if(kind==='missing-root')await rm(join(root,'dialectical-engine/node_modules'),{recursive:true});
  if(kind==='duplicate-root'){p.manifest.dependencyInventory.push(p.manifest.dependencyInventory[0]!);p.expected.manifestSha256=hash(JSON.stringify(p.manifest));}
  if(kind==='redirected-root'){await rm(join(root,'dialectical-engine/node_modules'),{recursive:true});await symlink(join(root,'dialectical-engine/packages'),join(root,'dialectical-engine/node_modules'));}
  if(kind==='unlisted-next'){const path=join(root,'dialectical-engine/apps/api/src/.next');await mkdir(path);await writeFile(join(path,'injected.mjs'),'unlisted');}
  await expect(source.verifySourceManifest(p.manifest,p.expected)).rejects.toThrow();
 });
 it('delegates only the exact UI output directory to its complete build inventory',async()=>{
  const root=await fixture(),p=await freeze(root,'ui');const build=join(root,'dialectical-engine/apps/ui/.next');
  await mkdir(join(build,'server'),{recursive:true});await writeFile(join(build,'server/page.js'),'compiled');
  await expect(source.verifySourceManifest(p.manifest,p.expected)).resolves.toBe(true);
  const files=await source.buildInventory(build,process.getuid!(),{complete:true,allowedRoot:root});
  await mkdir(join(build,'node_modules/injected'),{recursive:true});await writeFile(join(build,'node_modules/injected/index.js'),'unlisted');
  await expect(source.verifyInventory(build,process.getuid!(),files,{complete:true,allowedRoot:root})).rejects.toThrow();
 });
 it('keeps complete compiled-output traversal separate from PNPM symlink permission',async()=>{
  const root=await fixture();const build=join(root,'dialectical-engine/apps/ui/.next');await mkdir(build,{recursive:true});
  await symlink(join(root,'dialectical-engine/packages/example/index.js'),join(build,'shared.js'));
  await expect(source.buildInventory(build,process.getuid!(),{complete:true,allowedRoot:root})).rejects.toThrow('PREVIEW_SOURCE_SYMLINK_REFUSED');
 });
 it('refuses a redirected exact UI output directory before delegation',async()=>{
  const root=await fixture(),p=await freeze(root,'ui');await mkdir(join(root,'dialectical-engine/apps/ui'),{recursive:true});await symlink(join(root,'dialectical-engine/packages'),join(root,'dialectical-engine/apps/ui/.next'));
  await expect(source.verifySourceManifest(p.manifest,p.expected)).rejects.toThrow();
 });
 it('refuses the old manifest schema instead of treating old source identity as current',async()=>{
  const root=await fixture(),p=await freeze(root);p.manifest.schema='preview-auth-dev-source-v2';p.expected.manifestSha256=hash(JSON.stringify(p.manifest));
  await expect(source.verifySourceManifest(p.manifest,p.expected)).rejects.toThrow('PREVIEW_SOURCE_BINDING_REFUSED');
 });
 it('does not exempt the UI build path from an API package inventory',async()=>{const root=await fixture(),p=await freeze(root);await mkdir(join(root,'dialectical-engine/apps/ui/.next'),{recursive:true});await writeFile(join(root,'dialectical-engine/apps/ui/.next/injected.mjs'),'unlisted');await expect(source.verifySourceManifest(p.manifest,p.expected)).rejects.toThrow();});
});
describe('executing operator identity before protected effects',()=>{
 it.each(entryNames)('%s accepts its own immutable root',async name=>{const root=await fixture(),p=await freeze(root);expect(await invoke(root,p,name)).toEqual({accepted:true,effects:['SQL','listen','event']});});
 it.each(entryNames)('%s refuses another independently valid planned root before effects',async name=>{const a=await fixture(),b=await fixture(),p=await freeze(b);expect(await invoke(a,p,name)).toEqual({accepted:false,effects:[]});});
 it('refuses a locally resolved verifier from another root even when entrypoint bytes are declared',async()=>{const a=await fixture(),b=await fixture();const path=join(b,operator,'launch-api.mjs');const text=await readFile(path,'utf8');await writeFile(path,text.replace("'./source-manifest.mjs'",JSON.stringify(pathToFileURL(join(a,operator,'source-manifest.mjs')).href)));const p=await freeze(b);expect(await invoke(b,p)).toEqual({accepted:false,effects:[]});});
 it('refuses an entrypoint invoked through a symlink alias',async()=>{const root=await fixture(),p=await freeze(root);const aliases=await realpath(await mkdtemp(join(tmpdir(),'preview-binding-alias-')));roots.push(aliases);const alias=join(aliases,'launch-api.mjs');await symlink(join(root,operator,'launch-api.mjs'),alias);expect(await invoke(root,p,'launch-api.mjs',alias)).toEqual({accepted:false,effects:[]});});
 it('refuses changed shared TypeScript operator bytes',async()=>{const root=await fixture(),p=await freeze(root);await writeFile(join(root,operator,'verify-native.ts'),'export const injected = true;');expect(await invoke(root,p)).toEqual({accepted:false,effects:[]});});
});

describe('executing identity is wired before protected operations',()=>{
 it('binds each service entry URL through the shared prepareLaunch gate',async()=>{
  for(const [file,service]of [['launch-api.mjs','api'],['launch-ui.mjs','ui'],['launch-runner.mjs','runner']]){
   const code=await readFile(resolve('deploy/preview-auth-dev/v1',file!),'utf8');
   expect(code).toContain(`prepareLaunch(argv,'${service}',import.meta.url)`);
  }
  const code=await readFile(resolve('deploy/preview-auth-dev/v1/launch-plan.mjs'),'utf8');
  expect(code).toContain('execution:{entryUrl,entryName:`launch-${service}.mjs`,operatorManifestSha256:plan.operatorManifestSha256}');
 });
 it('binds native and stage entry URLs before any pool or probe can run',async()=>{
  for(const [file,entry,operation]of [['native-operator.mjs','native-operator.mjs','return withActiveNativePool('],['run-stage.mjs','run-stage.mjs','const probe=new pg.Client(']]){
   const code=await readFile(resolve('deploy/preview-auth-dev/v1',file!),'utf8');const binding=code.indexOf(`entryUrl:import.meta.url,entryName:'${entry}'`);
   expect(binding).toBeGreaterThan(0);expect(binding).toBeLessThan(code.indexOf(operation!));
   if(file==='run-stage.mjs')expect(code).toContain("['preview-auth-dev-stage-operation-v2','preview-auth-dev-stage-operation-v3'].includes(operation.schema)");
  }
 });
 it('binds stage execution before its private creator read and both connections',async()=>{
  const code=await readFile(resolve('deploy/preview-auth-dev/v1/run-stage.mjs'),'utf8'),binding=code.indexOf("entryUrl:import.meta.url,entryName:'run-stage.mjs'");
  const credentialRead=code.indexOf("withPrivateBytes(join(root,'admin-connection.json')"),probe=code.indexOf('const probe=new pg.Client('),creator=code.indexOf('creator=new pg.Client(');
  expect(credentialRead).toBeGreaterThan(binding);expect(probe).toBeGreaterThan(credentialRead);expect(creator).toBeGreaterThan(credentialRead);
 });
});

describe('stage-only direct creator envelope',()=>{
 const envelope=()=>({schema:'preview-auth-dev-synthetic-stage-connection-v1',url:`postgresql://debateai_prod_migrator:${'a'.repeat(64)}@localhost/debateai_preview_auth_dev_stage?host=/run/debateai-preview-auth-dev-stage/postgresql&port=55434`});
 it('accepts only the established bounded creator envelope',async()=>{
  const stage=await import('../../deploy/'+'preview-auth-dev/v1/run-stage.mjs');
  expect(stage.parseStageCreatorConnection(envelope())).toBe(envelope().url);
 });
 it.each(['schema','extra','principal','database','socket','port','hostname','tcp-port','options','duplicate','fragment','password','protocol'])('refuses %s redirection before connecting',async kind=>{
  const stage=await import('../../deploy/'+'preview-auth-dev/v1/run-stage.mjs'),value:any=envelope(),url=new URL(value.url);
  if(kind==='schema')value.schema='another-schema';if(kind==='extra')value.other=true;
  if(kind==='principal')url.username='postgres';if(kind==='database')url.pathname='/debateai';if(kind==='socket')url.searchParams.set('host','/run/debateai-v3-preview/postgresql');if(kind==='port')url.searchParams.set('port','5434');if(kind==='hostname')url.hostname='127.0.0.1';if(kind==='tcp-port')url.port='55434';if(kind==='options')url.searchParams.set('options','-c role=postgres');if(kind==='duplicate')url.searchParams.append('host','/run/other');if(kind==='fragment')url.hash='other';if(kind==='password')url.password='short';if(kind==='protocol')url.protocol='http:';
  value.url=kind==='protocol'?url.toString().replace('postgresql:','http:'):url.toString();expect(()=>stage.parseStageCreatorConnection(value)).toThrow('PREVIEW_STAGE_CREATOR_REFUSED');
 });
});

describe('exact separately generated contract binding',()=>{
 it.each(['missing','extra','hash','mode','symlink','producer','proof'] as const)('refuses %s derived contract drift',async kind=>{
  const root=await fixture(),p=await freeze(root),dir=join(root,'dialectical-engine/packages/contract/generated'),file=join(dir,'client.ts');
  await source.verifySourceManifest(p.manifest,p.expected);
  if(kind==='missing')await rm(file);if(kind==='extra')await writeFile(join(dir,'unknown.ts'),'extra');if(kind==='hash')await writeFile(file,'changed');if(kind==='mode')await chmod(file,0o600);
  if(kind==='symlink'){await rm(file);await symlink(join(root,'dialectical-engine/packages/example/index.js'),file);}
  if(kind==='producer')await writeFile(join(root,'dialectical-engine/packages/contract/src/generate.ts'),'changed producer');
  if(kind==='proof'){p.manifest.generatedContract.reproductions[1]='0'.repeat(64);p.expected.manifestSha256=hash(JSON.stringify(p.manifest));}
  await expect(source.verifySourceManifest(p.manifest,p.expected)).rejects.toThrow();
 });
});

describe('producer loader closure before execution',()=>{
 it('refuses an excluded UI loader target without running its sentinel',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'preview-loader-closure-')));roots.push(root);
  const reference=join(root,'reference'),packaged=join(root,'package'),marker=join(root,'producer-executed');
  await mkdir(join(reference,'dialectical-engine/packages/contract/src'),{recursive:true});
  for(const [path,value]of Object.entries({'dialectical-engine/package.json':'{"type":"module"}','dialectical-engine/tsconfig.json':'{}','dialectical-engine/packages/contract/package.json':'{"type":"module"}','dialectical-engine/packages/contract/src/generate.ts':'// A loader must never execute for this refused fixture.'}))await writeFile(join(reference,path),value);
  for(const args of [['init','-q'],['add','.'],['-c','user.name=Stage fixture','-c','user.email=fixture@example.test','commit','-qm','synthetic loader closure fixture']])await execute('git',['-C',reference,...args]);
  await cp(reference,packaged,{recursive:true});await rm(join(packaged,'.git'),{recursive:true});
  const generated=join(packaged,'dialectical-engine/packages/contract/generated');await mkdir(generated);for(const name of ['client.ts','field-inventory.json','openapi.json'])await writeFile(join(generated,name),'{}');
  const loader=join(packaged,'dialectical-engine/apps/ui/.next/unlisted-loader.mjs');await mkdir(join(packaged,'dialectical-engine/apps/ui/.next'),{recursive:true});await writeFile(loader,`import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'executed');`);
  await mkdir(join(packaged,'dialectical-engine/node_modules/tsx/dist'),{recursive:true});await symlink(loader,join(packaged,'dialectical-engine/node_modules/tsx/dist/loader.mjs'));
  await expect(source.generateSourceManifest({repositoryRoot:reference,sourceRoot:packaged,role:'ui',uid:process.getuid!()})).rejects.toThrow();
  await expect(lstat(marker)).rejects.toMatchObject({code:'ENOENT'});
 });
});
