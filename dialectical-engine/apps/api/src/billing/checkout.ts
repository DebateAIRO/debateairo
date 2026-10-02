import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { computeWindows, microsToDecimal, type SubscriptionState } from "@debateai/billing-core";
import type { AcceptanceInput, AcceptanceRepository, BillingJobQueries, BillingRepository, ChargeRow, QuoteRow } from "@debateai/db";
import type { GeoLookup } from "@debateai/geo";
import { TypedDomainError } from "@debateai/kernel";
import { signOrderPayload, type XMoneyClient, type XMoneyEmbeddedOrder, type XMoneyEnvironment } from "@debateai/payments-xmoney";
import type { BillingPolicy, CountryPolicy, PlanId } from "@debateai/register";
import { sealAcceptanceEvidence } from "../legal.js";
import type { AccountEmailReader } from "./account-email.js";
import { credentialsRefused, rejectedRows, type BillingAudit } from "./audit.js";
import { englishOrderText, planName, type BillingOrderText } from "./order-text.js";
import { decidePaymentPlace, placeRefusal } from "./place.js";
import { addressRequired, LIVE_SUBSCRIPTION_STATUSES } from "./quote.js";
import { openQuoteLocation, sealBillingProfile, type QuoteLocation } from "./records.js";
import { BillingRefusal } from "./refusal.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "./rows.js";

export type ConsentKind = "CONSENT_RENEWAL" | "CONSENT_IMMEDIATE_START";
export type ConsentPair = Readonly<{ version: string; sha256: string }>;

export type CheckoutInput = Readonly<{
  ownerRef: string;
  userId: string;
  ip: string;
  userAgent: string;
  quoteRef: string;
  locale: string;
  consents: Readonly<{ renewal: ConsentPair; immediateStart: ConsentPair }>;
  countryConfirmed: boolean;
  now: Date;
}>;

export type CheckoutResult = Readonly<{
  chargeId: string;
  publicKey: string;
  orderPayload: string;
  orderChecksum: string;
  sdkEnvironment: XMoneyEnvironment;
  reused: boolean;
}>;

/** What an embedded order pays for; `signEmbeddedOrder` words it in the order's locale (spec §2.5.3 step 5). */
export type OrderPurpose = Readonly<{ kind: "ORDER_PLAN"; planId: PlanId }> | Readonly<{ kind: "CARD_CHECK" }>;

/** One embedded xMoney order: the checkout's (authAndCapture) or P12e's card check (auth, 1.00 USD). */
export type EmbeddedOrderInput = Readonly<{
  chargeId: string;
  customerIdentifier: string;
  email: string;
  country: string;
  amountMicros: number;
  purpose: OrderPurpose;
  /** The person's interface locale: the order line xMoney shows on its form and receipts is in it. */
  locale: string;
  cardTransactionMode: XMoneyEmbeddedOrder["cardTransactionMode"];
  /** The page xMoney returns to; the only two pages that carry the card-form policy (A11). */
  returnPath: "/checkout/return" | "/settings/card";
}>;

export type SignedEmbeddedOrder = Readonly<{
  publicKey: string;
  orderPayload: string;
  orderChecksum: string;
  xmoneyEnvironment: XMoneyEnvironment;
}>;

export interface CheckoutServicePort {
  start(input: CheckoutInput): Promise<CheckoutResult>;
}

export type CheckoutDeps = Readonly<{
  repository: Pick<BillingRepository,
    | "withTransaction" | "quote" | "subscriptionForOwner" | "subscriptionEvents" | "chargesForSubscription" | "charge"
    | "appendSubscriptionEvent" | "useQuote" | "ensureCustomer" | "setXMoneyCustomerId" | "appendProfile"
    | "insertCharge" | "appendChargeEvent" | "customerByOwner" | "ownerErasurePending">;
  jobs: Pick<BillingJobQueries, "lockOwner" | "checkoutPaymentSignals">;
  acceptances: Pick<AcceptanceRepository, "record">;
  /** `listTransactions`: whether the open checkout's charge already has a payment on its way (D7 #5). */
  xmoney: Pick<XMoneyClient, "createCustomer" | "listTransactions">;
  accountEmail: AccountEmailReader;
  geo: GeoLookup;
  countryPolicy: CountryPolicy;
  policy: BillingPolicy;
  /** `currentDocument` from @debateai/legal-manifest in production. */
  consentDocuments: (kind: ConsentKind, locale: string) => ConsentPair | null;
  recordsKey: Buffer;
  xmoneyPrivateKey: Buffer;
  xmoneyPublicKey: string;
  siteId: string;
  /** R-7: PUBLIC_APP_URL. */
  publicAppUrl: string;
  /** A22/R-35: P6a's `BillingConnectors.xmoneyEnvironment`, derived from XMONEY_API_BASE_URL. */
  xmoneyEnvironment: XMoneyEnvironment;
  audit: BillingAudit;
  chargeIds?: () => string;
  /**
   * The catalogue sentence for an order line (spec §2.5.3 step 5). P17/P18 supply the 35-locale sentences; absent,
   * `englishOrderText` is used, today's English line.
   */
  orderText?: BillingOrderText;
}>;

/** Every xMoney failure the person can only wait out; CREDENTIALS_REFUSED (ours to fix) also raises the alarm. */
const PROVIDER_FAILURES: ReadonlySet<string> = new Set([
  "XMONEY_UNAVAILABLE", "XMONEY_REFUSED", "XMONEY_OUTCOME_UNKNOWN", "XMONEY_CREDENTIALS_REFUSED"
]);

/** The statuses of a payment attempt that has not finished yet (A9's not-final set). */
const NOT_FINAL_STATUSES: ReadonlySet<string> = new Set(["start", "in-progress", "3d-pending"]);

/**
 * How long a not-final payment attempt still counts as on its way (D7 #5, narrowed): the life of the 3-D Secure
 * session a person may still finish. PROVISIONAL: 20 minutes, a conservative guess below the 30-minute reuse window
 * (so a closed bank window never blocks a checkout for longer than the checkout itself can be reused), until X0 (e)
 * records how long xMoney keeps an unanswered 3-D Secure attempt open. A function, never an exported number.
 */
export function inFlightAttemptLifeMs(): number {
  return 20 * 60_000;
}

/** Whether a not-final attempt created at `createdAt` may still complete (unknown creation time: yes, fail closed). */
export function inFlightAttemptFresh(createdAt: Date | null, now: Date): boolean {
  return createdAt === null || now.getTime() - createdAt.getTime() < inFlightAttemptLifeMs();
}

/** Whether two quotes declare the same buyer (A3(b)); `ip` and `ipCountry` are quote-time evidence, not the buyer. */
function samePurchaser(a: QuoteLocation, b: QuoteLocation): boolean {
  const sameCompany = a.company === null || b.company === null
    ? a.company === b.company
    : a.company.name === b.company.name && a.company.vatId === b.company.vatId
      && a.company.address === b.company.address && a.company.vatValidated === b.company.vatValidated;
  return a.name === b.name && a.country === b.country && a.region === b.region && a.postalCode === b.postalCode
    && a.city === b.city && a.street === b.street && sameCompany;
}

type Prepared = Readonly<{ chargeId: string; customerId: string; totalMicros: number; planId: PlanId; reused: boolean }>;

export class CheckoutService implements CheckoutServicePort {
  constructor(private readonly deps: CheckoutDeps) {}

  /** D5 5i: an xMoney failure is the 503 "try again in a minute"; a credentials refusal also alarms the operator. */
  private providerRefusal(error: unknown): never {
    credentialsRefused(this.deps.audit, error, "checkout");
    if (error instanceof TypedDomainError && PROVIDER_FAILURES.has(error.code)) {
      throw new BillingRefusal(503, "PAYMENT_PROVIDER_UNAVAILABLE");
    }
    throw error;
  }

  async start(input: CheckoutInput): Promise<CheckoutResult> {
    const quote = await this.deps.repository.quote(input.quoteRef, input.ownerRef);
    if (quote === null || quote.kind !== "SUBSCRIBE") throw new BillingRefusal(404, "NOT_FOUND");
    if (quote.expiresAt.getTime() <= input.now.getTime()) throw new BillingRefusal(409, "QUOTE_EXPIRED");
    const location = openQuoteLocation(this.deps.recordsKey, quote.quoteId, quote.locationCiphertext);
    if (addressRequired(location, quote.taxCountry, this.deps.policy)) throw new BillingRefusal(422, "BILLING_ADDRESS_REQUIRED");
    const place = decidePaymentPlace({
      geo: this.deps.geo, policy: this.deps.countryPolicy, ip: input.ip, declaredCountry: location.country
    });
    if (place.kind === "REFUSE") throw placeRefusal(place, this.deps.audit);
    if (place.kind === "CONFIRM_COUNTRY" && !input.countryConfirmed) {
      throw new BillingRefusal(409, "COUNTRY_CONFIRMATION_REQUIRED");
    }
    this.assertCurrentConsent("CONSENT_RENEWAL", input.locale, input.consents.renewal);
    this.assertCurrentConsent("CONSENT_IMMEDIATE_START", input.locale, input.consents.immediateStart);
    const email = await this.deps.accountEmail.read(input.userId);

    const prepared = await this.deps.repository.withTransaction(async (client): Promise<Prepared> => {
      await this.deps.jobs.lockOwner(client, input.ownerRef);
      // P15: an erasure scheduled while the quote was open refuses the checkout itself, under the owner lock.
      if (await this.deps.repository.ownerErasurePending(input.ownerRef, client)) {
        throw new BillingRefusal(409, "ACCOUNT_ERASURE_PENDING");
      }
      // Every read under the lock runs on this transaction's connection (P1b's trailing executor): a read on the pool
      // would wait for a second connection while this one is held.
      const existing = await this.deps.repository.subscriptionForOwner(input.ownerRef, client);
      if (existing !== null && LIVE_SUBSCRIPTION_STATUSES.has(existing.status)) {
        throw new BillingRefusal(409, "ALREADY_SUBSCRIBED");
      }
      if (existing !== null && existing.status === "CREATED") {
        // D7 #5: a fresh payment on its way is answered CHECKOUT_PENDING, before any reuse or abandonment.
        await this.assertNoPaymentUnderway(client, existing, input.now);
        const reusable = await this.reusableCharge(client, existing, quote, location, input.now);
        const known = reusable === null ? null : await this.deps.repository.customerByOwner(input.ownerRef, undefined, client);
        if (reusable !== null && known !== null) {
          // Spec §2.5.3 step 2, §2.3: this checkout's consents are recorded even when its charge is the open one.
          await this.deps.acceptances.record(client, this.consentRows(input));
          return { chargeId: reusable.chargeId, customerId: known.customerId, totalMicros: reusable.totalMicros, planId: existing.planId, reused: true };
        }
        await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(
          existing, "ENDED", input.now, { cause: "ABANDONED", reason: "NEW_CHECKOUT" }
        ));
      }
      const chargeId = (this.deps.chargeIds ?? newChargeId)();
      await this.deps.acceptances.record(client, this.consentRows(input));
      // R-14: a customer id belongs to one xMoney environment; a switch from stage to live creates a new one.
      const customer = await this.deps.repository.ensureCustomer(client, {
        ownerRef: input.ownerRef, locale: input.locale, now: input.now, environment: this.deps.xmoneyEnvironment
      });
      let xmoneyCustomerId = customer.xmoneyCustomerId;
      if (xmoneyCustomerId === null) {
        const created = await this.deps.xmoney.createCustomer({
          identifier: customer.customerId, email, country: location.country
        }).catch((error: unknown) => this.providerRefusal(error));
        xmoneyCustomerId = created.customerId;
        await this.deps.repository.setXMoneyCustomerId(client, customer.customerId, xmoneyCustomerId, this.deps.xmoneyEnvironment);
      }
      const profile = sealBillingProfile(this.deps.recordsKey, customer.customerId, {
        email, locale: input.locale, name: location.company?.name ?? location.name, country: location.country,
        region: location.region, postalCode: location.postalCode, city: location.city, street: location.street,
        company: location.company
      });
      await this.deps.repository.appendProfile(client, {
        customerId: customer.customerId, at: input.now, locale: input.locale,
        profileCiphertext: profile.ciphertext, keyId: profile.keyId
      });
      const subscriptionId = randomUUID();
      await this.deps.repository.appendSubscriptionEvent(client, {
        eventId: randomUUID(), subscriptionId, ownerRef: input.ownerRef, kind: "CREATED", at: input.now,
        planId: quote.planId, periodAnchorAt: null, xmoneyOrderId: null, xmoneyCustomerId, cardRef: null,
        data: {
          country_confirmed: place.kind === "CONFIRM_COUNTRY", ip_country: place.ipCountry, quote_id: quote.quoteId,
          // D5 5h: the xMoney system this subscription's order, customer and card ids belong to (P1a CHECK, P2 fold).
          xmoney_environment: this.deps.xmoneyEnvironment
        }
      });
      // Provisional: the paid period starts at activation (P9b anchors it there).
      const month = computeWindows(input.now, input.now).month;
      const charge: ChargeRow = Object.freeze({
        chargeId, ownerRef: input.ownerRef, subscriptionId, kind: "INITIAL", attempt: 1, periodStart: month.start,
        periodEnd: month.end, quoteId: quote.quoteId, netMicros: quote.netMicros, taxMicros: quote.taxMicros,
        totalMicros: quote.totalMicros, currency: "USD", createdAt: input.now, xmoneyEnvironment: this.deps.xmoneyEnvironment
      });
      await this.deps.repository.insertCharge(client, charge);
      await this.deps.repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", input.now, {
        xmoneyTransactionId: null, amountMicros: charge.totalMicros, errorCode: null
      }));
      // A3(a), after the charge row it references: a second use of this quote rolls the whole checkout back.
      if (await this.deps.repository.useQuote(client, { quoteId: quote.quoteId, usedAt: input.now, chargeId }) === "ALREADY_USED") {
        throw new BillingRefusal(409, "QUOTE_EXPIRED");
      }
      return { chargeId, customerId: customer.customerId, totalMicros: charge.totalMicros, planId: quote.planId, reused: false };
    });

    const signed = this.signEmbeddedOrder({
      chargeId: prepared.chargeId, customerIdentifier: prepared.customerId, email, country: location.country,
      amountMicros: prepared.totalMicros, purpose: { kind: "ORDER_PLAN", planId: prepared.planId }, locale: input.locale,
      cardTransactionMode: "authAndCapture", returnPath: "/checkout/return"
    });
    this.deps.audit("billing.checkout.started", { planId: prepared.planId, country: location.country, reused: prepared.reused });
    return Object.freeze({
      chargeId: prepared.chargeId, publicKey: signed.publicKey, orderPayload: signed.orderPayload,
      orderChecksum: signed.orderChecksum, sdkEnvironment: signed.xmoneyEnvironment, reused: prepared.reused
    });
  }

  /** Spec §2.5.3 steps 5–6: the order JSON, base64, signed with the private key; the card is saved for rebills. */
  signEmbeddedOrder(input: EmbeddedOrderInput): SignedEmbeddedOrder {
    const text = this.deps.orderText ?? englishOrderText;
    const description = input.purpose.kind === "ORDER_PLAN"
      ? text("ORDER_PLAN", input.locale, { plan: planName(input.purpose.planId) })
      : text("CARD_CHECK", input.locale, {});
    const order: XMoneyEmbeddedOrder = {
      publicKey: this.deps.xmoneyPublicKey,
      siteId: this.deps.siteId,
      customer: { identifier: input.customerIdentifier, email: input.email, country: input.country },
      order: {
        orderId: input.chargeId, type: "managed", amount: microsToDecimal(input.amountMicros), currency: "USD",
        description
      },
      cardTransactionMode: input.cardTransactionMode,
      saveCard: true,
      backUrl: new URL(`${input.returnPath}?charge=${input.chargeId}`, this.deps.publicAppUrl).toString()
    };
    const signed = signOrderPayload(order, this.deps.xmoneyPrivateKey);
    return Object.freeze({
      publicKey: this.deps.xmoneyPublicKey, orderPayload: signed.payload, orderChecksum: signed.checksum,
      xmoneyEnvironment: this.deps.xmoneyEnvironment
    });
  }

  private assertCurrentConsent(kind: ConsentKind, locale: string, pair: ConsentPair): void {
    const current = this.deps.consentDocuments(kind, locale);
    if (current === null || current.version !== pair.version || current.sha256 !== pair.sha256) {
      throw new BillingRefusal(409, "LEGAL_DOCUMENT_STALE");
    }
  }

  private consentRows(input: CheckoutInput): AcceptanceInput[] {
    const row = (kind: "RENEWAL_TERMS" | "IMMEDIATE_START", pair: ConsentPair): AcceptanceInput => {
      const acceptanceId = randomUUID();
      const evidence = sealAcceptanceEvidence(this.deps.recordsKey, acceptanceId, { ip: input.ip, userAgent: input.userAgent.slice(0, 512) });
      return Object.freeze({
        acceptanceId, ownerRef: input.ownerRef, kind, documentVersion: pair.version, documentSha256: pair.sha256,
        locale: input.locale, surface: "CHECKOUT", acceptedAt: input.now, evidenceCiphertext: evidence.evidenceCiphertext,
        keyId: evidence.keyId
      });
    };
    return [row("RENEWAL_TERMS", input.consents.renewal), row("IMMEDIATE_START", input.consents.immediateStart)];
  }

  /**
   * A3(b): the same open charge, when it is young, for the same plan and total, in this xMoney system (a stage order
   * cannot be paid at live, R-14), has no outcome yet, and is for an unchanged purchase: its own quote has the same tax
   * country and the same declared buyer (name, country, region, postal code, city, street and company). The quote's
   * `ip` and `ipCountry` are quote-time evidence and are not compared. A changed purchase is not reused, so the
   * caller abandons the open checkout and makes a new charge, profile and order from what the person last declared.
   * Read through the checkout transaction's `client`.
   */
  private async reusableCharge(
    client: PoolClient, existing: SubscriptionState, quote: QuoteRow, location: QuoteLocation, now: Date
  ): Promise<ChargeRow | null> {
    const reuseWindowMs = 30 * 60_000;
    const events = await this.deps.repository.subscriptionEvents(existing.subscriptionId, client);
    const created = events.find((event) => event.kind === "CREATED");
    if (created === undefined || now.getTime() - created.at.getTime() >= reuseWindowMs) return null;
    if (existing.planId !== quote.planId) return null;
    const initial = (await this.deps.repository.chargesForSubscription(existing.subscriptionId, client))
      .find((charge) => charge.kind === "INITIAL");
    if (initial === undefined || initial.totalMicros !== quote.totalMicros) return null;
    if (initial.xmoneyEnvironment !== this.deps.xmoneyEnvironment) return null;
    const opened = initial.quoteId === null ? null : await this.deps.repository.quote(initial.quoteId, existing.ownerRef, client);
    if (opened === null || opened.taxCountry !== quote.taxCountry) return null;
    const declared = openQuoteLocation(this.deps.recordsKey, opened.quoteId, opened.locationCiphertext);
    if (!samePurchaser(declared, location)) return null;
    const withEvents = await this.deps.repository.charge(initial.chargeId, client);
    if (withEvents === null || withEvents.events.some((event) => event.kind !== "REQUESTED")) return null;
    return initial;
  }

  /**
   * D7 #5 (narrowed): whether a payment for the open checkout's INITIAL charge may still be on its way (paid in
   * another tab, or still in 3-D Secure). Signing that order again would let the person pay twice; abandoning it
   * would refund a plan they bought. Evidence, cheapest first: a stored notice naming the charge, or an open
   * VERIFY_PAYMENT job for it (`checkoutPaymentSignals`), then an xMoney transaction for it (listed by creation date
   * from the charge's `created_at`, matched on `externalOrderId`) that is not `complete-failed`. A transaction the
   * charge already recorded as FAILED (a decline, a void) is not on its way. A not-final attempt (a notice, a check
   * retried as PAYMENT_NOT_FINAL, a listed `start` / `in-progress` / `3d-pending` transaction) counts only while
   * `inFlightAttemptFresh`: a person who closed the bank's window must not be locked out until xMoney finalises it.
   * Any evidence: 409 CHECKOUT_PENDING naming the charge. Every read goes through the checkout's `client`.
   */
  private async assertNoPaymentUnderway(client: PoolClient, existing: SubscriptionState, now: Date): Promise<void> {
    const initial = (await this.deps.repository.chargesForSubscription(existing.subscriptionId, client))
      .find((charge) => charge.kind === "INITIAL");
    if (initial === undefined) return;
    const pending = new BillingRefusal(409, "CHECKOUT_PENDING", initial.chargeId);
    const notFinalSince = new Date(now.getTime() - inFlightAttemptLifeMs());
    if (await this.deps.jobs.checkoutPaymentSignals(client, initial.chargeId, initial.xmoneyEnvironment, notFinalSince)) {
      throw pending;
    }
    // The xMoney this API talks to lists only its own system's transactions.
    if (initial.xmoneyEnvironment !== this.deps.xmoneyEnvironment) return;
    const failed = new Set(((await this.deps.repository.charge(initial.chargeId, client))?.events ?? [])
      .filter((event) => event.kind === "FAILED" && event.xmoneyTransactionId !== null)
      .map((event) => event.xmoneyTransactionId));
    const rejected = rejectedRows(this.deps.audit, "checkout");
    const listed = await this.deps.xmoney.listTransactions({
      from: initial.createdAt, to: now, dateType: "creation", onRejected: rejected.onRejected
    }).catch((error: unknown) => this.providerRefusal(error));
    rejected.report();
    if (listed.some((transaction) => transaction.externalOrderId === initial.chargeId
      && transaction.status !== "complete-failed" && !failed.has(transaction.transactionId)
      && (!NOT_FINAL_STATUSES.has(transaction.status) || inFlightAttemptFresh(transaction.createdAt, now)))) {
      throw pending;
    }
  }
}
