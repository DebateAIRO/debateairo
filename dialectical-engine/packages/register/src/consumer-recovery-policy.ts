import type { Pool } from 'pg';
import { z } from 'zod';
import { TypedDomainError } from '@debateai/kernel';
const schema = z.object({ kind: z.literal('CONSUMER_RECOVERY_POLICY'), policy_version: z.literal(1), token_ttl_ms: z.literal(900000), capability_ttl_ms: z.literal(300000), send_spacing_ms: z.literal(60000), send_window_ms: z.literal(3600000), maximum_send_attempts: z.literal(3), count_failed_transport: z.literal(true), token_delivery: z.literal('ONE_ATTEMPT_NO_RETRY'), dispatch: z.literal('SHARED_SELECTED_AUTH_MAIL_PERMIT_BEFORE_BOTH_MECHANISMS_WITH_PRETRANSPORT_RESPONSE_FLOOR'), restart: z.literal('FRESH_CHANNEL_TOKEN_AND_UNUSED_SAME_SLOT_REPLACEMENT_CODE'), ordinary_gate: z.literal('UNTIL_VERIFIED_REPLACEMENT'), staff_recovery: z.literal('SEPARATE_REFUSE_CONSUMER'), scheduled_erasure: z.literal('REFUSE'), notification: z.object({ claim_ttl_ms: z.literal(300000), retry_ms: z.literal(30000), batch_max: z.literal(100), coalescing: z.literal('CURRENT_CHANNEL_AND_EVENT_KIND'), events: z.tuple([z.literal('METHOD_CHANGED'), z.literal('CODES_REGENERATED'), z.literal('RECOVERY_PROVED'), z.literal('RECOVERY_COMPLETED')]), erasure: z.literal('CANCEL_BEFORE_KEY_DESTRUCTION') }).strict() }).strict();
export type ConsumerRecoveryPolicy = Readonly<z.infer<typeof schema> & {
    sourceRef: string;
}>;
export const CONSUMER_RECOVERY_POLICY_REGISTER_ROW = Object.freeze({ rowKey: 'consumerRecoveryPolicy', sourceRef: '2026-10-04-account-onboarding-passkeys:Task9; controller architecture ruling 2026-10-05; independent token-plus-code consumer mechanism v1', value: { kind: 'CONSUMER_RECOVERY_POLICY', policy_version: 1, token_ttl_ms: 900000, capability_ttl_ms: 300000, send_spacing_ms: 60000, send_window_ms: 3600000, maximum_send_attempts: 3, count_failed_transport: true, token_delivery: 'ONE_ATTEMPT_NO_RETRY', dispatch: 'SHARED_SELECTED_AUTH_MAIL_PERMIT_BEFORE_BOTH_MECHANISMS_WITH_PRETRANSPORT_RESPONSE_FLOOR', restart: 'FRESH_CHANNEL_TOKEN_AND_UNUSED_SAME_SLOT_REPLACEMENT_CODE', ordinary_gate: 'UNTIL_VERIFIED_REPLACEMENT', staff_recovery: 'SEPARATE_REFUSE_CONSUMER', scheduled_erasure: 'REFUSE', notification: { claim_ttl_ms: 300000, retry_ms: 30000, batch_max: 100, coalescing: 'CURRENT_CHANNEL_AND_EVENT_KIND', events: ['METHOD_CHANGED', 'CODES_REGENERATED', 'RECOVERY_PROVED', 'RECOVERY_COMPLETED'], erasure: 'CANCEL_BEFORE_KEY_DESTRUCTION' } } });
export function consumerRecoveryPolicyFromValue(value: unknown, sourceRef: string): ConsumerRecoveryPolicy {
    const p = schema.safeParse(value);
    if (!p.success || !sourceRef.trim())
        throw new TypedDomainError('CONSUMER_RECOVERY_POLICY_INVALID', 'Consumer recovery policy is absent or malformed');
    return Object.freeze({ ...p.data, notification: Object.freeze(p.data.notification), sourceRef });
}
export async function readConsumerRecoveryPolicy(pool: Pool, version: number): Promise<ConsumerRecoveryPolicy> {
    if (!Number.isInteger(version) || version < 1)
        throw new TypeError('CONSUMER_RECOVERY_REGISTER_VERSION_INVALID');
    const result = await pool.query<{
        value_json: unknown;
        source_ref: string;
        sealed: boolean;
        row_count: number;
        actual_count: string;
    }>(`SELECT r.value_json,r.source_ref,v.sealed,v.row_count,(SELECT count(*)::text FROM register.register_row WHERE register_version=v.register_version) actual_count FROM register.register_row r JOIN register.register_version v USING(register_version) WHERE r.register_version=$1 AND r.row_key='consumerRecoveryPolicy'`, [version]);
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row?.sealed || Number(row.actual_count) !== row.row_count)
        throw new TypedDomainError('CONSUMER_RECOVERY_POLICY_INVALID', 'Consumer recovery policy requires the exact complete sealed register');
    return consumerRecoveryPolicyFromValue(row.value_json, row.source_ref);
}
