import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
// The real HTTPS request boundary is replaced; routing, fields, parsing and bounds stay real.
import { fixedSocialOperation } from '../../deploy/social/social-relay.mjs';
const config = { google: { clientId: 'google-client', clientSecret: 'private-test-only', callback: 'https://app.example.test/v1/auth/social/google/callback' }, apple: { clientId: 'apple-client', clientSecret: 'apple-test-only', callback: 'https://app.example.test/v1/auth/social/apple/callback' }, x: { clientId: 'x-client', clientSecret: 'x-test-only', callback: 'https://app.example.test/v1/auth/social/x/callback' }, facebook: { clientId: 'fb-client', clientSecret: 'fb-test-only', callback: 'https://app.example.test/v1/auth/social/facebook/callback' } };
function transport(results: {
    status?: number;
    body: unknown;
}[]) {
    const calls: {
        url: string;
        options: Record<string, unknown>;
        body: string;
    }[] = [];
    const request = (url: string, options: Record<string, unknown>, receive: (r: EventEmitter & {
        statusCode: number;
        destroy(): void;
    }) => void) => {
        const req = Object.assign(new EventEmitter(), { destroy() { }, end(body = '') { calls.push({ url: String(url), options, body }); queueMicrotask(() => { const result = results.shift()!; const res = Object.assign(new EventEmitter(), { statusCode: result.status ?? 200, destroy() { } }); receive(res); res.emit('data', Buffer.from(typeof result.body === 'string' ? result.body : JSON.stringify(result.body))); res.emit('end'); }); } });
        return req;
    };
    return { calls, request };
}
describe('finite social egress worker', () => {
    it('sends only fixed Google code/PKCE exchange and returns only ID token', async () => {
        const io = transport([{ body: { id_token: 'signed', access_token: 'do-not-return', refresh_token: 'discard' } }]);
        expect(await fixedSocialOperation(config, { operation: 'google.exchange', code: 'provider-code', verifier: 'v'.repeat(43) }, new AbortController().signal, io.request)).toEqual({ id_token: 'signed' });
        expect(io.calls).toHaveLength(1);
        expect(io.calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
        expect(new URLSearchParams(io.calls[0]!.body).get('code_verifier')).toBe('v'.repeat(43));
        expect(new URLSearchParams(io.calls[0]!.body).get('redirect_uri')).toBe(config.google.callback);
    });
    it('uses confidential Apple code exchange without fake PKCE', async () => {
        const io = transport([{ body: { id_token: 'apple-signed' } }]);
        await fixedSocialOperation(config, { operation: 'apple.exchange', code: 'apple-code' }, new AbortController().signal, io.request);
        expect(io.calls[0]!.url).toBe('https://appleid.apple.com/auth/token');
        expect(new URLSearchParams(io.calls[0]!.body).has('code_verifier')).toBe(false);
        expect(new URLSearchParams(io.calls[0]!.body).get('client_secret')).toBe('apple-test-only');
    });
    it('rejects attacker operation/destination overrides before any request', async () => {
        const io = transport([]);
        for (const input of [{ operation: 'proxy', url: 'https://evil.test' }, { operation: 'google.keys', url: 'https://evil.test' }, { operation: 'google.exchange', code: 'code', verifier: 'v'.repeat(43), redirect_uri: 'https://evil.test' }]) {
            await expect(fixedSocialOperation(config, input, new AbortController().signal, io.request)).rejects.toThrow('SOCIAL_OPERATION_INVALID');
        }
        expect(io.calls).toHaveLength(0);
    });
    it('rejects redirects and oversized responses with constant diagnostics', async () => {
        for (const result of [{ status: 302, body: { location: 'https://evil.test' } }, { body: 'a'.repeat(65537) }]) {
            const io = transport([result]);
            await expect(fixedSocialOperation(config, { operation: 'google.keys' }, new AbortController().signal, io.request)).rejects.toThrow('SOCIAL_TRANSPORT_UNAVAILABLE');
            expect(io.calls).toHaveLength(1);
        }
    });
});

import {createSocialRelay,socialRelayEnvironment,loadSocialCredentials} from '../../deploy/social/social-relay.mjs';
import {request as httpRequest} from 'node:http';
import {mkdtemp,rm,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
async function relayHarness(exchange?:typeof fixedSocialOperation){const directory=await mkdtemp(join(tmpdir(),'social-relay-')),socketPath=join(directory,'social.sock'),server=createSocialRelay(config,exchange);await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});return{server,directory,post:(body:string,path='/social')=>new Promise<{status:number;body:string}>((resolve,reject)=>{const request=httpRequest({socketPath,path,method:'POST',headers:{'content-type':'application/json'}},response=>{const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode!,body:Buffer.concat(chunks).toString()}));});request.on('error',reject);request.end(body);}),close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}};}
it('enforces real Unix HTTP operation/body/concurrency bounds without a wait queue',async()=>{
  let count=0,ready!:()=>void;const entered=new Promise<void>(r=>ready=r),release:Array<()=>void>=[];
  const h=await relayHarness(async()=>{count++;if(count===32)ready();await new Promise<void>(r=>release.push(r));return {};});
  try{expect((await h.post('{}','/proxy')).status).toBe(400);expect((await h.post('x'.repeat(8193))).status).toBe(413);const pending=Array.from({length:32},()=>h.post('{"operation":"google.keys"}'));await entered;expect((await h.post('{"operation":"google.keys"}')).status).toBe(503);for(const resume of release)resume();expect((await Promise.all(pending)).every(r=>r.status===200)).toBe(true);}finally{for(const resume of release)resume();await h.close();}
});
it('aborts a stalled real Unix request at its fixed deadline and returns constant diagnostics',async()=>{
  const h=await relayHarness(async(_configuration,_input,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('private provider response')),{once:true})));
  try{const started=Date.now(),response=await h.post('{"operation":"google.keys"}');expect(response.status).toBe(503);expect(response.body).toBe('{"error":"SOCIAL_TRANSPORT_UNAVAILABLE"}');expect(Date.now()-started).toBeGreaterThanOrEqual(4900);}finally{await h.close();}
});
it('rejects inherited proxy credentials and weak credential-file custody before operations',async()=>{
  expect(()=>socialRelayEnvironment({NODE_ENV:'production',SOCIAL_SOCKET_PATH:'/run/debateai-social/identity.sock',CREDENTIALS_DIRECTORY:'/private/custody',HTTPS_PROXY:'http://evil.test'})).toThrow('SOCIAL_CUSTODY_INVALID');
  const directory=await mkdtemp(join(tmpdir(),'social-credentials-')),path=join(directory,'social-providers');try{await chmod(directory,0o700);await writeFile(path,JSON.stringify({google:{...config.google,appScope:'google-client',access:'existing-approved'}}),{mode:0o600});expect(await loadSocialCredentials(path)).toHaveProperty('google.clientId','google-client');await chmod(path,0o644);await expect(loadSocialCredentials(path)).rejects.toThrow('SOCIAL_CUSTODY_INVALID');}finally{await rm(directory,{recursive:true,force:true});}
});
