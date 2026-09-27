import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway,
  PROVIDER_CONTEXT_WINDOW_EXCEEDED,
  ProviderCallFailedError,
  type CallPromptRecordInput,
  type OpenAICompatibleGatewayOptions,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

// Model scorecard §2.1–§2.3: every attempt's ledger row carries the debate
// role, the scorecard candidate, the scorecard version and the level it ran at;
// its artifact carries the thinking tokens; and its exact prompt is handed to
// the composition BEFORE the attempt is sent, under the attempt's own id.

const MODEL = "fixture/model";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PACKET = framedFixturePacket("records");
const RELAY = { thinking: { parameter: "x_thinking_level" as const, levels: ["low", "high"] } };

function recordingGateway(
  respond: (attempt: number) => Response,
  extra: Pick<OpenAICompatibleGatewayOptions, "thinking" | "contextWindowTokens" | "persistCallPrompt"> = {}
) {
  const events: string[] = [];
  const bodies: string[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const artifacts: RawArtifactInput[] = [];
  const prompts: CallPromptRecordInput[] = [];
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: MODEL, maker: "fixture",
    fetchImplementation: async (_url, init) => {
      bodies.push(String(init?.body));
      events.push(`fetch:${bodies.length}`);
      return respond(bodies.length);
    },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => { artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { ledger.push(entry); return `ledger:${ledger.length}`; },
    persistCallPrompt: async (prompt) => { prompts.push(prompt); events.push(`prompt:${prompt.attemptId}`); },
    assertNoOpenWriteTransaction: () => undefined,
    ...extra
  });
  return { gateway, events, bodies, ledger, artifacts, prompts };
}

function completion(content: string, extra: Readonly<Record<string, unknown>> = {}): Response {
  return new Response(JSON.stringify({
    id: "call", model: MODEL, choices: [{ message: { content }, finish_reason: "stop" }], ...extra
  }));
}

function request(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    runId: RUN_ID, subjectItemId: "node:records", callSiteKey: "JUDGE:cross-root:0->1",
    role: "JUDGE" as const, lane: "served" as const,
    bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 5_000 },
    contractHash: "contract:records", providerRef: "provider:records", packet: PACKET,
    modelRole: "CROSS_EXCHANGE" as const, candidateId: "openai/gpt-5.6-sol@high", scorecardVersion: 3,
    ...extra
  };
}

const facts = (entry: ProviderLedgerInput) => ({
  outcome: entry.outcome, modelRole: entry.modelRole, candidateId: entry.candidateId,
  scorecardVersion: entry.scorecardVersion, thinkingLevel: entry.thinkingLevel
});

describe("model scorecard — the call facts on every ledger row", () => {
  it("writes role, candidate, version and the level on a rejected and an accepted attempt alike", async () => {
    const { gateway, ledger } = recordingGateway((attempt) => completion(attempt === 1 ? "rejected" : "accepted"));
    await gateway.call(request({
      classifyContent: (content: string) => content === "accepted"
        ? { parseStatus: "PARSED" as const, parseError: null }
        : { parseStatus: "SCHEMA_FAILED" as const, parseError: "fixture" }
    }));
    const expected = { modelRole: "CROSS_EXCHANGE", candidateId: "openai/gpt-5.6-sol@high", scorecardVersion: 3, thinkingLevel: "DEFAULT_ONLY" };
    expect(ledger.map(facts)).toEqual([{ outcome: "FAILED", ...expected }, { outcome: "OK", ...expected }]);
  });

  it("a transport failure's rows carry the facts and the level that was sent", async () => {
    const { gateway, ledger } = recordingGateway(() => new Response("upstream down", { status: 502 }), RELAY);
    const failure = await gateway.call(request({ thinkingLevel: "high" })).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderCallFailedError);
    expect(ledger.map(facts)).toEqual([1, 2].map(() => ({
      outcome: "FAILED", modelRole: "CROSS_EXCHANGE", candidateId: "openai/gpt-5.6-sol@high",
      scorecardVersion: 3, thinkingLevel: "high"
    })));
  });

  it("a caller that names no facts writes NULLs, and the level it ran at", async () => {
    const { gateway, ledger } = recordingGateway(() => completion("ok"));
    await gateway.call(request({ modelRole: undefined, candidateId: undefined, scorecardVersion: undefined }));
    expect(ledger.map(facts)).toEqual([{
      outcome: "OK", modelRole: null, candidateId: null, scorecardVersion: null, thinkingLevel: "DEFAULT_ONLY"
    }]);
  });

  it("refuses a malformed call record before anything is sent", async () => {
    for (const invalid of [
      { candidateId: "two words" },
      { scorecardVersion: 0 },
      { scorecardVersion: 1.5 },
      { modelRole: "COMPOSER" }
    ]) {
      const { gateway, bodies, ledger, prompts } = recordingGateway(() => completion("ok"));
      await expect(gateway.call(request(invalid))).rejects.toThrowError(new TypeError("PROVIDER_CALL_RECORD_INVALID"));
      expect({ bodies, ledger, prompts }).toEqual({ bodies: [], ledger: [], prompts: [] });
    }
  });

  it("checks the candidate id against 0072's CHECK text, character for character", async () => {
    // The 0072 fix round made the column the scorecard's identifierText (the first
    // character a letter or a digit). The gateway refuses exactly what the ledger
    // would, before the call is paid for, not after.
    const migration = await readFile(new URL("../../migrations/0072_model_scorecard.sql", import.meta.url), "utf8");
    const providers = await readFile(new URL("../../packages/providers/src/index.ts", import.meta.url), "utf8");
    const token = /const CANDIDATE_ID_TOKEN = \/(.+?)\/u;/u.exec(providers)?.[1];
    expect(token, "CANDIDATE_ID_TOKEN is declared").toBeDefined();
    expect(migration).toContain(`CHECK (candidate_id IS NULL OR candidate_id ~ '${token!}')`);
    for (const candidateId of ["-leading", "@leading", `a${"x".repeat(128)}`]) {
      const { gateway, bodies, ledger, prompts } = recordingGateway(() => completion("ok"));
      await expect(gateway.call(request({ candidateId }))).rejects.toThrowError(new TypeError("PROVIDER_CALL_RECORD_INVALID"));
      expect({ bodies, ledger, prompts }).toEqual({ bodies: [], ledger: [], prompts: [] });
    }
  });
});

describe("model scorecard — thinking tokens on the artifact", () => {
  it("records the vendor's thinking tokens, and null when it reports none", async () => {
    const { gateway, artifacts } = recordingGateway((attempt) => completion(
      attempt === 1 ? "rejected" : "accepted",
      attempt === 1
        ? { usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, completion_tokens_details: { reasoning_tokens: 11 } } }
        : {}
    ));
    await gateway.call(request({
      classifyContent: (content: string) => content === "accepted"
        ? { parseStatus: "PARSED" as const, parseError: null }
        : { parseStatus: "SCHEMA_FAILED" as const, parseError: "fixture" }
    }));
    expect(artifacts.map((artifact) => artifact.thinkingTokens)).toEqual([11, null]);
  });
});

describe("model scorecard — the prompt record", () => {
  it("hands over the exact prompt of every attempt BEFORE it is sent, under that attempt's id", async () => {
    const { gateway, events, bodies, ledger, prompts } = recordingGateway(
      (attempt) => completion(attempt === 1 ? "rejected" : "accepted")
    );
    await gateway.call(request({
      classifyContent: (content: string) => content === "accepted"
        ? { parseStatus: "PARSED" as const, parseError: null }
        : { parseStatus: "SCHEMA_FAILED" as const, parseError: "fixture" }
    }));
    expect(prompts.map((prompt) => prompt.attemptId)).toEqual(ledger.map((entry) => entry.attemptId));
    expect(events).toEqual([
      `prompt:${ledger[0]!.attemptId}`, "fetch:1",
      `prompt:${ledger[1]!.attemptId}`, "fetch:2"
    ]);
    for (const [index, prompt] of prompts.entries()) {
      expect(prompt.runId).toBe(RUN_ID);
      expect(prompt.messages).toEqual(PACKET.messages);
      expect(prompt.promptText).toBe(JSON.stringify(PACKET.messages));
      // Exactly the bytes of the `messages` member on the wire.
      expect(bodies[index]).toContain(`"messages":${prompt.promptText}`);
    }
  });

  it("records no prompt for a call with no run, and none for an attempt that is never sent", async () => {
    const noRun = recordingGateway(() => completion("ok"));
    await noRun.gateway.call(request({ runId: null }));
    expect(noRun.prompts).toEqual([]);

    const walled = recordingGateway(() => completion("ok"), { contextWindowTokens: 1 });
    await expect(walled.gateway.call(request())).rejects.toMatchObject({ code: PROVIDER_CONTEXT_WINDOW_EXCEEDED });
    expect(walled.prompts).toEqual([]);
    expect(walled.bodies).toEqual([]);
  });

  it("stops unsent when the prompt cannot be recorded: no ledger row, no retry, the write error unwrapped (F13)", async () => {
    // Nothing reached a vendor, so this is not a transport failure: it must never
    // become PROVIDER_CALL_FAILED, which a seat would read as a reason to switch.
    const refusal = new Error("call_prompt write refused");
    const { gateway, bodies, ledger } = recordingGateway(() => completion("ok"), {
      persistCallPrompt: async () => { throw refusal; }
    });
    const failure = await gateway.call(request()).catch((error: unknown) => error);
    expect(failure).toBe(refusal);
    expect(failure).not.toBeInstanceOf(ProviderCallFailedError);
    expect(bodies).toEqual([]);
    expect(ledger).toEqual([]);
  });

  it("the runner's gateway factory writes each prompt through the carrier with the scorecard's fingerprint", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const start = source.indexOf("export function createPostgresProviderGateway");
    expect(start, "createPostgresProviderGateway is declared").toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 1);
    const body = source.slice(start, next === -1 ? source.length : next);
    expect(body).toContain('"persistRawArtifact" | "appendLedgerEntry" | "assertNoOpenWriteTransaction" | "persistCallPrompt"');
    expect(body).toContain("persistCallPrompt: (prompt) => insertCallPrompt(pool, {");
    expect(body).toContain("promptFingerprint: canonicalPromptFingerprint(prompt.messages)");
    expect(body.split("persistCallPrompt: (prompt) =>")).toHaveLength(2);
  });
});
