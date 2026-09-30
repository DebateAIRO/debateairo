import { describe, expect, it, vi } from "vitest";
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
  // FIX-HS2-p1 pt-N4: the only clock that can end a judge call inside D is the check's shared signal, so an expiry
  // is always recorded as JUDGE_DEADLINE. The adapter's own timeout is a backstop strictly above D.
  it("arms no adapter timeout at or below D, and an expiry of the caller's signal is JUDGE_DEADLINE", async () => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const { PUBLICATION_CHECK_DEADLINE_MS } = await import("../../apps/api/src/publication-check/check.js");
    const hang = async (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new Error("aborted"));
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const spy = vi.spyOn(AbortSignal, "timeout");
    try {
      const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", fetchImplementation: hang });
      const caller = new AbortController();
      const timer = setTimeout(() => caller.abort(), 150);
      await expect(judge.complete({ packet: packet(), signal: caller.signal })).rejects.toMatchObject({ cause: "JUDGE_DEADLINE" });
      clearTimeout(timer);
      const armed = spy.mock.calls.map(call => call[0]);
      expect(armed.length).toBeGreaterThan(0);
      for (const ms of armed) expect(ms).toBeGreaterThan(PUBLICATION_CHECK_DEADLINE_MS);
    } finally { spy.mockRestore(); }
  });
  // FIX-HS2-p1 sd-N6: the judge's diagnostics are the judge's — never reported under the support chat's names.
  it("reports every adapter diagnostic under the PUBLICATION_JUDGE: prefix", async () => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const reported: string[] = [];
    const p = packet();
    const canary = /DBAI-CANARY-[0-9a-f]+/u.exec(p.messages[0]!.content)?.[0];
    expect(canary).toBeDefined();
    const judge = createPublicationJudgeTransport(target, {
      readAuthorizationHeader: () => "Bearer test", reportDiagnostic: (d) => { reported.push(d.code); },
      fetchImplementation: async () => new Response(JSON.stringify({ choices: [{ message: { content: `${text} ${canary}` }, finish_reason: "stop" }] }), { status: 200 })
    });
    await judge.complete({ packet: p, signal: new AbortController().signal }).catch(() => undefined);
    expect(reported.length).toBeGreaterThan(0);
    for (const code of reported) expect(code).toMatch(/^PUBLICATION_JUDGE:[A-Z0-9_:]+$/u);
    expect(reported.some(code => code.includes("TRIPWIRE"))).toBe(true);
  });
  // FIX-HS2-p1 sd-N5: the off switch is a FILE, read per attempt — explicit, idempotent, and it survives a restart.
  it("is off exactly while the flag file exists; switchOff is idempotent; a fresh switch reads the same state", async () => {
    const { createPublicationJudgeSwitch, publicationJudgeOffFlagPath } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "hs-s02-switch-"));
    try {
      const flag = publicationJudgeOffFlagPath(3001, dir);
      expect(flag).toBe(join(dir, "debateai-publication-judge-3001.off"));
      const port = { providerRef: "test", modelId: "test", async complete() { return { text }; } };
      const control = createPublicationJudgeSwitch(port, { offFlagPath: flag }), current = control.current;
      expect(current()).toBe(port);
      expect(control.switchOff()).toBe(false); expect(current()).toBeNull(); expect(existsSync(flag)).toBe(true);
      expect(control.switchOff()).toBe(false); expect(current()).toBeNull();
      // a restart composes a new switch over the same file: still off
      expect(createPublicationJudgeSwitch(port, { offFlagPath: flag }).current()).toBeNull();
      rmSync(flag);
      expect(current()).toBe(port);
      // hosted composes no flag: the judge is the configured port, always
      const hosted = createPublicationJudgeSwitch(port, { offFlagPath: null });
      expect(hosted.current()).toBe(port);
      expect(createPublicationJudgeSwitch(null, { offFlagPath: flag }).current()).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
