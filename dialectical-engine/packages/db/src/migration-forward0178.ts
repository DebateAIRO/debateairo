import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';
import { loadConcurrentIndexStep } from './migration-forward-concurrent-index.js';

/**
 * The backup-email outbox's pending-only due index (security audit run 3, NV-38; migrations/lineage/README.md
 * "Recovery notice due indexes (0177-0179)"): the outside-transaction chain step after 0177, whose whole body is
 * `CREATE INDEX CONCURRENTLY IF NOT EXISTS backup_email_notice_due ON identity.backup_email_notice …`. The shared loader
 * (migration-forward-concurrent-index.ts) checks its manifest, its n1 header's index and, as its postcondition, the
 * index row.
 */
export const loadForward0178=(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>=>loadConcurrentIndexStep({
 name:'0178_backup_email_notice_due.sql',version:'backup-email-notice-due-forward0178-v1',manifestPath:'lineage/backup-email-notice-due-forward0178.json',
 previous:'0177_password_reset_notice_due.sql',refusal:'MIGRATION_FORWARD0178_',schema:'identity',table:'backup_email_notice',index:'backup_email_notice_due'
},anchor);
