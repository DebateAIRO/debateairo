import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { CRISIS_SUPPORT_OFFERED, QUESTION_NOT_STARTED_KINDS, SENSITIVE_DATA_CONSENT_REQUIRED } from "@debateai/contract";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { CountryGate } from "../../apps/api/src/country-gate.js";
import { KEPT_LABELS, QUESTION_CHECK_FAILURE_CODES, QUESTION_CHECK_LABELS, REFUSING_KINDS, type QuestionCheckOutcome } from "../../apps/api/src/question-check/contract.js";
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
  outcome?: QuestionCheckOutcome; keepFails?: boolean } = {}) {
  const identity = testHttpIdentity("s04-gate");
  const submitted = vi.fn(async (_ask: unknown, _session: unknown, _principal: unknown) => (
    { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" }
  ));
  const application = new Proxy({}, { get: (_target, key) => key === "submit" ? submitted : async () => null }) as AskApplication;
  const check = vi.fn(async (_question: string): Promise<QuestionCheckOutcome> => input.outcome ?? { outcome: "PASS" });
  const keep = vi.fn(async (_record: unknown) => {
    if (input.keepFails) throw Object.assign(new Error("private question must not be logged"), { code: "KEEP_IO_DOWN" });
  });
  const sessions = { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => input.consent ?? "given" };
  const admission = { decide: () => input.rate
    ? { allowed: false, reason: "ASKS_EXHAUSTED", retryAfterMs: 60_000, windowMs: 60_000 }
    : { allowed: true } } as unknown as AdmissionLimiter;
  const countryGate = { recordedCountry: () => null, ask: () => input.country ? "COUNTRY_ASK_BLOCKED" : null } as unknown as CountryGate;
  const api = buildApi({ application, sessions, admission, countryGate, allowedOrigin: TEST_APP_ORIGIN,
    ...(input.preview ? { previewProviderTestConfig: PREVIEW, previewTeamUserIds: [] } : {}),
    ...(input.check === false ? {} : { questionCheck: { check, keep } })
  });
  const ask = (questionLine: string = ASK.question_line, countryHeader?: string) => api.inject({
    method: "POST", url: "/v1/asks", headers: { ...testSessionHeaders(identity, true),
      ...(countryHeader === undefined ? {} : { "cf-ipcountry": countryHeader }) },
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

describe("S04 kept refusals", () => {
  it.each(KEPT_LABELS)("keeps the trimmed question and account once for %s", async (kind) => {
    const h = harness({ outcome: { outcome: "REFUSE", kind, kept: true } });
    try {
      const response = await h.ask("  Should this happen?  ");
      expect(response.statusCode).toBe(422);
      expect(h.keep).toHaveBeenCalledExactlyOnceWith({ questionLine: "Should this happen?",
        accountUserId: h.identity.authenticated.userId });
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it.each([
    "CRIME", "HATE_SPEECH", "RELIGIOUS_INSULT", "SENSITIVE_TOPIC", "OWN_CRISIS", "METHODS_OR_ENCOURAGEMENT", "phrase check"
  ])("keeps nothing for %s", async (kind) => {
    const outcome: QuestionCheckOutcome = kind === "phrase check" ? { outcome: "PASS" }
      : kind === "OWN_CRISIS" || kind === "METHODS_OR_ENCOURAGEMENT" ? { outcome: "CRISIS" }
      : { outcome: "REFUSE", kind: kind as "HATE_SPEECH", kept: false };
    const h = harness({ outcome });
    try {
      await h.ask(kind === "phrase check" ? "Should I kill myself?" : undefined);
      expect(h.keep).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it("answers 503 and does not submit when keeping fails", async () => {
    const h = harness({ outcome: { outcome: "REFUSE", kind: "HARM_TO_OTHERS", kept: true }, keepFails: true });
    try {
      const response = await h.ask();
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "QUESTION_CHECK_UNAVAILABLE", message: "QUESTION_CHECK_UNAVAILABLE" });
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it("logs a failed keep as a generic check outage without naming its outcome class", async () => {
    // Property: a log reader cannot infer that this refusal was one of the two kept labels.
    // Mutant: call the event keep_failed; changing the failure code is a neighbour.
    const lines: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(value => { lines.push(String(value)); });
    const h = harness({ outcome: { outcome: "REFUSE", kind: "HARM_TO_OTHERS", kept: true }, keepFails: true });
    try {
      await h.ask();
      expect(lines.map(line => JSON.parse(line))).toContainEqual({ event: "api.question_check.unavailable", code: "KEEP_IO_DOWN" });
      expect(lines.join(" ")).not.toMatch(/keep_failed|HARM_TO_OTHERS|WEAPONS_DRUGS_TERRORISM/u);
    } finally { log.mockRestore(); await h.api.close(); }
  });
});

describe("S04 question gate outcomes", () => {
  it.each(["OWN_CRISIS", "METHODS_OR_ENCOURAGEMENT"])("answers 422 CRISIS_SUPPORT_OFFERED with edge country for %s", async () => {
    const h = harness({ outcome: { outcome: "CRISIS" } });
    try {
      const response = await h.ask(undefined, "RO");
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ error: CRISIS_SUPPORT_OFFERED, message: CRISIS_SUPPORT_OFFERED, country: "RO" });
      expect(h.submitted).not.toHaveBeenCalled();
    } finally { await h.api.close(); }
  });

  it.each(REFUSING_KINDS)("answers 422 QUESTION_NOT_STARTED with kind %s and does not submit", async (kind) => {
    expect(QUESTION_NOT_STARTED_KINDS).toEqual(REFUSING_KINDS);
    const h = harness({ outcome: { outcome: "REFUSE", kind, kept: false } });
    try {
      const response = await h.ask();
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind });
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
  it("logs neither question text nor label for every outcome and failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const question = "private sentinel question Ω";
    try {
      const outcomes: QuestionCheckOutcome[] = QUESTION_CHECK_LABELS.map((label) =>
        label === "ORDINARY" ? { outcome: "PASS" }
          : label === "OWN_CRISIS" || label === "METHODS_OR_ENCOURAGEMENT" ? { outcome: "CRISIS" }
          : { outcome: "REFUSE", kind: label, kept: label === "HARM_TO_OTHERS" || label === "WEAPONS_DRUGS_TERRORISM" });
      outcomes.push(...QUESTION_CHECK_FAILURE_CODES.map((code) => ({ outcome: "UNAVAILABLE" as const, code })));
      for (const outcome of outcomes) {
        const h = harness({ outcome });
        try { await h.ask(question); } finally { await h.api.close(); }
      }
      const failedKeep = harness({ outcome: { outcome: "REFUSE", kind: "HARM_TO_OTHERS", kept: true }, keepFails: true });
      try { await failedKeep.ask(question); } finally { await failedKeep.api.close(); }
      const lines = log.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
      expect(lines).not.toContain(question);
      for (const label of QUESTION_CHECK_LABELS) expect(lines).not.toContain(label);
      expect(lines).toContain('"code":"KEEP_IO_DOWN"');
    } finally { log.mockRestore(); }
  });

  it("never echoes the question text in 422 or 503 bodies", async () => {
    const question = "private sentinel question Ω";
    const outcomes: QuestionCheckOutcome[] = [
      { outcome: "CRISIS" },
      ...REFUSING_KINDS.map((kind) => ({ outcome: "REFUSE" as const, kind, kept: false })),
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
