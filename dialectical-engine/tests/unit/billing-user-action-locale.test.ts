import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { foldSubscription, type SubscriptionEvent } from "@debateai/billing-core";
import { createEmailBlindIndex, normalizeEmailForBlindIndex } from "@debateai/crypto";
import type { OutboxJob } from "@debateai/db";
import { CancelLinkService } from "../../apps/api/src/billing/cancel-link.js";
import { createEmailJobHandler, emailJob, type BillingMail } from "../../apps/api/src/billing/email-job.js";
import { sealBillingProfile, type BillingProfile } from "../../apps/api/src/billing/records.js";
import { requestCancelLocked } from "../../apps/api/src/billing/subscription-actions.js";
import type { LockedSubscription } from "../../apps/api/src/billing/subscription-core.js";
import { installSubscriptionRoutes } from "../../apps/api/src/billing/subscription-routes.js";
import { recordWithdrawal } from "../../apps/api/src/billing/withdrawal.js";
import { activeSubscriptionEvents, testBillingPlans, testBillingPolicy } from "../support/billingFixtures.js";

// S01-C13 (R-09, R-12, R-17, R-18, R-46): a user-action row carries the request's mail language in its payload
// `locale`, and the key is written only when the caller passes one. A customer row sends the payload's language and
// falls back to the billing profile's. Owner rows keep English. M9 is sent at once (not queued), so its language is
// the send's own. The routes read the dropdown cookie (R-06: no cookie is `en`). Everything here is DB-free: the
// billing repository is a recording fake, and the real functions under test run unchanged.

const NOW = new Date("2026-10-12T10:00:00.000Z");
const WITHDREW = new Date(NOW.getTime() + 2 * 86_400_000);
const KEY = randomBytes(32);
const BLIND_KEY = randomBytes(32);
const OWNER = randomUUID();
const CUSTOMER = randomUUID();
const PUBLIC_URL = "https://app.example.test";
const client = { query: async () => ({ rows: [] }) } as unknown as PoolClient;

type Enqueued = Readonly<{
  kind: string; ref: string; notBefore: Date; payload: Readonly<Record<string, string | number | boolean | null>>;
}>;

const profile = (locale: string): BillingProfile => ({
  email: "buyer@example.test", locale, name: null, firstName: null, lastName: null, phone: null, paymentIp: null,
  country: "RO", region: null, postalCode: null, city: null, street: null, company: null
});

function latestRow(locale: string) {
  const sealed = sealBillingProfile(KEY, CUSTOMER, profile(locale));
  return { profileCiphertext: sealed.ciphertext, keyId: sealed.keyId, at: NOW, locale };
}

/**
 * One ACTIVE PLUS subscription paid by one INITIAL charge (RO, so withdrawal is open). `paid` adds one succeeded
 * payment, so a withdrawal is due a refund (M8_RECEIVED); without it nothing is due back (M8).
 */
function world(paid: boolean) {
  const jobs: Enqueued[] = [];
  const events: SubscriptionEvent[] = activeSubscriptionEvents(OWNER, NOW, "PLUS");
  const state = foldSubscription(events);
  const initial = {
    chargeId: randomUUID(), ownerRef: OWNER, subscriptionId: state.subscriptionId, kind: "INITIAL", attempt: 1,
    periodStart: NOW, periodEnd: new Date(NOW.getTime() + 30 * 86_400_000), quoteId: randomUUID(), netMicros: 20_000_000,
    taxMicros: 4_200_000, totalMicros: 24_200_000, currency: "USD", createdAt: NOW, paymentProvider: "netopia",
    paymentEnvironment: "sandbox"
  };
  const succeeded = paid ? [Object.freeze({
    eventId: randomUUID(), chargeId: initial.chargeId, kind: "SUCCEEDED", at: NOW, providerPaymentId: "ntp-s01-c13",
    amountMicros: 24_200_000, errorCode: null, paymentProvider: "netopia", paymentEnvironment: "sandbox",
    refundsTransactionId: null
  })] : [];
  const billing = {
    subscriptionForOwner: async () => state,
    subscriptionEvents: async () => events,
    chargesForSubscription: async () => [initial],
    charge: async () => ({ ...initial, events: succeeded }),
    quote: async () => ({ taxCountry: "RO" }),
    customerByOwner: async () => ({ customerId: CUSTOMER }),
    appendSubscriptionEvent: async () => undefined,
    consumeWithdrawalGrant: async () => true,
    withTransaction: async (fn: (c: PoolClient) => Promise<unknown>) => fn(client),
    enqueue: async (_client: PoolClient, job: Enqueued) => { jobs.push(job); return randomUUID(); }
  };
  const cancelLinks = { request: vi.fn(async () => "SENT" as const), cancelByToken: vi.fn(async () => "CANCELLED" as const) };
  const deps = {
    billing,
    jobs: { lockOwner: async () => undefined },
    entitlements: { current: async () => ({ planId: "PLUS", monthCreditOverrideMicros: null }), append: async () => undefined },
    plans: testBillingPlans,
    policy: testBillingPolicy,
    ownerSpend: { readWithdrawalSpend: async () => ({ spentMicros: 0, liveRuns: 0 }) },
    refunds: { requestAll: async () => undefined },
    audit: () => undefined,
    clock: () => WITHDREW,
    kick: () => undefined,
    paymentEnvironment: "sandbox",
    publicAppUrl: PUBLIC_URL,
    cancelLinks
  };
  return { jobs, events, deps, cancelLinks };
}

/** M7: the Settings cancel, through the shared requestCancelLocked the emailed link also uses. */
async function cancelMail(mailLocale?: string): Promise<Enqueued | undefined> {
  const w = world(false);
  const locked: LockedSubscription = { state: foldSubscription(w.events), events: Object.freeze([...w.events]) };
  const outcome = await requestCancelLocked(w.deps as never, client, locked, WITHDREW, "SETTINGS", mailLocale);
  expect(outcome).toBe("REQUESTED");
  return w.jobs.find((job) => job.payload.template === "M7");
}

/** M8 (nothing due back) or M8_RECEIVED (a refund is due, from one succeeded payment), through recordWithdrawal. */
async function withdrawalMail(input: Readonly<{ paid: boolean; mailLocale?: string }>): Promise<Enqueued | undefined> {
  const w = world(input.paid);
  await recordWithdrawal(w.deps as never, {
    ownerRef: OWNER, withdrewAt: WITHDREW, source: "SETTINGS", authorize: async () => undefined,
    ...(input.mailLocale === undefined ? {} : { mailLocale: input.mailLocale })
  });
  return w.jobs.find((job) => job.payload.template === "M8" || job.payload.template === "M8_RECEIVED");
}

/** M9: the cancel link, sent at once by CancelLinkService.request. */
async function linkMail(profileLocale: string, mailLocale?: string): Promise<BillingMail | undefined> {
  const sent: BillingMail[] = [];
  const state = foldSubscription(activeSubscriptionEvents(OWNER, NOW, "PLUS"));
  const service = new CancelLinkService({
    billing: {
      subscriptionForOwner: async () => state,
      customerByOwner: async () => ({ customerId: CUSTOMER }),
      latestProfile: async () => latestRow(profileLocale),
      withTransaction: async (fn: (c: PoolClient) => Promise<unknown>) => fn(client),
      cancelTokensIssuedForOwnerSince: async () => 0,
      insertCancelToken: async () => undefined
    } as never,
    jobs: { lockOwner: async () => undefined } as never,
    entitlements: { append: async () => undefined } as never,
    identities: { ownerRefByEmailBlindIndex: async () => OWNER },
    blindIndexKey: BLIND_KEY,
    recordsKey: KEY,
    recipients: { currentAddress: async () => "subscriber@example.test" },
    mail: { sendTemplated: async (mail: BillingMail) => { sent.push(mail); } },
    publicAppUrl: PUBLIC_URL,
    audit: () => undefined,
    clock: () => NOW
  });
  expect(await service.request("subscriber@example.test", mailLocale)).toBe("SENT");
  return sent[0];
}

/**
 * The emailed link end to end: a link is issued (M9, sent at once) and spent by cancelByToken, which queues M7 through
 * the same requestCancelLocked the Settings cancel uses. Tokens and the one-use rule are kept in memory.
 */
function linkService(profileLocale: string) {
  const sent: BillingMail[] = [];
  const jobs: Enqueued[] = [];
  const tokens = new Map<string, { subscriptionId: string; expiresAt: Date; used: boolean }>();
  const events = activeSubscriptionEvents(OWNER, NOW, "PLUS");
  const state = foldSubscription(events);
  const billing = {
    subscriptionForOwner: async () => state,
    subscriptionEvents: async () => events,
    customerByOwner: async () => ({ customerId: CUSTOMER }),
    latestProfile: async () => latestRow(profileLocale),
    chargesForSubscription: async () => [],
    appendSubscriptionEvent: async () => undefined,
    withTransaction: async (fn: (c: PoolClient) => Promise<unknown>) => fn(client),
    cancelTokensIssuedForOwnerSince: async () => 0,
    insertCancelToken: async (_c: PoolClient, row: { tokenSha256: string; subscriptionId: string; expiresAt: Date }) => {
      tokens.set(row.tokenSha256, { subscriptionId: row.subscriptionId, expiresAt: row.expiresAt, used: false });
    },
    useCancelToken: async (_c: PoolClient, sha256: string, now: Date) => {
      const row = tokens.get(sha256);
      if (row === undefined || row.used || row.expiresAt.getTime() <= now.getTime()) return null;
      row.used = true;
      return { subscriptionId: row.subscriptionId };
    },
    enqueue: async (_c: PoolClient, job: Enqueued) => { jobs.push(job); return randomUUID(); }
  };
  const service = new CancelLinkService({
    billing: billing as never, jobs: { lockOwner: async () => undefined } as never,
    entitlements: { append: async () => undefined } as never, identities: { ownerRefByEmailBlindIndex: async () => OWNER },
    blindIndexKey: BLIND_KEY, recordsKey: KEY, recipients: { currentAddress: async () => "subscriber@example.test" },
    mail: { sendTemplated: async (mail: BillingMail) => { sent.push(mail); } }, publicAppUrl: PUBLIC_URL,
    audit: () => undefined, clock: () => NOW
  });
  return { service, sent, jobs };
}

/** The EMAIL job's handler, as the outbox worker runs it, against one billing profile. */
function handlerFor(profileLocale: string) {
  const sent: BillingMail[] = [];
  const handler = createEmailJobHandler({
    repository: { latestProfile: async () => latestRow(profileLocale) } as never,
    recipients: { currentAddress: async () => "buyer@example.test" },
    recordsKey: KEY,
    ownerReportEmail: "owner@example.test",
    mail: { sendTemplated: async (mail: BillingMail) => { sent.push(mail); } },
    attachments: new Map()
  });
  return { handler, sent };
}

const asJob = (request: ReturnType<typeof emailJob>): OutboxJob => ({
  jobId: randomUUID(), kind: "EMAIL", ref: request.ref, notBefore: NOW, attempts: 1, payload: request.payload
} as unknown as OutboxJob);

/** The Fastify app of the subscriber's routes, the session set by the test header as the production hook does. */
async function routes(paid: boolean) {
  const w = world(paid);
  const session = { ownerRef: OWNER, userId: randomUUID(), session: { session_id: randomUUID() } };
  const api = Fastify({ logger: false });
  api.decorateRequest("authenticatedSession");
  api.addHook("preHandler", async (request) => {
    if (request.headers["x-test-session"] === "yes") request.authenticatedSession = session as never;
  });
  installSubscriptionRoutes(
    api, w.deps as never, () => Object.freeze({ config: Object.freeze({ auth: "user" as const }) }),
    { gate: () => true } as never,
    () => Object.freeze({ ip: "192.0.2.10", userAgent: "s01-c13" })
  );
  await api.ready();
  return { api, jobs: w.jobs, cancelLinks: w.cancelLinks };
}

describe("S01-C13 the user-action rows carry the request's language", () => {
  it("writes the payload key only when the caller passes a language", () => {
    const withLocale = emailJob({
      template: "M8", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "sub-1",
      params: { plan: "PLUS" }, notBefore: NOW, locale: "ro"
    });
    expect(withLocale.payload.locale).toBe("ro");
    const without = emailJob({
      template: "M8", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "sub-1",
      params: { plan: "PLUS" }, notBefore: NOW
    });
    expect(without.payload).not.toHaveProperty("locale");
  });

  it("M7 (cancel) carries the cancel request's language, and no key when the caller passes none", async () => {
    expect((await cancelMail("ro"))?.payload.locale).toBe("ro");
    expect((await cancelMail("en-GB"))?.payload.locale).toBe("en-GB");
    expect((await cancelMail())?.payload).not.toHaveProperty("locale");
  });

  it("M9 (cancel link) is sent in the link request's language, the profile's when the request names none", async () => {
    expect((await linkMail("pl", "ro"))?.locale).toBe("ro");
    expect((await linkMail("pl"))?.locale).toBe("pl");
  });

  it("M7 from the emailed link carries the link page's language, spent by cancelByToken (R-17)", async () => {
    const { service, sent, jobs } = linkService("pl");
    expect(await service.request("subscriber@example.test", "ro")).toBe("SENT");
    const token = new URL(sent[0]!.params.cancelLinkUrl!).hash.slice("#token=".length);
    expect(await service.cancelByToken(token, "ro")).toBe("CANCELLED");
    expect(jobs.find((job) => job.payload.template === "M7")?.payload.locale).toBe("ro");
  });

  it("M8 (withdraw, nothing due back) carries the withdraw request's language", async () => {
    const job = await withdrawalMail({ paid: false, mailLocale: "ro" });
    expect(job?.payload.template).toBe("M8");
    expect(job?.payload.locale).toBe("ro");
  });

  it("M8_RECEIVED (withdraw, refund due) carries the withdraw request's language", async () => {
    const job = await withdrawalMail({ paid: true, mailLocale: "ro" });
    expect(job?.payload.template).toBe("M8_RECEIVED");
    expect(job?.payload.locale).toBe("ro");
  });

  it("a withdrawal with no request language (the owner's command) writes no key and keeps the profile's language", async () => {
    const job = await withdrawalMail({ paid: true });
    expect(job?.payload.template).toBe("M8_RECEIVED");
    expect(job?.payload).not.toHaveProperty("locale");
  });

  it("a customer row sends the payload's language over the profile's", async () => {
    const { handler, sent } = handlerFor("ro");
    const request = emailJob({
      template: "M7", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "sub-2",
      params: { plan: "PLUS" }, notBefore: NOW, locale: "pl"
    });
    expect(await handler(asJob(request), NOW)).toEqual({ kind: "DONE" });
    expect(sent[0]).toMatchObject({ templateId: "M7", locale: "pl" });
  });

  it("a customer row with no payload key sends the profile's language (R-18 system rows)", async () => {
    const { handler, sent } = handlerFor("ro");
    const request = emailJob({
      template: "M3", recipient: { kind: "CUSTOMER", customerId: CUSTOMER }, dedupeRef: "sub-3",
      params: { plan: "PLUS" }, notBefore: NOW
    });
    expect(await handler(asJob(request), NOW)).toEqual({ kind: "DONE" });
    expect(sent[0]).toMatchObject({ templateId: "M3", locale: "ro" });
  });

  it("an owner row stays English even when its payload names a language (R-46)", async () => {
    const { handler, sent } = handlerFor("ro");
    const request = emailJob({
      template: "O1", recipient: { kind: "OWNER" }, dedupeRef: "owner-1", params: {}, notBefore: NOW, locale: "pl"
    });
    expect(await handler(asJob(request), NOW)).toEqual({ kind: "DONE" });
    expect(sent[0]).toMatchObject({ templateId: "O1", locale: "en" });
  });
});

describe("S01-C13 the subscriber's routes read the dropdown cookie (R-09, R-06)", () => {
  const SESSION_HEADER = { "x-test-session": "yes" };

  it("Settings cancel sends the cookie's language to M7", async () => {
    const { api, jobs } = await routes(false);
    const response = await api.inject({
      method: "POST", url: "/v1/billing/subscription/cancel",
      headers: { ...SESSION_HEADER, cookie: "theme=dark; debateai.locale=ro" }
    });
    expect(response.statusCode).toBe(204);
    expect(jobs.find((job) => job.payload.template === "M7")?.payload.locale).toBe("ro");
  });

  it("Settings cancel with no cookie sends English to M7 (R-06, the request's value is en)", async () => {
    const { api, jobs } = await routes(false);
    const response = await api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers: SESSION_HEADER });
    expect(response.statusCode).toBe(204);
    expect(jobs.find((job) => job.payload.template === "M7")?.payload.locale).toBe("en");
  });

  it("Settings withdraw sends the cookie's language to M8", async () => {
    const { api, jobs } = await routes(false);
    const response = await api.inject({
      method: "POST", url: "/v1/billing/subscription/withdraw",
      headers: { ...SESSION_HEADER, cookie: "debateai.locale=ja" },
      payload: { step_up_grant: "A".repeat(43) }
    });
    expect(response.statusCode).toBe(200);
    expect(jobs.find((job) => job.payload.template === "M8")?.payload.locale).toBe("ja");
  });

  it("the cancel link sends the cookie's language to M9, and the cancel-by-token answer passes it to M7", async () => {
    const { api, cancelLinks } = await routes(false);
    const link = await api.inject({
      method: "POST", url: "/v1/billing/cancel-link", headers: { cookie: "debateai.locale=de" },
      payload: { email: "subscriber@example.test" }
    });
    expect(link.statusCode).toBe(202);
    await new Promise((resolve) => setImmediate(resolve));
    expect(cancelLinks.request).toHaveBeenCalledWith("subscriber@example.test", "de");
    const byToken = await api.inject({
      method: "POST", url: "/v1/billing/cancel-by-token", headers: { cookie: "debateai.locale=sv" },
      payload: { token: "B".repeat(43) }
    });
    expect(byToken.statusCode).toBe(204);
    expect(cancelLinks.cancelByToken).toHaveBeenCalledWith("B".repeat(43), "sv");
  });
});
