/**
 * Probe failure reasons (2026-10-12, follow-up to practice debate 3): a probe that ends ABSENT records WHY, as its
 * failure code. Before, every cause was PROVIDER_PROBE_FAILED, so MiMo's failed probe (DeepInfra answered, billed)
 * could not be told apart from a timeout, a vendor error or a wrong answer afterwards. The codes are one UPPER_SNAKE
 * word each (the runner copies them into claim records whose absent_failure_code must match migration 0069's
 * ^[A-Z][A-Z0-9_]{0,95}$), and never carry the reply's text or a vendor's error body. The gate-proven unbilled refusal
 * keeps its own code (PROVIDER_PROBE_UNBILLED_REFUSAL), which the preview's busy rules read.
 */
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  observeProviderTarget,
  PreviewChargeBookedMax,
  PreviewGateUnavailable,
  PreviewModelCooling,
  PreviewUnbilledRefusal,
  PROVIDER_PROBE_UNBILLED_REFUSAL,
  type ProviderDiscoveryTarget
} from "@debateai/providers";

const OPENAI: ProviderDiscoveryTarget = Object.freeze({
  providerRef: "api:probe-fixture", maker: "fixture", baseUrl: "https://provider.example.test/v1", model: "fixture-model",
  thinkingParameter: "reasoning_effort", thinkingLevels: ["high"]
});
const ANTHROPIC: ProviderDiscoveryTarget = Object.freeze({
  providerRef: "vendor:anthropic", maker: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5",
  authorizationHeader: "fixture-key", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND
});
/** Migration 0069's absent_failure_code shape, which every probe code must fit. */
const CLAIM_CODE = /^[A-Z][A-Z0-9_]{0,95}$/u;

type Vendor = (signal: AbortSignal | undefined) => Promise<Response>;
async function probe(target: ProviderDiscoveryTarget, vendor: Vendor,
  extra: Readonly<{ thinkingLevel?: string; tokenCeiling?: number; timeoutMs?: number }> = {}) {
  let posts = 0;
  const observation = await observeProviderTarget({
    target, timeoutMs: extra.timeoutMs ?? 1_000, clock: () => new Date("2026-10-12T16:05:00.000Z"),
    ...(extra.thinkingLevel === undefined ? {} : { thinkingLevel: extra.thinkingLevel }),
    ...(extra.tokenCeiling === undefined ? {} : { tokenCeiling: extra.tokenCeiling }),
    fetchImplementation: async (_url, init) => { posts += 1; return vendor(init?.signal ?? undefined); }
  });
  if (observation.failureCode !== null) expect(observation.failureCode).toMatch(CLAIM_CODE);
  return { observation, posts };
}
const json = (body: unknown, status = 200) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const throws = (error: unknown): Vendor => async () => { throw error; };
const completion = (content: unknown, finishReason: string | null = "stop", model = OPENAI.model) =>
  ({ id: "probe-fixture", model, choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }] });
const message = (text: string, stopReason = "end_turn", model = ANTHROPIC.model, content?: unknown[]) => ({
  id: "msg_fixture", type: "message", role: "assistant", model, content: content ?? [{ type: "text", text }],
  stop_reason: stopReason, stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
});

describe("before anything is sent: the probe's own settings", () => {
  it("a token ceiling out of range: PROVIDER_PROBE_TOKEN_CEILING_INVALID, nothing sent", async () => {
    const { observation, posts } = await probe(OPENAI, json(completion("OK")), { tokenCeiling: 0 });
    expect(observation).toMatchObject({ state: "ABSENT", modelId: null, failureCode: "PROVIDER_PROBE_TOKEN_CEILING_INVALID" });
    expect(posts).toBe(0);
  });
  it("a thinking level the target does not offer: PROVIDER_PROBE_THINKING_INVALID, nothing sent", async () => {
    const { observation, posts } = await probe(OPENAI, json(completion("OK")), { thinkingLevel: "low" });
    expect(observation.failureCode).toBe("PROVIDER_PROBE_THINKING_INVALID");
    expect(posts).toBe(0);
  });
  it("a request that cannot be built (a malformed credential): PROVIDER_PROBE_REQUEST_INVALID, nothing sent", async () => {
    const { observation, posts } = await probe({ ...ANTHROPIC, authorizationHeader: "two words" }, json(message("OK")));
    expect(observation.failureCode).toBe("PROVIDER_PROBE_REQUEST_INVALID");
    expect(posts).toBe(0);
  });
  it("the preview's own body check refused it: PROVIDER_PROBE_REQUEST_INVALID", async () => {
    const { observation } = await probe(OPENAI, throws(new TypeError("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID")));
    expect(observation.failureCode).toBe("PROVIDER_PROBE_REQUEST_INVALID");
  });
});

describe("the call: no answer came back", () => {
  it("the time limit ran out (the real AbortSignal timeout): PROVIDER_PROBE_TIMED_OUT", async () => {
    const waitsForAbort: Vendor = (signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    expect((await probe(OPENAI, waitsForAbort, { timeoutMs: 5 })).observation.failureCode).toBe("PROVIDER_PROBE_TIMED_OUT");
  });
  it("a cancelled call is a timeout too (the preview's guarded fetch on an aborted signal)", async () => {
    expect((await probe(OPENAI, throws(new DOMException("Private preview call canceled", "TimeoutError")))).observation.failureCode)
      .toBe("PROVIDER_PROBE_TIMED_OUT");
    expect((await probe(OPENAI, throws(new DOMException("aborted", "AbortError")))).observation.failureCode)
      .toBe("PROVIDER_PROBE_TIMED_OUT");
  });
  it("the vendor could not be reached (a network failure): PROVIDER_PROBE_NOT_ANSWERED", async () => {
    expect((await probe(OPENAI, throws(new TypeError("fetch failed")))).observation.failureCode).toBe("PROVIDER_PROBE_NOT_ANSWERED");
  });
  it("preview: sent, then failed at the vendor (the gate booked its maximum): PROVIDER_PROBE_NOT_ANSWERED", async () => {
    expect((await probe(OPENAI, throws(new PreviewChargeBookedMax()))).observation.failureCode).toBe("PROVIDER_PROBE_NOT_ANSWERED");
  });
  it("preview: the gate's port cancelled the call at the probe's time limit (it reports its socket failing): PROVIDER_PROBE_TIMED_OUT", async () => {
    const portCancels: Vendor = (signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority unavailable")), { once: true });
    });
    expect((await probe(OPENAI, portCancels, { timeoutMs: 5 })).observation.failureCode).toBe("PROVIDER_PROBE_TIMED_OUT");
  });
  it("preview: the gate was halted or shut, or its socket could not be reached: PROVIDER_PROBE_GATE_UNAVAILABLE", async () => {
    expect((await probe(OPENAI, throws(new PreviewGateUnavailable()))).observation.failureCode).toBe("PROVIDER_PROBE_GATE_UNAVAILABLE");
    expect((await probe(OPENAI, throws(new TypedDomainError("PROVIDER_USAGE_UNREPORTED", "Private preview authority unavailable"))))
      .observation.failureCode).toBe("PROVIDER_PROBE_GATE_UNAVAILABLE");
  });
  it("preview: the gate refused it for money: PROVIDER_PROBE_GATE_REFUSED", async () => {
    for (const code of ["DAILY_COST_ENVELOPE_REACHED", "RUN_COST_ENVELOPE_MONEY_REACHED"]) {
      expect((await probe(OPENAI, throws(new TypedDomainError(code, "fixture")))).observation.failureCode).toBe("PROVIDER_PROBE_GATE_REFUSED");
    }
  });
  it("preview: a gate-proven unbilled refusal keeps its own code (the busy rules read it)", async () => {
    for (const error of [new PreviewUnbilledRefusal(), new PreviewModelCooling(60)]) {
      expect((await probe(OPENAI, throws(error))).observation.failureCode).toBe(PROVIDER_PROBE_UNBILLED_REFUSAL);
    }
  });
});

describe("the reply: an answer came back, and it was not usable", () => {
  for (const status of [401, 404, 429, 500, 503, 529]) {
    it(`the vendor answered HTTP ${status}: PROVIDER_PROBE_HTTP_${status} (its error body is not recorded)`, async () => {
      const { observation } = await probe(OPENAI, json({ error: { message: "Incorrect API key provided: sk-abc***xyz" } }, status));
      expect(observation.failureCode).toBe(`PROVIDER_PROBE_HTTP_${status}`);
    });
  }
  it("a reply over 64 KiB: PROVIDER_PROBE_REPLY_TOO_LARGE", async () => {
    expect((await probe(OPENAI, json(completion("x".repeat(70_000))))).observation.failureCode).toBe("PROVIDER_PROBE_REPLY_TOO_LARGE");
  });
  for (const [label, body] of [
    ["not JSON", "<html>bad gateway</html>"], ["a JSON array", [1, 2]], ["no choices", { model: OPENAI.model }],
    ["an empty choice list", { model: OPENAI.model, choices: [] }], ["a choice with no message", { model: OPENAI.model, choices: [{}] }],
    ["content as an array of parts", completion([{ type: "text", text: "OK" }])], ["content as a number", completion(0)]
  ] as const) {
    it(`OpenAI-compatible, ${label}: PROVIDER_PROBE_REPLY_UNREADABLE`, async () => {
      expect((await probe(OPENAI, json(body))).observation.failureCode).toBe("PROVIDER_PROBE_REPLY_UNREADABLE");
    });
  }
  for (const [label, body] of [
    ["not a message", { type: "error", error: { type: "api_error", message: "x" } }],
    ["a tool call block", message("", "end_turn", ANTHROPIC.model, [{ type: "tool_use", id: "t", name: "x", input: {} }])],
    ["an unknown stop reason", message("OK", "pause_turn")]
  ] as const) {
    it(`Anthropic Messages, ${label}: PROVIDER_PROBE_REPLY_UNREADABLE`, async () => {
      expect((await probe(ANTHROPIC, json(body))).observation.failureCode).toBe("PROVIDER_PROBE_REPLY_UNREADABLE");
    });
  }
  it("another model answered: PROVIDER_PROBE_MODEL_MISMATCH, on both wires, even with a good OK", async () => {
    expect((await probe(OPENAI, json(completion("OK", "stop", "other-model")))).observation.failureCode).toBe("PROVIDER_PROBE_MODEL_MISMATCH");
    expect((await probe(ANTHROPIC, json(message("OK", "end_turn", "claude-other")))).observation.failureCode).toBe("PROVIDER_PROBE_MODEL_MISMATCH");
  });
  it("thinking spent the whole allowance (empty content, finish_reason length): PROVIDER_PROBE_ANSWER_CUT_OFF", async () => {
    for (const content of ["", null, "<think>The user wants exactly"]) {
      expect((await probe(OPENAI, json(completion(content, "length")))).observation.failureCode).toBe("PROVIDER_PROBE_ANSWER_CUT_OFF");
    }
    expect((await probe(ANTHROPIC, json(message("", "max_tokens")))).observation.failureCode).toBe("PROVIDER_PROBE_ANSWER_CUT_OFF");
  });
  it("the AI declined: PROVIDER_PROBE_ANSWER_REFUSED", async () => {
    expect((await probe(ANTHROPIC, json(message("", "refusal")))).observation.failureCode).toBe("PROVIDER_PROBE_ANSWER_REFUSED");
    expect((await probe(OPENAI, json(completion("", "content_filter")))).observation.failureCode).toBe("PROVIDER_PROBE_ANSWER_REFUSED");
  });
  it("no words at all: PROVIDER_PROBE_ANSWER_EMPTY", async () => {
    for (const content of ["", "  \n", null, "<think>All done.</think>\n"]) {
      expect((await probe(OPENAI, json(completion(content)))).observation.failureCode).toBe("PROVIDER_PROBE_ANSWER_EMPTY");
    }
    expect((await probe(ANTHROPIC, json(message(" ")))).observation.failureCode).toBe("PROVIDER_PROBE_ANSWER_EMPTY");
  });
  it("other words: PROVIDER_PROBE_ANSWER_NOT_OK, and the words themselves are not recorded", async () => {
    for (const target of [OPENAI, ANTHROPIC]) {
      const reply = "SECRET_LOOKING_REPLY_TEXT";
      const vendor = target === OPENAI ? json(completion(reply)) : json(message(reply));
      const { observation } = await probe(target, vendor);
      expect(observation.failureCode).toBe("PROVIDER_PROBE_ANSWER_NOT_OK");
      expect(JSON.stringify(observation)).not.toContain(reply);
    }
  });
  it("a working answer still records no failure", async () => {
    expect((await probe(OPENAI, json(completion("OK.")))).observation).toMatchObject({ state: "HEALTHY", failureCode: null });
    expect((await probe(ANTHROPIC, json(message("OK")))).observation).toMatchObject({ state: "HEALTHY", failureCode: null });
  });
});
