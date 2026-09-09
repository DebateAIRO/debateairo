import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { SUPPORT_LIMIT_DEFAULTS } from "../../apps/api/src/support/limits.js";
import { SupportRelayQueue } from "../../apps/api/src/support/queue.js";
import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";

describe("SUP-06 relay queue and daily cap", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function queue(overrides: Partial<typeof SUPPORT_LIMIT_DEFAULTS> = {},clock?: () => Date) {
    return new SupportRelayQueue({
      readLimits: vi.fn(async () => Object.freeze({ ...SUPPORT_LIMIT_DEFAULTS,...overrides })),
      ...(clock === undefined ? {} : { clock })
    });
  }

  it("bounds concurrency, grants FIFO position one, and refuses queue overflow immediately", async () => {
    const relay = queue({ support_relay_concurrency: 1,support_queue_depth: 1 });
    const first = await relay.acquireRelaySlot({ language: "en" });
    let secondSettled = false;
    const secondPromise = relay.acquireRelaySlot({ language: "en" })
      .finally(() => { secondSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(secondSettled).toBe(false);
    await expect(relay.acquireRelaySlot({ language: "en" }))
      .rejects.toMatchObject({ code: "SUPPORT_QUEUE_FULL" });
    expect(relay.activeCount()).toBe(1);
    expect(relay.queuedCount()).toBe(1);
    first.release();
    const second = await secondPromise;
    expect(second.position).toBe(1);
    expect(relay.activeCount()).toBe(1);
    second.release();
    expect(relay.activeCount()).toBe(0);
  });

  it("reports the exact bilingual queue notice at 3 seconds and keeps FIFO order", async () => {
    const relay = queue({ support_relay_concurrency: 1,support_queue_depth: 2 });
    const first = await relay.acquireRelaySlot({ language: "en" });
    const progress: string[] = [];
    const secondPromise = relay.acquireRelaySlot({
      language: "en",onProgress: (notice) => progress.push(notice)
    });
    const thirdPromise = relay.acquireRelaySlot({
      language: "ro",onProgress: (notice) => progress.push(notice)
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(progress).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(progress).toEqual([
      "Waiting for the assistant's model… you are number 1 in line.",
      "Se așteaptă modelul asistentului… ești numărul 2 la rând."
    ]);
    first.release();
    const second = await secondPromise;
    let thirdSettled = false;
    void thirdPromise.finally(() => { thirdSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(thirdSettled).toBe(false);
    second.release();
    const third = await thirdPromise;
    expect([second.position,third.position]).toEqual([1,2]);
    third.release();
  });

  it("enforces the UTC daily model-call cap and rolls over exactly at midnight", async () => {
    let now = new Date("2026-09-07T23:59:59.999Z");
    const relay = queue({ support_daily_call_cap: 1 },() => now);
    const first = await relay.acquireRelaySlot({ language: "en" });
    first.release();
    await expect(relay.acquireRelaySlot({ language: "en" }))
      .rejects.toMatchObject({ code: "SUPPORT_DAILY_CAP" });
    now = new Date("2026-09-08T00:00:00.000Z");
    const nextDay = await relay.acquireRelaySlot({ language: "en" });
    expect(relay.modelCallsToday()).toBe(1);
    nextDay.release();
  });

  it("uses a shared durable reservation seam across queue instances", async () => {
    let held = false;
    let calls = 0;
    const reservations = {
      tryAcquire: vi.fn(async (input: { dailyCap: number }) => {
        if (held) return Object.freeze({ kind: "BUSY" as const });
        if (calls >= input.dailyCap) return Object.freeze({ kind: "DAILY_CAP" as const });
        held = true;
        calls += 1;
        let released = false;
        return Object.freeze({
          kind: "ACQUIRED" as const,
          release: async () => {
            if (released) return;
            released = true;
            held = false;
          }
        });
      })
    };
    const limits = async () => Object.freeze({
      ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,
      support_queue_depth: 1,support_daily_call_cap: 2
    });
    const firstQueue = new SupportRelayQueue({ readLimits: limits,reservations });
    const secondQueue = new SupportRelayQueue({ readLimits: limits,reservations });
    const first = await firstQueue.acquireRelaySlot({ language: "en" });
    let secondSettled = false;
    const secondPromise = secondQueue.acquireRelaySlot({ language: "en" })
      .finally(() => { secondSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(secondSettled).toBe(false);
    await first.release();
    await vi.advanceTimersByTimeAsync(100);
    const second = await secondPromise;
    expect(calls).toBe(2);
    await second.release();
  });

  it("lets deterministic refusals and incidents bypass a saturated zero-depth relay queue", async () => {
    const readLimits = vi.fn(async () => Object.freeze({
      ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,support_queue_depth: 0
    }));
    const relay = new SupportRelayQueue({ readLimits });
    const first = await relay.acquireRelaySlot({ language: "en" });
    await expect(relay.execute({ modelBacked: false,language: "en" },async () => "REFUSE_ZONE"))
      .resolves.toBe("REFUSE_ZONE");
    expect(readLimits).toHaveBeenCalledTimes(1);
    expect(relay.activeCount()).toBe(1);
    first.release();
  });

  it("aborts active work, propagates the signal, and releases its slot exactly once", async () => {
    const relay = queue({ support_relay_concurrency: 1 });
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const active = relay.execute({
      modelBacked: true,language: "en",signal: controller.signal
    },async (signal) => {
      received = signal;
      return await new Promise<string>((_resolve,reject) => signal?.addEventListener(
        "abort",() => reject(new Error("underlying abort")),{ once: true }
      ));
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(relay.activeCount()).toBe(1);
    controller.abort();
    await expect(active).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    expect(received).toBe(controller.signal);
    expect(relay.activeCount()).toBe(0);
    const next = await relay.acquireRelaySlot({ language: "en" });
    expect(relay.activeCount()).toBe(1);
    next.release();
    next.release();
    expect(relay.activeCount()).toBe(0);
  });

  it("keeps the queue slot until the signal-bound operation reaches its terminal abort", async () => {
    const relay = queue({ support_relay_concurrency: 1 });
    const controller = new AbortController();
    const events: string[] = [];
    const running = relay.execute({
      modelBacked: true,language: "en",signal: controller.signal
    },async (signal) => await new Promise<never>((_resolve,reject) => {
      signal?.addEventListener("abort",() => setTimeout(() => {
        events.push("operation-terminal");
        reject(new Error("operation aborted"));
      },25),{ once: true });
    }));
    void running.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(relay.activeCount()).toBe(1);
    expect(events).toEqual([]);

    await vi.advanceTimersByTimeAsync(25);
    await expect(running).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    expect(events).toEqual(["operation-terminal"]);
    expect(relay.activeCount()).toBe(0);
  });

  it("wires only model-backed answers through the cap and leaves deterministic no-source available", async () => {
    let now = new Date("2026-09-07T12:00:00.000Z");
    const relay = queue({ support_daily_call_cap: 1 },() => now);
    const complete = vi.fn(async () => ({ text: "Open the new debate page." }));
    const messages = {
      write: vi.fn(async (input) => ({ ...input,redacted: false })),
      writeAndTransit: vi.fn(async (input,transit) => {
        await transit(input.text);
        return { ...input,redacted: false };
      }),
      read: vi.fn(async () => null),listSession: vi.fn(async () => [])
    } as never;
    const answer = createSupportAnswerService({
      entries: [{
        id: "getting-started-debate",lang: "en",title: "Start a debate",status: "shipped",
        sources: ["test"],verifiedAgainst: "test",ratifiedBy: "V",ratifiedOn: "2026-09-01",
        body: "Open the new debate page to start your first debate."
      }],messages,modelFor: () => ({ complete }),queue: relay,
      clock: () => { now = new Date(now.getTime()+1);return now; }
    });
    const request = {
      sessionId: "session",text: "How do I start my first debate?",language: "en" as const,
      detectedLanguage: "en" as const,overrideLanguage: null,modelRef: "relay",
      receivedAt: new Date("2026-09-07T12:00:00.000Z")
    };
    await expect(answer.respond(request)).resolves.toMatchObject({ outcome: "ANSWER_GROUNDED" });
    await expect(answer.respond(request)).resolves.toMatchObject({ outcome: "DEGRADED" });
    await expect(answer.respond({ ...request,text: "zyxwvu" }))
      .resolves.toMatchObject({ outcome: "NO_SOURCE" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  // Bug: the half-open AbortSignal was not observed while readLimits or enter
  // was unresolved, so the advertised one-second bound did not cover admission.
  it.each(["readLimits","enter"] as const)(
    "aborts a never-settling %s dependency without a local lease",
    async (dependency) => {
      const controller = new AbortController();
      const releases: string[] = [];
      let finishEnter: ((entry: {
        kind: "ACQUIRED";release(): Promise<void>;
      }) => void) | undefined;
      const enter = vi.fn(() => new Promise<{ kind: "ACQUIRED";release(): Promise<void> }>(
        (resolve) => { finishEnter = resolve; }
      ));
      const relay = new SupportRelayQueue({
        readLimits: dependency === "readLimits"
          ? async () => await new Promise<never>(() => undefined)
          : async () => Object.freeze({ ...SUPPORT_LIMIT_DEFAULTS }),
        ...(dependency === "enter" ? {
          reservations: { tryAcquire: vi.fn(),enter,cancel: vi.fn() }
        } : {})
      });
      const acquiring = relay.acquireRelaySlot({ language: "en",signal: controller.signal });
      let result: unknown = "PENDING";
      void acquiring.then(
        (slot) => { result = slot; },
        (error: unknown) => { result = error; }
      );
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(result).toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
      expect(relay.activeCount()).toBe(0);
      expect(relay.queuedCount()).toBe(0);
      if (dependency === "enter") {
        finishEnter?.({
          kind: "ACQUIRED",release: async () => { releases.push("released"); }
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(releases).toEqual(["released"]);
      }
    }
  );

  // Bug: an abort could splice a waiter while tryAcquire was awaiting; the
  // eventual ACQUIRED result was then blindly shifted onto another waiter or leaked.
  it("releases an acquisition committed after local cancellation exactly once", async () => {
    let finishPromotion: ((result: {
      kind: "ACQUIRED";release(): Promise<void>;
    }) => void) | undefined;
    let durableReleases = 0;
    let enterCalls = 0;
    const reservations = {
      enter: vi.fn(async () => enterCalls++ === 0
        ? Object.freeze({
          kind: "ACQUIRED" as const,
          release: async () => undefined
        })
        : Object.freeze({
          kind: "WAITING" as const,waiterId: "11111111-1111-4111-8111-111111111111",
          ticket: 1,position: 1
        })),
      cancel: vi.fn(async () => undefined),
      tryAcquire: vi.fn(() => new Promise<{
        kind: "ACQUIRED";release(): Promise<void>;
      }>((resolve) => { finishPromotion = resolve; }))
    };
    const relay = new SupportRelayQueue({
      readLimits: async () => Object.freeze({
        ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: 1,support_queue_depth: 1
      }),reservations
    });
    const active = await relay.acquireRelaySlot({ language: "en" });
    const controller = new AbortController();
    const waiting = relay.acquireRelaySlot({ language: "en",signal: controller.signal });
    for (let turn = 0;turn < 4 && relay.queuedCount() === 0;turn += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(relay.queuedCount()).toBe(1);
    await active.release();
    await vi.advanceTimersByTimeAsync(100);
    expect(reservations.tryAcquire).toHaveBeenCalledTimes(1);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    finishPromotion?.({
      kind: "ACQUIRED",release: async () => { durableReleases += 1; }
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(durableReleases).toBe(1);
    expect(relay.activeCount()).toBe(0);
  });

  // Bug: dequeue reused cached limits, promoting after live concurrency had
  // been lowered. Raising the register value must subsequently resume FIFO.
  it("re-reads authoritative limits for every local dequeue", async () => {
    let concurrency = 2;
    const readLimits = vi.fn(async () => Object.freeze({
      ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: concurrency,
      support_queue_depth: 2
    }));
    const relay = new SupportRelayQueue({ readLimits });
    const first = await relay.acquireRelaySlot({ language: "en" });
    const second = await relay.acquireRelaySlot({ language: "en" });
    let promoted = false;
    const thirdPromise = relay.acquireRelaySlot({ language: "en" })
      .then((slot) => { promoted = true;return slot; });
    for (let turn = 0;turn < 4 && relay.queuedCount() === 0;turn += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(relay.queuedCount()).toBe(1);
    concurrency = 1;
    await first.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(promoted).toBe(false);
    expect(relay.activeCount()).toBe(1);
    concurrency = 2;
    await second.release();
    await vi.advanceTimersByTimeAsync(0);
    const third = await thirdPromise;
    expect(readLimits.mock.calls.length).toBeGreaterThanOrEqual(5);
    await third.release();
  });

  it("re-reads authoritative limits after a durable dequeue read failure and live change", async () => {
    let concurrency = 2;
    let failNextRead = false;
    const readLimits = vi.fn(async () => {
      if (failNextRead) {
        failNextRead = false;
        throw new Error("register unavailable");
      }
      return Object.freeze({
        ...SUPPORT_LIMIT_DEFAULTS,support_relay_concurrency: concurrency,
        support_queue_depth: 2
      });
    });
    let entered = 0;
    const reservations = {
      enter: vi.fn(async () => entered++ < 2
        ? Object.freeze({ kind: "ACQUIRED" as const,release: async () => undefined })
        : Object.freeze({
          kind: "WAITING" as const,waiterId: "22222222-2222-4222-8222-222222222222",
          ticket: 2,position: 1
        })),
      cancel: vi.fn(async () => undefined),
      renew: vi.fn(async ({ waiterIds }: { waiterIds: readonly string[] }) => waiterIds),
      tryAcquire: vi.fn(async () => Object.freeze({
        kind: "ACQUIRED" as const,release: async () => undefined
      }))
    };
    const relay = new SupportRelayQueue({ readLimits,reservations });
    const first = await relay.acquireRelaySlot({ language: "en" });
    const second = await relay.acquireRelaySlot({ language: "en" });
    const thirdPromise = relay.acquireRelaySlot({ language: "en" });
    for (let turn = 0;turn < 4 && relay.queuedCount() === 0;turn += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    concurrency = 1;
    failNextRead = true;
    await first.release();
    await vi.advanceTimersByTimeAsync(100);
    expect(reservations.tryAcquire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(reservations.tryAcquire).not.toHaveBeenCalled();
    concurrency = 2;
    await second.release();
    await vi.advanceTimersByTimeAsync(100);
    const third = await thirdPromise;
    expect(reservations.tryAcquire).toHaveBeenCalledWith(expect.objectContaining({
      concurrency: 2,waiterId: "22222222-2222-4222-8222-222222222222"
    }));
    await third.release();
  });

  it("returns an aborted active call without awaiting a never-settling durable release", async () => {
    const controller = new AbortController();
    let releaseCalls = 0;
    const relay = new SupportRelayQueue({
      readLimits: async () => Object.freeze({ ...SUPPORT_LIMIT_DEFAULTS }),
      reservations: {
        tryAcquire: async () => Object.freeze({
          kind: "ACQUIRED" as const,
          release: () => {
            releaseCalls += 1;
            return new Promise<void>(() => undefined);
          }
        })
      }
    });
    const running = relay.execute({
      modelBacked: true,language: "en",signal: controller.signal
    },async (signal) => await new Promise<never>((_resolve,reject) => {
      signal?.addEventListener("abort",() => reject(new Error("provider aborted")),{ once: true });
    }));
    void running.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);

    await expect(running).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    expect(releaseCalls).toBe(1);
    expect(relay.activeCount()).toBe(0);
    expect(relay.queuedCount()).toBe(0);
  });

  it("bounds and deduplicates explicit durable release cleanup", async () => {
    let releaseCalls = 0;
    const diagnostics: string[] = [];
    const relay = new SupportRelayQueue({
      readLimits: async () => Object.freeze({ ...SUPPORT_LIMIT_DEFAULTS }),
      reportCleanupFailure: ({ code }) => diagnostics.push(code),
      reservations: {
        tryAcquire: async () => Object.freeze({
          kind: "ACQUIRED" as const,
          release: () => {
            releaseCalls += 1;
            return new Promise<void>(() => undefined);
          }
        })
      }
    });
    const slot = await relay.acquireRelaySlot({ language: "en" });
    const first = slot.release();
    const second = slot.release();
    let firstSettled = false;
    let secondSettled = false;
    void Promise.resolve(first).then(() => { firstSettled = true; });
    void Promise.resolve(second).then(() => { secondSettled = true; });
    await vi.advanceTimersByTimeAsync(100);

    expect(firstSettled).toBe(true);
    expect(secondSettled).toBe(true);
    expect(releaseCalls).toBe(1);
    expect(diagnostics).toEqual(["SUPPORT_QUEUE_CLEANUP_TIMEOUT"]);
    expect(relay.activeCount()).toBe(0);
  });

  it("locally terminalizes an aborted waiter without awaiting never-settling durable cancellation", async () => {
    let enterCalls = 0;
    let cancelCalls = 0;
    const diagnostics: string[] = [];
    const relay = new SupportRelayQueue({
      readLimits: async () => Object.freeze({ ...SUPPORT_LIMIT_DEFAULTS }),
      reportCleanupFailure: ({ code }) => diagnostics.push(code),
      reservations: {
        tryAcquire: vi.fn(async () => Object.freeze({ kind: "BUSY" as const })),
        enter: async () => enterCalls++ === 0
          ? Object.freeze({ kind: "ACQUIRED" as const,release: async () => undefined })
          : Object.freeze({
            kind: "WAITING" as const,
            waiterId: "33333333-3333-4333-8333-333333333333",ticket: 3,position: 1
          }),
        cancel: () => {
          cancelCalls += 1;
          return new Promise<void>(() => undefined);
        }
      }
    });
    const active = await relay.acquireRelaySlot({ language: "en" });
    const controller = new AbortController();
    const waiting = relay.acquireRelaySlot({ language: "en",signal: controller.signal });
    void waiting.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(relay.queuedCount()).toBe(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);

    await expect(waiting).rejects.toMatchObject({ code: "SUPPORT_QUEUE_ABORTED" });
    expect(cancelCalls).toBe(1);
    expect(diagnostics).toEqual(["SUPPORT_QUEUE_CLEANUP_TIMEOUT"]);
    expect(relay.queuedCount()).toBe(0);
    await active.release();
  });
});
