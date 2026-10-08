import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encrypt, generateDek } from '@debateai/crypto';
import * as alerts from '../../apps/api/src/staff/alerts.js';
const targetUserId = randomUUID(), operationId = randomUUID(), eventId = randomUUID(), outboxId = randomUUID(), claimToken = randomUUID();
const message = {targetUserId, operationId, invitationHandle: Buffer.alloc(32, 8).toString('base64url')};
const claim = {outboxId,claimToken,eventId,operationId,targetUserId};
const deliveryId = `${eventId}:TARGET_INVITATION`;
function setup() {
    const dek = generateDek(), channelId = randomUUID(), addressCiphertext = encrypt(dek, Buffer.from('verified-only@example.test'),
        ['identity','user.email_ciphertext',targetUserId,'run:none',targetUserId,`user-dek:${targetUserId}`,'1']);
    let available = true, reads = 0, keyWait: Promise<void> = Promise.resolve();
    const delivered: unknown[] = [], seen: unknown[] = [];
    return {delivered, seen, revoke: () => {available = false;}, keyBarrier: (barrier: Promise<void>) => {keyWait = barrier;},
        dependencies: {publicAppUrl: 'https://admin.example.test', channels: {readTargetInvitationChannel: async (input: unknown) => {
            reads++; seen.push(input); return available ? {channelId,addressCiphertext} : null;
        }}, keys: {load: async () => {await keyWait; return Buffer.from(dek);}},
        delivery: {send: async (mail: unknown) => {delivered.push(mail); return 'ACK' as const;}}}, reads: () => reads};
}
describe('claim-bound verified target invitation transport', () => {
    it('resolves only the persisted verified channel and keeps bearer solely in fragment', async () => {
        expect(typeof alerts.VerifiedStaffTargetInvitationTransport).toBe('function');
        const f = setup(), transport = new alerts.VerifiedStaffTargetInvitationTransport(f.dependencies);
        expect(await transport.send(deliveryId,message,undefined,claim)).toBe('ACK');
        expect(f.seen).toEqual([claim,claim]);
        const mail = f.delivered[0] as {recipient: string; invitationUrl: string; deliveryId: string};
        expect(mail.recipient).toBe('verified-only@example.test'); expect(mail.deliveryId).toBe(deliveryId);
        const url = new URL(mail.invitationUrl); expect(url.origin).toBe('https://admin.example.test');
        expect(url.search).toBe(''); expect(url.hash).toBe('#' + message.invitationHandle);
        expect(Object.keys(mail).sort()).toEqual(['deliveryId','invitationUrl','recipient']);
    });
    it('refuses missing/wrong claims, unavailable channels and cancellation after key await', async () => {
        expect(typeof alerts.VerifiedStaffTargetInvitationTransport).toBe('function');
        const f = setup(), transport = new alerts.VerifiedStaffTargetInvitationTransport(f.dependencies);
        await expect(transport.send(deliveryId,message)).rejects.toThrow();
        await expect(transport.send(deliveryId,message,undefined,{...claim,operationId: randomUUID()})).rejects.toThrow();
        let release: () => void = () => {}; f.keyBarrier(new Promise<void>(resolve => {release = resolve;}));
        const controller = new AbortController(), pending = transport.send(deliveryId,message,controller.signal,claim);
        await Promise.resolve(); await Promise.resolve(); controller.abort(); release();
        await expect(pending).rejects.toThrow('TIMEOUT'); expect(f.delivered).toHaveLength(0);
    });
    it('rechecks the channel after key loading so revoke cannot admit later delivery', async () => {
        expect(typeof alerts.VerifiedStaffTargetInvitationTransport).toBe('function');
        const f = setup(), transport = new alerts.VerifiedStaffTargetInvitationTransport(f.dependencies);
        let release: () => void = () => {}; f.keyBarrier(new Promise<void>(resolve => {release = resolve;}));
        const pending = transport.send(deliveryId,message,undefined,claim);
        await Promise.resolve(); await Promise.resolve(); f.revoke(); release();
        await expect(pending).rejects.toThrow('DESTINATION_REJECTED'); expect(f.delivered).toHaveLength(0);
    });
});
