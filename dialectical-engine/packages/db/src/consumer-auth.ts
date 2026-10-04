import type { Pool } from 'pg';
import type { AuditContextHasher } from '@debateai/crypto';
import type { AuthSourceContext } from './identity.js';
export type ConsumerLegalPair = Readonly<{
    kind: 'TERMS' | 'PRIVACY';
    locale: string;
    version: string;
    sha256: string;
}>;
export type ConsumerChallenge = Readonly<{
    challengeHash: string;
    purpose: 'INITIAL_ENROLLMENT' | 'ADD_PASSKEY' | 'LOGIN';
    rpId: string;
    origin: string;
    userId: string | null;
    expiresAt: string;
}>;
export type ConsumerCredential = Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    deviceType: 'singleDevice' | 'multiDevice';
    backedUp: boolean;
    userHandle: string;
    userId: string;
    ownerRef: string;
    passwordHash: string;
    securityEpoch: number;
}>;
export type ConsumerSessionCommit = Readonly<{
    userId: string;
    ownerRef: string;
    sessionId: string | null;
}>;
export type ConsumerSessionPersistence = Readonly<{
    sessionId: string;
    sessionTokenHash: string;
    csrfTokenHash: string;
    sessionBindingContext: Readonly<{
        user_agent_hash: string;
    }>;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
}>;
export type ConsumerCeremonySeed = Readonly<{
    handleHash: string;
    challengeHash: string;
    bindingHash: string;
    rpId: string;
    origin: string;
}>;
export type ConsumerEnrollmentAuthority = Readonly<{
    enrollmentTokenHash: string;
}> | Readonly<{
    userId: string;
    sessionId: string;
    tokenHash: string;
    grantHash: string;
}>;
export type ConsumerEnrollmentSeed = ConsumerCeremonySeed & ConsumerEnrollmentAuthority & Readonly<{
    userHandle: string;
}>;
export type ConsumerEnrollmentOptions = Readonly<{
    userHandle: string;
    expiresAt: string;
    excludeCredentials: readonly {
        id: string;
        type: 'public-key';
        transports: readonly string[];
    }[];
}>;
export type ConsumerVerifiedRegistration = Readonly<{
    credentialId: string;
    publicKey: string;
    counter: number;
    deviceType: 'singleDevice' | 'multiDevice';
    backedUp: boolean;
    transports: readonly string[];
}>;
export type ConsumerEnrollmentCompletion = ConsumerVerifiedRegistration & Readonly<{
    handleHash: string;
    challengeHash: string;
    bindingHash: string;
    label?: string;
    sessionId?: string;
    tokenHash?: string;
    material?: ConsumerSessionPersistence;
}>;
export type ConsumerLoginCompletion = ConsumerCredential & Readonly<{
    handleHash: string;
    challengeHash: string;
    bindingHash: string;
    material: ConsumerSessionPersistence;
}>;
/** Execute-only consumer authority. Memory-hard source reduction always precedes BEGIN and locks. */
export class PostgresConsumerAuthRepository {
    constructor(private readonly pool: Pool, private readonly auditContext: AuditContextHasher) { }
    private async audited<T>(source: AuthSourceContext, sql: string, values: readonly unknown[]): Promise<T> {
        const normalize = (value: unknown, max: number) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : 'unknown').slice(0, max);
        const ip = await this.auditContext.hashSourceIp(normalize(source.ip, 64));
        const ua = await this.auditContext.hashUserAgent(normalize(source.userAgent, 256));
        if (!/^[0-9a-f]{64}$/.test(ip) || !/^[0-9a-f]{64}$/.test(ua))
            throw new TypeError('AUDIT_CONTEXT_DIGEST_INVALID');
        const prepared = { ipArgon2id: 'argon2id-audit:v1:' + ip, userAgentArgon2id: 'argon2id-audit:v1:' + ua };
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT identity.begin_runtime_audit_attempt()');
            const result = await client.query<{
                value: T;
            }>(sql, [...values, prepared]);
            await client.query('COMMIT');
            return result.rows[0]!.value;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async beginEnrollment(input: ConsumerEnrollmentSeed, currentLegal: readonly ConsumerLegalPair[], source: AuthSourceContext): Promise<ConsumerEnrollmentOptions> {
        return this.audited(source, 'SELECT identity.begin_consumer_passkey_enrollment($1,$2,$3) AS value', [input, JSON.stringify(currentLegal)]);
    }
    async beginLogin(input: ConsumerCeremonySeed & Readonly<{
        continuationHash?: string;
    }>): Promise<Readonly<{
        expiresAt: string;
    }>> {
        const result = await this.pool.query('SELECT identity.begin_consumer_passkey_login($1) AS value', [input]);
        return result.rows[0].value;
    }
    async readChallenge(handleHash: string, purpose: 'ENROLLMENT' | 'LOGIN', bindingHash: string): Promise<ConsumerChallenge | null> {
        const result = await this.pool.query('SELECT identity.read_consumer_passkey_challenge($1,$2,$3) AS value', [handleHash, purpose, bindingHash]);
        return result.rows[0].value;
    }
    async readCredential(handleHash: string, credentialId: string, bindingHash: string): Promise<ConsumerCredential | null> {
        const result = await this.pool.query('SELECT identity.read_consumer_passkey_credential($1,$2,$3) AS value', [handleHash, credentialId, bindingHash]);
        return result.rows[0].value;
    }
    async completeEnrollment(input: ConsumerEnrollmentCompletion, currentLegal: readonly ConsumerLegalPair[], source: AuthSourceContext): Promise<ConsumerSessionCommit> {
        return this.audited(source, 'SELECT identity.complete_consumer_passkey_enrollment($1,$2,$3) AS value', [input, JSON.stringify(currentLegal)]);
    }
    async completeLogin(input: ConsumerLoginCompletion, source: AuthSourceContext): Promise<ConsumerSessionCommit> {
        return this.audited(source, 'SELECT identity.complete_consumer_passkey_login($1,$2) AS value', [input]);
    }
}
