import { TypedDomainError } from "@debateai/kernel";

/**
 * Preview retry fix, option B (spec 2026-10-11 §1.2 (d), owner ruling R1): a refusal that provably cost
 * nothing — the call was never sent to the vendor, or the vendor refused it unbilled. The gateway records
 * its attempt as a REFUSED ledger row (`migrations/0000_s00.sql:164` already allows the value), and every
 * count that limits attempts leaves REFUSED rows out, so a free refusal never uses up a step. The code
 * stays PROVIDER_CALL_FAILED, so every caller handles it as the transport failure it is.
 *
 * Its own module, not `index.ts`: `preview-test.ts` extends it, and `index.ts` re-exports
 * `preview-test.ts`, so a class declared in `index.ts` would still be uninitialised when the subclass
 * is evaluated. Hosted and local never produce it.
 */
export class ProviderUnbilledRefusal extends TypedDomainError {
  constructor(message: string) {
    super("PROVIDER_CALL_FAILED", message);
  }
}

/**
 * NV-50 (security audit run 3): a failure the money authority says was SENT and billed — the preview gate's "sent and
 * failed; it booked its whole reservation" (`PreviewChargeBookedMax`). The gateway charges such an attempt as
 * unanswered (`recordUnanswered`, at its projected maximum), unlike every other typed refusal an in-process fetch
 * raises, which never left the process. Its own module for the same cycle reason as `ProviderUnbilledRefusal`. The code
 * stays PROVIDER_CALL_FAILED, so every caller handles it as the transport failure it is.
 */
export class ProviderSentBilledFailure extends TypedDomainError {
  constructor(message: string) {
    super("PROVIDER_CALL_FAILED", message);
  }
}
