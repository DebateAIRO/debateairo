import { describe,expect,it,vi } from "vitest";
import {
  RelayAdapter,
  parseSupportModelTargetJson
} from "../../apps/api/src/support/model.js";

function adapter(fetchImplementation: typeof fetch): RelayAdapter {
  return new RelayAdapter({
    baseUrl: "http://127.0.0.1:1234/v1",authorizationHeader: "Bearer test",
    model: "support-model",fetchImplementation
  });
}

describe("support relay response boundary", () => {
  it("accepts only the dedicated loopback Hermes GLM target",() => {
    const source = JSON.stringify({
      provider_ref: "development:hermes-glm-5.3-flash",
      base_url: "http://127.0.0.1:8794/v1",
      model: "z-ai/glm-5.3-flash",
      authorization_header: "Bearer support-only"
    });
    expect(parseSupportModelTargetJson(source)).toEqual({
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
    ]) expect(() => parseSupportModelTargetJson(invalid)).toThrow("SUPPORT_MODEL_PATH_NOT_RATIFIED");
  });

  it("ratifies only the marked support-preview target on its fixed loopback port",() => {
    const source = JSON.stringify({
      provider_ref: "development:hermes-glm-5.3-flash",
      base_url: "http://127.0.0.1:8894/v1",
      model: "z-ai/glm-5.3-flash",
      authorization_header: "Bearer support-only",
      development_stack_profile: "support-preview"
    });
    expect(parseSupportModelTargetJson(source)).toEqual({
      providerRef: "development:hermes-glm-5.3-flash",
      baseUrl: "http://127.0.0.1:8894/v1",
      model: "z-ai/glm-5.3-flash",
      authorizationHeader: "Bearer support-only"
    });
    for (const invalid of [
      source.replace("8894","8794"),
      source.replace("8894","8994"),
      source.replace("support-preview","default"),
      source.replace(',"development_stack_profile":"support-preview"',""),
      source.replace("development:hermes-glm-5.3-flash","development:codex-cli"),
      source.replace("z-ai/glm-5.3-flash","other-model"),
      source.replace("Bearer support-only","")
    ]) expect(() => parseSupportModelTargetJson(invalid)).toThrow("SUPPORT_MODEL_PATH_NOT_RATIFIED");
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
    await adapter(fetchImplementation).complete({
      system: "bounded",messages: [{ role: "user",content: "help" }],language: "en",
      signal: controller.signal
    });
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
    await expect(adapter(fetchImplementation).complete({
      system: "bounded",messages: [{ role: "user",content: "help" }],language: "en"
    })).rejects.toMatchObject({ code: "SUPPORT_MODEL_UNAVAILABLE" });
    expect(cancelled).toBe(true);
  });
});
