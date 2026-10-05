import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync, constants, realpathSync } from 'node:fs';
import { chmod, lstat, mkdtemp, realpath, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { OwnerRecoveryCustody, OwnerRecoveryError, PosixOwnerRecoveryLock, ownerDigest } from '../../apps/runner/src/owner-recovery-custody.js';
import { createOwnerRecoveryMaterial, ownerRecoveryVerifier } from '../../apps/runner/src/owner-recovery-material.js';
import { syntheticOwnerCustody } from '../support/ownerRecoveryCustody.js';
import { describe, expect, it } from 'vitest';

const tsx=resolve('node_modules/tsx/dist/cli.mjs');
describe('Owner CLI refuses authority without explicit independent operator inputs',()=>{
 for(const name of ['owner-bootstrap-cli','owner-recovery-cli']){
  it(`${name} fails closed and emits only its bounded refusal without inputs`,()=>{
   const child=spawnSync(process.execPath,[tsx,resolve(`apps/runner/src/${name}.ts`)],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME!}});
   expect(child.status).toBe(1);expect(child.stdout).toBe('');expect(child.stderr.trim()).toBe('OWNER_OPERATOR_INPUTS_REQUIRED');
  });
  it(`${name} refuses proof in argv or environment and never prints it`,()=>{
   const secret='synthetic-offline-proof-must-not-be-logged';
   for(const [args,extra] of [[['--proof',secret],{}],[[],{OWNER_RECOVERY_PROOF:secret}]] as const){
    const child=spawnSync(process.execPath,[tsx,resolve(`apps/runner/src/${name}.ts`),...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME!,...extra}});
    expect(child.status).toBe(1);expect(child.stdout).toBe('');expect(child.stderr.trim()).toBe('OWNER_SECRET_INPUT_REFUSED');expect(child.stdout+child.stderr).not.toContain(secret);
   }
  });
 }
});

describe('POSIX inherited descriptor lock on actual Mac process boundaries',()=>{
 const helper=realpathSync(resolve('apps/runner/src/owner-recovery-lock.py')),python='/usr/bin/python3';
 it('retains the exclusive lock on the Node descriptor after helper exit and refuses an independent contender',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'task6-flock-'))),path=join(root,'lock');let first=-1,second=-1;
  try {
   first=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_RDWR,0o600);
   expect(spawnSync(python,[helper,'3'],{stdio:['ignore','pipe','ignore',first]}).status).toBe(0);
   second=openSync(path,constants.O_RDWR|constants.O_NOFOLLOW);
   expect(spawnSync(python,[helper,'3'],{stdio:['ignore','pipe','ignore',second]}).status).toBe(73);
   closeSync(first);first=-1;
   expect(spawnSync(python,[helper,'3'],{stdio:['ignore','pipe','ignore',second]}).status).toBe(0);
  }finally{if(first>=0)closeSync(first);if(second>=0)closeSync(second);await rm(root,{recursive:true,force:true});}
 });
 it('releases kernel lock ownership after Node SIGKILL without unlinking the retained lock inode',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'task6-kill-lock-'))),path=join(root,'lock');
  const script=`const fs=require('node:fs'),cp=require('node:child_process');const fd=fs.openSync(process.argv[1],fs.constants.O_CREAT|fs.constants.O_RDWR,0o600);const result=cp.spawnSync(process.argv[2],[process.argv[3],'3'],{stdio:['ignore','pipe','ignore',fd]});if(result.status!==0)process.exit(1);process.stdout.write('LOCKED\\n');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['-e',script,path,python,helper],{stdio:['ignore','pipe','ignore'],env:{PATH:'/usr/bin:/bin'}});
  try{
   const locked=await new Promise<string>((resolve,reject)=>{child.stdout.once('data',b=>resolve(String(b).trim()));child.once('exit',()=>reject(new Error('LOCK_HELPER_FAILED')));});expect(locked).toBe('LOCKED');
   const before=openSync(path,constants.O_RDWR|constants.O_NOFOLLOW);expect(spawnSync(python,[helper,'3'],{stdio:['ignore','pipe','ignore',before]}).status).toBe(73);closeSync(before);
   const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));child.kill('SIGKILL');await closed;
   const after=openSync(path,constants.O_RDWR|constants.O_NOFOLLOW);try{expect(spawnSync(python,[helper,'3'],{stdio:['ignore','pipe','ignore',after]}).status).toBe(0);}finally{closeSync(after);}
  }finally{child.kill('SIGKILL');await rm(root,{recursive:true,force:true});}
 });
});

describe('root-private offline generation material',()=>{
 it('writes only bounded private material and verifier files and returns a secret-free material receipt identifier',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'task6-material-'))),custody=syntheticOwnerCustody(root),lock=new PosixOwnerRecoveryLock(custody,{pythonPath:'/usr/bin/python3',helperPath:realpathSync(resolve('apps/runner/src/owner-recovery-lock.py'))});
  try{const output={materialFile:join(root,'material'),verifierFile:join(root,'verifier'),lockFile:join(root,'lock'),custody,lock},result=await createOwnerRecoveryMaterial(output),material=JSON.parse(await readFile(output.materialFile,'utf8')),verifier=JSON.parse(await readFile(output.verifierFile,'utf8'));
   expect((await lstat(output.materialFile)).mode&0o777).toBe(0o600);expect((await lstat(output.verifierFile)).mode&0o777).toBe(0o600);expect(Buffer.from(material.proof,'base64url')).toHaveLength(32);expect(material.binding).toBeNull();expect(result).toEqual({receiptId:material.receiptId,verifier:verifier.verifier});
   expect(verifier.verifier).toBe(`sha256:${createHash('sha256').update(Buffer.concat([Buffer.from('debateai:owner-recovery-proof:v1\0'+material.generation+'\0'),Buffer.from(material.proof,'base64url')])).digest('hex')}`);
   expect(await createOwnerRecoveryMaterial(output)).toEqual(result);
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it('refuses symlink/insecure files, writable ancestors, path collision, and actual non-root production custody',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'task6-custody-'))),custody=syntheticOwnerCustody(root),path=join(root,'private');
  try{await writeFile(path,'synthetic',{mode:0o600});await symlink(path,join(root,'link'));await expect(custody.read(join(root,'link'))).rejects.toThrow('OWNER_ROOT_CUSTODY_REQUIRED');await chmod(path,0o644);await expect(custody.read(path)).rejects.toThrow('OWNER_ROOT_CUSTODY_REQUIRED');await chmod(path,0o600);await chmod(root,0o777);await expect(custody.read(path)).rejects.toThrow('OWNER_ROOT_CUSTODY_REQUIRED');await chmod(root,0o700);await expect(new OwnerRecoveryCustody().read(path)).rejects.toThrow('OWNER_ROOT_CUSTODY_REQUIRED');
   const lock=new PosixOwnerRecoveryLock(custody,{pythonPath:'/usr/bin/python3',helperPath:realpathSync(resolve('apps/runner/src/owner-recovery-lock.py'))});await expect(createOwnerRecoveryMaterial({materialFile:path,verifierFile:path,lockFile:join(root,'lock'),custody,lock})).rejects.toThrow('OWNER_PRIVATE_PATH_INVALID');
  }finally{await chmod(root,0o700);await rm(root,{recursive:true,force:true});}
 });
 it('pins helper code, retains lock inode, and refuses a concurrent real adapter invocation',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'task6-adapter-'))),custody=syntheticOwnerCustody(root),path=join(root,'lock'),lock=new PosixOwnerRecoveryLock(custody,{pythonPath:'/usr/bin/python3',helperPath:realpathSync(resolve('apps/runner/src/owner-recovery-lock.py'))});
  try{let release:()=>void=()=>{},entered:()=>void=()=>{};const wait=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);const holder=lock.withLock(path,async()=>{entered();await wait;});await started;const before=(await lstat(path)).ino;await expect(lock.withLock(path,async()=>undefined)).rejects.toThrow('OWNER_RECOVERY_LOCK_BUSY');release();await holder;await lock.withLock(path,async()=>undefined);expect((await lstat(path)).ino).toBe(before);
   const fake=join(root,'helper.py');await writeFile(fake,'synthetic-unreviewed-helper',{mode:0o600});await expect(new PosixOwnerRecoveryLock(custody,{pythonPath:'/usr/bin/python3',helperPath:fake}).withLock(path,async()=>undefined)).rejects.toThrow('OWNER_LOCK_ADAPTER_UNAVAILABLE');
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it('bounds lock-helper process lifetime and kills the owned fixture process before returning refusal',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'task6-helper-timeout-'))),custody=syntheticOwnerCustody(root),executable=join(root,'python'),pidFile=join(root,'pid');
  try{await writeFile(executable,`#!/bin/sh\necho $$ > '${pidFile}'\nexec /bin/sleep 10\n`,{mode:0o700});const lock=new PosixOwnerRecoveryLock(custody,{pythonPath:executable,helperPath:realpathSync(resolve('apps/runner/src/owner-recovery-lock.py'))});await expect(lock.withLock(join(root,'lock'),async()=>undefined)).rejects.toThrow('OWNER_LOCK_ADAPTER_UNAVAILABLE');const pid=Number((await readFile(pidFile,'utf8')).trim());expect(Number.isInteger(pid)).toBe(true);expect(()=>process.kill(pid,0)).toThrow();
  }finally{await rm(root,{recursive:true,force:true});}
 });

});

it('checks the complete register-loader environment snapshot for a PostgreSQL secret under an unexpected name',()=>{
 const secret='postgresql://synthetic-user:synthetic-do-not-print@127.0.0.1/fixture';
 for(const name of ['owner-bootstrap-cli','owner-recovery-cli']){
  const child=spawnSync(process.execPath,[tsx,resolve(`apps/runner/src/${name}.ts`)],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME!,UNEXPECTED_DEBUG_SETTING:secret}});
  expect(child.status).toBe(1);expect(child.stdout).toBe('');expect(child.stderr.trim()).toBe('OWNER_SECRET_INPUT_REFUSED');expect(child.stdout+child.stderr).not.toContain(secret);
 }
});
