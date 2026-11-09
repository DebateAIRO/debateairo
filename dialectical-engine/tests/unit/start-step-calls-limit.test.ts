/**
 * Owner ruling 2026-11-09 (CodeQL js/missing-rate-limiting on POST /v1/asks/paths/merge): the four calls before Start that each
 * run a small AI (the lists, their merge, a combined question, a path's fit) charge the signed-in person's own `startStepCalls`
 * admission budget when the register version in force seals one. The charge comes first in each route, after the session and
 * before the body is read, so a malformed call is charged too and a refusal answers before a byte of any stream. The deployment
 * admission row carries the budget. The sealed B10 row and every version published before this ruling carry none, and on those
 * the four calls behave exactly as before.
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
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";

const START_CALLS = Object.freeze({ key: "owner" as const, limit: 2, window_ms: 60_000, capacity: 1_024 });
const REFUSED = Object.freeze({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
const START_ROUTES = Object.freeze(["lists", "merge", "combine", "fit"].map((name) => `/v1/asks/paths/${name}`));

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
  return admissionPolicyFromValue({ ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, start_step_calls: budget }, "start step fixture");
}

function withoutBudget(): AdmissionPolicy {
  const { start_step_calls: _dropped, ...value } = ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value;
  return admissionPolicyFromValue(value, "start step fixture, a version published before the ruling");
}

describe("the register's start_step_calls budget", () => {
  it("is sealed per signed-in person by the deployment row, and absent from the sealed B10 row", () => {
    const published = admissionPolicyFromValue(
      ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    expect(published.startStepCalls).toEqual({ key: "owner", limit: 30, windowMs: 60_000, capacity: 65_536 });
    expect(Object.isFrozen(published.startStepCalls)).toBe(true);
    expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef)
      .toContain(" + start step start_step_calls (owner ruling 2026-11-09), V ratification pending (V-1)");
    expect(new AdmissionLimiter(published).configured("startStepCalls")).toBe(true);
    expect(Object.hasOwn(ADMISSION_POLICY_REGISTER_ROW.value, "start_step_calls")).toBe(false);
    const sealed = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
    expect(sealed.startStepCalls).toBeNull();
    expect(new AdmissionLimiter(sealed).configured("startStepCalls")).toBe(false);
  });

  it("rides into the next hosted settings publish inside the code-owned admission row", async () => {
    const example = await readFile(new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url));
    const plan = await planHostedRegisterPublication(parseHostedRegisterFile(example));
    const admission = plan.rows.find((row) => row.rowKey === "admissionPolicy");
    expect(admission).toBeDefined();
    expect((JSON.parse(admission!.valueJsonText) as Record<string, unknown>).start_step_calls)
      .toEqual({ key: "owner", limit: 30, window_ms: 60_000, capacity: 65_536 });
  });

  it("refuses a budget keyed by source, outside the register's bounds, or with a member it does not know", () => {
    for (const broken of [
      { ...START_CALLS, key: "source" },
      { ...START_CALLS, limit: 0 },
      { ...START_CALLS, window_ms: 24 * 60 * 60_000 + 1 },
      { ...START_CALLS, capacity: 1_048_577 },
      { ...START_CALLS, windowMs: 60_000 }
    ]) {
      expect(() => withBudget(broken)).toThrow(expect.objectContaining({ code: "ADMISSION_POLICY_INVALID" }));
    }
  });
});

describe("the four calls before Start charge the signed-in person's startStepCalls budget", () => {
  function harness(policy: AdmissionPolicy, identities: readonly TestHttpIdentity[]) {
    let now = new Date("2026-11-09T12:00:00.000Z");
    // No start step composed: an empty body is refused 400 when the route reads it, so any 429 below can only be the budget,
    // charged before the body is read.
    const api = buildApi({
      application: {} as AskApplication,
      sessions: testSessionApplication(identities),
      allowedOrigin: TEST_APP_ORIGIN,
      admission: new AdmissionLimiter(policy),
      admissionClock: () => now
    });
    const refusalLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    return {
      refusalLog,
      advance: (ms: number) => { now = new Date(now.getTime() + ms); },
      post: (who: TestHttpIdentity, url: string) =>
        api.inject({ method: "POST", url, headers: testSessionHeaders(who, true), payload: {} }),
      close: async () => { refusalLog.mockRestore(); await api.close(); }
    };
  }

  it("refuses 429 with the wait once a person has spent it, across the four calls, per person", async () => {
    const asker = testHttpIdentity("start-calls-a"), other = testHttpIdentity("start-calls-b");
    const h = harness(withBudget(START_CALLS), [asker, other]);
    try {
      expect((await h.post(asker, "/v1/asks/paths/lists")).statusCode).toBe(400);
      expect((await h.post(asker, "/v1/asks/paths/fit")).statusCode).toBe(400);
      const refused = await h.post(asker, "/v1/asks/paths/merge");
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual(REFUSED);
      expect(refused.headers["retry-after"]).toBe("60");
      expect(refused.headers["content-type"]).toMatch(/^application\/json/u);
      expect((await h.post(asker, "/v1/asks/paths/combine")).statusCode).toBe(429);
      // The refusal is logged once per window, with the route and never the person.
      const logged = refusals(h.refusalLog);
      expect(logged).toEqual([
        { event: "api.admission.refused", route: "POST /v1/asks/paths/merge", reason: "LIMIT", windowMs: 60_000 },
        { event: "api.admission.refused", route: "POST /v1/asks/paths/combine", reason: "LIMIT", windowMs: 60_000 }
      ]);
      expect(JSON.stringify(logged)).not.toContain(asker.authenticated.ownerRef);
      // Another person keeps their own budget; the window's end gives the first one theirs back.
      expect((await h.post(other, "/v1/asks/paths/merge")).statusCode).toBe(400);
      h.advance(60_000);
      expect((await h.post(asker, "/v1/asks/paths/lists")).statusCode).toBe(400);
    } finally {
      await h.close();
    }
  });

  it("charges each of the four calls, and no other call", async () => {
    const people = START_ROUTES.map((_, index) => testHttpIdentity(`start-calls-route-${index}`));
    const outsider = testHttpIdentity("start-calls-outsider");
    const h = harness(withBudget({ ...START_CALLS, limit: 1 }), [...people, outsider]);
    try {
      for (const [index, url] of START_ROUTES.entries()) {
        const first = await h.post(people[index]!, url);
        expect(first.statusCode, url).not.toBe(429);
        expect(first.statusCode, url).not.toBe(404);
        const second = await h.post(people[index]!, url);
        expect(second.statusCode, url).toBe(429);
        expect(second.json(), url).toEqual(REFUSED);
      }
      // A call before Start that runs no small AI of these four never charges the budget, however often it is made.
      for (let index = 0; index < 3; index += 1) {
        expect((await h.post(outsider, "/v1/asks/clarify")).statusCode).not.toBe(429);
      }
      expect((await h.post(outsider, "/v1/asks/paths/fit")).statusCode).toBe(400);
    } finally {
      await h.close();
    }
  });

  it("changes nothing while the version in force seals no start-step budget", async () => {
    const asker = testHttpIdentity("start-calls-unsealed");
    const h = harness(withoutBudget(), [asker]);
    try {
      for (let index = 0; index < 5; index += 1) {
        for (const url of START_ROUTES) expect((await h.post(asker, url)).statusCode, url).toBe(400);
      }
      expect(refusals(h.refusalLog)).toEqual([]);
    } finally {
      await h.close();
    }
  });
});
