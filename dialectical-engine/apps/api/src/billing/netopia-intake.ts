import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { PaymentEnvironment } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, NoticeOutcome, NoticeQuarantineCursor, NoticeQuarantineRow } from "@debateai/db";
import { exhaustive } from "@debateai/kernel";
import {
  netopiaNoticeAnswer, parseNetopiaNotice, quarantinable, verifyNetopiaNotice,
  type NoticeRejectionReason, type NoticeTrust, type ParsedNotice, type VerifiedNotice
} from "@debateai/payments-netopia";
import type { BillingAudit } from "./audit.js";
import { emailJob } from "./email-job.js";
import { enqueueOnce } from "./outbox.js";
import { openQuarantined, sealCardToken, sealNoticeAllowed, sealNoticeRaw, sealQuarantined } from "./records.js";

/** §2.7.2's answer: 200 (verified), 503 (not verified, or not stored: NETOPIA sends again), 429 (over budget). */
export type NoticeAnswer = Readonly<{ status: 200 | 429 | 503; body: string }>;

/**
 * One delivery of NETOPIA's message. `rawBody` is the bytes as received; `header` is the `Verification-token` value;
 * `sourceKey` is the sender's network scope; `admit` charges the route's billingNotify budget for that source and is
 * asked only for a message that fails verification (false: over budget, the route has already answered 429).
 */
export type NoticeArrival = Readonly<{
  rawBody: Buffer; header: string | undefined; sourceKey: string; now: Date; admit?: () => boolean;
}>;

export interface NetopiaNoticeIntakePort {
  receive(input: NoticeArrival): Promise<NoticeAnswer>;
}

/** ON: billing is on. PROVIDER_ONLY (ruling C-9): hosted, billing off, NETOPIA's settings complete. */
export type NetopiaIntakeMode = "ON" | "PROVIDER_ONLY";

export type NetopiaNoticeIntakeDeps = Readonly<{
  repository: Pick<BillingRepository,
    | "withTransaction" | "insertPaymentNotice" | "insertPaymentNoticeRaw" | "insertPaymentNoticeOutcome"
    | "insertNoticeQuarantine" | "quarantineSince" | "insertCardToken" | "toolOrder" | "charge" | "customerByOwner"
    | "enqueue">;
  jobs: Pick<BillingJobQueries, "bringForward" | "outboxJobExists">;
  /** Our POS signature and the trusted NETOPIA keys, read at this start (N8's `noticeTrust`). */
  trust: NoticeTrust;
  recordsKey: Buffer;
  /** This API's NETOPIA system (N8's `paymentEnvironment`): a charge of the other one is OTHER_SYSTEM. */
  paymentEnvironment: PaymentEnvironment;
  mode: NetopiaIntakeMode;
  audit: BillingAudit;
  kick: () => void;
}>;

const CHARGE_ORDER = /^[0-9a-f]{32}$/u;
const TOOL_ORDER = /^t-[0-9a-f]{30}$/u;
/** §2.5.2: the quarantine is kept 14 days, so the re-check reads 14 days back. */
const QUARANTINE_DAYS = 14;
/** Ruling PR-30: the re-check reads the quarantine in keyset pages of at most this many rows, until a short page. */
const RECHECK_PAGE_ROWS = 500;
const DAY_MS = 86_400_000;
/** The house admission envelope (apps/api/src/index.ts `admitOrRefuse`), for a caller with no reply to send it on. */
const OVER_BUDGET: NoticeAnswer = Object.freeze({
  status: 429, body: JSON.stringify({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" })
});
const PARSE_FAILED_STEPS = "NETOPIA's message was verified and stored, but its body could not be read, so nothing was"
  + " decided from it and no saved card was kept from it. The payment's status is still read from NETOPIA as usual."
  + " Report the code and the notice reference to whoever maintains the site: the message's bytes are kept 14 days so"
  + " it can be read again after a fix.";

type Target =
  | Readonly<{ kind: "CHARGE"; chargeId: string; ownerRef: string; environment: PaymentEnvironment; ours: boolean; open: boolean }>
  | Readonly<{ kind: "TOOL_ORDER"; orderId: string; environment: PaymentEnvironment }>
  | Readonly<{ kind: "UNKNOWN" }>;
const UNKNOWN: Target = Object.freeze({ kind: "UNKNOWN" });

/** How a verified message reached the store: NETOPIA delivered it now, or the start's re-check read it from the quarantine. */
type Delivery = Readonly<{ arrival: "DELIVERED" | "RECHECKED"; receivedAt: Date }>;

type CardSource = Readonly<{
  customerId: string | null; sourceChargeId: string | null; sourceToolOrder: string | null; environment: PaymentEnvironment;
}>;

/**
 * Spec 2026-10-05 §2.7.3-2.7.4: NETOPIA's message. Verified first; a verified one is stored in one transaction before
 * the answer (the saved card comes only once) and changes no subscription state; a rejected one is answered "retry"
 * and, when worth keeping, sealed into the quarantine for the next start's re-check.
 */
export class NetopiaNoticeIntake implements NetopiaNoticeIntakePort {
  constructor(private readonly deps: NetopiaNoticeIntakeDeps) {}

  async receive(input: NoticeArrival): Promise<NoticeAnswer> {
    const verdict = verifyNetopiaNotice(input.rawBody, input.header, this.deps.trust);
    if (!verdict.ok) return this.rejected(input, verdict.reason);
    try {
      await this.store(input.rawBody, verdict, { arrival: "DELIVERED", receivedAt: input.now }, input.now);
    } catch {
      this.deps.audit("billing.notice.store_failed", {});
      return netopiaNoticeAnswer("STORE_FAILED");
    }
    this.deps.kick();
    return netopiaNoticeAnswer("OK");
  }

  /**
   * §2.7.4 step 2: the quarantine of the last 14 days, verified with the keys read at this start. Read in keyset pages
   * (ruling PR-30), so a flood of stored rejections never sits in memory at once; storing a message adds no
   * quarantine row, so the pages do not move under the loop. A row whose body is already stored writes no outcome:
   * NETOPIA sent nothing, so it is not a DUPLICATE, and it does not count as verified.
   */
  async recheckQuarantine(now: Date): Promise<number> {
    const since = new Date(now.getTime() - QUARANTINE_DAYS * DAY_MS);
    const { repository } = this.deps;
    let quarantined = 0;
    let verified = 0;
    let failed = 0;
    let after: NoticeQuarantineCursor | null = null;
    for (;;) {
      const cursor = after;
      const rows: ReadonlyArray<NoticeQuarantineRow> = await repository.withTransaction((client) =>
        repository.quarantineSince(client, since, { after: cursor, limit: RECHECK_PAGE_ROWS }));
      for (const row of rows) {
        const result = await this.recheckOne(row, now);
        if (result === "VERIFIED") verified += 1;
        else if (result === "FAILED") failed += 1;
      }
      quarantined += rows.length;
      const last = rows.at(-1);
      if (rows.length < RECHECK_PAGE_ROWS || last === undefined) break;
      after = Object.freeze({ receivedAt: last.receivedAt, quarantineId: last.quarantineId });
    }
    if (quarantined > 0) this.deps.audit("billing.notice.recheck", { quarantined, verified, failed });
    if (verified > 0) this.deps.kick();
    return verified;
  }

  /** One quarantined message: still unverified, now verified and stored (a stored body again: STORED_BEFORE), or failed. */
  private async recheckOne(row: NoticeQuarantineRow, now: Date): Promise<"UNVERIFIED" | "VERIFIED" | "STORED_BEFORE" | "FAILED"> {
    let opened: Readonly<{ rawBody: Buffer; header: string | undefined }>;
    try {
      opened = openQuarantined(this.deps.recordsKey, row);
    } catch {
      return "FAILED";
    }
    try {
      const verdict = verifyNetopiaNotice(opened.rawBody, opened.header, this.deps.trust);
      if (!verdict.ok) return "UNVERIFIED";
      // Stored at its real arrival (the quarantine row's), so NETOPIA's order of messages survives the re-check.
      const delivery = { arrival: "RECHECKED", receivedAt: row.receivedAt } as const;
      return await this.store(opened.rawBody, verdict, delivery, now) === "DUPLICATE" ? "STORED_BEFORE" : "VERIFIED";
    } catch {
      return "FAILED";
    } finally {
      opened.rawBody.fill(0);
    }
  }

  private async rejected(input: NoticeArrival, reason: NoticeRejectionReason): Promise<NoticeAnswer> {
    if (input.admit !== undefined && !input.admit()) return OVER_BUDGET;
    this.deps.audit("billing.notice.unverified", { reason });
    if (quarantinable(input.rawBody, input.header, this.deps.trust.posSignature)) {
      try {
        if (await this.quarantine(input, reason)) this.deps.kick();
      } catch {
        this.deps.audit("billing.notice.store_failed", {});
      }
    }
    return netopiaNoticeAnswer(reason);
  }

  /** Seals the message into the quarantine; with billing on, O4 (once an hour) when it names an open charge of ours. */
  private async quarantine(input: NoticeArrival, reason: NoticeRejectionReason): Promise<boolean> {
    const orderId = parseNetopiaNotice(input.rawBody, input.now).orderId;
    const quarantineId = randomUUID();
    const sealed = sealQuarantined(this.deps.recordsKey, quarantineId, input.rawBody, input.header);
    return this.deps.repository.withTransaction(async (client) => {
      await this.deps.repository.insertNoticeQuarantine(client, {
        quarantineId, receivedAt: input.now, reason, orderId, rawCiphertext: sealed.rawCiphertext,
        headerCiphertext: sealed.headerCiphertext, keyId: sealed.keyId
      });
      if (this.deps.mode !== "ON") return false;
      const target = await this.targetOf(client, orderId);
      if (target.kind !== "CHARGE" || !target.ours || !target.open) return false;
      return enqueueOnce({ repository: this.deps.repository, jobs: this.deps.jobs }, client, emailJob({
        template: "O4", recipient: { kind: "OWNER" }, dedupeRef: input.now.toISOString().slice(0, 13),
        params: { chargeRef: target.chargeId, receivedAt: input.now.toISOString(), reasonCode: reason },
        notBefore: input.now
      }));
    });
  }

  /**
   * §2.7.3: one transaction. A body stored before (same SHA-256) answers DUPLICATE and changes nothing else; it adds
   * its DUPLICATE outcome only when NETOPIA `DELIVERED` it again, never when the start's re-check re-read it from the
   * quarantine (`RECHECKED`), so restarts add no outcome rows. `delivery.receivedAt` is when NETOPIA's message reached
   * us (for a re-checked one, its quarantine row's time): the notice's `received_at`, which orders an order's messages
   * (final review protocol-2). `now` is when it is processed: the outcome's `at`, the raw bytes' `stored_at`.
   */
  private async store(rawBody: Buffer, verdict: VerifiedNotice, delivery: Delivery, now: Date): Promise<NoticeOutcome> {
    const { arrival, receivedAt } = delivery;
    const parsed = parseNetopiaNotice(rawBody, now);
    const bodySha256 = createHash("sha256").update(rawBody).digest("hex");
    const noticeId = randomUUID();
    const allowed = sealNoticeAllowed(this.deps.recordsKey, noticeId, parsed.allowed);
    return this.deps.repository.withTransaction(async (client) => {
      const target = parsed.readable ? await this.targetOf(client, parsed.orderId) : UNKNOWN;
      const stored = await this.deps.repository.insertPaymentNotice(client, {
        noticeId, paymentProvider: "netopia", paymentEnvironment: target.kind === "UNKNOWN" ? this.deps.paymentEnvironment : target.environment,
        receivedAt, bodySha256, orderId: parsed.orderId, providerPaymentId: parsed.providerPaymentId,
        providerStatus: parsed.providerStatus, amountText: parsed.amountText, currency: parsed.currency,
        cardCountry: parsed.cardCountry, keyFingerprint: verdict.keyFingerprint, jwtIat: verdict.jwtIat,
        allowedCiphertext: allowed.ciphertext, keyId: allowed.keyId
      });
      if (!stored.inserted) {
        if (arrival === "DELIVERED") {
          await this.deps.repository.insertPaymentNoticeOutcome(client, { noticeId: stored.noticeId, at: now, outcome: "DUPLICATE" });
        }
        return "DUPLICATE" as const;
      }
      const raw = sealNoticeRaw(this.deps.recordsKey, noticeId, rawBody);
      await this.deps.repository.insertPaymentNoticeRaw(client, { noticeId, rawCiphertext: raw.ciphertext, keyId: raw.keyId, storedAt: now });
      const outcome = await this.process(client, parsed, target, noticeId, receivedAt, now);
      await this.deps.repository.insertPaymentNoticeOutcome(client, { noticeId, at: now, outcome });
      return outcome;
    });
  }

  private async process(
    client: PoolClient, parsed: ParsedNotice, target: Target, noticeId: string, receivedAt: Date, now: Date
  ): Promise<NoticeOutcome> {
    if (!parsed.readable) {
      this.deps.audit("billing.notice.parse_failed", {});
      if (this.deps.mode === "ON") {
        await enqueueOnce({ repository: this.deps.repository, jobs: this.deps.jobs }, client, emailJob({
          template: "O3", recipient: { kind: "OWNER" }, dedupeRef: `NOTICE_PARSE_FAILED:${noticeId}`,
          params: {
            jobKind: "PAYMENT_NOTICE", reference: `notice ${noticeId}`, reasonCode: "NOTICE_PARSE_FAILED",
            nextSteps: PARSE_FAILED_STEPS, paymentAlert: "true"
          },
          notBefore: now
        }));
      }
      return "PARSE_FAILED";
    }
    switch (target.kind) {
      case "TOOL_ORDER":
        await this.saveCard(client, parsed, {
          customerId: null, sourceChargeId: null, sourceToolOrder: target.orderId, environment: target.environment
        }, noticeId, receivedAt, now);
        return "TOOL_ORDER";
      case "CHARGE": {
        if (this.deps.mode === "PROVIDER_ONLY") return "BILLING_OFF";
        if (!target.ours) return "OTHER_SYSTEM";
        // A charge always has its owner's customer row (the checkout writes it first); without one no card is kept.
        const customer = await this.deps.repository.customerByOwner(target.ownerRef, client);
        if (customer !== null) {
          await this.saveCard(client, parsed, {
            customerId: customer.customerId, sourceChargeId: target.chargeId, sourceToolOrder: null, environment: target.environment
          }, noticeId, receivedAt, now);
        }
        // §2.7.3 step 4 (SR-10): the live job is brought forward to now; else one is queued.
        if (!(await this.deps.jobs.bringForward(client, "VERIFY_PAYMENT", target.chargeId, now))) {
          await this.deps.repository.enqueue(client, {
            kind: "VERIFY_PAYMENT", ref: target.chargeId, notBefore: now, payload: { charge_id: target.chargeId }
          });
        }
        return "APPLIED";
      }
      case "UNKNOWN":
        if (this.deps.mode === "PROVIDER_ONLY") return "BILLING_OFF";
        this.deps.audit("billing.notice.unknown_order", {});
        return "UNKNOWN_ORDER";
      default:
        return exhaustive(target);
    }
  }

  /**
   * §2.7.3 step 3: the token sealed under the records key, its row naming its source; never logged or returned. A
   * message without NETOPIA's operation time is dated by its arrival, never by a later re-check's clock.
   */
  private async saveCard(
    client: PoolClient, parsed: ParsedNotice, source: CardSource, noticeId: string, receivedAt: Date, now: Date
  ): Promise<void> {
    const card = parsed.savedCard;
    if (card === null) return;
    const tokenId = randomUUID();
    const sealed = sealCardToken(this.deps.recordsKey, tokenId, card.token);
    await this.deps.repository.insertCardToken(client, {
      tokenId, customerId: source.customerId, paymentProvider: "netopia", paymentEnvironment: source.environment,
      sourceChargeId: source.sourceChargeId, sourceToolOrder: source.sourceToolOrder, sourceNoticeId: noticeId,
      sourcePaidAt: parsed.occurredAt ?? receivedAt, tokenCiphertext: sealed.ciphertext, keyId: sealed.keyId,
      expMonth: card.expMonth, expYear: card.expYear, last4: card.last4, cardCountry: parsed.cardCountry, createdAt: now
    });
  }

  /** §2.7.3 step 2: our charge (its own system labels the rows), a tool order, or nothing of ours. */
  private async targetOf(client: PoolClient, orderId: string | null): Promise<Target> {
    if (orderId !== null && CHARGE_ORDER.test(orderId)) {
      const charge = await this.deps.repository.charge(orderId, client);
      if (charge !== null) {
        const open = !charge.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED");
        const environment = charge.paymentEnvironment;
        if (charge.paymentProvider !== "netopia" || environment === "stage") {
          return Object.freeze({
            kind: "CHARGE", chargeId: charge.chargeId, ownerRef: charge.ownerRef, environment: this.deps.paymentEnvironment,
            ours: false, open
          });
        }
        return Object.freeze({
          kind: "CHARGE", chargeId: charge.chargeId, ownerRef: charge.ownerRef, environment,
          ours: environment === this.deps.paymentEnvironment, open
        });
      }
    }
    if (orderId !== null && TOOL_ORDER.test(orderId)) {
      const tool = await this.deps.repository.toolOrder(client, orderId);
      if (tool !== null) return Object.freeze({ kind: "TOOL_ORDER", orderId, environment: tool.paymentEnvironment });
    }
    return UNKNOWN;
  }
}
