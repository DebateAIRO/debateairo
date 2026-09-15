import { describe,expect,it,vi } from "vitest";
import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import { SupportDegradedState } from "../../apps/api/src/support/degraded.js";
import { SupportModelError } from "../../apps/api/src/support/model.js";
import { SUPPORT_LIMIT_DEFAULTS } from "../../apps/api/src/support/limits.js";
import { SupportRelayQueue } from "../../apps/api/src/support/queue.js";
import { formatRelayState } from "../../apps/runner/src/support-status-cli.js";
import {
  createHelpCorpusSnapshotLookup,type LoadedHelpCorpus
} from "../../packages/support-kb/src/index.js";

function messages() {
  return {
    write: vi.fn(async (input) => ({ ...input,redacted: false })),
    writeAndTransit: vi.fn(async (input,transit) => {
      await transit(input.text);
      return { ...input,redacted: false };
    }),
    read: vi.fn(async () => null),listSession: vi.fn(async () => [])
  } as never;
}

const ENTRY = Object.freeze({
  id: "getting-started-debate",lang: "en" as const,title: "Start a debate",
  status: "shipped" as const,sources: ["test"],verifiedAgainst: "test",
  ratifiedBy: "V" as const,ratifiedOn: "2026-09-01",
  body: "Open the new debate page to start your first debate.",
  modelProjection: "Open the new debate page to start your first debate."
});

describe("SUP-06 automatic degraded state", () => {
  it("treats a screened model draft as successful relay transport", async () => {
    const degraded = new SupportDegradedState();
    const base = Date.parse("2026-09-08T12:00:00.000Z");
    degraded.markUnavailable(new Date(base),"relay");
    const stored = messages();
    const snapshot = Object.freeze({
      entries: Object.freeze([ENTRY]),kbVersion: "a".repeat(64)
    }) as unknown as LoadedHelpCorpus;
    const answer = createSupportAnswerService({
      entries: [ENTRY],
      snapshots: createHelpCorpusSnapshotLookup(snapshot),
      messages: stored,
      degraded,
      modelFor: () => ({ complete: async () => ({
        text: JSON.stringify({
          kind: "answer",text: "Type your password here.",
          sourceIds: [ENTRY.id],actionIds: []
        }),
        usage: { input_tokens: 3,output_tokens: 4,cost_usd: 0.001 }
      }) })
    });

    await expect(answer.respond({
      sessionId: "screened",text: "How do I start my first debate?",language: "en",
      detectedLanguage: "en",overrideLanguage: null,modelRef: "relay",
      kbVersion: snapshot.kbVersion,signedIn: false,receivedAt: new Date(base + 1_001)
    })).resolves.toMatchObject({
      outcome: "REFUSE_SAFETY",
      usage: { input_tokens: 3,output_tokens: 4,cost_usd: 0.001 }
    });
    expect(degraded.isDegraded()).toEqual({ degraded: false });
    expect((stored as unknown as { write: ReturnType<typeof vi.fn> }).write)
      .toHaveBeenLastCalledWith(expect.objectContaining({
        role: "assistant",outcome: "REFUSE_SAFETY",modelCalled: true,
        inputTokens: 3,outputTokens: 4,costUsd: 0.001
      }));
  });

  it("returns the exact deterministic DISABLED notice without degrading when the final gate observes OFF", async () => {
    const degraded = new SupportDegradedState();
    const stored = messages();
    const answer = createSupportAnswerService({
      entries: [ENTRY],messages: stored,degraded,
      modelFor: () => ({
        complete: async () => { throw new SupportModelError("SUPPORT_DISABLED"); }
      })
    });

    const result = await answer.respond({
      sessionId: "session-off",text: "How do I start my first debate?",language: "en",
      detectedLanguage: "en",overrideLanguage: null,modelRef: "relay",
      receivedAt: new Date("2026-09-08T12:00:00.000Z")
    });

    expect(result).toMatchObject({
      outcome: "DISABLED",text: "The support assistant is switched off at the moment."
    });
    expect(degraded.isDegraded()).toEqual({ degraded: false });
    expect((stored as unknown as { write: ReturnType<typeof vi.fn> }).write)
      .toHaveBeenCalledWith(expect.objectContaining({
      role: "assistant",outcome: "DISABLED",modelCalled: false
      }));
  });

  it("short-circuits while unavailable and clears only after a controlled half-open success", async () => {
    const degraded = new SupportDegradedState();
    let available = false;
    const complete = vi.fn(async () => {
      if (!available) throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
      return { text: "Open the new debate page." };
    });
    let nowMs = Date.parse("2026-09-07T12:00:00.000Z");
    const answer = createSupportAnswerService({
      entries: [ENTRY],messages: messages(),degraded,
      modelFor: () => ({ complete }),
      clock: () => new Date(++nowMs)
    });
    const request = {
      sessionId: "session",text: "How do I start my first debate?",language: "en" as const,
      detectedLanguage: "en" as const,overrideLanguage: null,modelRef: "relay",
      receivedAt: new Date("2026-09-07T12:00:00.000Z")
    };
    await expect(answer.respond(request)).resolves.toMatchObject({ outcome: "DEGRADED" });
    expect(degraded.isDegraded()).toEqual({
      degraded: true,reason: "relay",since: new Date("2026-09-07T12:00:00.001Z")
    });
    expect(formatRelayState({
      relayState: "UNAVAILABLE",relayUnavailableSince: new Date("2026-09-07T12:00:00.001Z")
    })).toBe("relay: unavailable since 2026-09-07T12:00:00.001Z");
    available = true;
    await expect(answer.respond({
      ...request,receivedAt: new Date("2026-09-07T12:00:00.500Z")
    })).resolves.toMatchObject({ outcome: "DEGRADED" });
    expect(complete).toHaveBeenCalledTimes(1);
    await expect(answer.respond({
      ...request,receivedAt: new Date("2026-09-07T12:00:01.001Z")
    })).resolves.toMatchObject({ outcome: "ANSWER_GROUNDED" });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(degraded.isDegraded()).toEqual({ degraded: false });
    expect(formatRelayState({ relayState: "AVAILABLE" })).toBe("relay: available");
  });

  it("admits only one concurrent half-open probe", () => {
    const degraded = new SupportDegradedState();
    degraded.markUnavailable(new Date("2026-09-07T12:00:00.000Z"),"relay");
    expect(degraded.beginModelAttempt(new Date("2026-09-07T12:00:01.000Z"))).toBe(true);
    expect(degraded.beginModelAttempt(new Date("2026-09-07T12:00:01.001Z"))).toBe(false);
    degraded.endModelAttempt();
    expect(degraded.beginModelAttempt(new Date("2026-09-07T12:00:01.002Z"))).toBe(true);
  });

  it("records cap separately and preserves the first unavailable instant", () => {
    const degraded = new SupportDegradedState();
    degraded.markUnavailable(new Date("2026-09-07T10:00:00.000Z"),"cap");
    degraded.markUnavailable(new Date("2026-09-07T10:01:00.000Z"),"cap");
    expect(degraded.isDegraded()).toEqual({
      degraded: true,reason: "cap",since: new Date("2026-09-07T10:00:00.000Z")
    });
  });

  it("bounds a never-settling half-open probe end-to-end and releases its durable lease", async () => {
    const degraded = new SupportDegradedState();
    let calls = 0;
    let probeSignal: AbortSignal | undefined;
    let releases = 0;
    const queue = new SupportRelayQueue({
      readLimits: async () => Object.freeze({ ...SUPPORT_LIMIT_DEFAULTS }),
      reservations: {
        tryAcquire: async () => Object.freeze({
          kind: "ACQUIRED" as const,
          release: async () => { releases += 1; }
        })
      }
    });
    const base = Date.parse("2026-09-07T12:00:00.000Z");
    let clockMs = base;
    const answer = createSupportAnswerService({
      entries: [ENTRY],messages: messages(),degraded,queue,
      modelFor: () => ({ complete: async (input) => {
        calls += 1;
        if (calls === 1) throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
        probeSignal = input.signal;
        return await new Promise<Readonly<{ text: string }>>(() => undefined);
      } }),clock: () => new Date(++clockMs)
    });
    const request = {
      sessionId: "session",text: "How do I start my first debate?",language: "en" as const,
      detectedLanguage: "en" as const,overrideLanguage: null,modelRef: "relay",
      receivedAt: new Date(base)
    };
    await expect(answer.respond(request)).resolves.toMatchObject({ outcome: "DEGRADED" });
    const started = performance.now();
    const probe = await Promise.race([
      answer.respond({ ...request,receivedAt: new Date(base + 1_001) }),
      new Promise<"TEST_DEADLINE">((resolve) => setTimeout(() => resolve("TEST_DEADLINE"),1_150))
    ]);
    expect(probe).not.toBe("TEST_DEADLINE");
    expect(probe).toMatchObject({ outcome: "DEGRADED" });
    expect(performance.now() - started).toBeLessThanOrEqual(1_000);
    expect(probeSignal?.aborted).toBe(true);
    expect(queue.activeCount()).toBe(0);
    expect(releases).toBe(2);
    expect(degraded.isDegraded()).toMatchObject({ degraded: true,reason: "relay" });
    await expect(answer.respond({
      ...request,receivedAt: new Date(base + 1_002)
    })).resolves.toMatchObject({ outcome: "DEGRADED" });
    expect(calls).toBe(2);
    expect(releases).toBe(2);
  });

  // Bug: admission dependencies were outside the half-open AbortSignal, so a
  // hung register read or coordinated enter could hold the probe forever.
  it.each(["readLimits","enter"] as const)(
    "bounds a never-settling half-open %s dependency to one second",
    async (dependency) => {
      const degraded = new SupportDegradedState();
      const base = Date.parse("2026-09-07T12:00:00.000Z");
      degraded.markUnavailable(new Date(base),"relay");
      const complete = vi.fn(async () => ({ text: "must not run" }));
      const queue = new SupportRelayQueue({
        readLimits: dependency === "readLimits"
          ? async () => await new Promise<never>(() => undefined)
          : async () => Object.freeze({ ...SUPPORT_LIMIT_DEFAULTS }),
        ...(dependency === "enter" ? { reservations: {
          tryAcquire: vi.fn(),cancel: vi.fn(),
          enter: async () => await new Promise<never>(() => undefined)
        } } : {})
      });
      let clockMs = base;
      const answer = createSupportAnswerService({
        entries: [ENTRY],messages: messages(),degraded,queue,
        modelFor: () => ({ complete }),clock: () => new Date(++clockMs)
      });
      const started = performance.now();
      const result = await answer.respond({
        sessionId: "session",text: "How do I start my first debate?",language: "en",
        detectedLanguage: "en",overrideLanguage: null,modelRef: "relay",
        receivedAt: new Date(base + 1_001)
      });

      expect(result.outcome).toBe("DEGRADED");
      expect(performance.now() - started).toBeLessThanOrEqual(1_000);
      expect(complete).not.toHaveBeenCalled();
      expect(queue.activeCount()).toBe(0);
      expect(queue.queuedCount()).toBe(0);
    }
  );
});
