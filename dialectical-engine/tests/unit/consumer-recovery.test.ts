import { describe, expect, it } from 'vitest';
import { hashToken, type TokenKind } from '@debateai/crypto';
describe('consumer recovery proof domains', () => {
    it('separates channel and enrollment-only bearers from sessions and registration', () => {
        const token = 'a'.repeat(43), hashes = ['consumer-recovery-channel', 'consumer-recovery-enroll', 'session', 'verification', 'recovery-email-confirm'].map(kind => hashToken(kind as TokenKind, token));
        expect(new Set(hashes).size).toBe(5);
    });
});
