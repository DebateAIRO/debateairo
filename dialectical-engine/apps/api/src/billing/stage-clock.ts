import { TypedDomainError } from "@debateai/kernel";
import type { PaymentEnvironment } from "@debateai/billing-core";

function hostOf(url: string | null): string {
  if (url === null) return "";
  try {
    return new URL(url).hostname.replace(/\.$/u, "");
  } catch {
    return "";
  }
}

export type BillingStageClock = Readonly<{ clock: () => Date; offsetMs: number }>;

/**
 * The billing runtime's clock. OWNER-RUN sandbox only (spec 2026-10-05 §2.3, §2.17.1: "renew by advancing the
 * clock"): an offset moves renewals, retries and the period-end sweep forward by whole days, so a month can be tested
 * in minutes. It is refused unless the payments go to NETOPIA's SANDBOX, so a moved clock can never touch live money.
 * Absent, this is the real clock with an offset of 0. main.ts hands the offset to TimeShiftedCardPayments.
 */
export function billingClock(input: Readonly<{
  paymentEnvironment: PaymentEnvironment | null;
  offsetDays: number | null;
  now?: () => Date;
}>): BillingStageClock {
  const now = input.now ?? (() => new Date());
  if (input.offsetDays === null) return Object.freeze({ clock: now, offsetMs: 0 });
  if (input.paymentEnvironment !== "sandbox") {
    throw new TypedDomainError("BILLING_STAGE_CLOCK_LIVE_REFUSED", "the billing clock moves only against NETOPIA's sandbox");
  }
  if (!Number.isInteger(input.offsetDays) || input.offsetDays < 1 || input.offsetDays > 400) {
    throw new TypedDomainError("BILLING_STAGE_CLOCK_OFFSET_INVALID", "the stage clock offset is a whole number of days from 1 to 400");
  }
  const offsetMs = input.offsetDays * 24 * 60 * 60 * 1000;
  return Object.freeze({ clock: () => new Date(now().getTime() + offsetMs), offsetMs });
}

type BillingInvoicerEnvironment = Readonly<{
  paymentEnvironment: PaymentEnvironment | null;
  quadernoApiBaseUrl: string | null;
  smartbillApiBaseUrl: string | null;
}>;

/** A sandbox payment system is configured: NETOPIA's sandbox. */
function takesSandboxPayments(input: BillingInvoicerEnvironment): boolean {
  return input.paymentEnvironment === "sandbox";
}

/** A live payment system is configured: NETOPIA live. */
function takesLivePayments(input: BillingInvoicerEnvironment): boolean {
  return input.paymentEnvironment === "live";
}

/**
 * A sandbox payment never reaches a live invoicing service (spec 2026-10-05 §2.17.1). SmartBill has no sandbox (X1):
 * its invoices are real, numbered fiscal documents that e-Factura sends to ANAF, and a replayed call makes a second
 * one. Quaderno's sandbox is `<account>.sandbox-quadernoapp.com`. Checked on the environment as a whole, offset or not.
 * The rule fails closed: with sandbox payments it passes only when the Quaderno host ends in
 * `.sandbox-quadernoapp.com` AND the SmartBill host ends in `.invalid` (a reserved name that never resolves); anything
 * else (a live host, a trailing-dot spelling of one, a bare IP address, an unset or unparsable address) is refused.
 * Hosts are compared without one trailing dot.
 */
export function assertStageInvoicersAreSandboxes(input: BillingInvoicerEnvironment): void {
  if (!takesSandboxPayments(input)) return;
  const quaderno = hostOf(input.quadernoApiBaseUrl);
  const smartbill = hostOf(input.smartbillApiBaseUrl);
  if (!quaderno.endsWith(".sandbox-quadernoapp.com") || !smartbill.endsWith(".invalid")) {
    throw new TypedDomainError(
      "BILLING_STAGE_LIVE_INVOICER_REFUSED",
      "a sandbox payment system may only run beside Quaderno's sandbox and a .invalid SmartBill address"
    );
  }
}

/**
 * A live payment never meets a sandbox invoicer (spec 2026-09-29: exactly one legal invoice per charge). A live
 * charge invoiced by Quaderno's sandbox, or sent to a `.invalid` SmartBill address, gets no legal invoice at all, so
 * with live payments the API refuses a Quaderno host ending in `.sandbox-quadernoapp.com` and a SmartBill host ending
 * in `.invalid`. This is the other half of assertStageInvoicersAreSandboxes: a host that ran NETOPIA's sandbox on the
 * real clock and then goes live on the same host (README §14.8's path) must move all three addresses. A mixed
 * configuration (one system sandbox, the other live) fails one of the two guards, so it never boots.
 */
export function assertLiveInvoicersAreLive(input: BillingInvoicerEnvironment): void {
  if (!takesLivePayments(input)) return;
  const quaderno = hostOf(input.quadernoApiBaseUrl);
  const smartbill = hostOf(input.smartbillApiBaseUrl);
  if (quaderno.endsWith(".sandbox-quadernoapp.com") || smartbill.endsWith(".invalid")) {
    throw new TypedDomainError(
      "BILLING_LIVE_SANDBOX_INVOICER_REFUSED",
      "a live payment system may not run beside Quaderno's sandbox or a .invalid SmartBill address"
    );
  }
}
