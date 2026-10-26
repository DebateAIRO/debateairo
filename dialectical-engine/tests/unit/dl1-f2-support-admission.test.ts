import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW, ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue, type AdmissionPolicy
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { supportHarness } from "../support/supportHarness.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

const T0 = Date.parse("2026-09-22T00:00:00.000Z");
const QUARTER_MS = 15 * 60_000;
const SOURCE_A = "203.0.113.5";
const SOURCE_B = "198.51.100.7";
const SEALED = admissionPolicyFromValue(
  ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
);
const PUBLISHED = admissionPolicyFromValue(
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);
function policyWith(overrides: Readonly<Record<string, unknown>>): AdmissionPolicy {
  return admissionPolicyFromValue(
    { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, ...overrides },
    ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
  );
}
function askApplication(): AskApplication { return {
  withContentLease: async (_runId: string, use: () => unknown) => use(),
  submit: async () => ({ run_ref: "00000000-0000-4000-8000-000000000000", status: "QUEUED" }),
  readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
  readAnswerIndex: async (_session: unknown, limit: number, offset: number) =>
    ({ items: [], open_runs: [], limit, offset, total: 0 }),
  readDeployment: async () => ({ register: { register_version: 1, rows: [] },
    scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
  readNode: async () => null, recordInvestigation: async () => null,
  unlinkMemoryLink: async () => null, readInspection: async () => null,
  readLedgerDigest: async () => null, events: async function* () { return; }
} as unknown as AskApplication; }
function harness(policy: AdmissionPolicy = PUBLISHED) {
  let now = new Date(T0);
  const admission = new AdmissionLimiter(policy);
  const support = supportHarness({ clock: () => now });
  const api = buildApi({ application: askApplication(), support: support.application,
    allowedOrigin: TEST_APP_ORIGIN, admission, admissionClock: () => now });
  const status = (remoteAddress: string) => api.inject({ method: "GET", url: "/v1/support/status", remoteAddress });
  const message = (remoteAddress: string) => api.inject({ method: "POST", url: "/v1/support/messages",
    remoteAddress, headers: { origin: TEST_APP_ORIGIN }, payload: { text: "How does debate depth work?", language: "en" } });
  return { api, admission, support, status, message,
    advance(ms: number) { now = new Date(now.getTime() + ms); }, close: () => api.close() };
}

describe("DL1-F2 stateless support admission", () => {
  it("preserves the sealed row and publishes distinct support scopes", () => {
    expect(SEALED.supportReads).toBeNull();
    expect(SEALED.supportSessions).toBeNull();
    expect(PUBLISHED.supportReads).toEqual({ key: "source", limit: 240, windowMs: QUARTER_MS, capacity: 65_536 });
    expect(PUBLISHED.supportModelCalls).toEqual({ key: "source", limit: 40, windowMs: 24 * 60 * 60_000, capacity: 65_536 });
  });

  it("meters status reads by pseudonym and releases the window", async () => {
    const h = harness(policyWith({ support_reads: { key: "source", limit: 2, window_ms: QUARTER_MS, capacity: 64 } }));
    try {
      expect((await h.status(SOURCE_A)).statusCode).toBe(200);
      expect((await h.status(SOURCE_A)).statusCode).toBe(200);
      const refused = await h.status(SOURCE_A);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
      expect((await h.status(SOURCE_B)).statusCode).toBe(200);
      const keys = h.admission.keys("supportReads");
      expect(keys).toHaveLength(2);
      expect(JSON.stringify(keys)).not.toContain(SOURCE_A);
      expect(JSON.stringify(keys)).not.toContain(SOURCE_B);
      h.advance(QUARTER_MS);
      expect((await h.status(SOURCE_A)).statusCode).toBe(200);
    } finally { await h.close(); }
  });

  it("shares one status-read budget across an IPv6 /64", async () => {
    const h = harness(policyWith({ support_reads: { key: "source", limit: 2, window_ms: QUARTER_MS, capacity: 64 } }));
    try {
      expect((await h.status("2001:db8:1:2::1")).statusCode).toBe(200);
      expect((await h.status("2001:db8:1:2::2")).statusCode).toBe(200);
      expect((await h.status("2001:db8:1:2::3")).statusCode).toBe(429);
      expect(h.admission.keys("supportReads")).toHaveLength(1);
    } finally { await h.close(); }
  });

  it("admits unlimited status reads when the optional budget is absent", async () => {
    const h = harness(SEALED);
    try {
      for (let n = 0; n < 20; n += 1) expect((await h.status(SOURCE_A)).statusCode).toBe(200);
      expect(h.admission.configured("supportReads")).toBe(false);
    } finally { await h.close(); }
  });

  it("caches the four-field status answer for one second", async () => {
    const h = harness();
    try {
      const first = await h.status(SOURCE_A);
      expect(Object.keys(first.json()).sort()).toEqual(["configuration", "kb_loaded", "kb_version", "relay_state"]);
      await h.status(SOURCE_B);
      expect(h.support.spies.configuration).toHaveBeenCalledTimes(1);
      expect(h.support.spies.knowledgeStatus).toHaveBeenCalledTimes(1);
      h.advance(2_000);
      await h.status(SOURCE_A);
      expect(h.support.spies.configuration).toHaveBeenCalledTimes(2);
    } finally { await h.close(); }
  });

  it("accepts a message through the one stateless POST", async () => {
    const h = harness();
    try { expect((await h.message(SOURCE_A)).statusCode).toBe(200); }
    finally { await h.close(); }
  });
});
