import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  createContractClient,
  type AskRequest,
  type RunProjection
} from "@debateai/contract";
import { getDebateServer } from "../../apps/v2-ui/lib/serverApi.js";

const ASK: AskRequest = {
  question_line: "Messi or Ronaldo?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker:test",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_owner: "asker:test",
  action_owner: "asker:test",
  decision_scope: "test provider-double composition",
  caller_scope: "ASKER",
  as_of: "2026-08-13T00:00:00.000Z",
  steering_presets: [],
  steering_annotations: []
};

function providerDoubleApplication(): AskApplication {
  const runs = new Map<string, RunProjection>();
  return {
    submit: async (ask) => {
      runs.set("run:load01", {
        run_ref: "run:load01",
        question_line: ask.question_line,
        state: "QUEUED",
        terminal_reason: null,
        hold_until: null
      });
      return { run_ref: "run:load01", status: "QUEUED" };
    },
    readRun: async (runId) => runs.get(runId) ?? null,
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

function injectedFetch(api: ReturnType<typeof buildApi>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const payload = request.body === null ? null : await request.text();
    const rawResponse = await api.inject({
      method: request.method as "GET" | "POST",
      url: new URL(request.url).pathname + new URL(request.url).search,
      headers: Object.fromEntries(request.headers.entries()),
      ...(payload === null ? {} : { payload })
    });
    return new Response(rawResponse.body, {
      status: rawResponse.statusCode,
      headers: rawResponse.headers as unknown as HeadersInit
    });
  }) as typeof fetch;
}

describe("LOAD-01 provider-double composition proof", () => {
  it("POST /new equivalent -> queued run ref -> debate loading projection keeps the real question", async () => {
    const api = buildApi({ application: providerDoubleApplication() });
    const client = createContractClient("http://load01.test", injectedFetch(api));
    const accepted = await client.submitAsk(ASK, "token:test");
    expect(accepted).toEqual({ run_ref: "run:load01", status: "QUEUED" });

    const page = await getDebateServer(accepted.run_ref, "token:test", client);
    expect(page).toMatchObject({
      ok: false,
      kind: "loading",
      run: {
        run_ref: "run:load01",
        question_line: "Messi or Ronaldo?",
        state: "QUEUED",
        terminal_reason: null,
        hold_until: null
      }
    });
    await api.close();
  });
});
