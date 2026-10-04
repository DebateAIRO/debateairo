import { describe, expect, it, vi } from "vitest";
import { buildFramedPrompt } from "../../packages/providers/src/prompt-frame.js";
import { PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW } from "../../packages/register/src/publication-check-policy.js";

/** D, the register's code-owned publicationCheckPolicy deadline (60 000 ms). */
const D = PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW.value.deadline_ms;

const target = { providerRef: "development:hermes-glm-5.3-flash", baseUrl: "http://127.0.0.1:8794/v1", model: "z-ai/glm-5.3-flash", authorizationHeader: "Bearer test" };
const packet = () => buildFramedPrompt({ contract: { contractId: "publication.test", instruction: "Judge the material.", answerForm: "JSON" }, material: [{ name: "question", content: "test" }] }).packet;
const text = '{"verdict":"ALLOW","rules":[],"parts":[],"possibly_illegal":false}';
const response = (finish_reason = "stop") => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason }] }), { status: 200 });

describe("publication judge transport", () => {
  // Property: the real support adapter sends the door-approved packet verbatim and identifies its model.
  it("posts the framed messages and returns text", async () => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const posted: any[] = [];
    const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", deadlineMs: D, fetchImplementation: async (_url, init) => {
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
    const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", deadlineMs: D, fetchImplementation: async (_url, init) => {
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
    const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", deadlineMs: D, fetchImplementation: async () => {
      if (calls++ === 0) return new Response("", { status: 500 });
      await new Promise(resolve => setTimeout(resolve, 10)); throw new Error("network");
    } });
    const results = await Promise.allSettled([0, 1].map(() => judge.complete({ packet: packet(), signal: new AbortController().signal })));
    expect(results.map(r => r.status === "rejected" ? r.reason.cause : "wrong success")).toEqual(["JUDGE_HTTP_STATUS", "JUDGE_TRANSPORT_FAILED"]);
  });
  // FIX-HS2-p1 pt-N4: the only clock that can end a judge call inside D is the check's shared signal, so an expiry
  // is always recorded as JUDGE_DEADLINE. The adapter's own timeout is a backstop strictly above D, measured from the D
  // the transport is given — the register's publicationCheckPolicy row since 2026-10-04: the code-owned 60 000 ms and
  // a shorter operator value alike.
  it("arms no adapter timeout at or below D, and an expiry of the caller's signal is JUDGE_DEADLINE", async () => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const hang = async (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new Error("aborted"));
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    for (const deadlineMs of [D, 30_000]) {
      const spy = vi.spyOn(AbortSignal, "timeout");
      try {
        const judge = createPublicationJudgeTransport(target, { readAuthorizationHeader: () => "Bearer test", deadlineMs, fetchImplementation: hang });
        const caller = new AbortController();
        const timer = setTimeout(() => caller.abort(), 150);
        await expect(judge.complete({ packet: packet(), signal: caller.signal })).rejects.toMatchObject({ cause: "JUDGE_DEADLINE" });
        clearTimeout(timer);
        const armed = spy.mock.calls.map(call => call[0]);
        expect(armed.length, String(deadlineMs)).toBeGreaterThan(0);
        for (const ms of armed) expect(ms, String(deadlineMs)).toBeGreaterThan(deadlineMs);
        // FIX-HS2-p2 (REV p2 survivor M4c): the backstop is D + 10 s — a hung call never holds the relay much past D.
        for (const ms of armed) expect(ms, String(deadlineMs)).toBeLessThanOrEqual(deadlineMs + 10_000);
      } finally { spy.mockRestore(); }
    }
  });
  // FIX-HS2-p1 sd-N6: the judge's diagnostics are the judge's — never reported under the support chat's names.
  it("reports every adapter diagnostic under the PUBLICATION_JUDGE: prefix", async () => {
    const { createPublicationJudgeTransport } = await import("../../apps/api/src/publication-check/judge-transport.js");
    const reported: string[] = [];
    const p = packet();
    const canary = /DBAI-CANARY-[0-9a-f]+/u.exec(p.messages[0]!.content)?.[0];
    expect(canary).toBeDefined();
    const judge = createPublicationJudgeTransport(target, {
      readAuthorizationHeader: () => "Bearer test", deadlineMs: D, reportDiagnostic: (d) => { reported.push(d.code); },
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

// FIX-HS2-p2 api-N2: whatever sits at the flag path, the switch never throws, never writes through a link, and reads OFF.
describe("publication judge off-flag, hostile paths (api-N2)", () => {
  const port = { providerRef: "test", modelId: "test", async complete() { return { text }; } };
  const setup = async () => {
    const fs = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const transport = await import("../../apps/api/src/publication-check/judge-transport.js");
    const dir = fs.mkdtempSync(join(tmpdir(), "hs-s02-n2-"));
    return { fs, join, transport, dir, flag: join(dir, "debateai-publication-judge-3001.off"), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };
  // Property: a directory at the path is OFF, and the signal's write neither throws nor turns it ON.
  it("a directory at the flag path: OFF, switchOff returns without throwing, still OFF", async () => {
    const { fs, transport, flag, done } = await setup();
    try {
      fs.mkdirSync(flag);
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.current()).toBeNull();
      expect(() => control.switchOff()).not.toThrow();
      expect(control.current()).toBeNull();
      // the switch did not create the thing at the path: removing it does not turn the judge back on
      fs.rmdirSync(flag);
      expect(control.current()).toBeNull();
    } finally { done(); }
  });
  // Property: a live symlink at the path is OFF, and the signal never writes through it.
  it("a live symlink at the flag path: the target is untouched, OFF", async () => {
    const { fs, join, transport, dir, flag, done } = await setup();
    try {
      const victim = join(dir, "victim.txt");
      fs.writeFileSync(victim, "thirty-two bytes of owner data!!");
      fs.symlinkSync(victim, flag);
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.current()).toBeNull();
      expect(() => control.switchOff()).not.toThrow();
      expect(fs.readFileSync(victim, "utf8")).toBe("thirty-two bytes of owner data!!");
      expect(control.current()).toBeNull();
    } finally { done(); }
  });
  // Property: a dangling symlink at the path is OFF (fail closed), and the signal never creates its target.
  it("a dangling symlink at the flag path: OFF, and the signal creates nothing at the target", async () => {
    const { fs, join, transport, dir, flag, done } = await setup();
    try {
      const target = join(dir, "created-by-signal");
      fs.symlinkSync(target, flag);
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.current()).toBeNull();
      expect(() => control.switchOff()).not.toThrow();
      expect(fs.existsSync(target)).toBe(false);
      expect(control.current()).toBeNull();
    } finally { done(); }
  });
  // Property: the flag the switch creates is a private regular file; the operator's own `touch` then `rm` still toggles.
  it("the signal creates a 0600 regular file; an operator's own touched file is honoured and rm turns the judge on", async () => {
    const { fs, transport, flag, done } = await setup();
    try {
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.switchOff()).toBe(false);
      const made = fs.lstatSync(flag);
      expect([made.isFile(), made.mode & 0o777]).toEqual([true, 0o600]);
      fs.rmSync(flag);
      expect(control.current()).toBe(port);
      fs.writeFileSync(flag, "");
      expect(control.switchOff()).toBe(false);
      fs.rmSync(flag);
      expect(control.current()).toBe(port);
    } finally { done(); }
  });
  // Property: the flag lives in a directory only this user can write; a shared directory is never used directly.
  it("a group- or world-writable base directory is replaced by a private per-user subdirectory", async () => {
    const { fs, join, transport, dir, done } = await setup();
    try {
      fs.chmodSync(dir, 0o1777);
      const flag = transport.publicationJudgeOffFlagPath(3001, dir);
      const uid = process.getuid!();
      expect(flag).toBe(join(dir, `debateai-${uid}`, "debateai-publication-judge-3001.off"));
      const made = fs.lstatSync(join(dir, `debateai-${uid}`));
      expect([made.isDirectory(), made.mode & 0o777, made.uid]).toEqual([true, 0o700, uid]);
      expect(transport.createPublicationJudgeSwitch(port, { offFlagPath: flag }).current()).toBe(port);
      // a private base is used as it is
      fs.chmodSync(dir, 0o700);
      expect(transport.publicationJudgeOffFlagPath(3001, dir)).toBe(join(dir, "debateai-publication-judge-3001.off"));
    } finally { done(); }
  });
  // Property: with no directory given, the flag goes to the OS temp directory (its private form).
  it("defaults to the OS temp directory", async () => {
    const { transport, done } = await setup();
    const { tmpdir } = await import("node:os");
    try { expect(transport.publicationJudgeOffFlagPath(3001).startsWith(tmpdir())).toBe(true); } finally { done(); }
  });
  // Property: a flag directory that another user could write (pre-created with the wrong mode) reads OFF — fail closed.
  it("a flag directory that is not private reads OFF, and the signal writes nothing into it", async () => {
    const { fs, join, transport, dir, done } = await setup();
    try {
      const shared = join(dir, "shared");
      fs.mkdirSync(shared); fs.chmodSync(shared, 0o777);
      const flag = join(shared, "debateai-publication-judge-3001.off");
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.current()).toBeNull();
      expect(() => control.switchOff()).not.toThrow();
      expect(fs.existsSync(flag)).toBe(false);
      // the private-subdirectory choice refuses a pre-existing subdirectory that is not private: still OFF
      fs.chmodSync(dir, 0o1777);
      const uid = process.getuid!();
      fs.mkdirSync(join(dir, `debateai-${uid}`)); fs.chmodSync(join(dir, `debateai-${uid}`), 0o777);
      const squatted = transport.publicationJudgeOffFlagPath(3001, dir);
      expect(transport.createPublicationJudgeSwitch(port, { offFlagPath: squatted }).current()).toBeNull();
    } finally { fs.chmodSync(dir, 0o700); done(); }
  });
});

// FIX-HS2-v residue api-p3 N2 (branches the p3 mutants survived) and N3 (the privacy check and the read are one
// operation on one directory): every way the flag directory can be untrusted reads OFF.
describe("publication judge off-flag, untrusted directories (api-p3 N2, N3)", () => {
  const port = { providerRef: "test", modelId: "test", async complete() { return { text }; } };
  const setup = async () => {
    const fs = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const transport = await import("../../apps/api/src/publication-check/judge-transport.js");
    const dir = fs.mkdtempSync(join(tmpdir(), "hs-s02-n3-"));
    const flagDir = join(dir, "flags");
    fs.mkdirSync(flagDir, { mode: 0o700 });
    return { fs, join, transport, dir, flagDir, flag: join(flagDir, "debateai-publication-judge-3001.off"),
      done: () => { try { fs.chmodSync(flagDir, 0o700); } catch { /* removed by the test */ } fs.rmSync(dir, { recursive: true, force: true }); } };
  };
  // Property (S2): only "no such file" reads ON — a flag that cannot be looked at (EACCES) reads OFF.
  it("a flag the switch cannot look at (no search permission on its directory) reads OFF", async () => {
    const { fs, transport, flagDir, flag, done } = await setup();
    try {
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.current()).toBe(port);
      fs.chmodSync(flagDir, 0o600);
      expect(control.current()).toBeNull();
    } finally { done(); }
  });
  // Property (S6): a flag directory another account owns reads OFF — measured with a getuid stub (one account here).
  it("a flag directory owned by another account reads OFF", async () => {
    const { transport, flag, done } = await setup();
    const spy = vi.spyOn(process, "getuid").mockReturnValue(process.getuid!() + 1);
    try {
      expect(transport.createPublicationJudgeSwitch(port, { offFlagPath: flag }).current()).toBeNull();
    } finally { spy.mockRestore(); done(); }
  });
  // Property (S6b): a flag directory reached through a symlink reads OFF, even when the link's target is private.
  it("a symlinked flag directory reads OFF, and the signal writes nothing through it", async () => {
    const { fs, join, transport, dir, flagDir, done } = await setup();
    try {
      const link = join(dir, "link");
      fs.symlinkSync(flagDir, link);
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: join(link, "debateai-publication-judge-3001.off") });
      expect(control.current()).toBeNull();
      expect(control.switchOff()).toBe(false);
      expect(fs.readdirSync(flagDir)).toEqual([]);
      expect(control.current()).toBeNull();
    } finally { done(); }
  });
  // Property (N3): the directory's parent must not let another account swap the directory — a group- or
  // world-writable parent WITHOUT the sticky bit reads OFF; the same parent WITH the sticky bit (Linux /tmp) is trusted.
  it("a world-writable parent without the sticky bit reads OFF; with the sticky bit the flag directory is trusted", async () => {
    const { fs, transport, dir, flag, done } = await setup();
    try {
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      fs.chmodSync(dir, 0o777);
      expect(control.current()).toBeNull();
      fs.chmodSync(dir, 0o1777);
      expect(control.current()).toBe(port);
      fs.chmodSync(dir, 0o770);
      expect(control.current()).toBeNull();
    } finally { fs.chmodSync(dir, 0o700); done(); }
  });
  // Property (N3): the directory the read went through is the directory the privacy check opened — a directory
  // swapped for a symlink to an empty private directory between the check and the read never reads ON.
  it("a flag directory replaced by a symlink to an empty private directory reads OFF", async () => {
    const { fs, join, transport, dir, flagDir, flag, done } = await setup();
    try {
      fs.writeFileSync(flag, "");
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.current()).toBeNull();
      const empty = join(dir, "empty");
      fs.mkdirSync(empty, { mode: 0o700 });
      fs.renameSync(flagDir, join(dir, "moved"));
      fs.symlinkSync(empty, flagDir);
      expect(control.current()).toBeNull();
    } finally { done(); }
  });
  // FIX-HS2-v2 N4 — property: the flag is read in the directory whose privacy was checked. The directory is swapped
  // for a symlink to an empty private directory at the exact moment the flag is looked up (a node:fs mock makes the
  // race deterministic); the dev/ino re-check against the held descriptor sees it and the switch reads OFF.
  it("a directory swapped at the moment of the flag lookup reads OFF (the dev/ino re-check)", async () => {
    const { fs, join, dir, flagDir, flag, done } = await setup();
    const empty = join(dir, "empty"), moved = join(dir, "moved");
    fs.mkdirSync(empty, { mode: 0o700 });
    fs.writeFileSync(flag, "");
    let swapped = false;
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => {
      const real = await importOriginal<typeof import("node:fs")>();
      const lstatSync = ((path: string, ...rest: unknown[]) => {
        if (!swapped && String(path) === flag) { swapped = true; real.renameSync(flagDir, moved); real.symlinkSync(empty, flagDir); }
        return (real.lstatSync as (...args: unknown[]) => unknown)(path, ...rest);
      }) as typeof real.lstatSync;
      return { ...real, default: { ...real, lstatSync }, lstatSync };
    });
    try {
      const fresh = await import("../../apps/api/src/publication-check/judge-transport.js");
      const control = fresh.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.current()).toBeNull();
      expect(swapped).toBe(true);
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
      fs.unlinkSync(flagDir); fs.renameSync(moved, flagDir);
      done();
    }
  });
  // Property: after the signal, the switch reads OFF — if the flag it created is not the one it reads, it stays OFF in memory.
  it("switchOff always leaves the switch OFF", async () => {
    const { transport, flag, done } = await setup();
    try {
      const control = transport.createPublicationJudgeSwitch(port, { offFlagPath: flag });
      expect(control.switchOff()).toBe(false);
      expect(control.current()).toBeNull();
    } finally { done(); }
  });
});
