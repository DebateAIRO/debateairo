import type { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { TaxEngine } from "@debateai/billing-core";
import type { BillingPlans, BillingPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import type { BillingLegalGate } from "./index.js";

/**
 * What the subscription routes are composed with (P7's `createBillingRuntime`). It exists only when hosted with
 * `billingPolicy.enabled`; otherwise it is absent and every route answers the closed 404 (spec §2.2 rule 1).
 */
export type SubscriptionRouteDeps = Readonly<{
  billing: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner">;
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
}>;
