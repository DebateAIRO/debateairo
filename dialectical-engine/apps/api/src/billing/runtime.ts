import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ReadableUserDekStore } from "@debateai/crypto";
import { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { GeoLookup } from "@debateai/geo";
import type { BillingPlans, BillingPolicy, CountryPolicy } from "@debateai/register";
import type { BillingAudit } from "./audit.js";
import type { BillingConnectors } from "./connectors.js";
import { createEmailJobHandler, type AttachmentResolver, type BillingAttachmentKind, type BillingMailPort } from "./email-job.js";
import { BillingOutboxWorker } from "./outbox.js";
import { createCoalescingSingleFlight } from "./single-flight.js";

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
  kick(): void;
  start(): void;
  stop(): void;
}>;

export function createBillingRuntime(deps: BillingRuntimeDeps): BillingRuntime {
  const repository = new BillingRepository(deps.pool);
  const jobs = new BillingJobQueries(deps.pool);
  const outbox = new BillingOutboxWorker({
    repository, workerId: `billing-api-${process.pid}-${randomUUID()}`, clock: deps.clock, audit: deps.audit,
    batchSize: 20
  });
  const attachments = new Map<BillingAttachmentKind, AttachmentResolver>(deps.mail?.attachments ?? []);
  if (deps.mail !== undefined) {
    outbox.register("EMAIL", createEmailJobHandler({
      repository, recordsKey: deps.connectors.recordsKey, ownerReportEmail: deps.connectors.ownerReportEmail,
      mail: deps.mail.sender, attachments
    }));
  }
  const drain = createCoalescingSingleFlight(() => outbox.drain(10), () => deps.reportPending("BILLING_OUTBOX_PENDING"));
  const timers: Array<ReturnType<typeof setInterval>> = [];
  return Object.freeze({
    outbox,
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
