import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';
import { loadConcurrentIndexStep } from './migration-forward-concurrent-index.js';

/**
 * The MFA-recovery outbox's pending-only due index (security audit run 3, NV-38; migrations/lineage/README.md
 * "Recovery notice due indexes (0126-0128)"): the outside-transaction chain step after 0127, whose whole body is
 * `CREATE INDEX CONCURRENTLY IF NOT EXISTS mfa_recovery_notice_due ON identity.mfa_recovery_notice …`. The shared loader
 * (migration-forward-concurrent-index.ts) checks its manifest, its n1 header's index and, as its postcondition, the
 * index row.
 */
export const loadForward0128=(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>=>loadConcurrentIndexStep({
 name:'0128_mfa_recovery_notice_due.sql',version:'mfa-recovery-notice-due-forward0128-v1',manifestPath:'lineage/mfa-recovery-notice-due-forward0128.json',
 previous:'0127_backup_email_notice_due.sql',refusal:'MIGRATION_FORWARD0128_',schema:'identity',table:'mfa_recovery_notice',index:'mfa_recovery_notice_due'
},anchor);
