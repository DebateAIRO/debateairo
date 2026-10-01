import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ReadableUserDekStore } from "@debateai/crypto";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { GeoLookup } from "@debateai/geo";
import { currentDocument } from "@debateai/legal-manifest";
import { decryptNotice } from "@debateai/payments-xmoney";
import type { BillingPlans, BillingPolicy, CountryPolicy } from "@debateai/register";
import { DekAccountEmailReader } from "./account-email.js";
import type { BillingAudit } from "./audit.js";
import { ChargeStatusReader } from "./charge-status.js";
import { CheckoutService } from "./checkout.js";
import type { BillingConnectors } from "./connectors.js";
import { createEmailJobHandler, type AttachmentResolver, type BillingAttachmentKind, type BillingMailPort } from "./email-job.js";
import type { BillingLegalGate, BillingRouteOptions } from "./index.js";
import { NoticeIntake } from "./notice-intake.js";
import { BillingOutboxWorker } from "./outbox.js";
import { QuoteService } from "./quote.js";
import { RefundDesk } from "./refunds.js";
import { createInitialSettlement } from "./settlement-initial.js";
import { createCoalescingSingleFlight } from "./single-flight.js";
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
   * P16a the `taxAuthorities` row (P16a narrows `unknown` to its `TaxAuthorities` type).
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
  kick(): void;
  start(): void;
  stop(): void;
}>;

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
  outbox.register("VERIFY_PAYMENT", verify.handle);
  const attachments = new Map<BillingAttachmentKind, AttachmentResolver>(deps.mail?.attachments ?? []);
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
    })
  });
  const drain = createCoalescingSingleFlight(() => outbox.drain(10), () => deps.reportPending("BILLING_OUTBOX_PENDING"));
  const timers: Array<ReturnType<typeof setInterval>> = [];
  return Object.freeze({
    outbox,
    checkout,
    routes,
    verify,
    refunds,
    kick: drain,
    start() {
      if (timers.length > 0) return;
      const outboxTimer = setInterval(drain, 5_000);
      outboxTimer.unref();
      timers.push(outboxTimer);
      drain();
    },
    stop() {
      for (const timer of timers.splice(0)) clearInterval(timer);
    }
  });
}
