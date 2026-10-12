import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { anthropicCacheableSystem, type PromptPacket } from "@debateai/providers";
import { readCustodyAuthorizationHeader } from "../../packages/crypto/src/index.js";
import {
  AnthropicMessagesAdapter,
  ApiVendorAdapter,
  SUPPORT_RELAY_MODEL,
  SUPPORT_RELAY_PROVIDER_REF,
  createSupportModelAdapter,
  parseSupportModelTargetJson
} from "../../apps/api/src/support/model.js";
import { buildSupportAnswerPrompt } from "../../apps/api/src/support/prompt.js";
import { createPublicationJudgeTransport } from "../../apps/api/src/publication-check/judge-transport.js";

/**
 * V, 2026-10-12: the support agent runs on Claude Haiku 5.5. Hosted reaches it
 * on Anthropic's own API, over the native Messages wire the debate path already
 * speaks (`anthropic-messages-http`); locally it is the Claude CLI relay asked
 * for `--model haiku`. These cases are the hosted half and the ratified relay pin.
 */

const HOSTED = Object.freeze({ mode: "hosted", nodeEnv: "production" } as const);
const LOCAL = Object.freeze({ mode: "local", nodeEnv: undefined } as const);

/** Never a real key: no key of any vendor exists on this machine. */
const BARE_FIXTURE = "not-a-real-key";

function anthropicTarget(credential: Readonly<Record<string, string>>, overrides = {}): string {
  return JSON.stringify({
    provider_ref: "vendor:anthropic",
    base_url: "https://api.anthropic.com/v1",
    model: "claude-haiku-5-5",
    ...credential,
    ...overrides
  });
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A 0600 file inside a 0700 directory — the custody shape §11 documents. */
function credentialFile(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "support-haiku-custody-"));
  roots.push(root);
  chmodSync(root, 0o700);
  const path = join(root, "anthropic.header");
  writeFileSync(path, contents);
  chmodSync(path, 0o600);
  return path;
}

function recordingFetch(body: unknown): Readonly<{
  calls: { url: string; init: RequestInit }[];
  implementation: typeof fetch;
}> {
  const calls: { url: string; init: RequestInit }[] = [];
  const implementation = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status: 200, headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  return { calls, implementation };
}

function message(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return {
    id: "msg_fixture",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "thinking", thinking: "" }, { type: "text", text: "the answer" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 },
    ...overrides
  };
}

function ask(): Readonly<{ packet: PromptPacket; language: "en" }> {
  return {
    packet: buildSupportAnswerPrompt({ instruction: "bounded", visitorMessage: "help" }).packet,
    language: "en"
  };
}

function hostedAdapter(body: unknown, seen: string[] = []) {
  const fetchRecord = recordingFetch(body);
  const adapter = createSupportModelAdapter(
    parseSupportModelTargetJson(anthropicTarget({ authorization_file: credentialFile(`${BARE_FIXTURE}\n`) }), HOSTED),
    {
      readAuthorizationHeader: readCustodyAuthorizationHeader,
      fetchImplementation: fetchRecord.implementation,
      reportDiagnostic: (diagnostic) => { seen.push(diagnostic.code); }
    }
  );
  return { adapter, fetchRecord };
}

describe("support chat on Claude Haiku 5.5 — the hosted target", () => {
  it("parses an Anthropic API target as the native Messages wire", () => {
    expect(parseSupportModelTargetJson(
      anthropicTarget({ authorization_file: "/etc/debateai/api/providers/anthropic.header" }), HOSTED
    )).toEqual({
      providerRef: "vendor:anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-haiku-5-5",
      authorizationFile: "/etc/debateai/api/providers/anthropic.header",
      adapterKind: "anthropic-messages-http"
    });
  });

  it("refuses Anthropic's host on any other base URL, as the debate path does", () => {
    expect(() => parseSupportModelTargetJson(
      anthropicTarget(
        { authorization_file: "/etc/debateai/api/providers/anthropic.header" },
        { base_url: "https://api.anthropic.com/proxy/v1" }
      ), HOSTED
    )).toThrow("PROVIDER_ADAPTER_HOST_MISMATCH");
  });

  it("keeps every other vendor on the OpenAI-compatible wire", () => {
    expect(parseSupportModelTargetJson(JSON.stringify({
      provider_ref: "vendor:acme",
      base_url: "https://api.acme.example/v1",
      model: "acme-large",
      authorization_file: "/etc/debateai/api/providers/acme.header"
    }), HOSTED).adapterKind).toBeUndefined();
  });
});

describe("support chat on Claude Haiku 5.5 — the call", () => {
  it("posts the framed packet to /v1/messages with the bare key as x-api-key", async () => {
    const seen: string[] = [];
    const { adapter, fetchRecord } = hostedAdapter(message(), seen);
    expect(adapter).toBeInstanceOf(AnthropicMessagesAdapter);
    const request = ask();
    const completion = await adapter.complete(request);
    expect(completion.text).toBe("the answer");
    // Cache reads count as input, exactly as the debate path charges them.
    expect(completion.usage).toEqual({ input_tokens: 105, output_tokens: 20 });
    // Anthropic reports no money: announced, never written as a free call.
    expect(seen).toEqual(["SUPPORT_MODEL_COST_UNREPORTED"]);
    expect(fetchRecord.calls).toHaveLength(1);
    expect(fetchRecord.calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = fetchRecord.calls[0]?.init.headers as Record<string, string>;
    expect(Object.keys(headers).sort()).toEqual(["anthropic-version", "content-type", "x-api-key"]);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["x-api-key"]).toBe(BARE_FIXTURE);
    const [system, user] = request.packet.messages;
    const body = JSON.parse(String(fetchRecord.calls[0]?.init.body));
    // Prompt caching (R14, 2026-10-12): the framed system goes out as the cached stable prefix plus the per-call tail,
    // exactly as on the debate path; joined, the two blocks are the framed system byte for byte.
    expect(body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 16_000,
      messages: [{ role: "user", content: user!.content }],
      system: anthropicCacheableSystem(system!.content)
    });
    expect(body.system).toHaveLength(2);
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.system.map((block: { text: string }) => block.text).join("")).toBe(system!.content);
  });

  it("treats a max_tokens stop as a truncated answer, never serving the fragment", async () => {
    const { adapter } = hostedAdapter(message({ stop_reason: "max_tokens" }));
    await expect(adapter.complete(ask())).rejects.toMatchObject({ code: "SUPPORT_MODEL_LENGTH_EXCEEDED" });
  });

  it.each([
    ["a refusal", message({ stop_reason: "refusal" })],
    ["a tool call", message({ content: [{ type: "tool_use", id: "t", name: "x", input: {} }], stop_reason: "tool_use" })],
    ["an empty answer", message({ content: [{ type: "text", text: "  " }] })],
    ["a body that is not a message", { type: "error", error: { type: "overloaded_error" } }]
  ])("answers UNAVAILABLE on %s", async (_name, body) => {
    const { adapter } = hostedAdapter(body);
    await expect(adapter.complete(ask())).rejects.toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
  });

  it("refuses a key file written for the other wire, naming nothing of the value", () => {
    const path = credentialFile(`Bearer ${BARE_FIXTURE}\n`);
    let caught: unknown;
    try {
      createSupportModelAdapter(
        parseSupportModelTargetJson(anthropicTarget({ authorization_file: path }), HOSTED),
        { readAuthorizationHeader: readCustodyAuthorizationHeader }
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toEqual(new TypeError("PROVIDER_GATEWAY_CREDENTIAL_INVALID"));
    expect(JSON.stringify(caught, Object.getOwnPropertyNames(caught ?? {}))).not.toContain(BARE_FIXTURE);
  });

  it("ties the wire and the host both ways", () => {
    expect(() => new AnthropicMessagesAdapter({
      baseUrl: "https://api.acme.example/v1", authorizationHeader: BARE_FIXTURE, model: "m"
    })).toThrowError(expect.objectContaining({ code: "SUPPORT_MODEL_PATH_NOT_RATIFIED" }));
    expect(() => new ApiVendorAdapter({
      baseUrl: "https://api.anthropic.com/v1", authorizationHeader: `Bearer ${BARE_FIXTURE}`, model: "m"
    })).toThrowError(expect.objectContaining({ code: "SUPPORT_MODEL_PATH_NOT_RATIFIED" }));
  });

  it("sends the publication judge to the same model over the same wire", async () => {
    const fetchRecord = recordingFetch(message({ content: [{ type: "text", text: "{\"verdict\":\"ok\"}" }] }));
    const judge = createPublicationJudgeTransport(
      parseSupportModelTargetJson(anthropicTarget({ authorization_file: credentialFile(BARE_FIXTURE) }), HOSTED),
      {
        readAuthorizationHeader: readCustodyAuthorizationHeader,
        deadlineMs: 5_000,
        fetchImplementation: fetchRecord.implementation
      }
    );
    expect(judge.modelId).toBe("claude-haiku-5-5");
    const answer = await judge.complete({ packet: ask().packet, signal: new AbortController().signal });
    expect(answer.text).toBe("{\"verdict\":\"ok\"}");
    expect(fetchRecord.calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
  });
});

describe("support chat on Claude Haiku 5.5 — the local relay pin", () => {
  it("ratifies the Claude Haiku 5.5 relay and nothing else on the support port", () => {
    expect(SUPPORT_RELAY_PROVIDER_REF).toBe("development:claude-haiku-5.5");
    expect(SUPPORT_RELAY_MODEL).toBe("claude-haiku-5-5");
    const relay = {
      provider_ref: SUPPORT_RELAY_PROVIDER_REF,
      base_url: "http://127.0.0.1:8794/v1",
      model: SUPPORT_RELAY_MODEL,
      authorization_header: "Bearer support-only"
    };
    expect(parseSupportModelTargetJson(JSON.stringify(relay), LOCAL)).toMatchObject({
      providerRef: "development:claude-haiku-5.5", model: "claude-haiku-5-5"
    });
    expect(() => parseSupportModelTargetJson(JSON.stringify({
      ...relay, provider_ref: "development:hermes-glm-5.3-flash", model: "z-ai/glm-5.3-flash"
    }), LOCAL)).toThrow("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  });
});
