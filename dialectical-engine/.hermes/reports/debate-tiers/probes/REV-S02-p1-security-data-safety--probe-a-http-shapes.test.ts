// TEMPORARY reviewer probe — seat REV-S02-p1-security-data-safety, pass 1.
// Deleted before handoff; never committed.
import { describe, expect, it } from "vitest";
import {
  buildApi,
  evaluateAskAdmission,
  PostgresAskApplication,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { PLAN_TIER_ROSTERS, type AskRequest, type Session } from "@debateai/contract";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const ID = testHttpIdentity("rev-s02-p1-sec");
const HEADERS = testSessionHeaders(ID, true);
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function member(modelId: unknown, tag: string): Record<string, unknown> {
  return Object.freeze({
    provider_ref: `provider:${tag}`,
    maker: `maker:${tag}`,
    model_id: modelId,
    probe_evidence_ref: `probe-evidence:${tag}:SECRET-LOOKING-REF`,
    probed_at: "2026-09-12T00:00:00.000Z"
  });
}

function askBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question_line: "Which models should debate this question?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "reviewer probe",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: "free",
    steering_annotations: [],
    ...overrides
  };
}

function settingsFor(
  panel: readonly unknown[],
  seen: number[] = []
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:probe",
    settlementWatchHandle: "watch:probe",
    resolveDiscoveredPanel: async () => panel as never,
    resolveEnvelopeBasis: async ({ panelSize }) => {
      seen.push(panelSize);
      return { max_model_attempts: 1 };
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    })
  };
}

function application(panel: readonly unknown[]): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async (submitted) => {
      await evaluateAskAdmission(settingsFor(panel), submitted);
      return { run_ref: RUN_ID, status: "QUEUED" };
    },
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_s, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

async function post(
  body: Record<string, unknown>,
  panel: readonly unknown[]
): Promise<{ status: number; body: Record<string, unknown> }> {
  const api = buildApi({
    application: application(panel),
    sessions: testSessionApplication([ID]),
    allowedOrigin: TEST_APP_ORIGIN
  });
  try {
    const response = await api.inject({
      method: "POST", url: "/v1/asks", headers: HEADERS, payload: body
    });
    return { status: response.statusCode, body: response.json() };
  } finally {
    await api.close();
  }
}

const FREE_PANEL = PLAN_TIER_ROSTERS.free.map((id, i) => member(id, `free-${i}`));

describe("REV-S02-p1-security probe: 422 face and refusal typing per input shape", () => {
  it("SHAPE MATRIX at the real HTTP face", async () => {
    const shapes: Record<string, { body: Record<string, unknown>; panel: readonly unknown[] }> = {
      "valid free, empty panel": { body: askBody(), panel: [] },
      "valid free, panel has only premium models": {
        body: askBody(),
        panel: [member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus")]
      },
      "valid premium, one member missing": {
        body: askBody({ plan_tier: "premium" }),
        panel: [member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus")]
      },
      "valid premium, two members missing": {
        body: askBody({ plan_tier: "premium" }),
        panel: [member("gpt-5.6-sol", "sol")]
      },
      "plan_tier outside the enum (gold)": { body: askBody({ plan_tier: "gold" }), panel: FREE_PANEL },
      "plan_tier absent": { body: (() => { const b = askBody(); delete b.plan_tier; return b; })(), panel: FREE_PANEL },
      "plan_tier null": { body: askBody({ plan_tier: null }), panel: FREE_PANEL },
      "plan_tier __proto__": { body: askBody({ plan_tier: "__proto__" }), panel: FREE_PANEL },
      "plan_tier constructor": { body: askBody({ plan_tier: "constructor" }), panel: FREE_PANEL },
      "plan_tier toString": { body: askBody({ plan_tier: "toString" }), panel: FREE_PANEL },
      "plan_tier array": { body: askBody({ plan_tier: ["free"] }), panel: FREE_PANEL },
      "plan_tier object": { body: askBody({ plan_tier: { free: 1 } }), panel: FREE_PANEL },
      "plan_tier FREE (case)": { body: askBody({ plan_tier: "FREE" }), panel: FREE_PANEL },
      "plan_tier ' free ' (padded)": { body: askBody({ plan_tier: " free " }), panel: FREE_PANEL },
      "extra unknown field": { body: askBody({ plan_tier_override: "premium" }), panel: FREE_PANEL },
      "panel member model_id null": { body: askBody(), panel: [member(null, "a"), member(null, "b")] },
      "panel member model_id missing": {
        body: askBody(),
        panel: [Object.freeze({ provider_ref: "p", maker: "m", probe_evidence_ref: "e", probed_at: "2026-09-12T00:00:00.000Z" })]
      },
      "panel entry is null": { body: askBody(), panel: [null, ...FREE_PANEL] },
      "panel entry is undefined": { body: askBody(), panel: [undefined, ...FREE_PANEL] },
      "happy path free, full roster": { body: askBody(), panel: FREE_PANEL }
    };
    const out: Record<string, string> = {};
    for (const [name, { body, panel }] of Object.entries(shapes)) {
      const r = await post(body, panel);
      out[name] = `${r.status} ${String(r.body.error)} :: ${String(r.body.message).slice(0, 260)}`;
    }
    console.log("SHAPE-MATRIX\n" + Object.entries(out).map(([k, v]) => `  ${k} -> ${v}`).join("\n"));
    expect(Object.keys(out)).toHaveLength(20);
  });

  it("DISCLOSURE: the 422 message names the tier and the missing ids and nothing else", async () => {
    const r = await post(askBody({ plan_tier: "premium" }), [member("gpt-5.6-sol", "sol")]);
    console.log("DISCLOSURE-422 =", JSON.stringify(r));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("ASK_PLAN_TIER_MODEL_UNAVAILABLE");
    const message = String(r.body.message);
    for (const leak of ["provider:", "maker:", "probe-evidence:", "SECRET-LOOKING-REF", "probed_at", "gpt-5.6-sol"]) {
      expect({ leak, present: message.includes(leak) }).toEqual({ leak, present: false });
    }
    expect(message).toContain("premium");
    expect(message).toContain("claude-opus-5");
    expect(message).toContain("grok-4.6");
  });

  it("FUNCTION BOUNDARY: unvalidated plan_tier reaching evaluateAskAdmission", async () => {
    const out = new Map<string, string>();
    for (const tier of ["gold", "__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
      const lookup = (PLAN_TIER_ROSTERS as unknown as Record<string, unknown>)[tier];
      let outcome: string;
      try {
        const admitted = await evaluateAskAdmission(
          settingsFor(FREE_PANEL),
          { ...askBody({ plan_tier: tier }) } as unknown as AskRequest
        );
        outcome = `RESOLVED panel=${JSON.stringify(admitted.discoveredPanel.map((m) => m.model_id))}`;
      } catch (error) {
        const e = error as Error & { code?: string };
        outcome = `${e.name}${e.code === undefined ? "" : `/${e.code}`}: ${e.message}`;
      }
      out.set(tier, `lookup=${Object.prototype.toString.call(lookup)} :: ${outcome}`);
    }
    console.log("FUNCTION-BOUNDARY\n" + [...out].map(([k, v]) => `  ${k} -> ${v}`).join("\n"));
    expect(out.size).toBe(6);
  });

  it("R8 OWN FIXTURE: a refusal takes no lease, opens no client, runs no statement", async () => {
    const queries: string[] = [];
    let connects = 0;
    function pool() {
      return {
        async query(statement: string) { queries.push(statement); return { rows: [], rowCount: 0 }; },
        async connect() {
          connects += 1;
          return {
            async query(statement: string) { queries.push(statement); return { rows: [], rowCount: 0 }; },
            on() { return this; }, once() { return this; }, removeListener() { return this; },
            release() {}
          };
        }
      } as never;
    }
    const primary = pool(); const provision = pool();
    const serverLease = pool(); const legacyLease = pool();
    let dispatched = 0;
    const app = new PostgresAskApplication(
      primary,
      { dispatch: async () => { dispatched += 1; } },
      settingsFor([member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus")]),
      undefined,
      provision,
      { server: serverLease, legacy: legacyLease }
    );
    const session: Session = {
      asker_id: "owner:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };
    let thrown: (Error & { code?: string }) | null = null;
    await app.submit(askBody() as unknown as AskRequest, session, {
      kind: "server",
      userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ownerRef: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }).catch((error: Error & { code?: string }) => { thrown = error; });
    console.log("R8-OWN =", JSON.stringify({
      thrownName: thrown === null ? null : (thrown as Error).name,
      thrownCode: thrown === null ? null : (thrown as { code?: string }).code,
      connects, dispatched, queryCount: queries.length, queries
    }));
    expect({ connects, dispatched, queryCount: queries.length }).toEqual({
      connects: 0, dispatched: 0, queryCount: 0
    });
    expect((thrown as unknown as { name: string; code: string }).name).toBe("AskRefusal");
    expect((thrown as unknown as { name: string; code: string }).code)
      .toBe("ASK_PLAN_TIER_MODEL_UNAVAILABLE");
  });
});
