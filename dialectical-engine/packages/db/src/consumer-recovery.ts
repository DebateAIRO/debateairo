import { withConsumerMailLease } from "./consumer-security-mail.js";
import type { Pool } from 'pg';
import type { AuditContextHasher, CryptoEnvelope } from '@debateai/crypto';
import type { AuthSourceContext } from './identity.js';
import type { ConsumerLegalPair, ConsumerSessionCommit } from './consumer-auth.js';
import { ProfileTransactions } from './account-profile.js';
export type RecoveryDelivery = Readonly<{
    userId: string;
    channelType: 'email' | 'recovery_email';
    addressCiphertext: CryptoEnvelope;
    expiresAt: string;
}>;
export type RecoveryProof = Readonly<{
    userId: string;
    codeId: string;
    codeHash: string;
    slot: number;
    passwordHash: string | null;
}>;
export type RecoveryEnrollment = Readonly<{
    userId: string;
    method: 'passkey' | 'totp';
    factorId: string;
    secretCiphertext: CryptoEnvelope | null;
    passwordHashSnapshot: string | null;
    challengeHash: string | null;
    rpId: string | null;
    origin: string | null;
    expiresAt: string;
}>;
export class PostgresConsumerRecoveryRepository {
    private readonly tx: ProfileTransactions;
    constructor(private readonly pool: Pool, audit: AuditContextHasher) { this.tx = new ProfileTransactions(pool, audit); }
    async start(index: Buffer, tokenHash: string, source: AuthSourceContext): Promise<RecoveryDelivery | null> { return this.tx.audited(source, async (c, context) => (await c.query('SELECT identity.start_consumer_recovery($1,$2,$3) value', [index, tokenHash, context])).rows[0].value); }
    async readProof(tokenHash: string, slot: number): Promise<RecoveryProof | null> { return (await this.pool.query('SELECT identity.read_consumer_recovery_proof($1,$2) value', [tokenHash, slot])).rows[0].value; }
    async prove(input: Readonly<Record<string, unknown>>, source: AuthSourceContext): Promise<{
        expiresAt: string;
    }> { return this.tx.audited(source, async (c, context) => (await c.query('SELECT identity.prove_consumer_recovery($1,$2) value', [input, context])).rows[0].value); }
    async prepareEnrollment(capHash: string): Promise<{
        userId: string;
        method: 'passkey' | 'totp';
        pseudonym: string;
        expiresAt: string;
        passwordHash: string | null;
    }> { return (await this.pool.query('SELECT identity.prepare_recovery_enrollment($1) value', [capHash])).rows[0].value; }
    async beginEnrollment(input: Readonly<Record<string, unknown>>, source: AuthSourceContext): Promise<{
        userHandle: string | null;
        expiresAt: string;
    }> { return this.tx.audited(source, async (c, context) => (await c.query('SELECT identity.begin_recovery_enrollment($1,$2) value', [input, context])).rows[0].value); }
    async readEnrollment(input: Readonly<Record<string, unknown>>): Promise<RecoveryEnrollment> { return (await this.pool.query('SELECT identity.read_recovery_enrollment($1) value', [input])).rows[0].value; }
    async completeEnrollment(input: Readonly<Record<string, unknown>>, legal: readonly ConsumerLegalPair[], source: AuthSourceContext): Promise<ConsumerSessionCommit> { return this.tx.audited(source, async (c, context) => (await c.query('SELECT identity.complete_recovery_enrollment($1,$2,$3) value', [input, JSON.stringify(legal), context])).rows[0].value); }
    /** Same key-destruction lease as erasure. Current-channel account locks live through the bounded send. */
    async withDeliveryLease<T>(userId: string, tokenHash: string, use: (record: RecoveryDelivery) => Promise<T>): Promise<T | null> {
        return withConsumerMailLease(this.pool, userId, async (c) => {
            const record = (await c.query('SELECT identity.read_consumer_recovery_proof($1,NULL) value', [tokenHash])).rows[0].value as RecoveryDelivery | null;
            return record !== null && record.userId === userId ? use(record) : null;
        });
    }
}
