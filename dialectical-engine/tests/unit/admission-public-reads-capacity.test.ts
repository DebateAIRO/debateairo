// Security audit run 3, NV-19 (DL5-F3): one IPv6 /64 minting fresh addresses filled the shared `publicReads` key
// table, because six public-read routes charged the full address and a full non-evicting table answers every new
// source 429 CAPACITY. Every public read is now charged to the caller's network (an IPv6 address is its /64), and
// every scope the register keys by `source` gives up its least-evidenced entry at capacity instead of refusing.
// Owner-keyed scopes stay fail-closed.
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { AdmissionLimiter, type AdmissionScope } from "../../apps/api/src/admission.js";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue,
  type AdmissionPolicy
} from "@debateai/register";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_REF = "22222222-2222-4222-8222-222222222222";
const T0 = new Date("2026-01-01T00:00:00.000Z");
const OWNER = testHttpIdentity("nv19-public-reads-owner");

function policyWith(overrides: {
  readonly asks?: Partial<{ limit: number; window_ms: number; capacity: number }>;
  readonly public_reads?: Partial<{ limit: number; window_ms: number; capacity: number }>;
}): AdmissionPolicy {
  const value = ADMISSION_POLICY_REGISTER_ROW.value;
  return admissionPolicyFromValue({
    ...value,
    asks: { ...value.asks, ...overrides.asks },
    public_reads: { ...value.public_reads, ...overrides.public_reads }
  }, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
}

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: RUN_ID, at_sequence: 1, payload: {} };
    }
  };
}

function parsedLines(spy: { readonly mock: { readonly calls: readonly (readonly unknown[])[] } }): unknown[] {
  return spy.mock.calls.map((call) => {
    try { return JSON.parse(String(call[0])) as unknown; } catch { return String(call[0]); }
  });
}

function evictionLines(spy: { readonly mock: { readonly calls: readonly (readonly unknown[])[] } }): unknown[] {
  return parsedLines(spy).filter((line) =>
    line !== null && typeof line === "object" && (line as { event?: unknown }).event === "api.admission.evicting");
}

describe("NV-19: source-keyed admission tables never answer CAPACITY", () => {
  it("every source-keyed scope gives up an entry at capacity; every owner-keyed scope still refuses", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // The pin covers only the members present in the value built here: an optional source member absent from
      // the deployment row (as `ask_room_reads` is) is invisible unless it is also added to `value`. Members the
      // parser fills with its own defaults (never null) are covered, because the capacity override is applied to
      // the parsed policy, which is also what the limiter is built from.
      const value = {
        ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,
        ask_room_reads: { key: "owner", limit: 10, window_ms: 60_000, capacity: 8 }
      };
      const parsed = admissionPolicyFromValue(value, "nv19");
      const policy = Object.freeze(Object.fromEntries(Object.entries(parsed).map(([k, m]) =>
        [k, m !== null && typeof m === "object" && "key" in m ? Object.freeze({ ...m, capacity: 1 }) : m]
      ))) as unknown as AdmissionPolicy;
      const limiter = new AdmissionLimiter(policy);
      const sources: string[] = [];
      for (const [name, member] of Object.entries(policy)) {
        if (member === null || typeof member !== "object" || !("key" in member)) continue;
        const scope = name as AdmissionScope;
        expect(limiter.decide(scope, "k1", T0), name).toEqual({ allowed: true });
        if (member.key === "source") {
          sources.push(name);
          expect(limiter.decide(scope, "k2", T0), name).toEqual({ allowed: true });
          expect(limiter.size(scope), name).toBe(1);
        } else {
          expect(limiter.decide(scope, "k2", T0), name).toMatchObject({ allowed: false, reason: "CAPACITY" });
        }
      }
      expect(sources.sort()).toEqual([
        "billingCancelLink", "billingNotify", "geoAvailability", "publicReads", "recoveryStart",
        "supportModelCalls", "supportReads"
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it("a spent public-read source keeps its block through a one-shot flood, and the eviction is logged once per window", () => {
    // Red before NV-19: `publicReads` did not evict, so the third fresh key of the flood got CAPACITY.
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const limiter = new AdmissionLimiter(policyWith({ public_reads: { limit: 2, window_ms: 1_000, capacity: 3 } }));
      const at = (ms: number) => new Date(T0.getTime() + ms);
      expect(limiter.decide("publicReads", "spent", T0)).toEqual({ allowed: true });
      expect(limiter.decide("publicReads", "spent", T0)).toEqual({ allowed: true });
      expect(limiter.decide("publicReads", "spent", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
      for (let index = 1; index <= 10; index += 1) {
        expect(limiter.decide("publicReads", `flood-${index}`, T0), `flood-${index}`).toEqual({ allowed: true });
      }
      expect(limiter.size("publicReads")).toBe(3);
      expect(limiter.decide("publicReads", "spent", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
      expect(evictionLines(log)).toEqual([
        { event: "api.admission.evicting", scope: "publicReads", capacity: 3, windowMs: 1_000 }
      ]);

      // Same window: the table is still full and nothing has expired, so an entry is given up, with no new line.
      expect(limiter.decide("publicReads", "late", at(999))).toEqual({ allowed: true });
      expect(limiter.size("publicReads")).toBe(3);
      expect(evictionLines(log)).toHaveLength(1);

      // Next window: the sweep removes `spent` and the surviving one-shot (both started at T0); `late` is still
      // inside its window and stays.
      expect(limiter.decide("publicReads", "next-1", at(1_000))).toEqual({ allowed: true });
      expect(limiter.size("publicReads")).toBe(2);
      expect(limiter.decide("publicReads", "next-2", at(1_000))).toEqual({ allowed: true });
      expect(limiter.size("publicReads")).toBe(3);
      expect(evictionLines(log)).toHaveLength(1);
      expect(limiter.decide("publicReads", "next-3", at(1_000))).toEqual({ allowed: true });
      expect(evictionLines(log)).toHaveLength(2);
      expect(limiter.decide("publicReads", "next-4", at(1_000))).toEqual({ allowed: true });
      expect(evictionLines(log)).toEqual([
        { event: "api.admission.evicting", scope: "publicReads", capacity: 3, windowMs: 1_000 },
        { event: "api.admission.evicting", scope: "publicReads", capacity: 3, windowMs: 1_000 }
      ]);
      expect(limiter.size("publicReads")).toBe(3);
    } finally {
      log.mockRestore();
    }
  });

  it("one /64 minting addresses takes one public-read slot, and a full table still admits a new source", async () => {
    const now = T0;
    const limiter = new AdmissionLimiter(policyWith({ public_reads: { capacity: 4 } }));
    const api = buildApi({
      application: fixtureApplication(),
      allowedOrigin: TEST_APP_ORIGIN,
      admission: limiter,
      admissionClock: () => now
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const providers = (remoteAddress: string) =>
        api.inject({ method: "GET", url: "/v1/auth/providers", remoteAddress });
      for (const address of ["2001:db8:1:2::1", "2001:db8:1:2::2", "2001:db8:1:2::3", "2001:db8:1:2::4"]) {
        expect((await providers(address)).statusCode, address).toBe(200);
      }
      expect(limiter.size("publicReads")).toBe(1);
      for (const address of ["2001:db8:1:3::1", "2001:db8:1:4::1", "2001:db8:1:5::1"]) {
        expect((await providers(address)).statusCode, address).toBe(200);
      }
      expect(limiter.size("publicReads")).toBe(4);
      // The table is full: the IPv4 read gives up the least-evidenced entry (2001:db8:1:3::/64).
      const list = await api.inject({
        method: "GET", url: "/v1/public/debates?limit=1&offset=0", remoteAddress: "198.51.100.7"
      });
      expect(list.statusCode).toBe(200);
      expect(limiter.size("publicReads")).toBe(4);

      const lines = parsedLines(log);
      expect(lines).not.toContainEqual(expect.objectContaining({ event: "api.admission.refused", reason: "CAPACITY" }));
      expect(evictionLines(log)).toEqual([
        { event: "api.admission.evicting", scope: "publicReads", capacity: 4, windowMs: 15 * 60_000 }
      ]);
      for (const call of log.mock.calls) {
        expect(String(call[0])).not.toContain("2001:db8");
        expect(String(call[0])).not.toContain("198.51.100");
      }
    } finally {
      log.mockRestore();
      await api.close();
    }
  });

  it("charges every public-read route to the caller's /64, not to its full IPv6 address", async () => {
    const decide = vi.fn((_scope: string, _key: string, _at: Date) =>
      ({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 60_000 }));
    const refusing = { configured: () => true, decide } as unknown as AdmissionLimiter;
    const api = buildApi({
      application: fixtureApplication(),
      sessions: testSessionApplication([OWNER]),
      consumerSecurity: {
        authMethods: async () => ({
          methods: [], recovery_codes_remaining: 0, available_step_up_methods: [], step_up_providers: []
        }),
        pendingMfaRecovery: async () => null
      } as never,
      allowedOrigin: TEST_APP_ORIGIN,
      admission: refusing
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const remoteAddress = "2001:db8:1:2:ffff::b";
    const account = { ...testSessionHeaders(OWNER, true), origin: TEST_APP_ORIGIN };
    try {
      for (const [url, headers] of [
        ["/v1/auth/providers", {}],
        ["/v1/public/debates?limit=1&offset=0", {}],
        [`/v1/public/debates/${PUBLIC_REF}`, {}],
        [`/v1/runs/${RUN_ID}/events`, testSessionHeaders(OWNER)],
        ["/v1/account/auth-methods", account],
        ["/v1/account/mfa-recovery", account]
      ] as const) {
        decide.mockClear();
        const response = await api.inject({ method: "GET", url, remoteAddress, headers });
        expect(response.statusCode, url).toBe(429);
        expect(response.json(), url).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
        expect(decide, url).toHaveBeenCalledWith("publicReads", "2001:db8:1:2::/64", expect.any(Date));
      }
    } finally {
      log.mockRestore();
      await api.close();
    }
  });
});
