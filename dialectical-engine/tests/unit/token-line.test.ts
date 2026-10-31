// tests/unit/token-line.test.ts
// R22 decision 28: Haiku's calls stay under 100,000 tokens, and bytes are only an estimate. Close to the line, Anthropic's free count is
// asked first; one over the line goes down the existing ladder; small calls have no extra step; a failed count stops nothing. A scripted
// count only: no real call is ever made, and what the real endpoint answers is seen only on a real run.
import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_TOKEN_COUNT, OpenAICompatibleProviderGateway, PROVIDER_SENT_INPUT_OVER_LIMIT, buildFramedPrompt, createAnthropicTokenCounter,
  createPreviewGuardedFetch, estimateWindowTokens, type OpenAICompatibleGatewayOptions, type PromptPacket, type ProviderCallRequest, type TokenCounter
} from "@debateai/providers";
import { REPORT_STORY_PROMPT_CONTRACT } from "@debateai/story";
import { buildInvestigationDossier, type Dossier, type DossierDig } from "../../apps/runner/src/investigation-dossier.js";
import type { PathRewriteMaterialInput } from "../../apps/runner/src/path-rewrite-material.js";
import { fitDossierToTokenLine, fitRewriteToTokenLine } from "../../apps/runner/src/token-line.js";
import { PATH_YES, ROOT, investigationInput, readyDig } from "../support/investigation-close-world.js";

const packet: PromptPacket = buildFramedPrompt({ contract: { contractId: "t.v1", instruction: "Answer.", answerForm: "Return JSON." },
  material: [{ name: "one", content: "first" }, { name: "two", content: "second" }] }).packet;

describe("the count itself", () => {
  const scripted = (reply: () => Response | Promise<Response>, logged: unknown[] = []) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const count = createAnthropicTokenCounter({ endpoint: ANTHROPIC_MESSAGES_BASE_URL, model: "claude-haiku-5-5", authorizationHeader: "bare-key-for-tests",
      fetchImplementation: async (url, init) => { calls.push({ url: String(url), init: init! }); return reply(); }, log: (event, detail) => { logged.push([event, detail]); } });
    return { count, calls, logged };
  };

  it("asks Anthropic's free endpoint with the call's own key, messages and system, and reads the number", async () => {
    const { count, calls } = scripted(() => new Response(JSON.stringify({ input_tokens: 12_345 })));
    expect(await count({ packet })).toBe(12_345);
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages/count_tokens");
    expect(new Headers(calls[0]!.init.headers).get("x-api-key")).toBe("bare-key-for-tests");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["messages", "model", "system"]);
    expect(body.model).toBe("claude-haiku-5-5");
  });

  it("counts the dossier-first form when the call would be sent in it", async () => {
    const { count, calls } = scripted(() => new Response(JSON.stringify({ input_tokens: 1 })));
    await count({ packet, sharedFirstFieldCount: 1 });
    const body = JSON.parse(String(calls[0]!.init.body)) as { system: string; messages: Array<{ content: Array<{ text: string }> }> };
    expect(body.messages[0]!.content[0]!.text).toContain("first");
    expect(body.messages[0]!.content[0]!.text).not.toContain("second");
  });

  it.each([
    ["a refusal", () => new Response("no", { status: 429 }), "HTTP_429"],
    ["a reply with no number", () => new Response(JSON.stringify({ input_tokens: "many" })), "NO_NUMBER"],
    ["no connection", () => { throw new TypeError("fetch failed"); }, "TypeError"]
  ])("a failed count (%s) is no count, and is logged by code only", async (_name, reply, reason) => {
    const { count, logged } = scripted(reply as () => Response);
    expect(await count({ packet })).toBeNull();
    expect(logged).toEqual([["ANTHROPIC_TOKEN_COUNT_FAILED", { reason }]]);
  });

  it("speaks only to Anthropic's own address", () => {
    expect(() => createAnthropicTokenCounter({ endpoint: "https://example.org/v1", model: "m" })).toThrow("PROVIDER_ADAPTER_HOST_MISMATCH");
  });
});

describe("through the preview's gate: the same fetch, its own free route", () => {
  const body = JSON.stringify({ model: "claude-haiku-5-5", messages: [{ role: "user", content: "x" }], system: "y" });
  const URL_COUNT = "https://api.anthropic.com/v1/messages/count_tokens";

  it("goes to the Anthropic gate's count, reserving nothing", async () => {
    const seen: string[] = [];
    const executed: unknown[] = [];
    const fetcher = createPreviewGuardedFetch({ anthropic: { execute: async (input) => { executed.push(input); return { status: 200, body: "{}" }; },
      count: async (requestBody) => { seen.push(requestBody); return 77; } } });
    const reply = await fetcher(URL_COUNT, { method: "POST", body });
    expect(await reply.json()).toEqual({ input_tokens: 77 });
    expect(seen).toEqual([body]);
    expect(executed).toEqual([]);
  });

  it("refuses a body a call could not send, a key header, and a gate with no count: the caller's count is then null", async () => {
    const fetcher = createPreviewGuardedFetch({ anthropic: { execute: async () => ({ status: 200, body: "{}" }), count: async () => 1 } });
    await expect(fetcher(URL_COUNT, { method: "POST", body: JSON.stringify({ model: "claude-haiku-5-5", messages: [{ role: "user", content: "x" }], max_tokens: 1 }) })).rejects.toThrow();
    await expect(fetcher(URL_COUNT, { method: "POST", body, headers: { "x-api-key": "k" } })).rejects.toThrow();
    await expect(fetcher(URL_COUNT, { method: "POST", body: JSON.stringify({ model: "zai-org/GLM-5.3-Flash", messages: [{ role: "user", content: "x" }] }) })).rejects.toThrow();
    const older = createPreviewGuardedFetch({ anthropic: { execute: async () => ({ status: 200, body: "{}" }) } });
    await expect(older(URL_COUNT, { method: "POST", body })).rejects.toThrow();
    const count = createAnthropicTokenCounter({ endpoint: ANTHROPIC_MESSAGES_BASE_URL, model: "claude-haiku-5-5", fetchImplementation: older });
    expect(await count({ packet })).toBeNull();
  });
});

describe("the gateway, on every attempt as it leaves", () => {
  const big = (bytes: number): PromptPacket => buildFramedPrompt({ contract: { contractId: "t.v1", instruction: "Answer.", answerForm: "Return JSON." },
    material: [{ name: "one", content: "a".repeat(bytes) }] }).packet;
  const harness = (countInputTokens: TokenCounter) => {
    const bodies: string[] = [];
    const options: OpenAICompatibleGatewayOptions = { endpoint: "http://fixture/v1", model: "fixture/model", maker: "fixture", countInputTokens,
      fetchImplementation: async (_url, init) => {
        bodies.push(String(init?.body));
        return new Response(JSON.stringify({ id: "c", model: "fixture/model", choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      },
      sleepImplementation: async () => undefined, persistRawArtifact: async (artifact) => artifact.artifactId, appendLedgerEntry: async () => "ledger", assertNoOpenWriteTransaction: () => undefined } as OpenAICompatibleGatewayOptions;
    return { gateway: new OpenAICompatibleProviderGateway(options), bodies };
  };
  const request = (packetIn: PromptPacket): ProviderCallRequest => ({ runId: null, subjectItemId: "s", callSiteKey: "x", role: "SYNTHESIZER", lane: "story", contractHash: "h", providerRef: "ref",
    bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }, packet: packetIn, sentInputTokensBelow: 100_000 }) as ProviderCallRequest;
  const small = big(1_000);
  const close = big(130_000);

  it("the sizes under test sit where they should", () => {
    expect(estimateWindowTokens(small.messages)).toBeLessThan(ANTHROPIC_TOKEN_COUNT.fromEstimate);
    expect(estimateWindowTokens(close.messages)).toBeGreaterThanOrEqual(ANTHROPIC_TOKEN_COUNT.fromEstimate);
    expect(estimateWindowTokens(close.messages)).toBeLessThan(100_000);
  });

  it("a small call has no extra step", async () => {
    let counted = 0;
    const { gateway, bodies } = harness(async () => { counted += 1; return 1; });
    await gateway.call(request(small));
    expect(counted).toBe(0);
    expect(bodies).toHaveLength(1);
  });

  it("close to the line and under: it goes", async () => {
    const { gateway, bodies } = harness(async () => 99_999);
    await gateway.call(request(close));
    expect(bodies).toHaveLength(1);
  });

  it("close to the line and over by the real count: refused, nothing sent", async () => {
    const { gateway, bodies } = harness(async () => 100_000);
    await expect(gateway.call(request(close))).rejects.toMatchObject({ code: PROVIDER_SENT_INPUT_OVER_LIMIT });
    expect(bodies).toEqual([]);
  });

  it("a failed count stops nothing", async () => {
    const { gateway, bodies } = harness(async () => null);
    await gateway.call(request(close));
    expect(bodies).toHaveLength(1);
  });
});

describe("where the material is fitted", () => {
  const log = () => { const events: string[] = []; return { events, log: (event: string) => { events.push(event); } }; };
  const pad = "ridership grew again ".repeat(50);
  /** Many digs at levels 1 to 3, enough for the byte fit to sit close to the line. */
  const wide = (count: number): readonly DossierDig[] => Array.from({ length: count }, (_, at) => {
    const id = `${String(at).padStart(8, "0")}-0000-4000-8000-000000000000`;
    const ref = `aaaa${String(at).padStart(4, "0")}-0000-4000-8000-000000000000`;
    return readyDig({ runId: id, parentRunId: ROOT, positionRef: PATH_YES, level: 1, finishedAt: "2026-10-31T10:00:00.000Z",
      rewrite: { ...readyDig().rewrite!, rewriteId: id.replace(/^./u, "9"), whatChanged: [pad], digPaths: [{ positionRef: ref, line: `Path ${String(at)}.`, fate: "HELD_UP" }] },
      ownMaterial: { answer: [], sources: [], paths: [{ positionRef: ref, statement: "s", extracts: [],
        points: Array.from({ length: 3 }, (__, p) => ({ id: `${String(at).padStart(4, "0")}${String(p).padStart(4, "0")}-0000-4000-8000-000000000000`, text: pad, onId: null, side: "for" as const, trust: null, disputed: false })) }] } });
  });

  it("a small debate is never counted", async () => {
    let counted = 0;
    const built = await fitDossierToTokenLine(investigationInput(), async () => { counted += 1; return 1; }, log().log);
    expect(built.kind).toBe("BUILT");
    expect(counted).toBe(0);
  });

  it("close to the line: under by the real count keeps the byte fit's place; over goes down the ladder, trimming, and says so", async () => {
    const input = investigationInput({ digs: wide(12) });
    const byBytes = buildInvestigationDossier(input) as Dossier;
    expect(byBytes.ladderStep).toBe(1);
    let counted = 0;
    const under = await fitDossierToTokenLine(input, async () => { counted += 1; return 10_000; }, log().log) as Dossier;
    expect(counted).toBe(1);
    expect(under.fingerprint).toBe(byBytes.fingerprint);

    const events = log();
    // A real count over the line until the material has come down far enough.
    const over = await fitDossierToTokenLine(input, async ({ packet: asked }) => estimateWindowTokens(asked.messages) * 3 , events.log) as Dossier;
    expect(over.ladderAt).toBeGreaterThan(byBytes.ladderAt);
    expect(over.ladderStep).toBeGreaterThan(1);
    expect(over.leftOut).toBeGreaterThan(0);
    expect(events.events).toContain("INVESTIGATION_REPORT_OVER_THE_TOKEN_LINE");
  });

  it("a failed count: exactly what the byte guard alone would build", async () => {
    const input = investigationInput({ digs: wide(12) });
    const failed = await fitDossierToTokenLine(input, async () => null, log().log) as Dossier;
    expect(failed.fingerprint).toBe((buildInvestigationDossier(input) as Dossier).fingerprint);
  });

  it("counts the same bytes on a second run, whatever fence the call itself gets", async () => {
    const input = investigationInput({ digs: wide(12) });
    const seen: string[] = [];
    const count: TokenCounter = async ({ packet: asked }) => { seen.push(JSON.stringify(asked.messages)); return 10_000; };
    await fitDossierToTokenLine(input, count, log().log);
    await fitDossierToTokenLine(input, count, log().log);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(buildFramedPrompt({ contract: REPORT_STORY_PROMPT_CONTRACT, material: [{ name: "a", content: "b" }] }).packet.messages[0]!.content).not.toBe("");
  });

  const rewriteInput = (points: number): PathRewriteMaterialInput => ({
    question: investigationInput().question, picks: [{ text: "Pick", by: "AI_SUGGESTION" }],
    parent: { positionRef: PATH_YES, answerVersion: 1, line: "Line", summary: null, fate: "HELD_UP", points: [], extracts: [] },
    digPaths: [{ positionRef: "dddddddd-0000-4000-8000-000000000001", statement: "S", extracts: [],
      points: Array.from({ length: points }, (_, at) => ({ id: `eeeeeeee-${String(at).padStart(4, "0")}-4000-8000-000000000000`, text: pad, onId: null, side: "for" as const, trust: null, disputed: false })) }]
  });

  it("the rewrite and the climb take the same check on their own ladder", async () => {
    let counted = 0;
    const small = await fitRewriteToTokenLine(rewriteInput(3), async () => { counted += 1; return 1; }, log().log);
    expect(small.kind === "BUILT" && small.ladderStep).toBe(1);
    expect(counted).toBe(0);
    const events = log();
    const near = await fitRewriteToTokenLine(rewriteInput(100), async ({ packet: asked }) => estimateWindowTokens(asked.messages) * 2, events.log);
    expect(near.kind === "BUILT" && near.ladderStep).toBeGreaterThan(1);
    expect(events.events).toContain("PATH_REWRITE_OVER_THE_TOKEN_LINE");
    const failed = await fitRewriteToTokenLine(rewriteInput(100), async () => null, log().log);
    expect(failed.kind === "BUILT" && failed.ladderStep).toBe(1);
  });
});
