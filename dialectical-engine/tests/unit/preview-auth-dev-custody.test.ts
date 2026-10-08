import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod, rm, symlink, link, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const custody = await import('../../deploy/' + 'preview-auth-dev/v1/custody.mjs');
const roots:string[]=[];
async function fixture(){const root=await realpath(await mkdtemp(join(tmpdir(),'preview-custody-')));roots.push(root);await chmod(root,0o700);const path=join(root,'input');await writeFile(path,'{"key":"synthetic"}',{mode:0o600});return{root,path,policy:{root,uid:process.getuid!(),gid:process.getgid!(),mode:0o600,parentMode:0o700,maxBytes:64}};}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
describe('bounded preview custody',()=>{
 it('reads only the exact owned single-link file and zeroes the input after callback success',async()=>{const f=await fixture();let retained:Buffer|undefined;const value=await custody.withPrivateBytes(f.path,f.policy,(bytes:Buffer)=>{retained=bytes;return custody.strictJson(bytes).key;});expect(value).toBe('synthetic');expect(retained?.every(n=>n===0)).toBe(true);});
 it('zeroes raw bytes and hides parse material on callback refusal',async()=>{const f=await fixture();let retained:Buffer|undefined;await expect(custody.withPrivateBytes(f.path,f.policy,(bytes:Buffer)=>{retained=bytes;throw Error('private-value');})).rejects.toThrow(/^PREVIEW_CUSTODY_REFUSED$/);expect(retained?.every(n=>n===0)).toBe(true);});
 it.each(['mode','link','symlink','overflow','parent','owner'] as const)('rejects %s before returning material',async kind=>{const f=await fixture();if(kind==='mode')await chmod(f.path,0o640);if(kind==='parent')await chmod(f.root,0o770);if(kind==='link')await link(f.path,join(f.root,'copy'));if(kind==='symlink'){await rm(f.path);await symlink('/etc/hosts',f.path);}if(kind==='overflow')await writeFile(f.path,'a'.repeat(65));if(kind==='owner')f.policy.uid++;await expect(custody.withPrivateBytes(f.path,f.policy,()=>true)).rejects.toThrow(/^PREVIEW_CUSTODY_REFUSED$/);});
 it.each(['{"key":"a","key":"b"}','{"a":{"b":1,"b":2}}','{"__proto__":1}','{"a":1} trailing','{"a":NaN}'])('rejects ambiguous JSON without content in the error',text=>{expect(()=>custody.strictJson(Buffer.from(text))).toThrow(/^PREVIEW_JSON_REFUSED$/);});
 it('accepts ordinary nested JSON with escaped quotes and distinct fields',()=>expect(custody.strictJson(Buffer.from('{"a":"x\\\"y","nested":[true,null,1]}'))).toEqual({a:'x"y',nested:[true,null,1]}));
});
