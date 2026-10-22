import type { Pool } from "pg";
import type { PaymentEnvironment } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import { CardCustody } from "./card-custody.js";
import type { NetopiaNoticeIntake } from "./netopia-intake.js";
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
  /**
   * B3a (NETOPIA answers 2026-10-21): the provider-only intake, when it has a spool (BILLING_NOTICE_SPOOL_PATH): its
   * kept messages are replayed every 10 minutes, as the billing runtime's are (main.ts replays them once at the start).
   */
  notices?: Pick<NetopiaNoticeIntake, "replaySpool">;
}>;

export type ProviderOnlyJobs = Readonly<{
  /** One run of the daily job (the timer's work; tests drive it directly). */
  schedule(): Promise<number>;
  /** Side-by-side spec §4 (plan C7): `when` gates every timer callback and the first pass (absent: always). */
  start(options?: Readonly<{ when?: () => boolean }>): void;
  stop(): void;
}>;

/**
 * F7 (final review data-1): the provider-only mode's one timer, composed in main.ts only in that mode. It runs the
 * billing runtime's daily owner job with N17's card steps alone (`ProviderOnlyOwnerJobs`), on the same daily timer
 * and at each start, with the same single-flight and the same BILLING_OWNER_JOBS_PENDING line on a failure. The sweep
 * and both purges are already granted to the API's billing role (0111); nothing else of billing runs here.
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
  const { notices } = deps;
  const replaySpool = notices === undefined ? undefined : createCoalescingSingleFlight(
    () => notices.replaySpool(deps.clock()),
    () => deps.audit("billing.notice.spool_replay", { code: "BILLING_NOTICE_SPOOL_REPLAY_FAILED" })
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  let spoolTimer: ReturnType<typeof setInterval> | undefined;
  return Object.freeze({
    schedule: () => owner.schedule(),
    start(options?: Readonly<{ when?: () => boolean }>) {
      if (timer !== undefined) return;
      // Side-by-side spec §4 (plan C7): every tick and the first pass ask `when` (main.ts: the release watcher's
      // ownIsCurrent), as the billing runtime's do.
      const when = options?.when ?? (() => true);
      const gated = (work: () => void) => (): void => { if (when()) work(); };
      timer = setInterval(gated(schedule), 86_400_000);
      timer.unref();
      gated(schedule)();
      if (replaySpool !== undefined) {
        spoolTimer = setInterval(gated(replaySpool), 600_000);
        spoolTimer.unref();
      }
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      if (spoolTimer !== undefined) clearInterval(spoolTimer);
      timer = undefined;
      spoolTimer = undefined;
    }
  });
}
