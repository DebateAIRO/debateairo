import type { Pool } from 'pg';
import type { AuditContextHasher } from '@debateai/crypto';
import type { AuthSourceContext } from './identity.js';
import { ProfileTransactions, type ProfileSession } from './account-profile.js';
import type { ConsumerCeremonySeed, ConsumerCredential } from './consumer-auth.js';
export type ConsumerPasswordPath = Readonly<{
    passwordHashSnapshot: string | null;
    passwordUsable: boolean;
    admittedProviders?:readonly string[];
}>;
export type ConsumerSecurityAssertion = Omit<ConsumerCredential, 'ownerRef' | 'passwordHash'> & Readonly<{
    authorization: Readonly<Record<string, string>>;
    challengeHash: string;
    rpId: string;
    origin: string;
}>;
export class PostgresConsumerSecurityRepository {
    private readonly transactions: ProfileTransactions;
    constructor(private readonly pool: Pool, audit: AuditContextHasher) { this.transactions = new ProfileTransactions(pool, audit); }
    async readPasswordState(session: ProfileSession): Promise<string | null> { return (await this.pool.query('SELECT identity.read_consumer_security_password_state($1) value', [session])).rows[0].value; }
    async authMethods(session: ProfileSession, password: ConsumerPasswordPath): Promise<unknown> { return (await this.pool.query('SELECT identity.read_consumer_auth_methods($1) AS value', [{ ...session, ...password }])).rows[0].value; }
    async removeAuthMethod(session: ProfileSession, factorId: string, grantHash: string, password: ConsumerPasswordPath, source: AuthSourceContext): Promise<void> { await this.mutate('remove_consumer_auth_method', { ...session, ...password, factorId, grantHash }, source); }
    async regenerateRecoveryCodes(session: ProfileSession, grantHash: string, hashes: readonly string[], source: AuthSourceContext): Promise<void> { await this.mutate('regenerate_consumer_recovery_codes', { ...session, grantHash, hashes }, source); }
    async beginStepUp(input: ConsumerCeremonySeed & ProfileSession & Readonly<{
        authorization: Readonly<Record<string, string>>;
    }>): Promise<{
        expiresAt: string;
    }> {
        await this.pool.query('SELECT identity.prune_consumer_security_challenges($1)', [input.challengeCapacity]);
        return (await this.pool.query('SELECT identity.begin_consumer_security_step_up($1) AS value', [input])).rows[0].value;
    }
    async readStepUp(input: ProfileSession & Readonly<{
        handleHash: string;
        bindingHash: string;
        credentialId: string;
    }>): Promise<ConsumerSecurityAssertion | null> { return (await this.pool.query('SELECT identity.read_consumer_security_step_up($1) AS value', [input])).rows[0].value; }
    async completeStepUp(input: ProfileSession & ConsumerSecurityAssertion & Readonly<{
        handleHash: string;
        bindingHash: string;
        replacementTokenHash: string;
        replacementCsrfHash: string;
        grantHash: string;
    }>, source: AuthSourceContext): Promise<{
        authorization: Readonly<Record<string, string>>;
        expiresAt: string;
    }> { return this.mutate('complete_consumer_security_step_up', input, source); }
    private async mutate<T>(name: 'remove_consumer_auth_method' | 'regenerate_consumer_recovery_codes' | 'complete_consumer_security_step_up', input: unknown, source: AuthSourceContext): Promise<T> {
        return this.transactions.audited(source, async (c, context) => (await c.query(`SELECT identity.${name}($1,$2) AS value`, [input, context])).rows[0].value as T);
    }
}
