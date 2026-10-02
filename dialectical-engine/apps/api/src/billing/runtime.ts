import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ReadableUserDekStore } from "@debateai/crypto";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { GeoLookup } from "@debateai/geo";
import { currentDocument } from "@debateai/legal-manifest";
import { TypedDomainError } from "@debateai/kernel";
import { decryptNotice } from "@debateai/payments-xmoney";
import type { BillingPlans, BillingPolicy, CountryPolicy } from "@debateai/register";
import { createSingleFlightErasureReconciler } from "../account-erasure.js";
import { DekAccountEmailReader } from "./account-email.js";
import type { BillingAudit } from "./audit.js";
import { CancelLinkService } from "./cancel-link.js";
import { createCardCheckSettlement } from "./card-change.js";
import { ChargeStatusReader } from "./charge-status.js";
import { CheckoutService } from "./checkout.js";
import type { BillingConnectors } from "./connectors.js";
import { createEmailJobHandler, type AttachmentResolver, type BillingAttachmentKind, type BillingMailPort } from "./email-job.js";
import { BillingErasureHook, erasurePendingOf, reconcileWork } from "./erasure-hook.js";
import type { BillingLegalGate, BillingRouteOptions } from "./index.js";
import { createQuadernoRefundHandler, createQuadernoSaleHandler } from "./invoice-quaderno.js";
import { createSmartBillInvoiceHandler, createSmartBillStornoHandler, smartBillPdfResolver } from "./invoice-smartbill.js";
import { BillingMaintenance } from "./maintenance.js";
import { NoticeIntake } from "./notice-intake.js";
import { BillingOutboxWorker } from "./outbox.js";
import { QuoteService } from "./quote.js";
import { BillingReconciler } from "./reconcile.js";
import { RefundDesk } from "./refunds.js";
import { RenewalService } from "./renewal.js";
import { createRenewalNoticeHandler } from "./renewal-notice-job.js";
import { createInitialSettlement } from "./settlement-initial.js";
import { createRenewalSettlement } from "./settlement-renewal.js";
import { createCoalescingSingleFlight } from "./single-flight.js";
import type { SubscriptionRouteDeps } from "./subscription-deps.js";
import { createUpgradeSettlement } from "./upgrade.js";
import { VerifyPaymentHandler } from "./verify-payment.js";

/**
 * Everything billing needs, composed once in apps/api/src/main.ts, and only when hosted with billing on (P6a builds
 * `connectors` exactly then). Later tasks register their handlers and routes HERE, so main.ts is edited only where a
 * new runtime input is needed. The public origin of every link (R-7) is `connectors.publicAppUrl`, the one source
 * of that setting (A22).
 */
export type BillingRuntimeDeps = Readonly<{
  pool: Pool;
  connectors: BillingConnectors;
  policy: BillingPolicy;
  plans: BillingPlans;
  countryPolicy: CountryPolicy;
  geo: GeoLookup;
  /** L4's re-acceptance answer (main.ts's `legal`): billing routes refuse LEGAL_REACCEPTANCE_REQUIRED. */
  legal: BillingLegalGate;
  dekStore: ReadableUserDekStore;
  /** P17 supplies the sender and the Terms / withdrawal-form resolvers; until then EMAIL jobs wait in the queue. */
  mail: Readonly<{ sender: BillingMailPort; attachments: ReadonlyMap<BillingAttachmentKind, AttachmentResolver> }> | undefined;
  audit: BillingAudit;
  clock: () => Date;
  reportPending: (code: string) => void;
  /**
   * R-35: inputs later tasks need, declared here once and passed by main.ts in the task that uses them:
   * P12d the owner's spend (B3's `readOwnerSpentMicros`), P13 the sign-up blind-index key and the identity lookup,
   * P16c the `taxAuthorities` row (P16a's `TaxAuthorities` type).
   */
  ownerSpend?: Readonly<{ readOwnerSpentMicros(ownerRef: string, from: Date, to: Date): Promise<number> }>;
  blindIndexKey?: Uint8Array;
  identities?: Readonly<{ ownerRefByEmailBlindIndex(emailBlindIndex: Buffer): Promise<string | null> }>;
  taxAuthorities?: unknown;
}>;

export type BillingRuntime = Readonly<{
  outbox: BillingOutboxWorker;
  /** P8c: the checkout; P12e signs its card-check order with `checkout.signEmbeddedOrder` (R-17). */
  checkout: CheckoutService;
  /** P8a onward: the billing routes' members this runtime composes (main.ts's `billingRouteOptions`). */
  routes: BillingRouteOptions;
  /** P9b: VERIFY_PAYMENT; P11a and P12 register their charge kinds' settlements on it. */
  verify: VerifyPaymentHandler;
  /** P9b (R-32): the one refund executor; P12d and P12e move money back through it. */
  refunds: RefundDesk;
  /** P11a: the renewal timer's service; P11b's maintenance pass and P12 reuse its writers. */
  renewal: RenewalService;
  /**
   * P11b: the maintenance pass on the renewal timer, at most once every 10 minutes (dunning retries, the period-end
   * endings, R-33's abandoned-checkout sweep, the yearly reminder and the look-ahead notice). P23's whole-flow
   * harness drives it directly.
   */
  maintenance: BillingMaintenance;
  /**
   * P15: stops an owner's billing when an account erasure is scheduled (the route's hook) and, on the reconciler's
   * 10-minute tick, sweeps every owner whose erasure is pending or finished, or whose account the age gate froze.
   */
  erasure: BillingErasureHook;
  kick(): void;
  start(): void;
  stop(): void;
}>;

/** A runtime input main.ts must supply once billing is on; billing never runs half-composed. */
function required<T>(value: T | undefined, member: string): T {
  if (value === undefined) {
    throw new TypedDomainError("BILLING_CONFIGURATION_INCOMPLETE", `createBillingRuntime needs ${member}`);
  }
  return value;
}

export function createBillingRuntime(deps: BillingRuntimeDeps): BillingRuntime {
  const repository = new BillingRepository(deps.pool);
  const jobs = new BillingJobQueries(deps.pool);
  // P9b's INITIAL settlement reads the accepted Terms from the same repository.
  const acceptances = new AcceptanceRepository(deps.pool);
  const outbox = new BillingOutboxWorker({
    repository, workerId: `billing-api-${process.pid}-${randomUUID()}`, clock: deps.clock, audit: deps.audit,
    batchSize: 20
  });
  const entitlements = new EntitlementRepository(deps.pool);
  const refunds = new RefundDesk({
    repository, jobs, xmoney: deps.connectors.xmoney, policy: deps.policy, audit: deps.audit, clock: deps.clock
  });
  outbox.register("XMONEY_REFUND", refunds.handle);
  const verify = new VerifyPaymentHandler({
    repository, jobs, xmoney: deps.connectors.xmoney, refunds, entitlements, countryPolicy: deps.countryPolicy,
    policy: deps.policy, recordsKey: deps.connectors.recordsKey, audit: deps.audit,
    xmoneyEnvironment: deps.connectors.xmoneyEnvironment
  });
  verify.registerSettlement("INITIAL", createInitialSettlement({
    repository, entitlements, acceptances, policy: deps.policy, publicAppUrl: deps.connectors.publicAppUrl
  }));
  const renewalSettlement = createRenewalSettlement({
    repository, entitlements, policy: deps.policy, publicAppUrl: deps.connectors.publicAppUrl
  });
  verify.registerSettlement("RENEWAL", renewalSettlement);
  // P12c: a paid upgrade changes the plan only here, inside VERIFY_PAYMENT's one transaction (A3f).
  verify.registerSettlement("UPGRADE", createUpgradeSettlement({ repository, entitlements, plans: deps.plans }));
  // P12e (A12): a card change's paid hold moves the order and the card only here, then RefundDesk releases it.
  verify.registerSettlement("CARD_CHECK", createCardCheckSettlement({
    repository, recordsKey: deps.connectors.recordsKey, countryPolicy: deps.countryPolicy, audit: deps.audit
  }));
  // P11a: `drain` is declared below; the kick only runs once a tick does. P15 (R-34): `erasurePending` over
  // `billing.owner_erasure_pending`, which answers true for a pending or finished erasure and for an `age_frozen`
  // owner (R3-2); P11b's maintenance reuses this `renewal` and its `erasureBlocks`.
  const renewal = new RenewalService({
    repository, jobs, entitlements, xmoney: deps.connectors.xmoney, tax: deps.connectors.tax, settlement: renewalSettlement,
    policy: deps.policy, plans: deps.plans, recordsKey: deps.connectors.recordsKey,
    publicAppUrl: deps.connectors.publicAppUrl, audit: deps.audit, clock: deps.clock, kick: () => drain(),
    erasurePending: erasurePendingOf(repository),
    xmoneyEnvironment: deps.connectors.xmoneyEnvironment
  });
  const maintenance = new BillingMaintenance({
    repository, jobs, entitlements, renewal, policy: deps.policy, publicAppUrl: deps.connectors.publicAppUrl,
    xmoneyEnvironment: deps.connectors.xmoneyEnvironment, audit: deps.audit, clock: deps.clock
  });
  outbox.register("RENEWAL_NOTICE", createRenewalNoticeHandler({ repository, jobs, renewal, policy: deps.policy }));
  let lastMaintenance = Number.NEGATIVE_INFINITY;
  const renewTick = createSingleFlightErasureReconciler(
    async () => {
      await renewal.runOnce();
      const now = deps.clock().getTime();
      if (now - lastMaintenance >= 10 * 60_000) {
        lastMaintenance = now;
        await maintenance.runOnce();
      }
    },
    () => deps.reportPending("BILLING_RENEWAL_PENDING")
  );
  outbox.register("VERIFY_PAYMENT", verify.handle);
  // P10a: the legal documents of a non-Romanian charge (spec §2.5.9). No `orderText` yet: the task that adds the
  // catalogue sentences passes its resolver here, as it does to the checkout below.
  const invoiceDeps = {
    repository, recordsKey: deps.connectors.recordsKey, policy: deps.policy, publicAppUrl: deps.connectors.publicAppUrl,
    audit: deps.audit
  };
  outbox.register("QUADERNO_RECORD_SALE", createQuadernoSaleHandler({ ...invoiceDeps, tax: deps.connectors.tax }));
  outbox.register("QUADERNO_RECORD_REFUND", createQuadernoRefundHandler({ ...invoiceDeps, tax: deps.connectors.tax }));
  const attachments = new Map<BillingAttachmentKind, AttachmentResolver>(deps.mail?.attachments ?? []);
  // P10b: the legal documents of a Romanian charge (spec §2.5.8, A17), and SmartBill's PDF on the RO receipt (A26b).
  // The EMAIL handler below holds this same `attachments` map, so the resolver is seen at send time.
  const smartbill = { ...invoiceDeps, jobs, issuer: deps.connectors.invoiceRo };
  outbox.register("SMARTBILL_INVOICE", createSmartBillInvoiceHandler(smartbill));
  outbox.register("SMARTBILL_STORNO", createSmartBillStornoHandler(smartbill));
  attachments.set("SMARTBILL_INVOICE_PDF", smartBillPdfResolver({ issuer: smartbill.issuer }));
  if (deps.mail !== undefined) {
    outbox.register("EMAIL", createEmailJobHandler({
      repository, recordsKey: deps.connectors.recordsKey, ownerReportEmail: deps.connectors.ownerReportEmail,
      mail: deps.mail.sender, attachments
    }));
  }
  // No `orderText` yet: until P17/P18 add the catalogue sentences the checkout signs `englishOrderText`'s line. The
  // task that adds the sentences passes its resolver here and to P10's invoice deps.
  const checkout = new CheckoutService({
    repository, jobs, acceptances, xmoney: deps.connectors.xmoney,
    accountEmail: new DekAccountEmailReader(deps.pool, deps.dekStore), geo: deps.geo, countryPolicy: deps.countryPolicy,
    policy: deps.policy, consentDocuments: (kind, locale) => currentDocument(kind, locale),
    recordsKey: deps.connectors.recordsKey, xmoneyPrivateKey: deps.connectors.xmoneyPrivateKey,
    xmoneyPublicKey: deps.connectors.xmoneyPublicKey, siteId: deps.connectors.siteId,
    publicAppUrl: deps.connectors.publicAppUrl, xmoneyEnvironment: deps.connectors.xmoneyEnvironment, audit: deps.audit
  });
  // P13 (A25): the emailed one-time cancel link. P12d's `required` refuses a composition without either input.
  const cancelLinks = new CancelLinkService({
    billing: repository, jobs, entitlements,
    identities: required(deps.identities, "identities"),
    blindIndexKey: required(deps.blindIndexKey, "blindIndexKey"),
    recordsKey: deps.connectors.recordsKey, mail: deps.mail?.sender,
    // R-7/A22: the one origin, P6a's `BillingConnectors.publicAppUrl`.
    publicAppUrl: deps.connectors.publicAppUrl,
    audit: deps.audit, clock: deps.clock
  });
  // P12b: the subscriber's routes (every later P12/P13 task adds to it).
  const subscription: SubscriptionRouteDeps = Object.freeze({
    billing: repository,
    jobs,
    entitlements,
    plans: deps.plans,
    policy: deps.policy,
    tax: deps.connectors.tax,
    recordsKey: deps.connectors.recordsKey,
    // R-7/A22: the one origin, P6a's; BillingRuntimeDeps carries no publicAppUrl of its own.
    publicAppUrl: deps.connectors.publicAppUrl,
    legal: deps.legal,
    audit: deps.audit,
    clock: deps.clock,
    // P12c: the upgrade's rebill, its xMoney system (D5 5h), checkout's country gate and the outbox kick (`drain` is
    // declared below; the kick only runs once an upgrade is submitted).
    xmoney: deps.connectors.xmoney,
    xmoneyEnvironment: deps.connectors.xmoneyEnvironment,
    countryPolicy: deps.countryPolicy,
    geo: deps.geo,
    kick: () => drain(),
    // P12d: the credit-used share of a withdrawal, and its refunds through the one executor (R-32).
    ownerSpend: required(deps.ownerSpend, "ownerSpend"),
    refunds,
    // P12e (R-17): the card change's order is built and signed by the checkout, for the account's own address.
    checkout,
    accountEmail: new DekAccountEmailReader(deps.pool, deps.dekStore),
    // P13: the two public cancel routes.
    cancelLinks
  });
  // P8b onward add their members to this object literal.
  const routes: BillingRouteOptions = Object.freeze({
    plans: deps.plans, legal: deps.legal, clock: deps.clock,
    quotes: new QuoteService({
      repository, tax: deps.connectors.tax, geo: deps.geo, countryPolicy: deps.countryPolicy, policy: deps.policy,
      plans: deps.plans, recordsKey: deps.connectors.recordsKey, audit: deps.audit
    }),
    checkout, charges: new ChargeStatusReader(repository),
    // P9a: `drain` is declared below; the kick only runs once a notice arrives.
    notices: new NoticeIntake({
      repository, decrypt: (value) => decryptNotice(value, deps.connectors.xmoneyPrivateKey), audit: deps.audit,
      clock: deps.clock, kick: () => drain(), xmoneyEnvironment: deps.connectors.xmoneyEnvironment
    }),
    subscription
  });
  const drain = createCoalescingSingleFlight(() => outbox.drain(10), () => deps.reportPending("BILLING_OUTBOX_PENDING"));
  // P14a: the money check against xMoney (A10's daily listings, A2's adoption) in this connectors' xMoney system.
  const reconciler = new BillingReconciler({
    billing: repository, jobs, xmoney: deps.connectors.xmoney, environment: deps.connectors.xmoneyEnvironment,
    audit: deps.audit, clock: deps.clock, kick: drain
  });
  // P15: the erasure stop sweep runs in front of the money check, isolated from it (`reconcileWork`): a failed sweep
  // reports BILLING_ERASURE_SWEEP_PENDING and the reconciler runs anyway; BILLING_RECONCILIATION_PENDING means only
  // that the reconciler failed. Both are tried again on the next 10-minute tick.
  const erasure = new BillingErasureHook({
    billing: repository, jobs, entitlements, audit: deps.audit, clock: deps.clock
  });
  const reconcile = createCoalescingSingleFlight(
    reconcileWork({ erasure, reconciler, reportPending: deps.reportPending }),
    () => deps.reportPending("BILLING_RECONCILIATION_PENDING")
  );
  const timers: Array<ReturnType<typeof setInterval>> = [];
  return Object.freeze({
    outbox,
    checkout,
    routes,
    verify,
    refunds,
    renewal,
    maintenance,
    erasure,
    kick: drain,
    start() {
      if (timers.length > 0) return;
      const outboxTimer = setInterval(drain, 5_000);
      outboxTimer.unref();
      timers.push(outboxTimer);
      drain();
      const renewalTimer = setInterval(renewTick, 60_000);
      renewalTimer.unref();
      timers.push(renewalTimer);
      renewTick();
      // P14a: every 10 minutes; the reconciler itself runs the full pass once a day.
      const reconcileTimer = setInterval(reconcile, 600_000);
      reconcileTimer.unref();
      timers.push(reconcileTimer);
      reconcile();
    },
    stop() {
      for (const timer of timers.splice(0)) clearInterval(timer);
    }
  });
}
