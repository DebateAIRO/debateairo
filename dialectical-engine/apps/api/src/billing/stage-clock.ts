import { TypedDomainError } from "@debateai/kernel";
import type { PaymentEnvironment } from "@debateai/billing-core";
import {
  XMoneyClient,
  type XMoneyRefundsSeen,
  type XMoneyTransaction,
  type XMoneyTransactionListQuery
} from "@debateai/payments-xmoney";

/** Until N23: xMoney's stage API, the only xMoney host a sandbox deployment may still name. */
const STAGE_API_HOST = "api-stage.xmoney.com";
const LIVE_API_HOST = "api.xmoney.com";

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
 * in minutes. It is refused unless the payments go to NETOPIA's SANDBOX (and, until N23, unless any xMoney setting
 * still present names xMoney's stage API), so a moved clock can never touch live money. Absent, this is the real
 * clock with an offset of 0. main.ts hands the offset to TimeShiftedCardPayments and StageShiftedXMoneyClient.
 */
export function billingClock(input: Readonly<{
  paymentEnvironment: PaymentEnvironment | null;
  xmoneyApiBaseUrl: string | null;
  offsetDays: number | null;
  now?: () => Date;
}>): BillingStageClock {
  const now = input.now ?? (() => new Date());
  if (input.offsetDays === null) return Object.freeze({ clock: now, offsetMs: 0 });
  if (input.paymentEnvironment !== "sandbox"
    || (input.xmoneyApiBaseUrl !== null && hostOf(input.xmoneyApiBaseUrl) !== STAGE_API_HOST)) {
    throw new TypedDomainError("BILLING_STAGE_CLOCK_LIVE_REFUSED", "the billing clock moves only against NETOPIA's sandbox");
  }
  if (!Number.isInteger(input.offsetDays) || input.offsetDays < 1 || input.offsetDays > 400) {
    throw new TypedDomainError("BILLING_STAGE_CLOCK_OFFSET_INVALID", "the stage clock offset is a whole number of days from 1 to 400");
  }
  const offsetMs = input.offsetDays * 24 * 60 * 60 * 1000;
  return Object.freeze({ clock: () => new Date(now().getTime() + offsetMs), offsetMs });
}

/**
 * The billing runtime lives on the moved clock; xMoney does not. Every time the runtime SENDS (a listing's `from` and
 * `to`, including refundsOf's refund-date window) moves back by the offset, and every time it READS (`createdAt`, the
 * one time on a transaction or a listed refund row) moves forward, so A2's adoption check, P14's reconciliation
 * windows and RefundDesk's check-before-retry ask xMoney about the real moments they mean. Every public method
 * delegates to the real client (#inner); the base class's own transport is never used, and its unreachable address
 * makes any method a later XMoneyClient adds fail loudly here instead of reaching xMoney untranslated (a unit test
 * also pins that every method is overridden).
 */
export class StageShiftedXMoneyClient extends XMoneyClient {
  readonly #inner: XMoneyClient;
  readonly #offsetMs: () => number;

  constructor(inner: XMoneyClient, offsetMs: () => number) {
    super({ baseUrl: "https://stage-clock.invalid", privateKey: Buffer.alloc(1), siteId: "0" });
    this.#inner = inner;
    this.#offsetMs = offsetMs;
  }

  #forward(transaction: XMoneyTransaction, offset: number): XMoneyTransaction {
    return transaction.createdAt === null
      ? transaction
      : Object.freeze({ ...transaction, createdAt: new Date(transaction.createdAt.getTime() + offset) });
  }

  override createCustomer(i: Parameters<XMoneyClient["createCustomer"]>[0]): ReturnType<XMoneyClient["createCustomer"]> {
    return this.#inner.createCustomer(i);
  }

  override async getTransaction(transactionId: string): Promise<XMoneyTransaction> {
    return this.#forward(await this.#inner.getTransaction(transactionId), this.#offsetMs());
  }

  override getOrder(orderId: string): ReturnType<XMoneyClient["getOrder"]> {
    return this.#inner.getOrder(orderId);
  }

  override getCard(cardId: string, customerId: string): ReturnType<XMoneyClient["getCard"]> {
    return this.#inner.getCard(cardId, customerId);
  }

  override rebill(i: Parameters<XMoneyClient["rebill"]>[0]): ReturnType<XMoneyClient["rebill"]> {
    return this.#inner.rebill(i);
  }

  override refund(i: Parameters<XMoneyClient["refund"]>[0]): ReturnType<XMoneyClient["refund"]> {
    return this.#inner.refund(i);
  }

  override async listTransactions(i: XMoneyTransactionListQuery): Promise<ReadonlyArray<XMoneyTransaction>> {
    const offset = this.#offsetMs();
    const listed = await this.#inner.listTransactions({
      ...i, from: new Date(i.from.getTime() - offset), to: new Date(i.to.getTime() - offset)
    });
    return Object.freeze(listed.map((transaction) => this.#forward(transaction, offset)));
  }

  /**
   * The refund listing RefundDesk's check-before-retry (A4 (c)) and P9c's dashboard-refund amount read once they move
   * onto it (D6a Open question 5). `from`/`to` bound the REFUND date, so they move back like any listing window; each
   * listed refund row's `createdAt` moves forward. The real client answers from real time, so a refund made just now
   * is found from the moved side. Asking #inner with the moved dates unshifted would find no refund at all.
   */
  override async refundsOf(i: Parameters<XMoneyClient["refundsOf"]>[0]): Promise<XMoneyRefundsSeen | null> {
    const offset = this.#offsetMs();
    const seen = await this.#inner.refundsOf({
      ...i, from: new Date(i.from.getTime() - offset), to: new Date(i.to.getTime() - offset)
    });
    return seen === null
      ? null
      : Object.freeze({
          ...seen,
          rows: Object.freeze(seen.rows.map((row) => Object.freeze({
            ...row, createdAt: row.createdAt === null ? null : new Date(row.createdAt.getTime() + offset)
          })))
        });
  }
}

type BillingInvoicerEnvironment = Readonly<{
  paymentEnvironment: PaymentEnvironment | null;
  /** Until N23: an xMoney base still set in api.env. */
  xmoneyApiBaseUrl: string | null;
  quadernoApiBaseUrl: string | null;
  smartbillApiBaseUrl: string | null;
}>;

/** A sandbox payment system is configured: NETOPIA's sandbox, or (until N23) xMoney's stage API. */
function takesSandboxPayments(input: BillingInvoicerEnvironment): boolean {
  return input.paymentEnvironment === "sandbox" || hostOf(input.xmoneyApiBaseUrl) === STAGE_API_HOST;
}

/** A live payment system is configured: NETOPIA live, or (until N23) xMoney's live API. */
function takesLivePayments(input: BillingInvoicerEnvironment): boolean {
  return input.paymentEnvironment === "live" || hostOf(input.xmoneyApiBaseUrl) === LIVE_API_HOST;
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
