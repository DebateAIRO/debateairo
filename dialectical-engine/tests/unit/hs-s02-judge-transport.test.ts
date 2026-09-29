import { describe, expect, it } from "vitest";
import { buildFramedPrompt } from "../../packages/providers/src/prompt-frame.js";

const target = { providerRef: "development:hermes-glm-5.3-flash", baseUrl: "http://127.0.0.1:8794/v1", model: "z-ai/glm-5.3-flash", authorizationHeader: "Bearer test" };
const packet = () => buildFramedPrompt({ contract: { contractId: "publication.test", instruction: "Judge the material.", answerForm: "JSON" }, material: [{ name: "question", content: "test" }] }).packet;
const text = '{"verdict":"ALLOW","rules":[],"parts":[],"possibly_illegal":false}';
const response = (finish_reason = "stop") => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason }] }), { status: 200 });

describe("publication judge transport", () => {
  // Property: the real support adapter sends the door-approved packet verbatim and identifies its model.
  it("posts the framed messages and returns text", async () => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const posted: any[] = [];
    const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", fetchImplementation: async (_url, init) => {
      posted.push(JSON.parse(String(init?.body))); return response();
    } });
    const p = packet();
    expect(await judge.complete({ packet: p, signal: new AbortController().signal })).toEqual({ text });
    expect(posted).toEqual([{ model: target.model, stream: false, messages: p.messages }]);
    expect([judge.providerRef, judge.modelId]).toEqual([target.providerRef, target.model]);
  });
  // Property: HTTP, transport, deadline, truncation and door failures cannot collapse to the wrong cause.
  it.each(["http", "network", "deadline", "length", "door"] as const)("maps %s failure", async kind => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    let calls = 0;
    const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", fetchImplementation: async (_url, init) => {
      calls++;
      if (kind === "http") return new Response("private vendor body", { status: 500 });
      if (kind === "network") throw new Error("private transport error");
      if (kind === "deadline") {
        if (init?.signal?.aborted) throw new Error("aborted");
        return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      }
      return response(kind === "length" ? "length" : "stop");
    } });
    const p = packet();
    const damaged = { messages: p.messages.map(m => ({ ...m, content: m.content.replace("--- SAFETY FRAME", "removed") })) };
    const causes = { http: "JUDGE_HTTP_STATUS", network: "JUDGE_TRANSPORT_FAILED", deadline: "JUDGE_DEADLINE", length: "JUDGE_ANSWER_NOT_JSON", door: "JUDGE_DOOR_REFUSED" };
    await expect(judge.complete({ packet: kind === "door" ? damaged : p, signal: kind === "deadline" ? AbortSignal.abort() : new AbortController().signal })).rejects.toMatchObject({ cause: causes[kind] });
    if (kind === "door") expect(calls).toBe(0);
  });
  // Property: concurrent calls cannot borrow one another's HTTP status or retain adapter failure state.
  it("keeps HTTP status local to each call", async () => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    let calls = 0;
    const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", fetchImplementation: async () => {
      if (calls++ === 0) return new Response("", { status: 500 });
      await new Promise(resolve => setTimeout(resolve, 10)); throw new Error("network");
    } });
    const results = await Promise.allSettled([0, 1].map(() => judge.complete({ packet: packet(), signal: new AbortController().signal })));
    expect(results.map(r => r.status === "rejected" ? r.reason.cause : "wrong success")).toEqual(["JUDGE_HTTP_STATUS", "JUDGE_TRANSPORT_FAILED"]);
  });
  // Property: a detached supplier retains switch state, and an absent configured port never becomes present.
  it("toggles safely through a detached current supplier", async () => {
    const { createPublicationJudgeSwitch } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const port = { providerRef: "test", modelId: "test", async complete() { return { text }; } };
    const control = createPublicationJudgeSwitch(port), current = control.current;
    expect(current()).toBe(port); expect(control.toggle()).toBe(false); expect(current()).toBeNull();
    expect(control.toggle()).toBe(true); expect(current()).toBe(port);
    const empty = createPublicationJudgeSwitch(null);
    expect(empty.toggle()).toBe(false); expect(empty.current()).toBeNull();
  });
});
