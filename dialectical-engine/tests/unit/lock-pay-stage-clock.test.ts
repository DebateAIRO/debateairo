// Real payments on the hosted preview, the API's own half: the preview configuration takes live payments only with
// the owner's switch (PREVIEW_LIVE_PAYMENTS=real-money), and the switch only with NETOPIA's live system and only on
// the preview. Every other combination boots as it did before the switch existed.
import { describe, expect, it } from 'vitest';
import { TypedDomainError } from '@debateai/kernel';
import { assertPreviewLivePayments } from '../../apps/api/src/billing/stage-clock.js';

const outcomeOf = (input: Parameters<typeof assertPreviewLivePayments>[0]) => {
 try { assertPreviewLivePayments(input); return 'boots'; } catch (error) { if (error instanceof TypedDomainError) return error.code; throw error; }
};

describe('assertPreviewLivePayments', () => {
 // Billing on (the site version's billingPolicy.enabled): every combination as before the billing-off rule.
 it.each([
  [true, 'live', 'real-money', 'boots'],
  [true, 'live', null, 'PREVIEW_LIVE_PAYMENTS_UNSET'],
  [true, 'sandbox', 'real-money', 'PREVIEW_LIVE_PAYMENTS_MISMATCH'],
  [true, 'sandbox', null, 'boots'],
  [true, null, 'real-money', 'PREVIEW_LIVE_PAYMENTS_MISMATCH'],
  [true, null, null, 'boots'],
  [false, 'live', 'real-money', 'PREVIEW_LIVE_PAYMENTS_OFF_PREVIEW'],
  [false, 'live', null, 'boots'],
  [false, 'sandbox', 'real-money', 'PREVIEW_LIVE_PAYMENTS_OFF_PREVIEW'],
  [false, 'sandbox', null, 'boots'],
  [false, null, 'real-money', 'PREVIEW_LIVE_PAYMENTS_OFF_PREVIEW'],
  [false, null, null, 'boots']
 ] as const)('billing on, preview %s, payments %s, switch %s: %s', (preview, paymentEnvironment, flag, expected) => {
  expect(outcomeOf({ preview, paymentEnvironment, billingOn: true, flag })).toBe(expected);
 });

 // Billing off: NETOPIA's four alone make the provider-only mode (its paymentEnvironment), or nothing is built (null).
 // The switch is refused there; without the switch every combination boots exactly as with billing on.
 it.each([
  [true, 'live', 'real-money', 'PREVIEW_LIVE_PAYMENTS_BILLING_OFF'],
  [true, 'live', null, 'PREVIEW_LIVE_PAYMENTS_UNSET'],
  [true, 'sandbox', 'real-money', 'PREVIEW_LIVE_PAYMENTS_MISMATCH'],
  [true, 'sandbox', null, 'boots'],
  [true, null, 'real-money', 'PREVIEW_LIVE_PAYMENTS_MISMATCH'],
  [true, null, null, 'boots'],
  [false, 'live', 'real-money', 'PREVIEW_LIVE_PAYMENTS_OFF_PREVIEW'],
  [false, 'live', null, 'boots'],
  [false, 'sandbox', null, 'boots'],
  [false, null, null, 'boots']
 ] as const)('billing off, preview %s, payments %s, switch %s: %s', (preview, paymentEnvironment, flag, expected) => {
  expect(outcomeOf({ preview, paymentEnvironment, billingOn: false, flag })).toBe(expected);
 });

 it('names the code and says no value', () => {
  try { assertPreviewLivePayments({ preview: true, paymentEnvironment: 'live', billingOn: true, flag: null }); } catch (error) {
   expect(error).toBeInstanceOf(TypedDomainError);
   expect((error as Error).message).not.toMatch(/https?:|netopia-payments\.com/u);
  }
 });
});
