import type { Pool, PoolClient } from 'pg';
import type { CryptoEnvelope } from '@debateai/crypto';
export type ConsumerSecurityNoticeClaim = Readonly<{
    noticeId: string;
    userId: string;
    claimToken: string;
}>;
export type ConsumerSecurityNotice = Readonly<{
    userId: string;
    messageId: string;
    channelType: 'email' | 'recovery_email';
    addressCiphertext: CryptoEnvelope;
    eventKind: 'METHOD_CHANGED' | 'CODES_REGENERATED' | 'RECOVERY_PROVED' | 'RECOVERY_COMPLETED' | 'RECOVERY_CODE_USED';
    happenedAt: string;
}>;
/** Shared ordering with erasure: key lease -> security subject -> channel/account -> notice. */
export async function withConsumerMailLease<T>(pool: Pool, userId: string, use: (client: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect(), key = 'debateai:account-erasure-notification:v1:' + userId;
    let failure: Error | undefined, held = false;
    const failed = (e: Error) => { failure = e; };
    c.on('error', failed);
    try {
        await c.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key]);
        held = true;
        await c.query('BEGIN');
        const result = await use(c);
        await c.query('COMMIT');
        return result;
    }
    catch (error) {
        try {
            await c.query('ROLLBACK');
        }
        catch (e) {
            failure = e instanceof Error ? e : new Error('CONSUMER_MAIL_LEASE_FAILED');
        }
        throw error;
    }
    finally {
        if (held && !failure)
            try {
                const r = await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0)) unlocked', [key]);
                if (r.rows[0]?.unlocked !== true)
                    failure = new Error('CONSUMER_MAIL_LEASE_UNLOCK_FAILED');
            }
            catch (e) {
                failure = e instanceof Error ? e : new Error('CONSUMER_MAIL_LEASE_UNLOCK_FAILED');
            }
        c.removeListener('error', failed);
        c.release(failure);
        if (failure)
            throw failure;
    }
}
export class PostgresConsumerSecurityNoticeRepository {
    constructor(private readonly pool: Pool) { }
    async claim(limit = 100): Promise<readonly ConsumerSecurityNoticeClaim[]> { return (await this.pool.query('SELECT * FROM identity.claim_consumer_security_notices($1)', [limit])).rows.map(r => ({ noticeId: r.notice_id, userId: r.user_id, claimToken: r.claim_token })); }
    async deliver(claim: ConsumerSecurityNoticeClaim, send: (notice: ConsumerSecurityNotice) => Promise<void>): Promise<boolean> {
        return withConsumerMailLease(this.pool, claim.userId, async (c) => {
            const notice = (await c.query('SELECT identity.read_consumer_security_notice($1,$2) value', [claim.noticeId, claim.claimToken])).rows[0].value as ConsumerSecurityNotice | null;
            if (notice === null || notice.userId !== claim.userId)
                return false;
            await send(notice);
            return (await c.query('SELECT identity.ack_consumer_security_notice($1,$2) value', [claim.noticeId, claim.claimToken])).rows[0].value === true;
        });
    }
    async fail(claim: ConsumerSecurityNoticeClaim): Promise<void> { await this.pool.query("SELECT identity.fail_consumer_security_notice($1,$2,'MAIL_TRANSPORT_FAILED')", [claim.noticeId, claim.claimToken]); }
}
