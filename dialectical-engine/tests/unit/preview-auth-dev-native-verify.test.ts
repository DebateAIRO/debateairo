import { describe, expect, it } from 'vitest';
import { NativeVerifyPendingForwardStepError,pendingForwardSteps } from '../../deploy/preview-auth-dev/v1/verify-native.js';
const operator=await import('../../deploy/'+'preview-auth-dev/v1/native-operator.mjs');
const chain=(...names:string[])=>({forwardChain:names.map(name=>({name}))}) as unknown as Parameters<typeof pendingForwardSteps>[0];
describe('native verify and pending forward steps',()=>{
 it('names every forward step of the source that the ledger lacks, however many there are',()=>{
  const three=chain('0109_billing_netopia.sql','0110_auth_db_batch.sql','0111_account_deletion.sql');
  expect(pendingForwardSteps(three,new Set(['0108_preview_recovery_verified_bindings.sql']))).toEqual(['0109_billing_netopia.sql','0110_auth_db_batch.sql','0111_account_deletion.sql']);
  expect(pendingForwardSteps(three,new Set(['0109_billing_netopia.sql']))).toEqual(['0110_auth_db_batch.sql','0111_account_deletion.sql']);
  expect(pendingForwardSteps(three,new Set(['0109_billing_netopia.sql','0110_auth_db_batch.sql','0111_account_deletion.sql']))).toEqual([]);
  expect(pendingForwardSteps(chain(),new Set())).toEqual([]);
 });
 it('refuses with a code and a message that tell the operator to run apply-and-plan',()=>{
  const error=new NativeVerifyPendingForwardStepError(['0109_billing_netopia.sql','0110_auth_db_batch.sql']);
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP');
  expect(error.pending).toEqual(['0109_billing_netopia.sql','0110_auth_db_batch.sql']);
  expect(error.message).toMatch(/^PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: /);
  expect(error.message).toContain('0109_billing_netopia.sql, 0110_auth_db_batch.sql');
  expect(error.message).toContain('apply-and-plan');
 });
 it('the native operator prints that refusal and keeps every other failure opaque',()=>{
  const pending=new NativeVerifyPendingForwardStepError(['0110_auth_db_batch.sql']);
  expect(operator.operatorRefusalLine(pending)).toBe(`${pending.message}\n`);
  expect(operator.operatorRefusalLine(new TypeError('PREVIEW_NATIVE_VERIFICATION_REFUSED'))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  expect(operator.operatorRefusalLine(Object.assign(new Error('secret detail\nsecond line'),{code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP'}))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  expect(operator.operatorRefusalLine(undefined)).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
 });
});
