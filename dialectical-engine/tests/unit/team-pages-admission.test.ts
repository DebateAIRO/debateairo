/**
 * Owner ruling 2026-11-07 (CodeQL js/missing-rate-limiting on apps/api/src/staff/routes.ts): every team page charges the
 * signed-in person's own `staffRequests` admission budget when the register version in force seals one. That covers each
 * route of the staff inventory, whether it asks for a team member or for any signed-in person (enrollment, invitations).
 * The charge comes in the sign-in hook, after the session and its CSRF pair and before the team key, the capability or any
 * team read. The deployment admission row carries the budget. The sealed B10 row and every version published before this
 * ruling carry none, and on those the team pages behave exactly as before.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue,
  type AdmissionPolicy
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { parseHostedRegisterFile, planHostedRegisterPublication } from "../../apps/runner/src/hosted-register-publish.js";
import { staffAuthorizationPolicyInventory } from "../../apps/api/src/staff/routes.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";

const TEAM_PAGES = Object.freeze({ key: "owner" as const, limit: 2, window_ms: 60_000, capacity: 1_024 });
const REFUSED = Object.freeze({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });

/** The admission refusals the API logged, whatever else went to the error log. */
function refusals(log: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return log.mock.calls.flatMap(([line]) => {
    try {
      const value = JSON.parse(String(line)) as Record<string, unknown>;
      return value.event === "api.admission.refused" ? [value] : [];
    } catch {
      return [];
    }
  });
}

function withBudget(budget: unknown): AdmissionPolicy {
  return admissionPolicyFromValue({ ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, staff_requests: budget }, "team pages fixture");
}

function withoutBudget(): AdmissionPolicy {
  const { staff_requests: _dropped, ...value } = ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value;
  return admissionPolicyFromValue(value, "team pages fixture, a version published before the ruling");
}

describe("the register's staff_requests budget", () => {
  it("is sealed per signed-in person by the deployment row, and absent from the sealed B10 row", () => {
    const published = admissionPolicyFromValue(
      ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    expect(published.staffRequests).toEqual({ key: "owner", limit: 120, windowMs: 60_000, capacity: 65_536 });
    expect(Object.isFrozen(published.staffRequests)).toBe(true);
    expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef)
      .toContain(" + team pages staff_requests (owner ruling 2026-11-07), V ratification pending (V-1)");
    expect(new AdmissionLimiter(published).configured("staffRequests")).toBe(true);
    expect(Object.hasOwn(ADMISSION_POLICY_REGISTER_ROW.value, "staff_requests")).toBe(false);
    const sealed = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
    expect(sealed.staffRequests).toBeNull();
    expect(new AdmissionLimiter(sealed).configured("staffRequests")).toBe(false);
  });

  it("rides into the next hosted settings publish inside the code-owned admission row", async () => {
    const example = await readFile(new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url));
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(example));
    const admission = plan.rows.find((row) => row.rowKey === "admissionPolicy");
    expect(admission).toBeDefined();
    expect((JSON.parse(admission!.valueJsonText) as Record<string, unknown>).staff_requests)
      .toEqual({ key: "owner", limit: 120, window_ms: 60_000, capacity: 65_536 });
  });

  it("refuses a budget keyed by source, outside the register's bounds, or with a member it does not know", () => {
    for (const broken of [
      { ...TEAM_PAGES, key: "source" },
      { ...TEAM_PAGES, limit: 0 },
      { ...TEAM_PAGES, window_ms: 24 * 60 * 60_000 + 1 },
      { ...TEAM_PAGES, capacity: 1_048_577 },
      { ...TEAM_PAGES, windowMs: 60_000 }
    ]) {
      expect(() => withBudget(broken)).toThrow(expect.objectContaining({ code: "ADMISSION_POLICY_INVALID" }));
    }
  });
});

describe("every team page charges the signed-in person's staffRequests budget", () => {
  function harness(policy: AdmissionPolicy, identities: readonly TestHttpIdentity[]) {
    let now = new Date("2026-11-07T12:00:00.000Z");
    // No team composition: the routes still exist (policy version 2), a member route answers 401 at the team key and a
    // signed-in route 503 in its handler, so any 429 below can only be the budget, charged before both.
    const api = buildApi({
      application: {} as AskApplication,
      sessions: testSessionApplication(identities),
      allowedOrigin: TEST_APP_ORIGIN,
      staffPolicyVersion: 2,
      admission: new AdmissionLimiter(policy),
      admissionClock: () => now
    });
    const refusalLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    return {
      refusalLog,
      advance: (ms: number) => { now = new Date(now.getTime() + ms); },
      send: (who: TestHttpIdentity, method: "GET" | "POST" | "PATCH" | "DELETE", url: string) => {
        const mutating = method !== "GET";
        return api.inject({
          method, url, headers: testSessionHeaders(who, mutating), ...(mutating ? { payload: {} } : {})
        });
      },
      close: async () => { refusalLog.mockRestore(); await api.close(); }
    };
  }

  it("refuses 429 with the wait once a person has spent it, across team and signed-in team routes, per person", async () => {
    const memberA = testHttpIdentity("team-pages-a"), memberB = testHttpIdentity("team-pages-b");
    const h = harness(withBudget(TEAM_PAGES), [memberA, memberB]);
    try {
      expect((await h.send(memberA, "GET", "/v1/admin/enrollment")).statusCode).toBe(503);
      expect((await h.send(memberA, "GET", "/v1/admin/team")).json()).toEqual({ error: "STAFF_AUTHORITY_INVALID" });
      const refused = await h.send(memberA, "GET", "/v1/admin/team");
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSED);
      expect(refused.headers["retry-after"]).toBe("60");
      expect((await h.send(memberA, "GET", "/v1/admin/enrollment")).statusCode).toBe(429);
      // The refusal is logged once per window, with the route and never the person.
      const logged = refusals(h.refusalLog);
      expect(logged).toEqual([
        { event: "api.admission.refused", route: "GET /v1/admin/team", reason: "LIMIT", windowMs: 60_000 },
        { event: "api.admission.refused", route: "GET /v1/admin/enrollment", reason: "LIMIT", windowMs: 60_000 }
      ]);
      expect(JSON.stringify(logged)).not.toContain(memberA.authenticated.ownerRef);
      // Another person keeps their own budget; the window's end gives the first one theirs back.
      expect((await h.send(memberB, "GET", "/v1/admin/team")).statusCode).toBe(401);
      h.advance(60_000);
      expect((await h.send(memberA, "GET", "/v1/admin/enrollment")).statusCode).toBe(503);
    } finally {
      await h.close();
    }
  });

  it("charges every route of the staff inventory, and nothing outside it", async () => {
    const people = staffAuthorizationPolicyInventory.map((_, index) => testHttpIdentity(`team-pages-route-${index}`));
    const outsider = testHttpIdentity("team-pages-outsider");
    const h = harness(withBudget({ ...TEAM_PAGES, limit: 1 }), [...people, outsider]);
    try {
      for (const [index, policy] of staffAuthorizationPolicyInventory.entries()) {
        const [method, path] = policy.route.split(" ") as ["GET" | "POST" | "PATCH" | "DELETE", string];
        const url = path.replace(/\{[A-Za-z]+\}/g, "00000000-0000-4000-8000-000000000001");
        const first = await h.send(people[index]!, method, url);
        expect(first.statusCode, policy.route).not.toBe(429);
        expect(first.statusCode, policy.route).not.toBe(404);
        const second = await h.send(people[index]!, method, url);
        expect(second.statusCode, policy.route).toBe(429);
        expect(second.json(), policy.route).toEqual(REFUSED);
      }
      // A signed-in page outside the team pages never charges the team budget, however often it is read.
      for (let index = 0; index < 3; index += 1) {
        expect((await h.send(outsider, "GET", "/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=1")).statusCode)
          .not.toBe(429);
      }
      expect((await h.send(outsider, "GET", "/v1/admin/enrollment")).statusCode).toBe(503);
    } finally {
      await h.close();
    }
  });

  it("changes nothing while the version in force seals no team budget", async () => {
    const member = testHttpIdentity("team-pages-unsealed");
    const h = harness(withoutBudget(), [member]);
    try {
      for (let index = 0; index < 5; index += 1) {
        expect((await h.send(member, "GET", "/v1/admin/team")).statusCode).toBe(401);
        expect((await h.send(member, "GET", "/v1/admin/enrollment")).statusCode).toBe(503);
      }
      expect(refusals(h.refusalLog)).toEqual([]);
    } finally {
      await h.close();
    }
  });
});
