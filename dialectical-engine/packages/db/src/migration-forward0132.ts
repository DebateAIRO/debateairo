import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';
import { loadConcurrentIndexStep } from './migration-forward-concurrent-index.js';

/**
 * The password-reset outbox's pending-only due index (security audit run 3, NV-38; migrations/lineage/README.md
 * "Recovery notice due indexes (0132-0134)"): the outside-transaction chain step after the security fixes of audit
 * run 3 (0131), whose whole body is `CREATE INDEX CONCURRENTLY IF NOT EXISTS password_reset_notice_due ON
 * identity.password_reset_notice …`. The shared loader (migration-forward-concurrent-index.ts) checks its manifest, its
 * n1 header's index and, as its postcondition, the index row.
 */
export const loadForward0132=(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>=>loadConcurrentIndexStep({
 name:'0132_password_reset_notice_due.sql',version:'password-reset-notice-due-forward0132-v1',manifestPath:'lineage/password-reset-notice-due-forward0132.json',
 previous:'0131_security_fixes_run3.sql',refusal:'MIGRATION_FORWARD0132_',schema:'identity',table:'password_reset_notice',index:'password_reset_notice_due'
},anchor);
