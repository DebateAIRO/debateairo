import { describe, expect, it } from 'vitest';
import { parseStaffAccessEnvironment } from '@debateai/register';
const base={STAFF_ACCESS_POLICY_VERSION:'2',PUBLIC_APP_URL:'https://admin.example.test',STAFF_WEBAUTHN_ORIGIN:'https://admin.example.test',STAFF_WEBAUTHN_RP_ID:'admin.example.test',STAFF_INDEPENDENT_ALERT_CONFIG_PATH:'/protected/alerts.json'};
describe('explicit protected operator activation inputs',()=>{
 it('refuses v2 without a protected operator module and exact reviewed byte hash',()=>{
  expect(()=>parseStaffAccessEnvironment(base)).toThrow('STAFF_ACCESS_CONFIGURATION_REQUIRED');
  expect(()=>parseStaffAccessEnvironment({...base,STAFF_ALERT_OPERATOR_MODULE_PATH:'/protected/adapters.mjs'})).toThrow('STAFF_ACCESS_CONFIGURATION_REQUIRED');
 });
 it('refuses relative, padded, control-byte module paths and malformed hashes',()=>{
  for(const path of ['relative.mjs',' /protected/adapters.mjs','/protected/../adapters.mjs','/protected/\nmodule.mjs'])expect(()=>parseStaffAccessEnvironment({...base,STAFF_ALERT_OPERATOR_MODULE_PATH:path,STAFF_ALERT_OPERATOR_MODULE_SHA256:'a'.repeat(64)})).toThrow();
  for(const hash of ['a'.repeat(63),'A'.repeat(64),' '+ 'a'.repeat(64)])expect(()=>parseStaffAccessEnvironment({...base,STAFF_ALERT_OPERATOR_MODULE_PATH:'/protected/adapters.mjs',STAFF_ALERT_OPERATOR_MODULE_SHA256:hash})).toThrow();
 });
 it('keeps v1 inert and projects explicit module identity only for selected v2',()=>{
  expect(parseStaffAccessEnvironment({})).toEqual({policyVersion:1});
  expect(parseStaffAccessEnvironment({...base,STAFF_ALERT_OPERATOR_MODULE_PATH:'/protected/adapters.mjs',STAFF_ALERT_OPERATOR_MODULE_SHA256:'a'.repeat(64)})).toMatchObject({operatorModulePath:'/protected/adapters.mjs',operatorModuleSha256:'a'.repeat(64)});
 });
});

import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { loadStaffAlertOperator } from '../../apps/api/src/staff/runtime.js';
import { syntheticAlertFiles } from '../support/ownerRecoveryCustody.js';
const validModule=`export function createStaffAlertOperatorAdapters(){return {schema:'staff-alert-operator-v1',acknowledgements:new Map([['capture',{evidence:async()=>null,acknowledge:async()=>null}]]),invitationDelivery:{send:async()=> 'ACK'},dispatch:{batchSize:1,intervalMs:100}};}`;
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
describe('trusted exact-byte operator loader',()=>{
 it('loads only the reviewed file bytes, validates exact ABI, and refuses production non-root custody',async()=>{
  const root=await mkdtemp(join(tmpdir(),'task9-module-')),path=join(root,'adapter.mjs');
  try{
   await writeFile(path,validModule,{mode:0o600});const input={path,sha256:sha(validModule),files:syntheticAlertFiles(root)};
   expect((await loadStaffAlertOperator(input)).dispatch).toEqual({batchSize:1,intervalMs:100});
   await expect(loadStaffAlertOperator({...input,sha256:'0'.repeat(64)})).rejects.toThrow('STAFF_ACTIVATION_UNAVAILABLE');
   await expect(loadStaffAlertOperator({path,sha256:input.sha256})).rejects.toThrow('STAFF_ACTIVATION_UNAVAILABLE');
   await symlink(path,join(root,'link.mjs'));await expect(loadStaffAlertOperator({...input,path:join(root,'link.mjs')})).rejects.toThrow('STAFF_ACTIVATION_UNAVAILABLE');
   await chmod(path,0o666);await expect(loadStaffAlertOperator(input)).rejects.toThrow('STAFF_ACTIVATION_UNAVAILABLE');
  }finally{await rm(root,{recursive:true,force:true});}
 });
 it('refuses changed exports, unknown ABI fields, empty ACK registry and unbounded dispatch',async()=>{
  const root=await mkdtemp(join(tmpdir(),'task9-abi-')),path=join(root,'adapter.mjs');
  try{for(const source of [validModule+'\nexport const unknown=true;',validModule.replace("schema:'staff-alert-operator-v1'","unknown:true,schema:'staff-alert-operator-v1'"),validModule.replace("new Map([['capture',{evidence:async()=>null,acknowledge:async()=>null}]])",'new Map()'),validModule.replace('batchSize:1','batchSize:101'),validModule.replace('intervalMs:100','intervalMs:0')]){
   await writeFile(path,source,{mode:0o600});await expect(loadStaffAlertOperator({path,sha256:sha(source),files:syntheticAlertFiles(root)})).rejects.toThrow('STAFF_ACTIVATION_UNAVAILABLE');
  }}finally{await rm(root,{recursive:true,force:true});}
 });
});
