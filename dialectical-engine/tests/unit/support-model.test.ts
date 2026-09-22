import { describe,expect,it,vi } from "vitest";
import {
  RelayAdapter,
  parseSupportModelTargetJson
} from "../../apps/api/src/support/model.js";
import { buildSupportAnswerPrompt } from "../../apps/api/src/support/prompt.js";

/**
 * FW-B / B-I1: the transport takes ONE framed packet now, and the door refuses
 * anything else, so a transport case builds its packet with the shipped support
 * builder rather than with a system string and a bare turn.
 */
const ASK = Object.freeze({
  packet: buildSupportAnswerPrompt({ instruction: "bounded",visitorMessage: "help" }).packet,
  language: "en" as const
});

function adapter(fetchImplementation: typeof fetch): RelayAdapter {
  return new RelayAdapter({
    baseUrl: "http://127.0.0.1:1234/v1",authorizationHeader: "Bearer test",
    model: "support-model",fetchImplementation
  });
}

describe("support relay response boundary", () => {
  it("accepts only the dedicated loopback Hermes GLM target",() => {
    // V-30/task 12: the parse now takes the deployment it is parsing for. The
    // local mode is what this case has always measured, and every assertion
    // below is unchanged.
    const local = { mode: "local",nodeEnv: undefined } as const;
    const source = JSON.stringify({
      provider_ref: "development:hermes-glm-5.3-flash",
      base_url: "http://127.0.0.1:8794/v1",
      model: "z-ai/glm-5.3-flash",
      authorization_header: "Bearer support-only"
    });
    expect(parseSupportModelTargetJson(source,local)).toEqual({
      providerRef: "development:hermes-glm-5.3-flash",
      baseUrl: "http://127.0.0.1:8794/v1",
      model: "z-ai/glm-5.3-flash",
      authorizationHeader: "Bearer support-only"
    });
    for (const invalid of [
      source.replace("development:hermes-glm-5.3-flash","development:codex-cli"),
      source.replace("z-ai/glm-5.3-flash","other-model"),
      source.replace("127.0.0.1","localhost"),
      source.replace("Bearer support-only",""),
      source.slice(0,-1) + ',"fallback":"development:codex-cli"}'
    ]) expect(() => parseSupportModelTargetJson(invalid,local)).toThrow("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  });

  it("propagates the caller abort signal into fetch", async () => {
    let seen: AbortSignal | undefined;
    const fetchImplementation = vi.fn(async (_url: string | URL | Request,init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }),{
        status: 200,headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    const controller = new AbortController();
    await adapter(fetchImplementation).complete({ ...ASK,signal: controller.signal });
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });

  it("cancels the response reader as soon as the 256 KiB bound is exceeded", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(200 * 1024));
        controller.enqueue(new Uint8Array(57 * 1024));
      },
      cancel() { cancelled = true; }
    });
    const fetchImplementation = vi.fn(async () => new Response(body,{ status: 200 })) as typeof fetch;
    await expect(adapter(fetchImplementation).complete(ASK))
      .rejects.toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    expect(cancelled).toBe(true);
  });
});
