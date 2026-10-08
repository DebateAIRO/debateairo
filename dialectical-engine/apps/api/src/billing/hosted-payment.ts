import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  paymentErrorCode, type CardPayments, type HostedPaymentStart, type HostedPaymentStarted, type PaymentReport,
  type SubscriptionState
} from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, ChargeEventRow, HostedPaymentRow } from "@debateai/db";
import { sealAcceptanceEvidence } from "../legal.js";
import type { BillingAudit } from "./audit.js";
import type { ConsentPair } from "./checkout.js";
import { isThisPaymentSystem } from "./outbox.js";
import { queuePaymentAlert } from "./payment-alert.js";
import { sealPaymentUrl } from "./records.js";
import { BillingRefusal } from "./refusal.js";
import { chargeEvent } from "./rows.js";
import { refuse } from "./subscription-core.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";

/**
 * Spec 2026-10-05 §2.6.3, §2.10, §2.11, §2.14: what every payment on NETOPIA's hosted page shares (N18's checkout, the
 * upgrade, N13's card check, N16's reads): the start and what a failed start writes, the status read with its `billing.status_read`
 * row, the two state tests, the close of an unpaid page, and the card-saving agreement. Nothing here logs a payer, a
 * URL or a token.
 */
const ALMOST_PAID_STATUSES: ReadonlySet<string> = new Set(["6", "13", "14", "18"]);

/** Spec §2.6.3's first row: PAID, AUTHORIZED, or PENDING with NETOPIA status 6, 13, 14 or 18. */
export function paidOrAlmost(report: Pick<PaymentReport, "state" | "providerStatus">): boolean {
  return report.state === "PAID" || report.state === "AUTHORIZED"
    || (report.state === "PENDING" && ALMOST_PAID_STATUSES.has(report.providerStatus));
}

/** Spec §2.6.3's reusable page: untouched (status 1), declined (the person may retry), or at the bank's check (15). */
export function stillPayable(report: Pick<PaymentReport, "state" | "providerStatus">): boolean {
  return (report.state === "PENDING" && report.providerStatus === "1") || report.state === "DECLINED"
    || report.state === "ACTION_REQUIRED";
}

/** N-16: the ntpID a status read names: the charge's newest SUBMITTED one, else the hosted page's, else none. */
export function bestPaymentId(
  events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "providerPaymentId">>,
  hosted: Pick<HostedPaymentRow, "providerPaymentId"> | null
): string | null {
  const submitted = [...events].reverse().find((event) => event.kind === "SUBMITTED" && event.providerPaymentId !== null);
  return submitted?.providerPaymentId ?? hosted?.providerPaymentId ?? null;
}

/** One status read and what it was: the state, `NO_SUCH_ORDER`, or the payment error's code (`UNREADABLE`). */
export type StatusReadResult = Readonly<{ answer: PaymentReport | "NO_SUCH_ORDER" | "UNREADABLE"; outcome: string }>;

/**
 * Spec §2.14: one status read with its content-free `billing.status_read` row (the state, or the error code). A payment
 * error, or an answer for another order, is UNREADABLE; a refused key also writes the operator's line; any other error
 * is a bug and is thrown.
 */
export async function readPaymentStatus(
  deps: Readonly<{
    billing: Pick<BillingRepository, "withTransaction" | "insertStatusRead">; payments: Pick<CardPayments, "status">;
    audit: BillingAudit;
  }>,
  input: Readonly<{ chargeId: string; providerPaymentId: string | null; operation: string; now: Date }>
): Promise<StatusReadResult> {
  let answer: StatusReadResult["answer"];
  let outcome: string;
  try {
    const read = await deps.payments.status({ orderId: input.chargeId, providerPaymentId: input.providerPaymentId });
    answer = read !== "NO_SUCH_ORDER" && read.orderId !== input.chargeId ? "UNREADABLE" : read;
    outcome = answer === "UNREADABLE" ? "PAYMENT_RESPONSE_INVALID" : answer === "NO_SUCH_ORDER" ? answer : answer.state;
  } catch (error) {
    const code = paymentErrorCode(error);
    if (code === null) throw error;
    if (code === "PAYMENT_CREDENTIALS_REFUSED") deps.audit("billing.payment.credentials_refused", { operation: input.operation });
    answer = "UNREADABLE";
    outcome = code;
  }
  await deps.billing.withTransaction((client) => deps.billing.insertStatusRead(client, { chargeId: input.chargeId, at: input.now, outcome }));
  return Object.freeze({ answer, outcome });
}

export type HostedStartDeps = Readonly<{
  billing: Pick<BillingRepository, "withTransaction" | "enqueue" | "insertHostedPayment" | "appendChargeEvent">;
  jobs: Pick<BillingJobQueries, "outboxJobExists">;
  payments: Pick<CardPayments, "startHostedPayment">;
  paymentEnvironment: "sandbox" | "live";
  recordsKey: Buffer;
  audit: BillingAudit;
}>;

/** The flow a hosted start belongs to, as its audit lines name it. */
export type HostedChargeOperation = "checkout" | "upgrade" | "card_check";

export function hostedStartDeps(
  deps: Pick<SubscriptionRouteDeps, "billing" | "jobs" | "payments" | "recordsKey" | "audit">, paymentEnvironment: "sandbox" | "live"
): HostedStartDeps {
  return Object.freeze({
    billing: deps.billing, jobs: deps.jobs, payments: deps.payments, paymentEnvironment, recordsKey: deps.recordsKey, audit: deps.audit
  });
}

/** The owner's next steps for a start NETOPIA refused (English only, owner-facing, content-free). */
const START_STEPS: Readonly<Record<"CHARGE_CONFIGURATION_REFUSED" | "CHARGE_CREDENTIALS_REFUSED", string>> = Object.freeze({
  CHARGE_CONFIGURATION_REFUSED: "NETOPIA refused to open its payment page for a checkout, an upgrade or a card check"
    + " because of our own setup (the merchant settings, or a code we do not know). Nothing was charged; the person was"
    + " told the payment page could not be opened and may try again. Run pnpm billing:check, then fix the setting in"
    + " NETOPIA's admin or ask NETOPIA about the code.",
  CHARGE_CREDENTIALS_REFUSED: "NETOPIA refused our API key when opening a payment page for a checkout, an upgrade or a"
    + " card check. Nothing was charged; the person was told the payment page could not be opened. Replace the key with"
    + " the guided setup (deploy/vps/billing-setup.sh --replace netopia), restart the API, and run pnpm billing:check."
});

/**
 * Spec §2.6.2 steps 5-8 for a charge already written REQUESTED: the start (no lock and no pool connection held across
 * it), then in one transaction the `billing.hosted_payment` row (URL sealed) and SUBMITTED with NETOPIA's ntpID. A start
 * that proves nothing was sent writes FAILED with its code (the plain 503; 422 for an incomplete payer); one that may
 * have reached NETOPIA writes SUBMIT_UNKNOWN and leaves no page, so nobody can pay it and the next request closes it.
 * Our settings and our key also email the owner O3, once per code and UTC hour. Returns the URL for the browser.
 */
export async function startHostedCharge(
  deps: HostedStartDeps, input: Readonly<{ operation: HostedChargeOperation; start: HostedPaymentStart; now: Date }>
): Promise<string> {
  const chargeId = input.start.orderId;
  let started: HostedPaymentStarted;
  try {
    started = await deps.payments.startHostedPayment(input.start);
  } catch (error) {
    const code = paymentErrorCode(error);
    if (code === null) throw error;
    await deps.billing.withTransaction((client) => deps.billing.appendChargeEvent(client, code === "PAYMENT_OUTCOME_UNKNOWN"
      ? chargeEvent(chargeId, "SUBMIT_UNKNOWN", input.now, {
        providerPaymentId: null, amountMicros: input.start.amountMicros, errorCode: "CHARGE_OUTCOME_UNKNOWN"
      })
      : chargeEvent(chargeId, "FAILED", input.now, { providerPaymentId: null, amountMicros: null, errorCode: code })));
    deps.audit("billing.payment.start_failed", { operation: input.operation, code });
    if (code === "PAYMENT_CREDENTIALS_REFUSED") deps.audit("billing.payment.credentials_refused", { operation: input.operation });
    const alert = code === "PAYMENT_CREDENTIALS_REFUSED" ? "CHARGE_CREDENTIALS_REFUSED"
      : code === "PAYMENT_CONFIGURATION_REFUSED" ? "CHARGE_CONFIGURATION_REFUSED" : null;
    if (alert !== null) {
      await queuePaymentAlert({ repository: deps.billing, jobs: deps.jobs }, {
        code: alert, reference: `charge ${chargeId}`, nextSteps: START_STEPS[alert],
        dedupeRef: `${alert}:${input.now.toISOString().slice(0, 13)}`, now: input.now
      });
    }
    throw code === "PAYMENT_PAYER_INCOMPLETE" ? new BillingRefusal(422, "BILLING_ADDRESS_REQUIRED")
      : new BillingRefusal(503, "PAYMENT_PROVIDER_UNAVAILABLE");
  }
  const sealed = sealPaymentUrl(deps.recordsKey, chargeId, started.redirectUrl);
  await deps.billing.withTransaction(async (client) => {
    await deps.billing.insertHostedPayment(client, {
      chargeId, paymentProvider: "netopia", paymentEnvironment: deps.paymentEnvironment,
      providerPaymentId: started.providerPaymentId, redirectCiphertext: sealed.ciphertext, keyId: sealed.keyId,
      startedAt: input.now
    });
    await deps.billing.appendChargeEvent(client, chargeEvent(chargeId, "SUBMITTED", input.now, {
      providerPaymentId: started.providerPaymentId, amountMicros: input.start.amountMicros, errorCode: null
    }));
  });
  return started.redirectUrl;
}

/**
 * Spec §2.10, §2.14: an unpaid hosted charge closes FAILED(NO_TRANSACTION) under the owner lock, only while it still
 * holds no SUCCEEDED and no FAILED (a verification that landed meanwhile wins). N16 keeps reading it daily for 30 days,
 * so a late payment is applied or refunded, never missed. True when this call closed it.
 */
export async function closeUnpaidHostedCharge(
  deps: Readonly<{
    billing: Pick<BillingRepository, "withTransaction" | "charge" | "appendChargeEvent">;
    jobs: Pick<BillingJobQueries, "lockOwner">; audit: BillingAudit;
  }>,
  input: Readonly<{ chargeId: string; ownerRef: string; now: Date }>
): Promise<boolean> {
  const closed = await deps.billing.withTransaction(async (client) => {
    await deps.jobs.lockOwner(client, input.ownerRef);
    const current = await deps.billing.charge(input.chargeId, client);
    if (current === null || current.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED")) return null;
    await deps.billing.appendChargeEvent(client, chargeEvent(input.chargeId, "FAILED", input.now, {
      providerPaymentId: null, amountMicros: current.totalMicros, errorCode: "NO_TRANSACTION"
    }));
    return current.kind;
  });
  if (closed !== null) deps.audit("billing.charge.closed", { kind: closed });
  return closed !== null;
}

/** Spec §2.18: the agreement the page showed must be the renewal sentence in force for that locale (else 409). */
export function assertCurrentAgreement(deps: Pick<SubscriptionRouteDeps, "consentDocuments">, locale: string, pair: ConsentPair): void {
  const current = deps.consentDocuments("CONSENT_RENEWAL", locale);
  if (current === null || current.version !== pair.version || current.sha256 !== pair.sha256) refuse(409, "LEGAL_DOCUMENT_STALE");
}

/** Spec §2.18 (SR-20): the card-saving agreement as a RENEWAL_TERMS acceptance with the flow's surface, in the caller's transaction. */
export async function recordCardAgreement(
  deps: Pick<SubscriptionRouteDeps, "acceptances" | "recordsKey">, client: PoolClient,
  input: Readonly<{ ownerRef: string; locale: string; agreement: ConsentPair; surface: "UPGRADE" | "CARD_CHANGE"; ip: string; userAgent: string; at: Date }>
): Promise<void> {
  const acceptanceId = randomUUID();
  const evidence = sealAcceptanceEvidence(deps.recordsKey, acceptanceId, { ip: input.ip, userAgent: input.userAgent });
  await deps.acceptances.record(client, [Object.freeze({
    acceptanceId, ownerRef: input.ownerRef, kind: "RENEWAL_TERMS" as const, documentVersion: input.agreement.version,
    documentSha256: input.agreement.sha256, locale: input.locale, surface: input.surface, acceptedAt: input.at,
    evidenceCiphertext: evidence.evidenceCiphertext, keyId: evidence.keyId
  })]);
}

/** Spec §2.5.4: a NETOPIA subscription of the environment this API serves (another system's plan is never paid here). */
export function servedByNetopia(
  deps: Pick<SubscriptionRouteDeps, "paymentEnvironment">,
  state: Pick<SubscriptionState, "paymentProvider" | "paymentEnvironment">
): boolean {
  return isThisPaymentSystem(state, deps.paymentEnvironment);
}
