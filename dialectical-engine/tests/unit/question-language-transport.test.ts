import { describe, expect, it } from "vitest";
import { PROJECTED_INPUT_BYTES_PER_TOKEN } from "@debateai/budget";
import { PREVIEW_ANTHROPIC_MESSAGES_URL, createPreviewGuardedFetch, type PreviewBudgetExecution } from "@debateai/providers";
import { questionLanguagePolicyStartValues } from "@debateai/register";
import { framedQuestionLanguageCheck } from "../../apps/api/src/question-language/fast-check.js";
import { anthropicFastCheckTransport, type FastCheckUsage } from "../../apps/api/src/question-language/transport.js";

const settings = questionLanguagePolicyStartValues().fastCheck!;
const packet = framedQuestionLanguageCheck("Name it.", "Should Romania adopt the euro?", { code: "ro", name: "Romanian" });
const message = (text: string) => JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5",
  content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 310, output_tokens: 28 } });
const HOSTED_URL = "https://api.anthropic.com/v1/messages";
const projectedFor = (body: string): FastCheckUsage => ({
  inputTokens: Math.ceil(Buffer.byteLength(body, "utf8") / PROJECTED_INPUT_BYTES_PER_TOKEN), outputTokens: settings.maxOutputTokens, projected: true });

describe("the fast check's transport", () => {
  it("on the preview: the Anthropic gate accepts the body (Haiku, effort low, no key), and the reply text comes back", async () => {
    const executed: PreviewBudgetExecution[] = [];
    const guarded = createPreviewGuardedFetch({ anthropic: { execute: async (input) => { executed.push(input); return { status: 200, body: message('{"main_language":"en"}') }; } } });
    const usage: unknown[] = [];
    const transport = anthropicFastCheckTransport({ fetch: guarded, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings,
      onUsage: (u) => { usage.push(u); } });
    expect(await transport({ packet, signal: AbortSignal.timeout(5000) })).toBe('{"main_language":"en"}');
    expect(executed).toHaveLength(1);
    const body = JSON.parse(executed[0]!.requestBody);
    expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 600, output_config: { effort: "low" } });
    expect(usage).toEqual([{ inputTokens: 310, outputTokens: 28, projected: false }]);
  });

  it("PF-L16: a reply with no usage, or an abort after sending, records the projected maximum, never nothing", async () => {
    const noUsage = JSON.stringify({ id: "msg_2", type: "message", role: "assistant", model: "claude-haiku-5-5",
      content: [{ type: "text", text: '{"main_language":"en"}' }], stop_reason: "end_turn" });
    const usage: { inputTokens: number; outputTokens: number; projected: boolean }[] = [];
    const sent: string[] = [];
    const answering = (body: string) => (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(init?.body)); return new Response(body, { status: 200 }); }) as typeof fetch;
    await anthropicFastCheckTransport({ fetch: answering(noUsage), url: HOSTED_URL, credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } })({ packet, signal: AbortSignal.timeout(5000) });
    expect(usage).toEqual([{ inputTokens: Math.ceil(Buffer.byteLength(sent[0]!, "utf8") / PROJECTED_INPUT_BYTES_PER_TOKEN), outputTokens: settings.maxOutputTokens, projected: true }]);
    const hanging = (async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)); })) as typeof fetch;
    const controller = new AbortController();
    const pending = anthropicFastCheckTransport({ fetch: hanging, url: HOSTED_URL, credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } })({ packet, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(usage.at(-1)).toMatchObject({ outputTokens: settings.maxOutputTokens, projected: true });
  });

  it("on hosted: the key goes as x-api-key, and a refusal or a non-200 is a throw (the check reads it as DOWN)", async () => {
    const seen: Request[] = [];
    const hostedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return new Response(JSON.stringify({ type: "error" }), { status: 529 });
    }) as typeof fetch;
    const usage: FastCheckUsage[] = [];
    const transport = anthropicFastCheckTransport({ fetch: hostedFetch, url: HOSTED_URL, credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } });
    await expect(transport({ packet, signal: AbortSignal.timeout(5000) })).rejects.toThrow(/QUESTION_LANGUAGE_FAST_CHECK_HTTP_529/u);
    await expect(transport({ packet, signal: AbortSignal.timeout(5000) })).rejects.toMatchObject({ code: "QUESTION_LANGUAGE_FAST_CHECK_HTTP_529" });
    expect(seen[0]!.headers.get("x-api-key")).toBe("sk-ant-test");
    // A refused (non-200) request costs nothing: no record.
    expect(usage).toEqual([]);
  });

  it("CR-6: on the preview no key header is ever sent, and a failure carries no question text", async () => {
    const guarded = createPreviewGuardedFetch({ anthropic: { execute: async () => ({ status: 500, body: "{}" }) } });
    const transport = anthropicFastCheckTransport({ fetch: guarded, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings });
    const failure = await transport({ packet, signal: AbortSignal.timeout(5000) }).catch((error: unknown) => error);
    expect(String((failure as Error).message)).not.toContain("Romania");
    expect(failure).toMatchObject({ code: "QUESTION_LANGUAGE_FAST_CHECK_HTTP_500" });
    // The guarded fetch refuses a key header outright, so a credential on the preview could never leave the app.
    const keyed = anthropicFastCheckTransport({ fetch: guarded, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: "sk-ant-test", settings });
    await expect(keyed({ packet, signal: AbortSignal.timeout(5000) })).rejects.toBeDefined();
  });

  it("money law: a billed reply the vendor refused is recorded before the throw, and so is a 200 whose body cannot be read", async () => {
    const usage: FastCheckUsage[] = [];
    const sent: string[] = [];
    const answering = (body: string) => (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(init?.body)); return new Response(body, { status: 200 }); }) as typeof fetch;
    const refusal = JSON.stringify({ id: "msg_3", type: "message", role: "assistant", model: "claude-haiku-5-5",
      content: [], stop_reason: "refusal", usage: { input_tokens: 300, output_tokens: 2 } });
    await expect(anthropicFastCheckTransport({ fetch: answering(refusal), url: HOSTED_URL, credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } })({ packet, signal: AbortSignal.timeout(5000) })).rejects.toMatchObject({ code: "PROVIDER_CONTENT_REFUSED" });
    expect(usage).toEqual([{ inputTokens: 300, outputTokens: 2, projected: false }]);
    const failure = await anthropicFastCheckTransport({ fetch: answering("not json at all"), url: HOSTED_URL, credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } })({ packet, signal: AbortSignal.timeout(5000) }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "QUESTION_LANGUAGE_FAST_CHECK_REPLY_UNREADABLE" });
    expect(usage.at(-1)).toEqual(projectedFor(sent.at(-1)!));
  });

  it("money law: a send that fails records the projected maximum; a signal aborted before sending sends and records nothing", async () => {
    const usage: FastCheckUsage[] = [];
    const sent: string[] = [];
    const failing = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(init?.body)); throw new TypeError("fetch failed"); }) as typeof fetch;
    const transport = anthropicFastCheckTransport({ fetch: failing, url: HOSTED_URL, credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } });
    await expect(transport({ packet, signal: AbortSignal.timeout(5000) })).rejects.toMatchObject({ code: "QUESTION_LANGUAGE_FAST_CHECK_SEND_FAILED" });
    expect(usage).toEqual([projectedFor(sent[0]!)]);
    const controller = new AbortController();
    controller.abort();
    await expect(transport({ packet, signal: controller.signal })).rejects.toMatchObject({ code: "QUESTION_LANGUAGE_FAST_CHECK_ABORTED" });
    expect(sent).toHaveLength(1);
    expect(usage).toHaveLength(1);
  });
});
