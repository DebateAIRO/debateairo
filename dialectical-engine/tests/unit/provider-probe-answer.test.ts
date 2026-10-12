/**
 * Probe answer fix (2026-10-12, practice debate 3): the health probe asks "Reply exactly: OK" and used to accept only
 * the two bytes `OK`. MiMo-V2.6-Pro answers at temperature 1.0 and thinks first, so a working answer such as "OK.",
 * "\n\nOK" or a finished thinking block before "OK" marked it ABSENT (PROVIDER_PROBE_FAILED, billed); with GLM busy at
 * the same moment the premium plan was refused (ASK_PLAN_TIER_MODEL_UNAVAILABLE). The probe now accepts those harmless
 * variants on both wires, still refuses a reply that is not that answer, and still demands the exact model id. Off
 * the preview it no longer asks for an 8-token answer a thinking model spends before writing "OK".
 */
import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND,
  observeProviderTarget,
  parseProviderDiscoveryTargets,
  previewProbeControls,
  previewTargetJsonRow,
  type ProviderDiscoveryTarget
} from "@debateai/providers";

const MIMO_REF = "preview:mimo-v2-6-pro";
const MIMO = parseProviderDiscoveryTargets(JSON.stringify([previewTargetJsonRow(MIMO_REF)]),
  [{ providerRef: MIMO_REF, maker: "Xiaomi" }])[0]!;
const PLAIN: ProviderDiscoveryTarget = Object.freeze({
  providerRef: "api:probe-fixture", maker: "fixture", baseUrl: "https://provider.example.test/v1", model: "fixture-model"
});
const HAIKU: ProviderDiscoveryTarget = Object.freeze({
  providerRef: "vendor:anthropic", maker: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5",
  authorizationHeader: "fixture-key", adapterKind: ANTHROPIC_MESSAGES_HTTP_ADAPTER_KIND
});

/** One probe of `target` against a vendor answering `body`; returns the observation and the body the probe sent. */
async function probe(target: ProviderDiscoveryTarget, body: unknown, extra: Readonly<{ thinkingLevel?: string; tokenCeiling?: number }> = {}) {
  const sent: Record<string, unknown>[] = [];
  const observation = await observeProviderTarget({
    target, timeoutMs: 1_000, clock: () => new Date("2026-10-12T16:05:00.000Z"), ...extra,
    fetchImplementation: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  return { observation, sent: sent[0]! };
}
/** A DeepInfra chat completion: the echoed model, one choice, this content and finish reason. */
const completion = (model: string, content: unknown, finishReason: string | null = "stop") =>
  ({ id: "probe-fixture", model, choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }] });
/** An Anthropic Messages reply: thinking first, then this text. */
const messages = (model: string, text: string, stopReason = "end_turn") => ({
  id: "msg_fixture", type: "message", role: "assistant", model,
  content: [{ type: "thinking", thinking: "" }, { type: "text", text }],
  stop_reason: stopReason, stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
});

const WORKING_ANSWERS = [
  "OK", "OK.", "OK!", "ok", "Ok.", " OK", "OK\n", "\n\nOK", "\n\nOK.\n", "**OK**", "`OK`", "\"OK\"", "„OK”", "*OK.*",
  "<think>The user wants exactly OK.</think>\n\nOK", "<think>\nShort.\n</think>OK."
] as const;
const NOT_AN_ANSWER = [
  "", " ", "\n\n", ".", "Sure, OK", "OK, here you go", "OK OK", "NOT OK", "OKAY", "Okay.", "O K", "O.K.", "No", "OK?",
  "I cannot help with that.", "The user asks me to reply OK", "<think>The user wants exactly OK.", "<think>OK</think>",
  "<think>OK</think>\n\nSure", "OK</think>", "..OK", "{\"answer\":\"OK\"}"
] as const;
/** Of those, the replies with no words at all (probe failure reasons, 2026-10-12): the rest are other words. */
const EMPTY_ANSWERS: readonly string[] = ["", " ", "\n\n", "<think>OK</think>"];
const refusedAs = (answer: string) => EMPTY_ANSWERS.includes(answer) ? "PROVIDER_PROBE_ANSWER_EMPTY" : "PROVIDER_PROBE_ANSWER_NOT_OK";

describe("the probe accepts a working answer in its harmless variants (both wires)", () => {
  for (const answer of WORKING_ANSWERS) {
    it(`OpenAI-compatible: HEALTHY on ${JSON.stringify(answer)}`, async () => {
      const { observation } = await probe(MIMO, completion(MIMO.model, answer), previewProbeControls(MIMO));
      expect(observation).toMatchObject({ state: "HEALTHY", modelId: MIMO.model, failureCode: null });
    });
    it(`Anthropic Messages: HEALTHY on ${JSON.stringify(answer)}`, async () => {
      const { observation } = await probe(HAIKU, messages(HAIKU.model, answer));
      expect(observation).toMatchObject({ state: "HEALTHY", modelId: HAIKU.model, failureCode: null });
    });
  }
});

describe("the probe still refuses a reply that is not a working answer", () => {
  for (const answer of NOT_AN_ANSWER) {
    it(`OpenAI-compatible: ABSENT on ${JSON.stringify(answer)}`, async () => {
      const { observation } = await probe(MIMO, completion(MIMO.model, answer), previewProbeControls(MIMO));
      expect(observation).toMatchObject({ state: "ABSENT", modelId: null, failureCode: refusedAs(answer) });
    });
    it(`Anthropic Messages: ABSENT on ${JSON.stringify(answer)}`, async () => {
      const { observation } = await probe(HAIKU, messages(HAIKU.model, answer));
      expect(observation).toMatchObject({ state: "ABSENT", modelId: null, failureCode: refusedAs(answer) });
    });
  }
  for (const [label, content] of [["no content", null], ["a content array", [{ type: "text", text: "OK" }]], ["a number", 0]] as const) {
    it(`OpenAI-compatible: ABSENT on ${label}`, async () => {
      expect((await probe(MIMO, completion(MIMO.model, content))).observation.state).toBe("ABSENT");
    });
  }
  it("thinking that spent the whole allowance is no answer: ABSENT (empty content, finish_reason length)", async () => {
    const { observation } = await probe(MIMO, completion(MIMO.model, "", "length"), previewProbeControls(MIMO));
    expect(observation).toMatchObject({ state: "ABSENT", failureCode: "PROVIDER_PROBE_ANSWER_CUT_OFF" });
  });
  it("Anthropic Messages: an \"OK.\" cut off at max_tokens is still refused", async () => {
    expect((await probe(HAIKU, messages(HAIKU.model, "OK.", "max_tokens"))).observation.state).toBe("ABSENT");
  });
});

describe("the model id proof is not loosened", () => {
  for (const model of ["XiaomiMiMo/MiMo-V2.6", "xiaomimimo/mimo-v2.6-pro", " XiaomiMiMo/MiMo-V2.6-Pro", "XiaomiMiMo/MiMo-V2.6-Pro.", ""]) {
    it(`OpenAI-compatible: ABSENT when the reply names ${JSON.stringify(model)}, even with an exact "OK"`, async () => {
      for (const answer of ["OK", "OK."]) {
        expect((await probe(MIMO, completion(model, answer), previewProbeControls(MIMO))).observation.state).toBe("ABSENT");
      }
    });
  }
  it("OpenAI-compatible: ABSENT when the reply names no model", async () => {
    const { model: _model, ...unnamed } = completion(MIMO.model, "OK.");
    expect((await probe(MIMO, unnamed)).observation.state).toBe("ABSENT");
  });
  for (const model of ["claude-haiku-5", "CLAUDE-HAIKU-5-5", "claude-haiku-5-5 "]) {
    it(`Anthropic Messages: ABSENT when the reply names ${JSON.stringify(model)}`, async () => {
      expect((await probe(HAIKU, messages(model, "OK."))).observation.state).toBe("ABSENT");
    });
  }
});

describe("the probe's answer room (a thinking model must be able to write OK)", () => {
  it("off the preview both wires ask for the same room, and it is not the old 8 tokens", async () => {
    expect((await probe(PLAIN, completion(PLAIN.model, "OK"))).sent.max_tokens).toBe(512);
    expect((await probe(HAIKU, messages(HAIKU.model, "OK"))).sent.max_tokens).toBe(512);
  });
  it("a caller's own ceiling is still sent as given", async () => {
    expect((await probe(PLAIN, completion(PLAIN.model, "OK"), { tokenCeiling: 32 })).sent.max_tokens).toBe(32);
    expect((await probe(HAIKU, messages(HAIKU.model, "OK"), { tokenCeiling: 300 })).sent.max_tokens).toBe(300);
  });
  it("practice debate 3's MiMo probe, as sent: 8,192 tokens of room, its reviewed sampling, no effort member; \"OK.\" is now HEALTHY", async () => {
    const { observation, sent } = await probe(MIMO, completion(MIMO.model, "OK."), previewProbeControls(MIMO));
    expect(sent).toStrictEqual({
      model: "XiaomiMiMo/MiMo-V2.6-Pro", max_tokens: 8192, temperature: 1.0, top_p: 0.95,
      messages: [{ role: "user", content: "DR-181 discovery health probe. Reply exactly: OK" }]
    });
    expect(observation.state).toBe("HEALTHY");
  });
});
