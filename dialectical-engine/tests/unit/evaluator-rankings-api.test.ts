import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

function askApplication(): AskApplication {
  return {
    withContentLease: async <T>(_runId: string, use: () => Promise<T>) => use(),
    submit: vi.fn(), readAnswer: vi.fn(), readRunAnswer: vi.fn(), readRun: vi.fn(),
    readAnswerIndex: vi.fn(), readInspection: vi.fn(), readLedgerDigest: vi.fn(),
    readNode: vi.fn(), recordInvestigation: vi.fn(), unlinkMemoryLink: vi.fn(),
    readDeployment: vi.fn(), events: vi.fn()
  } as unknown as AskApplication;
}

describe("read-only evaluator rankings API", () => {
  it("requires an authenticated session before reading numeric aggregates", async () => {
    const readRankings = vi.fn(async () => ({
      asOf: null, derivationVersion: null, rankings: []
    }));
    const api = buildApi({
      application: askApplication(),
      evaluatorRankings: { readRankings }
    } as Parameters<typeof buildApi>[0] & {
      evaluatorRankings: { readRankings: typeof readRankings };
    });

    const response = await api.inject({ method: "GET", url: "/v1/evaluator/rankings" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(readRankings).not.toHaveBeenCalled();
    await api.close();
  });

  it("returns the aggregate cohort to any signed-in user without a CSRF token", async () => {
    const identity = testHttpIdentity("evaluator-rankings");
    const readRankings = vi.fn(async () => ({
      asOf: new Date("2026-09-13T09:30:00.000Z"),
      derivationVersion: 2,
      rankings: [{
        provider: "openai", modelId: "gpt-exact", modelVersion: "2026-09-01",
        capability: "Authoring strength (reasoning proxy)", step: "AUTHORING",
        metric: "prowess.reasoning-strength.v2", score: 0.8125, rank: 1,
        sampleCount: 14, intervalLower: null, intervalUpper: null,
        domain: { id: null, name: "Unclassified" }
      }]
    }));
    const api = buildApi({
      application: askApplication(),
      sessions: testSessionApplication([identity]),
      allowedOrigin: TEST_APP_ORIGIN,
      evaluatorRankings: { readRankings }
    } as Parameters<typeof buildApi>[0] & {
      evaluatorRankings: { readRankings: typeof readRankings };
    });

    const response = await api.inject({
      method: "GET", url: "/v1/evaluator/rankings", headers: testSessionHeaders(identity)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      asOf: "2026-09-13T09:30:00.000Z",
      derivationVersion: 2,
      rankings: [{
        provider: "openai", modelId: "gpt-exact", modelVersion: "2026-09-01",
        capability: "Authoring strength (reasoning proxy)", step: "AUTHORING",
        metric: "prowess.reasoning-strength.v2", score: 0.8125, rank: 1,
        sampleCount: 14, intervalLower: null, intervalUpper: null,
        domain: { id: null, name: "Unclassified" }
      }]
    });
    expect(readRankings).toHaveBeenCalledTimes(1);
    await api.close();
  });
});
