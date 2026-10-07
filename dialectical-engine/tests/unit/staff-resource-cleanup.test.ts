import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { configureContentEncryption, prepareLeasedContentEncryptionForRun, queryPrivateStream, type Pool } from '@debateai/db';
import type { PoolClient } from 'pg';
import { ContentCipher, type RunContentKeyStore } from '@debateai/crypto';
function deferred<T>(){let resolve:(value:T)=>void=()=>{};return {promise:new Promise<T>(r=>resolve=r),resolve:(value:T)=>resolve(value)};}
const tick=()=>new Promise<void>(r=>setTimeout(r,0));
it('releases a late acquired stream client without executing any query after cancellation',async()=>{
 const acquired=deferred<PoolClient>(),controller=new AbortController(),releases:unknown[]=[],queries:string[]=[];
 const client={query:async(sql:string)=>{queries.push(sql);return {rows:[]};},release:(destroy:unknown)=>releases.push(destroy)} as unknown as PoolClient;
 const reading=queryPrivateStream({connect:()=>acquired.promise} as Pool,'SELECT private_fixture',[],controller.signal);
 await tick();controller.abort();await expect(reading).rejects.toThrow('PRIVATE_STREAM_CLOSED');acquired.resolve(client);await tick();expect(queries).toEqual([]);expect(releases).toEqual([true]);
});
it('closes and zeroes an actual native prepared key that resolves after the content lease is cancelled',async()=>{
 const loaded=deferred<Awaited<ReturnType<RunContentKeyStore['load']>>>(),entered=deferred<void>(),controller=new AbortController(),key=randomBytes(32),runId=randomUUID(),ownerRef=randomUUID(),releases:unknown[]=[];
 const client={query:async(sql:string)=>({rows:sql.includes('pg_try_advisory')?[{acquired:true}]:sql.includes('run_private_content_is_live')?[{run_id:runId,live:true}]:sql.includes('content_encryption_version')?[{enabled:true}]:[{unlocked:true}]}),release:(value:unknown)=>releases.push(value)} as unknown as PoolClient;
 const pool={connect:async()=>client} as unknown as Pool;
 configureContentEncryption(pool,new ContentCipher({load:async()=>{entered.resolve();return loaded.promise;}} as unknown as RunContentKeyStore));
 const preparing=prepareLeasedContentEncryptionForRun(pool,runId,controller.signal);await entered.promise;controller.abort();await expect(preparing).rejects.toThrow('PRIVATE_STREAM_CLOSED');
 loaded.resolve({key,ownerRef,runId});await tick();expect(key.equals(Buffer.alloc(32))).toBe(true);expect(releases).toEqual([true]);
});

import pg from 'pg';
import { vi } from 'vitest';
import { cancelAndDestroyPrivateClient } from '../../packages/db/src/private-stream.js';
it('bounds saturated cancelled connections even when native connect and close both stall',async()=>{
 let live=0,peak=0,destroyed=0;const releases:number[]=[];
 class StalledClient {
  connection={stream:{destroy:()=>{destroyed++;live--;}}};
  constructor(){live++;peak=Math.max(peak,live);}
  on(){return this;}
  connect(){return new Promise<void>(()=>{});}
  query(){return new Promise<void>(()=>{});}
  end(){return new Promise<void>(()=>{});}
 }
 const factory=vi.spyOn(pg,'Client').mockImplementation(StalledClient as never),pool={options:{ssl:{rejectUnauthorized:true},host:'fixture.invalid'}} as unknown as Pool;
 const started=Date.now();
 try{
  const operations=Array.from({length:8},(_,index)=>cancelAndDestroyPrivateClient(pool,{processID:index+1,release:()=>{releases.push(index);}} as unknown as PoolClient));
  await Promise.allSettled(operations);expect(Date.now()-started).toBeLessThan(1600);expect(peak).toBeLessThanOrEqual(4);expect(destroyed).toBe(4);expect(releases.sort()).toEqual([0,1,2,3,4,5,6,7]);expect(live).toBe(0);
 }finally{factory.mockRestore();}
},5000);
