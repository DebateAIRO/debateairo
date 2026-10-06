import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEmailBlindIndex, encrypt, generateDek, normalizeEmailForBlindIndex, type KeyDestroyResult, type ReadableUserDekStore
} from "@debateai/crypto";
import {
  BillingJobQueries, BillingRepository, createPool, EntitlementRepository, PostgresIdentityRepository, migrate, type Pool
} from "@debateai/db";
import { foldSubscription } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import {
  holdOwnerLock, recordingAudit, seedActiveSubscription, suspendForChargeback, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { createBillingTestAccount, eraseBillingTestAccount } from "../support/billingAccountFixture.js";
import { DekBillingRecipientReader } from "../../apps/api/src/billing/account-email.js";
import { CancelLinkService, cancelTokenSha256 } from "../../apps/api/src/billing/cancel-link.js";
import { createEmailJobHandler, emailJob, type BillingMail } from "../../apps/api/src/billing/email-job.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const BLIND_INDEX_KEY = Buffer.alloc(32, 3);
const DAY = 86_400_000;

/** The users' DEKs in memory, as the API's key store holds them. `load` hands out a copy: the reader zeroes it. */
const deks = new Map<string, Buffer>();
const dekStore: ReadableUserDekStore = Object.freeze({
  async store(userId: string, dek: Uint8Array) { deks.set(userId, Buffer.from(dek)); },
  async load(userId: string) {
    const dek = deks.get(userId);
    if (dek === undefined) throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(dek);
  },
  async exists(userId: string) { return deks.has(userId); },
  async destroy(userId: string): Promise<KeyDestroyResult> { return deks.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT"; }
});

/**
 * An account in `state` (0077's user_state_check admits `age_frozen`, R3-2), its address under its DEK with
 * registration's AAD and its blind index over the normalised address, as registration stores them.
 */
async function account(email: string, state: "active" | "age_frozen" = "active"): Promise<string> {
  const ownerRef = randomUUID();
  const userId = randomUUID();
  const dek = generateDek();
  const sealed = encrypt(dek, Buffer.from(email, "utf8"), [
    "identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"
  ]);
  await dekStore.store(userId, dek);
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,
      pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,'{}',NULL,$4,$5,$6,$7,$8,clock_timestamp(),clock_timestamp())
  `, [userId, createEmailBlindIndex(BLIND_INDEX_KEY, normalizeEmailForBlindIndex(email)), JSON.stringify(sealed),
    "$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$AAAA", `p13-${randomUUID()}`, randomUUID(), ownerRef, state]);
  return ownerRef;
}

function service(clock: { now: Date }, pool: Pool = database.pool) {
  const mails: BillingMail[] = [];
  const audit = recordingAudit();
  const links = new CancelLinkService({
    billing: new BillingRepository(pool),
    jobs: new BillingJobQueries(pool),
    entitlements: new EntitlementRepository(pool),
    identities: new PostgresIdentityRepository(pool, { hash: async () => randomBytes(32) } as never),
    blindIndexKey: BLIND_INDEX_KEY,
    recordsKey: TEST_RECORDS_KEY,
    recipients: new DekBillingRecipientReader(pool, dekStore),
    mail: { sendTemplated: async (mail) => { mails.push(mail); } },
    publicAppUrl: TEST_PUBLIC_APP_URL,
    audit,
    clock: () => clock.now
  });
  return { links, mails, audit };
}

const tokenOf = (mail: BillingMail): string => new URL(mail.params.cancelLinkUrl!).hash.slice("#token=".length);

describe("P13 the cancel link on real PostgreSQL", () => {
  it("dates the emailed link's cancel after the owner lock it waited for (P2-M12)", async () => {
    const clock = { now: new Date() };
    const { links, mails } = service(clock);
    const email = `m12-${randomUUID().slice(0, 8)}@example.test`;
    const ownerRef = await account(email);
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "RO"
    });
    expect(await links.request(email)).toBe("SENT");
    const lock = await holdOwnerLock(database.pool, ownerRef);
    const cancelled = links.cancelByToken(tokenOf(mails[0]!));
    await lock.waiter();
    clock.now = new Date(clock.now.getTime() + 60_000);
    await lock.release();
    expect(await cancelled).toBe("CANCELLED");
    const cancel = (await new BillingRepository(database.pool).subscriptionEvents(seeded.subscriptionId))
      .find((event) => event.kind === "CANCEL_REQUESTED");
    expect(cancel?.at).toEqual(clock.now);
  });

  it("sends one link to the account's current address, stores only its hash, and cancels once through it", async () => {
    const clock = { now: new Date() };
    const { links, mails, audit } = service(clock);
    const ownerRef = await account("subscriber@example.test");
    // W8 (P2-I12): the profile still holds the address of the checkout; the account's address is the one that
    // matched, and M9 goes there.
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "RO", email: "billing@example.test"
    });
    expect(await links.request("  subscriber@example.TEST ")).toBe("SENT");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "subscriber@example.test", templateId: "M9", locale: "en", attachments: [] });
    expect(mails[0]!.params.cancelLinkUrl).toMatch(new RegExp(`^${TEST_PUBLIC_APP_URL}/cancel#token=[A-Za-z0-9_-]{43}$`));
    const token = tokenOf(mails[0]!);
    const stored = await database.pool.query<{ token_sha256: string }>(
      "SELECT token_sha256 FROM billing.cancel_token WHERE subscription_id=$1", [seeded.subscriptionId]
    );
    expect(stored.rows).toEqual([{ token_sha256: cancelTokenSha256(token) }]);
    expect(JSON.stringify(stored.rows)).not.toContain(token);
    expect(await links.cancelByToken(token)).toBe("CANCELLED");
    const events = await new BillingRepository(database.pool).subscriptionEvents(seeded.subscriptionId);
    expect(events.at(-1)).toMatchObject({ kind: "CANCEL_REQUESTED", data: { source: "EMAIL_LINK" } });
    expect(foldSubscription(events).cancelRequested).toBe(true);
    expect(await links.cancelByToken(token)).toBe("INVALID");
    expect(await links.request("subscriber@example.test")).toBe("SILENT");
    expect(mails).toHaveLength(1);
    // One sent link and one cancel; the refused second press and the silent ask record nothing.
    expect(audit.events).toEqual([
      { event: "billing.cancel_link.sent", fields: {} },
      { event: "billing.cancel", fields: { source: "EMAIL_LINK" } }
    ]);
  });

  it("sends a link for a plan paused by a card dispute, and the link cancels it with M7's paused words (P2-W10)", async () => {
    const clock = { now: new Date() };
    const { links, mails, audit } = service(clock);
    const email = `w10-${randomUUID().slice(0, 8)}@example.test`;
    const ownerRef = await account(email);
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef, planId: "PRO", activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "DE"
    });
    await suspendForChargeback(database.pool, seeded, new Date(Date.now() - DAY));
    expect(await links.request(email)).toBe("SENT");
    expect(mails).toEqual([expect.objectContaining({ to: email, templateId: "M9" })]);
    expect(await links.cancelByToken(tokenOf(mails[0]!))).toBe("CANCELLED");
    const events = await new BillingRepository(database.pool).subscriptionEvents(seeded.subscriptionId);
    expect(events.at(-1)).toMatchObject({ kind: "CANCEL_REQUESTED", data: { source: "EMAIL_LINK" } });
    expect(events.map((event) => event.kind)).not.toContain("ENDED");
    expect(foldSubscription(events)).toMatchObject({ status: "SUSPENDED", cancelRequested: true });
    const m7 = await database.pool.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM billing.outbox WHERE kind='EMAIL' AND ref LIKE $1", [`M7:${seeded.subscriptionId}%`]
    );
    expect(m7.rows.map((row) => row.payload)).toEqual([expect.objectContaining({
      "param.canUndo": "false", "param.paused": "true", "param.accessEndDate": seeded.periodEnd.toISOString().slice(0, 10)
    })]);
    // With the cancel pending, the cancel page sends no further link (nothing is left to cancel).
    expect(await links.request(email)).toBe("SILENT");
    expect(mails).toHaveLength(1);
    expect(audit.events.map(({ event }) => event)).toEqual(["billing.cancel_link.sent", "billing.cancel"]);
  });

  it("stays silent for an unknown address, an address without a live plan, a frozen account and a malformed one", async () => {
    const { links, mails, audit } = service({ now: new Date() });
    await account("free-only@example.test");
    // R3-2: an account the age gate froze gets no link, even with a live plan (open question 18); the same seeded
    // plan on an active account is sent one, which the first test proves.
    const frozen = await account("frozen@example.test", "age_frozen");
    await seedActiveSubscription(database.pool, {
      ownerRef: frozen, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
    });
    for (const email of ["nobody@example.test", "free-only@example.test", "frozen@example.test", "not-an-address"]) {
      expect(await links.request(email), email).toBe("SILENT");
    }
    expect(mails).toEqual([]);
    expect(audit.events).toEqual([]);
  });

  it("sends at most three links per account in 24 hours, then again the next day (A25)", async () => {
    const clock = { now: new Date() };
    const { links, mails } = service(clock);
    const ownerRef = await account("often@example.test");
    await seedActiveSubscription(database.pool, { ownerRef, planId: "PRO", activatedAt: new Date(Date.now() - DAY), taxCountry: "DE" });
    const outcomes = [];
    for (let attempt = 0; attempt < 4; attempt += 1) outcomes.push(await links.request("often@example.test"));
    expect(outcomes).toEqual(["SENT", "SENT", "SENT", "SILENT"]);
    clock.now = new Date(clock.now.getTime() + DAY + 60_000);
    expect(await links.request("often@example.test")).toBe("SENT");
    expect(mails).toHaveLength(4);
  });

  it("refuses a token after 24 hours", async () => {
    const clock = { now: new Date() };
    const { links, mails } = service(clock);
    const ownerRef = await account("late@example.test");
    await seedActiveSubscription(database.pool, { ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO" });
    expect(await links.request("late@example.test")).toBe("SENT");
    clock.now = new Date(clock.now.getTime() + DAY + 1_000);
    expect(await links.cancelByToken(tokenOf(mails[0]!))).toBe("INVALID");
  });

  it("sends and spends a link on a pool of ONE connection: every read under the owner lock uses the transaction's", async () => {
    const small = createPool(database.connectionString, { max: 1 });
    try {
      const clock = { now: new Date() };
      const { links, mails } = service(clock, small);
      const ownerRef = await account("one-connection@example.test");
      const seeded = await seedActiveSubscription(database.pool, {
        ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
      });
      expect(await links.request("one-connection@example.test")).toBe("SENT");
      expect(await links.cancelByToken(tokenOf(mails[0]!))).toBe("CANCELLED");
      expect(foldSubscription(await new BillingRepository(database.pool).subscriptionEvents(seeded.subscriptionId))
        .cancelRequested).toBe(true);
    } finally {
      await small.end();
    }
  }, 10_000);
});

describe("W8 (P2-I12) after the account is erased, the billing profile's address", () => {
  /** An account whose erasure has committed (P1b's helper: prepare, acknowledge, finalize), with a plan still live. */
  async function erasedWithLivePlan(label: string, profileEmail: string) {
    const erased = await createBillingTestAccount(database.pool, label);
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: erased.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO", email: profileEmail
    });
    expect(await eraseBillingTestAccount(database.pool, erased)).toBe("COMMITTED");
    return { erased, seeded };
  }

  it("matches the address kept with the billing profile on /cancel while the erased owner's plan is still live", async () => {
    const { links, mails } = service({ now: new Date() });
    const { erased } = await erasedWithLivePlan("w8-cancel", "kept@example.test");
    // Another owner's erased account and an address nobody holds stay silent.
    await erasedWithLivePlan("w8-cancel-other", "someone-else@example.test");
    expect(await links.request("nobody-at-all@example.test")).toBe("SILENT");
    expect(mails).toEqual([]);
    expect(await links.request(" Kept@Example.TEST ")).toBe("SENT");
    expect(mails).toEqual([expect.objectContaining({ to: "kept@example.test", templateId: "M9", locale: "en" })]);
    expect(await links.cancelByToken(tokenOf(mails[0]!))).toBe("CANCELLED");
    expect(foldSubscription(await new BillingRepository(database.pool).subscriptionEvents(
      (await new BillingRepository(database.pool).subscriptionForOwner(erased.ownerRef))!.subscriptionId
    )).cancelRequested).toBe(true);
  });

  it("never matches a live account's own address against an erased owner's profile", async () => {
    const { links, mails } = service({ now: new Date() });
    // The erased owner's profile holds the address a live account now has, and that live account has no plan.
    await erasedWithLivePlan("w8-reused", "reused@example.test");
    await account("reused@example.test");
    expect(await links.request("reused@example.test")).toBe("SILENT");
    expect(mails).toEqual([]);
  });

  it("sends an EMAIL job to the account's current address, and to the profile's once the account is erased", async () => {
    const billing = new BillingRepository(database.pool);
    const sent: BillingMail[] = [];
    const handler = createEmailJobHandler({
      repository: billing, recipients: new DekBillingRecipientReader(database.pool, dekStore), recordsKey: TEST_RECORDS_KEY,
      ownerReportEmail: "owner@example.test", mail: { sendTemplated: async (mail) => { sent.push(mail); } },
      attachments: new Map()
    });
    const job = (customerId: string) => {
      const request = emailJob({
        template: "M4", recipient: { kind: "CUSTOMER", customerId }, dedupeRef: randomUUID(), params: { plan: "PLUS" },
        notBefore: new Date()
      });
      return { jobId: randomUUID(), kind: "EMAIL", ref: request.ref, notBefore: request.notBefore, attempts: 1, payload: request.payload } as never;
    };
    const live = await account("lives-here-now@example.test");
    const liveSeeded = await seedActiveSubscription(database.pool, {
      ownerRef: live, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO", email: "checkout-time@example.test"
    });
    const { seeded } = await erasedWithLivePlan("w8-email-job", "kept-for-invoices@example.test");
    expect(await handler(job(liveSeeded.customerId), new Date())).toEqual({ kind: "DONE" });
    expect(await handler(job(seeded.customerId), new Date())).toEqual({ kind: "DONE" });
    expect(sent.map((mail) => mail.to)).toEqual(["lives-here-now@example.test", "kept-for-invoices@example.test"]);
  });
});
