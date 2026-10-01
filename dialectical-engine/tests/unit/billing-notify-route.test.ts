import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { buildApi } from "@debateai/api";
import type { BillingRepository } from "@debateai/db";
import { decryptNotice, XMoneyClient } from "@debateai/payments-xmoney";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import { NoticeIntake } from "../../apps/api/src/billing/notice-intake.js";
import { clientIpNetworkScope } from "../../apps/api/src/client-ip.js";
import { startFakeXMoney } from "../support/fake-xmoney.js";
import { testBillingPlans, unusedAskApplication } from "../support/billingFixtures.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
let fake: Awaited<ReturnType<typeof startFakeXMoney>>;
/** P3b's fake completes an order only for a customer it knows; the checkout would have created this one. */
let customerId: string;
beforeAll(async () => {
  fake = await startFakeXMoney();
  customerId = randomUUID();
  await new XMoneyClient({ baseUrl: fake.baseUrl, privateKey: fake.privateKey, siteId: fake.siteId })
    .createCustomer({ identifier: customerId, email: "p@example.test", country: "RO" });
});
afterAll(async () => { await fake?.stop(); });

function memory() {
  const notices: Array<Readonly<{ noticeId: string; payloadSha256: string; xmoneyEnvironment: string }>> = [];
  const jobs: Array<Readonly<{ kind: string; ref: string; payload: Readonly<Record<string, unknown>> }>> = [];
  const repository = {
    withTransaction: async <T>(work: (client: PoolClient) => Promise<T>) => work({} as PoolClient),
    insertNotice: async (_client: PoolClient, notice: { noticeId: string; payloadSha256: string; xmoneyEnvironment: string }) => {
      if (notices.some((stored) => stored.payloadSha256 === notice.payloadSha256)) return "DUPLICATE" as const;
      notices.push(notice);
      return "INSERTED" as const;
    },
    enqueue: async (_client: PoolClient, job: { kind: string; ref: string; payload: Record<string, unknown> }) => {
      jobs.push(job);
      return "job";
    }
  } as unknown as Pick<BillingRepository, "withTransaction" | "insertNotice" | "enqueue">;
  return { notices, jobs, repository };
}

function harness(overrides: Partial<{ admission: AdmissionLimiter; billing: "off"; storeDown: true }> = {}) {
  const store = memory();
  const audit = vi.fn();
  const kick = vi.fn();
  const repository = overrides.storeDown === undefined ? store.repository : {
    ...store.repository,
    withTransaction: async () => { throw new Error("the database is unreachable"); }
  } as typeof store.repository;
  const notices = new NoticeIntake({
    repository, decrypt: (value) => decryptNotice(value, fake.privateKey), audit, clock: () => NOW, kick,
    xmoneyEnvironment: "stage"
  });
  const billing: BillingRouteOptions = { plans: testBillingPlans, clock: () => NOW, legal: { requiresReacceptance: async () => false }, notices };
  const api = buildApi({
    application: unusedAskApplication(),
    ...(overrides.billing === "off" ? {} : { billing }),
    ...(overrides.admission === undefined ? {} : { admission: overrides.admission })
  });
  return { api, store, audit, kick };
}

async function noticeWithPlus() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const notice = await fake.completeOrder({
      externalOrderId: "a".repeat(32), amountDecimal: "24.20", cardCountry: "RO", succeed: true, customerIdentifier: customerId
    });
    if (notice.opensslResult.includes("+")) return notice;
  }
  throw new Error("FAKE_NOTICE_WITHOUT_PLUS");
}

const form = (value: string, encode = true) => ({
  method: "POST" as const, url: "/v1/billing/xmoney/notify",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  payload: `opensslResult=${encode ? encodeURIComponent(value) : value}`
});

describe("P9a the xMoney notice", () => {
  it("stores the decrypted notice, enqueues one check, kicks the worker and answers OK", async () => {
    const { api, store, kick } = harness();
    const notice = await noticeWithPlus();
    const response = await api.inject(form(notice.opensslResult));
    expect([response.statusCode, response.body]).toEqual([200, "OK"]);
    expect(response.headers["content-type"]).toMatch(/^text\/plain/);
    expect(store.notices).toHaveLength(1);
    // D5 5h: the notice names the xMoney system whose key decrypted it.
    expect(store.notices[0]?.xmoneyEnvironment).toBe("stage");
    expect(store.jobs).toEqual([{
      kind: "VERIFY_PAYMENT", ref: notice.transactionId, notBefore: NOW,
      payload: { notice_id: store.notices[0]!.noticeId, order_id: notice.orderId, external_order_id: notice.externalOrderId }
    }]);
    expect(kick).toHaveBeenCalledTimes(1);
    await api.close();
  });

  it("stores a repeated notice once but still asks for a check; accepts JSON and an unescaped '+'", async () => {
    const { api, store, audit } = harness();
    const notice = await noticeWithPlus();
    await api.inject(form(notice.opensslResult));
    const again = await api.inject(form(notice.opensslResult, false));
    const json = await api.inject({
      method: "POST", url: "/v1/billing/xmoney/notify", headers: { "content-type": "application/json" },
      payload: JSON.stringify({ opensslResult: notice.opensslResult })
    });
    expect([again.statusCode, json.statusCode]).toEqual([200, 200]);
    expect(store.notices).toHaveLength(1);
    expect(store.jobs.map((job) => job.payload.notice_id === null)).toEqual([false, true, true]);
    expect(audit).not.toHaveBeenCalled();
    await api.close();
  });

  it("answers OK to garbage, stores nothing and writes one content-free audit line", async () => {
    const { api, store, audit } = harness();
    for (const payload of ["opensslResult=bm90LWEtbm90aWNl%2Cbm9wZQ%3D%3D", "other=1"]) {
      const response = await api.inject({ method: "POST", url: "/v1/billing/xmoney/notify", headers: { "content-type": "application/x-www-form-urlencoded" }, payload });
      expect([response.statusCode, response.body]).toEqual([200, "OK"]);
    }
    expect(store.notices).toHaveLength(0);
    expect(store.jobs).toHaveLength(0);
    expect(audit).toHaveBeenCalledWith("billing.notice.undecryptable", {});
    await api.close();
  });

  it("keeps every other route's 415 for form bodies and refuses a notice over 64 KiB", async () => {
    const { api } = harness();
    const asks = await api.inject({ method: "POST", url: "/v1/asks", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "question_line=hello" });
    expect([asks.statusCode, asks.json()]).toEqual([415, { error: "UNSUPPORTED_MEDIA_TYPE", message: "UNSUPPORTED_MEDIA_TYPE" }]);
    const huge = await api.inject(form("A".repeat(70_000)));
    expect([huge.statusCode, huge.json()]).toEqual([413, { error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE" }]);
    await api.close();
  });

  it("answers 404 when billing is off, and 429 to a source over the notice budget, keyed by its /64", async () => {
    const off = harness({ billing: "off" });
    expect((await off.api.inject(form("x"))).statusCode).toBe(404);
    await off.api.close();
    const decide = vi.fn((_scope: string, _key: string, _at: Date) =>
      ({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 60_000 }));
    const limited = harness({ admission: { configured: () => true, decide } as unknown as AdmissionLimiter });
    const address = "2001:db8:1:2:3:4:5:6";
    expect((await limited.api.inject({ ...form("x"), remoteAddress: address })).statusCode).toBe(429);
    expect(decide).toHaveBeenCalledWith("billingNotify", clientIpNetworkScope(address), expect.any(Date));
    expect(clientIpNetworkScope(address)).not.toBe(address);
    // Two addresses of one /64 share one bucket (DL5-F3): the second is counted against the same key.
    expect((await limited.api.inject({ ...form("x"), remoteAddress: "2001:db8:1:2:ffff::9" })).statusCode).toBe(429);
    expect(decide.mock.calls.map((call) => call[1])).toEqual(["2001:db8:1:2::/64", "2001:db8:1:2::/64"]);
    expect(limited.store.notices).toHaveLength(0);
    await limited.api.close();
  });

  it("answers 500 when the notice cannot be stored, so xMoney sends it again, and kicks nothing (Q-2)", async () => {
    const { api, kick } = harness({ storeDown: true });
    const notice = await noticeWithPlus();
    const response = await api.inject(form(notice.opensslResult));
    expect([response.statusCode, response.json()]).toEqual([500, { error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" }]);
    expect(response.body).not.toBe("OK");
    expect(kick).not.toHaveBeenCalled();
    await api.close();
  });
});
