import { constants, realpathSync } from 'node:fs';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { OwnerRecoveryCustody, type OwnerFileStat, type OwnerRecoveryFiles } from '../../apps/runner/src/owner-recovery-custody.js';
import type { StaffAlertConfigFiles } from '../../apps/api/src/staff/alerts.js';
/** Test-owned synthetic custody. Real files/modes/symlinks/descriptors/fsync are exercised.
 * UID0 is projected ONLY from this process-owned fixture or the explicitly named source helper;
 * ancestors outside the fixture form its virtual protected root. Never injected by the CLI. */
export function syntheticOwnerFiles(root:string,fault?:(operation:string,path:string)=>void):OwnerRecoveryFiles {
 const helper=realpathSync(resolve('apps/runner/src/owner-recovery-lock.py'));
 const projected=(path:string,stat:OwnerFileStat):OwnerFileStat=>{
  const owned=path===root||path.startsWith(root+'/')||path===helper;
  if(owned&&stat.uid!==process.getuid!())throw new Error('SYNTHETIC_CUSTODY_NOT_OWNED');
  const ancestor=!owned&&stat.isDirectory();
  return {uid:owned||ancestor?0:stat.uid,mode:ancestor?stat.mode&~0o022:stat.mode,size:stat.size,dev:stat.dev,ino:stat.ino,isFile:()=>stat.isFile(),isDirectory:()=>stat.isDirectory(),isSymbolicLink:()=>stat.isSymbolicLink()};
 };
 return {lstat:async path=>projected(path,await lstat(path)),realpath,rename:async(from,to)=>{fault?.('rename',from);await rename(from,to);fault?.('renamed',to);},unlink:async path=>{fault?.('unlink',path);await unlink(path);fault?.('unlinked',path);},
  open:async(path,flags,mode)=>{fault?.('open',path);const file=await open(path,flags,mode);return {fd:file.fd,stat:async()=>projected(path,await file.stat()),read:file.read.bind(file),writeFile:async bytes=>{fault?.('write',path);await file.writeFile(bytes);fault?.('written',path);},sync:async()=>{fault?.('sync',path);await file.sync();fault?.('synced',path);},close:file.close.bind(file)};}
 };
}
/** The system python3 the owner-lock helper runs under, named by its REAL path. The custody check refuses a symlinked
 * interpreter on purpose, and /usr/bin/python3 is a symlink on Ubuntu (-> python3.12, the CI runner) while it is a
 * plain root-owned file on macOS; the real path is the same root-owned file either way. Fails loudly when absent. */
export function systemPython3():string{
 try{return realpathSync('/usr/bin/python3');}
 catch(error){throw new Error(`SYSTEM_PYTHON3_MISSING: the owner-lock tests need the system /usr/bin/python3 (${String(error)})`);}
}
export function syntheticOwnerCustody(root:string,fault?:(operation:string,path:string)=>void):OwnerRecoveryCustody{return new OwnerRecoveryCustody(syntheticOwnerFiles(root,fault));}
export function syntheticAlertFiles(root:string):StaffAlertConfigFiles{
 const files=syntheticOwnerFiles(root);return {lstat:files.lstat,realpath:files.realpath,open:async(path,flags)=>{const file=await files.open(path,flags);return {stat:()=>file.stat(),close:()=>file.close(),readFile:async()=>{const bytes=Buffer.alloc(4097),r=await file.read(bytes,0,bytes.length,0);return bytes.subarray(0,r.bytesRead);}};}};
}
