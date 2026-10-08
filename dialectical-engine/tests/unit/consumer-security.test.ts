import { describe, expect, it } from 'vitest';
import { StepUpAuthorizationRequestSchema, StepUpResponseSchema } from '@debateai/contract';
const factorId = 'c699bf9c-cf7f-4aaa-bec2-69bad787fe67';
const grant = { token: 'a'.repeat(43), expires_at: '2026-10-05T01:00:00.000Z' };
describe('purpose-bound consumer security contract', () => {
    it('admits removal only with the exact factor target and carries that target in the grant', () => {
        expect(StepUpAuthorizationRequestSchema.safeParse({ action: 'REMOVE_AUTH_METHOD', target_factor_id: factorId }).success).toBe(true);
        expect(StepUpAuthorizationRequestSchema.safeParse({ action: 'REMOVE_AUTH_METHOD' }).success).toBe(false);
        expect(StepUpAuthorizationRequestSchema.safeParse({ action: 'REMOVE_AUTH_METHOD', target_provider: 'google' }).success).toBe(false);
        expect(StepUpResponseSchema.safeParse({ status: 'step_up_complete', csrf_token: 'c'.repeat(43), step_up_grant: { ...grant, action: 'REMOVE_AUTH_METHOD', target_factor_id: factorId } }).success).toBe(true);
    });
    it('admits exact provider targets and refuses mixing factor, run, and provider authority', () => {
        for (const action of ['LINK_PROVIDER', 'UNLINK_PROVIDER']) {
            expect(StepUpAuthorizationRequestSchema.safeParse({ action, target_provider: 'google' }).success).toBe(true);
            expect(StepUpAuthorizationRequestSchema.safeParse({ action }).success).toBe(false);
            expect(StepUpAuthorizationRequestSchema.safeParse({ action, target_provider: 'arbitrary' }).success).toBe(false);
            expect(StepUpAuthorizationRequestSchema.safeParse({ action, target_provider: 'google', target_factor_id: factorId }).success).toBe(false);
        }
    });
    it('retains every current account purpose and adds regeneration without caller-selected targets', () => {
        for (const action of ['DELETE_ACCOUNT', 'CHANGE_EMAIL', 'READ_PHONE_PROFILE', 'CHANGE_PHONE_PROFILE', 'CHANGE_RECOVERY_EMAIL', 'ADD_PASSKEY', 'ADD_TOTP', 'REGENERATE_RECOVERY_CODES']) {
            expect(StepUpAuthorizationRequestSchema.safeParse({ action }).success, action).toBe(true);
            expect(StepUpAuthorizationRequestSchema.safeParse({ action, target_factor_id: factorId }).success).toBe(false);
        }
    });
});

import { vi } from 'vitest';
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows } from '@debateai/register';
import { consumerPasswordUsable } from '../../apps/api/src/consumer-security.js';
import { ConsumerSecurityService, consumerSecuritySession } from '../../apps/api/src/consumer-security.js';
import { SessionService } from '../../apps/api/src/sessions.js';
import { AUTH_POLICY_REGISTER_ROWS, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
import { PostgresConsumerSecurityRepository } from '@debateai/db';
import { hashToken } from '@debateai/crypto';
import { testHttpIdentity } from '../support/httpSession.js';
import { randomBytes } from 'node:crypto';
import { buildApi } from '@debateai/api';
import { TEST_APP_ORIGIN, testSessionApplication, testSessionHeaders } from '../support/httpSession.js';
it('counts only a worker-parseable password envelope within the selected per-use policy', () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
    const tail = '$' + Buffer.alloc(16, 1).toString('base64').replace(/=/g, '') + '$' + Buffer.alloc(32, 1).toString('base64').replace(/=/g, '');
    const valid = '$argon2id$v=19$m=65536,t=3,p=1' + tail;
    for (const value of [null, '', 'unsupported', '$2b$unsupported', valid.replace('v=19', 'v=16')]) {
        expect(consumerPasswordUsable(value, policy)).toBe(false);
    }
    expect(consumerPasswordUsable(valid, policy)).toBe(true);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        expect(consumerPasswordUsable(valid.replace('m=65536', 'm=262144'), policy)).toBe(false);
        expect(diagnostic).toHaveBeenCalledWith('[ARGON2_ENVELOPE_EXCEEDS_POLICY] use=password');
    } finally { diagnostic.mockRestore(); }
});

async function removalSessions() {
  const mfaPolicy=mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
  const service=await SessionService.create({repository:{recordLoginFailure:async()=>undefined} as never,riskSignals:{} as never,onRiskSignalFailure:()=>undefined,dekStore:{} as never,argon2:{} as never,blindIndexKey:Buffer.alloc(32,1),dummyPasswordHash:'fixture',authPolicy:authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS),mfaPolicy,sessionPolicy:sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value,SESSION_POLICY_REGISTER_ROW.sourceRef)});
  const actual=service.consumerProducer();
  return {...actual,admit:vi.fn(actual.admit)};
}
const removalHttpIdentity=testHttpIdentity('task5-method-removal');
const removalIdentity=removalHttpIdentity.authenticated;
const removalSource={ip:'192.0.2.53',userAgent:'synthetic-method-removal',requestId:'method-removal'};
const removalBody={factor_id:factorId,step_up_grant:grant.token};
const removalDependencies={publicAppUrl:'https://example.test',argon2:{} as never,mfaPolicy:mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),authPolicy:authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS)};
describe('method removal admission before password-state and audit-KDF work',()=>{
  it('uses the real selected consumer source budget and refuses before the actual repository/KDF boundary',async()=>{
    const sessions=await removalSessions();
    for(let i=0;i<20;i++)await sessions.admit('LOGIN_BEGIN',randomBytes(32).toString('base64url'),removalSource);
    let queries=0,connections=0,hashes=0;
    const pool={query:async()=>{queries++;return {rows:[{value:null}]};},connect:async()=>{connections++;throw new Error('REPOSITORY_REACHED');}};
    const audit={hashSourceIp:async()=>{hashes++;return 'a'.repeat(64);},hashUserAgent:async()=>{hashes++;return 'b'.repeat(64);}};
    const service=new ConsumerSecurityService(new PostgresConsumerSecurityRepository(pool as never,audit as never),sessions,removalDependencies);
    await expect(service.removeAuthMethod(removalBody,removalIdentity,removalSource)).rejects.toThrow('MFA_RATE_LIMITED');
    expect({queries,connections,hashes}).toEqual({queries:0,connections:0,hashes:0});
    expect(sessions.admit).toHaveBeenLastCalledWith('AUTH_METHOD_REMOVE',removalIdentity.userId,removalSource);
  });
  it('admits the exact target/grant/source before password lookup and preserves native last-method refusal',async()=>{
    const sessions=await removalSessions(),order:string[]=[];
    const original=sessions.admit;sessions.admit=vi.fn(async(...args:Parameters<typeof original>)=>{order.push('admit');return original(...args);});
    const readPasswordState=vi.fn(async()=>{order.push('password');return null;});
    const removeAuthMethod=vi.fn(async()=>{order.push('remove');throw new Error('CONSUMER_LAST_METHOD');});
    const service=new ConsumerSecurityService({readPasswordState,removeAuthMethod} as never,sessions,removalDependencies);
    await expect(service.removeAuthMethod(removalBody,removalIdentity,removalSource)).rejects.toThrow('CONSUMER_LAST_METHOD');
    expect(order).toEqual(['admit','password','remove']);
    expect(removeAuthMethod).toHaveBeenCalledWith(consumerSecuritySession(removalIdentity),factorId,hashToken('step-up-grant',grant.token),{admittedProviders:[],passwordHashSnapshot:null,passwordUsable:false},removalSource);
  });
  it('refuses malformed schema before admission or any password/repository work',async()=>{
    const sessions=await removalSessions(),readPasswordState=vi.fn(),removeAuthMethod=vi.fn();
    const service=new ConsumerSecurityService({readPasswordState,removeAuthMethod} as never,sessions,removalDependencies);
    await expect(service.removeAuthMethod({...removalBody,factor_id:'invalid'},removalIdentity,removalSource)).rejects.toThrow('AUTH_INPUT_INVALID');
    expect(sessions.admit).not.toHaveBeenCalled();expect(readPasswordState).not.toHaveBeenCalled();expect(removeAuthMethod).not.toHaveBeenCalled();
  });
  it('returns the existing rate refusal through genuine authenticated CSRF HTTP before actual repository/KDF effects',async()=>{
    const sessions=await removalSessions();
    for(let i=0;i<20;i++)await sessions.admit('LOGIN_BEGIN',randomBytes(32).toString('base64url'),removalSource);
    let queries=0,connections=0,hashes=0;
    const pool={query:async()=>{queries++;throw new Error('UNEXPECTED_QUERY');},connect:async()=>{connections++;throw new Error('UNEXPECTED_CONNECT');}};
    const audit={hashSourceIp:async()=>{hashes++;return 'a'.repeat(64);},hashUserAgent:async()=>{hashes++;return 'b'.repeat(64);}};
    const service=new ConsumerSecurityService(new PostgresConsumerSecurityRepository(pool as never,audit as never),sessions,removalDependencies);
    const api=buildApi({application:{} as never,consumerSecurity:service,sessions:testSessionApplication([removalHttpIdentity]),allowedOrigin:TEST_APP_ORIGIN});
    try{
      const refused=await api.inject({method:'POST',url:'/v1/account/auth-methods/remove',remoteAddress:removalSource.ip,headers:testSessionHeaders(removalHttpIdentity,true),payload:removalBody});
      expect(refused.statusCode).toBe(429);expect(refused.json().error).toBe('MFA_RATE_LIMITED');expect({queries,connections,hashes}).toEqual({queries:0,connections:0,hashes:0});
      const admitted=sessions.admit.mock.calls.length;
      const csrfRefused=await api.inject({method:'POST',url:'/v1/account/auth-methods/remove',remoteAddress:removalSource.ip,headers:{...testSessionHeaders(removalHttpIdentity,true),'x-csrf-token':'invalid'},payload:removalBody});
      expect(csrfRefused.statusCode).toBe(403);expect(sessions.admit).toHaveBeenCalledTimes(admitted);
    }finally{await api.close();}
  });
});
