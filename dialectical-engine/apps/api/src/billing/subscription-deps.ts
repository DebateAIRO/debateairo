import type { BillingJobQueries, BillingRepository, CustomerXMoneyEnvironment, EntitlementRepository } from "@debateai/db";
import type { TaxEngine } from "@debateai/billing-core";
import type { GeoLookup } from "@debateai/geo";
import type { XMoneyClient } from "@debateai/payments-xmoney";
import type { BillingPlans, BillingPolicy, CountryPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import type { BillingLegalGate } from "./index.js";

/**
 * What the subscription routes are composed with (P7's `createBillingRuntime`). It exists only when hosted with
 * `billingPolicy.enabled`; otherwise it is absent and every route answers the closed 404 (spec §2.2 rule 1).
 */
export type SubscriptionRouteDeps = Readonly<{
  billing: BillingRepository;
  /** `withSubscriptionLease`: P7's lease the renewal holds, so an upgrade and a renewal never submit together (P12c). */
  jobs: Pick<BillingJobQueries, "lockOwner" | "withSubscriptionLease">;
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
  /** P12c: the upgrade's rebill on the saved card. */
  xmoney: Pick<XMoneyClient, "rebill">;
  /**
   * P6a's `connectors.xmoneyEnvironment`: the xMoney system every call above goes to. A charge made here names it,
   * and a subscription created in the other system is never charged or re-carded here (D5 5h).
   */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /** P12c: the same country decision as checkout (P8b's `decidePaymentPlace`) before any card action. */
  countryPolicy: CountryPolicy;
  geo: GeoLookup;
  /** P7's outbox kick: a queued VERIFY_PAYMENT (or refund) runs now, not at the next 5-second tick. */
  kick: () => void;
}>;
