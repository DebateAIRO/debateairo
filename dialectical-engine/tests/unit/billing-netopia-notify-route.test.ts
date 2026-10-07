// tests/unit/billing-netopia-notify-route.test.ts
// N9 (spec 2026-10-05 §2.7.1, §2.7.2): the transport of NETOPIA's message. The intake is scripted here; the real one
// (verification, storage, admission order) is driven in tests/integration/billing-netopia-intake.test.ts.
import { describe, expect, it, vi } from "vitest";
import { authorizationPolicyInventory, buildApi } from "@debateai/api";
import { contractInventory } from "@debateai/contract";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { BILLING_ROUTE_PATHS, NETOPIA_NOTIFY_PATH, type BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import type { NetopiaNoticeIntakePort, NoticeAnswer, NoticeArrival } from "../../apps/api/src/billing/netopia-intake.js";
import { clientIpNetworkScope } from "../../apps/api/src/client-ip.js";
import { testBillingPlans, unusedAskApplication } from "../support/billingFixtures.js";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const OK: NoticeAnswer = Object.freeze({ status: 200, body: "{\"errorType\":0,\"errorCode\":0,\"errorMessage\":\"OK\"}" });
const RETRY: NoticeAnswer = Object.freeze({ status: 503, body: "{\"errorType\":1,\"errorCode\":268435714,\"errorMessage\":\"retry\"}" });
const HEADER = ["eyJhbGciOiJSUzUxMiJ9", "eyJhdWQiOiJ4In0", "c2lnbmF0dXJl"].join(".");
const BODY = Buffer.from(`{ "payment": { "status": 3, "message": "Plată aprobată" },\n  "order": { "orderID": "${"a".repeat(32)}" } }`, "utf8");

function harness(answer: (arrival: NoticeArrival) => NoticeAnswer, overrides: Partial<{ admission: AdmissionLimiter; billing: "off" }> = {}) {
  const arrivals: NoticeArrival[] = [];
  const intake: NetopiaNoticeIntakePort = {
    receive: async (arrival) => {
      arrivals.push(arrival);
      return answer(arrival);
    }
  };
  const billing: BillingRouteOptions = {
    plans: testBillingPlans, clock: () => NOW, legal: { requiresReacceptance: async () => false }, netopiaNotices: intake
  };
  const api = buildApi({
    application: unusedAskApplication(),
    ...(overrides.billing === "off" ? {} : { billing }),
    ...(overrides.admission === undefined ? {} : { admission: overrides.admission })
  });
  return { api, arrivals };
}

const notice = (headers: Record<string, string>, payload: Buffer = BODY) =>
  ({ method: "POST" as const, url: NETOPIA_NOTIFY_PATH, headers, payload, remoteAddress: "2001:db8:1:2:3:4:5:6" });

describe("N9 POST /v1/billing/netopia/notify", () => {
  it("hands the intake the exact bytes received, whatever the content type, with the header in any letter case", async () => {
    const { api, arrivals } = harness(() => OK);
    const types = [
      "application/json", "application/json; charset=utf-8", "text/plain", "application/x-www-form-urlencoded",
      "application/octet-stream", undefined
    ];
    for (const type of types) {
      const response = await api.inject(notice({ ...(type === undefined ? {} : { "content-type": type }), "Verification-Token": HEADER }));
      expect([response.statusCode, response.body], String(type)).toEqual([200, OK.body]);
      expect(response.headers["content-type"]).toMatch(/^application\/json/u);
    }
    expect(arrivals).toHaveLength(types.length);
    for (const arrival of arrivals) {
      expect(arrival.rawBody.equals(BODY)).toBe(true);
      expect(arrival.header).toBe(HEADER);
      expect(arrival.sourceKey).toBe(clientIpNetworkScope("2001:db8:1:2:3:4:5:6"));
      expect(arrival.now).toEqual(NOW);
      expect(typeof arrival.admit).toBe("function");
    }
    await api.inject(notice({ "content-type": "application/json", "VERIFICATION-TOKEN": HEADER }));
    await api.inject(notice({ "content-type": "application/json" }, Buffer.alloc(0)));
    expect(arrivals.at(-2)?.header).toBe(HEADER);
    expect([arrivals.at(-1)?.header, arrivals.at(-1)?.rawBody.length]).toEqual([undefined, 0]);
    await api.close();
  });

  it("answers what the intake decided, as JSON, and refuses a body over 64 KiB before the intake", async () => {
    const { api, arrivals } = harness(() => RETRY);
    const response = await api.inject(notice({ "content-type": "application/json", "verification-token": HEADER }));
    expect([response.statusCode, response.body]).toEqual([503, RETRY.body]);
    expect(response.headers["content-type"]).toMatch(/^application\/json/u);
    const huge = await api.inject(notice({ "content-type": "application/json" }, Buffer.alloc(70_000, 0x41)));
    expect([huge.statusCode, huge.json()]).toEqual([413, { error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE" }]);
    expect(arrivals).toHaveLength(1);
    await api.close();
  });

  it("keeps every other route's JSON parsing and 415s: the private media type is the notify route's alone", async () => {
    const { api } = harness(() => OK);
    for (const type of ["application/vnd.debateai.netopia-notice", "application/x-www-form-urlencoded"]) {
      const asks = await api.inject({ method: "POST", url: "/v1/asks", headers: { "content-type": type }, payload: "question_line=hello" });
      expect([asks.statusCode, asks.json()], type).toEqual([415, { error: "UNSUPPORTED_MEDIA_TYPE", message: "UNSUPPORTED_MEDIA_TYPE" }]);
    }
    await api.close();
  });

  it("charges the billingNotify budget only when the intake asks (a rejected message), keyed by the source's /64", async () => {
    const decide = vi.fn((_scope: string, _key: string, _at: Date) =>
      ({ allowed: false, reason: "LIMIT", retryAfterMs: 2_000, windowMs: 60_000 }));
    const admission = { configured: () => true, decide } as unknown as AdmissionLimiter;
    const verified = harness(() => OK, { admission });
    expect((await verified.api.inject(notice({ "verification-token": HEADER }))).statusCode).toBe(200);
    expect(decide).not.toHaveBeenCalled();
    await verified.api.close();
    const rejected = harness((arrival) => (arrival.admit?.() === false
      ? { status: 429, body: "{\"error\":\"ADMISSION_RATE_LIMITED\",\"message\":\"ADMISSION_RATE_LIMITED\"}" } : RETRY), { admission });
    const limited = await rejected.api.inject(notice({ "verification-token": HEADER }));
    expect([limited.statusCode, limited.json()]).toEqual([429, { error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }]);
    expect(limited.headers["retry-after"]).toBe("2");
    expect(decide).toHaveBeenCalledWith("billingNotify", "2001:db8:1:2::/64", expect.any(Date));
    await rejected.api.close();
  });

  it("is always registered: 404 when billing is off, public in the policy table, in the contract, after xMoney's route", async () => {
    const { api } = harness(() => OK, { billing: "off" });
    expect(api.hasRoute({ method: "POST", url: NETOPIA_NOTIFY_PATH })).toBe(true);
    expect((await api.inject(notice({ "verification-token": HEADER }))).statusCode).toBe(404);
    await api.close();
    expect(authorizationPolicyInventory).toContainEqual(
      { route: "POST /v1/billing/netopia/notify", auth: "public", resource: "billing", action: "notify" });
    const paths = BILLING_ROUTE_PATHS as readonly string[];
    expect(paths.indexOf("POST /v1/billing/netopia/notify")).toBe(paths.indexOf("POST /v1/billing/xmoney/notify") + 1);
    const routes = contractInventory.routes as readonly string[];
    expect(routes.indexOf("POST /v1/billing/netopia/notify")).toBe(routes.indexOf("POST /v1/billing/xmoney/notify") + 1);
  });
});
