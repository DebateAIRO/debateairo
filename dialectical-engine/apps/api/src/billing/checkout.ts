import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { computeWindows, type CardPayments, type Payer, type PaymentReport, type SubscriptionState } from "@debateai/billing-core";
import type {
  AcceptanceInput, AcceptanceRepository, BillingJobQueries, BillingRepository, ChargeEventRow, ChargeRow, QuoteRow
} from "@debateai/db";
import type { GeoLookup } from "@debateai/geo";
import { netopiaLanguageOf, statusToState } from "@debateai/payments-netopia";
import type { BillingPolicy, CountryPolicy, PlanId } from "@debateai/register";
import { sealAcceptanceEvidence } from "../legal.js";
import type { AccountEmailReader } from "./account-email.js";
import type { BillingAudit } from "./audit.js";
import { bestPaymentId, paidOrAlmost, readPaymentStatus, startHostedCharge, stillPayable } from "./hosted-payment.js";
import { clientIdOf, netopiaNotifyUrl, payerFromProfile, paymentReturnUrl } from "./netopia-payer.js";
import { englishOrderText, planName, type BillingOrderText } from "./order-text.js";
import { isThisPaymentSystem } from "./outbox.js";
import { decidePaymentPlace, placeRefusal } from "./place.js";
import { addressRequired, LIVE_SUBSCRIPTION_STATUSES } from "./quote.js";
import {
  openPaymentUrl, openQuoteLocation, sealBillingProfile, type BillingProfile, type QuoteLocation
} from "./records.js";
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

/** Spec §2.6.2 step 7: where the page sends the browser (a top-level navigation), and which NETOPIA it is. */
export type CheckoutResult = Readonly<{
  chargeId: string;
  redirectUrl: string;
  environment: "sandbox" | "live";
  reused: boolean;
}>;

export interface CheckoutServicePort {
  start(input: CheckoutInput): Promise<CheckoutResult>;
}

export type CheckoutDeps = Readonly<{
  repository: Pick<BillingRepository,
    | "withTransaction" | "quote" | "subscriptionForOwner" | "subscriptionEvents" | "chargesForSubscription" | "charge"
    | "appendSubscriptionEvent" | "useQuote" | "ensureCustomer" | "appendProfile" | "insertCharge" | "appendChargeEvent"
    | "ownerErasurePending" | "insertHostedPayment" | "hostedPaymentForCharge" | "newestNoticeForOrder"
    | "insertStatusRead" | "enqueue">;
  jobs: Pick<BillingJobQueries, "lockOwner" | "outboxJobExists">;
  acceptances: Pick<AcceptanceRepository, "record">;
  /** N8's connector; its `environment` is the payment environment (spec §2.4.1). */
  payments: CardPayments;
  accountEmail: AccountEmailReader;
  geo: GeoLookup;
  countryPolicy: CountryPolicy;
  policy: BillingPolicy;
  /** `currentDocument` from @debateai/legal-manifest in production. */
  consentDocuments: (kind: ConsentKind, locale: string) => ConsentPair | null;
  recordsKey: Buffer;
  /** R-7: PUBLIC_APP_URL. */
  publicAppUrl: string;
  audit: BillingAudit;
  chargeIds?: () => string;
  /** P17's catalogue sentence for the order line (spec §2.5.3 step 5); absent, `englishOrderText`. */
  orderText?: BillingOrderText;
}>;

/**
 * How long a not-final payment still counts as "almost paid" (D7 #5, spec §2.6.3): the life of a bank check a person may
 * still finish. A function, never an exported number.
 */
export function inFlightAttemptLifeMs(): number {
  return 20 * 60_000;
}

/** A3 (b): an open checkout is reused only while it is this young (from its CREATED event). */
function reuseWindowMs(): number {
  return 30 * 60_000;
}

/** A start whose page has not come back yet may still be on its way: above the 15-second start timeout (§2.4.1). */
export function hostedStartInFlightMs(): number {
  return 60_000;
}

/**
 * The open INITIAL charge's events; NETOPIA's newest stored message; the read made before the lock (null: none for this
 * charge); when the stored payment URL came back (null: no page reached anyone); A3 (b)'s same purchase; the CREATED
 * time (the reuse window) and the charge's own (a start on its way).
 */
export type OpenCheckoutFacts = Readonly<{
  events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode">>;
  notice: Readonly<{ providerStatus: number | null; receivedAt: Date }> | null;
  read: PaymentReport | "NO_SUCH_ORDER" | "READ_FAILED" | null;
  hostedStartedAt: Date | null;
  samePurchase: boolean;
  createdAt: Date;
  chargeCreatedAt: Date;
  now: Date;
}>;
export type OpenCheckoutVerdict = "PENDING" | "REUSE" | "ABANDON";

/** Paid always counts; AUTHORIZED and NETOPIA's not-final 6, 13, 14, 18 (`paidOrAlmost`) only while `fresh`. */
function almostPaid(report: Pick<PaymentReport, "state" | "providerStatus">, fresh: boolean): boolean {
  return report.state === "PAID" || (fresh && paidOrAlmost(report));
}

/**
 * Spec §2.6.3's table. PENDING: paid or almost (409 CHECKOUT_PENDING, the waiting screen), a status read that failed,
 * or a start still on its way. REUSE: young, the same purchase, a stored payment URL, and `stillPayable` (untouched,
 * declined: the person may retry on the same page, or waiting for the bank's check). ABANDON: everything else —
 * older, another purchase, no stored URL, an order NETOPIA does not know, or a final failure.
 */
export function classifyOpenCheckout(facts: OpenCheckoutFacts): OpenCheckoutVerdict {
  if (facts.events.some((event) => event.kind === "SUCCEEDED")) return "PENDING";
  if (facts.events.some((event) => event.kind === "FAILED" && event.errorCode !== "PAYMENT_DECLINED")) return "ABANDON";
  const now = facts.now.getTime();
  if (facts.hostedStartedAt === null) {
    const unknown = facts.events.some((event) => event.kind === "SUBMIT_UNKNOWN");
    return !unknown && now - facts.chargeCreatedAt.getTime() < hostedStartInFlightMs() ? "PENDING" : "ABANDON";
  }
  const since = Math.max(facts.hostedStartedAt.getTime(), facts.notice?.receivedAt.getTime() ?? 0);
  const fresh = now - since < inFlightAttemptLifeMs();
  const noticeStatus = facts.notice?.providerStatus ?? null;
  if (noticeStatus !== null
    && almostPaid({ state: statusToState(noticeStatus), providerStatus: String(noticeStatus) }, fresh)) return "PENDING";
  if (facts.read === null || facts.read === "READ_FAILED") return "PENDING";
  if (facts.read === "NO_SUCH_ORDER") return "ABANDON";
  if (almostPaid(facts.read, fresh)) return "PENDING";
  const young = now - facts.createdAt.getTime() < reuseWindowMs();
  return stillPayable(facts.read) && young && facts.samePurchase ? "REUSE" : "ABANDON";
}

/** Whether two quotes declare the same buyer (A3 (b)); `ip` and `ipCountry` are quote-time evidence, not the buyer. */
function samePurchaser(a: QuoteLocation, b: QuoteLocation): boolean {
  const sameCompany = a.company === null || b.company === null
    ? a.company === b.company
    : a.company.name === b.company.name && a.company.vatId === b.company.vatId
      && a.company.address === b.company.address && a.company.vatValidated === b.company.vatValidated;
  return a.name === b.name && a.firstName === b.firstName && a.lastName === b.lastName && a.phone === b.phone
    && a.country === b.country && a.region === b.region && a.postalCode === b.postalCode && a.city === b.city
    && a.street === b.street && sameCompany;
}

/** The read before the lock, for the open charge it was made for. */
type OpenPaymentRead = Readonly<{ chargeId: string; read: PaymentReport | "NO_SUCH_ORDER" | "READ_FAILED" }>;

type Verdict =
  | Readonly<{ kind: "PENDING"; chargeId: string }>
  | Readonly<{ kind: "REUSE"; chargeId: string; redirectUrl: string }>
  | Readonly<{ kind: "ABANDON" }>;

type Prepared =
  | Readonly<{ kind: "REUSE"; chargeId: string; redirectUrl: string; planId: PlanId }>
  | Readonly<{ kind: "START"; chargeId: string; customerId: string; totalMicros: number; planId: PlanId; payer: Payer }>;
type StartPrepared = Extract<Prepared, { kind: "START" }>;

export class CheckoutService implements CheckoutServicePort {
  constructor(private readonly deps: CheckoutDeps) {}

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
    // P2-I6: NETOPIA's status is read before the owner lock (a network call never holds it); our rows are re-read under it.
    const glimpse = await this.readOpenPayment(input.ownerRef, input.now);

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
        const verdict = await this.openCheckoutVerdict(client, existing, quote, location, glimpse, input.now);
        if (verdict.kind === "PENDING") throw new BillingRefusal(409, "CHECKOUT_PENDING", verdict.chargeId);
        if (verdict.kind === "REUSE") {
          // This checkout's consents are recorded even when its charge is the open one (spec 2026-09-29 §2.5.3 step 2).
          await this.deps.acceptances.record(client, this.consentRows(input));
          return { kind: "REUSE", chargeId: verdict.chargeId, redirectUrl: verdict.redirectUrl, planId: existing.planId };
        }
        await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(
          existing, "ENDED", input.now, { cause: "ABANDONED", reason: "NEW_CHECKOUT" }
        ));
      }
      const chargeId = (this.deps.chargeIds ?? newChargeId)();
      await this.deps.acceptances.record(client, this.consentRows(input));
      // Spec §2.6.2 step 2: NETOPIA has no customer object; our own customer is the client id's source (§2.6.4).
      const customer = await this.deps.repository.ensureCustomer(client, {
        ownerRef: input.ownerRef, locale: input.locale, now: input.now
      });
      const profile: BillingProfile = {
        email, locale: input.locale, name: location.company?.name ?? location.name, firstName: location.firstName,
        lastName: location.lastName, phone: location.phone, paymentIp: input.ip === "unknown" ? null : input.ip,
        country: location.country, region: location.region, postalCode: location.postalCode, city: location.city,
        street: location.street, company: location.company
      };
      const payer = payerFromProfile(profile, email);
      if (payer === null) throw new BillingRefusal(422, "BILLING_ADDRESS_REQUIRED");
      const sealed = sealBillingProfile(this.deps.recordsKey, customer.customerId, profile);
      await this.deps.repository.appendProfile(client, {
        customerId: customer.customerId, at: input.now, locale: input.locale,
        profileCiphertext: sealed.ciphertext, keyId: sealed.keyId
      });
      const environment = this.deps.payments.environment;
      const subscriptionId = randomUUID();
      await this.deps.repository.appendSubscriptionEvent(client, {
        eventId: randomUUID(), subscriptionId, ownerRef: input.ownerRef, kind: "CREATED", at: input.now,
        planId: quote.planId, periodAnchorAt: null, cardTokenId: null,
        data: {
          country_confirmed: place.kind === "CONFIRM_COUNTRY", ip_country: place.ipCountry, quote_id: quote.quoteId,
          // Spec §2.5.5: the payment system this subscription's charges and saved card belong to.
          payment_provider: "netopia", payment_environment: environment
        }
      });
      // Provisional: the paid period starts at activation (P9b anchors it there).
      const month = computeWindows(input.now, input.now).month;
      const charge: ChargeRow = Object.freeze({
        chargeId, ownerRef: input.ownerRef, subscriptionId, kind: "INITIAL", attempt: 1, periodStart: month.start,
        periodEnd: month.end, quoteId: quote.quoteId, netMicros: quote.netMicros, taxMicros: quote.taxMicros,
        totalMicros: quote.totalMicros, currency: "USD", createdAt: input.now,
        paymentProvider: "netopia", paymentEnvironment: environment
      });
      await this.deps.repository.insertCharge(client, charge);
      await this.deps.repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", input.now, {
        providerPaymentId: null, amountMicros: charge.totalMicros, errorCode: null
      }));
      // A3 (a), after the charge row it references: a second use of this quote rolls the whole checkout back.
      if (await this.deps.repository.useQuote(client, { quoteId: quote.quoteId, usedAt: input.now, chargeId }) === "ALREADY_USED") {
        throw new BillingRefusal(409, "QUOTE_EXPIRED");
      }
      return { kind: "START", chargeId, customerId: customer.customerId, totalMicros: charge.totalMicros, planId: quote.planId, payer };
    });

    const redirectUrl = prepared.kind === "REUSE" ? prepared.redirectUrl : await this.startPayment(prepared, input);
    this.deps.audit("billing.checkout.started", { planId: prepared.planId, country: location.country, reused: prepared.kind === "REUSE" });
    return Object.freeze({
      chargeId: prepared.chargeId, redirectUrl, environment: this.deps.payments.environment, reused: prepared.kind === "REUSE"
    });
  }

  /**
   * Spec §2.6.2 steps 5–8 through N12's `startHostedCharge` (ruling PR-18): the request is built first (a bug there
   * sends nothing); then the sealed URL + SUBMITTED in one transaction, or FAILED / SUBMIT_UNKNOWN and the 503 (an
   * O3 for our own setup or key). No lock and no pool connection is held across the call.
   */
  private async startPayment(prepared: StartPrepared, input: CheckoutInput): Promise<string> {
    const text = this.deps.orderText ?? englishOrderText;
    const environment = this.deps.payments.environment;
    return startHostedCharge({
      billing: this.deps.repository, jobs: this.deps.jobs, payments: this.deps.payments, paymentEnvironment: environment,
      recordsKey: this.deps.recordsKey, audit: this.deps.audit
    }, {
      operation: "checkout", now: input.now,
      start: {
        orderId: prepared.chargeId, amountMicros: prepared.totalMicros, currency: "USD",
        description: text("ORDER_PLAN", input.locale, { plan: planName(prepared.planId) }), payer: prepared.payer,
        clientId: clientIdOf(prepared.customerId),
        returnUrl: paymentReturnUrl(this.deps.publicAppUrl, "/checkout/return", prepared.chargeId),
        notifyUrl: netopiaNotifyUrl(this.deps.publicAppUrl), language: netopiaLanguageOf(input.locale)
      }
    });
  }

  /**
   * Spec §2.6.3 before the lock: one status read (N12's `readPaymentStatus`, which logs it in `billing.status_read`,
   * §2.14) for an opened, undecided NETOPIA charge of this environment. Null: no open checkout, or nothing to read
   * (no page was opened, or our rows already decide it).
   */
  private async readOpenPayment(ownerRef: string, now: Date): Promise<OpenPaymentRead | null> {
    const existing = await this.deps.repository.subscriptionForOwner(ownerRef);
    if (existing === null || existing.status !== "CREATED") return null;
    const initial = (await this.deps.repository.chargesForSubscription(existing.subscriptionId))
      .find((charge) => charge.kind === "INITIAL");
    if (initial === undefined || !this.servedHere(initial)) return null;
    const events = (await this.deps.repository.charge(initial.chargeId))?.events ?? [];
    if (events.some((event) => event.kind === "SUCCEEDED" || (event.kind === "FAILED" && event.errorCode !== "PAYMENT_DECLINED"))) {
      return null;
    }
    // SUBMITTED and the stored page are written in one transaction: no SUBMITTED, no page anyone could pay.
    const providerPaymentId = bestPaymentId(events, null);
    if (providerPaymentId === null) return null;
    const { answer } = await readPaymentStatus({ billing: this.deps.repository, payments: this.deps.payments, audit: this.deps.audit }, {
      chargeId: initial.chargeId, providerPaymentId, operation: "checkout", now
    });
    return Object.freeze({ chargeId: initial.chargeId, read: answer === "UNREADABLE" ? "READ_FAILED" : answer });
  }

  /** Spec §2.5.4: a NETOPIA charge of the environment this API pays in (another system's checkout is never paid here). */
  private servedHere(charge: Pick<ChargeRow, "paymentProvider" | "paymentEnvironment">): boolean {
    return isThisPaymentSystem(charge, this.deps.payments.environment);
  }

  /** Spec §2.6.3 under the owner lock: the open checkout's charge, from its rows and the read made before the lock. */
  private async openCheckoutVerdict(
    client: PoolClient, existing: SubscriptionState, quote: QuoteRow, location: QuoteLocation,
    glimpse: OpenPaymentRead | null, now: Date
  ): Promise<Verdict> {
    const initial = (await this.deps.repository.chargesForSubscription(existing.subscriptionId, client))
      .find((charge) => charge.kind === "INITIAL");
    // A checkout of another payment system is never paid here: it is abandoned (spec §2.5.4).
    if (initial === undefined || !this.servedHere(initial)) return { kind: "ABANDON" };
    const events = (await this.deps.repository.charge(initial.chargeId, client))?.events ?? [];
    const hosted = await this.deps.repository.hostedPaymentForCharge(client, initial.chargeId);
    const notice = await this.deps.repository.newestNoticeForOrder(client, initial.chargeId);
    const created = (await this.deps.repository.subscriptionEvents(existing.subscriptionId, client))
      .find((event) => event.kind === "CREATED");
    const verdict = classifyOpenCheckout({
      events, notice: notice === null ? null : { providerStatus: notice.providerStatus, receivedAt: notice.receivedAt },
      // A read made for another charge than the one open now (it changed under the lock) counts as failed.
      read: glimpse !== null && glimpse.chargeId === initial.chargeId ? glimpse.read : null,
      hostedStartedAt: hosted?.startedAt ?? null,
      samePurchase: await this.samePurchase(client, existing, initial, quote, location),
      createdAt: created?.at ?? initial.createdAt, chargeCreatedAt: initial.createdAt, now
    });
    if (verdict === "PENDING") return { kind: "PENDING", chargeId: initial.chargeId };
    if (verdict === "REUSE" && hosted !== null) {
      return {
        kind: "REUSE", chargeId: initial.chargeId,
        redirectUrl: openPaymentUrl(this.deps.recordsKey, initial.chargeId, hosted.redirectCiphertext)
      };
    }
    return { kind: "ABANDON" };
  }

  /**
   * A3 (b): the same plan and total, and the open charge's own quote has the same tax country and declared buyer
   * (names, phone, country, region, postal code, city, street and company). Read through the checkout's `client`.
   */
  private async samePurchase(
    client: PoolClient, existing: SubscriptionState, initial: ChargeRow, quote: QuoteRow, location: QuoteLocation
  ): Promise<boolean> {
    if (existing.planId !== quote.planId || initial.totalMicros !== quote.totalMicros) return false;
    const opened = initial.quoteId === null ? null : await this.deps.repository.quote(initial.quoteId, existing.ownerRef, client);
    if (opened === null || opened.taxCountry !== quote.taxCountry) return false;
    return samePurchaser(openQuoteLocation(this.deps.recordsKey, opened.quoteId, opened.locationCiphertext), location);
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
}
