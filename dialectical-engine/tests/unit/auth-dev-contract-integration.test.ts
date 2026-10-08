import { describe, expect, it } from 'vitest';
import { CompleteSocialSignupRequestSchema, RegisterRequestSchema, SessionSchema, StepUpAuthorizationRequestSchema, StepUpResponseSchema } from '@debateai/contract';
const signup = { email:'integration@example.test',password:'Synthetic-password1!',phone:'+40700000000',date_of_birth:'1990-01-01',terms:{version:'1.0',sha256:'a'.repeat(64)},privacy:{version:'1.0',sha256:'b'.repeat(64)},locale:'en',ui_locale:'en-GB',time_zone:'Europe/Bucharest',turnstile_token:'synthetic-proof' };
describe('combined auth and Dev public contracts',()=>{
 it('retains phone and display metadata while requiring a valid declared signup region',()=>{
  expect(RegisterRequestSchema.safeParse({...signup,country:'RO'}).success).toBe(true);
  expect(RegisterRequestSchema.safeParse({...signup,country:'US',us_state:'CA'}).success).toBe(true);
  for(const region of [{},{country:'US'},{country:'US',us_state:'XX'},{country:'RO',us_state:'CA'},{country:'XX'}]) expect(RegisterRequestSchema.safeParse({...signup,...region}).success).toBe(false);
  expect(RegisterRequestSchema.safeParse({...signup,country:'RO',phone:undefined}).success).toBe(false);
 });
 it('uses the same declared-region validation for social signup without a password',()=>{
  const {password,...social}=signup;
  expect(CompleteSocialSignupRequestSchema.safeParse({...social,country:'US',us_state:'NY',continuation_token:'a'.repeat(43)}).success).toBe(true);
  expect(CompleteSocialSignupRequestSchema.safeParse({...social,country:'US',continuation_token:'a'.repeat(43)}).success).toBe(false);
 });
 it('keeps a strictly account-scoped withdrawal grant alongside consumer security purposes',()=>{
  for(const action of ['WITHDRAW_SUBSCRIPTION','CHANGE_PHONE_PROFILE','ADD_PASSKEY','REGENERATE_RECOVERY_CODES']) {
   expect(StepUpAuthorizationRequestSchema.safeParse({action}).success).toBe(true);
   expect(StepUpAuthorizationRequestSchema.safeParse({action,target_run_id:'11111111-1111-4111-8111-111111111111'}).success).toBe(false);
   expect(StepUpResponseSchema.safeParse({status:'step_up_complete',csrf_token:'a'.repeat(43),step_up_grant:{action,token:'b'.repeat(43),expires_at:'2026-10-06T12:00:00.000Z'}}).success).toBe(true);
  }
 });
 it('retains the scorecard availability bit in the shared auth session schema',()=>{
  expect(SessionSchema.safeParse({asker_id:'owner:11111111-1111-4111-8111-111111111111',session_id:'22222222-2222-4222-8222-222222222222',caller_scope:'ASKER',ownership_provenance:'server_session',provisional_identity_model:false,model_scorecard_in_force:true}).success).toBe(true);
 });
});
