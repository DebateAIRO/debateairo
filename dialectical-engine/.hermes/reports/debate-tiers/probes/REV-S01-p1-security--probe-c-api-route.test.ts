/**
 * REV(S01) p1 · security/data-safety · MY OWN fixture against the REAL Fastify route.
 * The slice's R14 test covers four inputs (free, premium, "gold", absent). This one
 * exceeds those parameters: type confusion, case/whitespace, __proto__, a 1 MB tier,
 * WHAT THE APPLICATION ACTUALLY RECEIVES (submit spy), whether the 400 body leaks the
 * schema or the submitted values, and whether a `free` ask may carry Premium gauges.
 * In-memory application stub only — no database, no network, no :3000, no :8790.
 */
import { describe, expect, it } from "vitest";
import { buildApi as buildApiBase, type AskApplication } from "@debateai/api";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine/tests/support/httpSession.ts";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const ANSWER_ID = "44444444-4444-4444-8444-444444444444";
const USER_IDENTITY = testHttpIdentity("rev-s01-security");
const MUTATION_HEADERS = testSessionHeaders(USER_IDENTITY, true);

const submitted: Record<string, unknown>[] = [];

function spyApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async (ask: unknown) => {
      submitted.push(ask as Record<string, unknown>);
      return { run_ref: RUN_ID, status: "QUEUED" };
    },
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_s, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => ({
      answer_id: ANSWER_ID, answer_version: 1,
      conformance: { outcome: "PASS", coverage_mode: "EXHAUSTIVE", segment_results: [] },
      segment_suppressions: [], shadow_suppressions: []
    })
  } as unknown as AskApplication;
}

function api() {
  return buildApiBase({
    application: spyApplication(),
    sessions: testSessionApplication([USER_IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  } as Parameters<typeof buildApiBase>[0]);
}

const VALID = {
  question_line: "What follows from this evidence?",
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
  const app = api();
  const res = await app.inject({ method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: payload as object });
  const out = { status: res.statusCode, body: res.body };
  await app.close();
  return out;
}

describe("C1 — the accepted pair reaches the application intact", () => {
  it("free → 202 and the application receives plan_tier:free", async () => {
    submitted.length = 0;
    const r = await post({ ...VALID, plan_tier: "free" });
    expect(r.status).toBe(202);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.plan_tier).toBe("free");
  });
  it("premium → 202 and the application receives plan_tier:premium", async () => {
    submitted.length = 0;
    const r = await post({ ...VALID, plan_tier: "premium" });
    expect(r.status).toBe(202);
    expect(submitted[0]?.plan_tier).toBe("premium");
  });
});

describe("C2 — every malformed tier is 400 MALFORMED_REQUEST, never 500, and never reaches submit", () => {
  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ["forged 'gold'", "gold"],
    ["absent", Symbol.for("omit")],
    ["null", null],
    ["number", 1],
    ["boolean", true],
    ["array", ["free"]],
    ["object", { value: "free" }],
    ["uppercase FREE", "FREE"],
    ["padded ' free '", " free "],
    ["trailing newline", "free\n"],
    ["empty string", ""],
    ["__proto__ as the VALUE", "__proto__"],
    ["constructor as the VALUE", "constructor"],
    ["1 MB string", "f".repeat(1024 * 1024)],
    ["nested tier object", { free: true, premium: true }]
  ];
  for (const [name, value] of cases) {
    it(`${name} → 400 MALFORMED_REQUEST, submit not called`, async () => {
      submitted.length = 0;
      const payload: Record<string, unknown> = { ...VALID };
      if (value !== Symbol.for("omit")) payload.plan_tier = value;
      const r = await post(payload);
      expect(r.status).toBe(400);
      expect(JSON.parse(r.body)).toMatchObject({ error: "MALFORMED_REQUEST" });
      expect(submitted).toHaveLength(0);
    });
  }
});

describe("C3 — the 400 body does not leak the schema or the submitted values", () => {
  it("a rejected forged tier echoes neither the value, the field list, nor a zod issue trail", async () => {
    const r = await post({ ...VALID, plan_tier: "gold-tier-secret-marker" });
    expect(r.status).toBe(400);
    expect(r.body).not.toContain("gold-tier-secret-marker");
    expect(r.body).not.toContain("invalid_enum");
    expect(r.body).not.toContain("plan_tier");
    expect(r.body).not.toContain("unrecognized_keys");
    // record the exact body so the verdict quotes it verbatim
    expect(typeof r.body).toBe("string");
    console.log("C3 400 BODY VERBATIM:", r.body);
  });
});

describe("C4 — __proto__ on the wire (JSON, the shape the route really parses)", () => {
  it("a JSON body carrying __proto__ neither pollutes nor reaches submit as a key", async () => {
    submitted.length = 0;
    const raw = `{"__proto__":{"polluted":1},${JSON.stringify({ ...VALID, plan_tier: "free" }).slice(1)}`;
    const app = api();
    const res = await app.inject({
      method: "POST", url: "/v1/asks",
      headers: { ...MUTATION_HEADERS, "content-type": "application/json" },
      payload: raw
    });
    await app.close();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    console.log("C4 status:", res.statusCode, "submitted:", submitted.length);
    if (submitted.length === 1) {
      expect(Object.getOwnPropertyNames(submitted[0])).not.toContain("__proto__");
    }
  });
});

describe("C5 — THE INTEGRITY GAP: a `free` ask carrying Premium-only gauges", () => {
  it("is ACCEPTED 202 by the API and reaches the application unaltered", async () => {
    submitted.length = 0;
    const r = await post({
      ...VALID,
      plan_tier: "free",
      risk_tier: "high-stakes",
      composition_budget_tier: "high",
      depth_params: { depth: 5 },
      steering_presets: ["Prefer primary sources"],
      steering_annotations: ["Flag any claim resting on a single source."]
    });
    expect(r.status).toBe(202);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.plan_tier).toBe("free");
    expect(submitted[0]?.risk_tier).toBe("high-stakes");
    expect(submitted[0]?.composition_budget_tier).toBe("high");
    expect((submitted[0]?.depth_params as { depth: number }).depth).toBe(5);
    console.log("C5 free-ask-with-premium-gauges ACCEPTED:", JSON.stringify({
      plan_tier: submitted[0]?.plan_tier,
      risk_tier: submitted[0]?.risk_tier,
      composition_budget_tier: submitted[0]?.composition_budget_tier,
      depth: (submitted[0]?.depth_params as { depth: number }).depth,
      steering_annotations: submitted[0]?.steering_annotations
    }));
  });
});
