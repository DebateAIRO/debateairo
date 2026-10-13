/**
 * Spec 2026-10-12 §4.4 (the owner's `slip_fix`), the gateway half: `ProviderCallRequest.repairThinkingLevel` is the
 * level of a call's REPAIR POSTs (the patch follow-up and the full re-ask). It is resolved before anything is sent, like
 * `thinkingLevel`, so a level the connection did not declare is refused with nothing sent or ledgered. The first POST
 * and its length retries run at `thinkingLevel`; absent, every POST runs at `thinkingLevel`, today's behaviour.
 */
import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProviderGateway, buildFramedPrompt, buildFramedRepairPrompt, schemaFailureLocator,
  type ProviderCallRequest, type ProviderLedgerInput
} from "@debateai/providers";

const MODEL = "synthetic/model";
const ENDPOINT = "https://relay.example/v1";
const PARSED = { parseStatus: "PARSED", parseError: null } as const;

type Reply = { content: string; finish?: string; echo?: string };
function harness(script: Reply[], parameter: "reasoning_effort" | "x_thinking_level" = "reasoning_effort") {
  const sent: Record<string, unknown>[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const fetchImplementation = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    sent.push(body);
    const reply = script.shift() ?? { content: "ok" };
    return new Response(JSON.stringify({ id: `fixture-${sent.length}`, model: MODEL,
      choices: [{ message: { content: reply.content }, finish_reason: reply.finish ?? "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      ...(reply.echo === undefined ? {} : { x_thinking_level: reply.echo }) }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new OpenAICompatibleProviderGateway({ endpoint: ENDPOINT, model: MODEL, maker: "Synthetic",
    thinking: { parameter, levels: ["high", "low"] }, fetchImplementation,
    persistRawArtifact: async artifact => artifact.artifactId,
    appendLedgerEntry: async entry => { ledger.push(entry); return entry.attemptId; },
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
  return { gateway, sent, ledger };
}
/** A served call whose check accepts only the reply "good", with its full re-ask packet. */
function request(change: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId: "fixture.repair-level.v1", instruction: "Answer the synthetic question.", answerForm: "Return one word." },
    material: [{ name: "question_line", content: "Synthetic question; no personal data." }]
  });
  return { runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "PANEL:root", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 512, deadlineMs: 5_000 }, contractHash: "contract:synthetic", providerRef: "relay:synthetic",
    packet: framed.packet,
    classifyContent: content => content !== "good" ? { parseStatus: "PARSE_FAILED", parseError: "synthetic" } : PARSED,
    buildRepairPacket: rejected => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
    thinkingLevel: "high", maxAttemptsThisCall: 2, retryOnlyAfterContentRejection: true, ...change };
}

describe("a call's repair POSTs run at repairThinkingLevel", () => {
  it("the first POST at thinkingLevel, the full re-ask at repairThinkingLevel; the ledger records each", async () => {
    const { gateway, sent, ledger } = harness([{ content: "bad" }, { content: "good" }]);
    const result = await gateway.call(request({ repairThinkingLevel: "low" }));
    expect(result.repairForm).toBe("FULL");
    expect(sent.map(body => body.reasoning_effort)).toEqual(["high", "low"]);
    expect(ledger.map(entry => entry.thinkingLevel)).toEqual(["high", "low"]);
  });

  it("without repairThinkingLevel every POST runs at thinkingLevel (today)", async () => {
    const { gateway, sent, ledger } = harness([{ content: "bad" }, { content: "good" }]);
    await gateway.call(request());
    expect(sent.map(body => body.reasoning_effort)).toEqual(["high", "high"]);
    expect(ledger.map(entry => entry.thinkingLevel)).toEqual(["high", "high"]);
  });

  it("a level the connection did not declare is refused before any fetch, and nothing is ledgered", async () => {
    const { gateway, sent, ledger } = harness([{ content: "bad" }, { content: "good" }]);
    await expect(gateway.call(request({ repairThinkingLevel: "max" }))).rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(sent).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it("DEFAULT_ONLY as the repair level sends no effort member on the repair", async () => {
    const { gateway, sent } = harness([{ content: "bad" }, { content: "good" }]);
    await gateway.call(request({ repairThinkingLevel: "DEFAULT_ONLY" }));
    expect(sent[0]).toHaveProperty("reasoning_effort", "high");
    expect(sent[1]).not.toHaveProperty("reasoning_effort");
  });

  it("a length retry re-sends the original packet at thinkingLevel; a repair after it at repairThinkingLevel", async () => {
    const { gateway, sent } = harness([{ content: "cut", finish: "length" }, { content: "bad" }, { content: "good" }]);
    await gateway.call(request({ repairThinkingLevel: "low", maxAttemptsThisCall: 3 }));
    expect(sent.map(body => body.reasoning_effort)).toEqual(["high", "high", "low"]);
  });

  it("on a relay the repair's echo is checked against the repair's own level", async () => {
    const ok = harness([{ content: "bad", echo: "high" }, { content: "good", echo: "low" }], "x_thinking_level");
    await ok.gateway.call(request({ repairThinkingLevel: "low" }));
    expect(ok.sent.map(body => body.x_thinking_level)).toEqual(["high", "low"]);
    const changed = harness([{ content: "bad", echo: "high" }, { content: "good", echo: "high" }], "x_thinking_level");
    await expect(changed.gateway.call(request({ repairThinkingLevel: "low" }))).rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_CHANGED" });
    expect(changed.ledger.map(entry => entry.outcome)).toEqual(["FAILED", "FAILED"]);
  });
});
