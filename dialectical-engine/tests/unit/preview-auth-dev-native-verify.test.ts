import { describe, expect, it } from 'vitest';
import { NativeVerifyPendingForwardStepError,pendingForwardSteps,refusePendingForwardSteps } from '../../deploy/preview-auth-dev/v1/verify-native.js';
const operator=await import('../../deploy/'+'preview-auth-dev/v1/native-operator.mjs');
describe('native verify and pending forward steps',()=>{
 // dev's own tests/unit/preview-auth-dev-pending-forward.test.ts covers the chain-only cases; these use the full source shape.
 // Re-review 2026-10-09: every numbered migration of the source counts, not only the chain — dev's 0110 is applied
 // after 0108 as its own forward110, outside plan.forwardChain, and verify must not apply it either.
 const source={manifest:{order:['0000_s00.sql','0093_billing_runtime_role.sql','0107_auth_dev_integration.sql']},forward108:{name:'0108_preview_recovery_verified_bindings.sql'},
  forward110:{name:'0110_account_erasure_public_debates.sql'},forwardChain:[{name:'0111_billing_netopia.sql'},{name:'0112_auth_db_batch.sql'}]} as unknown as Parameters<typeof pendingForwardSteps>[0];
 it('names a pending separate forward110 and any other numbered migration, in source order',()=>{
  const base=['0000_s00.sql','0093_billing_runtime_role.sql','0107_auth_dev_integration.sql','0108_preview_recovery_verified_bindings.sql'];
  expect(pendingForwardSteps(source,new Set(base))).toEqual(['0110_account_erasure_public_debates.sql','0111_billing_netopia.sql','0112_auth_db_batch.sql']);
  expect(pendingForwardSteps(source,new Set([...base,'0110_account_erasure_public_debates.sql','0111_billing_netopia.sql']))).toEqual(['0112_auth_db_batch.sql']);
  expect(pendingForwardSteps(source,new Set(['0108_preview_recovery_verified_bindings.sql']))).toEqual(['0000_s00.sql','0093_billing_runtime_role.sql','0107_auth_dev_integration.sql','0110_account_erasure_public_debates.sql','0111_billing_netopia.sql','0112_auth_db_batch.sql']);
 });
 it('counts a migration recorded in the resolution table (by logical name) as applied, and only reads',async()=>{
  const queries:string[]=[];
  const pool=(ledger:string[],resolved:string[])=>({query:async(sql:string)=>{queries.push(sql);
   if(/to_regclass/.test(sql))return {rows:[{present:true}]};
   if(/debateai_schema_migration_resolution/.test(sql))return {rows:resolved.map(logical_name=>({logical_name}))};
   return {rows:ledger.map(name=>({name}))};}}) as unknown as Parameters<typeof refusePendingForwardSteps>[0];
  const everything=['0000_s00.sql','0107_auth_dev_integration.sql','0108_preview_recovery_verified_bindings.sql','0110_account_erasure_public_debates.sql','0111_billing_netopia.sql','0112_auth_db_batch.sql'];
  // The live preview's 0093 is a resolution (compatibility body), not a ledger row: that is complete, not pending.
  await expect(refusePendingForwardSteps(pool(everything,['0093_billing_runtime_role.sql']),source as never)).resolves.toBeUndefined();
  await expect(refusePendingForwardSteps(pool(everything,[]),source as never)).rejects.toMatchObject({code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP',pending:['0093_billing_runtime_role.sql']});
  await expect(refusePendingForwardSteps(pool(everything.filter(n=>!n.startsWith('0110')),['0093_billing_runtime_role.sql']),source as never)).rejects.toMatchObject({pending:['0110_account_erasure_public_debates.sql']});
  expect(queries.every(sql=>/^\s*SELECT/i.test(sql))).toBe(true);
 });
 it('refuses with a code and a message that tell the operator to run apply-and-plan',()=>{
  const error=new NativeVerifyPendingForwardStepError(['0111_billing_netopia.sql','0112_auth_db_batch.sql']);
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP');
  expect(error.pending).toEqual(['0111_billing_netopia.sql','0112_auth_db_batch.sql']);
  expect(error.message).toMatch(/^PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: /);
  expect(error.message).toContain('0111_billing_netopia.sql, 0112_auth_db_batch.sql');
  expect(error.message).toContain('apply-and-plan');
 });
 it('the native operator prints that refusal and keeps every other failure opaque',()=>{
  const pending=new NativeVerifyPendingForwardStepError(['0112_auth_db_batch.sql']);
  expect(operator.operatorRefusalLine(pending)).toBe(`${pending.message}\n`);
  expect(operator.operatorRefusalLine(new TypeError('PREVIEW_NATIVE_VERIFICATION_REFUSED'))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  expect(operator.operatorRefusalLine(Object.assign(new Error('secret detail\nsecond line'),{code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP'}))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  expect(operator.operatorRefusalLine(undefined)).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
 });
});
