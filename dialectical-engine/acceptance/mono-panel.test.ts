import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StandingDatabase } from "./standing-db.js";
import { startStandingDatabase } from "./standing-db.js";
import { createAcceptanceRuntime } from "./main.js";
import { seedAcceptanceRegister } from "./seed-register.js";

let database: StandingDatabase;
let dataDirectory: string;
let provider: { readonly endpoint: string; stop(): Promise<void> };

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
    JSON.stringify({ conforms: true, findings: [] }),
    JSON.stringify({ conforms: true, findings: [] }),
    JSON.stringify({ pass: true })
  ];
  let cursor = 0;
  const server: Server = createServer((request, response) => {
    request.resume();
    const content = responses[cursor++];
    if (content === undefined) {
      response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "UNEXPECTED_TEST_CALL" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      id: `mono-panel-${cursor}`,
      model: "test-layer/model",
      choices: [{ message: { content } }]
    }));
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

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "debateai-acc-mono-"));
  database = await startStandingDatabase({ port: await reservePort(), dataDirectory });
  provider = await startProviderDouble();
  await seedAcceptanceRegister(database.pool);
});

afterAll(async () => {
  await provider?.stop();
  await database?.stop();
  await rm(dataDirectory, { recursive: true, force: true });
});

describe("DR-182 live mono-panel composition", () => {
  it("boots and serves high-stakes depth 4 with the ruled cap and disclosures", async () => {
    const runtime = await createAcceptanceRuntime({
      pool: database.pool,
      environment: {
        DATABASE_URL: database.connectionString,
        API_HOST: "127.0.0.1",
        API_PORT: 8_000,
        STRANGER_SAMPLE_RATE: 1,
        BATTERY_VERSION: "acceptance:mono-panel",
        SETTLEMENT_WATCH_HANDLE: "acceptance:mono-panel:watch",
        MODEL_BASE_URL: provider.endpoint
      },
      makerRelays: [
        { providerRef: "acceptance:codex-cli", baseUrl: provider.endpoint, model: "test-layer/model" }
      ]
    });
    const token = "mono-panel-owner";
    const ask = await runtime.api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": token },
      payload: {
        question_line: "Can a mono-lineage day still serve honestly?",
        risk_tier: "high-stakes",
        tier_source: "ASKER",
        tier_provenance_ref: "acceptance:mono-panel:asker",
        composition_budget_tier: "low",
        depth_params: { depth: 4 },
        decision_scope: "acceptance-test",
        as_of: "2026-08-14T00:00:00.000Z",
        steering_presets: [],
        steering_annotations: []
      }
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
      headers: { "x-user-dev-token": token }
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
        reason: "MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=4",
        lift_path: "RUN_DIFFERENT_MAKER_CRITIQUE"
      })
    ]));
    await runtime.api.close();
  });
});
