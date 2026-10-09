import type { Pool } from "pg";
import type { PaymentEnvironment } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import { CardCustody } from "./card-custody.js";
import { ProviderOnlyOwnerJobs } from "./owner-jobs.js";
import { createCoalescingSingleFlight } from "./single-flight.js";

export type ProviderOnlyJobsDeps = Readonly<{
  pool: Pool;
  /** The provider-only NETOPIA connector's environment: the cards this API keeps (N8's `paymentEnvironment`). */
  paymentEnvironment: PaymentEnvironment;
  /** R-7: PUBLIC_APP_URL. CardCustody needs it for M12, which this mode never sends. */
  publicAppUrl: string;
  audit: BillingAudit;
  clock: () => Date;
  reportPending: (code: string) => void;
}>;

export type ProviderOnlyJobs = Readonly<{
  /** One run of the daily job (the timer's work; tests drive it directly). */
  schedule(): Promise<number>;
  start(): void;
  stop(): void;
}>;

/**
 * F7 (final review data-1): the provider-only mode's one timer, composed in main.ts only in that mode. It runs the
 * billing runtime's daily owner job with N17's card steps alone (`ProviderOnlyOwnerJobs`), on the same daily timer
 * and at each start, with the same single-flight and the same BILLING_OWNER_JOBS_PENDING line on a failure. The sweep
 * and both purges are already granted to the API's billing role (0109); nothing else of billing runs here.
 */
export function createProviderOnlyJobs(deps: ProviderOnlyJobsDeps): ProviderOnlyJobs {
  const custody = new CardCustody({
    repository: new BillingRepository(deps.pool), jobs: new BillingJobQueries(deps.pool),
    paymentEnvironment: deps.paymentEnvironment, publicAppUrl: deps.publicAppUrl, audit: deps.audit
  });
  const owner = new ProviderOnlyOwnerJobs({ custody, clock: deps.clock });
  const schedule = createCoalescingSingleFlight(
    () => owner.schedule(), () => deps.reportPending("BILLING_OWNER_JOBS_PENDING")
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  return Object.freeze({
    schedule: () => owner.schedule(),
    start() {
      if (timer !== undefined) return;
      timer = setInterval(schedule, 86_400_000);
      timer.unref();
      schedule();
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    }
  });
}
