import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';
import { loadConcurrentIndexStep } from './migration-forward-concurrent-index.js';

/**
 * The MFA-recovery control table's user index (security audit run 3, NV-15 and NV-16; migrations/lineage/README.md
 * "The MFA recovery control user index (0129)"): the outside-transaction chain step after 0128, whose whole body is
 * `CREATE INDEX CONCURRENTLY IF NOT EXISTS mfa_recovery_control_user_started ON identity.mfa_recovery_control(…)`.
 * The shared loader (migration-forward-concurrent-index.ts) checks its manifest, its n1 header's index and, as its
 * postcondition, the index row.
 */
export const loadForward0129=(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>=>loadConcurrentIndexStep({
 name:'0129_mfa_recovery_control_user_started.sql',version:'mfa-recovery-control-user-started-forward0129-v1',manifestPath:'lineage/mfa-recovery-control-user-started-forward0129.json',
 previous:'0128_mfa_recovery_notice_due.sql',refusal:'MIGRATION_FORWARD0129_',schema:'identity',table:'mfa_recovery_control',index:'mfa_recovery_control_user_started'
},anchor);
