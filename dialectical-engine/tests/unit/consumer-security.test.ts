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
