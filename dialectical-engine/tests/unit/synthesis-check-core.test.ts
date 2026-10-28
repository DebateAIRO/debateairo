import { tmpdir } from "node:os";
import { TypedDomainError } from "../../packages/kernel/src/index.js";
import { buildFramedPrompt } from "../../packages/providers/src/prompt-frame.js";
import { readPromptFrame } from "../../packages/providers/src/prompt-frame.js";
import type { PromptPacket } from "../../packages/providers/src/index.js";
import { judgeCallValue } from "../../apps/api/src/publication-check/verdict.js";
import { describe, expect, it } from "vitest";
import * as judgeTransport from "../../apps/api/src/publication-check/judge-transport.js";

const answerFor = (packet: PromptPacket, flags = [0, 0, 0, 0], call = judgeCallValue(readPromptFrame(packet).fence)) =>
  `{"call":"${call}","TERRORISM":${flags[0]},"HATE_SPEECH":${flags[1]},"SUICIDE_OR_HARM_TO_OTHERS":${flags[2]},"WEAPONS_OR_DRUGS":${flags[3]}}`;

function checkFixture(options: {
  synthesisText?: string | null;
  flags?: number[];
  usage?: { input_tokens?: number; output_tokens?: number; cost_usd?: number };
  complete?: (input: { packet: PromptPacket; signal: AbortSignal }) => Promise<{ text: string; usage?: { input_tokens?: number; output_tokens?: number; cost_usd?: number } }>;
  price?: { inputUsdPerM: string; outputUsdPerM: string } | null;
  dayPot?: { ceilingMicros: number; spentMicros(day: string): number };
  deadlineMs?: number;
  deadlineAt?: Date;
  portOff?: boolean;
} = {}) {
  const records: Record<string, unknown>[] = [];
  const lines: Record<string, unknown>[] = [];
  const packets: PromptPacket[] = [];
  let calls = 0;
  const port = {
    providerRef: "anthropic", modelId: "claude-haiku-5-5",
    async complete(input: { packet: PromptPacket; signal: AbortSignal }) {
      calls++;
      packets.push(input.packet);
      return options.complete?.(input) ?? { text: answerFor(input.packet, options.flags), usage: options.usage ?? { input_tokens: 900, output_tokens: 40, cost_usd: 0.5 } };
    }
  };
  const deps = {
    port: () => options.portOff ? null : port,
    deadlineMs: options.deadlineMs ?? 1500,
    ...(options.dayPot === undefined ? {} : { dayPot: options.dayPot }),
    recordSpend: async (entry: unknown) => { records.push(entry as Record<string, unknown>); },
    priceOf: (_model: string) => options.price === undefined ? { inputUsdPerM: "0.10", outputUsdPerM: "0.50" } : options.price,
    clock: () => new Date(),
    log: (line: unknown) => { lines.push(line as Record<string, unknown>); }
  };
  const input = {
    runId: "run-1", answerId: "answer-1", answerVersion: 2,
    synthesisText: options.synthesisText === undefined ? "Exact synthesis text\n\nwith spacing" : options.synthesisText,
    deadlineAt: options.deadlineAt ?? new Date(Date.now() + 1500)
  };
  return { deps, input, records, lines, packets, calls: () => calls, port };
}

describe("synthesis check core", () => {
  it("the instruction contains each of V's four phrases, character for character", async () => {
    // Property: the model receives the approved code and phrase for each category.
    const { synthesisCheckContract } = await import("../../apps/api/src/synthesis-check/policy.js");
    const instruction = synthesisCheckContract().instruction;
    expect(instruction).toContain("TERRORISM: Possible terrorism");
    expect(instruction).toContain("HATE_SPEECH: hate speech of any kind");
    expect(instruction).toContain("SUICIDE_OR_HARM_TO_OTHERS: tendencies to suicide or harming other people");
    expect(instruction).toContain("WEAPONS_OR_DRUGS: crafting weapons or drugs");
  });

  it("the instruction contains S01-R11's sentence, character for character, after the fourth phrase, and neither of its two earlier wordings", async () => {
    // Property: V-79's rule replaces both earlier force rules at the required position.
    const { synthesisCheckContract } = await import("../../apps/api/src/synthesis-check/policy.js");
    const instruction = synthesisCheckContract().instruction;
    const sentence = 'A debate about violence as a subject of history, law, ethics, politics, current affairs or public policy, including whether a state, an army or the police should use force, is not "harming other people" by its subject alone; its synthesis counts as "harming other people" when it urges or plans harm to a person, or when it concludes that a state, an army, the police or anyone else should use force against people.';
    const v62FirstWording = 'A debate about violence as a subject of history, law, ethics, politics, current affairs or public policy, including whether a state, an army or the police should use force, is not "harming other people" unless its synthesis urges or plans harm to a person.';
    const v73Wording = 'A debate about violence as a subject of history, law, ethics, politics, current affairs or public policy, including whether a state, an army or the police should use force, is not "harming other people" by its subject alone; its synthesis counts as "harming other people" when it urges or plans harm to a person, or when it concludes that a state, an army or the police should use force.';
    expect(instruction.indexOf(sentence)).toBeGreaterThan(instruction.indexOf("WEAPONS_OR_DRUGS: crafting weapons or drugs"));
    expect(instruction.indexOf("WEAPONS_OR_DRUGS: crafting weapons or drugs")).toBeGreaterThanOrEqual(0);
    expect(instruction.includes(v62FirstWording)).toBe(false);
    expect(instruction.includes(v73Wording)).toBe(false);
    expect(instruction.includes("unless its synthesis urges or plans harm to a person.")).toBe(false);
  });

  it("the transport maps a PROMPT_ refusal, a non-2xx, an abort at D, a length cut and any other failure to DOOR_REFUSED, HTTP_STATUS, DEADLINE, ANSWER_NOT_JSON and TRANSPORT_FAILED", async () => {
    // Property: an external adapter failure becomes one closed failure code, never its message.
    const { createSynthesisCheckTransport, synthesisCheckFailureCode } = await import("../../apps/api/src/synthesis-check/transport.js");
    const { synthesisCheckContract } = await import("../../apps/api/src/synthesis-check/policy.js");
    const packet = buildFramedPrompt({ contract: synthesisCheckContract(), material: [{ name: "synthesis", content: "A debate conclusion" }] }).packet;
    const target = { providerRef: "anthropic", model: "claude-haiku-5-5", baseUrl: "https://example.invalid/v1", authorizationHeader: "Bearer fake" };
    const signal = new AbortController().signal;
    expect(synthesisCheckFailureCode(new TypedDomainError("PROMPT_FRAME_ABSENT", "fake"), signal)).toBe("DOOR_REFUSED");
    expect(synthesisCheckFailureCode(new Error("private detail"), signal, 503)).toBe("HTTP_STATUS");
    expect(synthesisCheckFailureCode(new TypedDomainError("SUPPORT_MODEL_LENGTH_EXCEEDED", "fake"), signal)).toBe("ANSWER_NOT_JSON");
    expect(synthesisCheckFailureCode(new Error("private detail"), signal)).toBe("TRANSPORT_FAILED");
    const controller = new AbortController();
    controller.abort();
    expect(synthesisCheckFailureCode(new Error("aborted"), controller.signal)).toBe("DEADLINE");
    let fetchCalls = 0;
    let requestedBody = "";
    const port = createSynthesisCheckTransport(target, {
      readAuthorizationHeader: () => "Bearer fake", deadlineMs: 1500,
      fetchImplementation: async (_url, init) => {
        fetchCalls++;
        requestedBody = String(init?.body ?? "");
        return new Response("failure", { status: 503 });
      }
    });
    const result = await port.complete({ packet, signal }).catch(error => error);
    expect(fetchCalls).toBe(1);
    expect(JSON.parse(requestedBody)).toMatchObject({ model: "claude-haiku-5-5" });
    expect(result).toMatchObject({ code: "HTTP_STATUS" });
  });

  it("an answer is taken only when it is one JSON object with exactly call and the four category keys, this call's value, and values 0 or 1", async () => {
    // Property: malformed, replayed and oversized model replies cannot become verdicts.
    const { parseSynthesisCheckAnswer } = await import("../../apps/api/src/synthesis-check/verdict.js");
    const call = "a".repeat(32);
    const valid = `{"call":"${call}","TERRORISM":0,"HATE_SPEECH":0,"SUICIDE_OR_HARM_TO_OTHERS":0,"WEAPONS_OR_DRUGS":0}`;
    expect(parseSynthesisCheckAnswer(valid, call)).toEqual({ ok: true, verdict: "CLEAR", categories: [] });
    expect(parseSynthesisCheckAnswer(`\`\`\`json\n${valid}\n\`\`\``, call)).toEqual({ ok: true, verdict: "CLEAR", categories: [] });
    const bad = [
      ["not json", "ANSWER_NOT_JSON"],
      ["[]", "ANSWER_SCHEMA"],
      [valid.replace('"TERRORISM":0', '"TERRORISM":1,"TERRORISM":0'), "ANSWER_SCHEMA"],
      [valid.replace(call, "b".repeat(32)), "ANSWER_SCHEMA"],
      [valid.replace('"TERRORISM":0', '"TERRORISM":2'), "ANSWER_SCHEMA"],
      [valid.replace('"TERRORISM":0', '"TERRORISM":true'), "ANSWER_SCHEMA"],
      [valid.replace(',"WEAPONS_OR_DRUGS":0', ""), "ANSWER_SCHEMA"],
      [valid.replace('"WEAPONS_OR_DRUGS":0', '"WEAPONS_OR_DRUGS":0,"OTHER":0'), "ANSWER_SCHEMA"],
      ["x".repeat(193), "ANSWER_SCHEMA"],
      ["\`\`\`json\n{}\n\`\`\` trailing", "ANSWER_NOT_JSON"]
    ] as const;
    for (const [answer, code] of bad) expect(parseSynthesisCheckAnswer(answer, call)).toEqual({ ok: false, code });
  });

  it("every verdict and category set renders the answer form to the same byte length and the same key order", async () => {
    // Property: the fixed form carries no length channel for the category set.
    const { parseSynthesisCheckAnswer } = await import("../../apps/api/src/synthesis-check/verdict.js");
    const { synthesisCheckContract } = await import("../../apps/api/src/synthesis-check/policy.js");
    const call = "a".repeat(32);
    expect(synthesisCheckContract().answerForm).toContain('"call":"<the 32 hexadecimal characters inside this call\'s boundary marker, copied exactly>","TERRORISM":0,"HATE_SPEECH":0,"SUICIDE_OR_HARM_TO_OTHERS":0,"WEAPONS_OR_DRUGS":0');
    for (let bits = 0; bits < 16; bits++) {
      const answer = `{"call":"${call}","TERRORISM":${bits & 1},"HATE_SPEECH":${(bits >> 1) & 1},"SUICIDE_OR_HARM_TO_OTHERS":${(bits >> 2) & 1},"WEAPONS_OR_DRUGS":${(bits >> 3) & 1}}`;
      expect(Buffer.byteLength(answer)).toBe(124);
      const result = parseSynthesisCheckAnswer(answer, call);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.verdict).toBe(bits === 0 ? "CLEAR" : "FLAGGED");
    }
  });

  it("the packet's material is exactly one field synthesis holding the synthesis text byte for byte, and names no question, pseudonym, run or answer id", async () => {
    // Property: only the provided synthesis crosses the model boundary.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ synthesisText: "Line one\n\nLine two  " });
    await runSynthesisCheck(f.deps, f.input);
    expect(readPromptFrame(f.packets[0]!).fields).toEqual([{ name: "synthesis", content: "Line one\n\nLine two  " }]);
  });

  it("the packet passes the door and carries a per-call 32-hex value", async () => {
    // Property: every call has a valid one-time frame value.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture();
    await runSynthesisCheck(f.deps, f.input);
    expect(judgeCallValue(readPromptFrame(f.packets[0]!).fence)).toMatch(/^[0-9a-f]{32}$/u);
  });

  it("no synthesis text: NO_SYNTHESIS with no model call", async () => {
    // Property: no model reads a missing synthesis.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ synthesisText: null });
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "NO_SYNTHESIS", categories: [] });
    expect(result.callCount).toBe(0);
    expect(f.calls()).toBe(0);
  });

  it("no target, or the off-flag present: UNAVAILABLE NOT_CONFIGURED with no model call", async () => {
    // Property: a disabled target does not reach the transport.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ portOff: true });
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "NOT_CONFIGURED" });
    expect(f.calls()).toBe(0);
  });

  it("a check that has not answered at D records UNAVAILABLE DEADLINE within D + 1 s", async () => {
    // Property: a non-cooperating port cannot hold the check beyond D.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ complete: async () => new Promise(() => {}) });
    const started = Date.now();
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "DEADLINE" });
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it("a check whose deadlineAt is nearer than D stops at deadlineAt: deadlineAt = now + 500 ms with D = 1 500 ms records UNAVAILABLE DEADLINE within 1 500 ms of the call", async () => {
    // Property: earlier work consumes the attempt's shared deadline.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ complete: async () => new Promise(() => {}), deadlineAt: new Date(Date.now() + 500) });
    const started = Date.now();
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "DEADLINE" });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("a packet sent to a timed-out model records one estimated site spend entry", async () => {
    // Property: the ledger charges a sent request even when the provider's reply is unavailable.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ complete: async () => new Promise(() => {}), deadlineMs: 100,
      deadlineAt: new Date(Date.now() + 100) });
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "DEADLINE" });
    expect(f.packets).toHaveLength(1);
    expect(f.records).toHaveLength(1);
    expect(f.records[0]).toMatchObject({ spendSource: "SYNTHESIS_CHECK", runId: "run-1",
      providerRef: "anthropic", outputTokens: 192 });
    expect(Number(f.records[0]?.inputTokens)).toBeGreaterThan(0);
  });

  it("records estimated spend for billed malformed replies but not an HTTP rejection", async () => {
    // Property: a sent, billable call consumes the site pot even when its reply cannot be used.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const { SynthesisCheckFailure } = await import("../../apps/api/src/synthesis-check/transport.js");
    for (const [code, responded, expectedRows] of [
      ["ANSWER_NOT_JSON", true, 1], ["TRANSPORT_FAILED", true, 1], ["HTTP_STATUS", true, 0]
    ] as const) {
      const f = checkFixture({ complete: async () => { throw new SynthesisCheckFailure(code, responded); } });
      const result = await runSynthesisCheck(f.deps, f.input);
      expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: code });
      expect(f.calls()).toBe(1);
      expect(f.records, code).toHaveLength(expectedRows);
    }
  });

  it("records no spend for a transport failure that never got a response (REV-S01-p3 security N2, t_79c1879c)", async () => {
    // Property: a refused connection, a missing credential or an adapter error before the request reaches the
    // provider costs nothing, so it writes no ledger row and does not fill the day pot.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const { SynthesisCheckFailure } = await import("../../apps/api/src/synthesis-check/transport.js");
    const f = checkFixture({ complete: async () => { throw new SynthesisCheckFailure("TRANSPORT_FAILED", false); } });
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "TRANSPORT_FAILED" });
    expect(f.calls()).toBe(1);
    expect(f.records).toHaveLength(0);
  });

  it("the transport says whether a response arrived: none for a refused connection, one for a rejected 2xx body", async () => {
    const { createSynthesisCheckTransport, SynthesisCheckFailure } = await import("../../apps/api/src/synthesis-check/transport.js");
    const { synthesisCheckContract } = await import("../../apps/api/src/synthesis-check/policy.js");
    const packet = buildFramedPrompt({ contract: synthesisCheckContract(), material: [{ name: "synthesis", content: "A debate conclusion" }] }).packet;
    const target = { providerRef: "anthropic", model: "claude-haiku-5-5", baseUrl: "https://example.invalid/v1", authorizationHeader: "Bearer fake" };
    const failure = async (fetchImplementation: typeof fetch): Promise<unknown> => {
      const port = createSynthesisCheckTransport(target, { readAuthorizationHeader: () => "Bearer fake", deadlineMs: 1500, fetchImplementation });
      return port.complete({ packet, signal: new AbortController().signal }).then(() => null, (error: unknown) => error);
    };
    const refused = await failure(async () => { throw new TypeError("fetch failed"); });
    expect(refused).toBeInstanceOf(SynthesisCheckFailure);
    expect(refused).toMatchObject({ code: "TRANSPORT_FAILED", responded: false });
    const garbled = await failure(async () => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));
    expect(garbled).toBeInstanceOf(SynthesisCheckFailure);
    expect(garbled).toMatchObject({ responded: true });
  });

  it("a day pot at or over its ceiling records UNAVAILABLE MONEY_REFUSED with no model call", async () => {
    // Property: the reviewed site budget refuses a new call at its boundary.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ dayPot: { ceilingMicros: 100, spentMicros: () => 100 } });
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "MONEY_REFUSED" });
    expect(f.calls()).toBe(0);
  });

  it("a FLAGGED check writes log lines that hold the answer id, version and a code only", async () => {
    // Property: logs cannot disclose a verdict or category beside the answer id.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ flags: [1, 1, 1, 1] });
    await runSynthesisCheck(f.deps, f.input);
    expect(f.lines.length).toBeGreaterThan(0);
    for (const line of f.lines) {
      expect(Object.keys(line).sort()).toEqual(["answer_id", "answer_version", "code", "event"]);
      expect(JSON.stringify(line)).not.toMatch(/FLAGGED|CLEAR|TERRORISM|HATE_SPEECH|SUICIDE_OR_HARM_TO_OTHERS|WEAPONS_OR_DRUGS/u);
    }
  });

  it("every failure code the check can record is in the closed list and matches ^[A-Z][A-Z0-9_]{0,95}$", async () => {
    // Property: all recorded failure codes are bounded engine codes.
    const { SYNTHESIS_CHECK_FAILURE_CODES } = await import("../../packages/contract/src/synthesis-check.js");
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const { SynthesisCheckFailure } = await import("../../apps/api/src/synthesis-check/transport.js");
    expect(SYNTHESIS_CHECK_FAILURE_CODES).toEqual(["NOT_CONFIGURED", "DOOR_REFUSED", "TRANSPORT_FAILED", "HTTP_STATUS", "DEADLINE", "ANSWER_NOT_JSON", "ANSWER_SCHEMA", "MONEY_REFUSED", "UNEXPECTED"]);
    for (const code of SYNTHESIS_CHECK_FAILURE_CODES) expect(code).toMatch(/^[A-Z][A-Z0-9_]{0,95}$/u);
    const f = checkFixture({ complete: async () => { throw new SynthesisCheckFailure("HTTP_STATUS"); } });
    const outcome = (await runSynthesisCheck(f.deps, f.input)).outcome;
    expect(outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "HTTP_STATUS" });
    if (outcome.verdict === "UNAVAILABLE") expect(SYNTHESIS_CHECK_FAILURE_CODES).toContain(outcome.failureCode);
  });

  it("one spend entry per call that returned a reply: source SYNTHESIS_CHECK, the run named, and the reviewed row's prices", async () => {
    // Property: a parsed reply charges the fixed recorded output and ignores provider money.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture();
    await runSynthesisCheck(f.deps, f.input);
    expect(f.records).toEqual([{ spendSource: "SYNTHESIS_CHECK", runId: "run-1", providerRef: "anthropic", chargedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u), inputTokens: 900, outputTokens: 192, chargeMicros: 186 }]);
  });

  it("the spend entries of a CLEAR check and of a FLAGGED check with all four categories are equal, and cost_usd is never read", async () => {
    // Property: spend metadata cannot reveal the category set.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const clear = checkFixture();
    const flagged = checkFixture({ flags: [1, 1, 1, 1], usage: { input_tokens: 900, output_tokens: 80, cost_usd: 99 } });
    await runSynthesisCheck(clear.deps, clear.input);
    await runSynthesisCheck(flagged.deps, flagged.input);
    expect(flagged.records).toEqual(clear.records);
  });

  it("a target whose model has no reviewed price records UNAVAILABLE NOT_CONFIGURED with no model call", async () => {
    // Property: an unpriced model cannot spend from the site's pot.
    const { runSynthesisCheck } = await import("../../apps/api/src/synthesis-check/check.js");
    const f = checkFixture({ price: null });
    const result = await runSynthesisCheck(f.deps, f.input);
    expect(result.outcome).toEqual({ verdict: "UNAVAILABLE", categories: [], failureCode: "NOT_CONFIGURED" });
    expect(f.calls()).toBe(0);
  });

  it("the judge's switch and flag path behave as before: createPublicationJudgeSwitch delegates with the stem publication-judge", () => {
    // Property: extraction keeps the judge's existing filename and null-flag switch behavior.
    const extracted = judgeTransport as typeof judgeTransport & {
      localOffFlagPath: (port: number, stem: string, directory?: string) => string;
      createLocalOffFlagSwitch: <P>(port: P | null, options: { offFlagPath: string | null }) => {
        current(): P | null; switchOff(): boolean;
      };
    };
    expect(judgeTransport.publicationJudgeOffFlagPath(4321, tmpdir()))
      .toMatch(/debateai-publication-judge-4321\.off$/u);
    expect(extracted.localOffFlagPath(4321, "synthesis-check", tmpdir()))
      .toMatch(/debateai-synthesis-check-4321\.off$/u);
    const port = { providerRef: "anthropic", modelId: "claude-haiku-5-5", complete: async () => ({ text: "" }) };
    const switcher = extracted.createLocalOffFlagSwitch(port, { offFlagPath: null });
    expect(switcher.current()).toBe(port);
    expect(switcher.switchOff()).toBe(true);
    expect(switcher.current()).toBe(port);
  });
});
