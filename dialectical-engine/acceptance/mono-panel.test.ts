import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StandingDatabase } from "./standing-db.js";
import { startStandingDatabase } from "./standing-db.js";
import { acceptanceServiceRequestHeaders, createAcceptanceRuntime } from "./main.js";
import { seedAcceptanceRegister } from "./seed-register.js";
import { evaluatorSatisfied } from "./test-fixtures/evaluator-double.js";
import {
  ACCEPTANCE_PLAN_TIER,
  FREE_ROSTER_ANTHROPIC_MODEL,
  FREE_ROSTER_OPENAI_MODEL,
  requestedModel
} from "./test-fixtures/plan-roster-double.js";

/**
 * Tiers S02 changed what a "mono-lineage day" can be (86bfa432, 2026-09-12).
 * An ask names its plan, and admission needs EVERY model on that plan's roster
 * discovered healthy: with only one maker reachable, the ask is refused at the
 * door, naming the missing model, before any debate call (V's ruling C1). So
 * DR-182's served mono panel — capped, its depth not expanded, both marks
 * disclosed — is reached only when the second maker is lost AFTER admission:
 * both roster relays answer at the ask, and the Anthropic relay then fails the
 * runner's claim-time probe. The runner revises the panel to one maker and
 * serves it under exactly DR-182's disclosures, naming the revision first.
 * This file asserts both halves: the refusal, and the capped served day.
 */
const CRITIC_PROVIDER_REF = "acceptance:claude-cli";

/**
 * F-T17T9-1 — THE identity this mono-lineage fixture configures, named once.
 *
 * The defect this closes: the fixture configured only `acceptance:codex-cli`
 * while the register sealed the DEFAULT roles, whose evaluator is the second
 * configured FAMILY's provider (`acceptance:claude-cli`). The run then died at
 * `SYNTHESIS_ROLE_PROVIDER_UNRESOLVED` — a CORRECT refusal under J24, because a
 * sealed identity is never substituted. The roster was the defect, not the
 * refusal.
 *
 * Both the sealed roles and the maker relay are derived from this one constant,
 * so a fixture that seals a role it does not configure is no longer expressible
 * here. Identical synthesizer and evaluator refs are lawful (goal 84-85); the
 * seeder warns and proceeds, and a mono-lineage day is exactly the case the
 * allowance exists for.
 */
const MONO_PROVIDER_REF = "acceptance:codex-cli";

let database: StandingDatabase;
let dataDirectory: string;
let provider: { readonly endpoint: string; stop(): Promise<void> };
let lostCritic: { readonly endpoint: string; readonly calls: () => number; stop(): Promise<void> };
let priorRoleRefOverrides: Readonly<{ synthesizer: string | undefined; evaluator: string | undefined }>;

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PORT_RESOLUTION_FAILED");
  server.close();
  await once(server, "close");
  return address.port;
}

function judgement(statement: string): string {
  return JSON.stringify({
    statement,
    way_of_knowing: "REASONING",
    locator: null,
    restatement_text: statement,
    restatement_status: "PASS",
    value_laden: false,
    claim_type: "unknown",
    steelman: { summary: statement, fidelity: 0.72 },
    critic: { summary: "Independent critique unavailable.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.72, relevance: 0.72 },
    context: { fit: 0.72, ambiguityFlags: [] },
    fallacy: { severity: 0.28, fatalFlags: [] }
  });
}

async function startProviderDouble(): Promise<{ readonly endpoint: string; stop(): Promise<void> }> {
  const responses = [
    "claim-health-probe",
    judgement("A mono-lineage acceptance answer."),
    JSON.stringify({ segments: [
      { segment_id: "segment:verdict", text: "A mono-lineage acceptance answer.", node_refs: ["primary"], served_number_refs: ["number:final-strength"] },
      { segment_id: "segment:next", text: "Seek an independent model lineage.", node_refs: [], served_number_refs: [] }
    ] }),
    // F-SEALEDROWS-B: T9 replaced the two `{conforms,findings}` conformance
    // responses and the `{pass}` R9 response that stood here with ONE evaluator
    // verdict. Both sealed roles resolve to this fixture's single provider, so
    // the synthesizer's segments above and this verdict are answered by the
    // same double, in that order.
    evaluatorSatisfied()
  ];
  let cursor = 0;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      // Tiers S02: the double answers as the model its relay declared.
      const model = requestedModel(Buffer.concat(chunks).toString("utf8"));
      if (model === null) {
        response.writeHead(500, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "MONO_DOUBLE_MODEL_UNREQUESTED" }));
        return;
      }
      const content = responses[cursor++];
      if (content === undefined) {
        response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "UNEXPECTED_TEST_CALL" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        id: `mono-panel-${cursor}`,
        model,
        choices: [{ message: { content } }]
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    async stop() {
      server.close();
      await once(server, "close");
    }
  };
}

/**
 * The second maker, LOST after admission. The acceptance runtime records every
 * configured relay HEALTHY at boot without calling it, so the ask is admitted on
 * that record; the first call this relay ever receives is the runner's claim-time
 * probe, and it answers 503 to that and to anything else.
 */
async function startLostCriticDouble(): Promise<{ readonly endpoint: string; readonly calls: () => number; stop(): Promise<void> }> {
  let calls = 0;
  const server: Server = createServer((request, response) => {
    request.resume();
    calls += 1;
    response.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "MAKER_LOST" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("TEST_PROVIDER_ADDRESS_FAILED");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    calls: () => calls,
    async stop() {
      server.close();
      await once(server, "close");
    }
  };
}

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "debateai-acc-mono-"));
  database = await startStandingDatabase({ port: await reservePort(), dataDirectory });
  provider = await startProviderDouble();
  lostCritic = await startLostCriticDouble();
  // The overrides are read by `resolveAcceptanceSynthesisRoleRefs` at seed
  // time, so they must precede the seed; the runtime then reads the SEALED ROW
  // rather than the environment, which is why nothing sets them again below.
  priorRoleRefOverrides = Object.freeze({
    synthesizer: process.env.ACCEPTANCE_SYNTHESIZER_ROLE_REF,
    evaluator: process.env.ACCEPTANCE_EVALUATOR_ROLE_REF
  });
  process.env.ACCEPTANCE_SYNTHESIZER_ROLE_REF = MONO_PROVIDER_REF;
  process.env.ACCEPTANCE_EVALUATOR_ROLE_REF = MONO_PROVIDER_REF;
  await seedAcceptanceRegister(database.pool);
});

afterAll(async () => {
  // Restored rather than deleted: this process is shared with whatever else the
  // runner imports, and a leaked override would seal another fixture's roles.
  const restore = (name: string, value: string | undefined): void => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("ACCEPTANCE_SYNTHESIZER_ROLE_REF", priorRoleRefOverrides?.synthesizer);
  restore("ACCEPTANCE_EVALUATOR_ROLE_REF", priorRoleRefOverrides?.evaluator);
  await lostCritic?.stop();
  await provider?.stop();
  await database?.stop();
  await rm(dataDirectory, { recursive: true, force: true });
});

const monoAsk = Object.freeze({
  question_line: "Can a mono-lineage day still serve honestly?",
  risk_tier: "high-stakes",
  tier_source: "ASKER",
  tier_provenance_ref: "acceptance:mono-panel:asker",
  composition_budget_tier: "low",
  depth_params: { depth: 4 },
  decision_scope: "acceptance-test",
  as_of: "2026-08-14T00:00:00.000Z",
  steering_presets: [],
  plan_tier: ACCEPTANCE_PLAN_TIER,
  steering_annotations: []
});

const monoEnvironment = () => ({
  DATABASE_URL: database.connectionString,
  API_HOST: "127.0.0.1",
  API_PORT: 8_000,
  STRANGER_SAMPLE_RATE: 1,
  BATTERY_VERSION: "acceptance:mono-panel",
  SETTLEMENT_WATCH_HANDLE: "acceptance:mono-panel:watch",
  MODEL_BASE_URL: provider.endpoint
});

describe("DR-182 live mono-panel composition", () => {
  // Runs FIRST: it must spend none of the served row's scripted responses.
  it("refuses a day with one maker at the door, naming the plan's missing model (tiers S02 C1)", async () => {
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      serviceCredential: "r".repeat(43),
      environment: monoEnvironment(),
      makerRelays: [
        {
          providerRef: MONO_PROVIDER_REF, baseUrl: provider.endpoint, model: FREE_ROSTER_OPENAI_MODEL,
          authorizationHeader: "Bearer test-mono-relay"
        }
      ]
    });
    try {
      const ask = await runtime.api.inject({
        method: "POST",
        url: "/v1/asks",
        headers: acceptanceServiceRequestHeaders(runtime.serviceSession, "http://127.0.0.1:8000", true),
        payload: monoAsk
      });
      expect(ask.statusCode).toBe(422);
      const refusal = ask.json() as { error: string; message: string };
      expect(refusal.error).toBe("ASK_PLAN_TIER_MODEL_UNAVAILABLE");
      expect(refusal.message).toContain(FREE_ROSTER_ANTHROPIC_MODEL);
    } finally {
      await runtime.api.close();
    }
  });

  it("boots and serves high-stakes depth 4 with the ruled cap and disclosures when the second maker is lost after admission", async () => {
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      serviceCredential:"m".repeat(43),
      environment: monoEnvironment(),
      makerRelays: [
        {
          providerRef: MONO_PROVIDER_REF,baseUrl: provider.endpoint,model: FREE_ROSTER_OPENAI_MODEL,
          authorizationHeader: "Bearer test-mono-relay"
        },
        {
          providerRef: CRITIC_PROVIDER_REF,baseUrl: lostCritic.endpoint,model: FREE_ROSTER_ANTHROPIC_MODEL,
          authorizationHeader: "Bearer test-lost-critic-relay"
        }
      ]
    });
    const origin = "http://127.0.0.1:8000";
    const ask = await runtime.api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: acceptanceServiceRequestHeaders(runtime.serviceSession, origin, true),
      payload: monoAsk
    });
    expect(ask.statusCode).toBe(202);
    const runId = (ask.json() as { run_ref: string }).run_ref;
    await vi.waitFor(async () => {
      const work = await database.pool.query<{ state: string; terminal_reason: string | null }>(
        "SELECT state, terminal_reason FROM core.work_item WHERE run_id=$1",
        [runId]
      );
      if (work.rows[0]?.state === "FAILED") throw new Error(`MONO_WORK_FAILED:${work.rows[0].terminal_reason}`);
      expect(work.rows[0]?.state).toBe("DONE");
    });
    const answer = await runtime.api.inject({
      method: "GET",
      url: `/v1/runs/${runId}/answer`,
      headers: acceptanceServiceRequestHeaders(runtime.serviceSession, origin, false)
    });
    expect(answer.statusCode).toBe(200);
    const payload = answer.json() as {
      confidence_band: string;
      condition_marks: string[];
      condition_mark_records: { mark: string; reason: string; lift_path: string | null }[];
    };
    expect(payload.confidence_band).toBe("CAPPED");
    expect(payload.condition_marks).toEqual(expect.arrayContaining(["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"]));
    expect(payload.condition_marks.filter((mark) => mark === "CRITIQUE-UNAVAILABLE")).toHaveLength(1);
    expect(payload.condition_mark_records).toEqual(expect.arrayContaining([
      expect.objectContaining({ mark: "SINGLE-LINEAGE", lift_path: "RUN_DIFFERENT_MAKER_CRITIQUE" }),
      expect.objectContaining({
        mark: "CRITIQUE-UNAVAILABLE",
        // The revision is named FIRST: which maker the claim lost, and why.
        reason: `CLAIM_PANEL_REVISED:${CRITIC_PROVIDER_REF}=PROVIDER_PROBE_FAILED`
          + "|MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=4",
        lift_path: "RUN_DIFFERENT_MAKER_CRITIQUE"
      })
    ]));
    // The lost maker was asked exactly once — the claim-time probe — and never
    // handed a debate call after it failed.
    expect(lostCritic.calls()).toBe(1);
    await runtime.api.close();
  });
});
