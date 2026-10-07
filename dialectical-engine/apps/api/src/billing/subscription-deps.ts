import type { AcceptanceRepository, BillingJobQueries, BillingRepository, CustomerXMoneyEnvironment, EntitlementRepository } from "@debateai/db";
import type { CardPayments, TaxEngine } from "@debateai/billing-core";
import type { GeoLookup } from "@debateai/geo";
import type { XMoneyClient } from "@debateai/payments-xmoney";
import type { BillingPlans, BillingPolicy, CountryPolicy } from "@debateai/register";
import type { AccountEmailReader } from "./account-email.js";
import type { BillingAudit } from "./audit.js";
import type { CancelLinkService } from "./cancel-link.js";
import type { CheckoutService } from "./checkout.js";
import type { ConsentKind, ConsentPair } from "./checkout.js";
import type { BillingLegalGate } from "./index.js";
import type { BillingOrderText } from "./order-text.js";
import type { RefundDesk } from "./refunds.js";

/**
 * What the subscription routes are composed with (P7's `createBillingRuntime`). It exists only when hosted with
 * `billingPolicy.enabled`; otherwise it is absent and every route answers the closed 404 (spec §2.2 rule 1).
 */
export type SubscriptionRouteDeps = Readonly<{
  billing: BillingRepository;
  /**
   * `withSubscriptionLease`: P7's lease the renewal holds, so an upgrade and a renewal never prepare together (P12c).
   * `bringForward` and `outboxJobExists`: N12's VERIFY_PAYMENT for a paid upgrade and the owner's O3 (once per hour).
   */
  jobs: Pick<BillingJobQueries, "lockOwner" | "withSubscriptionLease" | "bringForward" | "outboxJobExists">;
  entitlements: EntitlementRepository;
  plans: BillingPlans;
  policy: BillingPolicy;
  tax: Pick<TaxEngine, "quote">;
  recordsKey: Buffer;
  /**
   * `PUBLIC_APP_URL` (R-7): the only origin links point at. The runtime fills it from P6a's
   * `BillingConnectors.publicAppUrl` (A22: one source; `BillingRuntimeDeps` has no member of its own).
   */
  publicAppUrl: string;
  legal: BillingLegalGate;
  audit: BillingAudit;
  clock: () => Date;
  /** P12c: xMoney's rebill. Unused from N12 (the upgrade pays on NETOPIA's page); N23 removes it. */
  xmoney: Pick<XMoneyClient, "rebill">;
  /**
   * P6a's `connectors.xmoneyEnvironment`: the xMoney system every call above goes to. A charge made here names it,
   * and a subscription created in the other system is never charged or re-carded here (D5 5h).
   */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /** N12/N13 (spec §2.10, §2.11): NETOPIA's port (N8's `connectors.payments`): the hosted page and the status read. */
  payments: Pick<CardPayments, "startHostedPayment" | "status">;
  /** N12/N14: N8's connectors.paymentEnvironment, the NETOPIA environment this API serves; null when none. */
  paymentEnvironment: "sandbox" | "live" | null;
  /** N12/N13 (spec §2.18): where the card-saving agreement is recorded (RENEWAL_TERMS, surface UPGRADE or CARD_CHANGE). */
  acceptances: Pick<AcceptanceRepository, "record">;
  /** `currentDocument` from @debateai/legal-manifest: the agreement's version and hash in force in each locale. */
  consentDocuments: (kind: ConsentKind, locale: string) => ConsentPair | null;
  /** The order line NETOPIA shows and keeps (the 35-locale catalogue; `englishOrderText` in tests). */
  orderText: BillingOrderText;
  /** P12c: the same country decision as checkout (P8b's `decidePaymentPlace`) before any card action. */
  countryPolicy: CountryPolicy;
  geo: GeoLookup;
  /** P7's outbox kick: a queued VERIFY_PAYMENT (or refund) runs now, not at the next 5-second tick. */
  kick: () => void;
  /** B6a's model spend store: the owner's RUN + STORY spend between two instants (the credit-used share). */
  ownerSpend: Readonly<{ readOwnerSpentMicros(ownerRef: string, from: Date, to: Date): Promise<number> }>;
  /** P9b's single refund executor (R-32). */
  refunds: Pick<RefundDesk, "requestAll">;
  /** P8c's CheckoutService: the one builder and signer of embedded xMoney orders (R-17). */
  checkout: Pick<CheckoutService, "signEmbeddedOrder">;
  /** P8c's account email reader: the address the card form is opened for, as at checkout. */
  accountEmail: AccountEmailReader;
  /** P13 (A25): the emailed one-time cancel link, for the two public routes that need no session. */
  cancelLinks: Pick<CancelLinkService, "request" | "cancelByToken">;
}>;
