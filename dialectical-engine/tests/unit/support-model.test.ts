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

/**
 * FW-B fix round 1, IMPORTANT 2 — THE DOOR, AND WHERE IT STANDS.
 *
 * B-I1 put `assertFramedPrompt` in this transport and put it BEFORE the try on
 * purpose, but nothing drove it: the door's presence was read, never exercised,
 * and its PLACEMENT was pinned by a comment. Both halves matter and they fail
 * differently.
 *
 *  - Presence: without the door an unframed packet is posted, which is the
 *    defect B-I1 exists to close — the row below proves the fetch never runs.
 *  - Placement: `complete`'s catch turns anything that is not a
 *    `SupportModelError` into `SUPPORT_MODEL_UNAVAILABLE` (`unavailable()`).
 *    Move the door one line down, inside the try, and a call-site defect stops
 *    being a typed `PROMPT_FRAME_*` refusal and starts looking like the vendor
 *    being down: the visitor gets DEGRADED, `answer.ts` calls
 *    `markUnavailable` and the circuit opens for everyone. The two rows below
 *    discriminate exactly those two outcomes, so the placement is measured
 *    rather than described.
 *
 * Driven against the REAL `RelayAdapter` with a capturing fetch, not a double:
 * a door that only a double holds is not a door.
 */
describe("FW-B — the support transport refuses an unframed packet before it posts", () => {
  it("raises the door's own typed refusal, and never reaches the vendor", async () => {
    let calls = 0;
    const fetchImplementation = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }),{
        status: 200,headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    // The exact shape this transport assembled for itself before B-I1: an
    // instruction and the visitor's words as a bare `user` turn.
    await expect(adapter(fetchImplementation).complete({
      packet: { messages: [
        { role: "system",content: "Answer only from the supplied entries." },
        { role: "user",content: "help" }
      ] },
      language: "en"
    })).rejects.toMatchObject({ code: "PROMPT_FRAME_ABSENT" });

    // Nothing left the process. This is the whole property: the refusal is not
    // a vendor's answer being rejected, it is a call that never happened.
    expect(calls).toBe(0);
  });

  it("refuses as a call-site defect, not as a vendor outage", async () => {
    const fetchImplementation = vi.fn(async () => new Response("{}",{ status: 200 })) as typeof fetch;
    /**
     * `name` says which class refused, positively: `TypedDomainError` is the
     * door's, `SupportModelError` is the transport's own vocabulary and the
     * only thing `answer.ts` degrades on. Asserting the name rather than
     * negating a class keeps this one statement, which is what the packet-shape
     * scanner's door allowance reads.
     */
    await expect(adapter(fetchImplementation).complete({
      packet: { messages: [{ role: "user",content: "help" }] },
      language: "en"
    })).rejects.toMatchObject({ name: "TypedDomainError",code: "PROMPT_FRAME_ABSENT" });
  });

  it("refuses a framed packet whose material block was tampered with", async () => {
    const fetchImplementation = vi.fn(async () => new Response("{}",{ status: 200 })) as typeof fetch;
    const framed = buildSupportAnswerPrompt({ instruction: "bounded",visitorMessage: "help" });
    // A real frame, a real system message — and a user block that no longer
    // opens and closes with the boundary marker the frame declares.
    await expect(adapter(fetchImplementation).complete({
      packet: { messages: [
        framed.packet.messages[0]!,
        { role: "user",content: "help, with the markers stripped" }
      ] },
      language: "en"
    })).rejects.toMatchObject({ code: "PROMPT_FRAME_FENCE_MISMATCH" });
  });
});
