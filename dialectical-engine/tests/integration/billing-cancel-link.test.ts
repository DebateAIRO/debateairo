import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmailBlindIndex } from "@debateai/crypto";
import {
  BillingJobQueries, BillingRepository, createPool, EntitlementRepository, PostgresIdentityRepository, migrate, type Pool
} from "@debateai/db";
import { foldSubscription } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { recordingAudit, seedActiveSubscription, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { CancelLinkService, cancelTokenSha256 } from "../../apps/api/src/billing/cancel-link.js";
import type { BillingMail } from "../../apps/api/src/billing/email-job.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const BLIND_INDEX_KEY = Buffer.alloc(32, 3);
const DAY = 86_400_000;

/** An account in `state` (0077's user_state_check admits `age_frozen`, R3-2). */
async function account(email: string, state: "active" | "age_frozen" = "active"): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,
      pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,$7,clock_timestamp(),clock_timestamp())
  `, [randomUUID(), createEmailBlindIndex(BLIND_INDEX_KEY, email), "$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$AAAA",
    `p13-${randomUUID()}`, randomUUID(), ownerRef, state]);
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
    mail: { sendTemplated: async (mail) => { mails.push(mail); } },
    publicAppUrl: TEST_PUBLIC_APP_URL,
    audit,
    clock: () => clock.now
  });
  return { links, mails, audit };
}

const tokenOf = (mail: BillingMail): string => new URL(mail.params.cancelLinkUrl!).hash.slice("#token=".length);

describe("P13 the cancel link on real PostgreSQL", () => {
  it("sends one link to the billing address, stores only its hash, and cancels once through it", async () => {
    const clock = { now: new Date() };
    const { links, mails, audit } = service(clock);
    const ownerRef = await account("Subscriber@Example.test");
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * DAY), taxCountry: "RO", email: "billing@example.test"
    });
    expect(await links.request("  subscriber@example.TEST ")).toBe("SENT");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "billing@example.test", templateId: "M9", locale: "en", attachments: [] });
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
