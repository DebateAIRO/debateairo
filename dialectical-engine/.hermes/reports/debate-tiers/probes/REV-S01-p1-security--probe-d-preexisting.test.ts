/**
 * REV(S01) p1 · security lens · DATING the two C-probe hits.
 * Law 3.6: every failure is named and dated pre-existing or mine. Both hits are tested
 * against fields that existed at base 7f89f7b7, with plan_tier VALID — if the same
 * behaviour appears there, the class is pre-existing and S01 only added a member.
 */
import { describe, expect, it } from "vitest";
import { buildApi as buildApiBase, type AskApplication } from "@debateai/api";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine/tests/support/httpSession.ts";

const USER_IDENTITY = testHttpIdentity("rev-s01-security-dating");
const MUTATION_HEADERS = testSessionHeaders(USER_IDENTITY, true);
const submitted: unknown[] = [];

function app() {
  const application = {
    withContentLease: async (_r: unknown, use: () => unknown) => use(),
    submit: async (ask: unknown) => { submitted.push(ask); return { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" }; },
    readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
    readAnswerIndex: async (_s: unknown, limit: number, offset: number) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({ register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [], fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" } }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => ({ answer_id: "44444444-4444-4444-8444-444444444444", answer_version: 1, conformance: { outcome: "PASS", coverage_mode: "EXHAUSTIVE", segment_results: [] }, segment_suppressions: [], shadow_suppressions: [] })
  } as unknown as AskApplication;
  return buildApiBase({ application, sessions: testSessionApplication([USER_IDENTITY]), allowedOrigin: TEST_APP_ORIGIN } as Parameters<typeof buildApiBase>[0]);
}

const VALID = {
  question_line: "What follows from this evidence?",
  plan_tier: "free",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "test-layer scope",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [] as string[],
  steering_annotations: [] as string[]
};

async function post(payload: unknown) {
  const a = app();
  const res = await a.inject({ method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: payload as object });
  const out = { status: res.statusCode, body: res.body.slice(0, 400) };
  await a.close();
  return out;
}

describe("D1 — dating the 500: is an oversized BASE-ERA field also 500?", () => {
  const MB = "x".repeat(1024 * 1024);
  it("oversized question_line (a base-era field, valid plan_tier) → same status as oversized plan_tier", async () => {
    const r = await post({ ...VALID, question_line: MB });
    console.log("D1 question_line 1MB →", r.status, r.body);
    expect([400, 413, 500]).toContain(r.status);
  });
  it("oversized decision_scope (base-era field) →", async () => {
    const r = await post({ ...VALID, decision_scope: MB });
    console.log("D1 decision_scope 1MB →", r.status, r.body);
    expect([400, 413, 500]).toContain(r.status);
  });
  it("oversized tier_provenance_ref (base-era field) →", async () => {
    const r = await post({ ...VALID, tier_provenance_ref: MB });
    console.log("D1 tier_provenance_ref 1MB →", r.status, r.body);
    expect([400, 413, 500]).toContain(r.status);
  });
  it("the 500 is a BODY-SIZE limit, not a plan_tier fault: a 900 KB forged tier under the limit", async () => {
    const r = await post({ ...VALID, plan_tier: "f".repeat(900 * 1024) });
    console.log("D1 plan_tier 900KB →", r.status, r.body.slice(0, 200));
    expect(r.status).toBe(400);
  });
  it("exact 500 body for the 1 MB plan_tier (verbatim, for the verdict)", async () => {
    const r = await post({ ...VALID, plan_tier: "f".repeat(1024 * 1024) });
    console.log("D1 plan_tier 1MB →", r.status, r.body);
    expect(r.status).toBe(500);
  });
});

describe("D2 — dating the schema disclosure: does a BASE-ERA field leak the same way?", () => {
  it("a forged risk_tier (base-era enum) leaks its own path and values identically", async () => {
    const r = await post({ ...VALID, risk_tier: "ultra" });
    console.log("D2 risk_tier body →", r.body);
    expect(r.status).toBe(400);
    expect(r.body).toContain("risk_tier");
  });
  it("a forged composition_budget_tier (base-era enum) leaks likewise", async () => {
    const r = await post({ ...VALID, composition_budget_tier: "colossal" });
    console.log("D2 budget body →", r.body);
    expect(r.body).toContain("composition_budget_tier");
  });
  it("in NO case is the SUBMITTED VALUE echoed back to the caller", async () => {
    const r = await post({ ...VALID, plan_tier: "SECRET-MARKER-ZZZ", risk_tier: "SECRET-MARKER-YYY" });
    console.log("D2 no-echo body →", r.body);
    expect(r.body).not.toContain("SECRET-MARKER-ZZZ");
    expect(r.body).not.toContain("SECRET-MARKER-YYY");
  });
});
