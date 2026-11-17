import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { CRISIS_SUPPORT_OFFERED, SENSITIVE_DATA_CONSENT_REQUIRED } from "@debateai/contract";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { CountryGate } from "../../apps/api/src/country-gate.js";
import { QUESTION_CHECK_FAILURE_CODES, type QuestionCheckOutcome } from "../../apps/api/src/question-check/contract.js";
import { readQuestionSubjects } from "../../apps/api/src/question-check/subjects.js";
import { answerForOutcome } from "../../apps/api/src/question-check/ask-gate.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const ASK = Object.freeze({
  question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", plan_tier: "free",
  depth_params: { depth: 1 }, decision_scope: "test", as_of: "2026-10-21T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
});
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;

function harness(input: { consent?: "given" | "required"; preview?: boolean; rate?: boolean; country?: boolean; check?: boolean;
  outcome?: QuestionCheckOutcome } = {}) {
  const identity = testHttpIdentity("s04-gate");
  const submitted = vi.fn(async (_ask: unknown, _session: unknown, _principal: unknown) => (
    { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" }
  ));
  const application = new Proxy({}, { get: (_target, key) => key === "submit" ? submitted : async () => null }) as AskApplication;
  const check = vi.fn(async (_question: string): Promise<QuestionCheckOutcome> => input.outcome ?? { outcome: "PASS" });
  // A keep method the route must never call (V, 2026-10-28: nothing of a question is stored).
  const keep = vi.fn(async (_record: unknown) => {});
  const sessions = { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => input.consent ?? "given" };
  const admission = { decide: () => input.rate
    ? { allowed: false, reason: "ASKS_EXHAUSTED", retryAfterMs: 60_000, windowMs: 60_000 }
    : { allowed: true } } as unknown as AdmissionLimiter;
  const countryGate = { recordedCountry: () => null, ask: () => input.country ? "COUNTRY_ASK_BLOCKED" : null } as unknown as CountryGate;
  // NV-03: the edge country is honoured only from the proven UI, so the harness stands in for it.
  const proof = "k".repeat(43);
  const api = buildApi({ application, sessions, admission, countryGate, allowedOrigin: TEST_APP_ORIGIN, uiApiProof: Buffer.from(proof),
    ...(input.preview ? { previewProviderTestConfig: PREVIEW, previewTeamUserIds: [] } : {}),
    ...(input.check === false ? {} : { questionCheck: Object.assign({ check }, { keep }) })
  });
  const ask = (questionLine: string = ASK.question_line, countryHeader?: string) => api.inject({
    method: "POST", url: "/v1/asks", headers: { ...testSessionHeaders(identity, true),
      ...(countryHeader === undefined ? {} : { "cf-ipcountry": countryHeader, "x-debateai-ui-proof": proof }) },
    payload: { ...ASK, question_line: questionLine }
  });
  return { api, ask, check, keep, submitted, identity };
}

describe("S04 question gate position", () => {
  it("rejects 8193 trimmed UTF-8 octets before the question check", async () => {
    const h = harness();
    try {
      const response = await h.ask("a".repeat(8_193));
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("MALFORMED_REQUEST");
      expect(h.check).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it("checks exactly 8192 trimmed UTF-8 octets", async () => {
    const h = harness();
    try {
      const question = "é".repeat(4_096);
      const response = await h.ask(`  ${question}  `);
      expect(response.statusCode).toBe(202);
      expect(h.check).toHaveBeenCalledExactlyOnceWith(question);
    } finally { await h.api.close(); }
  });

  it("leaves a phrase-check crisis ahead of the question check", async () => {
    const h = harness();
    try {
      const response = await h.ask("Should I kill myself?");
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toBe(CRISIS_SUPPORT_OFFERED);
      expect(h.check).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it.each([
    ["consent", { consent: "required" as const }, 403, SENSITIVE_DATA_CONSENT_REQUIRED],
    ["preview team", { preview: true }, 403, "PREVIEW_TEAM_ONLY"],
    ["rate limit", { rate: true }, 429, null],
    ["country", { country: true }, 403, "COUNTRY_ASK_BLOCKED"]
  ])("runs the %s refusal before the question check", async (_name, options, status, error) => {
    const h = harness(options);
    try {
      const response = await h.ask();
      expect(response.statusCode).toBe(status);
      if (error !== null) expect(response.json().error).toBe(error);
      expect(h.check).not.toHaveBeenCalled();
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it("refuses an ask when the composition omitted the question check", async () => {
    const h = harness({ check: false });
    try {
      expect((await h.ask()).statusCode).toBe(503);
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });
});

it("throws for a future outcome instead of silently allowing an undefined answer", () => {
  // Property: extending the outcome union requires an explicit HTTP decision.
  // Mutant: remove the exhaustive default; changing a refusal's message is a neighbour.
  expect(() => answerForOutcome({ outcome: "FUTURE" } as unknown as QuestionCheckOutcome, null)).toThrow();
});

const REFUSALS: readonly QuestionCheckOutcome[] = [
  { outcome: "REFUSE", kind: "HARM_TO_OTHERS", screen: "REFUSE", emergencyNumber: true },
  { outcome: "REFUSE", kind: "DRUGS", screen: "REFUSE", emergencyNumber: false },
  { outcome: "REFUSE", kind: "SUICIDE_AND_ASSISTED_DYING", screen: "SENSITIVE", emergencyNumber: false },
  { outcome: "REFUSE", kind: "GAMBLING", screen: "REFUSE", emergencyNumber: false }
];

describe("S04 storing nothing (V, 2026-10-28)", () => {
  // Property: no outcome of the question check leads the route to keep the question.
  it.each([
    ...REFUSALS, { outcome: "CRISIS" }, { outcome: "PASS" }, { outcome: "UNAVAILABLE", code: "QUESTION_CHECK_HTTP_STATUS" }
  ] as QuestionCheckOutcome[])("keeps nothing for %j", async (outcome) => {
    const h = harness({ outcome });
    try {
      await h.ask("  Should this happen?  ");
      expect(h.keep).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });
});

describe("S04 question gate outcomes", () => {
  it.each(["OWN_CRISIS", "SUICIDE_METHODS"])("answers 422 CRISIS_SUPPORT_OFFERED with edge country for %s", async () => {
    const h = harness({ outcome: { outcome: "CRISIS" } });
    try {
      const response = await h.ask(undefined, "RO");
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ error: CRISIS_SUPPORT_OFFERED, message: CRISIS_SUPPORT_OFFERED, country: "RO" });
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it.each(REFUSALS)("answers 422 QUESTION_NOT_STARTED with the subject and its screen for %j", async (outcome) => {
    const refusal = outcome as Extract<QuestionCheckOutcome, { outcome: "REFUSE" }>;
    const h = harness({ outcome });
    try {
      const response = await h.ask();
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind: refusal.kind,
        screen: refusal.screen, emergency_number: refusal.emergencyNumber });
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it("passes an ordinary question unchanged to submit once and answers 202", async () => {
    const h = harness({ outcome: { outcome: "PASS" } });
    try {
      const response = await h.ask();
      expect(response.statusCode).toBe(202);
      expect(h.submitted).toHaveBeenCalledOnce();
      expect(h.submitted.mock.calls[0]?.[0]).toMatchObject(ASK);
      expect(h.submitted.mock.calls[0]?.[1]).toMatchObject({ caller_scope: "ASKER" });
      expect(h.submitted.mock.calls[0]?.[2]).toMatchObject({ kind: "server" });
    } finally { await h.api.close(); }
  });

  it.each(QUESTION_CHECK_FAILURE_CODES)("answers 503 QUESTION_CHECK_UNAVAILABLE for %s without submitting", async (code) => {
    const h = harness({ outcome: { outcome: "UNAVAILABLE", code } });
    try {
      const response = await h.ask();
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "QUESTION_CHECK_UNAVAILABLE", message: "QUESTION_CHECK_UNAVAILABLE" });
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });
});

describe("S04 route disclosure", () => {
  it("logs neither question text nor subject id for every outcome and failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const question = "private sentinel question Ω";
    try {
      const outcomes: QuestionCheckOutcome[] = [{ outcome: "PASS" }, { outcome: "CRISIS" }, ...REFUSALS];
      outcomes.push(...QUESTION_CHECK_FAILURE_CODES.map((code) => ({ outcome: "UNAVAILABLE" as const, code })));
      for (const outcome of outcomes) {
        const h = harness({ outcome });
        try { await h.ask(question); } finally { await h.api.close(); }
      }
      const lines = log.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
      expect(lines).not.toContain(question);
      for (const id of readQuestionSubjects().map(subject => subject.id)) expect(lines).not.toContain(id);
    } finally { log.mockRestore(); }
  });

  it("never echoes the question text in 422 or 503 bodies", async () => {
    const question = "private sentinel question Ω";
    const outcomes: QuestionCheckOutcome[] = [
      { outcome: "CRISIS" },
      ...REFUSALS,
      ...QUESTION_CHECK_FAILURE_CODES.map((code) => ({ outcome: "UNAVAILABLE" as const, code }))
    ];
    for (const outcome of outcomes) {
      const h = harness({ outcome });
      try {
        const response = await h.ask(question);
        expect([422, 503]).toContain(response.statusCode);
        expect(response.body).not.toContain(question);
      } finally { await h.api.close(); }
    }
  });
});
