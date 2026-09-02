import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const IDENTITY = testHttpIdentity("ask-question-bound");
const MUTATION_HEADERS = testSessionHeaders(IDENTITY, true);
const MAX_QUESTION_UTF8_BYTES = 8_192;

function apiRecordingSubmissions() {
  const submitted: string[] = [];
  const application = {
    submit: async (ask: AskRequest) => {
      submitted.push(ask.question_line);
      return { run_ref: RUN_ID, status: "QUEUED" as const };
    }
  } as unknown as AskApplication;
  return {
    submitted,
    api: buildApi({ application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN })
  };
}

const askWith = (question_line: string) => ({
  question_line,
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "test-layer scope",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [],
  steering_annotations: []
});

describe("L4-F2 — POST /v1/asks bounds question_line at 8 KiB UTF-8 after trim", () => {
  it("refuses an 8 193-byte question with the route's 400 MALFORMED_REQUEST envelope before submit", async () => {
    const { api, submitted } = apiRecordingSubmissions();
    const question = "a".repeat(MAX_QUESTION_UTF8_BYTES + 1);
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: askWith(question) });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    expect(submitted).toEqual([]);
    await api.close();
  });

  it("measures UTF-8 bytes, not characters", async () => {
    const { api, submitted } = apiRecordingSubmissions();
    // "é" is two bytes: 4 096 of them fill the bound exactly; one more byte crosses it.
    const atBound = "é".repeat(MAX_QUESTION_UTF8_BYTES / 2);
    expect(Buffer.byteLength(atBound, "utf8")).toBe(MAX_QUESTION_UTF8_BYTES);
    const over = await api.inject({ method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: askWith(`${atBound}a`) });
    expect(over.statusCode).toBe(400);
    const exact = await api.inject({ method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: askWith(atBound) });
    expect(exact.statusCode).toBe(202);
    expect(submitted).toEqual([atBound]);
    await api.close();
  });

  it("measures after the contract's trim, so surrounding whitespace does not count", async () => {
    const { api, submitted } = apiRecordingSubmissions();
    const question = "q".repeat(MAX_QUESTION_UTF8_BYTES);
    const padded = `${" ".repeat(64)}${question}${"\n".repeat(64)}`;
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: MUTATION_HEADERS, payload: askWith(padded) });
    expect(response.statusCode).toBe(202);
    expect(submitted).toEqual([question]);
    await api.close();
  });
});
