import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('staff production composition boundary',()=>{
 it('loads explicit protected operator adapters and owns target dispatch without web JIT publication',async()=>{
  const main=await readFile('apps/api/src/main.ts','utf8');
  expect(main).toContain('createStaffRuntime');expect(main).not.toContain('acknowledgements: new Map()');
  expect(main).toContain('targetInvitationTransport: staffAlerts.targetInvitationTransport');
  expect(main).toContain('staffAlerts?.close()');expect(main).toContain('staffAlerts?.start()');
  expect(main).not.toContain('publishStaffIndependentAlertReadiness');expect(main).not.toContain('PostgresStaffIndependentReadinessPublisher');
 });
 it('propagates private peer cancellation into lifecycle and key/lease preparation',async()=>{
  const source=await readFile('apps/api/src/index.ts','utf8');
  expect(source).toContain('this.#splitLifecycle.read(runId, signal)');
  expect(source).toContain('prepareLeasedContentEncryptionForRun(this.pool, runId, signal)');
 });
 it('keeps browser and role projections free of database, operator and recovery material',async()=>{
  const source=await readFile('packages/contract/src/staff-access.ts','utf8');
  for(const name of ['DATABASE_URL','recovery_generation','verifier','recovery_material','ackAdapterId','recipient'])expect(source).not.toContain(name);
 });
});

import { auditMigrationReplaySafety } from '../../tools/orphan-audit/src/index.js';
it('keeps all newly authored Staff DDL replay-safe under the unchanged audit policy',async()=>{
 for(const file of ['0085_staff_access_foundation.sql','0086_staff_webauthn.sql','0087_staff_authorization_guards.sql','0088_staff_alert_delivery.sql','0089_owner_recovery.sql','0090_staff_http_projections.sql','0091_staff_activation_receipt.sql']){
  expect(auditMigrationReplaySafety(file,await readFile('migrations/'+file,'utf8')),file).toEqual([]);
 }
});
