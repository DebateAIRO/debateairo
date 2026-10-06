import { afterEach,describe,expect,it,vi } from 'vitest';
import { mkdtemp,realpath,open,rm,chmod,readFile,symlink } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const probe=vi.hoisted(()=>({chunks:[] as number[],whole:0,short:false,afterRead:null as null|(()=>Promise<void>),last:null as Buffer|null}));
vi.mock('node:fs/promises',async original=>{
 const fs=await original<typeof import('node:fs/promises')>();
 return {...fs,open:async(...args:Parameters<typeof fs.open>)=>{
  const h=await fs.open(...args);
  if(String(args[0]).endsWith('large.node')){
   const read=h.read.bind(h),all=h.readFile.bind(h);
   (h as any).read=async(...a:any[])=>{
    probe.chunks.push(a[2]);probe.last=a[0];
    if(probe.short&&probe.chunks.length>1)return{bytesRead:0,buffer:a[0]};
    const r=await (read as any)(...a),hook=probe.afterRead;probe.afterRead=null;if(hook)await hook();return r;
   };
   h.readFile=((...a:any[])=>{probe.whole++;return(all as any)(...a);}) as any;
  }
  return h;
 }};
});
const source=await import('../../deploy/'+'preview-auth-dev/v1/source-manifest.mjs');
const custody=await import('../../deploy/'+'preview-auth-dev/v1/custody.mjs');
const launch=await import('../../deploy/'+'preview-auth-dev/v1/launch-plan.mjs');
const roots:string[]=[];
async function sparse(size:number){const root=await realpath(await mkdtemp(join(tmpdir(),'preview-linux-package-')));roots.push(root);const path=join(root,'large.node'),h=await open(path,'wx',0o644);await h.truncate(size);await h.close();return{root,path};}
afterEach(async()=>{probe.chunks=[];probe.whole=0;probe.short=false;probe.afterRead=null;probe.last=null;for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
describe('measured Linux dependency size with finite streaming custody',()=>{
 it.each([143144904,268435456])('streams exactly %i dependency bytes in bounded chunks',async size=>{const f=await sparse(size);const files=await source.buildInventory(f.root,process.getuid!(),{dependencies:true});expect(files).toHaveLength(1);const h=createHash('sha256'),zero=Buffer.alloc(65536);for(let n=0;n<size;n+=zero.length)h.update(zero.subarray(0,Math.min(zero.length,size-n)));expect(files[0].sha256).toBe(h.digest('hex'));expect(probe.whole).toBe(0);expect(probe.chunks.length).toBeGreaterThan(2);expect(Math.max(...probe.chunks)).toBeLessThanOrEqual(65536);expect(probe.last?.every(v=>v===0)).toBe(true);});
 it('refuses dependency bytes above256MiB before reading',async()=>{const f=await sparse(268435457);await expect(source.buildInventory(f.root,process.getuid!(),{dependencies:true})).rejects.toThrow();expect(probe.chunks).toEqual([]);expect(probe.whole).toBe(0);});
 it('preserves the64MiB tracked-source bound',async()=>{const f=await sparse(67108865);await expect(source.buildInventory(f.root,process.getuid!())).rejects.toThrow();expect(probe.chunks).toEqual([]);expect(probe.whole).toBe(0);});
 it('refuses a dependency identity/mode race after a streamed read',async()=>{const f=await sparse(143144904);probe.afterRead=()=>chmod(f.path,0o600);await expect(source.buildInventory(f.root,process.getuid!(),{dependencies:true})).rejects.toThrow();expect(probe.last?.every(v=>v===0)).toBe(true);});
 it('refuses an early EOF even with unchanged metadata',async()=>{const f=await sparse(143144904);probe.short=true;await expect(source.buildInventory(f.root,process.getuid!(),{dependencies:true})).rejects.toThrow();expect(probe.last?.every(v=>v===0)).toBe(true);});
 it('keeps dependency mode and external-link refusal',async()=>{const f=await sparse(1);await chmod(f.path,0o666);await expect(source.buildInventory(f.root,process.getuid!(),{dependencies:true})).rejects.toThrow();await rm(f.path);await symlink('/etc/hosts',f.path);await expect(source.buildInventory(f.root,process.getuid!(),{dependencies:true})).rejects.toThrow();});
});
describe('explicit public inventory parser allowance',()=>{
 const measured=Buffer.from(JSON.stringify(Array.from({length:39321},(_,i)=>({path:`file-${i}`,sha256:'a'.repeat(64),mode:420}))));
 it('accepts the measured157285node lower-bound shape only with explicit public opt-in',()=>{expect(measured.length).toBeLessThan(16777216);expect(custody.strictJson(measured,32,{publicInventory:true})).toHaveLength(39321);expect(()=>custody.strictJson(measured)).toThrow('PREVIEW_JSON_REFUSED');});
 it.each([['source','preview-auth-dev-source-v3'],['ui-build','preview-auth-dev-ui-build-v1']])('requires explicit matching %s kind at the public artifact consumer',(kind,schema)=>{
  const raw=Buffer.from(JSON.stringify({schema,files:JSON.parse(measured.toString())}));expect(launch.parsePublicArtifactBytes(raw,kind).files).toHaveLength(39321);expect(()=>launch.parsePublicArtifactBytes(raw)).toThrow();expect(()=>launch.parsePublicArtifactBytes(raw,kind==='source'?'ui-build':'source')).toThrow('PREVIEW_PUBLIC_ARTIFACT_KIND_REFUSED');
 });
 it('does not let a native or private schema borrow the public allowance',()=>{for(const kind of ['source','ui-build','native'])expect(()=>launch.parsePublicArtifactBytes(Buffer.from('{"schema":"preview-auth-dev-native-v1"}'),kind)).toThrow('PREVIEW_PUBLIC_ARTIFACT_KIND_REFUSED');});
 it('enforces exactly250000public nodes and100000private nodes',()=>{const array=(n:number)=>Buffer.from('['+Array(n).fill('0').join(',')+']');expect(custody.strictJson(array(249999),32,{publicInventory:true})).toHaveLength(249999);expect(()=>custody.strictJson(array(250000),32,{publicInventory:true})).toThrow();expect(custody.strictJson(array(99999))).toHaveLength(99999);expect(()=>custody.strictJson(array(100000))).toThrow();});
 it('retains16MiB byte, depth and duplicate-key limits for public inventories',()=>{expect(()=>custody.strictJson(Buffer.from('"'+'a'.repeat(16777216)+'"'),32,{publicInventory:true})).toThrow();expect(()=>custody.strictJson(Buffer.from('['.repeat(34)+'0'+']'.repeat(34)),32,{publicInventory:true})).toThrow();expect(()=>custody.strictJson(Buffer.from('{"a":1,"a":2}'),32,{publicInventory:true})).toThrow();});
 it('refuses an invented limit or untyped opt-in',()=>{expect(()=>custody.strictJson(Buffer.from('{}'),32,{maxNodes:999999})).toThrow();expect(()=>custody.strictJson(Buffer.from('{}'),32,{publicInventory:'yes'})).toThrow();});
});
describe('exact Linux relay group binding',()=>{
 it('uses only the approved shorter API-client group',async()=>{const text=await readFile(resolve('deploy/preview-auth-dev/v1/debateai-preview-turnstile.service'),'utf8');expect(text).toContain('Group=debateai-preview-ts-clients');expect(text).not.toContain('debateai-preview-turnstile-clients');expect('debateai-preview-ts-clients'.length).toBeLessThanOrEqual(32);});
});
