import type { PoolClient } from "pg";
import { invoiceIssuerFor, type PaymentProvider, type SubscriptionEvent, type SubscriptionState } from "@debateai/billing-core";
import type { BillingRepository, ChargeRow, QuoteRow } from "@debateai/db";
import type { XMoneyTransaction } from "@debateai/payments-xmoney";
import type { BillingPolicy } from "@debateai/register";
import type { RequestedRefundReason } from "./codes.js";

/** N10 (spec §2.8): the NETOPIA payment a settlement decides; `cardTokenId` is the card its event adopts (§2.15.2). */
export type SettledPayment = Readonly<{
  provider: PaymentProvider;
  providerPaymentId: string;
  occurredAt: Date | null;
  cardCountry: string | null;
  cardTokenId: string | null;
}>;

/** What a charge kind's settlement sees, inside the one VERIFY_PAYMENT transaction, under the owner lock. */
export type SettlementContext = Readonly<{
  client: PoolClient;
  now: Date;
  charge: ChargeRow;
  /** Null only for a rebill refused synchronously (P11a), which has no transaction to read. */
  transaction: XMoneyTransaction | null;
  /** N10: the NETOPIA payment being decided; null on the xMoney path and for a refusal written with no payment. */
  payment: SettledPayment | null;
  subscription: SubscriptionState;
  events: ReadonlyArray<SubscriptionEvent>;
  /** Null only for a CARD_CHECK charge, which has no quote. */
  quote: QuoteRow | null;
  ownerRef: string;
  customerId: string;
  /**
   * The card's issuing country as xMoney reports it (`GET /card/{id}`), read for a successful payment; P12e's
   * CARD_CHECK settlement refuses a new card from an always-blocked country with it. Null when xMoney names no
   * country, and on a failure, a void or a chargeback (nothing there reads it).
   */
  cardCountry: string | null;
  /** What the settlement's own `prepare` read before this transaction opened (absent: it has no `prepare`). */
  prepared?: SettlementPrepared;
}>;

/** Named groups of string fields a settlement read ahead (INITIAL: `acceptedTerms`, M1's attachment fields). */
export type SettlementPrepared = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type SettlementResult =
  | Readonly<{ kind: "APPLIED" }>
  | Readonly<{ kind: "REFUND"; reason: RequestedRefundReason }>;

export const APPLIED: SettlementResult = Object.freeze({ kind: "APPLIED" as const });

/**
 * Per charge kind: INITIAL (P9b), RENEWAL (P11a), UPGRADE and CARD_CHECK (P12c/P12e). A kind with no settlement
 * cannot be applied: its VERIFY_PAYMENT job retries until one is registered.
 */
export interface ChargeSettlement {
  /**
   * The reads a settlement needs that have no transaction-client form (L3a's `AcceptanceRepository.latest`), made
   * BEFORE the VERIFY_PAYMENT transaction opens, so no read inside it ever waits for a second pool connection. Its
   * answer reaches `succeeded` as `context.prepared`.
   */
  prepare?(charge: ChargeRow): Promise<SettlementPrepared>;
  succeeded(context: SettlementContext): Promise<SettlementResult>;
  /**
   * `bankDeclined` (N10/N11): NETOPIA's own "the bank refused" (spec §2.4.5), passed by the renewal's synchronous refusal and
   * by VERIFY_PAYMENT's NETOPIA path. Absent: today's rule (only an xMoney PAYMENT_DECLINED names the bank; a NETOPIA
   * charge whose caller did not say is never read as the bank's refusal, `settlement-renewal.ts`).
   */
  failed(context: SettlementContext & Readonly<{ errorCode: string; bankDeclined?: boolean }>): Promise<void>;
  /** A card check's authorization is voided on purpose (A12); P12e supplies this for CARD_CHECK. */
  voided?(context: SettlementContext): Promise<void>;
}

/** Exactly one legal invoice per charge, from the issuer the rules give the tax country (spec §2.5.9). */
export async function enqueueInvoice(
  repository: Pick<BillingRepository, "enqueue">, client: PoolClient,
  input: Readonly<{ charge: ChargeRow; quote: QuoteRow; policy: BillingPolicy; cardCountry: string | null; ipCountry: string; now: Date }>
): Promise<void> {
  const issuer = invoiceIssuerFor(input.quote.taxCountry, input.policy.invoiceIssuerRules);
  await repository.enqueue(client, {
    kind: issuer === "SMARTBILL" ? "SMARTBILL_INVOICE" : "QUADERNO_RECORD_SALE",
    ref: input.charge.chargeId, notBefore: input.now,
    payload: { card_country: input.cardCountry, ip_country: input.ipCountry }
  });
}

/** The credit note for one refunded transaction, from the charge's own issuer (spec §1.4). */
export async function enqueueCreditNote(
  repository: Pick<BillingRepository, "enqueue">, client: PoolClient,
  input: Readonly<{ charge: ChargeRow; quote: QuoteRow; policy: BillingPolicy; transactionId: string; refundMicros: number; now: Date }>
): Promise<void> {
  const issuer = invoiceIssuerFor(input.quote.taxCountry, input.policy.invoiceIssuerRules);
  await repository.enqueue(client, {
    kind: issuer === "SMARTBILL" ? "SMARTBILL_STORNO" : "QUADERNO_RECORD_REFUND",
    ref: `${input.charge.chargeId}:${input.transactionId}`, notBefore: input.now,
    payload: { charge_id: input.charge.chargeId, transaction_id: input.transactionId, refund_micros: input.refundMicros }
  });
}
