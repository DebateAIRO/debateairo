// WHOLE-REV-hermes-glm-5.3-flash probe — S02 §2 steps 6+7 through the R10 browser path:
// the REAL createDebate (the function apps/ui/app/new/page.tsx:159 calls) with the config
// the page itself builds (buildNewDebateAskConfig), through a REAL createContractClient
// against the REAL in-process API face. The tier-unavailable refusal must leave the API as
// 422 / ASK_PLAN_TIER_MODEL_UNAVAILABLE with EVERY missing member named, and the exact
// string createDebate rethrows is what page.tsx:162 renders in its error block (R10).
// Deleted before handoff; never committed.
import { describe, expect, it } from "vitest";
import { buildApi, evaluateAskAdmission } from "@debateai/api";
import { createContractClient, ContractHttpError, type AskRequest } from "@debateai/contract";
import { createDebate } from "@/lib/api";
import { buildNewDebateAskConfig } from "@/app/new/defaults";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication } from "@support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const HTTP_IDENTITY = testHttpIdentity("wholerev-r10-probe");

function member(modelId: string, provider: string) {
  return Object.freeze({
    provider_ref: `provider:${provider}`,
    maker: `maker:${provider}`,
    model_id: modelId,
    probe_evidence_ref: `probe:${provider}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  });
}

// Today's intake fleet: Free has BOTH members missing (the all-members-missing case of
// acceptance step 6/7 for Free). No other settings member is read on the refusal path.
function refusalSettings() {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "wholerev-r10",
    settlementWatchHandle: "wholerev-r10",
    resolveDiscoveredPanel: async () => [] as readonly ReturnType<typeof member>[],
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier: string, tierSource: string, tierProvenanceRef: string) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    })
  };
}

const cookieValue =
  `__Host-debateai-session=${HTTP_IDENTITY.rawSessionToken}; ` +
  `__Host-debateai-csrf=${HTTP_IDENTITY.rawCsrfToken}`;

describe("WHOLE-REV S02 R10 refusal reaches the browser error path", () => {
  it("createDebate delivers the 422 ASK_PLAN_TIER_MODEL_UNAVAILABLE text the page renders", async () => {
    const application = {
      withContentLease: async (_runId: string, use: (x: null) => Promise<unknown>) => use(null),
      submit: async (submittedAsk: AskRequest) => {
        await evaluateAskAdmission(refusalSettings() as never, submittedAsk);
        return { run_ref: RUN_ID, status: "QUEUED" as const };
      },
      readAnswer: async () => null,
      readRunAnswer: async () => null,
      readRun: async () => null,
      readAnswerIndex: async (_s: unknown, limit: number, offset: number) => ({
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
    const api = buildApi({
      application: application as never,
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });

    const client = createContractClient(
      TEST_APP_ORIGIN,
      (async (input: string | URL | globalThis.Request, init?: RequestInit) => {
        const plainHeaders: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, key) => { plainHeaders[key] = value; });
        // A same-origin browser fetch attaches Origin itself; the client delegates that to the browser.
        if ((init?.method ?? "GET").toUpperCase() !== "GET") plainHeaders["origin"] = TEST_APP_ORIGIN;
        const injectResponse = await api.inject({
          url: String(input),
          ...init,
          headers: plainHeaders,
          method: (init?.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE"
        });
        // The browser hands the client a real WHATWG Response; so does this adapter.
        // (light-my-user's own response object carries statusCode, not status — a raw
        // return here would erase the status the client must read.)
        return new Response(injectResponse.payload, {
          status: injectResponse.statusCode,
          headers: injectResponse.headers
        }) as never;
      }) as never,
      {
        mode: "cookie",
        cookieHeader: cookieValue,
        csrfToken: () => HTTP_IDENTITY.rawCsrfToken
      }
    );

    // The exact call shape of apps/ui/app/new/page.tsx:147-159 with Free chosen.
    const config = buildNewDebateAskConfig({
      planTier: "free",
      riskTier: "standard",
      budgetTier: "low",
      decisionScope: "personal",
      asOf: "2026-09-12T00:00:00",
      depth: 2,
      asOfWasEdited: false,
      riskTierWasEdited: false
    }, new Date("2026-09-12T00:00:00.000Z"));

    let caught: unknown = null;
    try {
      await createDebate("Which models should debate this question?", config, "test-token", client);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ContractHttpError);
    const refusal = caught as ContractHttpError;
    expect(refusal.name).toBe("ContractHttpError");
    // Acceptance step 7: the POST /v1/asks response is 422 …
    expect(refusal.status).toBe(422);
    expect(refusal.code).toBe("UNPROCESSABLE");
    // … and its body's error reads exactly ASK_PLAN_TIER_MODEL_UNAVAILABLE.
    expect(refusal.serverCode).toBe("ASK_PLAN_TIER_MODEL_UNAVAILABLE");
    // R7 / step 6: the tier name and EVERY missing member, verbatim, one refusal.
    expect(refusal.message).toBe(
      "ASK_PLAN_TIER_MODEL_UNAVAILABLE: The free plan needs gpt-5.6-luna, claude-sonnet-5, and they are not available right now"
    );

    await api.close();
  });
});
